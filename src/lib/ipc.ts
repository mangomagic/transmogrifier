import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  CMD_CANCEL_ALL,
  CMD_CANCEL_JOB,
  CMD_ENQUEUE_JOBS,
  CMD_GENERATE_THUMBNAIL,
  CMD_PROBE_FILE,
  CMD_SET_CONCURRENCY,
  EVT_JOB_CANCELLED,
  EVT_JOB_DONE,
  EVT_JOB_ERROR,
  EVT_JOB_STARTED,
  EVT_PROGRESS,
} from "./constants";
import type { OutputFormat, VideoPreset } from "./presets";

export interface JobSettings {
  input_path: string;
  output_path: string;
  format: OutputFormat;
  video_preset: VideoPreset;
  trim_start: number | null;
  trim_end: number | null;
}

export interface EnqueueJob {
  job_id: string;
  settings: JobSettings;
  duration_us: number | null;
}

export interface MediaInfo {
  duration_s: number | null;
  duration_us: number | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  bit_rate: number | null;
  rotation: number | null;
}

export interface ProgressPayload {
  job_id: string;
  percent: number;
  speed: number | null;
}

export interface JobEventPayload {
  job_id: string;
}

export interface JobErrorPayload {
  job_id: string;
  message: string;
}

export function probeFile(path: string): Promise<MediaInfo> {
  return invoke<MediaInfo>(CMD_PROBE_FILE, { path });
}

export function enqueueJobs(jobs: EnqueueJob[]): Promise<void> {
  return invoke<void>(CMD_ENQUEUE_JOBS, { jobs });
}

export function cancelJob(jobId: string): Promise<void> {
  return invoke<void>(CMD_CANCEL_JOB, { jobId });
}

export function cancelAll(): Promise<void> {
  return invoke<void>(CMD_CANCEL_ALL);
}

export function setConcurrency(n: number): Promise<void> {
  return invoke<void>(CMD_SET_CONCURRENCY, { n });
}

export function generateThumbnail(
  path: string,
  durationS: number | null
): Promise<string> {
  return invoke<string>(CMD_GENERATE_THUMBNAIL, { path, durationS });
}

export function onProgress(
  cb: (payload: ProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<ProgressPayload>(EVT_PROGRESS, (e) => cb(e.payload));
}

export function onJobStarted(
  cb: (payload: JobEventPayload) => void
): Promise<UnlistenFn> {
  return listen<JobEventPayload>(EVT_JOB_STARTED, (e) => cb(e.payload));
}

export function onJobDone(
  cb: (payload: JobEventPayload) => void
): Promise<UnlistenFn> {
  return listen<JobEventPayload>(EVT_JOB_DONE, (e) => cb(e.payload));
}

export function onJobError(
  cb: (payload: JobErrorPayload) => void
): Promise<UnlistenFn> {
  return listen<JobErrorPayload>(EVT_JOB_ERROR, (e) => cb(e.payload));
}

export function onJobCancelled(
  cb: (payload: JobEventPayload) => void
): Promise<UnlistenFn> {
  return listen<JobEventPayload>(EVT_JOB_CANCELLED, (e) => cb(e.payload));
}
