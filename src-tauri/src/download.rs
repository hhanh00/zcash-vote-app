use std::sync::Mutex;

use anyhow::{Error, Result};
use orchard::{keys::{FullViewingKey, PreparedIncomingViewingKey, Scope}, vote::ElectionDomain};
use rusqlite::{params, Connection};
use tauri::{ipc::Channel, State};
use tonic::Request;

use crate::{
    db::store_prop,
    decrypt::{to_fvk, try_decrypt},
    rpc::{self, compact_tx_streamer_client::CompactTxStreamerClient, BlockId, CompactBlock},
    state::AppState,
};

#[tauri::command]
pub async fn download_reference_data(
    state: State<'_, Mutex<AppState>>,
    channel: Channel<u32>,
) -> Result<(), String> {
    let (connection, fvk, pivk, domain, start, end) = {
        let s = state.lock().unwrap();
        let fvk = to_fvk(&s.key).map_err(|e| e.to_string())?;
        let ivk = fvk.to_ivk(Scope::External);
        let pivk = PreparedIncomingViewingKey::new(&ivk);
        let connection = s.pool.get().unwrap();
        let e = &s.election;
        let domain = e.domain();
        (
            connection,
            fvk,
            pivk,
            domain,
            e.start_height as u64,
            e.end_height as u64,
        )
    };

    let task = tokio::spawn(async move {
        let mut client = CompactTxStreamerClient::connect("https://zec.rocks").await?;
        let mut blocks = client
            .get_block_range(Request::new(rpc::BlockRange {
                start: Some(BlockId {
                    height: start + 1,
                    hash: vec![],
                }),
                end: Some(BlockId {
                    height: end,
                    hash: vec![],
                }),
                spam_filter_threshold: 0,
            }))
            .await?
            .into_inner();
        let mut position = 0usize;
        while let Some(block) = blocks.message().await? {
            let height = block.height as u32;
            if height % 1000 == 0 || height == end as u32 {
                store_prop(&connection, "height", &height.to_string())?;
                channel.send(block.height as u32)?;
            }
            let inc_position = handle_block(&connection, &domain, &fvk, &pivk, position, block)?;
            position += inc_position;
        }

        Ok::<_, Error>(())
    });

    tokio::spawn(async move {
        match task.await {
            Ok(Ok(_)) => println!("Task completed successfully."),
            Ok(Err(err)) => eprintln!("Task returned an error: {}", err),
            Err(err) => eprintln!("Task panicked: {:?}", err),
        }
    }).await.unwrap();

    Ok(())
}

fn handle_block(
    connection: &Connection,
    domain: &ElectionDomain,
    fvk: &FullViewingKey,
    pivk: &PreparedIncomingViewingKey,
    start_position: usize,
    block: CompactBlock,
) -> Result<usize> {
    let mut s_cmx = connection.prepare_cached("INSERT INTO cmxs(hash) VALUES (?1)")?;
    let mut position = 0usize;
    for tx in block.vtx {
        for a in tx.actions {
            if let Some(note) = try_decrypt(pivk, &a)? {
                let p = start_position + position;
                let height = block.height;
                let txid = &tx.hash;
                let value = note.value().inner();
                let rseed = note.rseed().as_bytes();
                let nf = note.nullifier(fvk).to_bytes();
                let domain_nf = note
                    .nullifier_domain(fvk, domain.0)
                    .to_bytes();
                let rho = note.rho().to_bytes();
                connection.execute(
                    "INSERT INTO notes
                    (position, height, txid, value, rseed, nf, dnf, rho, spent)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)",
                    params![p, height, txid, value, rseed, nf, domain_nf, rho],
                )?;

                println!("{:?}", note);
            }
            let cmx = a.cmx;
            s_cmx.execute([&cmx])?;
            position += 1;
        }
    }

    Ok(position)
}
