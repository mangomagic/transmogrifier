use crate::ffmpeg_args::JobSettings;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    pub status: JobStatus,
    pub error: Option<String>,
    pub progress_percent: f32,
}

impl Job {
    pub fn new(id: String, settings: JobSettings) -> Self {
        Self {
            id,
            settings,
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

    pub fn next_queued(&self) -> Option<&Job> {
        self.jobs.iter().find(|j| j.status == JobStatus::Queued)
    }

    pub fn running_count(&self) -> usize {
        self.jobs.iter().filter(|j| j.status == JobStatus::Running).count()
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
        }
    }

    #[test]
    fn job_starts_queued() {
        let job = Job::new("j1".into(), make_settings());
        assert_eq!(job.status, JobStatus::Queued);
        assert_eq!(job.progress_percent, 0.0);
    }

    #[test]
    fn queue_next_queued_skips_running() {
        let mut q = Queue::default();
        let mut j1 = Job::new("j1".into(), make_settings());
        j1.status = JobStatus::Running;
        q.push(j1);
        q.push(Job::new("j2".into(), make_settings()));

        assert_eq!(q.next_queued().map(|j| j.id.as_str()), Some("j2"));
    }

    #[test]
    fn running_count() {
        let mut q = Queue::default();
        let mut j1 = Job::new("j1".into(), make_settings());
        j1.status = JobStatus::Running;
        q.push(j1);
        q.push(Job::new("j2".into(), make_settings()));

        assert_eq!(q.running_count(), 1);
    }
}
