use std::sync::Mutex;

use state::AppState;

#[macro_export]
macro_rules! tauri_export {
    ($state:ident, $connection:ident, $block:block) => {
        (|| {
            let s = $state.lock().unwrap();
            let $connection = s.pool.get()?;
            $block
        })().map_err(|e| e.to_string())
    };
}

#[path ="cash.z.wallet.sdk.rpc.rs"]
pub mod rpc;
pub mod state;
pub mod db;
pub mod validate;
pub mod download;
pub mod decrypt;
pub mod vote;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            state::set_election,
            state::get_election,
            state::save_db,
            state::open_db,
            validate::validate_key,
            download::download_reference_data,
            vote::get_sync_height,
            vote::get_available_balance,
            vote::vote,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
