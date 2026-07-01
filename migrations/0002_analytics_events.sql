CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,
  session_id TEXT,
  visitor_hash TEXT,
  referrer TEXT,
  country TEXT,
  user_agent TEXT,
  payload_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_page
  ON analytics_events(page_path, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type
  ON analytics_events(event_type, created_at);

