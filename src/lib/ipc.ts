import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  CMD_CANCEL_ALL,
  CMD_CANCEL_JOB,
  CMD_ENQUEUE_JOBS,
  CMD_EXPAND_PATHS,
  CMD_GENERATE_FILMSTRIP,
  CMD_GENERATE_THUMBNAIL,
  CMD_GET_QUEUE_STATE,
  CMD_PREVIEW_ARGS,
  CMD_PROBE_FILE,
  CMD_PROBE_HW_ENCODERS,
  CMD_RESOLVE_OUTPUT_PATHS,
  CMD_SET_CONCURRENCY,
  EVT_JOB_CANCELLED,
  EVT_JOB_DONE,
  EVT_JOB_ERROR,
  EVT_JOB_STARTED,
  EVT_PROGRESS,
} from "./constants";
import type { VideoEncoderId } from "./encoders";
import type { OutputFormat, VideoPreset } from "./presets";

export interface AdvancedSettings {
  encoder: VideoEncoderId | null;
  max_height: number | null;
  fps: number | null;
  crf: number | null;
  audio_bitrate_kbps: number | null;
  strip_metadata: boolean;
}

export interface JobSettings {
  input_path: string;
  output_path: string;
  format: OutputFormat;
  video_preset: VideoPreset;
  trim_start: number | null;
  trim_end: number | null;
  advanced: AdvancedSettings | null;
  stream_copy: boolean;
  allow_overwrite: boolean;
}

export interface NamingRequest {
  input_path: string;
  output_dir: string | null;
  extension: string;
}

export interface ResolvedOutput {
  path: string;
  exists: boolean;
}

export interface JobSnapshot {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress_percent: number;
  error: string | null;
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

export function generateFilmstrip(
  path: string,
  durationS: number,
  count: number
): Promise<string[]> {
  return invoke<string[]>(CMD_GENERATE_FILMSTRIP, { path, durationS, count });
}

export function probeHwEncoders(): Promise<string[]> {
  return invoke<string[]>(CMD_PROBE_HW_ENCODERS);
}

export function previewArgs(settings: JobSettings): Promise<string[]> {
  return invoke<string[]>(CMD_PREVIEW_ARGS, { settings });
}

export function expandPaths(paths: string[]): Promise<string[]> {
  return invoke<string[]>(CMD_EXPAND_PATHS, { paths });
}

export function getQueueState(): Promise<JobSnapshot[]> {
  return invoke<JobSnapshot[]>(CMD_GET_QUEUE_STATE);
}

export function resolveOutputPaths(
  reqs: NamingRequest[],
  avoidExisting: boolean
): Promise<ResolvedOutput[]> {
  return invoke<ResolvedOutput[]>(CMD_RESOLVE_OUTPUT_PATHS, {
    reqs,
    avoidExisting,
  });
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
