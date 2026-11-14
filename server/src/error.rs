//! One error format for every endpoint:
//! `{ "error": { "code": "phone_invalid", "message": "plain words + how to fix", "field": "phone" } }`

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{message}")]
    Invalid {
        code: &'static str,
        message: String,
        field: Option<&'static str>,
    },
    #[error("not found: {0}")]
    NotFound(&'static str),
    #[allow(dead_code)] // used once partner/employer auth lands (F13)
    #[error("forbidden")]
    Forbidden,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

impl ApiError {
    pub fn invalid(code: &'static str, field: &'static str, message: impl Into<String>) -> Self {
        Self::Invalid {
            code,
            message: message.into(),
            field: Some(field),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Serialize, ToSchema)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message, field) = match self {
            ApiError::Invalid {
                code,
                message,
                field,
            } => (
                StatusCode::UNPROCESSABLE_ENTITY,
                code.to_string(),
                message,
                field.map(str::to_string),
            ),
            ApiError::NotFound(what) => (
                StatusCode::NOT_FOUND,
                "not_found".into(),
                format!("We could not find that {what}."),
                None,
            ),
            ApiError::Forbidden => (
                StatusCode::FORBIDDEN,
                "forbidden".into(),
                "You do not have access to this.".into(),
                None,
            ),
            ApiError::Db(e) => {
                tracing::error!(error = %e, "database error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "server_error".into(),
                    "Something went wrong on our side. Your answers are saved. Please try again."
                        .into(),
                    None,
                )
            }
        };
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail {
                    code,
                    message,
                    field,
                },
            }),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
