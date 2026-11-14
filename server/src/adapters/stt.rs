//! Speech-to-text (optional, OFF by default: STT_ENABLED=false).
//! The voice recording itself is always kept as the answer, so nothing depends on this.
//! TODO(stretch): implement with whisper-rs behind a cargo feature, return text for review and editing only.

#[allow(dead_code)]
pub fn enabled(cfg: &crate::config::Config) -> bool {
    cfg.stt_enabled
}
