use std::sync::Mutex;

use anyhow::{Error, Result};
use rusqlite::Connection;
use tauri::{ipc::Channel, State};
use tonic::Request;

use crate::{rpc::{self, compact_tx_streamer_client::CompactTxStreamerClient, BlockId, CompactBlock}, state::AppState};

#[tauri::command]
pub async fn download_reference_data(state: State<'_, Mutex<AppState>>, channel: Channel<u32>) -> Result<(), ()> {
    let (connection, start, end) = {
        let s = state.lock().unwrap();
        let connection = s.pool.get().unwrap();
        let e = &s.election;
        (connection, e.start_height as u64, e.end_height as u64)
    };

    tokio::spawn(async move {
        let mut client = CompactTxStreamerClient::connect("https://zec.rocks").await?;
        let mut blocks = client.get_block_range(Request::new(rpc::BlockRange {
            start: Some(BlockId { height: start + 1, hash: vec![] }),
            end: Some(BlockId { height: end, hash: vec![] }),
            spam_filter_threshold: 0 })).await?.into_inner();
        while let Some(block) = blocks.message().await? {
            let height = block.height as u32;
            if height % 1000 == 0 || height == end as u32 {
                channel.send(block.height as u32)?;
            }
            handle_block(&connection, block)?;
        }

        Ok::<_, Error>(())
    });

    Ok(())
}

fn handle_block(connection: &Connection, block: CompactBlock) -> Result<()> {
    let mut s = connection.prepare_cached(
        "INSERT INTO cmxs(hash) VALUES (?1)")?;
    for tx in block.vtx {
        for a in tx.actions {
            let cmx = a.cmx;
            s.execute([&cmx])?;
        }
    }

    Ok(())
}
