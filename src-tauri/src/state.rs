use std::sync::Mutex;

use anyhow::Error;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use tauri::State;
use zcash_vote::Election;

use crate::db::{create_schema, load_election, store_election};

pub struct AppState {
    pub url: String,
    pub election: Election,
    pub key: String,
    pub pool: r2d2::Pool<SqliteConnectionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            url: Default::default(),
            election: Default::default(),
            key: Default::default(),
            pool: Pool::new(SqliteConnectionManager::memory()).unwrap(),
        }
    }
}

#[tauri::command]
pub fn save_db(path: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    (|| {
        let mut s = state.lock().unwrap();
        {
            let db = Connection::open(&path)?;
            create_schema(&db)?;
            // create_schema
        }
        let manager = SqliteConnectionManager::file(&path);
        let pool = Pool::new(manager)?;
        let connection = pool.get()?;
        store_election(&connection, &s.url, &s.election, &s.key)?;
        s.pool = pool;
        Ok::<_, Error>(())
    })().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_db(path: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    (|| {
        let mut s = state.lock().unwrap();
        let pool = Pool::new(SqliteConnectionManager::file(path))?;
        let connection = pool.get()?;
        let (url, election, key) = load_election(&connection)?;
        s.url = url;
        s.election = election;
        s.key = key;
        s.pool = pool;
        Ok::<_, Error>(())
    })().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_election(url: String, election: Election, key: String, state: State<Mutex<AppState>>) {
    let mut s = state.lock().unwrap();
    s.url = url.clone();
    s.election = election;
    s.key = key.clone();
}

#[tauri::command]
pub fn get_election(state: State<Mutex<AppState>>) -> Election {
    let s = state.lock().unwrap();
    s.election.clone()
}
