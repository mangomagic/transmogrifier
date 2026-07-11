//! Exit guard: closing the window or quitting (⌘Q) while conversions are
//! queued/running is intercepted; the frontend shows a confirm dialog and
//! calls confirm_exit to proceed. Without the guard, orphaned ffmpeg
//! processes would keep writing half-finished files after the app died.

use crate::commands::{CancelledJobs, RunningJobs};
use crate::ipc_constants::EVT_EXIT_REQUESTED;
use crate::queue::JobStatus;
use crate::scheduler::QueueState;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Set once the user confirms quitting; lets the second exit request pass.
#[derive(Default)]
pub struct ExitConfirmed(pub AtomicBool);

/// Should this close/exit request be blocked pending user confirmation?
/// If so, also notifies the frontend to show the dialog.
pub fn intercept_exit<R: Runtime>(app: &AppHandle<R>) -> bool {
    if app.state::<ExitConfirmed>().0.load(Ordering::Relaxed) {
        return false;
    }
    let active = app.state::<QueueState>().queue.lock().unwrap().has_active();
    if active {
        let _ = app.emit(EVT_EXIT_REQUESTED, ());
    }
    active
}

/// User confirmed: kill running ffmpeg processes, remove their partial
/// outputs, and exit for real.
#[tauri::command]
pub fn confirm_exit<R: Runtime>(
    app: AppHandle<R>,
    queue_state: State<'_, QueueState>,
    running: State<'_, RunningJobs>,
    cancelled: State<'_, CancelledJobs>,
    exit_confirmed: State<'_, ExitConfirmed>,
) {
    exit_confirmed.0.store(true, Ordering::Relaxed);

    let children: Vec<_> = running.0.lock().unwrap().drain().collect();
    for (id, child) in children {
        cancelled.0.lock().unwrap().insert(id);
        let _ = child.kill();
    }

    {
        let queue = queue_state.queue.lock().unwrap();
        for job in queue.all() {
            if job.status == JobStatus::Running {
                let _ = std::fs::remove_file(&job.settings.output_path);
            }
        }
    }

    app.exit(0);
}
