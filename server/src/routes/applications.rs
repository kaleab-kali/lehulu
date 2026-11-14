//! Job applications. Support needs reach the employer ONLY when the learner said yes for that job.

use crate::{
    domain::validate,
    error::{ApiError, ApiResult},
    routes::{learners, media, AppState},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewApplication {
    pub job_id: String,
    pub learner_id: String,
    /// Required unless `whyAudio` is given.
    #[serde(default)]
    pub why: String,
    /// Id from `POST /v1/media`: the answer said out loud.
    #[serde(default)]
    pub why_audio: Option<String>,
    /// true only if the learner chose to share their support needs with THIS employer
    pub share_support: bool,
}

#[derive(Serialize, ToSchema)]
pub struct Created {
    pub id: String,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmployerApplication {
    pub id: String,
    /// May be empty when the learner gave their name by voice (see `learner_name_audio`).
    pub learner_name: String,
    /// Play at this URL: the learner saying their name.
    pub learner_name_audio: Option<String>,
    pub why: Option<String>,
    /// Play at this URL: the answer said out loud.
    pub why_audio: Option<String>,
    /// Present only when the learner chose to share. Practical requests, never a diagnosis.
    pub support_requested: Option<Vec<String>>,
}

#[utoipa::path(post, path = "/v1/applications", tag = "applications", request_body = NewApplication,
    responses((status = 201, body = Created), (status = 422, body = crate::error::ErrorBody)))]
pub async fn create_application(
    State(st): State<AppState>,
    Json(a): Json<NewApplication>,
) -> ApiResult<(StatusCode, Json<Created>)> {
    if a.why_audio.is_none() {
        validate::required(
            &a.why,
            "why",
            "Write or say a short answer about why you want this job.",
        )?;
    }
    learners::fetch(&st.pool, &a.learner_id).await?;
    let job: Option<(String,)> = sqlx::query_as("SELECT id FROM jobs WHERE id = ?")
        .bind(&a.job_id)
        .fetch_optional(&st.pool)
        .await?;
    job.ok_or(ApiError::NotFound("job"))?;
    let why_audio = match a.why_audio.as_deref() {
        Some(m) => Some(media::claim(&st.pool, m, &a.learner_id, "whyAudio").await?),
        None => None,
    };
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO applications (id, job_id, learner_id, why_text, why_audio_path, support_shared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&a.job_id)
        .bind(&a.learner_id)
        .bind(Some(a.why.trim()).filter(|w| !w.is_empty()))
        .bind(why_audio)
        .bind(a.share_support)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&st.pool)
        .await?;
    learners::log(
        &st.pool,
        Some(&a.learner_id),
        "learner",
        if a.share_support {
            "applied_shared_support"
        } else {
            "applied_private"
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(Created { id })))
}

#[utoipa::path(get, path = "/v1/jobs/{id}/applications", tag = "applications", params(("id" = String, Path)),
    responses((status = 200, body = [EmployerApplication])))]
pub async fn list_for_job(
    State(st): State<AppState>,
    Path(job_id): Path<String>,
) -> ApiResult<Json<Vec<EmployerApplication>>> {
    // TODO(F13): require the employer token that owns this job.
    type Row = (
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        bool,
    );
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT a.id, a.learner_id, l.name, l.name_audio, a.why_text, a.why_audio_path, a.support_shared
         FROM applications a JOIN learners l ON l.id = a.learner_id WHERE a.job_id = ? ORDER BY a.created_at",
    )
    .bind(&job_id)
    .fetch_all(&st.pool)
    .await?;
    let mut out = Vec::new();
    for (id, learner_id, learner_name, name_audio, why, why_audio, shared) in rows {
        let support_requested = if shared {
            let needs: Vec<(String,)> =
                sqlx::query_as("SELECT need FROM support_needs WHERE learner_id = ? ORDER BY need")
                    .bind(&learner_id)
                    .fetch_all(&st.pool)
                    .await?;
            Some(needs.into_iter().map(|(n,)| n).collect())
        } else {
            None
        };
        out.push(EmployerApplication {
            id,
            learner_name,
            learner_name_audio: name_audio.map(|m| format!("/v1/media/{m}")),
            why,
            why_audio: why_audio.map(|m| format!("/v1/media/{m}")),
            support_requested,
        });
    }
    Ok(Json(out))
}
