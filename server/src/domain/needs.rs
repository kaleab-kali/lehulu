//! The shared list of needs (flows/needs.json). Learner support needs and employer offers both use it,
//! so they always match. It contains practical supports only, never diagnoses.

use serde::Deserialize;

#[derive(Deserialize)]
struct NeedsFile {
    needs: Vec<NeedEntry>,
}

#[derive(Deserialize)]
struct NeedEntry {
    id: String,
}

#[derive(Clone, Debug)]
pub struct Needs {
    ids: Vec<String>,
}

impl Needs {
    pub fn load(flows_dir: &str) -> Self {
        let path = format!("{flows_dir}/needs.json");
        let text =
            std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("Could not read {path}: {e}"));
        let file: NeedsFile =
            serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path} is not valid: {e}"));
        Self {
            ids: file.needs.into_iter().map(|n| n.id).collect(),
        }
    }

    pub fn contains(&self, id: &str) -> bool {
        self.ids.iter().any(|n| n == id)
    }
}

/// How a learner uses their phone (first sign-up question). Must match flows/signup.json.
pub const WAYS: [&str; 6] = ["listen", "speak", "pictures", "big", "sign", "data"];
