// Shared IPC constants — mirrored in src/lib/constants.ts on the TS side.
// Never use inline string literals for command/event names elsewhere.

pub const CMD_CONVERT_FILE: &str = "convert_file";
pub const CMD_PROBE_FILE: &str = "probe_file";
pub const CMD_CANCEL_JOB: &str = "cancel_job";
pub const EVT_PROGRESS: &str = "progress";
pub const EVT_JOB_DONE: &str = "job_done";
pub const EVT_JOB_ERROR: &str = "job_error";
pub const EVT_JOB_CANCELLED: &str = "job_cancelled";
