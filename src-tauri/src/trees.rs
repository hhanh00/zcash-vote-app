use std::sync::Mutex;

use anyhow::{Error, Result};
use orchard::vote::calculate_merkle_paths;
use pasta_curves::group::ff::PrimeField as _;
use rusqlite::Connection;
use tauri::{ipc::Channel, State};
use zcash_vote::{
    db::{load_prop, store_prop},
    trees::{list_cmxs, list_nf_ranges},
};

use crate::state::AppState;

pub const TREE_CACHE_DIRTY_PROP: &str = "tree_cache_dirty";
pub const TREE_CACHE_VERSION_PROP: &str = "tree_cache_version";
pub const TREE_CACHE_LAST_HEIGHT_PROP: &str = "tree_cache_last_height";

pub fn is_tree_cache_dirty(connection: &Connection) -> Result<bool> {
    let dirty = load_prop(connection, TREE_CACHE_DIRTY_PROP)?.unwrap_or_else(|| "true".to_string());
    Ok(dirty != "false")
}

pub fn mark_tree_cache_dirty(connection: &Connection) -> Result<()> {
    store_prop(connection, TREE_CACHE_DIRTY_PROP, "true")?;
    let version = load_prop(connection, TREE_CACHE_VERSION_PROP)?
        .unwrap_or_else(|| "0".to_string())
        .parse::<u64>()
        .unwrap_or(0)
        + 1;
    store_prop(connection, TREE_CACHE_VERSION_PROP, &version.to_string())?;
    Ok(())
}

pub fn mark_tree_cache_clean(connection: &Connection) -> Result<()> {
    store_prop(connection, TREE_CACHE_DIRTY_PROP, "false")?;
    if let Some(height) = load_prop(connection, "height")? {
        store_prop(connection, TREE_CACHE_LAST_HEIGHT_PROP, &height)?;
    }
    Ok(())
}

pub fn ensure_tree_cache(connection: &Connection, channel: Option<&Channel<String>>) -> Result<()> {
    if load_prop(connection, "height")?.is_none() {
        return Ok(());
    }
    if !is_tree_cache_dirty(connection)?
        && load_prop(connection, "nf_root")?.is_some()
        && load_prop(connection, "cmx_root")?.is_some()
    {
        if let Some(ch) = channel {
            let _ = ch.send("Using cached vote trees".to_string());
        }
        return Ok(());
    }
    if let Some(ch) = channel {
        let _ = ch.send("Preparing nullifier and commitment trees...".to_string());
    }
    compute_nf_root(connection)?;
    if let Some(ch) = channel {
        let _ = ch.send("Nullifier tree ready".to_string());
    }
    compute_cmx_root(connection)?;
    if let Some(ch) = channel {
        let _ = ch.send("Commitment tree ready".to_string());
    }
    mark_tree_cache_clean(connection)?;
    Ok(())
}

#[tauri::command]
pub fn compute_roots(state: State<Mutex<AppState>>) -> Result<(), String> {
    tauri_export!(state, connection, {
        ensure_tree_cache(&connection, None)?;
        Ok::<_, Error>(())
    })
}

#[tauri::command]
pub async fn warmup_tree_cache(
    state: State<'_, Mutex<AppState>>,
    channel: Channel<String>,
) -> Result<(), String> {
    let rep = async {
        let (pool, enabled) = {
            let state = state.lock().unwrap();
            (state.pool.clone(), state.enable_tree_warmup)
        };
        if !enabled {
            let _ = channel.send("Tree warm-up skipped (feature disabled)".to_string());
            return Ok::<_, Error>(());
        }
        let connection = pool.get()?;
        ensure_tree_cache(&connection, Some(&channel))?;
        Ok::<_, Error>(())
    };
    rep.await.map_err(|e| e.to_string())
}

// TODO: Pass positions of spent notes and return their MP
pub fn compute_nf_root(connection: &Connection) -> Result<Vec<u8>> {
    let nf_tree = list_nf_ranges(connection)?;
    let (nf_root, _) = calculate_merkle_paths(0, &[], &nf_tree);
    store_prop(connection, "nf_root", &hex::encode(nf_root.to_repr()))?;

    Ok(nf_root.to_repr().to_vec())
}

// TODO: Retrieve frontier
pub fn compute_cmx_root(connection: &Connection) -> Result<Vec<u8>> {
    let cmx_tree = list_cmxs(connection)?;
    let (cmx_root, _) = calculate_merkle_paths(0, &[], &cmx_tree);
    store_prop(connection, "cmx_root", &hex::encode(cmx_root.to_repr()))?;

    Ok(cmx_root.to_repr().to_vec())
}
