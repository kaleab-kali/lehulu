//! SMS simulator page: shows "continue later", sign-in and consent messages that a real gateway would send.
//! Only in DEMO_MODE: the page shows sign-in codes, so it must never exist in production.

use crate::{error::ApiError, routes::AppState};
use axum::{extract::State, response::Html};

#[derive(serde::Serialize)]
pub struct Org {
    id: String,
    name: String,
}

#[derive(serde::Serialize)]
pub struct Trial {
    partners: Vec<Org>,
    employers: Vec<Org>,
}

/// DEMO_MODE only: the test organisations, so the partner and employer screens can offer a one-click
/// "Continue as …" instead of asking a visitor for a secret. 404 on a real system.
pub async fn trial(State(st): State<AppState>) -> Result<axum::Json<Trial>, ApiError> {
    if !st.cfg.demo_mode {
        return Err(ApiError::NotFound("page"));
    }
    let list = |table: &'static str| {
        let pool = st.pool.clone();
        async move {
            sqlx::query_as::<_, (String, String)>(&format!(
                "SELECT id, name FROM {table} WHERE client_secret_hash IS NOT NULL ORDER BY rowid"
            ))
            .fetch_all(&pool)
            .await
            .map(|rows| {
                rows.into_iter()
                    .map(|(id, name)| Org { id, name })
                    .collect::<Vec<_>>()
            })
        }
    };
    Ok(axum::Json(Trial {
        partners: list("partners").await?,
        employers: list("employers").await?,
    }))
}

pub async fn sms_page(State(st): State<AppState>) -> Result<Html<String>, ApiError> {
    if !st.cfg.demo_mode {
        return Err(ApiError::NotFound("page"));
    }
    let esc = |s: &str| {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    };
    let items: String = st
        .sms
        .messages()
        .iter()
        .map(|m| {
            format!(
                "<li><h2>To {}</h2><p>{}</p><p><small>{}</small></p></li>",
                esc(&m.to),
                esc(&m.text),
                esc(&m.sent_at)
            )
        })
        .collect();
    let body = if items.is_empty() {
        "<p>No messages yet.</p>".to_string()
    } else {
        format!("<ul>{items}</ul>")
    };
    Ok(Html(format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
         <title>SMS simulator · Lehulu</title><style>body{{font:16px/1.5 system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem}}li{{border:1px solid #ccc;border-radius:8px;padding:.5rem 1rem;margin:.5rem 0;list-style:none}}h2{{font-size:1rem;margin:.25rem 0}}</style></head>\
         <body><main><h1>SMS simulator</h1><p>Messages a real SMS gateway would send. Newest first. Reload to update.</p>{body}</main></body></html>"
    )))
}
