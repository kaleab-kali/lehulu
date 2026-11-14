//! SQLite connection, migrations (embedded at compile time) and seed data.

use crate::config::Config;
use serde::Deserialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use std::str::FromStr;

pub async fn connect(cfg: &Config) -> Result<SqlitePool, sqlx::Error> {
    if let Some(rest) = cfg.database_url.strip_prefix("sqlite://") {
        let path = rest.split('?').next().unwrap_or(rest);
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    let in_memory = cfg.database_url.contains(":memory:");
    let opts = SqliteConnectOptions::from_str(&cfg.database_url)?
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        // an in-memory database exists per connection, so tests use exactly one
        .max_connections(if in_memory { 1 } else { 5 })
        .connect_with(opts)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedJob {
    id: String,
    title: String,
    org: String,
    city: Option<String>,
    #[serde(default)]
    remote: bool,
    support_offered: Vec<String>,
}

#[derive(Deserialize)]
struct SeedPartner {
    id: String,
    name: String,
}

pub async fn seed_if_empty(pool: &SqlitePool, cfg: &Config) -> Result<(), sqlx::Error> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM partners")
        .fetch_one(pool)
        .await?;
    if n == 0 {
        seed(pool, cfg).await?;
    }
    Ok(())
}

pub async fn seed(pool: &SqlitePool, cfg: &Config) -> Result<(), sqlx::Error> {
    let read = |name: &str| std::fs::read_to_string(format!("{}/{name}", cfg.seed_dir));
    let now = chrono::Utc::now().to_rfc3339();
    if let Ok(text) = read("partners.json") {
        let partners: Vec<SeedPartner> =
            serde_json::from_str(&text).expect("seed/partners.json is not valid");
        for p in partners {
            sqlx::query("INSERT OR IGNORE INTO partners (id, name) VALUES (?, ?)")
                .bind(&p.id)
                .bind(&p.name)
                .execute(pool)
                .await?;
        }
    }
    if let Ok(text) = read("jobs.json") {
        let jobs: Vec<SeedJob> = serde_json::from_str(&text).expect("seed/jobs.json is not valid");
        for j in jobs {
            sqlx::query("INSERT OR IGNORE INTO jobs (id, title, org, city, remote, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(&j.id)
                .bind(&j.title)
                .bind(&j.org)
                .bind(&j.city)
                .bind(j.remote)
                .bind(&now)
                .execute(pool)
                .await?;
            for need in j.support_offered {
                sqlx::query("INSERT OR IGNORE INTO job_support (job_id, need) VALUES (?, ?)")
                    .bind(&j.id)
                    .bind(&need)
                    .execute(pool)
                    .await?;
            }
        }
    }
    Ok(())
}
