-- Sign-in for learners (phone + SMS code), partners and employers (OAuth 2.0 client credentials),
-- partner registration with the learner's consent (F18), host consent (F19) and retention (F21).
-- Tokens and codes are stored only as SHA-256 hashes.

CREATE TABLE employers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT UNIQUE,
  client_secret_hash TEXT
);

-- The employer that posted the job. Only that employer can read its applications.
ALTER TABLE jobs ADD COLUMN employer_id TEXT REFERENCES employers(id);

CREATE TABLE access_tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('learner', 'partner', 'employer', 'link')),
  subject TEXT NOT NULL,
  expires_at TEXT,               -- NULL for learner sessions: no time limits for learners
  created_at TEXT NOT NULL
);
CREATE INDEX access_tokens_subject ON access_tokens (kind, subject);

CREATE TABLE login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  registration_id TEXT,          -- set when a partner registered this learner (F18)
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX login_codes_phone ON login_codes (phone);

-- A partner's registration waits here until the learner agrees with the code sent to their phone.
-- Nothing becomes an account without that agreement.
CREATE TABLE partner_registrations (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  phone TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- The learner agreed that the host platform (for example Savanna) may adapt to their language and
-- how they use their phone. Support needs are never shared with the host.
ALTER TABLE learners ADD COLUMN share_with_host INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learners ADD COLUMN last_active_at TEXT;

-- "Continue later" texts per saved form, to stop the SMS feature being used to message strangers.
ALTER TABLE drafts ADD COLUMN sms_sent INTEGER NOT NULL DEFAULT 0;
