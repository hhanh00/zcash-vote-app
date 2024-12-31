use std::sync::Mutex;

use anyhow::{Error, Result};
use tauri::{ipc::Channel, State};
use zcash_vote::{db::{load_prop, store_prop}, decrypt::to_fvk};

use crate::state::AppState;

#[tauri::command]
pub async fn download_reference_data(
    state: State<'_, Mutex<AppState>>,
    channel: Channel<u32>,
) -> Result<(), String> {
    let r = async {
        let (connection, election, fvk) = {
            let s = state.lock().unwrap();
            let fvk = to_fvk(&s.key)?;
            let connection = s.pool.get().unwrap();
            let election = s.election.clone();
            (connection, election, fvk)
        };
        let lwd_url = load_prop(&connection, "lwd")?.unwrap_or("https://zec.rocks".to_string());
        let (connection, h) = zcash_vote::download::download_reference_data(connection, election, fvk, 
            &lwd_url, move |h| {
            let _ = channel.send(h);
        }).await?;
        store_prop(&connection, "height", &h.to_string()).unwrap();
        Ok::<_, Error>(())
    };
    r.await.map_err(|e| e.to_string())
}

