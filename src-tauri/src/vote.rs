use anyhow::{Error, Result};
use orchard::keys::{PreparedIncomingViewingKey, Scope};
use zcash_vote::{db::load_prop, decrypt::{to_fvk, to_sk}, validate::try_decrypt_ballot};
use std::sync::Mutex;
use tauri::State;
use crate::state::AppState;

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
            "SELECT SUM(value) FROM notes WHERE spent IS NULL",
            [],
            |r| r.get::<_, Option<u64>>(0),
        )?;
        Ok::<_, Error>(balance.unwrap_or_default())
    })
}

#[tauri::command]
pub fn vote(
    address: String,
    amount: u64,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    tauri_export!(state, connection, {
        let sk = to_sk(&state.key)?;
        let fvk = to_fvk(&state.key)?;
        let domain = state.election.domain();
        let signature_required = state.election.signature_required;
        let mut rng = rand_core::OsRng;
        let ballot = zcash_vote::vote::vote(
            &connection,
            domain,
            signature_required,
            sk,
            &fvk,
            &address,
            amount,
            &mut rng,
        )?;

        let pivk = PreparedIncomingViewingKey::new(&fvk.to_ivk(Scope::External));
        for action in ballot.data.actions.iter() {
            if let Some(note) = try_decrypt_ballot(&pivk, action)? {
                println!(">> {:?}", note);
            }
        }

        let ballot = serde_json::to_string(&ballot).unwrap();
        Ok::<_, Error>(ballot)
    })
}
