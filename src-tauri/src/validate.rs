use anyhow::Result;
use std::sync::Mutex;

use bip0039::Mnemonic;
use tauri::State;
use zcash_address::unified::Encoding;
use zcash_vote::ballot::Ballot;

use crate::state::AppState;

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
        zcash_vote::validate::validate_ballot(&ballot, &state.election)
    })
}

pub fn handle_ballot(_ballot: &Ballot) -> Result<()> {
    // verify ballot
    // try decrypt outputs
    // detect & mark spends
    // update height
    // store cmx
    // calcualte & store cmx_root
    Ok(())
}

#[test]
pub fn test_handle_ballot() -> Result<()> {
    let home_dir = std::env::var("HOME").unwrap();
    let db_path = std::path::Path::new(&home_dir).join("Documents").join("NSM.db");
    let connection_manager = r2d2_sqlite::SqliteConnectionManager::file(db_path.to_string_lossy().to_string());
    let pool = r2d2::Pool::new(connection_manager).unwrap();
    let connection = pool.get()?;
    let election = zcash_vote::db::load_prop(&connection, "election")?.unwrap();
    let _election: zcash_vote::Election = serde_json::from_str(&election)?;
    let mut ballot = String::new();
    std::io::Read::read_to_string(&mut std::fs::File::open("./src/ballot.json")?, &mut ballot)?;
    let ballot: Ballot = serde_json::from_str(&ballot)?;

    handle_ballot(&ballot)?;

    Ok(())
}
