use anyhow::{Result, Error};
use rusqlite::Connection;
use crate::db::list_notes;
use std::sync::Mutex;

use tauri::State;

use crate::{db::load_prop, state::AppState};

#[tauri::command]
pub fn get_sync_height(state: State<'_, Mutex<AppState>>) -> Result<Option<u32>, String> {
    tauri_export!(state, connection, {
        let height = load_prop(&connection, "height")?.map(|h| h.parse::<u32>().unwrap());
        Ok::<_, Error>(height)
    })
}

#[tauri::command]
pub fn get_available_balance(state: State<'_, Mutex<AppState>>) -> Result<u64, String> {
    tauri_export!(state, connection, {
        let balance = connection.query_row(
            "SELECT SUM(value) FROM notes WHERE spent IS NULL",
            [],
            |r| r.get::<_, Option<u64>>(0),
        )?;
        Ok::<_, Error>(balance.unwrap_or_default())
    })
}

#[tauri::command]
pub fn vote(
    candidate: String,
    amount: u64,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    tauri_export!(state, connection, {
        vote_inner(&connection, &candidate, amount)
    })
}

pub fn vote_inner(connection: &Connection, candidate: &str, amount: u64) -> Result<()> {
    let notes = list_notes(connection)?;
    for n in notes {
        println!("{:?}", n);
    }
    Ok(())
}


#[cfg(test)]
mod tests {
    use std::{path::Path, sync::Mutex};

    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use tauri::{test::mock_app, Manager as _};
    use zcash_vote::Election;

    use crate::state::AppState;

    use super::vote;

    #[test]
    fn test_vote() {
        let home_dir = std::env::var("HOME").unwrap();
        let db_path = Path::new(&home_dir).join("Documents").join("NSM.db");
        let connection_manager = SqliteConnectionManager::file(db_path.to_string_lossy().to_string());
        let pool = Pool::new(connection_manager).unwrap();
        let state = AppState {
            url: "http://localhost:8080".to_string(),
            election: Election::default(),
            key: "".to_string(),
            pool,
        };
        let state = Mutex::new(state);
        let app = mock_app();
        app.manage(state);
        vote("".to_string(), 10000, app.state()).unwrap();
    }
}
