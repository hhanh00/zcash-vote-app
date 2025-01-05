use std::sync::Mutex;

use anyhow::{Error, Result};
use rusqlite::{params, Connection};
use tauri::State;
use zcash_vote::{
    ballot::Ballot,
    db::{load_prop, store_prop},
    election::Election,
};

use crate::state::AppState;

pub fn store_election(
    connection: &Connection,
    url: &str,
    election: &Election,
    key: &str,
) -> Result<()> {
    store_prop(connection, "url", url)?;
    store_prop(
        connection,
        "election",
        &serde_json::to_string(election).unwrap(),
    )?;
    store_prop(connection, "key", key)?;
    Ok(())
}

pub fn load_election(connection: &Connection) -> Result<(String, Election, String)> {
    let url = load_prop(connection, "url")?.expect("Missing URL");
    let election = load_prop(connection, "election")?.expect("Missing election property");
    let key = load_prop(connection, "key")?.expect("Missing wallet key");
    let election: Election = serde_json::from_str(&election)?;
    Ok((url, election, key))
}

#[tauri::command]
pub fn get_prop(name: String, state: State<Mutex<AppState>>) -> Result<Option<String>, String> {
    tauri_export!(state, connection, {
        Ok::<_, Error>(load_prop(&connection, &name)?)
    })
}

pub fn store_ballot(connection: &Connection, height: u32, ballot: &Ballot) -> Result<()> {
    let hash = ballot.data.sighash()?;
    let ballot = serde_json::to_string(ballot)?;
    connection.execute(
        "INSERT INTO ballots(election, height, hash, data)
        VALUES (?1, ?2, ?3, ?4)",
        params![0, height, &hash, &ballot],
    )?;
    Ok(())
}

pub fn mark_spent(connection: &Connection, height: u32, dnf: &[u8]) -> Result<()> {
    connection.execute(
        "UPDATE notes SET spent = ?1 WHERE dnf = ?2",
        params![height, dnf],
    )?;
    Ok(())
}

pub fn store_vote(connection: &Connection, hash: &str, address: &str, amount: u64) -> Result<()> {
    connection.execute(
        "INSERT INTO votes(hash, address, amount)
        VALUES (?1, ?2, ?3)",
        params![hash, address, amount],
    )?;
    Ok(())
}
