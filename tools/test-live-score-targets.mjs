import assert from "node:assert/strict";
import { lockRowToSportteryMatch, mergeLiveTargetMatches, parseOkoooLiveCenterScores } from "../web/functions/api/[[path]].js";

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

const liveCenterRows = parseOkoooLiveCenterScores(`
  <tr id="match_detail_1324065" state="Not" matchid="1324065">
    <td class="match_league"><a>美职</a></td>
    <td><span class="ctrl_time">延期</span></td>
    <td><a class="ctrl_homename">芝加哥火焰</a></td>
    <td class="show_score" val="1324065"><b class="font_blue ctrl_homescore"></b>-<b class="font_blue ctrl_awayscore"></b></td>
    <td><a class="ctrl_awayname">温哥华白帽</a></td>
  </tr>
  <tr id="match_detail_1324066" state="On" matchid="1324066">
    <td class="match_league"><a>美职</a></td>
    <td><span class="ctrl_time">4'</span></td>
    <td><a class="ctrl_homename">圣路易斯市</a></td>
    <td class="show_score" val="1324066"><b class="font_red ctrl_homescore">0</b>-<b class="font_red ctrl_awayscore">0</b></td>
    <td><a class="ctrl_awayname">堪萨斯城</a></td>
  </tr>
`);
assert.equal(liveCenterRows.length, 2, "scoreless authoritative statuses must survive live-center parsing");
assert.deepEqual(
  liveCenterRows.find((row) => row.externalId === "1324065"),
  {
    source: "OKOOO-live",
    externalId: "1324065",
    date: "",
    time: "",
    league: "美职",
    home: "芝加哥火焰",
    away: "温哥华白帽",
    homeZh: "芝加哥火焰",
    awayZh: "温哥华白帽",
    score: "",
    halfScore: "",
    status: "延期",
    statusName: "延期",
    statusLabel: "延期",
    minute: "延期",
    isFinished: false,
    live: false,
    unavailable: true,
    scoreDuration: "REGULAR",
    scoreMode: "",
  },
);
assert.equal(liveCenterRows.find((row) => row.externalId === "1324066")?.score, "0-0");

console.log("Live-score target tests passed: lock-only fixtures and scoreless authoritative statuses remain visible.");
