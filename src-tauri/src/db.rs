use std::sync::Mutex;

use anyhow::{Error, Result};
use rusqlite::Connection;
use tauri::State;
use zcash_vote::{db::{load_prop, store_prop}, Election};

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
