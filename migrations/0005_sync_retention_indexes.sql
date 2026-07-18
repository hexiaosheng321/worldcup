CREATE INDEX IF NOT EXISTS idx_odds_snapshots_captured_at
  ON odds_snapshots(captured_at);

CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at
  ON sync_logs(created_at);
