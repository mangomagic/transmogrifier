import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  CMD_CANCEL_JOB,
  CMD_CONVERT_FILE,
  CMD_PROBE_FILE,
  EVT_JOB_CANCELLED,
  EVT_JOB_DONE,
  EVT_JOB_ERROR,
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

export interface JobDonePayload {
  job_id: string;
}

export interface JobErrorPayload {
  job_id: string;
  message: string;
}

export interface JobCancelledPayload {
  job_id: string;
}

export function probeFile(path: string): Promise<MediaInfo> {
  return invoke<MediaInfo>(CMD_PROBE_FILE, { path });
}

export function convertFile(
  settings: JobSettings,
  jobId: string,
  durationUs: number | null
): Promise<void> {
  return invoke<void>(CMD_CONVERT_FILE, {
    settings,
    jobId,
    durationUs,
  });
}

export function onProgress(
  cb: (payload: ProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<ProgressPayload>(EVT_PROGRESS, (e) => cb(e.payload));
}

export function onJobDone(
  cb: (payload: JobDonePayload) => void
): Promise<UnlistenFn> {
  return listen<JobDonePayload>(EVT_JOB_DONE, (e) => cb(e.payload));
}

export function onJobError(
  cb: (payload: JobErrorPayload) => void
): Promise<UnlistenFn> {
  return listen<JobErrorPayload>(EVT_JOB_ERROR, (e) => cb(e.payload));
}

export function onJobCancelled(
  cb: (payload: JobCancelledPayload) => void
): Promise<UnlistenFn> {
  return listen<JobCancelledPayload>(EVT_JOB_CANCELLED, (e) => cb(e.payload));
}

export function cancelJob(jobId: string): Promise<void> {
  return invoke<void>(CMD_CANCEL_JOB, { jobId });
}
