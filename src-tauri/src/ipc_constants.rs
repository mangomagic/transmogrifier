// Shared IPC constants — mirrored in src/lib/constants.ts on the TS side.
// Never use inline string literals for command/event names elsewhere.

pub const CMD_ENQUEUE_JOBS: &str = "enqueue_jobs";
pub const CMD_PROBE_FILE: &str = "probe_file";
pub const CMD_CANCEL_JOB: &str = "cancel_job";
pub const CMD_CANCEL_ALL: &str = "cancel_all";
pub const CMD_SET_CONCURRENCY: &str = "set_concurrency";
pub const CMD_GENERATE_THUMBNAIL: &str = "generate_thumbnail";
pub const CMD_GENERATE_FILMSTRIP: &str = "generate_filmstrip";
pub const CMD_PROBE_HW_ENCODERS: &str = "probe_hw_encoders";
pub const CMD_PREVIEW_ARGS: &str = "preview_args";
pub const CMD_EXPAND_PATHS: &str = "expand_paths";
pub const EVT_PROGRESS: &str = "progress";
pub const EVT_JOB_STARTED: &str = "job_started";
pub const EVT_JOB_DONE: &str = "job_done";
pub const EVT_JOB_ERROR: &str = "job_error";
pub const EVT_JOB_CANCELLED: &str = "job_cancelled";
