use crate::ffmpeg_args::JobSettings;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub settings: JobSettings,
    pub duration_us: Option<i64>,
    pub status: JobStatus,
    pub error: Option<String>,
    pub progress_percent: f32,
}

impl Job {
    pub fn new(id: String, settings: JobSettings, duration_us: Option<i64>) -> Self {
        Self {
            id,
            settings,
            duration_us,
            status: JobStatus::Queued,
            progress_percent: 0.0,
            error: None,
        }
    }
}

#[derive(Debug, Default)]
pub struct Queue {
    jobs: VecDeque<Job>,
}

impl Queue {
    pub fn push(&mut self, job: Job) {
        self.jobs.push_back(job);
    }

    pub fn get(&self, id: &str) -> Option<&Job> {
        self.jobs.iter().find(|j| j.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Job> {
        self.jobs.iter_mut().find(|j| j.id == id)
    }

    pub fn all(&self) -> &VecDeque<Job> {
        &self.jobs
    }

    pub fn running_count(&self) -> usize {
        self.jobs
            .iter()
            .filter(|j| j.status == JobStatus::Running)
            .count()
    }

    /// If capacity allows, mark the next queued job running and return a
    /// clone of it. This is the scheduler's single atomic "claim" step.
    pub fn claim_next(&mut self, concurrency: usize) -> Option<Job> {
        if self.running_count() >= concurrency {
            return None;
        }
        let job = self
            .jobs
            .iter_mut()
            .find(|j| j.status == JobStatus::Queued)?;
        job.status = JobStatus::Running;
        Some(job.clone())
    }

    pub fn set_status(&mut self, id: &str, status: JobStatus) {
        if let Some(job) = self.get_mut(id) {
            job.status = status;
        }
    }

    /// A failed or cancelled job must never block the rest of the queue.
    pub fn has_pending(&self) -> bool {
        self.jobs.iter().any(|j| j.status == JobStatus::Queued)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg_args::{OutputFormat, VideoPreset};

    fn make_settings() -> JobSettings {
        JobSettings {
            input_path: "/in/a.mov".into(),
            output_path: "/out/a.mp4".into(),
            format: OutputFormat::Mp4,
            video_preset: VideoPreset::High,
            trim_start: None,
            trim_end: None,
            advanced: None,
            stream_copy: false,
        }
    }

    fn make_job(id: &str) -> Job {
        Job::new(id.into(), make_settings(), Some(2_000_000))
    }

    #[test]
    fn job_starts_queued() {
        let job = make_job("j1");
        assert_eq!(job.status, JobStatus::Queued);
        assert_eq!(job.progress_percent, 0.0);
    }

    #[test]
    fn claim_next_respects_concurrency() {
        let mut q = Queue::default();
        q.push(make_job("j1"));
        q.push(make_job("j2"));
        q.push(make_job("j3"));

        assert_eq!(q.claim_next(2).map(|j| j.id), Some("j1".to_string()));
        assert_eq!(q.claim_next(2).map(|j| j.id), Some("j2".to_string()));
        // At capacity: third claim refused
        assert!(q.claim_next(2).is_none());
        assert_eq!(q.running_count(), 2);
    }

    #[test]
    fn claim_next_frees_capacity_when_job_finishes() {
        let mut q = Queue::default();
        q.push(make_job("j1"));
        q.push(make_job("j2"));

        q.claim_next(1).unwrap();
        assert!(q.claim_next(1).is_none());

        q.set_status("j1", JobStatus::Done);
        assert_eq!(q.claim_next(1).map(|j| j.id), Some("j2".to_string()));
    }

    #[test]
    fn failed_job_does_not_block_queue() {
        let mut q = Queue::default();
        q.push(make_job("j1"));
        q.push(make_job("j2"));

        q.claim_next(1).unwrap();
        q.set_status("j1", JobStatus::Failed);
        // Failure frees the slot; next job claimable
        assert_eq!(q.claim_next(1).map(|j| j.id), Some("j2".to_string()));
    }

    #[test]
    fn cancelled_queued_job_is_skipped() {
        let mut q = Queue::default();
        q.push(make_job("j1"));
        q.push(make_job("j2"));

        q.set_status("j1", JobStatus::Cancelled);
        assert_eq!(q.claim_next(2).map(|j| j.id), Some("j2".to_string()));
    }

    #[test]
    fn drains_five_mixed_jobs_with_one_failure() {
        // Simulates the M2 exit criterion at the state-machine level:
        // 5 jobs, concurrency 2, one fails — queue drains completely.
        let mut q = Queue::default();
        for i in 1..=5 {
            q.push(make_job(&format!("j{i}")));
        }

        let mut finished: Vec<String> = vec![];
        while q.has_pending() || q.running_count() > 0 {
            while let Some(job) = q.claim_next(2) {
                // j3 is the deliberately corrupt file
                let status = if job.id == "j3" {
                    JobStatus::Failed
                } else {
                    JobStatus::Done
                };
                q.set_status(&job.id, status);
                finished.push(job.id);
            }
        }

        assert_eq!(finished.len(), 5);
        assert_eq!(q.get("j3").unwrap().status, JobStatus::Failed);
        assert!(["j1", "j2", "j4", "j5"]
            .iter()
            .all(|id| q.get(id).unwrap().status == JobStatus::Done));
    }
}
