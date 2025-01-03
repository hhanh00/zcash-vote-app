use anyhow::{Error, Result};
use reqwest::header::CONTENT_TYPE;
use zcash_vote::{db::load_prop, decrypt::{to_fvk, to_sk}};
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
pub async fn vote(
    address: String,
    amount: u64,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let r = async {
        let (pool, base_url, sk, fvk, domain, signature_required) = {
            let state = state.lock().unwrap();
            let pool = state.pool.clone();
            let base_url = state.url.clone();
            let sk = to_sk(&state.key)?;
            let fvk = to_fvk(&state.key)?;
            let domain = state.election.domain();
            let signature_required = state.election.signature_required;
            (pool, base_url, sk, fvk, domain, signature_required)
        };
        let mut rng = rand_core::OsRng;
        let connection = pool.get()?;
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

        let client = reqwest::Client::new();
        let url = format!("{}/ballot", base_url);
        client.post(url)
        .header(CONTENT_TYPE, "application/json")
        .json(&ballot)
        .send().await?.text().await?;

        crate::db::store_vote(&connection, &address, amount)?;
        let ballot = serde_json::to_string(&ballot).unwrap();
        Ok::<_, Error>(ballot)
    };

    r.await.map_err(|e| e.to_string())
}
