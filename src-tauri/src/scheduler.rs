use crate::queue::Queue;
use crate::runner::run_job;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

pub const DEFAULT_CONCURRENCY: usize = 2;
pub const MAX_CONCURRENCY: usize = 4;

pub struct QueueState {
    pub queue: Mutex<Queue>,
    pub concurrency: AtomicUsize,
}

impl Default for QueueState {
    fn default() -> Self {
        Self {
            queue: Mutex::new(Queue::default()),
            concurrency: AtomicUsize::new(DEFAULT_CONCURRENCY),
        }
    }
}

impl QueueState {
    pub fn set_concurrency(&self, n: usize) {
        self.concurrency
            .store(n.clamp(1, MAX_CONCURRENCY), Ordering::Relaxed);
    }
}

/// Claim and start queued jobs until concurrency capacity is reached.
/// Each finished job re-pumps, so the queue drains regardless of outcome.
pub fn pump<R: Runtime>(app: &AppHandle<R>) {
    loop {
        let claimed = {
            let state = app.state::<QueueState>();
            let concurrency = state.concurrency.load(Ordering::Relaxed);
            let mut queue = state.queue.lock().unwrap();
            queue.claim_next(concurrency)
        };
        let Some(job) = claimed else { break };

        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let status = run_job(&app, &job).await;
            {
                let state = app.state::<QueueState>();
                state.queue.lock().unwrap().set_status(&job.id, status);
            }
            pump(&app);
        });
    }
}
