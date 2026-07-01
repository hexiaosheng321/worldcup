import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const DATA_FILE = path.resolve("web/data.js");
const ODDS_FILE = path.resolve("web/live-sporttery-data.js");
const RESULTS_FILE = path.resolve("web/live-sporttery-results.js");
const OUTPUT_FILE = path.resolve("web/data/caseBase.js");

async function readWindowValue(file, key, fallback) {
  try {
    const context = { window: {} };
    vm.runInNewContext(await fs.readFile(file, "utf8"), context, {
      filename: file,
      timeout: 1000,
    });
    return context.window[key] || fallback;
  } catch {
    return fallback;
  }
}

function parseScore(score) {
  const text = String(score || "").replace(":", "-");
  if (!text.includes("-")) return null;
  const [home, away] = text.split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, total: home + away };
}

function normalizeTeamName(name = "") {
  return String(name || "")
    .toLowerCase()
    .replace(/[\s·.'’\-()（）]/g, "");
}

function looseTeamMatch(left = "", right = "") {
  if (!left || !right) return false;
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  return a === b || a.includes(b) || b.includes(a);
}

function predictionModelVersion(pred = {}) {
  if (pred.modelVersion) return pred.modelVersion;
  const type = String(pred.type || "");
  if (type.includes("V4")) return "V4";
  if (type.includes("V3")) return "V3";
  if (type.includes("V2")) return "V2";
  if (type.includes("V1")) return "V1";
  return "";
}

function parseProbRange(value) {
  const nums = String(value || "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite);
  if (!nums?.length) return 0;
  return nums.reduce((sum, item) => sum + item, 0) / nums.length / 100;
}

function confidenceGrade(pred = {}) {
  return pred.confidence || "D";
}

function finalGrade(value = "") {
  const text = String(value || "D").trim().toUpperCase();
  if (text.startsWith("A")) return "A";
  if (text.startsWith("B")) return "B";
  if (text.startsWith("C")) return "C";
  return "D";
}

function confidenceAdvice(grade) {
  return {
    A: "主打",
    "A-": "主打观察",
    B: "可选",
    "B-": "可选观察",
    "C+": "谨慎+",
    C: "谨慎",
    D: "证据不足",
  }[grade] || "谨慎";
}

function finalAction(pred = {}) {
  const text = String(pred.advice || confidenceAdvice(confidenceGrade(pred)));
  if (text.includes("主")) return "主推";
  if (text.includes("可")) return "可选";
  if (text.includes("跳")) return "跳过";
  return "谨慎";
}

function recommendationSide(value = "") {
  if (value === "胜") return "HOME";
  if (value === "平") return "DRAW";
  if (value === "负") return "AWAY";
  if (/双|不败|胜\/平|平\/负|胜\/负/.test(String(value || ""))) return "DOUBLE";
  return "SKIP";
}

function qualityLevel(value = "") {
  const text = String(value || "").toUpperCase();
  if (text.includes("HIGH") || text.includes("完整")) return "HIGH";
  if (text.includes("LOW") || text.includes("缺") || text.includes("不足")) return "LOW";
  return "MEDIUM";
}

function simpleConsistencyScore(pred = {}) {
  let score = 3;
  if (pred.decisionConflict) score -= 1;
  if (pred.crossMarketConsistency && !/冲突|不一致/.test(pred.crossMarketConsistency)) score += 1;
  if (pred.handicapGate && pred.pick && pred.handicapPick && String(pred.handicapGate).includes(pred.handicapPick)) score += 1;
  return Math.max(1, Math.min(5, score));
}

function handicapLineFromPrediction(pred = {}, match = {}) {
  const text = `${pred.handicap || ""} ${pred.marketGap || ""}`;
  const home = match.home || pred.home || "";
  if (home) {
    const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = text.match(new RegExp(`${escapedHome}\\s*([+-]\\d+(?:\\.\\d+)?)`));
    if (found) return found[1];
  }
  return text.match(/([+-]\d+(?:\.\d+)?)/)?.[1] || "";
}

function oddsMarketEntries(odds = {}) {
  return [
    { code: "H", odd: odds.normal?.win },
    { code: "D", odd: odds.normal?.draw },
    { code: "A", odd: odds.normal?.lose },
  ].filter((item) => Number(item.odd));
}

function impliedMarket(entries) {
  const rawSum = entries.reduce((sum, item) => sum + 1 / Number(item.odd), 0);
  if (!entries.length || !rawSum) return new Map();
  return new Map(entries.map((item) => [item.code, (1 / Number(item.odd)) / rawSum]));
}

function issueNo(value = "") {
  return String(value || "").match(/(\d{3})$/)?.[1] || String(value || "");
}

function findOdds(oddsRows = [], match = {}) {
  return oddsRows.find((item) => issueNo(item.no || item.issue) === issueNo(match.no))
    || oddsRows.find((item) => item.matchId && match.matchId && String(item.matchId) === String(match.matchId))
    || oddsRows.find(
      (item) =>
        [item.ticaiDate, item.matchDate].includes(match.date || match.matchDate) &&
        looseTeamMatch(match.home, item.home) &&
        looseTeamMatch(match.away, item.away)
    )
    || null;
}

function findResult(results = [], match = {}) {
  return results.find((item) => issueNo(item.no || item.issue) === issueNo(match.no) && parseScore(item.score))
    || results.find((item) => item.matchId && match.matchId && String(item.matchId) === String(match.matchId) && parseScore(item.score))
    || results.find(
      (item) =>
        [item.ticaiDate, item.matchDate].includes(match.date || match.matchDate) &&
        looseTeamMatch(match.home, item.home) &&
        looseTeamMatch(match.away, item.away) &&
        parseScore(item.score)
    )
    || null;
}

function sideFromScore(score) {
  if (score.home > score.away) return "HOME";
  if (score.home < score.away) return "AWAY";
  return "DRAW";
}

function evaluate(side, recommendation, finalActionText) {
  if (finalActionText === "跳过") return "VOID";
  if (recommendation === side) return "WIN";
  if (recommendation === "DOUBLE") return "VOID";
  if (recommendation === "OVER" || recommendation === "UNDER") return "VOID";
  return "LOSE";
}

function caseTags(pred, resultSide, hitStatus) {
  const failureTags = [];
  const successTags = [];
  const grade = finalGrade(confidenceGrade(pred));
  const dataQuality = qualityLevel(pred.dataQuality);
  if (hitStatus === "LOSE" && grade === "A") failureTags.push("A级推荐失败");
  if (hitStatus === "LOSE" && resultSide === "DRAW" && recommendationSide(pred.pick) !== "DRAW") failureTags.push("平局漏防");
  if (hitStatus === "LOSE" && dataQuality === "LOW") failureTags.push("数据质量低导致失败");
  if (hitStatus === "WIN" && simpleConsistencyScore(pred) >= 4) successTags.push("欧亚一致命中");
  if (hitStatus === "WIN" && grade === "A") successTags.push("A级推荐命中");
  if (hitStatus === "WIN" && recommendationSide(pred.pick) === "HOME") successTags.push("主胜价值命中");
  return { failureTags, successTags };
}

function buildCase(pred, match, odds, score) {
  const side = sideFromScore(score);
  const recommendation = recommendationSide(pred.pick);
  const action = finalAction(pred);
  const hitStatus = evaluate(side, recommendation, action);
  const modelHomeProb = parseProbRange(pred.homeProb);
  const modelDrawProb = parseProbRange(pred.drawProb);
  const modelAwayProb = parseProbRange(pred.awayProb);
  const market = odds ? impliedMarket(oddsMarketEntries(odds)) : new Map();
  const grade = finalGrade(confidenceGrade(pred));
  const consistencyScore = simpleConsistencyScore(pred);
  const confidenceScore = grade === "A" ? 86 : grade === "B" ? 74 : grade === "C" ? 60 : 45;
  const lockId = `${match.no || match.matchId}-${predictionModelVersion(pred)}-${pred.date || match.date}`;
  const tags = caseTags(pred, side, hitStatus);
  return {
    caseId: `case-${lockId}`,
    sourceLockId: lockId,
    matchId: String(match.matchId || match.no || ""),
    league: "世界杯",
    homeTeam: match.home || pred.home || "",
    awayTeam: match.away || pred.away || "",
    kickoffTime: match.matchDate || match.date || pred.date || "",
    modelVersion: "V4",
    modelHomeProb,
    modelDrawProb,
    modelAwayProb,
    recommendation: pred.pick || "",
    recommendationSide: recommendation,
    finalGrade: grade,
    finalAction: action,
    confidenceScore,
    riskScore: Math.max(0, 100 - confidenceScore),
    consistencyScore,
    sportteryHomeSp: odds?.normal?.win ? Number(odds.normal.win) : undefined,
    sportteryDrawSp: odds?.normal?.draw ? Number(odds.normal.draw) : undefined,
    sportteryAwaySp: odds?.normal?.lose ? Number(odds.normal.lose) : undefined,
    sportteryHomeProb: market.get("H"),
    sportteryDrawProb: market.get("D"),
    sportteryAwayProb: market.get("A"),
    valueHomeGap: market.has("H") ? modelHomeProb - market.get("H") : undefined,
    valueDrawGap: market.has("D") ? modelDrawProb - market.get("D") : undefined,
    valueAwayGap: market.has("A") ? modelAwayProb - market.get("A") : undefined,
    asianHandicap: Number(handicapLineFromPrediction(pred, match) || odds?.handicap || "0"),
    euroHomeOdds: odds?.normal?.win ? Number(odds.normal.win) : undefined,
    euroDrawOdds: odds?.normal?.draw ? Number(odds.normal.draw) : undefined,
    euroAwayOdds: odds?.normal?.lose ? Number(odds.normal.lose) : undefined,
    euroHomeProb: market.get("H"),
    euroDrawProb: market.get("D"),
    euroAwayProb: market.get("A"),
    dataQuality: qualityLevel(pred.dataQuality),
    actualResult: side,
    actualHomeGoals: score.home,
    actualAwayGoals: score.away,
    actualGoals: score.total,
    hitStatus,
    failureTags: tags.failureTags,
    successTags: tags.successTags,
    createdAt: `${pred.date || match.date || "2026-01-01"}T00:00:00+08:00`,
  };
}

const data = await readWindowValue(DATA_FILE, "WC_DATA", { matches: [], predictions: [] });
const oddsData = await readWindowValue(ODDS_FILE, "LIVE_SPORTTERY_ODDS", { matches: [] });
const resultsData = await readWindowValue(RESULTS_FILE, "LIVE_SPORTTERY_RESULTS", { results: [] });

const cases = [];
const seen = new Set();
for (const match of data.matches || []) {
  const result = findResult(resultsData.results || [], match);
  const score = parseScore(match.score) || parseScore(result?.score);
  if (!score) continue;
  const odds = findOdds(oddsData.matches || [], match);
  for (const pred of (data.predictions || []).filter((item) => item.no === match.no)) {
    if (predictionModelVersion(pred) !== "V4") continue;
    const item = buildCase(pred, match, odds, score);
    if (seen.has(item.sourceLockId)) continue;
    seen.add(item.sourceLockId);
    cases.push(item);
  }
}

const output = `window.WC_CASE_BASE_DATA = ${JSON.stringify(cases, null, 2)};\n`;
await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await fs.writeFile(OUTPUT_FILE, output, "utf8");
console.log(`generated ${cases.length} case base rows -> ${path.relative(process.cwd(), OUTPUT_FILE)}`);
