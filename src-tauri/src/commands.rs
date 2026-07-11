use crate::encoders::parse_hw_encoders;
use crate::ffmpeg_args::{build_args, JobSettings};
use crate::ipc_constants::EVT_JOB_CANCELLED;
use crate::probe::{parse_probe, MediaInfo};
use crate::queue::{Job, JobStatus};
use crate::scheduler::{pump, QueueState};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Children of currently running ffmpeg processes, keyed by job id.
#[derive(Default)]
pub struct RunningJobs(pub Mutex<HashMap<String, CommandChild>>);

/// Job ids cancelled by the user; lets the runner distinguish a kill from a crash.
#[derive(Default)]
pub struct CancelledJobs(pub Mutex<HashSet<String>>);

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub job_id: String,
    pub percent: f32,
    pub speed: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobStartedPayload {
    pub job_id: String,
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

#[derive(Debug, Deserialize)]
pub struct EnqueueJob {
    pub job_id: String,
    pub settings: JobSettings,
    pub duration_us: Option<i64>,
}

/// Add jobs to the queue and start converting up to the concurrency limit.
#[tauri::command]
pub fn enqueue_jobs<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, QueueState>,
    jobs: Vec<EnqueueJob>,
) {
    log::info!("enqueueing {} job(s)", jobs.len());
    {
        let mut queue = state.queue.lock().unwrap();
        for j in jobs {
            queue.push(Job::new(j.job_id, j.settings, j.duration_us));
        }
    }
    pump(&app);
}

#[tauri::command]
pub fn set_concurrency(state: State<'_, QueueState>, n: usize) {
    state.set_concurrency(n);
}

/// Cancel one job: kill its process if running, or skip it if still queued.
#[tauri::command]
pub fn cancel_job<R: Runtime>(
    app: AppHandle<R>,
    queue_state: State<'_, QueueState>,
    running: State<'_, RunningJobs>,
    cancelled: State<'_, CancelledJobs>,
    job_id: String,
) -> Result<(), String> {
    let child = running.0.lock().unwrap().remove(&job_id);
    if let Some(child) = child {
        cancelled.0.lock().unwrap().insert(job_id);
        child.kill().map_err(|e| e.to_string())?;
    } else {
        let mut queue = queue_state.queue.lock().unwrap();
        if queue.get(&job_id).map(|j| j.status) == Some(JobStatus::Queued) {
            queue.set_status(&job_id, JobStatus::Cancelled);
            let _ = app.emit(EVT_JOB_CANCELLED, JobCancelledPayload { job_id });
        }
    }
    Ok(())
}

/// Cancel everything: queued jobs are skipped, running processes killed.
#[tauri::command]
pub fn cancel_all<R: Runtime>(
    app: AppHandle<R>,
    queue_state: State<'_, QueueState>,
    running: State<'_, RunningJobs>,
    cancelled: State<'_, CancelledJobs>,
) -> Result<(), String> {
    {
        let mut queue = queue_state.queue.lock().unwrap();
        let queued_ids: Vec<String> = queue
            .all()
            .iter()
            .filter(|j| j.status == JobStatus::Queued)
            .map(|j| j.id.clone())
            .collect();
        for id in queued_ids {
            queue.set_status(&id, JobStatus::Cancelled);
            let _ = app.emit(EVT_JOB_CANCELLED, JobCancelledPayload { job_id: id });
        }
    }

    let children: Vec<(String, CommandChild)> = running.0.lock().unwrap().drain().collect();
    for (id, child) in children {
        cancelled.0.lock().unwrap().insert(id);
        let _ = child.kill();
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

/// List hardware encoders available on this machine (probed at startup;
/// the UI falls back to software silently when empty).
#[tauri::command]
pub async fn probe_hw_encoders<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(parse_hw_encoders(&String::from_utf8_lossy(&output.stdout)))
}

/// Build (but don't run) the ffmpeg args for given settings — powers the
/// read-only flags footer in the advanced panel.
#[tauri::command]
pub fn preview_args(settings: JobSettings) -> Vec<String> {
    build_args(&settings)
}

/// Expand dropped paths: folders become their media files (recursive),
/// plain files pass through; duplicates removed.
#[tauri::command]
pub fn expand_paths(paths: Vec<String>) -> Vec<String> {
    crate::media_paths::expand_media_paths(paths)
}

/// Resolve output paths for a batch: clean names when free, suffixes to
/// avoid sources/batch collisions. With avoid_existing=false, paths that
/// exist on disk come back flagged so the UI can prompt; with true they
/// are uniquified past disk files.
#[tauri::command]
pub fn resolve_output_paths(
    reqs: Vec<crate::output_naming::NamingRequest>,
    avoid_existing: bool,
) -> Vec<crate::output_naming::ResolvedOutput> {
    crate::output_naming::resolve_outputs(&reqs, avoid_existing, |p| std::path::Path::new(p).exists())
}

#[derive(Debug, Serialize)]
pub struct JobSnapshot {
    pub id: String,
    pub status: JobStatus,
    pub progress_percent: f32,
    pub error: Option<String>,
}

/// Snapshot of every job the queue knows about. The UI polls this while
/// work is in flight and reconciles — events are the fast path, but any
/// missed event (e.g. macOS menu modal starving webview delivery) heals here.
#[tauri::command]
pub fn get_queue_state(state: State<'_, QueueState>) -> Vec<JobSnapshot> {
    state
        .queue
        .lock()
        .unwrap()
        .all()
        .iter()
        .map(|j| JobSnapshot {
            id: j.id.clone(),
            status: j.status,
            progress_percent: j.progress_percent,
            error: j.error.clone(),
        })
        .collect()
}
