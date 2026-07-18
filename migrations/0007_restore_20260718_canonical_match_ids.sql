CREATE TABLE IF NOT EXISTS sp_match_id_migration_20260718 (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);

INSERT OR REPLACE INTO sp_match_id_migration_20260718 (old_id, new_id) VALUES
  ('sporttery-1320353', 'sporttery-2040546'),
  ('sporttery-1320354', 'sporttery-2040547'),
  ('sporttery-1320356', 'sporttery-2040548'),
  ('sporttery-1320355', 'sporttery-2040549'),
  ('sporttery-1317624', 'sporttery-2040550'),
  ('sporttery-1317878', 'sporttery-2040551'),
  ('sporttery-1318497', 'sporttery-2040552'),
  ('sporttery-1317626', 'sporttery-2040553'),
  ('sporttery-1317628', 'sporttery-2040554'),
  ('sporttery-1317625', 'sporttery-2040555'),
  ('sporttery-1317879', 'sporttery-2040556'),
  ('sporttery-1317880', 'sporttery-2040557'),
  ('sporttery-1317627', 'sporttery-2040558'),
  ('sporttery-1317629', 'sporttery-2040559');

UPDATE odds_snapshots
SET
  match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = odds_snapshots.match_id),
  payload_json = json_set(
    payload_json,
    '$.matchId', replace((SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = odds_snapshots.match_id), 'sporttery-', ''),
    '$.cloudMatchId', (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = odds_snapshots.match_id),
    '$.officialMatchId', replace((SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = odds_snapshots.match_id), 'sporttery-', ''),
    '$.canonicalMatchIdSource', 'restored-existing-d1-canonical'
  )
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);

UPDATE locked_predictions SET match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = locked_predictions.match_id)
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);
UPDATE match_results SET match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = match_results.match_id)
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);
UPDATE case_base SET match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = case_base.match_id)
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);
UPDATE model_runs SET match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = model_runs.match_id)
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);
UPDATE model_upgrade_notes SET match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = model_upgrade_notes.match_id)
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);

UPDATE matches
SET
  match_id = (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = matches.match_id),
  payload_json = json_set(
    payload_json,
    '$.matchId', replace((SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = matches.match_id), 'sporttery-', ''),
    '$.cloudMatchId', (SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = matches.match_id),
    '$.officialMatchId', replace((SELECT new_id FROM sp_match_id_migration_20260718 map WHERE map.old_id = matches.match_id), 'sporttery-', ''),
    '$.canonicalMatchIdSource', 'restored-existing-d1-canonical'
  )
WHERE match_id IN (SELECT old_id FROM sp_match_id_migration_20260718);

DROP TABLE sp_match_id_migration_20260718;
