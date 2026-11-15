//! OpenAPI 3.1 document generated from the handlers. Served at /openapi.json, Swagger UI at /docs.

use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};

struct BearerAuth;

impl Modify for BearerAuth {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "bearer",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .description(Some(
                        "Learners: the `token` from sign-up or `/v1/auth/verify`. Partners and employers: `access_token` from `/oauth/token`.",
                    ))
                    .build(),
            ),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Lehulu API",
        version = "1.1.0",
        description = "Accessible sign-up, profile and job applications. Errors always use { error: { code, message, field } }. \
Learners sign in with their phone and an SMS code; partners and employers use OAuth 2.0 client credentials. \
Webhooks: set WEBHOOK_URL and the server POSTs { event, at, data } for learner.created, learner.deleted, \
application.created and id.decided, signed in the X-Lehulu-Signature header (sha256=HMAC of the body with WEBHOOK_SECRET). \
Webhook data never contains names, phone numbers or support needs."
    ),
    modifiers(&BearerAuth),
    paths(
        crate::routes::session::oauth_token,
        crate::routes::session::request_code,
        crate::routes::session::verify_code,
        crate::routes::session::sign_out,
        crate::routes::session::me,
        crate::routes::session::link,
        crate::routes::flows::get_flow,
        crate::routes::drafts::create_draft,
        crate::routes::drafts::save_draft,
        crate::routes::drafts::get_draft,
        crate::routes::learners::create_learner,
        crate::routes::learners::get_learner,
        crate::routes::learners::update_learner,
        crate::routes::learners::delete_learner,
        crate::routes::learners::get_preferences,
        crate::routes::learners::export,
        crate::routes::jobs::list_jobs,
        crate::routes::jobs::create_job,
        crate::routes::applications::create_application,
        crate::routes::applications::list_for_job,
        crate::routes::media::upload,
        crate::routes::media::get,
        crate::routes::partners::list_partners,
        crate::routes::partners::list_vouches,
        crate::routes::partners::decide_vouch,
        crate::routes::partners::register_learner,
    ),
    tags(
        (name = "auth", description = "Sign in. Learner sessions never time out; partner and employer tokens last 12 hours."),
        (name = "learners", description = "Sign-up and profile. No disability field exists. Only the learner can read their account."),
        (name = "drafts", description = "Autosave and continue later. No time limits."),
        (name = "jobs", description = "Jobs and the support they offer. JSON-LD available. Employers post jobs."),
        (name = "applications", description = "Support needs shared only with consent, per job. Only the job's employer reads them."),
        (name = "partners", description = "Partners confirm learners without ID documents and register learners with their consent."),
        (name = "media", description = "Voice answers. The recording itself is the answer; no speech service needed."),
        (name = "flows", description = "The JSON question flows used by every screen.")
    )
)]
pub struct ApiDoc;
