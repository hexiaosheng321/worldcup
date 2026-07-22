ALTER TABLE locked_predictions ADD COLUMN model_run_id TEXT;

UPDATE locked_predictions
SET model_run_id = COALESCE(
  json_extract(payload_json, '$.modelRunId'),
  json_extract(payload_json, '$.model_run_id'),
  json_extract(payload_json, '$.sportteryPrediction.modelRunId')
)
WHERE model_run_id IS NULL;

ALTER TABLE case_base ADD COLUMN case_role TEXT NOT NULL DEFAULT 'CHAMPION_FORMAL';
ALTER TABLE case_base ADD COLUMN source_lock_type TEXT NOT NULL DEFAULT 'FINAL_LOCK';
ALTER TABLE case_base ADD COLUMN preferred_at_settlement INTEGER NOT NULL DEFAULT 1;

UPDATE case_base
SET source_lock_type = COALESCE((
      SELECT lp.lock_type FROM locked_predictions lp WHERE lp.lock_id = case_base.source_lock_id
    ), 'FINAL_LOCK'),
    preferred_at_settlement = CASE WHEN source_lock_id = (
      SELECT preferred.lock_id
      FROM locked_predictions preferred
      WHERE preferred.match_id = case_base.match_id
      ORDER BY preferred.locked_at DESC, preferred.lock_id DESC
      LIMIT 1
    ) THEN 1 ELSE 0 END;

UPDATE case_base
SET case_role = CASE
  WHEN source_lock_type = 'FINAL_LOCK' AND preferred_at_settlement = 1 THEN 'CHAMPION_FORMAL'
  ELSE 'SHADOW_OBSERVATION'
END;

CREATE INDEX IF NOT EXISTS idx_case_base_role_league
  ON case_base(case_role, league, created_at);

CREATE INDEX IF NOT EXISTS idx_locked_predictions_model_run
  ON locked_predictions(model_run_id);
