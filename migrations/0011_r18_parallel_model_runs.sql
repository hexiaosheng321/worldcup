ALTER TABLE model_runs ADD COLUMN run_role TEXT NOT NULL DEFAULT 'CHAMPION';
ALTER TABLE model_runs ADD COLUMN comparison_group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_model_runs_comparison_group
  ON model_runs(comparison_group_id, run_role, created_at);
