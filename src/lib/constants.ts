// Mirrored from src-tauri/src/ipc_constants.rs — keep in sync.
export const CMD_ENQUEUE_JOBS = "enqueue_jobs";
export const CMD_PROBE_FILE = "probe_file";
export const CMD_CANCEL_JOB = "cancel_job";
export const CMD_CANCEL_ALL = "cancel_all";
export const CMD_SET_CONCURRENCY = "set_concurrency";
export const CMD_GENERATE_THUMBNAIL = "generate_thumbnail";
export const CMD_GENERATE_FILMSTRIP = "generate_filmstrip";
export const CMD_PROBE_HW_ENCODERS = "probe_hw_encoders";
export const CMD_PREVIEW_ARGS = "preview_args";
export const EVT_PROGRESS = "progress";
export const EVT_JOB_STARTED = "job_started";
export const EVT_JOB_DONE = "job_done";
export const EVT_JOB_ERROR = "job_error";
export const EVT_JOB_CANCELLED = "job_cancelled";
