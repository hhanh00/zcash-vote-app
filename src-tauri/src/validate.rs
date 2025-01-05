use anyhow::{Result, Error};
use orchard::keys::{PreparedIncomingViewingKey, Scope};
use rusqlite::Connection;
use std::sync::Mutex;

use bip0039::Mnemonic;
use tauri::State;
use zcash_address::unified::Encoding;
use zcash_vote::{ballot::Ballot, db::{load_prop, store_cmx, store_note}, decrypt::to_fvk, validate::try_decrypt_ballot, Election};

use crate::{db::mark_spent, state::AppState};

#[tauri::command]
pub fn validate_key(key: String) -> Result<bool, ()> {
    if Mnemonic::from_phrase(&key).is_ok() {
        return Ok(true);
    }
    if zcash_address::unified::Ufvk::decode(&key).is_ok() {
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn validate_ballot(ballot: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    tauri_export!(state, _connection, {
        let election = &state.election;
        let ballot = serde_json::from_str::<Ballot>(&ballot)?;
        zcash_vote::validate::validate_ballot(ballot, election.signature_required)?;
        Ok::<_, Error>(())
    })
}

pub fn handle_ballot(connection: &Connection, election: &Election, height: u32, ballot: &Ballot) -> Result<()> {
    let key = load_prop(connection, "key")?.ok_or(anyhow::anyhow!("no key"))?;
    let fvk = to_fvk(&key)?;
    let pivk = PreparedIncomingViewingKey::new(&fvk.to_ivk(Scope::External));

    let position = connection.query_row(
        "SELECT COUNT(*) FROM cmxs", [], |r| r.get::<_, u32>(0))?;
    let txid = ballot.data.sighash()?;

    for (i, action) in ballot.data.actions.iter().enumerate() {
        mark_spent(connection, height, &action.nf)?;
        if let Some(note) = try_decrypt_ballot(&pivk, action)? {
            println!("{:?}", note);
            store_note(connection, 0, election.domain().0,
                &fvk, height, position + i as u32, &txid, &note)?;
        }
        store_cmx(connection, 0, &action.cmx)?;
    }
    Ok(())
}
