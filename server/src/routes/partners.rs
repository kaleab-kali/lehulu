//! Partners (for example AAAPD) confirm learners who have no ID document, and can register a learner who
//! cannot use a phone alone (F18). No document is uploaded. Every partner action needs the partner's token,
//! and a partner sees only its own requests.

use crate::{
    auth::PartnerAuth,
    error::{ApiError, ApiResult},
    routes::{learners, session, AppState},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Learners have a week to agree to a partner's registration.
const REGISTRATION_CODE_HOURS: i64 = 24 * 7;

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
    /// Play at this URL (with the partner's token): the learner saying their name.
    pub name_audio: Option<String>,
    pub phone: String,
    pub requested_at: String,
}

#[derive(Deserialize, ToSchema)]
pub struct Decision {
    /// confirm | decline
    pub decision: String,
}

/// What a partner fills in with the learner beside them. No ID, no disability, no document.
#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NewRegistration {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub name_audio: Option<String>,
    pub phone: String,
    pub language: String,
    #[serde(default)]
    pub access_preferences: Vec<String>,
    #[serde(default)]
    pub support_needs: Vec<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationSent {
    pub message: String,
    /// Only when DEMO_MODE=true: the code texted to the learner.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub demo_code: Option<String>,
}

fn same_partner(who: &PartnerAuth, partner: &str) -> ApiResult<()> {
    if who.0 == partner {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

/// Public: the names learners choose from at sign-up ("who knows you?").
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
    security(("bearer" = [])),
    responses((status = 200, body = [VouchRequest]), (status = 401, body = crate::error::ErrorBody), (status = 403, body = crate::error::ErrorBody)))]
pub async fn list_vouches(
    State(st): State<AppState>,
    who: PartnerAuth,
    Path(partner): Path<String>,
) -> ApiResult<Json<Vec<VouchRequest>>> {
    same_partner(&who, &partner)?;
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
    params(("id" = String, Path), ("learner_id" = String, Path)), security(("bearer" = [])),
    responses((status = 200, description = "Decision saved"), (status = 404, body = crate::error::ErrorBody)))]
pub async fn decide_vouch(
    State(st): State<AppState>,
    who: PartnerAuth,
    Path((partner, learner_id)): Path<(String, String)>,
    Json(d): Json<Decision>,
) -> ApiResult<Json<serde_json::Value>> {
    same_partner(&who, &partner)?;
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
    crate::webhook::notify(
        &st,
        "id.decided",
        serde_json::json!({ "learnerId": learner_id, "idStatus": learner_status }),
    );
    // The partner gets the decision only, not the learner's whole profile.
    Ok(Json(
        serde_json::json!({ "learnerId": learner_id, "idStatus": learner_status }),
    ))
}

/// F18: a partner registers a learner who is with them. Nothing is saved as an account until the learner
/// agrees by entering the code texted to their phone (on the normal sign-in screen).
#[utoipa::path(post, path = "/v1/partners/{id}/registrations", tag = "partners", request_body = NewRegistration,
    params(("id" = String, Path)), security(("bearer" = [])),
    responses((status = 202, body = RegistrationSent), (status = 422, body = crate::error::ErrorBody)))]
pub async fn register_learner(
    State(st): State<AppState>,
    who: PartnerAuth,
    Path(partner): Path<String>,
    Json(r): Json<NewRegistration>,
) -> ApiResult<(StatusCode, Json<RegistrationSent>)> {
    same_partner(&who, &partner)?;
    let as_learner = learners::NewLearner {
        name: r.name.clone(),
        name_audio: r.name_audio.clone(),
        phone: r.phone.clone(),
        language: r.language.clone(),
        dob_ethiopian: None,
        access_preferences: r.access_preferences.clone(),
        support_needs: r.support_needs.clone(),
        id_type: "partner".into(),
        id_number: None,
        partner: Some(partner.clone()),
        share_with_host: false,
    };
    let phone = learners::check(&st, &as_learner, None).await?;
    let (partner_name,): (String,) = sqlx::query_as("SELECT name FROM partners WHERE id = ?")
        .bind(&partner)
        .fetch_one(&st.pool)
        .await?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO partner_registrations (id, partner_id, phone, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&partner)
    .bind(&phone)
    .bind(serde_json::to_string(&as_learner).unwrap_or_default())
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&st.pool)
    .await?;
    let link = format!("{}/jobs/#profile", st.cfg.public_url);
    let code = session::send_code(
        &st,
        &phone,
        Some(&id),
        |c| {
            format!(
                "Lehulu: {partner_name} wants to make a Lehulu account for you with your name and this phone number. \
                 To agree, open {link} and sign in with this number and code {c}. \
                 If you do not agree, ignore this message: nothing is saved."
            )
        },
        REGISTRATION_CODE_HOURS,
    )
    .await?;
    learners::log(
        &st.pool,
        None,
        &format!("partner:{partner}"),
        "registration_sent",
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(RegistrationSent {
            message: format!(
                "We texted {phone}. The account is made only when the learner agrees with the code. They have a week."
            ),
            demo_code: st.cfg.demo_mode.then_some(code),
        }),
    ))
}

/// The learner agreed (their code matched): turn the registration into an account. Returns the learner id.
pub async fn confirm_registration(st: &AppState, registration: &str) -> ApiResult<String> {
    let row: Option<(String, String, String)> =
        sqlx::query_as("SELECT partner_id, phone, payload FROM partner_registrations WHERE id = ?")
            .bind(registration)
            .fetch_optional(&st.pool)
            .await?;
    let (partner, phone, payload) = row.ok_or(ApiError::NotFound("registration"))?;
    let l: learners::NewLearner = serde_json::from_str(&payload).map_err(|_| {
        ApiError::invalid(
            "registration_invalid",
            "code",
            "This registration can no longer be used. Ask your partner to register you again.",
        )
    })?;
    let id = learners::insert(st, &l, &phone, Some(&partner)).await?;
    sqlx::query("DELETE FROM partner_registrations WHERE id = ?")
        .bind(registration)
        .execute(&st.pool)
        .await?;
    learners::log(
        &st.pool,
        Some(&id),
        "learner",
        &format!("agreed_partner_registration:{partner}"),
    )
    .await?;
    crate::webhook::notify(
        st,
        "learner.created",
        serde_json::json!({ "learnerId": id, "language": l.language, "idStatus": "confirmed_by_partner" }),
    );
    Ok(id)
}
