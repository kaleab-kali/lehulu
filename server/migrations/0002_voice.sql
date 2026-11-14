-- Voice answers (F8). The recording itself is the answer. Files live in MEDIA_DIR; each row records
-- who the recording belongs to, so "delete my account" removes the files too.
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

-- A name given by voice (the typed name may then be empty).
ALTER TABLE learners ADD COLUMN name_audio TEXT; -- a media id
