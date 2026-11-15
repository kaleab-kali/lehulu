//! One webhook so a host's server hears about changes without polling. Set WEBHOOK_URL (and WEBHOOK_SECRET).
//! Body: `{ "event": "...", "at": "...", "data": { ... } }`. The data holds ids and statuses only: never a
//! name, phone number, recording or support need. Header `X-Lehulu-Signature: sha256=<hex HMAC of the body>`.
//! Sent in the background with one retry; a host that is down never slows or breaks a learner's request.

use crate::routes::AppState;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::Duration;

pub fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC takes any key length");
    mac.update(body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
}

pub fn notify(st: &AppState, event: &'static str, data: serde_json::Value) {
    let url = st.cfg.webhook_url.trim().to_string();
    if url.is_empty() {
        return;
    }
    let secret = st.cfg.webhook_secret.clone();
    let body =
        serde_json::json!({ "event": event, "at": chrono::Utc::now().to_rfc3339(), "data": data })
            .to_string();
    tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            Ok(c) => c,
            Err(e) => return tracing::warn!(error = %e, "webhook client"),
        };
        for attempt in 1..=2 {
            let mut req = client
                .post(&url)
                .header("content-type", "application/json")
                .header("x-lehulu-event", event)
                .body(body.clone());
            if !secret.is_empty() {
                req = req.header("x-lehulu-signature", sign(&secret, body.as_bytes()));
            }
            match req.send().await {
                Ok(r) if r.status().is_success() => return,
                Ok(r) => tracing::warn!(status = %r.status(), attempt, event, "webhook refused"),
                Err(e) => tracing::warn!(error = %e, attempt, event, "webhook failed"),
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn signature_is_hmac_sha256() {
        // RFC 4231 test case 2.
        assert_eq!(
            super::sign("Jefe", b"what do ya want for nothing?"),
            "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
    }
}
