import fs from "node:fs/promises";
import path from "node:path";
import { compactNo, fetchSportteryJson } from "./sporttery-utils.mjs";

const API_URL = "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1";
const OUTPUT = path.resolve("web/live-sporttery-results.js");

function parseScore(score = "") {
  if (!score.includes(":")) return null;
  const [home, away] = score.split(":").map(Number);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function normalizeResult(match, businessDate) {
  const parsed = parseScore(match.sectionsNo999 || "");
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
    statusCode: match.matchStatus || "",
    statusName: match.matchStatusName || "",
    halfScore: String(match.sectionsNo1 || "").replace(":", "-"),
    fullScoreRaw: match.sectionsNo999 || "",
    score: parsed?.text || "",
    result: parsed ? (parsed.home > parsed.away ? "胜" : parsed.home < parsed.away ? "负" : "平") : "",
  };
}

function normalizePayload(raw, capturedAt) {
  const days = raw?.value?.matchInfoList || [];
  const results = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeResult(match, day.matchDate || day.businessDate))
  );
  return {
    source: "中国体育彩票官方赛果接口",
    apiEndpoint: API_URL,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: results.length,
    matchDates: days.map((day) => day.matchDate || day.businessDate).filter(Boolean),
    results,
  };
}

const raw = await fetchSportteryJson(API_URL);

const capturedAt = new Date().toISOString();
const data = normalizePayload(raw, capturedAt);
await fs.writeFile(OUTPUT, `window.LIVE_SPORTTERY_RESULTS = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${data.results.length} results, captured ${capturedAt}`);
