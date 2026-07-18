-- Compact legacy five-minute duplicates while retaining every model-relevant state:
-- opening, closing, every SP change, and one heartbeat per UTC hour.
WITH base AS (
  SELECT
    snapshot_id,
    match_id,
    captured_at,
    json_array(
      json_extract(payload_json, '$.normal.win'),
      json_extract(payload_json, '$.normal.draw'),
      json_extract(payload_json, '$.normal.lose'),
      json_extract(payload_json, '$.handicap'),
      json_extract(payload_json, '$.handicapOdds.win'),
      json_extract(payload_json, '$.handicapOdds.draw'),
      json_extract(payload_json, '$.handicapOdds.lose'),
      json_extract(payload_json, '$.totalGoalsOdds'),
      json_extract(payload_json, '$.scoreOdds'),
      json_extract(payload_json, '$.halfFullOdds')
    ) AS odds_key
  FROM odds_snapshots
), analyzed AS (
  SELECT
    snapshot_id,
    odds_key,
    LAG(odds_key) OVER (PARTITION BY match_id ORDER BY captured_at) AS previous_key,
    ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY captured_at) AS first_rank,
    ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY captured_at DESC) AS last_rank,
    ROW_NUMBER() OVER (
      PARTITION BY match_id, substr(captured_at, 1, 13)
      ORDER BY captured_at
    ) AS hourly_rank
  FROM base
)
DELETE FROM odds_snapshots
WHERE snapshot_id IN (
  SELECT snapshot_id
  FROM analyzed
  WHERE first_rank <> 1
    AND last_rank <> 1
    AND hourly_rank <> 1
    AND odds_key IS previous_key
);
