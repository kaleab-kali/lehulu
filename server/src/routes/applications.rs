//! Job applications. Support needs reach the employer ONLY when the learner said yes for that job.
//! Learners apply as themselves (token); only the employer that posted a job can read its applications.

use crate::{
    auth::{EmployerAuth, LearnerAuth},
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
    /// Optional: taken from the learner's token. If sent, it must be the signed-in learner.
    #[serde(default)]
    pub learner_id: Option<String>,
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
    /// So the employer can contact the applicant. Applying means the learner agreed to this.
    pub learner_phone: String,
    pub created_at: String,
    pub why: Option<String>,
    /// Play at this URL: the answer said out loud.
    pub why_audio: Option<String>,
    /// Present only when the learner chose to share. Practical requests, never a diagnosis.
    pub support_requested: Option<Vec<String>>,
}

#[utoipa::path(post, path = "/v1/applications", tag = "applications", request_body = NewApplication,
    security(("bearer" = [])),
    responses((status = 201, body = Created), (status = 401, body = crate::error::ErrorBody), (status = 422, body = crate::error::ErrorBody)))]
pub async fn create_application(
    State(st): State<AppState>,
    who: LearnerAuth,
    Json(a): Json<NewApplication>,
) -> ApiResult<(StatusCode, Json<Created>)> {
    if a.learner_id.as_deref().is_some_and(|id| id != who.id) {
        return Err(ApiError::Forbidden);
    }
    let learner_id = who.id;
    if a.why_audio.is_none() {
        validate::required(
            &a.why,
            "why",
            "Write or say a short answer about why you want this job.",
        )?;
    }
    learners::fetch(&st, &learner_id).await?;
    let job: Option<(String,)> = sqlx::query_as("SELECT id FROM jobs WHERE id = ?")
        .bind(&a.job_id)
        .fetch_optional(&st.pool)
        .await?;
    job.ok_or(ApiError::NotFound("job"))?;
    let why_audio = match a.why_audio.as_deref() {
        Some(m) => Some(media::claim(&st.pool, m, &learner_id, "whyAudio").await?),
        None => None,
    };
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO applications (id, job_id, learner_id, why_text, why_audio_path, support_shared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&a.job_id)
        .bind(&learner_id)
        .bind(Some(a.why.trim()).filter(|w| !w.is_empty()))
        .bind(why_audio)
        .bind(a.share_support)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&st.pool)
        .await?;
    crate::webhook::notify(
        &st,
        "application.created",
        serde_json::json!({ "applicationId": id, "jobId": a.job_id, "learnerId": learner_id }),
    );
    learners::log(
        &st.pool,
        Some(&learner_id),
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
    security(("bearer" = [])),
    responses((status = 200, body = [EmployerApplication]), (status = 401, body = crate::error::ErrorBody), (status = 403, body = crate::error::ErrorBody)))]
pub async fn list_for_job(
    State(st): State<AppState>,
    who: EmployerAuth,
    Path(job_id): Path<String>,
) -> ApiResult<Json<Vec<EmployerApplication>>> {
    let owner: Option<(Option<String>,)> =
        sqlx::query_as("SELECT employer_id FROM jobs WHERE id = ?")
            .bind(&job_id)
            .fetch_optional(&st.pool)
            .await?;
    match owner {
        None => return Err(ApiError::NotFound("job")),
        Some((Some(e),)) if e == who.0 => {}
        Some(_) => return Err(ApiError::Forbidden),
    }
    type Row = (
        String,
        String,
        String,
        Option<String>,
        String,
        String,
        Option<String>,
        Option<String>,
        bool,
    );
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT a.id, a.learner_id, l.name, l.name_audio, l.phone, a.created_at, a.why_text, a.why_audio_path, a.support_shared
         FROM applications a JOIN learners l ON l.id = a.learner_id WHERE a.job_id = ? ORDER BY a.created_at",
    )
    .bind(&job_id)
    .fetch_all(&st.pool)
    .await?;
    let mut out = Vec::new();
    for (
        id,
        learner_id,
        learner_name,
        name_audio,
        learner_phone,
        created_at,
        why,
        why_audio,
        shared,
    ) in rows
    {
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
            learner_phone,
            created_at,
            why,
            why_audio: why_audio.map(|m| format!("/v1/media/{m}")),
            support_requested,
        });
    }
    Ok(Json(out))
}
