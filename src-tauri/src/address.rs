use std::sync::Mutex;

use anyhow::{Error, Result};
use orchard::keys::Scope;
use tauri::State;
use zcash_vote::{address::VoteAddress, decrypt::to_fvk};

use crate::state::AppState;

#[tauri::command]
pub fn get_address(state: State<Mutex<AppState>>) -> Result<String, String> {
    tauri_export!(state, _connection, {
        let fvk = to_fvk(&state.key)?;
        let address = fvk.address_at(0u64, Scope::External);
        let vote_address = VoteAddress(address);
        Ok::<_, Error>(vote_address.to_string())
    })
}
