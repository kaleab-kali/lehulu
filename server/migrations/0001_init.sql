-- Lehulu schema. There is deliberately no disability or diagnosis column anywhere.

CREATE TABLE learners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('am', 'en')),
  dob_eth_y INTEGER, dob_eth_m INTEGER, dob_eth_d INTEGER,
  access_preferences TEXT NOT NULL DEFAULT '[]',
  id_type TEXT NOT NULL CHECK (id_type IN ('kebele', 'refugee', 'other', 'partner', 'later')),
  id_number TEXT,                 -- optional; TODO(F21): encrypt at rest
  partner_id TEXT REFERENCES partners(id),
  id_status TEXT NOT NULL CHECK (id_status IN ('not_given', 'not_checked', 'waiting_partner', 'confirmed_by_partner')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Separate table so access can be limited to the learner and support roles.
CREATE TABLE support_needs (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  need TEXT NOT NULL,
  PRIMARY KEY (learner_id, need)
);

CREATE TABLE drafts (
  resume_code TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  answers TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT UNIQUE,
  client_secret_hash TEXT
);

CREATE TABLE vouches (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  status TEXT NOT NULL CHECK (status IN ('requested', 'confirmed', 'declined')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (learner_id, partner_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  org TEXT NOT NULL,
  city TEXT,
  remote INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE job_support (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  need TEXT NOT NULL,
  PRIMARY KEY (job_id, need)
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  why_text TEXT,
  why_audio_path TEXT,
  support_shared INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
