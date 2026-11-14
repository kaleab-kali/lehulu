//! Router: /healthz, /v1/* API, /docs (Swagger UI), /openapi.json, /dev/sms, and the built web files.

pub mod applications;
pub mod dev;
pub mod drafts;
pub mod flows;
pub mod jobs;
pub mod learners;
pub mod media;
pub mod partners;

use crate::{adapters::sms::SmsSimulator, config::Config, domain::needs::Needs, openapi::ApiDoc};
use axum::{
    routing::{get, post, put},
    Router,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::{
    cors::CorsLayer, limit::RequestBodyLimitLayer, services::ServeDir, trace::TraceLayer,
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub cfg: Arc<Config>,
    pub needs: Arc<Needs>,
    pub sms: Arc<SmsSimulator>,
}

impl AppState {
    pub fn new(pool: SqlitePool, cfg: Config) -> Self {
        let needs = Needs::load(&cfg.flows_dir);
        Self {
            pool,
            cfg: Arc::new(cfg),
            needs: Arc::new(needs),
            sms: Arc::new(SmsSimulator::default()),
        }
    }
}

pub fn router(state: AppState) -> Router {
    let public_dir = state.cfg.public_dir.clone();
    let api = Router::new()
        .route("/flows/{id}", get(flows::get_flow))
        .route("/drafts", post(drafts::create_draft))
        .route(
            "/drafts/{code}",
            put(drafts::save_draft).get(drafts::get_draft),
        )
        .route("/learners", post(learners::create_learner))
        .route(
            "/learners/{id}",
            get(learners::get_learner)
                .patch(learners::update_learner)
                .delete(learners::delete_learner),
        )
        .route("/learners/{id}/preferences", get(learners::get_preferences))
        .route("/jobs", get(jobs::list_jobs).post(jobs::create_job))
        .route("/jobs/{id}/applications", get(applications::list_for_job))
        .route("/applications", post(applications::create_application))
        .route("/media", post(media::upload))
        .route("/media/{id}", get(media::get))
        .route("/partners", get(partners::list_partners))
        .route("/partners/{id}/vouches", get(partners::list_vouches))
        .route(
            "/partners/{id}/vouches/{learner_id}",
            post(partners::decide_vouch),
        );

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/dev/sms", get(dev::sms_page))
        .nest("/v1", api)
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .fallback_service(ServeDir::new(public_dir))
        // Other sites load lehulu.js, fonts and the API cross-origin (Level 1 and 2).
        // TODO(F13): restrict origins with an ALLOWED_ORIGINS setting for production.
        .layer(CorsLayer::permissive())
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tower::ServiceExt;

    async fn app() -> Router {
        let cfg = Config::for_tests();
        let pool = crate::db::connect(&cfg).await.unwrap();
        crate::db::seed(&pool, &cfg).await.unwrap();
        router(AppState::new(pool, cfg))
    }

    async fn call(
        app: &Router,
        method: &str,
        uri: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let req = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json")
            .body(
                body.map(|b| Body::from(b.to_string()))
                    .unwrap_or_else(Body::empty),
            )
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    /// Upload raw bytes to /v1/media; returns (status, body, content).
    async fn upload(app: &Router, mime: &str, bytes: &'static [u8]) -> (StatusCode, Value) {
        let req = Request::builder()
            .method("POST")
            .uri("/v1/media")
            .header("content-type", mime)
            .body(Body::from(bytes))
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    async fn fetch_raw(app: &Router, uri: &str) -> (StatusCode, String, Vec<u8>) {
        let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let mime = res
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();
        let bytes = res.into_body().collect().await.unwrap().to_bytes().to_vec();
        (status, mime, bytes)
    }

    fn learner(id_type: &str, partner: Option<&str>) -> Value {
        json!({
            "name": "Hanna Tesfaye", "phone": "0911 234 567", "language": "am",
            "dobEthiopian": { "d": 5, "m": 3, "y": 2000 },
            "accessPreferences": ["listen", "sign"], "supportNeeds": ["sr", "sign"],
            "idType": id_type, "partner": partner
        })
    }

    #[tokio::test]
    async fn sign_up_without_kebele_id_then_partner_confirms() {
        let app = app().await;
        let (s, l) = call(
            &app,
            "POST",
            "/v1/learners",
            Some(learner("partner", Some("aaapd"))),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED, "{l}");
        assert_eq!(l["idStatus"], "waiting_partner");
        assert_eq!(l["phone"], "0911234567");
        assert_eq!(l["dobGregorian"], "2007-11-15");
        let id = l["id"].as_str().unwrap();

        let (_, pending) = call(&app, "GET", "/v1/partners/aaapd/vouches", None).await;
        assert_eq!(pending.as_array().unwrap().len(), 1);

        let uri = format!("/v1/partners/aaapd/vouches/{id}");
        let (s, l) = call(&app, "POST", &uri, Some(json!({ "decision": "confirm" }))).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(l["idStatus"], "confirmed_by_partner");
    }

    #[tokio::test]
    async fn plain_error_with_field() {
        let app = app().await;
        let mut bad = learner("later", None);
        bad["phone"] = json!("123");
        let (s, e) = call(&app, "POST", "/v1/learners", Some(bad)).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "phone");
        assert!(e["error"]["message"]
            .as_str()
            .unwrap()
            .contains("0911 234 567"));
    }

    #[tokio::test]
    async fn employer_sees_support_only_when_shared() {
        let app = app().await;
        let (_, l) = call(&app, "POST", "/v1/learners", Some(learner("later", None))).await;
        let lid = l["id"].as_str().unwrap().to_string();
        for share in [true, false] {
            let (s, _) = call(
                &app,
                "POST",
                "/v1/applications",
                Some(json!({ "jobId": "job-support-agent", "learnerId": lid, "why": "I like it", "shareSupport": share })),
            )
            .await;
            assert_eq!(s, StatusCode::CREATED);
        }
        let (_, apps) = call(&app, "GET", "/v1/jobs/job-support-agent/applications", None).await;
        let apps = apps.as_array().unwrap();
        assert_eq!(apps.len(), 2);
        assert_eq!(
            apps.iter()
                .filter(|a| a["supportRequested"].is_array())
                .count(),
            1
        );
        assert_eq!(
            apps.iter()
                .filter(|a| a["supportRequested"].is_null())
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn voice_answers_reach_partner_and_employer_then_delete_removes_them() {
        let app = app().await;
        let (s, name_rec) = upload(&app, "audio/webm", b"fake-opus-name").await;
        assert_eq!(s, StatusCode::CREATED, "{name_rec}");
        let name_id = name_rec["id"].as_str().unwrap().to_string();
        assert_eq!(name_rec["url"], format!("/v1/media/{name_id}"));

        // Name given by voice only: the typed name may be empty.
        let mut body = learner("partner", Some("aaapd"));
        body["name"] = json!("");
        body["nameAudio"] = json!(name_id);
        let (s, l) = call(&app, "POST", "/v1/learners", Some(body)).await;
        assert_eq!(s, StatusCode::CREATED, "{l}");
        assert_eq!(l["nameAudio"], name_id.as_str());
        let lid = l["id"].as_str().unwrap().to_string();

        let (_, pending) = call(&app, "GET", "/v1/partners/aaapd/vouches", None).await;
        assert_eq!(pending[0]["nameAudio"], format!("/v1/media/{name_id}"));

        // Why by voice only.
        let (_, why_rec) = upload(&app, "audio/ogg; codecs=opus", b"fake-opus-why").await;
        let why_id = why_rec["id"].as_str().unwrap().to_string();
        let (s, e) = call(
            &app,
            "POST",
            "/v1/applications",
            Some(json!({ "jobId": "job-support-agent", "learnerId": lid, "whyAudio": why_id, "shareSupport": false })),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED, "{e}");
        let (_, apps) = call(&app, "GET", "/v1/jobs/job-support-agent/applications", None).await;
        let a = &apps[0];
        assert_eq!(a["whyAudio"], format!("/v1/media/{why_id}"));
        assert_eq!(a["learnerNameAudio"], format!("/v1/media/{name_id}"));
        assert!(a["why"].is_null());

        let (s, mime, bytes) = fetch_raw(&app, &format!("/v1/media/{why_id}")).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(mime, "audio/ogg; codecs=opus");
        assert_eq!(bytes, b"fake-opus-why");

        // Right to erasure covers recordings.
        let (s, _) = call(&app, "DELETE", &format!("/v1/learners/{lid}"), None).await;
        assert_eq!(s, StatusCode::NO_CONTENT);
        for id in [&name_id, &why_id] {
            let (s, _, _) = fetch_raw(&app, &format!("/v1/media/{id}")).await;
            assert_eq!(s, StatusCode::NOT_FOUND);
        }
    }

    #[tokio::test]
    async fn voice_upload_errors_are_plain() {
        let app = app().await;
        let (s, e) = upload(&app, "text/plain", b"hello").await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_type");
        let (s, e) = upload(&app, "audio/webm", b"").await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_empty");
        let (s, _, _) = fetch_raw(&app, "/v1/media/../../secret").await;
        assert_eq!(s, StatusCode::NOT_FOUND);

        // No typed name and no recording: a plain error on the name field.
        let mut body = learner("later", None);
        body["name"] = json!(" ");
        let (s, e) = call(&app, "POST", "/v1/learners", Some(body)).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "name");

        // An application needs words or a recording.
        let (_, l) = call(&app, "POST", "/v1/learners", Some(learner("later", None))).await;
        let (s, e) = call(
            &app,
            "POST",
            "/v1/applications",
            Some(json!({ "jobId": "job-support-agent", "learnerId": l["id"], "shareSupport": false })),
        )
        .await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "why");
    }

    #[tokio::test]
    async fn a_recording_belongs_to_one_learner() {
        let app = app().await;
        let (_, rec) = upload(&app, "audio/webm", b"mine").await;
        let (_, a) = call(&app, "POST", "/v1/learners", Some(learner("later", None))).await;
        let (_, b) = call(&app, "POST", "/v1/learners", Some(learner("later", None))).await;
        let apply = |who: &Value| json!({ "jobId": "job-support-agent", "learnerId": who["id"], "whyAudio": rec["id"], "shareSupport": false });
        let (s, _) = call(&app, "POST", "/v1/applications", Some(apply(&a))).await;
        assert_eq!(s, StatusCode::CREATED);
        let (s, e) = call(&app, "POST", "/v1/applications", Some(apply(&b))).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_unknown");
        assert_eq!(e["error"]["field"], "whyAudio");
    }
}
