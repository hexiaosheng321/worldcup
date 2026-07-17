import assert from "node:assert/strict";
import { lockRowToSportteryMatch, mergeLiveTargetMatches } from "../web/functions/api/[[path]].js";

const matchRows = [{
  match_id: "sporttery-1324067",
  match_code: "四210",
  league: "美职",
  home_team: "洛杉矶FC",
  away_team: "科罗拉多",
  kickoff_time: "2026-07-17 10:30",
  payload_json: JSON.stringify({ matchId: "1324067", matchDate: "2026-07-17", kickoffTime: "10:30", home: "洛杉矶FC", away: "科罗拉多" }),
}];

const lockRows = [
  {
    match_id: "sporttery-1324065",
    match_code: "四208",
    league: "美职",
    home_team: "芝加哥",
    away_team: "温哥华",
    kickoff_time: "2026-07-17 08:30",
    payload_json: JSON.stringify({
      matchId: "sporttery-1324065",
      homeTeam: "芝加哥",
      awayTeam: "温哥华",
      league: "美职",
      sportteryPrediction: { matchId: "1324065", matchDate: "2026-07-17", kickoffTime: "08:30", home: "芝加哥", away: "温哥华" },
    }),
  },
  {
    match_id: "sporttery-1324066",
    match_code: "四209",
    league: "美职",
    home_team: "圣路易",
    away_team: "堪萨斯",
    kickoff_time: "2026-07-17 08:30",
    payload_json: JSON.stringify({ matchId: "sporttery-1324066", homeTeam: "圣路易", awayTeam: "堪萨斯", league: "美职" }),
  },
  {
    match_id: "sporttery-1324067",
    match_code: "四210",
    league: "美职",
    home_team: "错误占位队名",
    away_team: "错误占位客队",
    kickoff_time: "2026-07-17 10:30",
    payload_json: "{}",
  },
];

const chicago = lockRowToSportteryMatch(lockRows[0]);
assert.equal(chicago.matchId, "1324065");
assert.equal(chicago.home, "芝加哥");
assert.equal(chicago.away, "温哥华");
assert.equal(chicago.matchDate, "2026-07-17");
assert.equal(chicago.kickoffTime, "08:30");

const targets = mergeLiveTargetMatches(matchRows, lockRows);
assert.equal(targets.length, 3, "lock-only matches must join the live-score target set without duplicating existing matches");
assert.equal(targets.find((row) => row.matchId === "1324065")?.liveTargetSource, "locked_predictions");
assert.equal(targets.find((row) => row.matchId === "1324066")?.liveTargetSource, "locked_predictions");
assert.equal(targets.find((row) => row.matchId === "1324067")?.home, "洛杉矶FC", "official match rows must remain authoritative");
assert.equal(targets.find((row) => row.matchId === "1324067")?.liveTargetSource, "matches");

console.log("Live-score target union tests passed: lock-only matches are always eligible for score matching.");
