import assert from "node:assert/strict";
import { persistOkoooMatchesToD1 } from "../web/functions/api/[[path]].js";

function match(index, overrides = {}) {
  const id = String(2040546 + index);
  return {
    matchId: id,
    orderId: String(6201 + index),
    issue: `六${String(201 + index).padStart(3, "0")}`,
    no: String(201 + index),
    ticaiDate: "2026-07-18",
    matchDate: "2026-07-18",
    kickoffTime: "18:30",
    league: "K联赛",
    home: `主队${index}`,
    away: `客队${index}`,
    handicap: "-1",
    normal: { win: "2.23", draw: "3.15", lose: "2.75" },
    handicapOdds: { win: "5.05", draw: "3.85", lose: "1.49" },
    totalGoalsOdds: [{ goals: "2", odds: "3.30" }],
    ...overrides,
  };
}

function fakeDb(latestRows = [], existingRows = []) {
  const batches = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          if (sql.includes("FROM matches m") && sql.includes("LIMIT 500")) return { results: existingRows };
          if (sql.includes("snapshot_count") && sql.includes("row_no = 1")) return { results: latestRows };
          throw new Error(`Unexpected all(): ${sql}`);
        },
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
  return { db, batches };
}

const matches = Array.from({ length: 34 }, (_, index) => match(index));
const capturedAt = "2026-07-18T04:00:00.000Z";

{
  const source = match(0, { matchId: "1320353" });
  const existingRows = [
    {
      match_id: "sporttery-2040546",
      match_code: source.issue,
      home_team: source.home,
      away_team: source.away,
      kickoff_time: `${source.matchDate} ${source.kickoffTime}`,
      payload_json: JSON.stringify({ ...source, matchId: "2040546" }),
      created_at: "2026-07-18T03:55:00.000Z",
      updated_at: "2026-07-18T03:55:00.000Z",
      has_lock: 0,
      has_result: 0,
    },
    {
      match_id: "sporttery-1320353",
      match_code: source.issue,
      home_team: source.home,
      away_team: source.away,
      kickoff_time: `${source.matchDate} ${source.kickoffTime}`,
      payload_json: JSON.stringify(source),
      created_at: "2026-07-18T05:06:00.000Z",
      updated_at: "2026-07-18T05:06:00.000Z",
      has_lock: 0,
      has_result: 0,
    },
  ];
  const { db, batches } = fakeDb([], existingRows);
  const result = await persistOkoooMatchesToD1(db, [source], capturedAt);
  const statements = batches.flat();
  const matchUpsert = statements.find((statement) => statement.sql.includes("INSERT INTO matches"));
  const snapshotInsert = statements.find((statement) => statement.sql.includes("INSERT INTO odds_snapshots"));
  assert.equal(matchUpsert.args[0], "sporttery-2040546", "existing D1 identity must remain canonical without the official API");
  assert.equal(snapshotInsert.args[1], "sporttery-2040546");
  assert.equal(result.removedDuplicates, 1);
  assert.ok(statements.some((statement) => statement.sql.includes("DELETE FROM matches") && statement.args[0] === "sporttery-1320353"));
}

{
  const { db, batches } = fakeDb();
  const result = await persistOkoooMatchesToD1(db, matches, capturedAt);
  assert.equal(result.matchCount, 34);
  assert.equal(result.snapshotsWritten, 34);
  assert.equal(result.unchangedSnapshotsSkipped, 0);
  assert.equal(result.batchCount, 1);
  assert.ok(batches.every((batch) => batch.length <= 100));
  assert.equal(batches.flat().filter((statement) => statement.sql.includes("INSERT INTO odds_snapshots")).length, 34);
}

{
  const latestRows = matches.map((item) => ({
    match_id: `sporttery-${item.matchId}`,
    captured_at: "2026-07-18T03:55:00.000Z",
    payload_json: JSON.stringify(item),
    snapshot_count: 1,
  }));
  const { db } = fakeDb(latestRows);
  const result = await persistOkoooMatchesToD1(db, matches, capturedAt);
  assert.equal(result.snapshotsWritten, 34, "the second real timestamp must be persisted even when SP is unchanged");
}

{
  const latestRows = matches.map((item) => ({
    match_id: `sporttery-${item.matchId}`,
    captured_at: "2026-07-18T03:55:00.000Z",
    payload_json: JSON.stringify(item),
    snapshot_count: 2,
  }));
  const { db, batches } = fakeDb(latestRows);
  const result = await persistOkoooMatchesToD1(db, matches, capturedAt);
  assert.equal(result.snapshotsWritten, 0);
  assert.equal(result.unchangedSnapshotsSkipped, 34);
  assert.equal(batches.flat().filter((statement) => statement.sql.includes("INSERT INTO odds_snapshots")).length, 0);
}

{
  const latestRows = [{
    match_id: `sporttery-${matches[0].matchId}`,
    captured_at: "2026-07-18T03:55:00.000Z",
    payload_json: JSON.stringify(matches[0]),
    snapshot_count: 128,
  }];
  const changed = [{ ...matches[0], normal: { ...matches[0].normal, win: "2.20" } }];
  const { db, batches } = fakeDb(latestRows);
  const result = await persistOkoooMatchesToD1(db, changed, capturedAt);
  assert.equal(result.snapshotsWritten, 1);
  assert.equal(batches.flat().filter((statement) => statement.sql.includes("LIMIT 127")).length, 1, "per-match retention cap must run after snapshot 128");
}

console.log("OKOOO persistence tests passed: batched writes, two-snapshot gate, dedupe heartbeat, and retention cap.");
