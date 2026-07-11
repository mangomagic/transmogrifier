use crate::ffmpeg_args::{build_args, JobSettings};
use crate::ipc_constants::{EVT_JOB_CANCELLED, EVT_JOB_DONE, EVT_JOB_ERROR, EVT_PROGRESS};
use crate::probe::{parse_probe, MediaInfo};
use crate::progress::parse_progress_block;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Children of currently running ffmpeg processes, keyed by job id.
#[derive(Default)]
pub struct RunningJobs(pub Mutex<HashMap<String, CommandChild>>);

/// Job ids cancelled by the user; lets convert_file distinguish a kill from a crash.
#[derive(Default)]
pub struct CancelledJobs(pub Mutex<HashSet<String>>);

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

#[derive(Debug, Clone, Serialize)]
pub struct JobCancelledPayload {
    pub job_id: String,
}

/// Convert a single file. Emits progress/done/error/cancelled events to the window.
#[tauri::command]
pub async fn convert_file<R: Runtime>(
    app: AppHandle<R>,
    running: State<'_, RunningJobs>,
    cancelled: State<'_, CancelledJobs>,
    settings: JobSettings,
    job_id: String,
    duration_us: Option<i64>,
) -> Result<(), String> {
    let args = build_args(&settings);

    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;

    running.0.lock().unwrap().insert(job_id.clone(), child);

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
                running.0.lock().unwrap().remove(&job_id);
                let was_cancelled = cancelled.0.lock().unwrap().remove(&job_id);

                if was_cancelled {
                    // Remove the partial output file left behind by the kill
                    let _ = std::fs::remove_file(&settings.output_path);
                    let _ = app.emit(EVT_JOB_CANCELLED, JobCancelledPayload { job_id: job_id.clone() });
                } else if payload.code == Some(0) {
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

/// Kill the ffmpeg process for a running job. No-op if the job already finished.
#[tauri::command]
pub async fn cancel_job(
    running: State<'_, RunningJobs>,
    cancelled: State<'_, CancelledJobs>,
    job_id: String,
) -> Result<(), String> {
    let child = running.0.lock().unwrap().remove(&job_id);
    if let Some(child) = child {
        cancelled.0.lock().unwrap().insert(job_id);
        child.kill().map_err(|e| e.to_string())?;
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
