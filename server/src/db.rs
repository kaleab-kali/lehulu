//! SQLite connection, migrations (embedded at compile time), seed data, demo sign-ins and backups.

use crate::{auth, config::Config};
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
    employer_id: Option<String>,
    city: Option<String>,
    #[serde(default)]
    remote: bool,
    support_offered: Vec<String>,
}

#[derive(Deserialize)]
struct SeedOrg {
    id: String,
    name: String,
}

pub async fn seed_if_empty(pool: &SqlitePool, cfg: &Config) -> Result<(), sqlx::Error> {
    let (partners,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM partners")
        .fetch_one(pool)
        .await?;
    let (employers,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM employers")
        .fetch_one(pool)
        .await?;
    // Databases from before employer sign-in have partners but no employers: seed those too.
    if partners == 0 || employers == 0 {
        seed(pool, cfg).await?;
    }
    if cfg.demo_mode {
        enable_demo_sign_ins(pool).await?;
    } else {
        disable_demo_sign_ins(pool).await?;
    }
    Ok(())
}

/// Outside DEMO_MODE, `<id>-demo` secrets left from a demo run must stop working.
pub async fn disable_demo_sign_ins(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for table in ["partners", "employers"] {
        let rows: Vec<(String, Option<String>)> =
            sqlx::query_as(&format!("SELECT id, client_secret_hash FROM {table}"))
                .fetch_all(pool)
                .await?;
        for (id, secret_hash) in rows {
            if secret_hash.as_deref() == Some(auth::hash(&auth::demo_secret(&id)).as_str()) {
                sqlx::query(&format!(
                    "UPDATE {table} SET client_id = NULL, client_secret_hash = NULL WHERE id = ?"
                ))
                .bind(&id)
                .execute(pool)
                .await?;
            }
        }
    }
    Ok(())
}

pub async fn seed(pool: &SqlitePool, cfg: &Config) -> Result<(), sqlx::Error> {
    let read = |name: &str| std::fs::read_to_string(format!("{}/{name}", cfg.seed_dir));
    let now = chrono::Utc::now().to_rfc3339();
    for (file, table) in [
        ("partners.json", "partners"),
        ("employers.json", "employers"),
    ] {
        if let Ok(text) = read(file) {
            let orgs: Vec<SeedOrg> = serde_json::from_str(&text)
                .unwrap_or_else(|e| panic!("seed/{file} is not valid: {e}"));
            for o in orgs {
                sqlx::query(&format!(
                    "INSERT OR IGNORE INTO {table} (id, name) VALUES (?, ?)"
                ))
                .bind(&o.id)
                .bind(&o.name)
                .execute(pool)
                .await?;
            }
        }
    }
    if let Ok(text) = read("jobs.json") {
        let jobs: Vec<SeedJob> = serde_json::from_str(&text).expect("seed/jobs.json is not valid");
        for j in jobs {
            sqlx::query("INSERT OR IGNORE INTO jobs (id, title, org, city, remote, employer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .bind(&j.id)
                .bind(&j.title)
                .bind(&j.org)
                .bind(&j.city)
                .bind(j.remote)
                .bind(&j.employer_id)
                .bind(&now)
                .execute(pool)
                .await?;
            // Jobs seeded before employers existed get their owner.
            sqlx::query("UPDATE jobs SET employer_id = ? WHERE id = ? AND employer_id IS NULL")
                .bind(&j.employer_id)
                .bind(&j.id)
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

/// DEMO_MODE only: every partner and employer without credentials can sign in with
/// client ID `<id>` and secret `<id>-demo`.
pub async fn enable_demo_sign_ins(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for table in ["partners", "employers"] {
        let ids: Vec<(String,)> = sqlx::query_as(&format!(
            "SELECT id FROM {table} WHERE client_secret_hash IS NULL"
        ))
        .fetch_all(pool)
        .await?;
        for (id,) in ids {
            sqlx::query(&format!(
                "UPDATE {table} SET client_id = ?, client_secret_hash = ? WHERE id = ?"
            ))
            .bind(&id)
            .bind(auth::hash(&auth::demo_secret(&id)))
            .bind(&id)
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

/// `lehulu create-client partner|employer <id> [name]`: create or reset an organisation's credentials.
/// Returns the new secret, shown once.
pub async fn create_client(
    pool: &SqlitePool,
    kind: &str,
    id: &str,
    name: Option<&str>,
) -> Result<String, String> {
    let table = match kind {
        "partner" => "partners",
        "employer" => "employers",
        _ => return Err("The kind must be `partner` or `employer`.".into()),
    };
    let secret = auth::new_secret();
    sqlx::query(&format!(
        "INSERT INTO {table} (id, name, client_id, client_secret_hash) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET client_id = excluded.client_id, client_secret_hash = excluded.client_secret_hash,
         name = COALESCE(?, {table}.name)"
    ))
    .bind(id)
    .bind(name.unwrap_or(id))
    .bind(id)
    .bind(auth::hash(&secret))
    .bind(name)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    // Old tokens stop working when the secret changes.
    sqlx::query("DELETE FROM access_tokens WHERE kind = ? AND subject = ?")
        .bind(kind)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(secret)
}

/// `lehulu backup <file>`: a consistent copy of the database while the server runs.
pub async fn backup(pool: &SqlitePool, file: &str) -> Result<(), sqlx::Error> {
    sqlx::query("VACUUM INTO ?")
        .bind(file)
        .execute(pool)
        .await?;
    Ok(())
}
