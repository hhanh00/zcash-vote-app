use std::sync::Mutex;

use anyhow::{Error, Result};
use tauri::{ipc::Channel, State};
use zcash_vote::{ballot::Ballot, db::{load_prop, store_prop}, decrypt::to_fvk};

use crate::{db::store_ballot, state::AppState};

#[tauri::command]
pub async fn http_get(url: String) -> Result<String, String> {
    let rep = async {
        let rep = reqwest::get(url).await?;
        let body = rep.text().await?;
        Ok::<_, Error>(body)
    };
    rep.await.map_err(|e| e.to_string())
}

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
        let (connection, h) =
        zcash_vote::download::download_reference_data(connection, 0, &election, Some(fvk),
            &lwd_url, move |h| {
            let _ = channel.send(h);
        }).await?;
        store_prop(&connection, "height", &h.to_string()).unwrap();
        Ok::<_, Error>(())
    };
    r.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let rep = async {
        let (base_url, pool) = {
            let s = state.lock().unwrap();
            (s.url.clone(), s.pool.clone())
        };
        let url = format!("{}/num_ballots", base_url);
        let n = reqwest::get(url).await?.text().await?;
        let n = n.parse::<u32>()?;
        let connection = pool.get()?;
        let c = connection.query_row("SELECT COUNT(*) FROM ballots", [], |r| r.get::<_, u32>(0))?;
        if c < n {
            for i in c..n {
                let url = format!("{}/ballot/height/{}", base_url, i + 1);
                let ballot = reqwest::get(url).await?.text().await?;
                let ballot = serde_json::from_str::<Ballot>(&ballot)?;
                store_ballot(&connection, i + 1, &ballot)?;
            }
        }

        Ok::<_, Error>(())
    };
    rep.await.map_err(|e| e.to_string())
}
