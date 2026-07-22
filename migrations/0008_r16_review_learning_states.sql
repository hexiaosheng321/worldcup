-- R16 review-learning governance: normalize legacy labels into the enforced
-- state machine. Progression rules are validated by the API before updates.
UPDATE model_upgrade_notes
SET status = 'PROPOSED'
WHERE status = 'SHADOW_PENDING';

UPDATE model_upgrade_notes
SET status = 'OBSERVATION'
WHERE status IN ('OPEN', 'OBSERVED', 'OBSERVATION_ONLY');

