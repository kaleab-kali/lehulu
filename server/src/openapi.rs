//! OpenAPI 3.1 document generated from the handlers. Served at /openapi.json, Swagger UI at /docs.

use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Lehulu API",
        version = "1.0.0",
        description = "Accessible sign-up, profile and job applications. Errors always use { error: { code, message, field } }."
    ),
    paths(
        crate::routes::flows::get_flow,
        crate::routes::drafts::create_draft,
        crate::routes::drafts::save_draft,
        crate::routes::drafts::get_draft,
        crate::routes::learners::create_learner,
        crate::routes::learners::get_learner,
        crate::routes::learners::update_learner,
        crate::routes::learners::delete_learner,
        crate::routes::learners::get_preferences,
        crate::routes::jobs::list_jobs,
        crate::routes::jobs::create_job,
        crate::routes::applications::create_application,
        crate::routes::applications::list_for_job,
        crate::routes::media::upload,
        crate::routes::media::get,
        crate::routes::partners::list_partners,
        crate::routes::partners::list_vouches,
        crate::routes::partners::decide_vouch,
    ),
    tags(
        (name = "learners", description = "Sign-up and profile. No disability field exists."),
        (name = "drafts", description = "Autosave and continue later. No time limits."),
        (name = "jobs", description = "Jobs and the support they offer. JSON-LD available."),
        (name = "applications", description = "Support needs shared only with consent, per job."),
        (name = "partners", description = "Partners confirm learners without ID documents."),
        (name = "media", description = "Voice answers. The recording itself is the answer; no speech service needed."),
        (name = "flows", description = "The JSON question flows used by every screen.")
    )
)]
pub struct ApiDoc;
