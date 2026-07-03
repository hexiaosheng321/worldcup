CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  match_code TEXT,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TEXT,
  status TEXT DEFAULT 'SCHEDULED',
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  source TEXT,
  captured_at TEXT NOT NULL,
  sporttery_home_sp REAL,
  sporttery_draw_sp REAL,
  sporttery_away_sp REAL,
  handicap REAL,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match_time
  ON odds_snapshots(match_id, captured_at);

CREATE TABLE IF NOT EXISTS locked_predictions (
  lock_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_code TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  kickoff_time TEXT,
  locked_at TEXT NOT NULL,
  lock_type TEXT NOT NULL CHECK(lock_type IN ('PRE_LOCK', 'FINAL_LOCK')),
  model_version TEXT NOT NULL DEFAULT 'V4',
  model_home_prob REAL DEFAULT 0,
  model_draw_prob REAL DEFAULT 0,
  model_away_prob REAL DEFAULT 0,
  recommendation TEXT,
  recommendation_side TEXT,
  final_grade TEXT,
  final_action TEXT,
  confidence_score REAL DEFAULT 0,
  risk_score REAL DEFAULT 0,
  consistency_score REAL,
  sporttery_home_sp REAL,
  sporttery_draw_sp REAL,
  sporttery_away_sp REAL,
  sporttery_home_prob REAL,
  sporttery_draw_prob REAL,
  sporttery_away_prob REAL,
  value_home_gap REAL,
  value_draw_gap REAL,
  value_away_gap REAL,
  asian_handicap REAL,
  asian_home_water REAL,
  asian_away_water REAL,
  euro_home_odds REAL,
  euro_draw_odds REAL,
  euro_away_odds REAL,
  euro_home_prob REAL,
  euro_draw_prob REAL,
  euro_away_prob REAL,
  data_quality TEXT DEFAULT 'MEDIUM',
  reasoning_summary TEXT,
  downgrade_reasons_json TEXT,
  result_status TEXT DEFAULT 'PENDING',
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_locked_predictions_match
  ON locked_predictions(match_id, lock_type, locked_at);

CREATE TABLE IF NOT EXISTS match_results (
  match_id TEXT PRIMARY KEY,
  full_time_home_goals INTEGER NOT NULL,
  full_time_away_goals INTEGER NOT NULL,
  result_1x2 TEXT NOT NULL,
  total_goals INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_base (
  case_id TEXT PRIMARY KEY,
  source_lock_id TEXT NOT NULL UNIQUE,
  match_id TEXT NOT NULL,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TEXT,
  model_version TEXT NOT NULL DEFAULT 'V4',
  model_home_prob REAL DEFAULT 0,
  model_draw_prob REAL DEFAULT 0,
  model_away_prob REAL DEFAULT 0,
  recommendation TEXT,
  recommendation_side TEXT,
  final_grade TEXT,
  final_action TEXT,
  confidence_score REAL DEFAULT 0,
  risk_score REAL DEFAULT 0,
  consistency_score REAL,
  sporttery_home_sp REAL,
  sporttery_draw_sp REAL,
  sporttery_away_sp REAL,
  sporttery_home_prob REAL,
  sporttery_draw_prob REAL,
  sporttery_away_prob REAL,
  value_home_gap REAL,
  value_draw_gap REAL,
  value_away_gap REAL,
  asian_handicap REAL,
  asian_home_water REAL,
  asian_away_water REAL,
  euro_home_odds REAL,
  euro_draw_odds REAL,
  euro_away_odds REAL,
  euro_home_prob REAL,
  euro_draw_prob REAL,
  euro_away_prob REAL,
  data_quality TEXT DEFAULT 'MEDIUM',
  actual_result TEXT NOT NULL,
  actual_goals INTEGER NOT NULL,
  hit_status TEXT NOT NULL,
  failure_tags_json TEXT,
  success_tags_json TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_base_model_quality
  ON case_base(model_version, data_quality);

CREATE INDEX IF NOT EXISTS idx_case_base_recommendation
  ON case_base(recommendation_side, final_grade, hit_status);

CREATE TABLE IF NOT EXISTS model_runs (
  run_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'V4',
  run_type TEXT,
  input_json TEXT,
  output_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS sync_logs (
  sync_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
