use anyhow::Error;
use std::sync::Mutex;

use tauri::State;

use crate::{db::load_prop, state::AppState};

#[tauri::command]
pub fn get_sync_height(state: State<'_, Mutex<AppState>>) -> Result<Option<u32>, String> {
    tauri_export!(state, connection, {
        let height = load_prop(&connection, "height")?.map(|h| h.parse::<u32>().unwrap());
        Ok::<_, Error>(height)
    })
}

#[tauri::command]
pub fn get_available_balance(state: State<'_, Mutex<AppState>>) -> Result<u64, String> {
    tauri_export!(state, connection, {
        let balance = connection.query_row(
            "SELECT SUM(value) FROM notes WHERE spent IS NULL", [], |r| r.get::<_, Option<u64>>(0))?;
        Ok::<_, Error>(balance.unwrap_or_default())
    })
}

