import fs from "node:fs/promises";
import path from "node:path";
import { compactNo, fetchSportteryJson } from "./sporttery-utils.mjs";

const CALCULATOR_API = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";
const FIXED_BONUS_API = "https://webapi.sporttery.cn/gateway/uniform/football/getFixedBonusV1.qry";
const OUTPUT = path.resolve("web/live-sporttery-sp-history.js");

function latestStamp(list = []) {
  return list
    .map((item) => `${item.updateDate || ""} ${item.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function normalizeHistory(match, businessDate, history = {}) {
  const oddsHistory = history.oddsHistory || {};
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
    handicap: String(oddsHistory.hhadList?.at(-1)?.goalLine || match.hhad?.goalLine || "0"),
    updatedAt: latestStamp([
      ...(oddsHistory.hadList || []),
      ...(oddsHistory.hhadList || []),
      ...(oddsHistory.ttgList || []),
      ...(oddsHistory.crsList || []),
    ]),
    history: {
      had: oddsHistory.hadList || [],
      hhad: oddsHistory.hhadList || [],
      ttg: oddsHistory.ttgList || [],
      crs: oddsHistory.crsList || [],
      hafu: oddsHistory.hafuList || [],
    },
  };
}

const liveRaw = await fetchSportteryJson(CALCULATOR_API);
const days = liveRaw?.value?.matchInfoList || [];
const liveMatches = days.flatMap((day) =>
  (day.subMatchList || []).map((match) => ({ match, businessDate: day.businessDate }))
);

const histories = [];
const errors = [];
for (const item of liveMatches) {
  const matchId = item.match.matchId;
  try {
    const url = `${FIXED_BONUS_API}?clientCode=3001&matchId=${encodeURIComponent(matchId)}`;
    const raw = await fetchSportteryJson(url);
    histories.push(normalizeHistory(item.match, item.businessDate, raw.value || {}));
  } catch (error) {
    errors.push({ matchId: String(matchId), message: error.message });
  }
}

const capturedAt = new Date().toISOString();
const data = {
  source: "中国体育彩票官方 SP 历史接口",
  apiEndpoint: FIXED_BONUS_API,
  importedAt: capturedAt,
  isLiveSnapshot: true,
  totalCount: histories.length,
  errors,
  matches: histories,
};

await fs.writeFile(OUTPUT, `window.LIVE_SPORTTERY_SP_HISTORY = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${histories.length} histories, ${errors.length} errors, captured ${capturedAt}`);
