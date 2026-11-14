//! SMS behind an adapter. The simulator keeps messages in memory and shows them at /dev/sms,
//! so the demo works with no gateway and no paid service. A real gateway can implement `send` later.

use serde::Serialize;
use std::sync::Mutex;
use utoipa::ToSchema;

#[derive(Clone, Serialize, ToSchema)]
pub struct SmsMessage {
    pub to: String,
    pub text: String,
    pub sent_at: String,
}

#[derive(Default)]
pub struct SmsSimulator {
    outbox: Mutex<Vec<SmsMessage>>,
}

impl SmsSimulator {
    pub fn send(&self, to: &str, text: &str) {
        tracing::info!(to, "SMS (simulator): {text}");
        self.outbox.lock().unwrap().push(SmsMessage {
            to: to.into(),
            text: text.into(),
            sent_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    pub fn messages(&self) -> Vec<SmsMessage> {
        let mut m = self.outbox.lock().unwrap().clone();
        m.reverse();
        m
    }
}
