use crate::{
    address::VoteAddress,
    as_byte256,
    db::list_notes,
};
use anyhow::{Error, Result};
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
        BallotCircuit as Circuit, ElectionDomain,
    },
    Anchor, Note,
};
use pasta_curves::{
    group::ff::{Field as _, PrimeField},
    Fp, Fq,
};
use rand_core::{CryptoRng, RngCore};
use rusqlite::Connection;
use zcash_vote::{ballot::{Ballot, BallotAction, BallotActionSecret, BallotAnchors, BallotData, BallotWitnesses, VoteProof, VoteSignature}, db::load_prop, decrypt::{to_fvk, to_sk}, trees::{calculate_merkle_paths, list_cmxs, list_nf_ranges}, validate::{PK, VK}};
use std::sync::Mutex;
use zcash_note_encryption::{COMPACT_NOTE_SIZE, OUT_CIPHERTEXT_SIZE};

use tauri::State;

use crate::state::AppState;

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
    address: String,
    amount: u64,
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    tauri_export!(state, connection, {
        let sk = to_sk(&state.key)?;
        let fvk = to_fvk(&state.key)?;
        let domain = state.election.domain();
        let signature_required = state.election.signature_required;
        let mut rng = rand_core::OsRng;
        let ballot = vote_inner(
            &connection,
            domain,
            signature_required,
            sk,
            &fvk,
            &address,
            amount,
            &mut rng,
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
        inputs.push(np);
        total_value += np.0.value().inner();
    }
    let change = total_value - amount;

    let n_actions = inputs.len().max(2);
    let mut ballot_actions = vec![];
    let mut ballot_secrets = vec![];
    let mut total_rcv = ValueCommitTrapdoor::zero();
    for i in 0..n_actions {
        let (sk, fvk, (spend, cmx_position)) = if i < inputs.len() {
            (sk.clone(), fvk.clone(), inputs[i].clone())
        } else {
            let (sk, fvk, note) = Note::dummy(&mut rng, None);
            (Some(sk), fvk, (note, 0))
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
            nf: rho.to_bytes().to_vec(),
            cmx: cmx.to_bytes().to_vec(),
            epk: encrypted_note.epk_bytes.to_vec(),
            enc: compact_enc.to_vec(),
        };
        ballot_actions.push(ballot_action);
    }

    let nf_positions = ballot_secrets
        .iter()
        .map(|s| s.nf_position)
        .collect::<Vec<_>>();
    let (nf_root, nf_mps) = calculate_merkle_paths(0, &nf_positions, &nfs);
    for (a, b) in nf_mps.iter().zip(nf_positions.iter()) {
        assert_eq!(a.position, *b);
    }

    let cmx_positions = ballot_secrets
        .iter()
        .map(|s| s.cmx_position)
        .collect::<Vec<_>>();
    let (cmx_root, cmx_mps) = calculate_merkle_paths(0, &cmx_positions, &cmxs);

    let mut proofs = vec![];
    for (((secret, public), cmx_mp), nf_mp) in ballot_secrets
        .iter()
        .zip(ballot_actions.iter())
        .zip(cmx_mps.iter())
        .zip(nf_mps.iter())
    {
        let cmx = ExtractedNoteCommitment::from_bytes(&as_byte256(&public.cmx)).unwrap();
        let instance = Instance::from_parts(
            Anchor::from_bytes(cmx_root.to_repr()).unwrap(),
            secret.cv_net.clone(),
            Nullifier::from_bytes(&as_byte256(&public.nf)).unwrap(),
            secret.rk.clone(),
            cmx,
            domain.clone(),
            Anchor::from_bytes(nf_root.to_repr()).unwrap(),
        );
        assert_eq!(
            secret.nf_start,
            Nullifier::from_bytes(&nfs[secret.nf_position as usize].to_repr()).unwrap()
        );
        assert_eq!(nf_mp.position, secret.nf_position);
        let nf_path = nf_mp.to_orchard_merkle_tree();
        let vote_power = VotePowerInfo {
            dnf: Nullifier::from_bytes(&as_byte256(&public.nf)).unwrap(),
            nf_start: secret.nf_start,
            nf_path,
        };
        let cmx_path = cmx_mp.to_orchard_merkle_tree();
        let spend_info = SpendInfo::new(secret.fvk.clone(), secret.spend_note, cmx_path).unwrap();
        let circuit = Circuit::from_action_context_unchecked(
            vote_power,
            spend_info,
            secret.output_note,
            secret.alpha,
            secret.rcv.clone(),
        );

        tracing::info!("Proving");
        let proof =
            Proof::<Circuit>::create(&PK, &[circuit], std::slice::from_ref(&instance), &mut rng)?;
        proof.verify(&VK, &[instance])?;
        let proof = proof.as_ref().to_vec();
        proofs.push(VoteProof(proof));
    }

    let anchors = BallotAnchors {
        nf: nf_root.to_repr().to_vec(),
        cmx: cmx_root.to_repr().to_vec(),
    };

    let ballot_data = BallotData {
        version: 1,
        domain: domain.0.to_repr().to_vec(),
        actions: ballot_actions.clone(),
        anchors,
    };
    let sighash = ballot_data.sighash()?;

    let sp_signatures = ballot_secrets
        .iter()
        .zip(ballot_actions.iter())
        .map(|(s, a)| {
            s.sp_signkey.as_ref().map(|sk| {
                let signature = sk.sign(&mut rng, &sighash);
                let signature_bytes: [u8; 64] = (&signature).into();
                let rk = as_byte256(&a.rk);
                let rk: VerificationKey<SpendAuth> = rk.try_into().unwrap();
                rk.verify(&sighash, &signature).unwrap();
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
