import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const inputPaths = [
  "web/data/externalHistoricalSamples.js",
  "web/data/externalHistoricalSamplesBig5England.js",
  "web/data/externalHistoricalSamplesBig5Spain.js",
  "web/data/externalHistoricalSamplesBig5Germany.js",
  "web/data/externalHistoricalSamplesBig5Italy.js",
  "web/data/externalHistoricalSamplesBig5France.js",
].map((item) => path.join(root, item));
const outputPath = path.join(root, "web/data/leagueProfiles.js");

function readSamples(filePaths) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  filePaths.filter((filePath) => fs.existsSync(filePath)).forEach((filePath) => {
    const code = fs.readFileSync(filePath, "utf8");
    vm.runInContext(code, sandbox, { filename: filePath });
  });
  const samples = sandbox.window.WC_EXTERNAL_HISTORICAL_SAMPLES;
  if (!Array.isArray(samples)) {
    throw new Error("WC_EXTERNAL_HISTORICAL_SAMPLES was not found.");
  }
  return samples;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rate(rows, predicate) {
  if (!rows.length) return 0;
  return rows.filter(predicate).length / rows.length;
}

function average(rows, getter) {
  const values = rows.map(getter).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(rows, getter, limit = 8) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getter(row);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "zh-Hans-CN"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, rate: rows.length ? count / rows.length : 0 }));
}

function pct(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function completeScore(row) {
  const home = number(row.actualHomeGoals);
  const away = number(row.actualAwayGoals);
  if (home === null || away === null) return null;
  return { home, away, total: home + away };
}

function resultSide(score) {
  if (score.home > score.away) return "HOME";
  if (score.home < score.away) return "AWAY";
  return "DRAW";
}

function seasonLabel(row) {
  return row.season || row.sourceSeason || (String(row.kickoffTime || row.matchDate || "").match(/^(\d{4})/) || [])[1] || "unknown";
}

function hasOdds(row) {
  return [row.sportteryHomeSp, row.sportteryDrawSp, row.sportteryAwaySp, row.euroHomeOdds, row.euroDrawOdds, row.euroAwayOdds].some((value) => number(value) !== null);
}

function profileFixtureKey(row) {
  return [
    row.league || row.competition,
    String(row.kickoffTime || row.matchDate || "").slice(0, 10),
    row.homeTeam || row.home,
    row.awayTeam || row.away,
  ].map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "")).join("|");
}

function dedupeProfileRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = profileFixtureKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const qualityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const completeness = (row) => [
    row.euroHomeOdds, row.euroDrawOdds, row.euroAwayOdds,
    row.over25Odds, row.under25Odds,
    row.asianHandicap, row.asianHomeWater, row.asianAwayWater,
  ].filter((value) => number(value) !== null).length;
  return [...groups.values()].map((group) => {
    const ranked = [...group].sort((a, b) =>
      (qualityRank[String(b.dataQuality || "MEDIUM").toUpperCase()] || 2) - (qualityRank[String(a.dataQuality || "MEDIUM").toUpperCase()] || 2) ||
      completeness(b) - completeness(a)
    );
    const merged = { ...ranked[0] };
    ranked.slice(1).forEach((row) => Object.entries(row).forEach(([key, value]) => {
      if ((merged[key] === null || merged[key] === undefined || merged[key] === "") && value !== null && value !== undefined && value !== "") merged[key] = value;
    }));
    merged.duplicateSources = [...new Set(group.map((row) => row.source).filter(Boolean))];
    return merged;
  });
}

function preferProjectPrimarySources(rows) {
  const targetLeagues = new Set(["美职", "巴西甲"]);
  const primaryPattern = /^(500\.com|okooo)/i;
  const primaryCountByLeague = new Map();
  rows.forEach((row) => {
    const league = String(row.league || row.competition || "").trim();
    if (targetLeagues.has(league) && primaryPattern.test(String(row.source || row.dataSource || ""))) {
      primaryCountByLeague.set(league, (primaryCountByLeague.get(league) || 0) + 1);
    }
  });
  return rows.filter((row) => {
    const league = String(row.league || row.competition || "").trim();
    if (!targetLeagues.has(league) || (primaryCountByLeague.get(league) || 0) < 100) return true;
    return primaryPattern.test(String(row.source || row.dataSource || ""));
  });
}

function sampleQuality(count) {
  if (count >= 100) return "FULL";
  if (count >= 30) return "CALIBRATION";
  return "DISPLAY";
}

function qualityLabel(level) {
  if (level === "FULL") return "可作为联赛画像基准";
  if (level === "CALIBRATION") return "可作为联赛校准参考";
  return "只展示，不进入模型校准";
}

function buildStyleTags(profile) {
  const tags = [];
  if (profile.drawRate >= 0.3) tags.push("平局偏高");
  if (profile.homeWinRate >= 0.48) tags.push("主场优势强");
  if (profile.homeWinRate <= 0.38) tags.push("主场优势弱");
  if (profile.avgGoals >= 2.85) tags.push("开放局");
  if (profile.avgGoals <= 2.35) tags.push("小球倾向");
  if (profile.bttsRate >= 0.55) tags.push("双方进球偏高");
  if (profile.over25Rate >= 0.56) tags.push("大2.5偏高");
  if (profile.under25Rate >= 0.56) tags.push("小2.5偏高");
  tags.push(profile.marketSampleQuality === "FULL" || profile.marketSampleQuality === "CALIBRATION" ? "含赔率样本" : "数据以赛果为主");
  return tags.slice(0, 6);
}

function buildProfile(league, rows) {
  const completeRows = rows
    .map((row) => ({ row, score: completeScore(row) }))
    .filter((item) => item.score);
  const usableRows = completeRows.filter((item) => ["HIGH", "MEDIUM"].includes(item.row.dataQuality || "MEDIUM"));
  const statsRows = usableRows.length >= 10 ? usableRows : completeRows;
  const resultLevel = sampleQuality(usableRows.length);
  const withOddsCount = rows.filter(hasOdds).length;
  const marketLevel = sampleQuality(withOddsCount);
  const sourceCounts = countBy(rows, (item) => item.source || item.dataSource || "unknown", 10);
  const seasons = countBy(rows, seasonLabel, 10).map((item) => item.label);
  const profile = {
    league,
    generatedAt: new Date().toISOString(),
    sampleCount: rows.length,
    completedSampleCount: completeRows.length,
    usableSampleCount: usableRows.length,
    excludedLowQualityCount: completeRows.length - usableRows.length,
    withOddsCount,
    resultOnlyCount: rows.length - withOddsCount,
    sampleQuality: resultLevel,
    sampleQualityLabel: qualityLabel(resultLevel),
    resultSampleQuality: resultLevel,
    resultSampleQualityLabel: qualityLabel(resultLevel),
    marketSampleQuality: marketLevel,
    marketSampleQualityLabel:
      marketLevel === "FULL"
        ? "盘口样本可作为市场画像基准"
        : marketLevel === "CALIBRATION"
          ? "盘口样本可作为市场校准参考"
          : "盘口样本不足，只能使用赛果画像",
    seasons,
    sourceCounts,
    homeWinRate: rate(statsRows, (item) => resultSide(item.score) === "HOME"),
    drawRate: rate(statsRows, (item) => resultSide(item.score) === "DRAW"),
    awayWinRate: rate(statsRows, (item) => resultSide(item.score) === "AWAY"),
    avgGoals: average(statsRows, (item) => item.score.total),
    homeGoalsAvg: average(statsRows, (item) => item.score.home),
    awayGoalsAvg: average(statsRows, (item) => item.score.away),
    over25Rate: rate(statsRows, (item) => item.score.total >= 3),
    under25Rate: rate(statsRows, (item) => item.score.total <= 2),
    bttsRate: rate(statsRows, (item) => item.score.home > 0 && item.score.away > 0),
    commonScores: countBy(statsRows, (item) => `${item.score.home}-${item.score.away}`, 5),
    totalGoalDistribution: countBy(statsRows, (item) => `${item.score.total}球`, 8),
  };
  profile.styleTags = buildStyleTags(profile);
  const topScores = profile.commonScores.map((item) => `${item.label} ${item.count}场`).join(" / ") || "等待比分样本";
  const totalHint = profile.avgGoals >= 2.85 ? "总进球先按开放局校验" : profile.avgGoals <= 2.35 ? "总进球先按收紧局校验" : "总进球按常规区间校验";
  const marketHint = marketLevel === "DISPLAY"
    ? `盘口样本 ${withOddsCount} 场，不参与盘口相似推演`
    : `盘口样本 ${withOddsCount} 场，${profile.marketSampleQualityLabel}`;
  profile.modelHint = `联赛画像：${league} 可用赛果样本 ${profile.usableSampleCount} 场，主胜 ${pct(profile.homeWinRate)}，平 ${pct(profile.drawRate)}，客胜 ${pct(profile.awayWinRate)}，均球 ${profile.avgGoals.toFixed(2)}；常见比分 ${topScores}；模型使用：${totalHint}，${profile.resultSampleQualityLabel}；${marketHint}。`;
  return profile;
}

const samples = dedupeProfileRows(preferProjectPrimarySources(readSamples(inputPaths)));
const grouped = new Map();
samples.forEach((row) => {
  const league = String(row.league || row.competition || "未分类赛事").trim();
  if (!league) return;
  if (!grouped.has(league)) grouped.set(league, []);
  grouped.get(league).push(row);
});

const profiles = [...grouped.entries()]
  .map(([league, rows]) => buildProfile(league, rows))
  .sort((a, b) => b.usableSampleCount - a.usableSampleCount || a.league.localeCompare(b.league, "zh-Hans-CN"));

const payload = {
  generatedAt: new Date().toISOString(),
  source: inputPaths.map((item) => path.relative(root, item)),
  profileCount: profiles.length,
  profiles,
};

const body = `window.WC_LEAGUE_PROFILES = ${JSON.stringify(payload, null, 2)};\n`;
fs.writeFileSync(outputPath, body);
console.log(`Generated ${profiles.length} league profiles -> ${outputPath}`);
