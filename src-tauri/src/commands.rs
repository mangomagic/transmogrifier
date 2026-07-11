use crate::ffmpeg_args::{build_args, JobSettings};
use crate::ipc_constants::{EVT_JOB_DONE, EVT_JOB_ERROR, EVT_PROGRESS};
use crate::probe::{parse_probe, MediaInfo};
use crate::progress::parse_progress_block;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub job_id: String,
    pub percent: f32,
    pub speed: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobDonePayload {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobErrorPayload {
    pub job_id: String,
    pub message: String,
}

/// Convert a single file. Emits progress/done/error events to the window.
#[tauri::command]
pub async fn convert_file<R: Runtime>(
    app: AppHandle<R>,
    settings: JobSettings,
    job_id: String,
    duration_us: Option<i64>,
) -> Result<(), String> {
    let args = build_args(&settings);

    let (mut rx, _child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                stdout_buf.push_str(&line);
                // ffmpeg -progress emits blocks ending with progress=continue/end
                if line.contains("progress=") {
                    if let Some(ev) = parse_progress_block(&job_id, &stdout_buf, duration_us) {
                        let _ = app.emit(
                            EVT_PROGRESS,
                            ProgressPayload {
                                job_id: ev.job_id,
                                percent: ev.percent,
                                speed: ev.speed,
                            },
                        );
                    }
                    stdout_buf.clear();
                }
            }
            CommandEvent::Stderr(bytes) => {
                stderr_buf.push_str(&String::from_utf8_lossy(&bytes));
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    let _ = app.emit(EVT_JOB_DONE, JobDonePayload { job_id: job_id.clone() });
                } else {
                    let _ = app.emit(
                        EVT_JOB_ERROR,
                        JobErrorPayload {
                            job_id: job_id.clone(),
                            message: stderr_buf.clone(),
                        },
                    );
                    return Err(stderr_buf);
                }
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

/// Run ffprobe on a file and return MediaInfo.
#[tauri::command]
pub async fn probe_file<R: Runtime>(app: AppHandle<R>, path: String) -> Result<MediaInfo, String> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let json = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    parse_probe(&json).map_err(|e| e.to_string())
}
