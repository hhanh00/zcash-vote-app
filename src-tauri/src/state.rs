use std::sync::Mutex;

use tauri::State;
use zcash_vote::Election;

#[derive(Default)]
pub struct AppState {
    pub election: Election,
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
