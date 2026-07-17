import assert from "node:assert/strict";
import {
  dedupeSportteryMatchRows,
  liveFallbackRowMatchesSportteryMatch,
  liveFallbackRowsFromSyncLogs,
  lockRowToSportteryMatch,
  mergeLiveTargetMatches,
  parseOkoooLiveCenterScores,
  sportteryKey,
} from "../web/functions/api/[[path]].js";

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
  <tr id="match_detail_1324067" state="Not" matchid="1324067">
    <td class="match_league"><a>美职</a></td>
    <td><span class="ctrl_time">未</span></td>
    <td><a class="ctrl_homename">西雅图海湾人</a></td>
    <td class="show_score" val="1324067"><b class="font_blue ctrl_homescore"></b>-<b class="font_blue ctrl_awayscore"></b></td>
    <td><a class="ctrl_awayname">波特兰伐木工</a></td>
  </tr>
`);
assert.equal(liveCenterRows.length, 3, "scoreless authoritative and scheduled statuses must survive live-center parsing");
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
    scheduled: false,
    rawStatus: "延期",
    sourceState: "Not",
    scoreDuration: "REGULAR",
    scoreMode: "",
  },
);
assert.equal(liveCenterRows.find((row) => row.externalId === "1324066")?.score, "0-0");
assert.deepEqual(
  liveCenterRows.find((row) => row.externalId === "1324067"),
  {
    source: "OKOOO-live",
    externalId: "1324067",
    date: "",
    time: "",
    league: "美职",
    home: "西雅图海湾人",
    away: "波特兰伐木工",
    homeZh: "西雅图海湾人",
    awayZh: "波特兰伐木工",
    score: "",
    halfScore: "",
    status: "SCHEDULED",
    statusName: "未开赛",
    statusLabel: "未开赛",
    minute: "",
    isFinished: false,
    live: false,
    unavailable: false,
    scheduled: true,
    rawStatus: "未",
    sourceState: "Not",
    scoreDuration: "REGULAR",
    scoreMode: "",
  },
);
assert.equal(
  liveFallbackRowMatchesSportteryMatch(
    { matchId: "sporttery-1324067", home: "旧主队名", away: "旧客队名" },
    liveCenterRows.find((row) => row.externalId === "1324067"),
  ),
  true,
  "OKOOO fixture ids must remain authoritative when upstream team labels differ",
);

const recoveredRows = liveFallbackRowsFromSyncLogs([
  {
    created_at: "2026-07-17T03:16:02.304Z",
    payload_json: JSON.stringify({
      liveFallbackCandidates: [{
        matchId: "sporttery-1324067",
        issue: "四210",
        home: "西雅图",
        away: "波特兰",
        skipped: "not-finished-or-not-regular",
        live: {
          source: "OKOOO-live",
          date: "",
          home: "西雅图海湾人",
          away: "波特兰伐木工",
          score: "0-1",
          status: "30'",
          isFinished: false,
          scoreDuration: "REGULAR",
          scoreMode: "liveRegularTime",
        },
      }],
    }),
  },
], [{ matchId: "1324067", league: "美职", home: "西雅图", away: "波特兰" }]);
assert.equal(recoveredRows.length, 1, "a transient empty upstream response must recover the last successful matched row");
assert.equal(recoveredRows[0].externalId, "1324067");
assert.equal(recoveredRows[0].score, "0-1");
assert.equal(recoveredRows[0].live, true);
assert.equal(recoveredRows[0].isStaleSnapshot, true);
assert.equal(recoveredRows[0].observedAt, "2026-07-17T03:16:02.304Z");

const duplicateFixtureRows = [
  {
    match_id: "sporttery-0",
    match_code: "五204",
    league: "巴甲",
    home_team: "巴伊亚",
    away_team: "沙佩科",
    kickoff_time: "2026-07-18 06:30",
    payload_json: JSON.stringify({
      matchId: "0",
      orderId: "5204",
      issue: "五204",
      ticaiDate: "2026-07-17",
      matchDate: "2026-07-18",
      home: "巴伊亚",
      away: "沙佩科",
      normal: { win: "", draw: "", lose: "" },
    }),
  },
  {
    match_id: "sporttery-1334804",
    match_code: "五204",
    league: "巴西甲",
    home_team: "巴伊亚",
    away_team: "沙佩科",
    kickoff_time: "2026-07-18 06:30",
    payload_json: JSON.stringify({
      matchId: "1334804",
      orderId: "5204",
      issue: "五204",
      ticaiDate: "2026-07-17",
      matchDate: "2026-07-18",
      home: "巴伊亚",
      away: "沙佩科",
      normal: { win: "1.30", draw: "4.55", lose: "7.10" },
    }),
  },
];
const dedupedFixtureRows = dedupeSportteryMatchRows(duplicateFixtureRows);
assert.equal(dedupedFixtureRows.length, 1, "the placeholder and authoritative copy of one fixture must collapse to one row");
assert.equal(dedupedFixtureRows[0].match_id, "sporttery-1334804", "the authoritative id with complete odds must win");
assert.equal(sportteryKey({ matchId: "0", orderId: "5204" }), "okooo-5204", "zero must never become a shared Sporttery match id");
assert.equal(sportteryKey({ matchId: "1334804", orderId: "5204" }), "1334804");

console.log("Live-score target tests passed: live snapshots and Sporttery fixtures remain stable and deduplicated.");
