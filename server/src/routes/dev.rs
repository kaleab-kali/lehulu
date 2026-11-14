//! SMS simulator page: shows "continue later" and consent messages that a real gateway would send.

use crate::routes::AppState;
use axum::{extract::State, response::Html};

pub async fn sms_page(State(st): State<AppState>) -> Html<String> {
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
    Html(format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
         <title>SMS simulator · Lehulu</title><style>body{{font:16px/1.5 system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem}}li{{border:1px solid #ccc;border-radius:8px;padding:.5rem 1rem;margin:.5rem 0;list-style:none}}h2{{font-size:1rem;margin:.25rem 0}}</style></head>\
         <body><main><h1>SMS simulator</h1><p>Messages a real SMS gateway would send. Newest first. Reload to update.</p>{body}</main></body></html>"
    ))
}
