//! Autosave after every question and "continue later". Drafts never expire while in use (no time limits);
//! the retention job removes drafts untouched for RETENTION_DAYS. The resume code is the only key, so it is
//! 8 characters long (about 10^12 possibilities).

use crate::{
    error::{ApiError, ApiResult},
    routes::AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub flow_id: String,
    pub step_index: i64,
    /// Answers so far, as entered (object keyed by step id)
    #[schema(value_type = Object)]
    pub answers: Value,
    /// If given, a "continue later" link (`?resume=CODE`) is sent to this phone by SMS (at most 3 per draft)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_link_to: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DraftSaved {
    pub resume_code: String,
}

fn new_code() -> String {
    // No 0/O/1/I so codes are easy to read aloud and type.
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect()
}

#[utoipa::path(post, path = "/v1/drafts", tag = "drafts", request_body = Draft,
    responses((status = 201, body = DraftSaved)))]
pub async fn create_draft(
    State(st): State<AppState>,
    Json(d): Json<Draft>,
) -> ApiResult<(StatusCode, Json<DraftSaved>)> {
    let code = new_code();
    upsert(&st, &code, &d).await?;
    Ok((StatusCode::CREATED, Json(DraftSaved { resume_code: code })))
}

#[utoipa::path(put, path = "/v1/drafts/{code}", tag = "drafts", request_body = Draft,
    params(("code" = String, Path)), responses((status = 200, body = DraftSaved)))]
pub async fn save_draft(
    State(st): State<AppState>,
    Path(code): Path<String>,
    Json(d): Json<Draft>,
) -> ApiResult<Json<DraftSaved>> {
    upsert(&st, &code, &d).await?;
    Ok(Json(DraftSaved { resume_code: code }))
}

#[utoipa::path(get, path = "/v1/drafts/{code}", tag = "drafts", params(("code" = String, Path)),
    responses((status = 200, body = Draft), (status = 404, body = crate::error::ErrorBody)))]
pub async fn get_draft(
    State(st): State<AppState>,
    Path(code): Path<String>,
) -> ApiResult<Json<Draft>> {
    let row: Option<(String, i64, String)> =
        sqlx::query_as("SELECT flow_id, step_index, answers FROM drafts WHERE resume_code = ?")
            .bind(&code)
            .fetch_optional(&st.pool)
            .await?;
    let (flow_id, step_index, answers) = row.ok_or(ApiError::NotFound("saved form"))?;
    Ok(Json(Draft {
        flow_id,
        step_index,
        answers: serde_json::from_str(&answers).unwrap_or(Value::Null),
        send_link_to: None,
    }))
}

async fn upsert(st: &AppState, code: &str, d: &Draft) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO drafts (resume_code, flow_id, step_index, answers, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resume_code) DO UPDATE SET flow_id = excluded.flow_id, step_index = excluded.step_index,
         answers = excluded.answers, updated_at = excluded.updated_at",
    )
    .bind(code)
    .bind(&d.flow_id)
    .bind(d.step_index)
    .bind(d.answers.to_string())
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&st.pool)
    .await?;
    if let Some(phone) = &d.send_link_to {
        let phone = crate::domain::validate::et_phone(phone)?;
        // Limit texts per draft so "continue later" cannot be used to message strangers.
        let res = sqlx::query(
            "UPDATE drafts SET sms_sent = sms_sent + 1 WHERE resume_code = ? AND sms_sent < 3",
        )
        .bind(code)
        .execute(&st.pool)
        .await?;
        if res.rows_affected() == 0 {
            return Err(ApiError::invalid(
                "too_many_texts",
                "phone",
                format!("We already texted your code. You can also write it down: {code}."),
            ));
        }
        st.sms.send(
            &phone,
            &format!(
                "Lehulu: continue your sign-up any time: {}/?resume={code} (code {code}). There is no time limit.",
                st.cfg.public_url
            ),
        );
    }
    Ok(())
}
