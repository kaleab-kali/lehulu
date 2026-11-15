//! Who is calling. Tokens are 32 random bytes sent as `Authorization: Bearer <token>`; only their SHA-256
//! is stored, so a copy of the database cannot be used to sign in.
//!
//! - Learners sign in with their phone number and a 6-digit SMS code, and get a token at sign-up.
//!   Learner sessions never time out (project rule: no time limits); they end on sign-out or deletion.
//! - Partners and employers use OAuth 2.0 client credentials (`POST /oauth/token`); tokens last 12 hours.
//! - Link tokens are one-time passes a host platform exchanges at `POST /v1/link` (account linking).
//!
//! ID numbers are encrypted at rest with AES-256-GCM (F21).

use crate::{
    config::Config,
    error::{ApiError, ApiResult},
    routes::AppState,
};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

pub const STAFF_TOKEN_HOURS: i64 = 12;
pub const LINK_TOKEN_HOURS: i64 = 1;

pub fn random_token() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    hex::encode(b)
}

pub fn hash(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}

/// A client secret for a partner or employer, shown once (see `lehulu create-client`).
pub fn new_secret() -> String {
    random_token()
}

/// The demo secret for a seeded partner or employer, only accepted when DEMO_MODE=true.
pub fn demo_secret(id: &str) -> String {
    format!("{id}-demo")
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn expired(at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(at)
        .map(|t| t < chrono::Utc::now())
        .unwrap_or(true)
}

pub fn in_hours(h: i64) -> String {
    (chrono::Utc::now() + chrono::Duration::hours(h)).to_rfc3339()
}

#[derive(Clone, Debug, PartialEq)]
pub enum Principal {
    Learner(String),
    Partner(String),
    Employer(String),
}

/// Create a token. `hours = None` never expires (learner sessions).
pub async fn issue(
    pool: &SqlitePool,
    kind: &str,
    subject: &str,
    hours: Option<i64>,
) -> ApiResult<String> {
    let token = random_token();
    sqlx::query(
        "INSERT INTO access_tokens (token_hash, kind, subject, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(hash(&token))
    .bind(kind)
    .bind(subject)
    .bind(hours.map(in_hours))
    .bind(now())
    .execute(pool)
    .await?;
    Ok(token)
}

pub async fn revoke(pool: &SqlitePool, token_hash: &str) -> ApiResult<()> {
    sqlx::query("DELETE FROM access_tokens WHERE token_hash = ?")
        .bind(token_hash)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn revoke_all(pool: &SqlitePool, kind: &str, subject: &str) -> ApiResult<()> {
    sqlx::query("DELETE FROM access_tokens WHERE kind = ? AND subject = ?")
        .bind(kind)
        .bind(subject)
        .execute(pool)
        .await?;
    Ok(())
}

/// Use a one-time link token: returns the learner id and deletes the token.
pub async fn take_link_token(pool: &SqlitePool, token: &str) -> ApiResult<Option<String>> {
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "DELETE FROM access_tokens WHERE token_hash = ? AND kind = 'link' RETURNING subject, expires_at",
    )
    .bind(hash(token))
    .fetch_optional(pool)
    .await?;
    Ok(match row {
        Some((subject, Some(exp))) if !expired(&exp) => Some(subject),
        _ => None,
    })
}

fn bearer(parts: &Parts) -> Option<&str> {
    parts
        .headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|t| !t.is_empty())
}

async fn lookup(pool: &SqlitePool, token_hash: &str) -> ApiResult<Option<Principal>> {
    let row: Option<(String, String, Option<String>)> =
        sqlx::query_as("SELECT kind, subject, expires_at FROM access_tokens WHERE token_hash = ?")
            .bind(token_hash)
            .fetch_optional(pool)
            .await?;
    let Some((kind, subject, expires_at)) = row else {
        return Ok(None);
    };
    if expires_at.as_deref().is_some_and(expired) {
        revoke(pool, token_hash).await?;
        return Ok(None);
    }
    Ok(match kind.as_str() {
        "learner" => {
            // Used by the retention job: accounts are kept while they are used.
            sqlx::query("UPDATE learners SET last_active_at = ? WHERE id = ?")
                .bind(now())
                .bind(&subject)
                .execute(pool)
                .await?;
            Some(Principal::Learner(subject))
        }
        "partner" => Some(Principal::Partner(subject)),
        "employer" => Some(Principal::Employer(subject)),
        _ => None, // link tokens are not bearer tokens
    })
}

/// Anyone; `Some` when a valid token was sent. An invalid or expired token is an error, not anonymous.
pub struct MaybeAuth(pub Option<Principal>);

impl FromRequestParts<AppState> for MaybeAuth {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, st: &AppState) -> Result<Self, ApiError> {
        match bearer(parts) {
            None => Ok(Self(None)),
            Some(t) => match lookup(&st.pool, &hash(t)).await? {
                Some(p) => Ok(Self(Some(p))),
                None => Err(ApiError::Unauthorized),
            },
        }
    }
}

/// A signed-in learner. `token_hash` lets "sign out" end only this device's session.
pub struct LearnerAuth {
    pub id: String,
    pub token_hash: String,
}

impl FromRequestParts<AppState> for LearnerAuth {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, st: &AppState) -> Result<Self, ApiError> {
        let t = bearer(parts).ok_or(ApiError::Unauthorized)?;
        let token_hash = hash(t);
        match lookup(&st.pool, &token_hash).await? {
            Some(Principal::Learner(id)) => Ok(Self { id, token_hash }),
            Some(_) => Err(ApiError::Forbidden),
            None => Err(ApiError::Unauthorized),
        }
    }
}

macro_rules! staff_extractor {
    ($name:ident, $variant:ident) => {
        pub struct $name(pub String);
        impl FromRequestParts<AppState> for $name {
            type Rejection = ApiError;
            async fn from_request_parts(
                parts: &mut Parts,
                st: &AppState,
            ) -> Result<Self, ApiError> {
                let t = bearer(parts).ok_or(ApiError::Unauthorized)?;
                match lookup(&st.pool, &hash(t)).await? {
                    Some(Principal::$variant(id)) => Ok(Self(id)),
                    Some(_) => Err(ApiError::Forbidden),
                    None => Err(ApiError::Unauthorized),
                }
            }
        }
    };
}
staff_extractor!(PartnerAuth, Partner);
staff_extractor!(EmployerAuth, Employer);

// ---------- encryption of ID numbers at rest ----------

/// The data key: DATA_KEY, else the key file, else a new key saved to the key file.
pub fn load_cipher(cfg: &Config) -> Aes256Gcm {
    let from_hex = |s: &str| hex::decode(s.trim()).ok().filter(|b| b.len() == 32);
    let key = from_hex(&cfg.data_key)
        .or_else(|| {
            std::fs::read_to_string(&cfg.key_file)
                .ok()
                .and_then(|s| from_hex(&s))
        })
        .unwrap_or_else(|| {
            let mut b = vec![0u8; 32];
            rand::thread_rng().fill_bytes(&mut b);
            if let Some(dir) = std::path::Path::new(&cfg.key_file).parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Err(e) = std::fs::write(&cfg.key_file, hex::encode(&b)) {
                tracing::warn!(error = %e, "could not save the data key; set DATA_KEY");
            }
            b
        });
    Aes256Gcm::new_from_slice(&key).expect("a 32-byte key")
}

pub fn encrypt(cipher: &Aes256Gcm, plain: &str) -> String {
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
        .expect("AES-GCM encryption does not fail for short input");
    format!("v1:{}{}", hex::encode(nonce), hex::encode(ct))
}

/// Values saved before encryption existed are returned as they are.
pub fn decrypt(cipher: &Aes256Gcm, stored: &str) -> Option<String> {
    let Some(rest) = stored.strip_prefix("v1:") else {
        return Some(stored.to_string());
    };
    let bytes = hex::decode(rest).ok()?;
    if bytes.len() < 13 {
        return None;
    }
    let (nonce, ct) = bytes.split_at(12);
    let plain = cipher.decrypt(Nonce::from_slice(nonce), ct).ok()?;
    String::from_utf8(plain).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_numbers_round_trip_and_are_not_stored_in_clear() {
        let cfg = Config::for_tests();
        let c = load_cipher(&cfg);
        let s = encrypt(&c, "AA-123456");
        assert!(!s.contains("123456"));
        assert_eq!(decrypt(&c, &s).as_deref(), Some("AA-123456"));
        assert_eq!(decrypt(&c, "legacy").as_deref(), Some("legacy"));
        // The same key is read back from the key file on the next start.
        let again = load_cipher(&cfg);
        assert_eq!(decrypt(&again, &s).as_deref(), Some("AA-123456"));
    }
}
