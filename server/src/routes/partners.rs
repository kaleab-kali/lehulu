//! Partners (for example AAAPD) confirm learners who have no ID document. No document is uploaded.

use crate::{
    error::{ApiError, ApiResult},
    routes::{learners, AppState},
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct Partner {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct VouchRequest {
    pub learner_id: String,
    /// May be empty when the learner gave their name by voice (see `name_audio`).
    pub name: String,
    /// Play at this URL: the learner saying their name.
    pub name_audio: Option<String>,
    pub phone: String,
    pub requested_at: String,
}

#[derive(Deserialize, ToSchema)]
pub struct Decision {
    /// confirm | decline
    pub decision: String,
}

#[utoipa::path(get, path = "/v1/partners", tag = "partners", responses((status = 200, body = [Partner])))]
pub async fn list_partners(State(st): State<AppState>) -> ApiResult<Json<Vec<Partner>>> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM partners ORDER BY name")
        .fetch_all(&st.pool)
        .await?;
    Ok(Json(
        rows.into_iter()
            .map(|(id, name)| Partner { id, name })
            .collect(),
    ))
}

#[utoipa::path(get, path = "/v1/partners/{id}/vouches", tag = "partners", params(("id" = String, Path)),
    responses((status = 200, body = [VouchRequest])))]
pub async fn list_vouches(
    State(st): State<AppState>,
    Path(partner): Path<String>,
) -> ApiResult<Json<Vec<VouchRequest>>> {
    // TODO(F13): require this partner's access token.
    let rows: Vec<(String, String, Option<String>, String, String)> = sqlx::query_as(
        "SELECT l.id, l.name, l.name_audio, l.phone, v.requested_at FROM vouches v JOIN learners l ON l.id = v.learner_id
         WHERE v.partner_id = ? AND v.status = 'requested' ORDER BY v.requested_at",
    )
    .bind(&partner)
    .fetch_all(&st.pool)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(
                |(learner_id, name, name_audio, phone, requested_at)| VouchRequest {
                    learner_id,
                    name,
                    name_audio: name_audio.map(|m| format!("/v1/media/{m}")),
                    phone,
                    requested_at,
                },
            )
            .collect(),
    ))
}

#[utoipa::path(post, path = "/v1/partners/{id}/vouches/{learner_id}", tag = "partners", request_body = Decision,
    params(("id" = String, Path), ("learner_id" = String, Path)),
    responses((status = 200, body = learners::Learner), (status = 404, body = crate::error::ErrorBody)))]
pub async fn decide_vouch(
    State(st): State<AppState>,
    Path((partner, learner_id)): Path<(String, String)>,
    Json(d): Json<Decision>,
) -> ApiResult<Json<learners::Learner>> {
    let (vouch_status, learner_status) = match d.decision.as_str() {
        "confirm" => ("confirmed", "confirmed_by_partner"),
        // Declining never blocks learning: the learner keeps access and can choose another route.
        "decline" => ("declined", "not_given"),
        _ => {
            return Err(ApiError::invalid(
                "decision_invalid",
                "decision",
                "Choose confirm or decline.",
            ))
        }
    };
    let res = sqlx::query("UPDATE vouches SET status = ?, decided_at = ? WHERE learner_id = ? AND partner_id = ? AND status = 'requested'")
        .bind(vouch_status)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&learner_id)
        .bind(&partner)
        .execute(&st.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("request to confirm this learner"));
    }
    sqlx::query("UPDATE learners SET id_status = ?, updated_at = ? WHERE id = ?")
        .bind(learner_status)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&learner_id)
        .execute(&st.pool)
        .await?;
    learners::log(
        &st.pool,
        Some(&learner_id),
        &format!("partner:{partner}"),
        &format!("vouch_{vouch_status}"),
    )
    .await?;
    Ok(Json(learners::fetch(&st.pool, &learner_id).await?))
}
