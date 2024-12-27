use anyhow::Result;
use rusqlite::{params, Connection};
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

    Ok(())
}

pub fn store_election(connection: &Connection, url: &str, election: &Election, key: &str) -> Result<()> {
    store_prop(connection, "url", url)?;
    store_prop(connection, "election", &serde_json::to_string(election).unwrap())?;
    store_prop(connection, "key", key)?;
    Ok(())
}

pub fn load_election(connection: &Connection) -> Result<(String, Election, String)> {
    let url = load_prop(connection, "url")?;
    let election = load_prop(connection, "election")?;
    let key = load_prop(connection, "key")?;
    let election: Election = serde_json::from_str(&election)?;
    Ok((url, election, key))
}

fn store_prop(connection: &Connection, name: &str, value: &str) -> Result<()> {
    connection.execute(
        "INSERT INTO properties(name, value) VALUES (?1, ?2)",
        params![name, value])?;
    Ok(())
}

fn load_prop(connection: &Connection, name: &str) -> Result<String> {
    let value: String = connection.query_row(
        "SELECT value FROM properties WHERE name = ?1", [name],
    |r| r.get::<_, String>(0))?;
    Ok(value)
}
