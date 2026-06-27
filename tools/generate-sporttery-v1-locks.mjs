import fs from "node:fs/promises";
import path from "node:path";

const ODDS_FILE = path.resolve("web/live-sporttery-data.js");
const MANUAL_FILE = path.resolve("web/data.js");
const OUTPUT = path.resolve("web/auto-sporttery-predictions.js");

function jsonFromJs(content, varName) {
  const matched = content.match(new RegExp(`${varName}\\s*=\\s*(\\{[\\s\\S]*\\});?\\s*$`));
  if (!matched) return null;
  return JSON.parse(matched[1]);
}

function oddNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function lowest(rows) {
  return rows
    .filter((item) => oddNumber(item.odd))
    .sort((a, b) => oddNumber(a.odd) - oddNumber(b.odd))[0] || null;
}

function pickNormal(odds = {}) {
  return lowest([
    { label: "胜", odd: odds.win },
    { label: "平", odd: odds.draw },
    { label: "负", odd: odds.lose },
  ]);
}

function pickHandicap(odds = {}) {
  return lowest([
    { label: "让胜", odd: odds.win },
    { label: "让平", odd: odds.draw },
    { label: "让负", odd: odds.lose },
  ]);
}

function scoreText(value = "") {
  return String(value || "").replace(":", "-");
}

function topScores(scores = []) {
  return scores
    .filter((item) => item.score && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => scoreText(item.score));
}

function topGoals(goals = []) {
  return goals
    .filter((item) => item.goals && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => `${item.goals}球`);
}

function sportteryKey(item = {}) {
  if (item.matchId) return `id-${item.matchId}`;
  return `issue-${item.issue || item.no || item.orderId || ""}-${item.ticaiDate || item.matchDate || ""}`;
}

function confidenceFor(item, normalPick, handicapPick) {
  if (!normalPick || !handicapPick) return "C";
  const normalOdd = oddNumber(normalPick.odd) || 9;
  const handicapOdd = oddNumber(handicapPick.odd) || 9;
  if (normalOdd <= 1.55 && handicapOdd <= 1.9) return "B";
  if (normalOdd <= 2.15 && handicapOdd <= 1.75) return "B-";
  return "C+";
}

function adviceFor(confidence) {
  if (confidence === "B") return "自动可选";
  if (confidence === "B-") return "自动谨慎";
  return "自动观察";
}

const oddsData = jsonFromJs(await fs.readFile(ODDS_FILE, "utf8"), "window\\.LIVE_SPORTTERY_ODDS") || { matches: [] };
const manualContent = await fs.readFile(MANUAL_FILE, "utf8");
const manualKeys = new Set([...manualContent.matchAll(/sportteryKey:\s*"([^"]+)"/g)].map((item) => item[1]));

const rows = (oddsData.matches || [])
  .filter((item) => item.league && item.league !== "世界杯")
  .filter((item) => !manualKeys.has(sportteryKey(item)))
  .map((item) => {
    const normal = pickNormal(item.normal);
    const handicap = pickHandicap(item.handicapOdds);
    const scores = topScores(item.scoreOdds);
    const goals = topGoals(item.totalGoalsOdds);
    const confidence = confidenceFor(item, normal, handicap);
    const league = item.league || "体彩联赛";
    const scoreA = scores[0] || "1-1";
    const scoreB = scores[1] || "2-1";
    const totalGoals = goals.length ? goals.join("/") : "2/3球";
    return {
      sportteryKey: sportteryKey(item),
      matchId: item.matchId || "",
      no: item.no || "",
      issue: item.issue || item.no || "",
      date: item.ticaiDate || item.matchDate || oddsData.lotterNo || "",
      matchDate: item.matchDate || item.ticaiDate || oddsData.lotterNo || "",
      kickoffTime: item.kickoffTime || "",
      competition: league,
      playType: "竞彩足球",
      home: item.home || "",
      away: item.away || "",
      type: `${league}V1自动赛前锁版`,
      modelVersion: "V1",
      confidence,
      advice: adviceFor(confidence),
      matchType: "V1初筛局",
      competitionModel: `${league} V1 联赛模型`,
      homeProb: normal?.label === "胜" ? "盘口低位" : "待回测",
      drawProb: normal?.label === "平" ? "盘口低位" : "待回测",
      awayProb: normal?.label === "负" ? "盘口低位" : "待回测",
      xg: "待接入",
      poisson: scores.length ? scores.join(" / ") : "待接入",
      groupSituation: "联赛 V1 初筛不使用世界杯路径权重，先记录盘口、比分低赔和总进球结构。",
      recentAnalysis: "自动 V1 仅根据体彩开盘结构生成，未接入阵容、伤停、战意和近期深层数据。",
      institutionLine: `胜平负低位 ${normal ? `${normal.label}${normal.odd}` : "-"}；让球低位 ${handicap ? `${handicap.label}${handicap.odd}` : "-"}。`,
      noiseFilter: "自动锁版不做名气追热，低置信场次只作观察样本。",
      keyJudgement: "V1 自动初筛先看主方向、让球保护、总进球低位和比分低赔是否一致。",
      marketGap: "自动 V1 暂以体彩盘口结构作为市场温度，不替代人工深度推演。",
      script: "比赛脚本等待该联赛样本积累后继续细化。",
      dataQuality: "自动 V1 已接入体彩盘口；阵容、伤停、近期状态和联赛风格待补。",
      decisionConflict: normal && handicap && !handicap.label.includes(normal.label) ? "胜平负与让球方向存在冲突。" : "主要盘口方向暂未出现强冲突。",
      finalDecisionAction: `自动 V1：胜平负选${normal?.label || "-"}；让球选${handicap?.label || "-"}；总进球选${totalGoals}；比分预测${scoreA} / ${scoreB}。`,
      pick: normal?.label || "",
      handicapPick: handicap?.label || "",
      totalGoalsPick: totalGoals,
      mainScore: scoreA,
      counterScore: scoreB,
      handicap: `${item.home || "主队"}${item.handicap || "0"}：${handicap?.label || "待定"}`,
      autoGenerated: true,
      generatedAt: new Date().toISOString(),
    };
  });

await fs.writeFile(OUTPUT, `window.AUTO_SPORTTERY_PREDICTIONS = ${JSON.stringify(rows, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${rows.length} auto V1 locks`);
