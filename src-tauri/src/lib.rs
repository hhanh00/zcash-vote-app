use std::sync::Mutex;

use state::AppState;
use zcash_vote::Election;

pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(AppState {
            election: Election::default(),
        }))
        .invoke_handler(tauri::generate_handler![
            state::set_election,
            state::get_election,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
