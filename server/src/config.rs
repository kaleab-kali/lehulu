//! All settings come from environment variables (see .env.example). Defaults are safe for production;
//! `DEMO_MODE=true` turns on demo sign-ins and the SMS simulator page for local runs and judging.

// sms_adapter and stt_enabled are read by adapters that are not built yet.
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct Config {
    pub bind: String,
    pub database_url: String,
    pub public_dir: String,
    pub flows_dir: String,
    pub seed_dir: String,
    pub media_dir: String,
    pub sms_adapter: String,
    pub stt_enabled: bool,
    pub retention_days: i64,
    /// Demo sign-ins (`<id>-demo` secrets), sign-in codes shown on screen, and /dev/sms. Never in production.
    pub demo_mode: bool,
    /// Sites allowed to call the API from the browser: comma-separated origins, or `*`. Empty = same site only.
    pub allowed_origins: String,
    /// Where learners open Lehulu; used in SMS links (`?resume=CODE`).
    pub public_url: String,
    /// 64 hex characters (32 bytes) used to encrypt ID numbers. If empty, a key is kept in `key_file`.
    pub data_key: String,
    pub key_file: String,
    /// The host's address for events (learner.created, application.created, ...). Empty = no webhook.
    pub webhook_url: String,
    /// Signs each webhook body (X-Lehulu-Signature: sha256=HMAC).
    pub webhook_secret: String,
}

impl Config {
    pub fn from_env() -> Self {
        let get = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        Self {
            bind: get("BIND", "127.0.0.1:8080"),
            database_url: get("DATABASE_URL", "sqlite://data/lehulu.db?mode=rwc"),
            public_dir: get("PUBLIC_DIR", "../web/dist"),
            flows_dir: get("FLOWS_DIR", "../flows"),
            seed_dir: get("SEED_DIR", "seed"),
            media_dir: get("MEDIA_DIR", "data/media"),
            sms_adapter: get("SMS_ADAPTER", "simulator"),
            stt_enabled: get("STT_ENABLED", "false") == "true",
            retention_days: get("RETENTION_DAYS", "365").parse().unwrap_or(365),
            demo_mode: get("DEMO_MODE", "false") == "true",
            allowed_origins: get("ALLOWED_ORIGINS", ""),
            public_url: get("PUBLIC_URL", "http://localhost:8080")
                .trim_end_matches('/')
                .to_string(),
            data_key: get("DATA_KEY", ""),
            key_file: get("KEY_FILE", "data/lehulu.key"),
            webhook_url: get("WEBHOOK_URL", ""),
            webhook_secret: get("WEBHOOK_SECRET", ""),
        }
    }

    #[cfg(test)]
    pub fn for_tests() -> Self {
        let mut c = Self::from_env();
        let tmp = std::env::temp_dir().join(format!("lehulu-test-{}", uuid::Uuid::new_v4()));
        c.database_url = "sqlite::memory:".into();
        c.flows_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../flows").into();
        c.seed_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/seed").into();
        c.media_dir = tmp.join("media").to_string_lossy().into_owned();
        c.key_file = tmp.join("lehulu.key").to_string_lossy().into_owned();
        c.data_key = String::new();
        c.demo_mode = true;
        c.webhook_url = String::new();
        c
    }
}
