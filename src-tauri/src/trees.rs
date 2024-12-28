use std::sync::Mutex;

use anyhow::{Error, Result};
use pasta_curves::{group::ff::PrimeField as _, Fp};
use rusqlite::Connection;
use orchard::{note::Nullifier, vote::{build_nf_ranges, calculate_merkle_paths}};
use tauri::State;

use crate::{db::store_prop, state::AppState};

#[tauri::command]
pub fn nf_root(state: State<Mutex<AppState>>) -> Result<String, String> {
    tauri_export!(state, connection, {
        let nf_root = compute_nf_root(&connection)?;
        let nf_root = hex::encode(&nf_root);
        Ok::<_, Error>(nf_root)
    })
}

// TODO: Pass positions of spent notes and return their MP
pub fn compute_nf_root(connection: &Connection) -> Result<Vec<u8>> {
    let mut s = connection.prepare("SELECT hash FROM nullifiers")?;
    let rows = s.query_map([], |r| {
        let v = r.get::<_, [u8; 32]>(0)?;
        let v = Fp::from_repr(v).unwrap();
        Ok(Nullifier::from_bytes(&v.to_repr()).unwrap())
    })?;
    let mut nfs = rows.collect::<Result<Vec<_>, _>>()?;
    nfs.sort();
    let nf_tree = build_nf_ranges(nfs);
    let nfs = nf_tree.iter().map(|nf| nf.to_bytes()).collect::<Vec<_>>();
    let (nf_root, _) = calculate_merkle_paths(0, &[], &nfs);
    store_prop(connection, "nf_root", &hex::encode(&nf_root))?;

    Ok(nf_root.to_vec())
}
