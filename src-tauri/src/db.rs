use std::sync::Mutex;

use anyhow::{Error, Result};
use orchard::{
    keys::{Diversifier, FullViewingKey, Scope},
    note::{Nullifier, RandomSeed},
    value::NoteValue,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use zcash_vote::{db::{load_prop, store_prop}, Election};

use crate::{as_byte256, state::AppState};

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

pub fn list_notes(connection: &Connection, fvk: &FullViewingKey) -> Result<Vec<(orchard::Note, u32)>> {
    let mut s = connection.prepare(
        "SELECT position, height, txid, value, div, rseed, nf, dnf, rho
        FROM notes WHERE spent IS NULL",
    )?;
    let notes = s.query_map([], |r| {
        let position = r.get::<_, u32>(0)?;
        let height = r.get::<_, u32>(1)?;
        let txid = r.get::<_, Vec<u8>>(2)?;
        let value = r.get::<_, u64>(3)?;
        let div = r.get::<_, Vec<u8>>(4)?;
        let rseed = r.get::<_, Vec<u8>>(5)?;
        let nf = r.get::<_, Vec<u8>>(6)?;
        let dnf = r.get::<_, Vec<u8>>(7)?;
        let rho = r.get::<_, Vec<u8>>(8)?;

        let n = Note {
            position,
            height,
            txid,
            value,
            div,
            rseed,
            nf,
            dnf,
            rho,
        };
        Ok(n.to_note(fvk))
    })?;

    Ok(notes.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Clone, Serialize, Deserialize, Default, Debug)]
pub struct Note {
    pub position: u32,
    pub height: u32,
    pub txid: Vec<u8>,
    pub value: u64,
    pub div: Vec<u8>,
    pub rseed: Vec<u8>,
    pub nf: Vec<u8>,
    pub dnf: Vec<u8>,
    pub rho: Vec<u8>,
}

impl Note {
    fn to_note(&self, fvk: &FullViewingKey) -> (orchard::Note, u32) {
        let d = Diversifier::from_bytes(self.div.clone().try_into().unwrap());
        let recipient = fvk.address(d, Scope::External);
        let rho = Nullifier::from_bytes(&as_byte256(&self.rho)).unwrap();
        let note = orchard::Note::from_parts(
            recipient,
            NoteValue::from_raw(self.value),
            rho.clone(),
            RandomSeed::from_bytes(as_byte256(&self.rseed), &rho).unwrap(),
        )
        .unwrap();
        (note, self.position)
    }
}
