use std::sync::Mutex;

use state::AppState;

#[macro_export]
macro_rules! tauri_export {
    ($state:ident, $connection:ident, $block:block) => {
        (|| {
            let $state = $state.lock().unwrap();
            let $connection = $state.pool.get()?;
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
pub mod trees;
pub mod address;
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
            address::get_address,
            db::get_prop,
            validate::validate_key,
            download::download_reference_data,
            vote::get_sync_height,
            vote::get_available_balance,
            vote::vote,
            trees::compute_roots,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn as_byte256(h: &[u8]) -> [u8; 32] {
    let mut hh = [0u8; 32];
    hh.copy_from_slice(h);
    hh
}
