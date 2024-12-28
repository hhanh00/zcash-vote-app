use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use zcash_vote::Election;

pub fn create_schema(connection: &Connection) -> Result<()> {
    connection.execute(
        "CREATE TABLE IF NOT EXISTS properties(
            id_property INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS ballots(
            id_ballot INTEGER PRIMARY KEY,
            hash BLOB NOT NULL UNIQUE,
            data BLOB NOT NULL
        )",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS nullifiers(
        id_nf INTEGER PRIMARY KEY NOT NULL,
        hash BLOB NOT NULL,
        revhash BLOB NOT NULL)",
        [],
    )?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS cmxs(
        id_cmx INTEGER PRIMARY KEY NOT NULL,
        hash BLOB NOT NULL)",
        [],
    )?;

    connection.execute(
        "CREATE TABLE IF NOT EXISTS notes(
        id_note INTEGER PRIMARY KEY,
        position INTEGER NOT NULL UNIQUE,
        height INTEGER NOT NULL,
        txid BLOB NOT NULL,
        value INTEGER NOT NULL,
        rseed BLOB NOT NULL,
        nf BLOB NOT NULL,
        dnf BLOB NOT NULL,
        rho BLOB NOT NULL,
        spent INTEGER)",
        [],
    )?;

    Ok(())
}

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

pub fn store_prop(connection: &Connection, name: &str, value: &str) -> Result<()> {
    connection.execute(
        "INSERT INTO properties(name, value) VALUES (?1, ?2)
        ON CONFLICT (name) DO UPDATE SET value = excluded.value",
        params![name, value],
    )?;
    Ok(())
}

pub fn load_prop(connection: &Connection, name: &str) -> Result<Option<String>> {
    let value = connection.query_row(
        "SELECT value FROM properties WHERE name = ?1",
        [name],
        |r| r.get::<_, String>(0),
    ).optional()?;
    Ok(value)
}

pub fn list_notes(connection: &Connection) -> Result<Vec<Note>> {
    let mut s = connection.prepare(
        "SELECT position, height, txid, value, rseed, nf, dnf, rho
        FROM notes WHERE spent IS NULL")?;
    let notes = s.query_map([], |r| {
        let position = r.get::<_, u32>(0)?;
        let height = r.get::<_, u32>(1)?;
        let txid = r.get::<_, Vec<u8>>(2)?;
        let value = r.get::<_, u64>(3)?;
        let rseed = r.get::<_, Vec<u8>>(4)?;
        let nf = r.get::<_, Vec<u8>>(5)?;
        let dnf = r.get::<_, Vec<u8>>(6)?;
        let rho = r.get::<_, Vec<u8>>(7)?;

        Ok(Note { position, height, txid, value, rseed, nf, dnf, rho })
    })?;

    Ok(notes.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Clone, Serialize, Deserialize, Default, Debug)]
pub struct Note {
    pub position: u32,
    pub height: u32,
    pub txid: Vec<u8>,
    pub value: u64,
    pub rseed: Vec<u8>,
    pub nf: Vec<u8>,
    pub dnf: Vec<u8>,
    pub rho: Vec<u8>,
}