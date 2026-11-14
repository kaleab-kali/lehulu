//! Jobs with the support each one offers. `Accept: application/ld+json` returns schema.org JobPosting (Level 3).

use crate::{
    domain::validate,
    error::{ApiError, ApiResult},
    routes::AppState,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub title: String,
    pub org: String,
    pub city: Option<String>,
    pub remote: bool,
    /// Same ids as a learner's support needs (flows/needs.json)
    pub support_offered: Vec<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewJob {
    pub title: String,
    pub org: String,
    pub city: Option<String>,
    #[serde(default)]
    pub remote: bool,
    #[serde(default)]
    pub support_offered: Vec<String>,
}

pub async fn all_jobs(st: &AppState) -> ApiResult<Vec<Job>> {
    let rows: Vec<(String, String, String, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, title, org, city, remote FROM jobs ORDER BY created_at DESC, title",
    )
    .fetch_all(&st.pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for (id, title, org, city, remote) in rows {
        let support: Vec<(String,)> =
            sqlx::query_as("SELECT need FROM job_support WHERE job_id = ? ORDER BY need")
                .bind(&id)
                .fetch_all(&st.pool)
                .await?;
        out.push(Job {
            id,
            title,
            org,
            city,
            remote,
            support_offered: support.into_iter().map(|(n,)| n).collect(),
        });
    }
    Ok(out)
}

pub fn json_ld(j: &Job) -> serde_json::Value {
    json!({
        "@context": { "@vocab": "https://schema.org/", "lehulu": "https://lehulu.example/ns#" },
        "@type": "JobPosting",
        "identifier": j.id,
        "title": j.title,
        "hiringOrganization": { "@type": "Organization", "name": j.org },
        "jobLocationType": if j.remote { Some("TELECOMMUTE") } else { None },
        "jobLocation": j.city.as_ref().map(|c| json!({ "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": c, "addressCountry": "ET" } })),
        "lehulu:supportOffered": j.support_offered,
    })
}

#[utoipa::path(get, path = "/v1/jobs", tag = "jobs",
    responses((status = 200, body = [Job], description = "Send `Accept: application/ld+json` for schema.org JobPosting")))]
pub async fn list_jobs(State(st): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    let jobs = all_jobs(&st).await?;
    let wants_ld = headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("application/ld+json"));
    if wants_ld {
        let body = serde_json::Value::Array(jobs.iter().map(json_ld).collect());
        return Ok((
            [(header::CONTENT_TYPE, "application/ld+json")],
            body.to_string(),
        )
            .into_response());
    }
    Ok(Json(jobs).into_response())
}

#[utoipa::path(post, path = "/v1/jobs", tag = "jobs", request_body = NewJob,
    responses((status = 201, body = Job), (status = 422, body = crate::error::ErrorBody)))]
pub async fn create_job(
    State(st): State<AppState>,
    Json(j): Json<NewJob>,
) -> ApiResult<(StatusCode, Json<Job>)> {
    // TODO(F13): require an employer access token (OAuth 2.0 client credentials).
    validate::required(&j.title, "title", "Enter a job title.")?;
    validate::required(&j.org, "org", "Enter the organisation name.")?;
    for n in &j.support_offered {
        if !st.needs.contains(n) {
            return Err(ApiError::invalid(
                "need_unknown",
                "supportOffered",
                "Choose support from the list.",
            ));
        }
    }
    let id = format!("job-{}", uuid::Uuid::new_v4());
    sqlx::query(
        "INSERT INTO jobs (id, title, org, city, remote, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(j.title.trim())
    .bind(j.org.trim())
    .bind(&j.city)
    .bind(j.remote)
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&st.pool)
    .await?;
    for n in &j.support_offered {
        sqlx::query("INSERT OR IGNORE INTO job_support (job_id, need) VALUES (?, ?)")
            .bind(&id)
            .bind(n)
            .execute(&st.pool)
            .await?;
    }
    let job = all_jobs(&st)
        .await?
        .into_iter()
        .find(|x| x.id == id)
        .ok_or(ApiError::NotFound("job"))?;
    Ok((StatusCode::CREATED, Json(job)))
}
