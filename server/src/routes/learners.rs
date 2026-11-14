//! Learners: create from the finished sign-up flow, profile (get/patch), delete, preferences for the host.
//! There is deliberately NO disability or diagnosis field. Support needs are practical supports from needs.json.

use crate::{
    domain::{ethiopian_calendar, needs::WAYS, validate},
    error::{ApiError, ApiResult},
    routes::AppState,
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
    pub name: String,
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
    pub id_number: Option<String>,
    pub partner: Option<String>,
    /// not_given | not_checked | waiting_partner | confirmed_by_partner. Never blocks learning.
    pub id_status: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewLearner {
    pub name: String,
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
}

#[derive(Deserialize, ToSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct LearnerPatch {
    pub name: Option<String>,
    pub phone: Option<String>,
    pub language: Option<String>,
    pub dob_ethiopian: Option<EthDate>,
    pub access_preferences: Option<Vec<String>>,
    pub support_needs: Option<Vec<String>>,
    pub id_type: Option<String>,
    pub id_number: Option<String>,
    pub partner: Option<String>,
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

async fn check(st: &AppState, l: &NewLearner) -> ApiResult<String> {
    validate::required(&l.name, "name", "Enter your name.")?;
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

pub async fn fetch(pool: &SqlitePool, id: &str) -> ApiResult<Learner> {
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
        id_number: r.get("id_number"),
        partner: r.get("partner_id"),
        id_status: r.get("id_status"),
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

#[utoipa::path(post, path = "/v1/learners", tag = "learners", request_body = NewLearner,
    responses((status = 201, body = Learner), (status = 422, body = crate::error::ErrorBody)))]
pub async fn create_learner(
    State(st): State<AppState>,
    Json(l): Json<NewLearner>,
) -> ApiResult<(StatusCode, Json<Learner>)> {
    let phone = check(&st, &l).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let mut tx = st.pool.begin().await?;
    sqlx::query(
        "INSERT INTO learners (id, name, phone, language, dob_eth_y, dob_eth_m, dob_eth_d, access_preferences,
         id_type, id_number, partner_id, id_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&id)
    .bind(l.name.trim())
    .bind(&phone)
    .bind(&l.language)
    .bind(l.dob_ethiopian.as_ref().map(|d| d.y))
    .bind(l.dob_ethiopian.as_ref().map(|d| d.m))
    .bind(l.dob_ethiopian.as_ref().map(|d| d.d))
    .bind(serde_json::to_string(&l.access_preferences).unwrap())
    .bind(&l.id_type)
    .bind(l.id_number.as_deref().filter(|s| !s.trim().is_empty()))
    .bind(if l.id_type == "partner" { l.partner.as_deref() } else { None })
    .bind(id_status_for(&l.id_type))
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
        sqlx::query("INSERT INTO vouches (learner_id, partner_id, status, requested_at) VALUES (?, ?, 'requested', ?)")
            .bind(&id)
            .bind(l.partner.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    log(&st.pool, Some(&id), "learner", "signed_up").await?;
    Ok((StatusCode::CREATED, Json(fetch(&st.pool, &id).await?)))
}

#[utoipa::path(get, path = "/v1/learners/{id}", tag = "learners", params(("id" = String, Path)),
    responses((status = 200, body = Learner), (status = 404, body = crate::error::ErrorBody)))]
pub async fn get_learner(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Learner>> {
    // TODO(F12): only the learner themself (session) may read this.
    Ok(Json(fetch(&st.pool, &id).await?))
}

#[utoipa::path(patch, path = "/v1/learners/{id}", tag = "learners", request_body = LearnerPatch, params(("id" = String, Path)),
    responses((status = 200, body = Learner), (status = 422, body = crate::error::ErrorBody)))]
pub async fn update_learner(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Json(p): Json<LearnerPatch>,
) -> ApiResult<Json<Learner>> {
    let cur = fetch(&st.pool, &id).await?;
    let merged = NewLearner {
        name: p.name.unwrap_or(cur.name),
        phone: p.phone.unwrap_or(cur.phone),
        language: p.language.unwrap_or(cur.language),
        dob_ethiopian: p.dob_ethiopian.or(cur.dob_ethiopian),
        access_preferences: p.access_preferences.unwrap_or(cur.access_preferences),
        support_needs: p.support_needs.unwrap_or(cur.support_needs),
        id_type: p.id_type.unwrap_or(cur.id_type.clone()),
        id_number: p.id_number.or(cur.id_number),
        partner: p.partner.or(cur.partner.clone()),
    };
    let phone = check(&st, &merged).await?;
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
        "UPDATE learners SET name=?, phone=?, language=?, dob_eth_y=?, dob_eth_m=?, dob_eth_d=?, access_preferences=?,
         id_type=?, id_number=?, partner_id=?, id_status=?, updated_at=? WHERE id=?",
    )
    .bind(merged.name.trim())
    .bind(&phone)
    .bind(&merged.language)
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.y))
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.m))
    .bind(merged.dob_ethiopian.as_ref().map(|d| d.d))
    .bind(serde_json::to_string(&merged.access_preferences).unwrap())
    .bind(&merged.id_type)
    .bind(merged.id_number.as_deref().filter(|s| !s.trim().is_empty()))
    .bind(if merged.id_type == "partner" { merged.partner.as_deref() } else { None })
    .bind(status)
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
    log(&st.pool, Some(&id), "learner", "profile_updated").await?;
    Ok(Json(fetch(&st.pool, &id).await?))
}

#[utoipa::path(delete, path = "/v1/learners/{id}", tag = "learners", params(("id" = String, Path)),
    responses((status = 204, description = "Account and all answers deleted"), (status = 404, body = crate::error::ErrorBody)))]
pub async fn delete_learner(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let res = sqlx::query("DELETE FROM learners WHERE id = ?")
        .bind(&id)
        .execute(&st.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("learner"));
    }
    log(&st.pool, None, "learner", "account_deleted").await?;
    Ok(StatusCode::NO_CONTENT)
}

/// What a host platform (for example Savanna) may read so it can adapt: language and access preferences only.
#[utoipa::path(get, path = "/v1/learners/{id}/preferences", tag = "learners", params(("id" = String, Path)),
    responses((status = 200, body = Preferences)))]
pub async fn get_preferences(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Preferences>> {
    // TODO(F19): require the learner's consent for this host before returning.
    let l = fetch(&st.pool, &id).await?;
    Ok(Json(Preferences {
        language: l.language,
        access_preferences: l.access_preferences,
    }))
}
