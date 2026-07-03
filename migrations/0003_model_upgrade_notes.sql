CREATE TABLE IF NOT EXISTS model_upgrade_notes (
  note_id TEXT PRIMARY KEY,
  source_case_id TEXT NOT NULL UNIQUE,
  source_lock_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'V4',
  league TEXT,
  trigger_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'OPEN',
  title TEXT NOT NULL,
  diagnosis_json TEXT,
  recommendation_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  adopted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_model_upgrade_notes_model_status
  ON model_upgrade_notes(model_version, status, created_at);

CREATE INDEX IF NOT EXISTS idx_model_upgrade_notes_match
  ON model_upgrade_notes(match_id, created_at);
