use std::sync::Mutex;

use state::AppState;

#[path ="cash.z.wallet.sdk.rpc.rs"]
pub mod rpc;
pub mod state;
pub mod db;
pub mod download;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            state::set_election,
            state::get_election,
            state::set_db,
            download::download_reference_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
