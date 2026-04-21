use std::{
    fs::remove_file,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Error;
use orchard::keys::Scope;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use tauri::State;
use zcash_vote::{db::create_schema, election::Election};
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::db::{load_election, store_election};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct AppState {
    pub urls: Vec<String>,
    #[zeroize(skip)] pub election: Election,
    pub key: String,
    #[zeroize(skip)] pub scope: Scope,
    #[zeroize(skip)] pub pool: r2d2::Pool<SqliteConnectionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            urls: Default::default(),
            election: Default::default(),
            key: Default::default(),
            scope: Scope::External,
            pool: Pool::new(SqliteConnectionManager::memory()).unwrap(),
        }
    }
}

fn init_db(path: &str) -> Result<Pool<SqliteConnectionManager>, Error> {
    let _ = remove_file(path);
    let connection = Connection::open(path)?;
    create_schema(&connection)?;
    connection.execute(
        "CREATE TABLE IF NOT EXISTS votes(
        id_vote INTEGER PRIMARY KEY,
        hash TEXT NOT NULL,
        address TEXT NOT NULL,
        amount INTEGER NOT NULL)",
        [],
    )?;
    let manager = SqliteConnectionManager::file(path);
    let pool = Pool::new(manager)?;
    Ok(pool)
}

#[tauri::command]
pub fn save_db(path: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    (|| {
        let mut s = state.lock().unwrap();
        let pool = init_db(&path)?;
        let connection = pool.get()?;
        let urls_delim = s.urls.join(",");
        let internal = if s.scope == Scope::Internal {
            "true"
        } else {
            "false"
        };
        store_election(&connection, &urls_delim, &s.election, &s.key, internal)?;
        s.pool = pool;
        Ok::<_, Error>(())
    })()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn replace_db(path: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    (|| {
        let pool = init_db(&path)?;
        let mut s = state.lock().unwrap();
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
        let (urls, election, key, scope) = load_election(&connection)?;
        s.urls = urls;
        s.election = election;
        s.key = key;
        s.pool = pool;
        s.scope = scope;
        Ok::<_, Error>(())
    })()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_election(urls: String, election: Election, key: String, internal: bool, state: State<Mutex<AppState>>) -> Result<(), String>  {
    let mut s = state.lock().unwrap();
    let urls: Vec<String> = urls
        .split(",")
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(String::from)
        .collect();
    if urls.is_empty() {
        return Err("At least one election URL is required".to_string());
    }
    s.urls = urls;
    s.election = election;
    s.key.zeroize();
    s.key = key;
    if internal {
        s.scope = Scope::Internal;
    } else {
        s.scope = Scope::External;
    }
    Ok(())
}

#[tauri::command]
pub fn get_election(state: State<Mutex<AppState>>) -> Election {
    let s = state.lock().unwrap();
    s.election.clone()
}

#[tauri::command]
pub fn get_election_id(state: State<Mutex<AppState>>) -> String {
    let s = state.lock().unwrap();
    s.election.id()
}

#[tauri::command]
pub fn get_temp_path(name: String) -> String {
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    std::env::temp_dir()
        .join(format!("zcash-vote-batch-{safe}-{}-{stamp}.db", std::process::id()))
        .to_string_lossy()
        .to_string()
}
