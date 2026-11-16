//! Signing in.
//! - Partners and employers: OAuth 2.0 client credentials at `POST /oauth/token`.
//! - Learners: phone number + 6-digit code by SMS (`/v1/auth/code`, `/v1/auth/verify`). Shared phones are
//!   normal in Ethiopia, so one phone may hold several accounts; the learner then chooses theirs.
//! - Host platforms: `POST /v1/link` turns the one-time link token from sign-up into the learner's identity.

use crate::{
    auth::{self, LearnerAuth},
    domain::validate,
    error::{ApiError, ApiResult},
    routes::{learners, AppState},
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    Form, Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Codes stay usable for a day: learners can take their time (no rush, no countdown).
pub const CODE_HOURS: i64 = 24;
const MAX_TRIES: i64 = 5;
const MAX_CODES_PER_DAY: i64 = 5;

// ---------- OAuth 2.0 client credentials ----------

#[derive(Deserialize, ToSchema)]
pub struct TokenRequest {
    /// Must be `client_credentials`.
    pub grant_type: String,
    /// Or send the id and secret with HTTP Basic authentication.
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct TokenResponse {
    pub access_token: String,
    /// Always `Bearer`.
    pub token_type: String,
    /// Seconds until the token expires.
    pub expires_in: i64,
    /// `partner:<id>` or `employer:<id>`.
    pub scope: String,
    /// The organisation's display name.
    pub name: String,
}

fn basic_credentials(headers: &HeaderMap) -> Option<(String, String)> {
    let raw = headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Basic ")?;
    let decoded = base64_decode(raw.trim())?;
    let (id, secret) = decoded.split_once(':')?;
    Some((id.to_string(), secret.to_string()))
}

/// Small standard base64 decoder (avoids a dependency for one header).
fn base64_decode(s: &str) -> Option<String> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    for c in s.bytes().filter(|&c| c != b'=') {
        let v = T.iter().position(|&x| x == c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    String::from_utf8(out).ok()
}

#[utoipa::path(post, path = "/oauth/token", tag = "auth",
    request_body(content = TokenRequest, content_type = "application/x-www-form-urlencoded"),
    responses((status = 200, body = TokenResponse), (status = 401, body = crate::error::ErrorBody)))]
pub async fn oauth_token(
    State(st): State<AppState>,
    headers: HeaderMap,
    Form(req): Form<TokenRequest>,
) -> ApiResult<Json<TokenResponse>> {
    if req.grant_type != "client_credentials" {
        return Err(ApiError::invalid(
            "unsupported_grant_type",
            "grant_type",
            "Use grant_type=client_credentials.",
        ));
    }
    let (id, secret) = match (req.client_id, req.client_secret) {
        (Some(i), Some(s)) => (i, s),
        _ => basic_credentials(&headers).ok_or_else(|| {
            ApiError::invalid(
                "invalid_client",
                "client_id",
                "Enter your organisation's client ID and secret.",
            )
        })?,
    };
    let secret_hash = auth::hash(&secret);
    for (kind, table) in [("partner", "partners"), ("employer", "employers")] {
        let row: Option<(String, String)> = sqlx::query_as(&format!(
            "SELECT id, name FROM {table} WHERE client_id = ? AND client_secret_hash = ?"
        ))
        .bind(id.trim())
        .bind(&secret_hash)
        .fetch_optional(&st.pool)
        .await?;
        if let Some((subject, name)) = row {
            let token =
                auth::issue(&st.pool, kind, &subject, Some(auth::STAFF_TOKEN_HOURS)).await?;
            return Ok(Json(TokenResponse {
                access_token: token,
                token_type: "Bearer".into(),
                expires_in: auth::STAFF_TOKEN_HOURS * 3600,
                scope: format!("{kind}:{subject}"),
                name,
            }));
        }
    }
    Err(ApiError::invalid(
        "invalid_client",
        "client_secret",
        "That client ID and secret do not match. Check them with the person who set up your account.",
    ))
}

// ---------- learner sign-in by SMS code ----------

#[derive(Deserialize, ToSchema)]
pub struct CodeRequest {
    pub phone: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CodeSent {
    /// Same message whether or not the number has an account (an account here can reveal a disability).
    pub message: String,
    /// Only when DEMO_MODE=true: the code, so the demo works without a phone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub demo_code: Option<String>,
}

fn new_code() -> String {
    format!("{:06}", rand::thread_rng().gen_range(0..1_000_000))
}

fn code_hash(phone: &str, code: &str) -> String {
    auth::hash(&format!("{phone}:{code}"))
}

/// Save a sign-in code for `phone` and text it. `registration` links it to a partner registration (F18).
pub async fn send_code(
    st: &AppState,
    phone: &str,
    registration: Option<&str>,
    text: impl FnOnce(&str) -> String,
    hours: i64,
) -> ApiResult<String> {
    let since = (chrono::Utc::now() - chrono::Duration::hours(24)).to_rfc3339();
    let (sent_today,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM login_codes WHERE phone = ? AND created_at > ?")
            .bind(phone)
            .bind(&since)
            .fetch_one(&st.pool)
            .await?;
    let test_phone = registration.is_none() && crate::db::is_test_phone(&st.cfg, phone);
    if sent_today >= MAX_CODES_PER_DAY && !test_phone {
        return Err(ApiError::invalid(
            "too_many_codes",
            "phone",
            "We already sent several codes to this number today. Use the last code we sent; it still works.",
        ));
    }
    let code = if test_phone {
        crate::db::TEST_CODE.to_string()
    } else {
        new_code()
    };
    sqlx::query(
        "INSERT INTO login_codes (phone, code_hash, registration_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(phone)
    .bind(code_hash(phone, &code))
    .bind(registration)
    .bind(auth::in_hours(hours))
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&st.pool)
    .await?;
    st.sms.send(phone, &text(&code));
    Ok(code)
}

#[utoipa::path(post, path = "/v1/auth/code", tag = "auth", request_body = CodeRequest,
    responses((status = 202, body = CodeSent), (status = 422, body = crate::error::ErrorBody)))]
pub async fn request_code(
    State(st): State<AppState>,
    Json(r): Json<CodeRequest>,
) -> ApiResult<(StatusCode, Json<CodeSent>)> {
    let phone = validate::et_phone(&r.phone)?;
    let (accounts,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM learners WHERE phone = ?")
        .bind(&phone)
        .fetch_one(&st.pool)
        .await?;
    let mut demo_code = None;
    if accounts > 0 {
        let code = send_code(
            &st,
            &phone,
            None,
            |c| {
                format!("Lehulu: your sign-in code is {c}. Nobody from Lehulu will ask you for it.")
            },
            CODE_HOURS,
        )
        .await?;
        demo_code = st.cfg.demo_mode.then_some(code);
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(CodeSent {
            message: format!(
                "If {phone} has a Lehulu account, we sent a code to it by SMS. The code works for a day."
            ),
            demo_code,
        }),
    ))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VerifyRequest {
    pub phone: String,
    pub code: String,
    /// When the phone has several accounts: the one the learner chose.
    pub learner_id: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AccountChoice {
    pub id: String,
    /// May be empty when the name was given by voice.
    pub name: String,
    pub created_at: String,
}

/// Either a session (`token` + `learner`) or, for a shared phone, the accounts to choose from.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Verified {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signed_in: Option<learners::SignedUp>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub choose: Option<Vec<AccountChoice>>,
    /// true when this code confirmed a partner's registration and created the account.
    pub registered: bool,
}

#[utoipa::path(post, path = "/v1/auth/verify", tag = "auth", request_body = VerifyRequest,
    responses((status = 200, body = Verified), (status = 422, body = crate::error::ErrorBody)))]
pub async fn verify_code(
    State(st): State<AppState>,
    Json(r): Json<VerifyRequest>,
) -> ApiResult<Json<Verified>> {
    let phone = validate::et_phone(&r.phone)?;
    let code: String = r.code.chars().filter(char::is_ascii_digit).collect();
    let now = chrono::Utc::now().to_rfc3339();
    let rows: Vec<(i64, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, code_hash, registration_id, attempts FROM login_codes WHERE phone = ? AND expires_at > ? ORDER BY id DESC",
    )
    .bind(&phone)
    .bind(&now)
    .fetch_all(&st.pool)
    .await?;
    if rows.iter().any(|(_, _, _, a)| *a >= MAX_TRIES) {
        return Err(ApiError::invalid(
            "too_many_tries",
            "code",
            "That code was entered wrongly too many times. Ask for a new code.",
        ));
    }
    let wanted = code_hash(&phone, &code);
    let Some((row_id, _, registration, _)) = rows.iter().find(|(_, h, _, _)| *h == wanted) else {
        sqlx::query(
            "UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ? AND expires_at > ?",
        )
        .bind(&phone)
        .bind(&now)
        .execute(&st.pool)
        .await?;
        return Err(ApiError::invalid(
            "code_invalid",
            "code",
            "That code is not right. Enter the 6 numbers from the SMS, for example 482913.",
        ));
    };

    // A partner registered this learner: the code is the learner's agreement. Create the account now.
    if let Some(reg) = registration {
        let id = crate::routes::partners::confirm_registration(&st, reg).await?;
        sqlx::query("DELETE FROM login_codes WHERE id = ?")
            .bind(row_id)
            .execute(&st.pool)
            .await?;
        return Ok(Json(Verified {
            signed_in: Some(learners::signed_in(&st, &id).await?),
            choose: None,
            registered: true,
        }));
    }

    let accounts: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, name, created_at FROM learners WHERE phone = ? ORDER BY created_at",
    )
    .bind(&phone)
    .fetch_all(&st.pool)
    .await?;
    let chosen = match (&r.learner_id, accounts.len()) {
        (_, 0) => {
            return Err(ApiError::invalid(
                "no_account",
                "phone",
                "There is no account for this number. Sign up first.",
            ))
        }
        (Some(want), _) => accounts
            .iter()
            .find(|(id, _, _)| id == want)
            .map(|(id, _, _)| id.clone())
            .ok_or(ApiError::invalid(
                "account_unknown",
                "learnerId",
                "Choose one of the accounts on this phone.",
            ))?,
        (None, 1) => accounts[0].0.clone(),
        (None, _) => {
            // Do not use up the code: the learner still has to choose.
            return Ok(Json(Verified {
                signed_in: None,
                choose: Some(
                    accounts
                        .into_iter()
                        .map(|(id, name, created_at)| AccountChoice {
                            id,
                            name,
                            created_at,
                        })
                        .collect(),
                ),
                registered: false,
            }));
        }
    };
    sqlx::query("DELETE FROM login_codes WHERE id = ?")
        .bind(row_id)
        .execute(&st.pool)
        .await?;
    learners::log(&st.pool, Some(&chosen), "learner", "signed_in").await?;
    Ok(Json(Verified {
        signed_in: Some(learners::signed_in(&st, &chosen).await?),
        choose: None,
        registered: false,
    }))
}

#[utoipa::path(post, path = "/v1/auth/signout", tag = "auth", security(("bearer" = [])),
    responses((status = 204, description = "This device is signed out")))]
pub async fn sign_out(State(st): State<AppState>, who: LearnerAuth) -> ApiResult<StatusCode> {
    auth::revoke(&st.pool, &who.token_hash).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(get, path = "/v1/me", tag = "auth", security(("bearer" = [])),
    responses((status = 200, body = learners::Learner), (status = 401, body = crate::error::ErrorBody)))]
pub async fn me(
    State(st): State<AppState>,
    who: LearnerAuth,
) -> ApiResult<Json<learners::Learner>> {
    Ok(Json(learners::fetch(&st, &who.id).await?))
}

// ---------- account linking for host platforms ----------

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkRequest {
    /// The `linkToken` from the `lehulu:signup-complete` or `lehulu:signed-in` event.
    pub link_token: String,
}

/// What a host platform learns when it links a Lehulu learner to its own user account.
/// Never support needs, never an ID number.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkedLearner {
    pub learner_id: String,
    pub name: String,
    pub phone: String,
    pub language: String,
    pub id_status: String,
    /// Only when the learner agreed that the host may adapt (`shareWithHost`).
    pub access_preferences: Option<Vec<String>>,
}

/// Call this from your server (not the browser). Each link token works once and for one hour.
#[utoipa::path(post, path = "/v1/link", tag = "auth", request_body = LinkRequest,
    responses((status = 200, body = LinkedLearner), (status = 401, body = crate::error::ErrorBody)))]
pub async fn link(
    State(st): State<AppState>,
    Json(r): Json<LinkRequest>,
) -> ApiResult<Json<LinkedLearner>> {
    let id = auth::take_link_token(&st.pool, r.link_token.trim())
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let l = learners::fetch(&st, &id).await?;
    learners::log(&st.pool, Some(&id), "host", "account_linked").await?;
    Ok(Json(LinkedLearner {
        learner_id: l.id,
        name: l.name,
        phone: l.phone,
        language: l.language,
        id_status: l.id_status,
        access_preferences: l.share_with_host.then_some(l.access_preferences),
    }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn basic_auth_decodes() {
        // "aaapd:aaapd-demo"
        assert_eq!(
            super::base64_decode("YWFhcGQ6YWFhcGQtZGVtbw==").as_deref(),
            Some("aaapd:aaapd-demo")
        );
    }
}
