import fs from "node:fs/promises";
import path from "node:path";
import {
  compactNo,
  latestMarketUpdate,
  marketOdds,
  normalizeHandicap,
  scoreOdds,
  SPORTTERY_HEADERS,
  totalGoalsOdds,
} from "./sporttery-utils.mjs";

const API_URL = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";
const OUTPUT = path.resolve("web/live-sporttery-data.js");

function normalizeMatch(match, businessDate) {
  const handicap = normalizeHandicap(match.hhad?.goalLine);
  return {
    orderId: String(match.matchNum || ""),
    issue: match.matchNumStr || "",
    no: compactNo(match.matchNumStr, match.matchNum),
    ticaiDate: businessDate || match.businessDate || match.matchDate || "",
    matchDate: match.matchDate || "",
    kickoffTime: String(match.matchTime || "").slice(0, 5),
    league: match.leagueAbbName || match.leagueAllName || "竞彩",
    matchId: String(match.matchId || ""),
    home: match.homeTeamAbbName || match.homeTeamAllName || "",
    away: match.awayTeamAbbName || match.awayTeamAllName || "",
    venue: match.remark || "",
    statusCode: match.matchStatus || "",
    score: "",
    handicap,
    normal: marketOdds(match.had),
    handicapOdds: marketOdds(match.hhad),
    scoreOdds: scoreOdds(match.crs || {}),
    totalGoalsOdds: totalGoalsOdds(match.ttg || {}),
    updatedAt: latestMarketUpdate(match),
  };
}

function normalizePayload(raw, capturedAt) {
  const days = raw?.value?.matchInfoList || [];
  const matches = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeMatch(match, day.businessDate))
  );
  const lotterNo = days[0]?.businessDate || "";
  return {
    source: "中国体育彩票官方接口",
    apiEndpoint: API_URL,
    lotterNo,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: raw?.value?.totalCount || matches.length,
    lastUpdateTime: raw?.value?.lastUpdateTime || "",
    matchDates: days.map((day) => day.businessDate).filter(Boolean),
    matches,
  };
}

const response = await fetch(API_URL, { headers: SPORTTERY_HEADERS });
if (!response.ok) throw new Error(`Sporttery API ${response.status}`);
const raw = await response.json();
if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API returned an error");

const capturedAt = new Date().toISOString();
const data = normalizePayload(raw, capturedAt);
await fs.writeFile(OUTPUT, `window.LIVE_SPORTTERY_ODDS = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${data.matches.length} matches, captured ${capturedAt}`);
