import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = (process.env.APIFOOTBALL_API_KEY || "").trim();
const OUTPUT = path.resolve("web/live-football-scores.js");
const API_URL = "https://apiv3.apifootball.com/";

const TEAM_ZH = {
  Algeria: "阿尔及利",
  Argentina: "阿根廷",
  Australia: "澳大利亚",
  Austria: "奥地利",
  Belgium: "比利时",
  Brazil: "巴西",
  Canada: "加拿大",
  Colombia: "哥伦比亚",
  Croatia: "克罗地亚",
  "Czech Republic": "捷克",
  Czechia: "捷克",
  Denmark: "丹麦",
  Ecuador: "厄瓜多尔",
  Egypt: "埃及",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Haiti: "海地",
  Iran: "伊朗",
  Italy: "意大利",
  Japan: "日本",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷兰",
  "New Zealand": "新西兰",
  Norway: "挪威",
  Panama: "巴拿马",
  Portugal: "葡萄牙",
  Qatar: "卡塔尔",
  Scotland: "苏格兰",
  "South Africa": "南非",
  Spain: "西班牙",
  Sweden: "瑞典",
  Switzerland: "瑞士",
  Tunisia: "突尼斯",
  Uruguay: "乌拉圭",
  USA: "美国",
  "United States": "美国",
  Uzbekistan: "乌兹别克斯坦",
};

function asiaDateOffset(offset) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offset);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function normalizeScore(home, away) {
  if (home === undefined || away === undefined || home === "" || away === "") return "";
  return `${home}-${away}`;
}

function statusLabel(status = "") {
  const text = String(status || "").trim();
  if (!text) return "";
  if (/finished/i.test(text)) return "已完赛";
  if (/half/i.test(text)) return "半场";
  if (/postponed/i.test(text)) return "延期";
  if (/cancel/i.test(text)) return "取消";
  if (/^\d+(\+\d+)?$/.test(text)) return `${text}'`;
  return text;
}

function isFinished(status = "") {
  return /finished/i.test(String(status || ""));
}

function normalizeMatch(match) {
  const home = match.match_hometeam_name || "";
  const away = match.match_awayteam_name || "";
  return {
    source: "APIfootball",
    externalId: String(match.match_id || ""),
    date: match.match_date || "",
    time: match.match_time || "",
    league: match.league_name || match.country_name || "Football",
    home,
    away,
    homeZh: TEAM_ZH[home] || home,
    awayZh: TEAM_ZH[away] || away,
    score: normalizeScore(match.match_hometeam_score, match.match_awayteam_score),
    halfScore: normalizeScore(match.match_hometeam_halftime_score, match.match_awayteam_halftime_score),
    status: match.match_status || "",
    statusLabel: statusLabel(match.match_status),
    isFinished: isFinished(match.match_status),
    minute: /^\d+(\+\d+)?$/.test(String(match.match_status || "")) ? `${match.match_status}'` : "",
    live: String(match.match_live || "") === "1",
    round: match.match_round || "",
    stadium: match.match_stadium || "",
    referee: match.match_referee || "",
    updatedAt: new Date().toISOString(),
  };
}

async function fetchDay(date) {
  const url = new URL(API_URL);
  url.searchParams.set("action", "get_events");
  url.searchParams.set("from", date);
  url.searchParams.set("to", date);
  url.searchParams.set("APIkey", API_KEY);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`APIfootball ${response.status}`);
  const raw = await response.json();
  if (raw?.error) throw new Error(raw.message || raw.error);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeMatch);
}

if (!API_KEY) {
  throw new Error("APIFOOTBALL_API_KEY is required");
}

const capturedAt = new Date().toISOString();
const dates = [asiaDateOffset(-1), asiaDateOffset(0), asiaDateOffset(1)];
const settled = await Promise.allSettled(dates.map(fetchDay));
const matches = [];
const errors = [];
for (const [index, item] of settled.entries()) {
  if (item.status === "fulfilled") matches.push(...item.value);
  else errors.push({ date: dates[index], message: item.reason?.message || "unknown" });
}

const unique = [...new Map(matches.map((match) => [match.externalId || `${match.date}-${match.home}-${match.away}`, match])).values()];
const data = {
  source: "APIfootball",
  apiEndpoint: API_URL,
  importedAt: capturedAt,
  isLiveSnapshot: true,
  scope: "events_with_live_status",
  totalCount: unique.length,
  matchDates: dates,
  errors,
  matches: unique.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
};

await fs.writeFile(OUTPUT, `window.LIVE_FOOTBALL_SCORES = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${data.matches.length} live score rows, ${errors.length} errors, captured ${capturedAt}`);
