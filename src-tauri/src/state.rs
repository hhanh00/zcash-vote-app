use std::sync::Mutex;

use anyhow::Error;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use tauri::State;
use zcash_vote::Election;

use crate::db::create_schema;

pub struct AppState {
    pub election: Election,
    pub pool: r2d2::Pool<SqliteConnectionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            election: Default::default(),
            pool: Pool::new(SqliteConnectionManager::memory()).unwrap(),
        }
    }
}

#[tauri::command]
pub fn set_db(path: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    (|| {
        let mut s = state.lock().unwrap();
        {
            let db = Connection::open(&path)?;
            create_schema(&db)?;
            // create_schema
        }
        let manager = SqliteConnectionManager::file(&path);
        let pool = Pool::new(manager)?;
        s.pool = pool;
        Ok::<_, Error>(())
    })().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_election(election: Election, state: State<Mutex<AppState>>) {
    let mut s = state.lock().unwrap();
    s.election = election;
}

#[tauri::command]
pub fn get_election(state: State<Mutex<AppState>>) -> Election {
    let s = state.lock().unwrap();
    s.election.clone()
}
