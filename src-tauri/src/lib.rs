pub mod codec_args;
pub mod commands;
pub mod encoders;
pub mod ffmpeg_args;
pub mod ipc_constants;
pub mod media_paths;
pub mod output_naming;
pub mod probe;
pub mod progress;
pub mod queue;
pub mod runner;
pub mod scheduler;
pub mod thumb_commands;
pub mod thumbs;

use commands::{
    cancel_all, cancel_job, enqueue_jobs, expand_paths, preview_args, probe_file,
    get_queue_state, probe_hw_encoders, resolve_output_paths, set_concurrency, CancelledJobs,
    RunningJobs,
};
use scheduler::QueueState;
use thumb_commands::{generate_filmstrip, generate_thumbnail};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(RunningJobs::default())
        .manage(CancelledJobs::default())
        .manage(QueueState::default())
        .invoke_handler(tauri::generate_handler![
            enqueue_jobs,
            probe_file,
            cancel_job,
            cancel_all,
            set_concurrency,
            generate_thumbnail,
            generate_filmstrip,
            probe_hw_encoders,
            preview_args,
            resolve_output_paths,
            get_queue_state,
            expand_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
