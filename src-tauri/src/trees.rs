use std::sync::Mutex;

use anyhow::{Error, Result};
use incrementalmerkletree::{Altitude, Hashable};
use pasta_curves::{group::ff::PrimeField as _, Fp};
use rusqlite::Connection;
use orchard::tree::{MerkleHashOrchard, MerklePath as OrchardMerklePath};
use tauri::State;
use zcash_vote::DEPTH;

use crate::{db::{load_prop, store_prop}, state::AppState};

#[tauri::command]
pub fn compute_roots(state: State<Mutex<AppState>>) -> Result<(), String> {
    tauri_export!(state, connection, {
        if load_prop(&connection, "height")?.is_some() {
            compute_nf_root(&connection)?;
            compute_cmx_root(&connection)?;
        }
        Ok::<_, Error>(())
    })
}

pub fn list_nf_ranges(connection: &Connection) -> Result<Vec<Fp>> {
    let mut s = connection.prepare("SELECT hash FROM nullifiers")?;
    let rows = s.query_map([], |r| {
        let v = r.get::<_, [u8; 32]>(0)?;
        let v = Fp::from_repr(v).unwrap();
        Ok(v)
    })?;
    let mut nfs = rows.collect::<Result<Vec<_>, _>>()?;
    nfs.sort();
    let nf_tree = build_nf_ranges(nfs);
    Ok(nf_tree)
}

// TODO: Pass positions of spent notes and return their MP
pub fn compute_nf_root(connection: &Connection) -> Result<Vec<u8>> {
    let nf_tree = list_nf_ranges(connection)?;
    let (nf_root, _) = calculate_merkle_paths(0, &[], &nf_tree);
    store_prop(connection, "nf_root", &hex::encode(&nf_root.to_repr()))?;

    Ok(nf_root.to_repr().to_vec())
}

pub fn list_cmxs(connection: &Connection) -> Result<Vec<Fp>> {
    let mut s = connection.prepare("SELECT hash FROM cmxs")?;
    let rows = s.query_map([], |r| {
        let v = r.get::<_, [u8; 32]>(0)?;
        let v = Fp::from_repr(v).unwrap();
        Ok(v)
    })?;
    let cmx_tree = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(cmx_tree)
}

// TODO: Retrieve frontier
pub fn compute_cmx_root(connection: &Connection) -> Result<Vec<u8>> {
    let cmx_tree = list_cmxs(connection)?;
    let (cmx_root, _) = calculate_merkle_paths(0, &[], &cmx_tree);
    store_prop(connection, "cmx_root", &hex::encode(&cmx_root.to_repr()))?;

    Ok(cmx_root.to_repr().to_vec())
}

pub fn build_nf_ranges(nfs: impl IntoIterator<Item = Fp>) -> Vec<Fp> {
    let mut prev = Fp::zero();
    let mut leaves = vec![];
    for r in nfs {
        // Skip empty ranges when nullifiers are consecutive
        // (with statistically negligible odds)
        if prev < r {
            // Ranges are inclusive of both ends
            let a = prev;
            let b = r - Fp::one();

            leaves.push(a);
            leaves.push(b);
        }
        prev = r + Fp::one();
    }
    if prev != Fp::zero() {
        // overflow when a nullifier == max
        let a = prev;
        let b = Fp::one().neg();

        leaves.push(a);
        leaves.push(b);
    }
    leaves
}

pub fn calculate_merkle_paths(
    position_offset: usize,
    positions: &[u32],
    hashes: &[Fp],
) -> (Fp, Vec<MerklePath>) {
    let mut paths = positions
        .iter()
        .map(|p| {
            let rel_p = *p as usize - position_offset;
            MerklePath {
                value: hashes[rel_p],
                position: rel_p as u32,
                path: [Fp::default(); DEPTH],
                p: rel_p,
            }
        })
        .collect::<Vec<_>>();
    let mut er = Fp::from(2);
    let mut layer = Vec::with_capacity(positions.len() + 2);
    for i in 0..32 {
        if i == 0 {
            layer.extend(hashes);
            if layer.is_empty() {
                layer.push(er);
            }
            if layer.len() & 1 == 1 {
                layer.push(er);
            }
        }

        for path in paths.iter_mut() {
            let idx = path.p;
            if idx & 1 == 1 {
                path.path[i] = layer[idx as usize - 1];
            } else {
                path.path[i] = layer[idx as usize + 1];
            }
            path.p /= 2;
        }

        let pairs = layer.len() / 2;
        let mut next_layer = Vec::with_capacity(pairs + 2);

        for j in 0..pairs {
            let h = cmx_hash(i as u8, layer[j * 2], layer[j * 2 + 1]);
            next_layer.push(h);
        }

        er = cmx_hash(i as u8, er, er);
        if next_layer.len() & 1 == 1 {
            next_layer.push(er);
        }

        std::mem::swap(&mut layer, &mut next_layer);
    }

    let root = layer[0];
    (root, paths)
}

#[derive(Clone, Default)]
pub struct MerklePath {
    pub value: Fp,
    pub position: u32,
    pub path: [Fp; DEPTH],
    p: usize,
}

impl MerklePath {
    pub fn to_orchard_merkle_tree(&self) -> OrchardMerklePath {
        let auth_path = self.path.map(|h| MerkleHashOrchard::from_bytes(&h.to_repr()).unwrap());
        let omp = OrchardMerklePath::from_parts(self.position,
            auth_path);
        omp
    }
}


pub fn cmx_hash(level: u8, left: Fp, right: Fp) -> Fp {
    let left = MerkleHashOrchard::from_base(left);
    let right = MerkleHashOrchard::from_base(right);
    let h = MerkleHashOrchard::combine(Altitude::from(level), &left, &right);
    h.inner()
}
