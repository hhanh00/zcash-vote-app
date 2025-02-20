use crate::state::AppState;
use anyhow::{Error, Result};
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use zcash_vote::{
    address::VoteAddress, db::{list_notes, load_prop}, decrypt::{to_fvk, to_sk}, election::BALLOT_PK, trees::{list_cmxs, list_nf_ranges}
};

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
        let vaddress = VoteAddress::decode(&address)?;
        let connection = pool.get()?;
        let notes = list_notes(&connection, 0, &fvk)?;
        let cmxs = list_cmxs(&connection)?;
        let nfs = list_nf_ranges(&connection)?;
        let ballot = orchard::vote::vote(
            domain,
            signature_required,
            sk,
            &fvk,
            vaddress.0,
            amount,
            &notes,
            &nfs,
            &cmxs,
            &mut rng,
            &BALLOT_PK,
        )?;

        let client = reqwest::Client::new();
        let url = format!("{}/ballot", base_url);
        let rep = client
            .post(url)
            .header(CONTENT_TYPE, "application/json")
            .json(&ballot)
            .send()
            .await?;
        let success = rep.status().is_success();
        let res = rep.text().await?;
        if !success {
            anyhow::bail!(res);
        }

        let hash = hex::encode(ballot.data.sighash()?);
        crate::db::store_vote(&connection, &hash, &address, amount)?;
        Ok::<_, Error>(hash)
    };

    r.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fetch_votes(state: State<'_, Mutex<AppState>>) -> Result<Vec<Vote>, String> {
    tauri_export!(state, connection, {
        let mut s = connection
            .prepare("SELECT id_vote, hash, address, amount FROM votes ORDER BY id_vote")?;
        let rows = s.query_map([], |r| {
            Ok((
                r.get::<_, u32>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, u64>(3)?,
            ))
        })?;
        let mut votes = vec![];
        for r in rows {
            let (id_vote, hash, address, amount) = r?;
            votes.push(Vote {
                id: id_vote,
                hash,
                address,
                amount,
            })
        }
        Ok::<_, Error>(votes)
    })
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Vote {
    pub id: u32,
    pub hash: String,
    pub address: String,
    pub amount: u64,
}
