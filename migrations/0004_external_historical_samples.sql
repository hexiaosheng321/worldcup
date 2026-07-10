CREATE TABLE IF NOT EXISTS external_historical_samples (
  sample_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_url TEXT,
  source_captured_at TEXT,
  league TEXT NOT NULL,
  season TEXT,
  kickoff_time TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  sporttery_home_sp REAL,
  sporttery_draw_sp REAL,
  sporttery_away_sp REAL,
  euro_home_odds REAL,
  euro_draw_odds REAL,
  euro_away_odds REAL,
  euro_home_prob REAL,
  euro_draw_prob REAL,
  euro_away_prob REAL,
  over25_odds REAL,
  under25_odds REAL,
  asian_handicap REAL,
  asian_home_water REAL,
  asian_away_water REAL,
  bookmaker_count_1x2 INTEGER,
  bookmaker_count_total INTEGER,
  bookmaker_count_asian INTEGER,
  data_quality TEXT NOT NULL DEFAULT 'LOW',
  actual_result TEXT,
  actual_home_goals INTEGER,
  actual_away_goals INTEGER,
  actual_goals INTEGER,
  score TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, league, kickoff_time, home_team, away_team)
);

CREATE INDEX IF NOT EXISTS idx_external_samples_league_time
  ON external_historical_samples(league, kickoff_time DESC);

CREATE INDEX IF NOT EXISTS idx_external_samples_league_quality
  ON external_historical_samples(league, data_quality, kickoff_time DESC);

CREATE INDEX IF NOT EXISTS idx_external_samples_league_handicap
  ON external_historical_samples(league, asian_handicap);

CREATE INDEX IF NOT EXISTS idx_external_samples_league_prob
  ON external_historical_samples(league, euro_home_prob, euro_draw_prob, euro_away_prob);
