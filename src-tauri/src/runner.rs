use crate::commands::{CancelledJobs, JobCancelledPayload, JobDonePayload, JobErrorPayload, JobStartedPayload, ProgressPayload, RunningJobs};
use crate::ffmpeg_args::build_args;
use crate::ipc_constants::{EVT_JOB_CANCELLED, EVT_JOB_DONE, EVT_JOB_ERROR, EVT_JOB_STARTED, EVT_PROGRESS};
use crate::progress::parse_progress_block;
use crate::queue::{Job, JobStatus};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Keep only the tail of ffmpeg stderr for error display.
const STDERR_TAIL_LINES: usize = 30;

fn stderr_tail(buf: &str) -> String {
    let lines: Vec<&str> = buf.lines().collect();
    let start = lines.len().saturating_sub(STDERR_TAIL_LINES);
    lines[start..].join("\n")
}

/// Run one ffmpeg job to completion. Emits started/progress/done/error/cancelled
/// events and returns the terminal status for the queue.
pub async fn run_job<R: Runtime>(app: &AppHandle<R>, job: &Job) -> JobStatus {
    let args = build_args(&job.settings);

    let spawned = app
        .shell()
        .sidecar("ffmpeg")
        .and_then(|cmd| cmd.args(&args).spawn());

    let (mut rx, child) = match spawned {
        Ok(pair) => pair,
        Err(e) => {
            let _ = app.emit(
                EVT_JOB_ERROR,
                JobErrorPayload {
                    job_id: job.id.clone(),
                    message: e.to_string(),
                },
            );
            return JobStatus::Failed;
        }
    };

    app.state::<RunningJobs>()
        .0
        .lock()
        .unwrap()
        .insert(job.id.clone(), child);

    let _ = app.emit(EVT_JOB_STARTED, JobStartedPayload { job_id: job.id.clone() });

    let mut stdout_buf = String::new();
    let mut stderr_buf = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                stdout_buf.push_str(&line);
                // ffmpeg -progress emits blocks ending with progress=continue/end
                if line.contains("progress=") {
                    if let Some(ev) = parse_progress_block(&job.id, &stdout_buf, job.duration_us) {
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
                app.state::<RunningJobs>().0.lock().unwrap().remove(&job.id);
                let was_cancelled = app
                    .state::<CancelledJobs>()
                    .0
                    .lock()
                    .unwrap()
                    .remove(&job.id);

                if was_cancelled {
                    // Remove the partial output file left behind by the kill
                    let _ = std::fs::remove_file(&job.settings.output_path);
                    let _ = app.emit(
                        EVT_JOB_CANCELLED,
                        JobCancelledPayload { job_id: job.id.clone() },
                    );
                    return JobStatus::Cancelled;
                } else if payload.code == Some(0) {
                    let _ = app.emit(EVT_JOB_DONE, JobDonePayload { job_id: job.id.clone() });
                    return JobStatus::Done;
                } else {
                    let _ = app.emit(
                        EVT_JOB_ERROR,
                        JobErrorPayload {
                            job_id: job.id.clone(),
                            message: stderr_tail(&stderr_buf),
                        },
                    );
                    return JobStatus::Failed;
                }
            }
            _ => {}
        }
    }

    // Channel closed without a Terminated event — treat as failure
    app.state::<RunningJobs>().0.lock().unwrap().remove(&job.id);
    JobStatus::Failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stderr_tail_keeps_last_lines() {
        let buf: String = (1..=50).map(|i| format!("line{i}\n")).collect();
        let tail = stderr_tail(&buf);
        assert!(tail.starts_with("line21"));
        assert!(tail.ends_with("line50"));
        assert_eq!(tail.lines().count(), 30);
    }

    #[test]
    fn stderr_tail_short_input_unchanged() {
        assert_eq!(stderr_tail("only line"), "only line");
    }
}
