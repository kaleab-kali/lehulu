//! Router: /healthz, /v1/* API, /oauth/token, /docs (Swagger UI), /openapi.json, /dev/sms (demo only),
//! and the built web files.

pub mod applications;
pub mod dev;
pub mod drafts;
pub mod flows;
pub mod jobs;
pub mod learners;
pub mod media;
pub mod partners;
pub mod session;

use crate::{
    adapters::sms::SmsSimulator, auth, config::Config, domain::needs::Needs, openapi::ApiDoc,
};
use aes_gcm::Aes256Gcm;
use axum::{
    http::{header, HeaderValue, Method},
    routing::{get, post, put},
    Router,
};
use sqlx::SqlitePool;
use std::{sync::Arc, time::Duration};
use tower::Layer;
use tower_http::{
    compression::{
        predicate::{NotForContentType, Predicate},
        CompressionLayer, DefaultPredicate,
    },
    cors::{AllowOrigin, Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    services::ServeDir,
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub cfg: Arc<Config>,
    pub needs: Arc<Needs>,
    pub sms: Arc<SmsSimulator>,
    /// Encrypts ID numbers at rest.
    pub cipher: Arc<Aes256Gcm>,
}

impl AppState {
    pub fn new(pool: SqlitePool, cfg: Config) -> Self {
        let needs = Needs::load(&cfg.flows_dir);
        let cipher = auth::load_cipher(&cfg);
        Self {
            pool,
            cfg: Arc::new(cfg),
            needs: Arc::new(needs),
            sms: Arc::new(SmsSimulator::default()),
            cipher: Arc::new(cipher),
        }
    }
}

/// CORS for the API. Empty = only pages served by this server; `*` = any site; else a comma-separated list.
/// Tokens travel in the Authorization header (never cookies), so no credentials mode is needed.
fn api_cors(origins: &str) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(Duration::from_secs(3600));
    match origins.trim() {
        "" => CorsLayer::new(),
        "*" => base.allow_origin(Any),
        list => base
            .allow_origin(AllowOrigin::list(list.split(',').filter_map(|o| {
                HeaderValue::from_str(o.trim().trim_end_matches('/')).ok()
            }))),
    }
}

pub fn router(state: AppState) -> Router {
    let public_dir = state.cfg.public_dir.clone();
    let cors = api_cors(&state.cfg.allowed_origins);
    let api = Router::new()
        .route("/flows/{id}", get(flows::get_flow))
        .route("/trial", get(dev::trial))
        .route("/drafts", post(drafts::create_draft))
        .route(
            "/drafts/{code}",
            put(drafts::save_draft).get(drafts::get_draft),
        )
        .route("/auth/code", post(session::request_code))
        .route("/auth/verify", post(session::verify_code))
        .route("/auth/signout", post(session::sign_out))
        .route("/me", get(session::me))
        .route("/link", post(session::link))
        .route("/learners", post(learners::create_learner))
        .route(
            "/learners/{id}",
            get(learners::get_learner)
                .patch(learners::update_learner)
                .delete(learners::delete_learner),
        )
        .route("/learners/{id}/preferences", get(learners::get_preferences))
        .route("/learners/{id}/export", get(learners::export))
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
        )
        .route(
            "/partners/{id}/registrations",
            post(partners::register_learner),
        )
        .layer(cors.clone());
    let oauth = Router::new()
        .route("/oauth/token", post(session::oauth_token))
        .layer(cors);
    // lehulu.js is loaded as a module script and fonts by other sites: static files allow any origin.
    let static_files = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::HEAD])
        .layer(ServeDir::new(public_dir));

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/dev/sms", get(dev::sms_page))
        .nest("/v1", api)
        .merge(oauth)
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .fallback_service(static_files)
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024))
        // Slow, paid mobile data: send text (pages, script, JSON) compressed. Recordings are already compressed.
        .layer(
            CompressionLayer::new().compress_when(
                DefaultPredicate::new()
                    .and(NotForContentType::const_new("audio/"))
                    .and(NotForContentType::const_new("video/"))
                    .and(NotForContentType::const_new("font/woff2")),
            ),
        )
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

    async fn app_with(cfg: Config) -> (Router, AppState) {
        let pool = crate::db::connect(&cfg).await.unwrap();
        crate::db::seed(&pool, &cfg).await.unwrap();
        if cfg.demo_mode {
            crate::db::enable_demo_sign_ins(&pool).await.unwrap();
        }
        let st = AppState::new(pool, cfg);
        (router(st.clone()), st)
    }

    async fn app() -> Router {
        app_with(Config::for_tests()).await.0
    }

    async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Value) {
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }

    async fn call_as(
        app: &Router,
        method: &str,
        uri: &str,
        body: Option<Value>,
        token: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let req = req
            .body(
                body.map(|b| Body::from(b.to_string()))
                    .unwrap_or_else(Body::empty),
            )
            .unwrap();
        send(app, req).await
    }

    async fn call(
        app: &Router,
        method: &str,
        uri: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        call_as(app, method, uri, body, None).await
    }

    /// OAuth 2.0 client credentials with the demo secret `<id>-demo`.
    async fn staff(app: &Router, id: &str) -> String {
        let req = Request::builder()
            .method("POST")
            .uri("/oauth/token")
            .header("content-type", "application/x-www-form-urlencoded")
            .body(Body::from(format!(
                "grant_type=client_credentials&client_id={id}&client_secret={id}-demo"
            )))
            .unwrap();
        let (s, v) = send(app, req).await;
        assert_eq!(s, StatusCode::OK, "{v}");
        v["access_token"].as_str().unwrap().to_string()
    }

    /// Upload raw bytes to /v1/media.
    async fn upload(
        app: &Router,
        mime: &str,
        bytes: &'static [u8],
        token: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder()
            .method("POST")
            .uri("/v1/media")
            .header("content-type", mime);
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        send(app, req.body(Body::from(bytes)).unwrap()).await
    }

    async fn fetch_raw(
        app: &Router,
        uri: &str,
        token: Option<&str>,
    ) -> (StatusCode, String, Vec<u8>) {
        let mut req = Request::builder().uri(uri);
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let res = app
            .clone()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
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

    /// Sign up; returns (learner, session token).
    async fn sign_up(app: &Router, body: Value) -> (Value, String) {
        let (s, l) = call(app, "POST", "/v1/learners", Some(body)).await;
        assert_eq!(s, StatusCode::CREATED, "{l}");
        let token = l["token"].as_str().unwrap().to_string();
        (l, token)
    }

    #[tokio::test]
    async fn sign_up_without_kebele_id_then_partner_confirms() {
        let app = app().await;
        let (l, _) = sign_up(&app, learner("partner", Some("aaapd"))).await;
        assert_eq!(l["idStatus"], "waiting_partner");
        assert_eq!(l["phone"], "0911234567");
        assert_eq!(l["dobGregorian"], "2007-11-15");
        assert!(l["linkToken"].is_string());
        let id = l["id"].as_str().unwrap();

        let aaapd = staff(&app, "aaapd").await;
        let (_, pending) = call_as(
            &app,
            "GET",
            "/v1/partners/aaapd/vouches",
            None,
            Some(&aaapd),
        )
        .await;
        assert_eq!(pending.as_array().unwrap().len(), 1);

        let uri = format!("/v1/partners/aaapd/vouches/{id}");
        let (s, d) = call_as(
            &app,
            "POST",
            &uri,
            Some(json!({ "decision": "confirm" })),
            Some(&aaapd),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(d["idStatus"], "confirmed_by_partner");
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
        let (_, tok) = sign_up(&app, learner("later", None)).await;
        for share in [true, false] {
            let (s, _) = call_as(
                &app,
                "POST",
                "/v1/applications",
                Some(json!({ "jobId": "job-support-agent", "why": "I like it", "shareSupport": share })),
                Some(&tok),
            )
            .await;
            assert_eq!(s, StatusCode::CREATED);
        }
        let emp = staff(&app, "afro-connect").await;
        let (_, apps) = call_as(
            &app,
            "GET",
            "/v1/jobs/job-support-agent/applications",
            None,
            Some(&emp),
        )
        .await;
        let apps = apps.as_array().unwrap();
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0]["learnerPhone"], "0911234567");
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
    async fn strangers_and_other_organisations_are_refused() {
        let app = app().await;
        let (l, tok) = sign_up(&app, learner("partner", Some("aaapd"))).await;
        let (other, other_tok) = sign_up(&app, learner("later", None)).await;
        let id = l["id"].as_str().unwrap();
        let (s, _) = call_as(
            &app,
            "POST",
            "/v1/applications",
            Some(json!({ "jobId": "job-support-agent", "why": "x", "shareSupport": true })),
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED);

        // Applications: only the employer that posted the job.
        let apps = "/v1/jobs/job-support-agent/applications";
        assert_eq!(
            call(&app, "GET", apps, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let wrong_employer = staff(&app, "lideta-tech").await;
        let (s, e) = call_as(&app, "GET", apps, None, Some(&wrong_employer)).await;
        assert_eq!(s, StatusCode::FORBIDDEN);
        assert_eq!(e["error"]["code"], "forbidden");
        // A learner token is not an employer token.
        assert_eq!(
            call_as(&app, "GET", apps, None, Some(&tok)).await.0,
            StatusCode::FORBIDDEN
        );

        // Partner requests: only that partner.
        let vouches = "/v1/partners/aaapd/vouches";
        assert_eq!(
            call(&app, "GET", vouches, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let tib = staff(&app, "tomorrow-is-better").await;
        assert_eq!(
            call_as(&app, "GET", vouches, None, Some(&tib)).await.0,
            StatusCode::FORBIDDEN
        );
        let decide = format!("/v1/partners/aaapd/vouches/{id}");
        assert_eq!(
            call_as(
                &app,
                "POST",
                &decide,
                Some(json!({"decision":"confirm"})),
                Some(&tib)
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );

        // Learner accounts: only the learner.
        let me = format!("/v1/learners/{id}");
        assert_eq!(
            call(&app, "GET", &me, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call_as(&app, "GET", &me, None, Some(&other_tok)).await.0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call_as(&app, "DELETE", &me, None, Some(&other_tok)).await.0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call_as(&app, "GET", &me, None, Some("made-up-token"))
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        let (s, mine) = call_as(&app, "GET", "/v1/me", None, Some(&other_tok)).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(mine["id"], other["id"]);

        // Posting jobs: employers only.
        let job = json!({ "title": "Clerk", "supportOffered": ["sr"] });
        assert_eq!(
            call(&app, "POST", "/v1/jobs", Some(job.clone())).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (s, j) = call_as(&app, "POST", "/v1/jobs", Some(job), Some(&wrong_employer)).await;
        assert_eq!(s, StatusCode::CREATED);
        assert_eq!(j["org"], "Lideta Tech");
        assert_eq!(j["employerId"], "lideta-tech");

        // Partner registration: partners only, as themselves.
        let reg = json!({ "name": "Abebe", "phone": "0911000000", "language": "am" });
        assert_eq!(
            call_as(
                &app,
                "POST",
                "/v1/partners/aaapd/registrations",
                Some(reg),
                Some(&tib)
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn client_credentials_errors_and_basic_auth() {
        let app = app().await;
        let form = |body: &'static str| {
            Request::builder()
                .method("POST")
                .uri("/oauth/token")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(body))
                .unwrap()
        };
        let (s, e) = send(
            &app,
            form("grant_type=client_credentials&client_id=aaapd&client_secret=wrong"),
        )
        .await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "invalid_client");
        let (_, e) = send(&app, form("grant_type=password")).await;
        assert_eq!(e["error"]["code"], "unsupported_grant_type");
        // HTTP Basic: "aaapd:aaapd-demo"
        let req = Request::builder()
            .method("POST")
            .uri("/oauth/token")
            .header("content-type", "application/x-www-form-urlencoded")
            .header("authorization", "Basic YWFhcGQ6YWFhcGQtZGVtbw==")
            .body(Body::from("grant_type=client_credentials"))
            .unwrap();
        let (s, t) = send(&app, req).await;
        assert_eq!(s, StatusCode::OK, "{t}");
        assert_eq!(t["token_type"], "Bearer");
        assert_eq!(t["scope"], "partner:aaapd");
        assert_eq!(t["expires_in"], 12 * 3600);
    }

    #[tokio::test]
    async fn learner_signs_in_by_sms_code_and_a_shared_phone_chooses_the_account() {
        let app = app().await;
        let (first, _) = sign_up(&app, learner("later", None)).await;
        let mut second_body = learner("later", None);
        second_body["name"] = json!("Meron Tesfaye");
        let (second, _) = sign_up(&app, second_body).await;

        // A number with no account gets the same message and no code (no account enumeration).
        let (s, none) = call(
            &app,
            "POST",
            "/v1/auth/code",
            Some(json!({ "phone": "0700000000" })),
        )
        .await;
        assert_eq!(s, StatusCode::ACCEPTED);
        assert!(none["demoCode"].is_null());

        let (_, sent) = call(
            &app,
            "POST",
            "/v1/auth/code",
            Some(json!({ "phone": "0911 234 567" })),
        )
        .await;
        let code = sent["demoCode"].as_str().unwrap().to_string();
        assert_eq!(code.len(), 6);
        assert_eq!(
            none["message"].as_str().unwrap().replace("0700000000", "X"),
            sent["message"].as_str().unwrap().replace("0911234567", "X")
        );

        // Wrong code: a plain error with an example.
        let (s, e) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0911234567", "code": "000000" })),
        )
        .await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "code");

        // Two accounts on one phone: choose, then sign in.
        let (_, v) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0911234567", "code": code })),
        )
        .await;
        let choose = v["choose"].as_array().unwrap();
        assert_eq!(choose.len(), 2);
        let (s, v) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0911234567", "code": code, "learnerId": second["id"] })),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "{v}");
        let tok = v["signedIn"]["token"].as_str().unwrap().to_string();
        let (_, me) = call_as(&app, "GET", "/v1/me", None, Some(&tok)).await;
        assert_eq!(me["id"], second["id"]);
        assert_ne!(me["id"], first["id"]);

        // The code works once.
        let (s, _) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0911234567", "code": code, "learnerId": second["id"] })),
        )
        .await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);

        // Sign out ends this session only.
        assert_eq!(
            call_as(&app, "POST", "/v1/auth/signout", None, Some(&tok))
                .await
                .0,
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            call_as(&app, "GET", "/v1/me", None, Some(&tok)).await.0,
            StatusCode::UNAUTHORIZED
        );

        // Too many wrong tries: ask for a new code.
        let (_, sent) = call(
            &app,
            "POST",
            "/v1/auth/code",
            Some(json!({ "phone": "0911234567" })),
        )
        .await;
        let good = sent["demoCode"].as_str().unwrap().to_string();
        for _ in 0..5 {
            call(
                &app,
                "POST",
                "/v1/auth/verify",
                Some(json!({ "phone": "0911234567", "code": "111111" })),
            )
            .await;
        }
        let (_, e) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0911234567", "code": good })),
        )
        .await;
        assert_eq!(e["error"]["code"], "too_many_tries");
    }

    #[tokio::test]
    async fn partner_registers_a_learner_who_agrees_with_the_code() {
        let app = app().await;
        let aaapd = staff(&app, "aaapd").await;
        let (s, r) = call_as(
            &app,
            "POST",
            "/v1/partners/aaapd/registrations",
            Some(
                json!({ "name": "Abebe Kebede", "phone": "0912 345 678", "language": "am",
                         "accessPreferences": ["listen"], "supportNeeds": ["sr"] }),
            ),
            Some(&aaapd),
        )
        .await;
        assert_eq!(s, StatusCode::ACCEPTED, "{r}");
        let code = r["demoCode"].as_str().unwrap().to_string();

        // Nothing is an account until the learner agrees.
        let (_, none) = call(
            &app,
            "POST",
            "/v1/auth/code",
            Some(json!({ "phone": "0912345678" })),
        )
        .await;
        assert!(none["demoCode"].is_null());

        let (s, v) = call(
            &app,
            "POST",
            "/v1/auth/verify",
            Some(json!({ "phone": "0912345678", "code": code })),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "{v}");
        assert_eq!(v["registered"], true);
        assert_eq!(v["signedIn"]["name"], "Abebe Kebede");
        assert_eq!(v["signedIn"]["idStatus"], "confirmed_by_partner");
        assert_eq!(v["signedIn"]["partner"], "aaapd");
    }

    #[tokio::test]
    async fn link_token_works_once_and_host_sees_preferences_only_with_consent() {
        let app = app().await;
        let mut agreed = learner("later", None);
        agreed["shareWithHost"] = json!(true);
        let (l, tok) = sign_up(&app, agreed).await;
        let link = json!({ "linkToken": l["linkToken"] });
        let (s, linked) = call(&app, "POST", "/v1/link", Some(link.clone())).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(linked["learnerId"], l["id"]);
        assert_eq!(linked["accessPreferences"], json!(["listen", "sign"]));
        assert!(linked.get("supportNeeds").is_none());
        assert_eq!(
            call(&app, "POST", "/v1/link", Some(link)).await.0,
            StatusCode::UNAUTHORIZED
        );
        let prefs = format!("/v1/learners/{}/preferences", l["id"].as_str().unwrap());
        assert_eq!(
            call_as(&app, "GET", &prefs, None, Some(&tok)).await.0,
            StatusCode::OK
        );

        let (l2, tok2) = sign_up(&app, learner("later", None)).await;
        let (_, linked) = call(
            &app,
            "POST",
            "/v1/link",
            Some(json!({ "linkToken": l2["linkToken"] })),
        )
        .await;
        assert!(linked["accessPreferences"].is_null());
        let prefs = format!("/v1/learners/{}/preferences", l2["id"].as_str().unwrap());
        assert_eq!(
            call_as(&app, "GET", &prefs, None, Some(&tok2)).await.0,
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn id_numbers_are_encrypted_in_the_database() {
        let (app, st) = app_with(Config::for_tests()).await;
        let mut body = learner("kebele", None);
        body["idNumber"] = json!("AA-445566");
        let (l, tok) = sign_up(&app, body).await;
        assert_eq!(l["idNumber"], "AA-445566");
        let (raw,): (String,) = sqlx::query_as("SELECT id_number FROM learners WHERE id = ?")
            .bind(l["id"].as_str().unwrap())
            .fetch_one(&st.pool)
            .await
            .unwrap();
        assert!(!raw.contains("445566"));
        let (_, me) = call_as(&app, "GET", "/v1/me", None, Some(&tok)).await;
        assert_eq!(me["idNumber"], "AA-445566");
    }

    #[tokio::test]
    async fn demo_secrets_stop_working_when_demo_mode_is_turned_off() {
        let (app, st) = app_with(Config::for_tests()).await;
        staff(&app, "aaapd").await;
        let mut prod = Config::for_tests();
        prod.demo_mode = false;
        crate::db::seed_if_empty(&st.pool, &prod).await.unwrap();
        let req = Request::builder()
            .method("POST")
            .uri("/oauth/token")
            .header("content-type", "application/x-www-form-urlencoded")
            .body(Body::from(
                "grant_type=client_credentials&client_id=aaapd&client_secret=aaapd-demo",
            ))
            .unwrap();
        let (s, _) = send(&app, req).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn trial_system_lists_its_test_organisations() {
        let app = app().await;
        let (s, v) = call(&app, "GET", "/v1/trial", None).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(v["partners"][0]["id"], "aaapd");
        assert_eq!(v["employers"][0]["name"], "Afro Connect");
    }

    #[tokio::test]
    async fn text_is_sent_compressed_for_slow_connections() {
        let app = app().await;
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/openapi.json")
                    .header("accept-encoding", "gzip")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.headers()["content-encoding"], "gzip");
    }

    #[tokio::test]
    async fn learner_exports_everything_held_and_only_their_own() {
        let app = app().await;
        let (l, tok) = sign_up(&app, learner("later", None)).await;
        let (_, other) = sign_up(&app, learner("later", None)).await;
        let id = l["id"].as_str().unwrap();
        let (s, _) = call_as(
            &app,
            "POST",
            "/v1/applications",
            Some(json!({ "jobId": "job-web-dev", "why": "I like the web.", "shareSupport": true })),
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED);
        let (s, e) = call_as(
            &app,
            "GET",
            &format!("/v1/learners/{id}/export"),
            None,
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "{e}");
        assert_eq!(e["learner"]["supportNeeds"], json!(["sign", "sr"]));
        assert_eq!(e["applications"][0]["jobTitle"], "Junior web developer");
        assert!(e["consentLog"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["action"] == "signed_up"));
        assert_eq!(
            call_as(
                &app,
                "GET",
                &format!("/v1/learners/{id}/export"),
                None,
                Some(&other)
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(&app, "GET", &format!("/v1/learners/{id}/export"), None)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn webhook_tells_the_host_without_personal_data_and_is_signed() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(String, String)>();
        let hook = Router::new().route(
            "/hook",
            post(move |headers: axum::http::HeaderMap, body: String| {
                let tx = tx.clone();
                async move {
                    let sig = headers
                        .get("x-lehulu-signature")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    let _ = tx.send((sig, body));
                    "ok"
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, hook).await.unwrap() });
        let mut cfg = Config::for_tests();
        cfg.webhook_url = format!("http://{addr}/hook");
        cfg.webhook_secret = "s3cret".into();
        let (app, _) = app_with(cfg).await;
        let (l, _) = sign_up(&app, learner("later", None)).await;
        let (sig, body) = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(sig, crate::webhook::sign("s3cret", body.as_bytes()));
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["event"], "learner.created");
        assert_eq!(v["data"]["learnerId"], l["id"]);
        for private in ["Hanna", "0911", "sr", "phone", "supportNeeds"] {
            assert!(!body.contains(private), "webhook leaked {private}: {body}");
        }
    }

    #[tokio::test]
    async fn retention_deletes_accounts_nobody_uses() {
        let (app, st) = app_with(Config::for_tests()).await;
        let (l, tok) = sign_up(&app, learner("later", None)).await;
        let (keep, _) = sign_up(&app, learner("later", None)).await;
        sqlx::query("UPDATE learners SET last_active_at = '2000-01-01T00:00:00+00:00', updated_at = '2000-01-01T00:00:00+00:00' WHERE id = ?")
            .bind(l["id"].as_str().unwrap())
            .execute(&st.pool)
            .await
            .unwrap();
        assert_eq!(learners::retention(&st).await.unwrap(), 1);
        assert_eq!(
            call_as(&app, "GET", "/v1/me", None, Some(&tok)).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM learners WHERE id = ?")
            .bind(keep["id"].as_str().unwrap())
            .fetch_one(&st.pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn cors_only_for_listed_sites_and_demo_pages_off_in_production() {
        let mut cfg = Config::for_tests();
        cfg.allowed_origins = "https://savanna.example".into();
        cfg.demo_mode = false;
        let (app, _) = app_with(cfg).await;
        let preflight = |origin: &str| {
            Request::builder()
                .method("OPTIONS")
                .uri("/v1/jobs")
                .header("origin", origin)
                .header("access-control-request-method", "POST")
                .header(
                    "access-control-request-headers",
                    "authorization,content-type",
                )
                .body(Body::empty())
                .unwrap()
        };
        let res = app
            .clone()
            .oneshot(preflight("https://savanna.example"))
            .await
            .unwrap();
        assert_eq!(
            res.headers().get("access-control-allow-origin").unwrap(),
            "https://savanna.example"
        );
        let res = app
            .clone()
            .oneshot(preflight("https://evil.example"))
            .await
            .unwrap();
        assert!(res.headers().get("access-control-allow-origin").is_none());
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/healthz")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            res.headers().get("x-content-type-options").unwrap(),
            "nosniff"
        );

        // No SMS simulator and no demo sign-ins in production.
        let (s, _, _) = fetch_raw(&app, "/dev/sms", None).await;
        assert_eq!(s, StatusCode::NOT_FOUND);
        let (s, _, _) = fetch_raw(&app, "/v1/trial", None).await;
        assert_eq!(s, StatusCode::NOT_FOUND);
        let req = Request::builder()
            .method("POST")
            .uri("/oauth/token")
            .header("content-type", "application/x-www-form-urlencoded")
            .body(Body::from(
                "grant_type=client_credentials&client_id=aaapd&client_secret=aaapd-demo",
            ))
            .unwrap();
        assert_eq!(send(&app, req).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn voice_answers_reach_partner_and_employer_then_delete_removes_them() {
        let app = app().await;
        let (s, name_rec) = upload(&app, "audio/webm", b"fake-opus-name", None).await;
        assert_eq!(s, StatusCode::CREATED, "{name_rec}");
        let name_id = name_rec["id"].as_str().unwrap().to_string();
        assert_eq!(name_rec["url"], format!("/v1/media/{name_id}"));

        // Name given by voice only: the typed name may be empty.
        let mut body = learner("partner", Some("aaapd"));
        body["name"] = json!("");
        body["nameAudio"] = json!(name_id);
        let (l, tok) = sign_up(&app, body).await;
        assert_eq!(l["nameAudio"], name_id.as_str());
        let lid = l["id"].as_str().unwrap().to_string();

        // Now owned: strangers cannot play it, the partner it was sent to can.
        let name_url = format!("/v1/media/{name_id}");
        assert_eq!(
            fetch_raw(&app, &name_url, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let aaapd = staff(&app, "aaapd").await;
        let (_, pending) = call_as(
            &app,
            "GET",
            "/v1/partners/aaapd/vouches",
            None,
            Some(&aaapd),
        )
        .await;
        assert_eq!(pending[0]["nameAudio"], name_url);
        assert_eq!(
            fetch_raw(&app, &name_url, Some(&aaapd)).await.0,
            StatusCode::OK
        );
        let tib = staff(&app, "tomorrow-is-better").await;
        assert_eq!(
            fetch_raw(&app, &name_url, Some(&tib)).await.0,
            StatusCode::FORBIDDEN
        );

        // Why by voice only (uploaded while signed in: owned at once).
        let (_, why_rec) =
            upload(&app, "audio/ogg; codecs=opus", b"fake-opus-why", Some(&tok)).await;
        let why_id = why_rec["id"].as_str().unwrap().to_string();
        let why_url = format!("/v1/media/{why_id}");
        assert_eq!(
            fetch_raw(&app, &why_url, None).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (s, e) = call_as(
            &app,
            "POST",
            "/v1/applications",
            Some(
                json!({ "jobId": "job-support-agent", "whyAudio": why_id, "shareSupport": false }),
            ),
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED, "{e}");
        let emp = staff(&app, "afro-connect").await;
        let (_, apps) = call_as(
            &app,
            "GET",
            "/v1/jobs/job-support-agent/applications",
            None,
            Some(&emp),
        )
        .await;
        let a = &apps[0];
        assert_eq!(a["whyAudio"], why_url);
        assert_eq!(a["learnerNameAudio"], name_url);
        assert!(a["why"].is_null());

        let (s, mime, bytes) = fetch_raw(&app, &why_url, Some(&emp)).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(mime, "audio/ogg; codecs=opus");
        assert_eq!(bytes, b"fake-opus-why");
        let other_emp = staff(&app, "lideta-tech").await;
        assert_eq!(
            fetch_raw(&app, &why_url, Some(&other_emp)).await.0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            fetch_raw(&app, &why_url, Some(&tok)).await.0,
            StatusCode::OK
        );

        // Right to erasure covers recordings and sessions.
        let (s, _) = call_as(
            &app,
            "DELETE",
            &format!("/v1/learners/{lid}"),
            None,
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::NO_CONTENT);
        for url in [&name_url, &why_url] {
            let (s, _, _) = fetch_raw(&app, url, Some(&emp)).await;
            assert_eq!(s, StatusCode::NOT_FOUND);
        }
        assert_eq!(
            call_as(&app, "GET", "/v1/me", None, Some(&tok)).await.0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn voice_upload_errors_are_plain() {
        let app = app().await;
        let (s, e) = upload(&app, "text/plain", b"hello", None).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_type");
        let (s, e) = upload(&app, "audio/webm", b"", None).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_empty");
        let (s, _, _) = fetch_raw(&app, "/v1/media/../../secret", None).await;
        assert_eq!(s, StatusCode::NOT_FOUND);

        // No typed name and no recording: a plain error on the name field.
        let mut body = learner("later", None);
        body["name"] = json!(" ");
        let (s, e) = call(&app, "POST", "/v1/learners", Some(body)).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "name");

        // An application needs words or a recording.
        let (_, tok) = sign_up(&app, learner("later", None)).await;
        let (s, e) = call_as(
            &app,
            "POST",
            "/v1/applications",
            Some(json!({ "jobId": "job-support-agent", "shareSupport": false })),
            Some(&tok),
        )
        .await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["field"], "why");
    }

    #[tokio::test]
    async fn a_recording_belongs_to_one_learner() {
        let app = app().await;
        let (_, rec) = upload(&app, "audio/webm", b"mine", None).await;
        let (_, a) = sign_up(&app, learner("later", None)).await;
        let (_, b) = sign_up(&app, learner("later", None)).await;
        let apply =
            json!({ "jobId": "job-support-agent", "whyAudio": rec["id"], "shareSupport": false });
        let (s, _) = call_as(
            &app,
            "POST",
            "/v1/applications",
            Some(apply.clone()),
            Some(&a),
        )
        .await;
        assert_eq!(s, StatusCode::CREATED);
        let (s, e) = call_as(&app, "POST", "/v1/applications", Some(apply), Some(&b)).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "audio_unknown");
        assert_eq!(e["error"]["field"], "whyAudio");
    }

    #[tokio::test]
    async fn continue_later_text_has_a_resume_link_and_is_limited() {
        let (app, st) = app_with(Config::for_tests()).await;
        let draft = json!({ "flowId": "signup", "stepIndex": 2, "answers": { "name": "Hanna" }, "sendLinkTo": "0911234567" });
        let (s, d) = call(&app, "POST", "/v1/drafts", Some(draft.clone())).await;
        assert_eq!(s, StatusCode::CREATED);
        let code = d["resumeCode"].as_str().unwrap().to_string();
        assert_eq!(code.len(), 8);
        let msg = &st.sms.messages()[0].text;
        assert!(msg.contains(&format!("?resume={code}")), "{msg}");
        let uri = format!("/v1/drafts/{code}");
        for _ in 0..2 {
            assert_eq!(
                call(&app, "PUT", &uri, Some(draft.clone())).await.0,
                StatusCode::OK
            );
        }
        let (s, e) = call(&app, "PUT", &uri, Some(draft)).await;
        assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(e["error"]["code"], "too_many_texts");
        let (_, back) = call(&app, "GET", &uri, None).await;
        assert_eq!(back["answers"]["name"], "Hanna");
    }
}
