//! Thumbnail and filmstrip commands. Frame grabs run the ffmpeg sidecar;
//! results are cached in the app cache dir and returned as data URLs.

use crate::thumbs::{thumb_cache_key, thumb_seek_seconds};
use base64::Engine;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::ShellExt;

fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn file_cache_key(path: &str) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Ok(thumb_cache_key(path, mtime, meta.len()))
}

async fn grab_frame<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
    seek_s: f64,
    out: &Path,
) -> Result<(), String> {
    let seek = format!("{seek_s:.3}");
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-y",
            "-ss",
            &seek,
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=96:-1",
            out.to_str().ok_or("invalid cache path")?,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() || !out.exists() {
        return Err("no video frame available".into());
    }
    Ok(())
}

fn to_data_url(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

/// Generate (or fetch from cache) a small JPEG thumbnail; returns a data URL.
/// Errors for audio-only files — the UI shows a placeholder icon instead.
#[tauri::command]
pub async fn generate_thumbnail<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    duration_s: Option<f64>,
) -> Result<String, String> {
    let key = file_cache_key(&path)?;
    let thumb_path = cache_dir(&app)?.join(format!("{key}.jpg"));

    if !thumb_path.exists() {
        grab_frame(&app, &path, thumb_seek_seconds(duration_s), &thumb_path).await?;
    }
    to_data_url(&thumb_path)
}

/// Grab `count` evenly spaced frames for the trim filmstrip.
#[tauri::command]
pub async fn generate_filmstrip<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    duration_s: f64,
    count: usize,
) -> Result<Vec<String>, String> {
    let count = count.clamp(1, 12);
    let key = file_cache_key(&path)?;
    let dir = cache_dir(&app)?;

    let mut frames = Vec::with_capacity(count);
    for i in 0..count {
        let seek = duration_s * (i as f64 + 0.5) / count as f64;
        let frame_path = dir.join(format!("{key}_strip{i}of{count}.jpg"));
        if !frame_path.exists() {
            grab_frame(&app, &path, seek, &frame_path).await?;
        }
        frames.push(to_data_url(&frame_path)?);
    }
    Ok(frames)
}
