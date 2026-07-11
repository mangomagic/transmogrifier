pub mod commands;
pub mod ffmpeg_args;
pub mod ipc_constants;
pub mod probe;
pub mod progress;
pub mod queue;

use commands::{cancel_job, convert_file, probe_file, CancelledJobs, RunningJobs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(RunningJobs::default())
        .manage(CancelledJobs::default())
        .invoke_handler(tauri::generate_handler![convert_file, probe_file, cancel_job])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
