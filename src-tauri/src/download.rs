use std::sync::Mutex;

use anyhow::{Error, Result};
use orchard::vote::Ballot;
use rusqlite::OptionalExtension;
use tauri::{ipc::Channel, State};
use zcash_vote::{
    db::{load_prop, store_prop},
    decrypt::to_fvk,
    election::Election,
};

use crate::{db::store_ballot, state::AppState, validate::handle_ballot};

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
        let lwd_url = std::env::var("LWD_URL").unwrap_or("https://zec.rocks".to_string());
        connection.execute("BEGIN TRANSACTION", [])?;
        let (connection, h) = zcash_vote::download::download_reference_data(
            connection,
            0,
            &election,
            Some(fvk),
            &lwd_url,
            move |h| {
                let _ = channel.send(h);
            },
        )
        .await?;
        store_prop(&connection, "height", &h.to_string()).unwrap();
        connection.execute("COMMIT", [])?;
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
        let connection = pool.get()?;
        let r = connection.query_row("SELECT 1 FROM cmxs", [], |_| Ok(())).optional()?;
        if r.is_none() {
            return Ok::<_, Error>(()); // don't sync if we haven't downloaded blocks
        }
        let url = format!("{}/num_ballots", base_url);
        let n = reqwest::get(url).await?.text().await?;
        let n = n.parse::<u32>()?;
        let election = load_prop(&connection, "election")?.unwrap();
        let election = serde_json::from_str::<Election>(&election)?;
        let c = connection.query_row("SELECT COUNT(*) FROM ballots", [], |r| r.get::<_, u32>(0))?;
        if c < n {
            for i in c..n {
                let url = format!("{}/ballot/height/{}", base_url, i + 1);
                let ballot = reqwest::get(url).await?.text().await?;
                let ballot = serde_json::from_str::<Ballot>(&ballot)?;
                let mut connection = pool.get()?;
                let transaction = connection.transaction()?;
                handle_ballot(&transaction, &election, i + 1, &ballot)?;
                store_ballot(&transaction, i + 1, &ballot)?;
                transaction.commit()?;
            }
        }

        Ok::<_, Error>(())
    };
    rep.await.map_err(|e| e.to_string())
}
