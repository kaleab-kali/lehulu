//! Lehulu server: REST API (/v1), OpenAPI docs (/docs) and the built web component, in one binary.
//! Commands: `lehulu serve` (default), `lehulu healthcheck` (used by Docker), `lehulu seed`.

mod adapters;
mod config;
mod db;
mod domain;
mod error;
mod openapi;
mod routes;

use std::{
    io::{Read, Write},
    net::TcpStream,
    time::Duration,
};

#[tokio::main]
async fn main() {
    let cmd = std::env::args().nth(1).unwrap_or_else(|| "serve".into());
    match cmd.as_str() {
        "serve" => serve().await,
        "healthcheck" => std::process::exit(healthcheck()),
        "seed" => {
            let cfg = config::Config::from_env();
            let pool = db::connect(&cfg)
                .await
                .expect("Could not open the database");
            db::seed(&pool, &cfg).await.expect("Seeding failed");
            println!("Seed data loaded.");
        }
        other => {
            eprintln!("Unknown command `{other}`. Use: serve | healthcheck | seed");
            std::process::exit(2);
        }
    }
}

async fn serve() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();
    let cfg = config::Config::from_env();
    let pool = db::connect(&cfg)
        .await
        .expect("Could not open the SQLite database. Check DATABASE_URL.");
    db::seed_if_empty(&pool, &cfg)
        .await
        .expect("Seeding failed");
    let state = routes::AppState::new(pool, cfg.clone());
    let app = routes::router(state);
    let listener = tokio::net::TcpListener::bind(&cfg.bind)
        .await
        .unwrap_or_else(|e| panic!("Could not listen on {}: {e}", cfg.bind));
    tracing::info!(
        "Lehulu is running on http://{}  (API docs: /docs)",
        cfg.bind
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

/// Tiny HTTP check without extra dependencies. Exit code 0 = healthy.
fn healthcheck() -> i32 {
    let cfg = config::Config::from_env();
    let port = cfg.bind.rsplit(':').next().unwrap_or("8080");
    let addr = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_secs(2))
    else {
        return 1;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    if stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return 1;
    }
    let mut buf = [0u8; 64];
    match stream.read(&mut buf) {
        Ok(n) if String::from_utf8_lossy(&buf[..n]).contains(" 200 ") => 0,
        _ => 1,
    }
}
