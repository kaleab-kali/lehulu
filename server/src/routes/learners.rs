//! Learners: create from the finished sign-up flow, profile (get/patch), delete, preferences for the host.
//! There is deliberately NO disability or diagnosis field. Support needs are practical supports from needs.json.
//! Only the signed-in learner can read, change or delete their own account.

use crate::{
    auth::{self, LearnerAuth},
    domain::{ethiopian_calendar, needs::WAYS, validate},
    error::{ApiError, ApiResult},
    routes::{media, AppState},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use utoipa::ToSchema;

pub const ID_TYPES: [&str; 5] = ["kebele", "refugee", "other", "partner", "later"];

#[derive(Serialize, Deserialize, ToSchema, Clone, Debug)]
pub struct EthDate {
    pub d: u32,
    pub m: u32,
    pub y: i32,
}

#[derive(Serialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Learner {
    pub id: String,
    /// May be empty when the learner gave their name by voice (see `name_audio`).
    pub name: String,
    /// Id of a recording of the learner saying their name. Play it at `/v1/media/{id}`.
    pub name_audio: Option<String>,
    pub phone: String,
    pub language: String,
    pub dob_ethiopian: Option<EthDate>,
    /// Same date in the Gregorian calendar (YYYY-MM-DD), for partner systems
    pub dob_gregorian: Option<String>,
    /// How the learner uses their phone: listen | speak | pictures | big | sign | data
    pub access_preferences: Vec<String>,
    /// Practical supports from flows/needs.json. Never a diagnosis.
    pub support_needs: Vec<String>,
    /// kebele | refugee | other | partner | later. A kebele ID is never required.
    pub id_type: String,
    /// Encrypted at rest; returned only to the learner.
    pub id_number: Option<String>,
    pub partner: Option<String>,
    /// not_given | not_checked | waiting_partner | confirmed_by_partner. Never blocks learning.
    pub id_status: String,
    /// The learner agreed that the host platform may adapt to their language and access preferences.
    pub share_with_host: bool,
}

/// Returned once at sign-up: the learner plus their session token and a one-time link token.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignedUp {
    #[serde(flatten)]
    pub learner: Learner,
    /// Send as `Authorization: Bearer <token>` for this learner's own requests. Never expires; ends on sign-out.
    pub token: String,
    /// One-time pass (valid 1 hour) the host platform's server exchanges at `POST /v1/link` to link accounts.
    pub link_token: String,
}

#[derive(Serialize, Deserialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewLearner {
    /// Required unless `nameAudio` is given.
    #[serde(default)]
    pub name: String,
    /// Id from `POST /v1/media`: the learner saying their name.
    #[serde(default)]
    pub name_audio: Option<String>,
    pub phone: String,
    pub language: String,
    pub dob_ethiopian: Option<EthDate>,
    #[serde(default)]
    pub access_preferences: Vec<String>,
    #[serde(default)]
    pub support_needs: Vec<String>,
    pub id_type: String,
    pub id_number: Option<String>,
    pub partner: Option<String>,
    /// Let the host platform adapt to language and access preferences (never support needs).
    #[serde(default)]
    pub share_with_host: bool,
}

#[derive(Deserialize, ToSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct LearnerPatch {
    pub name: Option<String>,
    pub name_audio: Option<String>,
    pub phone: Option<String>,
    pub language: Option<String>,
    pub dob_ethiopian: Option<EthDate>,
    pub access_preferences: Option<Vec<String>>,
    pub support_needs: Option<Vec<String>>,
    pub id_type: Option<String>,
    pub id_number: Option<String>,
    pub partner: Option<String>,
    pub share_with_host: Option<bool>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub language: String,
    pub access_preferences: Vec<String>,
}

fn id_status_for(id_type: &str) -> &'static str {
    match id_type {
        "partner" => "waiting_partner",
        "later" => "not_given",
        _ => "not_checked",
    }
}

/// Check a learner's answers (same rules as the sign-up screen). Returns the normalised phone.
/// `owner` is the learner being updated (None when signing up), so they may keep their own recording.
pub async fn check(st: &AppState, l: &NewLearner, owner: Option<&str>) -> ApiResult<String> {
    match l.name_audio.as_deref() {
        None => validate::required(
            &l.name,
            "name",
            "Enter your name, or say it with “Answer by voice”.",
        )?,
        Some(audio) => {
            let ok: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM media WHERE id = ? AND (learner_id IS NULL OR learner_id = ?)",
            )
            .bind(audio)
            .bind(owner)
            .fetch_optional(&st.pool)
            .await?;
            if ok.is_none() {
                return Err(ApiError::invalid(
                    "audio_unknown",
                    "nameAudio",
                    "We could not find the recording of your name. Please record it again, or type your name.",
                ));
            }
        }
    }
    let phone = validate::et_phone(&l.phone)?;
    validate::one_of(
        &l.language,
        &["am", "en"],
        "language",
        "Choose Amharic or English.",
    )?;
    if let Some(d) = &l.dob_ethiopian {
        if !ethiopian_calendar::is_valid(d.y, d.m, d.d) {
            return Err(ApiError::invalid(
                "date_invalid",
                "dobEthiopian",
                "Choose a day, a month and a year that exist in the Ethiopian calendar.",
            ));
        }
    }
    for w in &l.access_preferences {
        validate::one_of(
            w,
            &WAYS,
            "accessPreferences",
            "Choose from the listed ways of using your phone.",
        )?;
    }
    for n in &l.support_needs {
        if !st.needs.contains(n) {
            return Err(ApiError::invalid(
                "need_unknown",
                "supportNeeds",
                "Choose support from the list.",
            ));
        }
    }
    validate::one_of(
        &l.id_type,
        &ID_TYPES,
        "idType",
        "Choose one ID option, or “Skip for now”.",
    )?;
    if l.id_type == "partner" {
        let pid = l.partner.as_deref().unwrap_or_default();
        let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM partners WHERE id = ?")
            .bind(pid)
            .fetch_optional(&st.pool)
            .await?;
        if exists.is_none() {
            return Err(ApiError::invalid(
                "partner_required",
                "partner",
                "Choose who knows you.",
            ));
        }
    }
    Ok(phone)
}

pub async fn fetch(st: &AppState, id: &str) -> ApiResult<Learner> {
    let pool = &st.pool;
    let r = sqlx::query("SELECT * FROM learners WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::NotFound("learner"))?;
    let needs: Vec<(String,)> =
        sqlx::query_as("SELECT need FROM support_needs WHERE learner_id = ? ORDER BY need")
            .bind(id)
            .fetch_all(pool)
            .await?;
    let dob = match (
        r.get::<Option<i64>, _>("dob_eth_y"),
        r.get::<Option<i64>, _>("dob_eth_m"),
        r.get::<Option<i64>, _>("dob_eth_d"),
    ) {
        (Some(y), Some(m), Some(d)) => Some(EthDate {
            y: y as i32,
            m: m as u32,
            d: d as u32,
        }),
        _ => None,
    };
    Ok(Learner {
        id: r.get("id"),
        name: r.get("name"),
        name_audio: r.get("name_audio"),
        phone: r.get("phone"),
        language: r.get("language"),
        dob_gregorian: dob.as_ref().map(|d| {
            let (y, m, day) = ethiopian_calendar::to_gregorian(d.y, d.m, d.d);
            format!("{y:04}-{m:02}-{day:02}")
        }),
        dob_ethiopian: dob,
        access_preferences: serde_json::from_str(&r.get::<String, _>("access_preferences"))
            .unwrap_or_default(),
        support_needs: needs.into_iter().map(|(n,)| n).collect(),
        id_type: r.get("id_type"),
        id_number: r
            .get::<Option<String>, _>("id_number")
            .and_then(|v| auth::decrypt(&st.cipher, &v)),
        partner: r.get("partner_id"),
        id_status: r.get("id_status"),
        share_with_host: r.get::<i64, _>("share_with_host") != 0,
    })
}

pub async fn log(
    pool: &SqlitePool,
    learner_id: Option<&str>,
    actor: &str,
    action: &str,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO consent_log (learner_id, actor, action, at) VALUES (?, ?, ?, ?)")
        .bind(learner_id)
        .bind(actor)
        .bind(action)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(pool)
        .await?;
    Ok(())
}

fn encrypted_id_number(st: &AppState, v: Option<&str>) -> Option<String> {
    v.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|v| auth::encrypt(&st.cipher, v))
}

/// Insert a checked learner. `confirmed_by` is a partner who registered them in person (F18): their ID
/// status starts as "confirmed by partner".
pub async fn insert(
    st: &AppState,
    l: &NewLearner,
    phone: &str,
    confirmed_by: Option<&str>,
) -> ApiResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = if confirmed_by.is_some() {
        "confirmed_by_partner"
    } else {
        id_status_for(&l.id_type)
    };
    let mut tx = st.pool.begin().await?;
    sqlx::query(
        "INSERT INTO learners (id, name, name_audio, phone, language, dob_eth_y, dob_eth_m, dob_eth_d, access_preferences,
         id_type, id_number, partner_id, id_status, share_with_host, created_at, updated_at, last_active_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&id)
    .bind(l.name.trim())
    .bind(l.name_audio.as_deref())
    .bind(phone)
    .bind(&l.language)
    .bind(l.dob_ethiopian.as_ref().map(|d| d.y))
    .bind(l.dob_ethiopian.as_ref().map(|d| d.m))
    .bind(l.dob_ethiopian.as_ref().map(|d| d.d))
    .bind(serde_json::to_string(&l.access_preferences).unwrap_or_else(|_| "[]".into()))
    .bind(&l.id_type)
    .bind(encrypted_id_number(st, l.id_number.as_deref()))
    .bind(if l.id_type == "partner" { l.partner.as_deref() } else { None })
    .bind(status)
    .bind(l.share_with_host)
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    for n in &l.support_needs {
        sqlx::query("INSERT OR IGNORE INTO support_needs (learner_id, need) VALUES (?, ?)")
            .bind(&id)
            .bind(n)
            .execute(&mut *tx)
            .await?;
    }
    if l.id_type == "partner" {
        sqlx::query(
            "INSERT INTO vouches (learner_id, partner_id, status, requested_at, decided_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(l.partner.as_deref())
        .bind(if confirmed_by.is_some() { "confirmed" } else { "requested" })
        .bind(&now)
        .bind(confirmed_by.map(|_| now.clone()))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    if let Some(audio) = l.name_audio.as_deref() {
        media::claim(&st.pool, audio, &id, "nameAudio").await?;
    }
    Ok(id)
}

/// A new session for a learner, plus a one-time link token for the host platform.
pub async fn signed_in(st: &AppState, id: &str) -> ApiResult<SignedUp> {
    Ok(SignedUp {
        learner: fetch(st, id).await?,
        token: auth::issue(&st.pool, "learner", id, None).await?,
        link_token: auth::issue(&st.pool, "link", id, Some(auth::LINK_TOKEN_HOURS)).await?,
    })
}

#[utoipa::path(post, path = "/v1/learners", tag = "learners", request_body = NewLearner,
    responses((status = 201, body = SignedUp), (status = 422, body = crate::error::ErrorBody)))]
pub async fn create_learner(
    State(st): State<AppState>,
    Json(l): Json<NewLearner>,
) -> ApiResult<(StatusCode, Json<SignedUp>)> {
    let phone = check(&st, &l, None).await?;
    let id = insert(&st, &l, &phone, None).await?;
    log(&st.pool, Some(&id), "learner", "signed_up").await?;
    crate::webhook::notify(
        &st,
        "learner.created",
        serde_json::json!({ "learnerId": id, "language": l.language, "idStatus": id_status_for(&l.id_type) }),
    );
    if l.share_with_host {
        log(&st.pool, Some(&id), "learner", "agreed_host_adapts").await?;
    }
    Ok((StatusCode::CREATED, Json(signed_in(&st, &id).await?)))
}

/// A learner may only act on their own account.
fn own(who: &LearnerAuth, id: &str) -> ApiResult<()> {
    if who.id == id {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

#[utoipa::path(get, path = "/v1/learners/{id}", tag = "learners", params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 200, body = Learner), (status = 401, body = crate::error::ErrorBody), (status = 403, body = crate::error::ErrorBody)))]
pub async fn get_learner(
    State(st): State<AppState>,
    who: LearnerAuth,
    Path(id): Path<String>,
) -> ApiResult<Json<Learner>> {
    own(&who, &id)?;
    Ok(Json(fetch(&st, &id).await?))
}

#[utoipa::path(patch, path = "/v1/learners/{id}", tag = "learners", request_body = LearnerPatch, params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 200, body = Learner), (status = 422, body = crate::error::ErrorBody), (status = 403, body = crate::error::ErrorBody)))]
pub async fn update_learner(
    State(st): State<AppState>,
    who: LearnerAuth,
    Path(id): Path<String>,
    Json(p): Json<LearnerPatch>,
) -> ApiResult<Json<Learner>> {
    own(&who, &id)?;
    let cur = fetch(&st, &id).await?;
    let merged = NewLearner {
        name: p.name.unwrap_or(cur.name),
        name_audio: p.name_audio.or(cur.name_audio),
        phone: p.phone.unwrap_or(cur.phone),
        language: p.language.unwrap_or(cur.language),
        dob_ethiopian: p.dob_ethiopian.or(cur.dob_ethiopian),
        access_preferences: p.access_preferences.unwrap_or(cur.access_preferences),
        support_needs: p.support_needs.unwrap_or(cur.support_needs),
        id_type: p.id_type.unwrap_or(cur.id_type.clone()),
        id_number: p.id_number.or(cur.id_number),
        partner: p.partner.or(cur.partner.clone()),
        share_with_host: p.share_with_host.unwrap_or(cur.share_with_host),
    };
    let phone = check(&st, &merged, Some(&id)).await?;
    // Keep a partner confirmation if the learner did not change partner.
    let same_partner =
        merged.id_type == "partner" && cur.id_type == "partner" && merged.partner == cur.partner;
    let status = if same_partner {
        cur.id_status.as_str()
    } else {
        id_status_for(&merged.id_type)
    };
    let mut tx = st.pool.begin().await?;
    sqlx::query(
        "UPDATE learners SET name=?, name_audio=?, phone=?, language=?, dob_eth_y=?, dob_eth_m=?, dob_eth_d=?, access_preferences=?,
         id_type=?, id_number=?, partner_id=?, id_status=?, share_with_host=?, updated_at=? WHERE id=?",
    )
    .bind(merged.name.trim())
    .bind(merged.name_audio.as_deref())
    .bind(&phone)
    .bind(&merged.language)
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.y))
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.m))
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.d))
    .bind(serde_json::to_string(&merged.access_preferences).unwrap_or_else(|_| "[]".into()))
    .bind(&merged.id_type)
    .bind(encrypted_id_number(&st, merged.id_number.as_deref()))
    .bind(if merged.id_type == "partner" { merged.partner.as_deref() } else { None })
    .bind(status)
    .bind(merged.share_with_host)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(&id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM support_needs WHERE learner_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    for n in &merged.support_needs {
        sqlx::query("INSERT OR IGNORE INTO support_needs (learner_id, need) VALUES (?, ?)")
            .bind(&id)
            .bind(n)
            .execute(&mut *tx)
            .await?;
    }
    if merged.id_type == "partner" && !same_partner {
        sqlx::query("INSERT OR REPLACE INTO vouches (learner_id, partner_id, status, requested_at) VALUES (?, ?, 'requested', ?)")
            .bind(&id)
            .bind(merged.partner.as_deref())
            .bind(chrono::Utc::now().to_rfc3339())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    if let Some(audio) = merged.name_audio.as_deref() {
        media::claim(&st.pool, audio, &id, "nameAudio").await?;
    }
    log(&st.pool, Some(&id), "learner", "profile_updated").await?;
    if merged.share_with_host != cur.share_with_host {
        let action = if merged.share_with_host {
            "agreed_host_adapts"
        } else {
            "withdrew_host_adapts"
        };
        log(&st.pool, Some(&id), "learner", action).await?;
    }
    Ok(Json(fetch(&st, &id).await?))
}

#[utoipa::path(delete, path = "/v1/learners/{id}", tag = "learners", params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 204, description = "Account, answers, recordings and sessions deleted"), (status = 403, body = crate::error::ErrorBody)))]
pub async fn delete_learner(
    State(st): State<AppState>,
    who: LearnerAuth,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    own(&who, &id)?;
    erase(&st, &id).await?;
    log(&st.pool, None, "learner", "account_deleted").await?;
    crate::webhook::notify(
        &st,
        "learner.deleted",
        serde_json::json!({ "learnerId": id }),
    );
    Ok(StatusCode::NO_CONTENT)
}

/// Right to erasure: recordings (files too), answers, applications, sessions. Rows cascade with the learner.
pub async fn erase(st: &AppState, id: &str) -> ApiResult<()> {
    media::delete_files_of(&st.pool, &st.cfg.media_dir, id).await?;
    auth::revoke_all(&st.pool, "learner", id).await?;
    auth::revoke_all(&st.pool, "link", id).await?;
    let res = sqlx::query("DELETE FROM learners WHERE id = ?")
        .bind(id)
        .execute(&st.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("learner"));
    }
    // The consent log keeps what happened, but no longer who it happened to.
    sqlx::query("UPDATE consent_log SET learner_id = NULL WHERE learner_id = ?")
        .bind(id)
        .execute(&st.pool)
        .await?;
    Ok(())
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportedApplication {
    pub job_id: String,
    pub job_title: String,
    pub org: String,
    pub why: Option<String>,
    pub why_audio: Option<String>,
    pub support_shared: bool,
    pub created_at: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportedRecording {
    pub id: String,
    pub url: String,
    pub mime: String,
    pub bytes: i64,
    pub created_at: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConsentEntry {
    /// learner | partner:<id> | host | system
    pub actor: String,
    pub action: String,
    pub at: String,
}

/// Everything Lehulu holds about a learner, in one file.
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Export {
    pub exported_at: String,
    pub learner: Learner,
    pub applications: Vec<ExportedApplication>,
    pub recordings: Vec<ExportedRecording>,
    pub consent_log: Vec<ConsentEntry>,
}

#[utoipa::path(get, path = "/v1/learners/{id}/export", tag = "learners", params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 200, body = Export), (status = 403, body = crate::error::ErrorBody)))]
pub async fn export(
    State(st): State<AppState>,
    who: LearnerAuth,
    Path(id): Path<String>,
) -> ApiResult<Json<Export>> {
    own(&who, &id)?;
    let learner = fetch(&st, &id).await?;
    type AppRow = (
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        bool,
        String,
    );
    let apps: Vec<AppRow> = sqlx::query_as(
        "SELECT a.job_id, j.title, j.org, a.why_text, a.why_audio_path, a.support_shared, a.created_at
         FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.learner_id = ? ORDER BY a.created_at",
    )
    .bind(&id)
    .fetch_all(&st.pool)
    .await?;
    let recs: Vec<(String, String, i64, String)> = sqlx::query_as(
        "SELECT id, mime, bytes, created_at FROM media WHERE learner_id = ? ORDER BY created_at",
    )
    .bind(&id)
    .fetch_all(&st.pool)
    .await?;
    let log: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT actor, action, at FROM consent_log WHERE learner_id = ? ORDER BY id",
    )
    .bind(&id)
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(Export {
        exported_at: chrono::Utc::now().to_rfc3339(),
        learner,
        applications: apps
            .into_iter()
            .map(
                |(job_id, job_title, org, why, why_audio, support_shared, created_at)| {
                    ExportedApplication {
                        job_id,
                        job_title,
                        org,
                        why,
                        why_audio: why_audio.map(|m| format!("/v1/media/{m}")),
                        support_shared,
                        created_at,
                    }
                },
            )
            .collect(),
        recordings: recs
            .into_iter()
            .map(|(id, mime, bytes, created_at)| ExportedRecording {
                url: format!("/v1/media/{id}"),
                id,
                mime,
                bytes,
                created_at,
            })
            .collect(),
        consent_log: log
            .into_iter()
            .map(|(actor, action, at)| ConsentEntry { actor, action, at })
            .collect(),
    }))
}

/// Privacy policy (F21): delete accounts not used for `RETENTION_DAYS`, recordings nobody used, and old
/// codes, tokens, drafts and unconfirmed partner registrations. Runs at start and every 6 hours.
pub async fn retention(st: &AppState) -> ApiResult<u64> {
    let now = chrono::Utc::now();
    let cutoff = (now - chrono::Duration::days(st.cfg.retention_days)).to_rfc3339();
    let stale: Vec<(String,)> =
        sqlx::query_as("SELECT id FROM learners WHERE COALESCE(last_active_at, updated_at) < ?")
            .bind(&cutoff)
            .fetch_all(&st.pool)
            .await?;
    for (id,) in &stale {
        erase(st, id).await?;
        log(&st.pool, None, "system", "account_deleted_inactive").await?;
    }
    let unclaimed_before = (now - chrono::Duration::days(2)).to_rfc3339();
    media::delete_unclaimed(&st.pool, &st.cfg.media_dir, &unclaimed_before).await?;
    let now_s = now.to_rfc3339();
    sqlx::query("DELETE FROM login_codes WHERE expires_at < ?")
        .bind(&now_s)
        .execute(&st.pool)
        .await?;
    sqlx::query("DELETE FROM access_tokens WHERE expires_at IS NOT NULL AND expires_at < ?")
        .bind(&now_s)
        .execute(&st.pool)
        .await?;
    sqlx::query("DELETE FROM drafts WHERE updated_at < ?")
        .bind(&cutoff)
        .execute(&st.pool)
        .await?;
    sqlx::query("DELETE FROM partner_registrations WHERE created_at < ?")
        .bind((now - chrono::Duration::days(30)).to_rfc3339())
        .execute(&st.pool)
        .await?;
    Ok(stale.len() as u64)
}

/// What a host platform (for example Savanna) may read so it can adapt: language and access preferences only,
/// and only when the learner agreed (`shareWithHost`). Never support needs.
#[utoipa::path(get, path = "/v1/learners/{id}/preferences", tag = "learners", params(("id" = String, Path)),
    security(("bearer" = [])),
    responses((status = 200, body = Preferences), (status = 403, body = crate::error::ErrorBody)))]
pub async fn get_preferences(
    State(st): State<AppState>,
    who: LearnerAuth,
    Path(id): Path<String>,
) -> ApiResult<Json<Preferences>> {
    own(&who, &id)?;
    let l = fetch(&st, &id).await?;
    if !l.share_with_host {
        return Err(ApiError::Forbidden);
    }
    Ok(Json(Preferences {
        language: l.language,
        access_preferences: l.access_preferences,
    }))
}
