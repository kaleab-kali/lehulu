use crate::{
    error::{ApiError, ApiResult},
    routes::AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::Value;

/// A flow definition (signup, apply, employer, needs). Partner apps can build their own screens from it.
#[utoipa::path(get, path = "/v1/flows/{id}", tag = "flows",
    params(("id" = String, Path, description = "signup | apply | employer | needs")),
    responses((status = 200, description = "The flow JSON"), (status = 404, body = crate::error::ErrorBody)))]
pub async fn get_flow(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    if !id.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
        return Err(ApiError::NotFound("flow"));
    }
    let text = std::fs::read_to_string(format!("{}/{id}.json", st.cfg.flows_dir))
        .map_err(|_| ApiError::NotFound("flow"))?;
    let v: Value = serde_json::from_str(&text).map_err(|_| ApiError::NotFound("flow"))?;
    Ok(Json(v))
}
