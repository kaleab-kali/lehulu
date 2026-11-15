//! Voice recordings (F8). The recording itself is the answer, so voice works offline and needs no
//! outside speech service. The browser uploads the audio as soon as recording stops; answers then refer
//! to it by id (`nameAudio`, `whyAudio`). A recording becomes owned by a learner when an answer uses it,
//! and "delete my account" deletes the files.
//!
//! Who may play a recording: the learner who owns it; an employer, for the answer and spoken name in an
//! application to their job; a partner, for the spoken name of a learner who asked them to confirm.
//! A recording not used in any answer yet can be played by whoever holds its (unguessable) id.

use crate::{
    auth::{MaybeAuth, Principal},
    error::{ApiError, ApiResult},
    routes::AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
use utoipa::ToSchema;

/// About 5 minutes of Opus speech. Answers are short; this keeps uploads cheap on 3G.
pub const MAX_BYTES: usize = 5 * 1024 * 1024;

#[derive(Serialize, ToSchema)]
pub struct Uploaded {
    /// Use this id in an answer (`nameAudio`, `whyAudio`).
    pub id: String,
    /// Where the recording can be played: `/v1/media/{id}`
    pub url: String,
}

fn file_for(dir: &str, id: &str) -> PathBuf {
    PathBuf::from(dir).join(format!("{id}.audio"))
}

/// Only our own UUIDs reach the file system (no path tricks).
fn parse_id(id: &str) -> ApiResult<String> {
    uuid::Uuid::parse_str(id)
        .map(|u| u.to_string())
        .map_err(|_| ApiError::NotFound("recording"))
}

#[utoipa::path(post, path = "/v1/media", tag = "media",
    request_body(content = Vec<u8>, content_type = "audio/webm", description = "The recording, as recorded by the browser (audio/webm, audio/ogg or audio/mp4)"),
    responses((status = 201, body = Uploaded), (status = 422, body = crate::error::ErrorBody)))]
pub async fn upload(
    State(st): State<AppState>,
    MaybeAuth(who): MaybeAuth,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Uploaded>)> {
    let mime = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if !mime.starts_with("audio/") || mime.len() > 100 {
        return Err(ApiError::invalid(
            "audio_type",
            "audio",
            "Send the recording as audio, for example audio/webm.",
        ));
    }
    if body.is_empty() {
        return Err(ApiError::invalid(
            "audio_empty",
            "audio",
            "The recording is empty. Please record your answer again.",
        ));
    }
    if body.len() > MAX_BYTES {
        return Err(ApiError::invalid(
            "audio_too_long",
            "audio",
            "The recording is too long. Please keep it under 5 minutes, or type your answer.",
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let path = file_for(&st.cfg.media_dir, &id);
    let write = async {
        tokio::fs::create_dir_all(&st.cfg.media_dir).await?;
        tokio::fs::write(&path, &body).await
    };
    if let Err(e) = write.await {
        tracing::error!(error = %e, "could not save a recording");
        return Err(ApiError::invalid(
            "audio_not_saved",
            "audio",
            "We could not save the recording. Your other answers are safe. Please try again.",
        ));
    }
    // A signed-in learner owns the recording straight away; others are claimed by the answer that uses them.
    let owner = match who {
        Some(Principal::Learner(l)) => Some(l),
        _ => None,
    };
    sqlx::query(
        "INSERT INTO media (id, mime, bytes, learner_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&mime)
    .bind(body.len() as i64)
    .bind(owner)
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&st.pool)
    .await?;
    let url = format!("/v1/media/{id}");
    Ok((StatusCode::CREATED, Json(Uploaded { id, url })))
}

#[utoipa::path(get, path = "/v1/media/{id}", tag = "media", params(("id" = String, Path)),
    responses((status = 200, description = "The recording", content_type = "audio/webm"), (status = 404, body = crate::error::ErrorBody)))]
pub async fn get(
    State(st): State<AppState>,
    MaybeAuth(who): MaybeAuth,
    Path(id): Path<String>,
) -> ApiResult<impl IntoResponse> {
    let id = parse_id(&id)?;
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT mime, learner_id FROM media WHERE id = ?")
            .bind(&id)
            .fetch_optional(&st.pool)
            .await?;
    let (mime, owner) = row.ok_or(ApiError::NotFound("recording"))?;
    if let Some(owner) = owner {
        if !may_play(&st.pool, who.as_ref(), &id, &owner).await? {
            return Err(if who.is_none() {
                ApiError::Unauthorized
            } else {
                ApiError::Forbidden
            });
        }
    }
    let bytes = tokio::fs::read(file_for(&st.cfg.media_dir, &id))
        .await
        .map_err(|_| ApiError::NotFound("recording"))?;
    Ok((
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "private, max-age=3600".to_string()),
        ],
        bytes,
    ))
}

async fn may_play(
    pool: &SqlitePool,
    who: Option<&Principal>,
    media_id: &str,
    owner: &str,
) -> ApiResult<bool> {
    let found: Option<(i64,)> = match who {
        None => None,
        Some(Principal::Learner(l)) => return Ok(l == owner),
        Some(Principal::Employer(e)) => {
            sqlx::query_as(
                "SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id JOIN learners l ON l.id = a.learner_id
                 WHERE j.employer_id = ? AND a.learner_id = ? AND (a.why_audio_path = ? OR l.name_audio = ?) LIMIT 1",
            )
            .bind(e)
            .bind(owner)
            .bind(media_id)
            .bind(media_id)
            .fetch_optional(pool)
            .await?
        }
        Some(Principal::Partner(p)) => {
            sqlx::query_as(
                "SELECT 1 FROM vouches v JOIN learners l ON l.id = v.learner_id
                 WHERE v.partner_id = ? AND v.learner_id = ? AND l.name_audio = ? LIMIT 1",
            )
            .bind(p)
            .bind(owner)
            .bind(media_id)
            .fetch_optional(pool)
            .await?
        }
    };
    Ok(found.is_some())
}

/// Link a recording to the learner whose answer uses it. Fails with a plain error on `field` if the id
/// is unknown or already belongs to someone else.
pub async fn claim(
    pool: &SqlitePool,
    id: &str,
    learner_id: &str,
    field: &'static str,
) -> ApiResult<String> {
    let unknown = || {
        ApiError::invalid(
            "audio_unknown",
            field,
            "We could not find that recording. Please record your answer again.",
        )
    };
    let id = uuid::Uuid::parse_str(id)
        .map_err(|_| unknown())?
        .to_string();
    let res = sqlx::query(
        "UPDATE media SET learner_id = ? WHERE id = ? AND (learner_id IS NULL OR learner_id = ?)",
    )
    .bind(learner_id)
    .bind(&id)
    .bind(learner_id)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(unknown());
    }
    Ok(id)
}

/// Delete the files of every recording a learner owns (rows go with the learner, ON DELETE CASCADE).
pub async fn delete_files_of(
    pool: &SqlitePool,
    media_dir: &str,
    learner_id: &str,
) -> ApiResult<()> {
    let ids: Vec<(String,)> = sqlx::query_as("SELECT id FROM media WHERE learner_id = ?")
        .bind(learner_id)
        .fetch_all(pool)
        .await?;
    for (id,) in ids {
        if let Err(e) = tokio::fs::remove_file(file_for(media_dir, &id)).await {
            tracing::warn!(error = %e, %id, "recording file was already gone");
        }
    }
    Ok(())
}

/// Delete recordings that no answer used, made before `before` (files and rows).
pub async fn delete_unclaimed(pool: &SqlitePool, media_dir: &str, before: &str) -> ApiResult<()> {
    let ids: Vec<(String,)> =
        sqlx::query_as("SELECT id FROM media WHERE learner_id IS NULL AND created_at < ?")
            .bind(before)
            .fetch_all(pool)
            .await?;
    for (id,) in ids {
        let _ = tokio::fs::remove_file(file_for(media_dir, &id)).await;
        sqlx::query("DELETE FROM media WHERE id = ?")
            .bind(&id)
            .execute(pool)
            .await?;
    }
    Ok(())
}
