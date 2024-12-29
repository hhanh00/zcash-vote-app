use crate::{
    address::VoteAddress, as_byte256, db::list_notes, decrypt::{to_fvk, to_sk}, trees::{calculate_merkle_paths, list_cmxs, list_nf_ranges}
};
use anyhow::{Error, Result};
use blake2b_simd::Params;
use orchard::{
    builder::SpendInfo,
    keys::{FullViewingKey, Scope, SpendAuthorizingKey, SpendValidatingKey, SpendingKey},
    note::{ExtractedNoteCommitment, Nullifier, RandomSeed, TransmittedNoteCiphertext},
    note_encryption::OrchardNoteEncryption,
    primitives::redpallas::{Binding, SigningKey, SpendAuth, VerificationKey},
    value::{NoteValue, ValueCommitTrapdoor, ValueCommitment},
    vote::{
        circuit::{Instance, VotePowerInfo},
        proof::Proof,
        BallotCircuit as Circuit, ElectionDomain, ProvingKey,
    },
    Anchor, Note,
};
use pasta_curves::{
    group::ff::{Field as _, PrimeField},
    Fp, Fq,
};
use rand_core::{CryptoRng, OsRng, RngCore};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{io::Write, sync::Mutex};
use zcash_note_encryption::{COMPACT_NOTE_SIZE, OUT_CIPHERTEXT_SIZE};

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
pub fn vote(address: String, amount: u64, state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    tauri_export!(state, connection, {
        let sk = to_sk(&state.key)?;
        let fvk = to_fvk(&state.key)?;
        let domain = state.election.domain();
        let signature_required = state.election.signature_required;
        let ballot = vote_inner(
            &connection,
            domain,
            signature_required,
            sk,
            &fvk,
            &address,
            amount,
            OsRng,
        )?;
        let ballot = serde_json::to_string(&ballot).unwrap();
        Ok::<_, Error>(ballot)
    })
}

pub fn vote_inner<R: RngCore + CryptoRng>(
    connection: &Connection,
    domain: ElectionDomain,
    signature_required: bool,
    sk: Option<SpendingKey>,
    fvk: &FullViewingKey,
    address: &str,
    amount: u64,
    mut rng: R,
) -> Result<Ballot> {
    // TODO: get anchors cmx_root and nf_root
    let nfs = list_nf_ranges(connection)?;
    let cmxs = list_cmxs(connection)?;

    let address = VoteAddress::decode(address)?.0;

    let notes = list_notes(connection, fvk)?;
    let mut total_value = 0;
    let mut inputs = vec![];
    for np in notes {
        if total_value >= amount {
            break;
        }
        println!("{:?}", np.0);
        inputs.push(np);
        total_value += np.0.value().inner();
    }
    let change = total_value - amount;

    let n_actions = inputs.len().min(2);
    let mut ballot_actions = vec![];
    let mut ballot_secrets = vec![];
    let mut total_rcv = ValueCommitTrapdoor::zero();
    for i in 0..n_actions {
        let (fvk, (spend, cmx_position)) = if i < inputs.len() {
            (fvk.clone(), inputs[i].clone())
        } else {
            let (_, fvk, note) = Note::dummy(&mut rng, None);
            (fvk, (note, 0))
        };

        let rho = spend.nullifier_domain(&fvk, domain.0);
        let output = match i {
            0 => {
                let rseed = RandomSeed::random(&mut rng, &rho);
                let vote_output =
                    Note::from_parts(address, NoteValue::from_raw(amount), rho, rseed).unwrap();
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

        let cv_net = spend.value() - output.value();
        let rcv = ValueCommitTrapdoor::random(&mut rng);
        total_rcv = total_rcv + &rcv;
        let cv_net = ValueCommitment::derive(cv_net, rcv.clone());

        // Derive from seed if available
        let alpha = Fq::random(&mut rng);
        let svk = SpendValidatingKey::from(fvk.clone());
        let rk = svk.randomize(&alpha);
        let sp_signkey = sk.map(|sk| {
            let spak = SpendAuthorizingKey::from(&sk);
            let sp_signkey = spak.randomize(&alpha);
            sp_signkey
        });

        let nf = spend.nullifier(&fvk);
        let nf = Fp::from_repr(nf.to_bytes()).unwrap();
        let position = nfs.binary_search(&nf);
        let nf_position = (match position {
            Ok(position) => position,
            Err(position) => position - 1,
        } & !1); // snap to even position, ie start of range
        let nf_start = nfs[nf_position];
        let dnf = spend.nullifier_domain(&fvk, domain.0);
        ballot_secrets.push(BallotActionSecret {
            fvk: fvk.clone(),
            spend_note: spend.clone(),
            output_note: output.clone(),
            rcv: rcv.clone(),
            alpha,
            sp_signkey,
            nf: Nullifier::from_bytes(&nf.to_repr()).unwrap(),
            nf_start: Nullifier::from_bytes(&nf_start.to_repr()).unwrap(),
            nf_position: nf_position as u32,
            cmx_position,
            cv_net: cv_net.clone(),
            rk: rk.clone(),
        });

        let cmx = output.commitment();
        let cmx = ExtractedNoteCommitment::from(cmx);

        let encryptor = OrchardNoteEncryption::new(None, output.clone(), address, [0u8; 512]);
        let encrypted_note = TransmittedNoteCiphertext {
            epk_bytes: encryptor.epk().to_bytes().0,
            enc_ciphertext: encryptor.encrypt_note_plaintext(),
            out_ciphertext: [0u8; OUT_CIPHERTEXT_SIZE],
        };
        let mut compact_enc = [0u8; COMPACT_NOTE_SIZE];
        compact_enc.copy_from_slice(&encrypted_note.enc_ciphertext[0..COMPACT_NOTE_SIZE]);

        let rk: [u8; 32] = rk.into();
        let ballot_action = BallotAction {
            cv_net: cv_net.to_bytes().to_vec(),
            rk: rk.to_vec(),
            nf: dnf.to_bytes().to_vec(),
            cmx: cmx.to_bytes().to_vec(),
            epk: encrypted_note.epk_bytes.to_vec(),
            enc: compact_enc.to_vec(),
        };
        println!("{}", serde_json::to_string_pretty(&ballot_action).unwrap());
        ballot_actions.push(ballot_action);
    }
    let ballot_data = BallotData {
        version: 1,
        domain: domain.0.to_repr().to_vec(),
        actions: ballot_actions.clone(),
    };
    let sighash = ballot_data.sighash()?;
    println!("sighash {}", hex::encode(&sighash));

    let sp_signatures = ballot_secrets
        .iter()
        .map(|s| {
            s.sp_signkey.as_ref().map(|sk| {
                let signature = sk.sign(&mut rng, &sighash);
                let signature_bytes: [u8; 64] = (&signature).into();
                VoteSignature(signature_bytes.to_vec())
            })
        })
        .collect::<Option<Vec<_>>>();
    if signature_required && sp_signatures.is_none() {
        anyhow::bail!("Signature required");
    }

    let bsk: SigningKey<Binding> = total_rcv.to_bytes().try_into().unwrap();
    let binding_signature = bsk.sign(&mut rng, &sighash);
    let binding_signature: [u8; 64] = (&binding_signature).into();
    let binding_signature = binding_signature.to_vec();
    println!("Signed");

    let nf_positions = ballot_secrets
        .iter()
        .map(|s| s.nf_position)
        .collect::<Vec<_>>();
    let (nf_root, nf_mps) = calculate_merkle_paths(0, &nf_positions, &nfs);

    let cmx_positions = ballot_secrets
        .iter()
        .map(|s| s.cmx_position)
        .collect::<Vec<_>>();
    let (cmx_root, cmx_mps) = calculate_merkle_paths(0, &cmx_positions, &cmxs);

    let mut proofs = vec![];
    for (((secret, public), cmx_mp), nf_mp) in ballot_secrets
        .iter()
        .zip(ballot_actions.iter())
        .zip(nf_mps.iter())
        .zip(cmx_mps.iter())
    {
        let instance = Instance::from_parts(
            Anchor::from_bytes(cmx_root.to_repr()).unwrap(),
            secret.cv_net.clone(),
            Nullifier::from_bytes(&as_byte256(&public.nf)).unwrap(),
            secret.rk.clone(),
            ExtractedNoteCommitment::from_bytes(&as_byte256(&public.cmx)).unwrap(),
            domain.clone(),
            Anchor::from_bytes(nf_root.to_repr()).unwrap(),
        );
        let vote_power = VotePowerInfo {
            dnf: Nullifier::from_bytes(&as_byte256(&public.nf)).unwrap(),
            nf_start: secret.nf_start,
            nf_path: nf_mp.to_orchard_merkle_tree(),
        };
        let spend_info = SpendInfo::new(
            secret.fvk.clone(),
            secret.spend_note,
            cmx_mp.to_orchard_merkle_tree(),
        )
        .unwrap();
        let circuit = Circuit::from_action_context_unchecked(
            vote_power,
            spend_info,
            secret.output_note,
            secret.alpha,
            secret.rcv.clone(),
        );

        println!("Proving");
        let proof =
            Proof::<Circuit>::create(&PK, &[circuit], std::slice::from_ref(&instance), &mut rng)?;
        let proof = proof.as_ref().to_vec();
        println!("{}", proof.len());
        proofs.push(VoteProof(proof));
    }

    // TODO: ZK Proofs
    let witnesses = BallotWitnesses {
        proofs,
        sp_signatures,
        binding_signature,
    };

    let ballot = Ballot {
        data: ballot_data,
        witnesses,
    };

    Ok(ballot)
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BallotAction {
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

impl BallotAction {
    pub fn write<W: Write>(&self, mut w: W) -> std::io::Result<()> {
        w.write_all(&self.cv_net)?;
        w.write_all(&self.rk)?;
        w.write_all(&self.nf)?;
        w.write_all(&self.cmx)?;
        w.write_all(&self.epk)?;
        w.write_all(&self.enc)?;
        Ok(())
    }
}

pub struct BallotActionSecret {
    pub fvk: FullViewingKey,
    pub rcv: ValueCommitTrapdoor,
    pub spend_note: Note,
    pub output_note: Note,
    pub alpha: Fq,
    pub sp_signkey: Option<SigningKey<SpendAuth>>,
    pub nf: Nullifier,
    pub nf_start: Nullifier,
    pub nf_position: u32,
    pub cmx_position: u32,
    pub cv_net: ValueCommitment,
    pub rk: VerificationKey<SpendAuth>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BallotData {
    pub version: u32,
    #[serde(with = "hex")] pub domain: Vec<u8>,
    pub actions: Vec<BallotAction>,
}

impl BallotData {
    pub fn sighash(&self) -> Result<Vec<u8>> {
        let mut buffer: Vec<u8> = vec![];
        self.write(&mut buffer)?;
        let sighash = Params::new()
            .hash_length(32)
            .personal(b"Zcash_VoteBallot")
            .hash(&buffer)
            .as_bytes()
            .to_vec();
        Ok(sighash)
    }

    pub fn write<W: Write>(&self, mut w: W) -> std::io::Result<()> {
        w.write_all(&self.version.to_le_bytes())?;
        let n_actions = self.actions.len() as u32;
        w.write_all(&n_actions.to_le_bytes())?;
        for a in self.actions.iter() {
            a.write(&mut w)?;
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct VoteProof(#[serde(with = "hex")] Vec<u8>);

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct VoteSignature(#[serde(with = "hex")] Vec<u8>);

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BallotWitnesses {
    pub proofs: Vec<VoteProof>,
    pub sp_signatures: Option<Vec<VoteSignature>>,
    #[serde(with = "hex")]
    pub binding_signature: Vec<u8>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Ballot {
    pub data: BallotData,
    pub witnesses: BallotWitnesses,
}

lazy_static::lazy_static! {
    pub static ref PK: ProvingKey<Circuit> = ProvingKey::build();
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use orchard::keys::{FullViewingKey, Scope, SpendingKey};
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;
    use rand_core::OsRng;
    use zcash_primitives::constants::mainnet::COIN_TYPE;
    use zcash_vote::Election;

    use crate::{address::VoteAddress, state::AppState};

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
        let address = VoteAddress(address);
        let ballot = vote_inner(
            &connection,
            domain,
            false,
            None,
            &fvk,
            &address.to_string(),
            10000,
            OsRng,
        )
        .unwrap();
        println!("{}", serde_json::to_string_pretty(&ballot).unwrap());
    }
}
