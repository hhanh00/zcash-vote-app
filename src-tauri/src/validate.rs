use anyhow::Result;
use orchard::{
    note::{ExtractedNoteCommitment, Nullifier},
    primitives::redpallas::{Binding, Signature, SpendAuth, VerificationKey},
    value::ValueCommitment,
    vote::{circuit::Instance, proof::Proof, BallotCircuit as Circuit, ElectionDomain},
    Anchor,
};
use std::sync::Mutex;

use bip0039::Mnemonic;
use tauri::State;
use zcash_address::unified::Encoding;
use zcash_vote::{ballot::{Ballot, BallotWitnesses}, Election};

use crate::{
    as_byte256, is_ok, state::AppState, vote::VK
};

#[tauri::command]
pub fn validate_key(key: String) -> Result<bool, ()> {
    if Mnemonic::from_phrase(&key).is_ok() {
        return Ok(true);
    }
    if zcash_address::unified::Ufvk::decode(&key).is_ok() {
        return Ok(true);
    }
    Ok(false)
}

pub fn validate_ballot(ballot: String, state: State<Mutex<AppState>>) -> Result<(), String> {
    tauri_export!(state, _connection, {
        validate_ballot_inner(&ballot, &state.election)
    })
}

pub fn validate_ballot_inner(
    ballot: &str,
    election: &Election,
) -> Result<()> {
    let ballot: Ballot = serde_json::from_str(&ballot)?;
    let Ballot { data, witnesses } = ballot;
    let sighash = data.sighash()?;

    tracing::info!("Verify spending signatures if needed");
    if let Some(sp_signatures) = witnesses.sp_signatures {
        for (signature, action) in sp_signatures.into_iter().zip(data.actions.iter()) {
            let signature: [u8; 64] = signature.0.try_into().unwrap();
            let signature: Signature<SpendAuth> = signature.into();
            let rk = as_byte256(&action.rk);
            let rk: VerificationKey<SpendAuth> = rk.try_into().unwrap();
            rk.verify(&sighash, &signature)?;
        }
    } else if election.signature_required {
        anyhow::bail!("Signatures missing");
    }

    tracing::info!("Verify binding signature");
    let mut total_cv = ValueCommitment::derive_from_value(0);
    for action in data.actions.iter() {
        let cv_net = as_byte256(&action.cv_net);
        let cv_net = is_ok(ValueCommitment::from_bytes(&cv_net))?;
        total_cv = total_cv + &cv_net;
    }
    let cv: VerificationKey<Binding> = total_cv.to_bytes().try_into().unwrap();
    let binding_signature: [u8; 64] = witnesses.binding_signature.try_into().unwrap();
    let binding_signature: Signature<Binding> = binding_signature.into();
    cv.verify(&sighash, &binding_signature)?;

    let BallotWitnesses { proofs, .. } = witnesses;

    tracing::info!("Verify ZKP");
    for (proof, action) in proofs.into_iter().zip(data.actions.iter()) {
        let proof: Proof<Circuit> = Proof::new(proof.0);
        let domain = election.domain().0;
        let cmx_root = as_byte256(&data.anchors.cmx);
        let nf_root = as_byte256(&data.anchors.nf);
        let cv_net = as_byte256(&action.cv_net);
        let dnf = as_byte256(&action.nf);
        let rk = as_byte256(&action.rk);
        let cmx = as_byte256(&action.cmx);

        let instance = Instance::from_parts(
            Anchor::from_bytes(cmx_root).unwrap(),
            ValueCommitment::from_bytes(&cv_net).unwrap(),
            Nullifier::from_bytes(&dnf).unwrap(),
            rk.try_into().unwrap(),
            ExtractedNoteCommitment::from_bytes(&cmx).unwrap(),
            ElectionDomain(domain.clone()),
            Anchor::from_bytes(nf_root).unwrap(),
        );

        proof.verify(&VK, &[instance])?;
    }

    // TODO: Verify anchors

    Ok(())
}

pub fn handle_ballot(_ballot: &Ballot) -> Result<()> {
    // verify ballot
    // try decrypt outputs
    // detect & mark spends
    // update height
    // store cmx
    // calcualte & store cmx_root
    Ok(())
}

#[test]
pub fn test_handle_ballot() -> Result<()> {
    let home_dir = std::env::var("HOME").unwrap();
    let db_path = std::path::Path::new(&home_dir).join("Documents").join("NSM.db");
    let connection_manager = r2d2_sqlite::SqliteConnectionManager::file(db_path.to_string_lossy().to_string());
    let pool = r2d2::Pool::new(connection_manager).unwrap();
    let connection = pool.get()?;
    let election = zcash_vote::db::load_prop(&connection, "election")?.unwrap();
    let _election: Election = serde_json::from_str(&election)?;
    let mut ballot = String::new();
    std::io::Read::read_to_string(&mut std::fs::File::open("./src/ballot.json")?, &mut ballot)?;
    let ballot: Ballot = serde_json::from_str(&ballot)?;

    handle_ballot(&ballot)?;

    Ok(())
}
