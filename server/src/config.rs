//! All settings come from environment variables (see .env.example). Defaults work for local dev.

// media_dir, sms_adapter and retention_days are read by features F8, F18 and F21.
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
        }
    }

    #[cfg(test)]
    pub fn for_tests() -> Self {
        let mut c = Self::from_env();
        c.database_url = "sqlite::memory:".into();
        c.flows_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../flows").into();
        c.seed_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/seed").into();
        c
    }
}
