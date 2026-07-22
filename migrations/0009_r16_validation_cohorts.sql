CREATE TABLE IF NOT EXISTS model_validation_cohorts (
  cohort_id TEXT PRIMARY KEY,
  primary_module TEXT NOT NULL,
  target_market TEXT NOT NULL,
  league TEXT NOT NULL,
  season TEXT NOT NULL,
  champion_revision TEXT NOT NULL,
  challenger_revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COLLECTING',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  promoted_note_id TEXT,
  promoted_at TEXT
);

CREATE TABLE IF NOT EXISTS model_validation_samples (
  cohort_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  champion_run_id TEXT NOT NULL,
  challenger_run_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cohort_id, match_id),
  UNIQUE (cohort_id, champion_run_id),
  UNIQUE (cohort_id, challenger_run_id)
);

CREATE INDEX IF NOT EXISTS idx_model_validation_samples_cohort
  ON model_validation_samples(cohort_id, registered_at);
