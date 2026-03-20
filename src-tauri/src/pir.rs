use anyhow::{anyhow, Result};
use reqwest::Client;
use rusqlite::Connection;

async fn query_nullifier(client: &Client, base_url: &str, nf_hex: &str) -> Result<bool> {
    let normalized = base_url.trim_end_matches('/');
    let urls = [
        format!("{normalized}/nullifier/{nf_hex}"),
        format!("{normalized}/check/{nf_hex}"),
    ];
    for url in urls {
        let rep = client.get(url).send().await?;
        if !rep.status().is_success() {
            continue;
        }
        let body = rep.text().await?;
        let body = body.trim().to_ascii_lowercase();
        if body == "true" {
            return Ok(true);
        }
        if body == "false" {
            return Ok(false);
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) {
            for key in ["exists", "present", "included", "spent", "found"] {
                if let Some(v) = value.get(key).and_then(|v| v.as_bool()) {
                    return Ok(v);
                }
            }
        }
    }
    Err(anyhow!("PIR service response did not contain nullifier status"))
}

pub async fn validate_unspent_notes_with_pir(connection: &Connection, base_url: &str) -> Result<()> {
    let mut stmt = connection.prepare("SELECT dnf FROM notes WHERE spent IS NULL LIMIT 64")?;
    let rows = stmt.query_map([], |r| r.get::<_, Vec<u8>>(0))?;
    let client = Client::new();
    for row in rows {
        let dnf = row?;
        let nf_hex = hex::encode(dnf);
        if query_nullifier(&client, base_url, &nf_hex).await? {
            anyhow::bail!("PIR precheck found already-spent nullifier; run sync and retry");
        }
    }
    Ok(())
}
