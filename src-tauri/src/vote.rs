use crate::{db::list_notes, decrypt::to_fvk};
use anyhow::{Error, Result};
use orchard::{
    keys::{FullViewingKey, Scope, SpendValidatingKey},
    note::{ExtractedNoteCommitment, RandomSeed, TransmittedNoteCiphertext},
    note_encryption::OrchardNoteEncryption,
    value::{NoteValue, ValueCommitTrapdoor, ValueCommitment},
    vote::ElectionDomain,
    Address, Note,
};
use pasta_curves::{group::ff::Field as _, Fq};
use rand_core::{CryptoRng, OsRng, RngCore};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use zcash_note_encryption::{COMPACT_NOTE_SIZE, OUT_CIPHERTEXT_SIZE};
use zcash_vote::CandidateChoice;

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
pub fn vote(candidate: u16, amount: u64, state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    tauri_export!(state, connection, {
        let fvk = to_fvk(&state.key)?;
        let domain = state.election.domain();
        let candidate = &state.election.candidates[candidate as usize];
        vote_inner(&connection, domain, &fvk, candidate, amount, OsRng)
    })
}

pub fn vote_inner<R: RngCore + CryptoRng>(
    connection: &Connection,
    domain: ElectionDomain,
    fvk: &FullViewingKey,
    candidate: &CandidateChoice,
    amount: u64,
    mut rng: R,
) -> Result<()> {
    // TODO: get anchors cmx_root and nf_root

    let candidate = Address::from_raw_address_bytes(&candidate.address).unwrap();

    let notes = list_notes(connection, fvk)?;
    let mut total_value = 0;
    let mut inputs = vec![];
    for n in notes {
        if total_value >= amount {
            break;
        }
        println!("{:?}", n);
        inputs.push(n);
        total_value += n.value().inner();
    }
    let change = total_value - amount;

    let n_actions = inputs.len().min(2);
    let mut total_rcv = ValueCommitTrapdoor::zero();
    for i in 0..n_actions {
        let (fvk, spend) = if i < inputs.len() {
            (fvk.clone(), inputs[i].clone())
        } else {
            let (_, fvk, note) = Note::dummy(&mut rng, None);
            (fvk, note)
        };

        let rho = spend.nullifier_domain(&fvk, domain.0);
        let output = match i {
            0 => {
                let rseed = RandomSeed::random(&mut rng, &rho);
                let vote_output =
                    Note::from_parts(candidate, NoteValue::from_raw(amount), rho, rseed).unwrap();
                vote_output
            }
            1 => {
                let rseed = RandomSeed::random(&mut rng, &rho);
                let self_address = fvk.address_at(0u64, Scope::External);
                let change_output =
                    Note::from_parts(self_address, NoteValue::from_raw(change), rho, rseed)
                        .unwrap();
                change_output
            }
            _ => {
                let (_, _, dummy_output) = Note::dummy(&mut rng, Some(rho));
                dummy_output
            }
        };
        let dnf = spend.nullifier_domain(&fvk, domain.0);

        let cv_net = spend.value() - output.value();
        let rcv = ValueCommitTrapdoor::random(&mut rng);
        total_rcv = total_rcv + &rcv;
        let cv_net = ValueCommitment::derive(cv_net, rcv.clone());

        // Derive from seed if available
        let alpha = Fq::random(&mut rng);
        let svk = SpendValidatingKey::from(fvk);
        let rk = svk.randomize(&alpha);

        let cmx = output.commitment();
        let cmx = ExtractedNoteCommitment::from(cmx);

        let encryptor = OrchardNoteEncryption::new(None, output.clone(), candidate, [0u8; 512]);
        let encrypted_note = TransmittedNoteCiphertext {
            epk_bytes: encryptor.epk().to_bytes().0,
            enc_ciphertext: encryptor.encrypt_note_plaintext(),
            out_ciphertext: [0u8; OUT_CIPHERTEXT_SIZE],
        };
        let mut compact_enc = [0u8; COMPACT_NOTE_SIZE];
        compact_enc.copy_from_slice(&encrypted_note.enc_ciphertext[0..COMPACT_NOTE_SIZE]);

        let rk: [u8; 32] = rk.into();
        let ballot_data = BallotData {
            cv_net: cv_net.to_bytes().to_vec(),
            rk: rk.to_vec(),
            nf: dnf.to_bytes().to_vec(),
            cmx: cmx.to_bytes().to_vec(),
            epk: encrypted_note.epk_bytes.to_vec(),
            enc: compact_enc.to_vec(),
        };
        println!("{}", serde_json::to_string_pretty(&ballot_data).unwrap());
    }

    Ok(())
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BallotData {
    #[serde(with = "hex")]
    pub cv_net: Vec<u8>,
    #[serde(with = "hex")]
    pub rk: Vec<u8>,
    #[serde(with = "hex")]
    pub nf: Vec<u8>,
    #[serde(with = "hex")]
    pub cmx: Vec<u8>,
    #[serde(with = "hex")]
    pub epk: Vec<u8>,
    #[serde(with = "hex")]
    pub enc: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use orchard::keys::{FullViewingKey, Scope, SpendingKey};
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use rand_core::OsRng;
    use zcash_primitives::constants::mainnet::COIN_TYPE;
    use zcash_vote::{CandidateChoice, Election};

    use crate::state::AppState;

    use super::vote_inner;

    #[test]
    fn test_vote() {
        let home_dir = std::env::var("HOME").unwrap();
        let db_path = Path::new(&home_dir).join("Documents").join("NSM.db");
        let connection_manager =
            SqliteConnectionManager::file(db_path.to_string_lossy().to_string());
        let pool = Pool::new(connection_manager).unwrap();
        let state = AppState {
            url: "http://localhost:8080".to_string(),
            election: Election::default(),
            key: String::default(),
            pool,
        };
        let domain = state.election.domain();
        let connection = state.pool.get().unwrap();
        let sk = SpendingKey::from_zip32_seed(&[0u8; 64], COIN_TYPE, 0).unwrap();
        let fvk = FullViewingKey::from(&sk);
        let address = fvk.address_at(0u64, Scope::External);
        let candidate = CandidateChoice {
            address: address.to_raw_address_bytes(),
            choice: "".to_string(),
        };
        vote_inner(&connection, domain, &fvk, &candidate, 10000, OsRng).unwrap();
    }
}
