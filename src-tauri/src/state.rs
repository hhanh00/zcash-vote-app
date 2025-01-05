use std::{fs::remove_file, sync::Mutex};

use anyhow::Error;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use tauri::State;
use zcash_vote::{db::create_schema, election::Election};

use crate::db::{load_election, store_election};

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
            let _ = remove_file(&path);
            let connection = Connection::open(&path)?;
            create_schema(&connection)?;
            connection.execute(
                "CREATE TABLE IF NOT EXISTS votes(
                id_vote INTEGER PRIMARY KEY,
                hash TEXT NOT NULL,
                address TEXT NOT NULL,
                amount INTEGER NOT NULL)",
                [],
            )?;
        }
        let manager = SqliteConnectionManager::file(&path);
        let pool = Pool::new(manager)?;
        let connection = pool.get()?;
        store_election(&connection, &s.url, &s.election, &s.key)?;
        s.pool = pool;
        Ok::<_, Error>(())
    })()
    .map_err(|e| e.to_string())
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
    })()
    .map_err(|e| e.to_string())
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
