const RESEARCH_KEYS = [
  "teamState",
  "injuries",
  "expectedLineups",
  "motivation",
  "weatherVenue",
  "styleMatchup",
  "marketNews",
];

const resultLabels = ["HOME", "DRAW", "AWAY"];
const resultText = { HOME: "胜", DRAW: "平", AWAY: "负" };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validOdd(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 1 ? parsed : null;
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeProbabilities(values) {
  const safe = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  return total > 0 ? safe.map((value) => value / total) : [1 / safe.length, 1 / safe.length, 1 / safe.length];
}

function noVig(odds) {
  const values = odds.map(validOdd);
  if (values.some((value) => value === null)) return null;
  const raw = values.map((value) => 1 / value);
  const probabilities = normalizeProbabilities(raw);
  return {
    odds: values,
    probabilities,
    overround: round(raw.reduce((sum, value) => sum + value, 0)),
    returnRate: round(1 / raw.reduce((sum, value) => sum + value, 0)),
  };
}

function dateKey(value = "") {
  return String(value || "").slice(0, 10);
}

function teamKey(value = "") {
  const raw = String(value || "").trim();
  const aliases = [
    [/^(?:挪威|Norway)$/i, "norway"], [/^(?:英格兰|England)$/i, "england"],
    [/^(?:阿根廷|Argentina)$/i, "argentina"], [/^(?:瑞士|Switzerland)$/i, "switzerland"],
    [/腓特烈(?:斯塔)?/i, "fredrikstad"], [/利勒斯(?:特罗姆)?/i, "lillestrom"],
    [/特罗姆(?:瑟)?/i, "tromso"], [/瓦勒伦(?:加)?/i, "valerenga"], [/奥勒松/i, "aalesund"], [/莫尔德/i, "molde"],
    [/萨普斯|Sarpsborg(?:\s*08)?/i, "sarpsborg"], [/KFU|KFUM(?:\s*Oslo|奥斯陆)?/i, "kfum"],
    [/博德闪|Bod[oø](?:\/Glimt)?/i, "bodoglimt"], [/罗森博|Rosenborg/i, "rosenborg"],
    [/克里斯|Kristiansund/i, "kristiansund"], [/桑纳菲|Sandefjord/i, "sandefjord"],
    [/韦斯特|V[aä]ster[aå]s/i, "vasteras"], [/代格福|Degerfors/i, "degerfors"],
    [/米亚尔(?:比)?/i, "mjallby"], [/(?:AIK)?索尔纳/i, "aik"], [/厄尔格|奥尔格里特/i, "orgryte"], [/赫根/i, "hacken"],
    [/拉赫蒂|Lahti/i, "lahti"], [/HIFK|Helsinki IFK/i, "hifk"], [/赫尔火|赫尔辛基火花|IF Gnistan/i, "gnistan"], [/赫尔辛(?:基)?|HJK(?: Helsinki)?/i, "hjk"], [/玛丽港|Mariehamn/i, "mariehamn"],
    [/AC\s*奥(?:卢)?|AC\s*Oulu/i, "acoulu"], [/TPS|Turku\s*PS/i, "tps"],
  ];
  const matched = aliases.find(([pattern]) => pattern.test(raw));
  if (matched) return matched[1];
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameTeam(left, right) {
  const a = teamKey(left);
  const b = teamKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function sampleScore(sample) {
  const home = number(sample.actualHomeGoals);
  const away = number(sample.actualAwayGoals);
  if (home !== null && away !== null) return { home, away };
  const matched = String(sample.score || "").match(/(\d+)\D+(\d+)/);
  return matched ? { home: Number(matched[1]), away: Number(matched[2]) } : null;
}

function recentTeamForm(samples, team, beforeDate, limit = 8) {
  return samples
    .filter((sample) => !beforeDate || dateKey(sample.kickoffTime) < beforeDate)
    .filter((sample) => sameTeam(team, sample.homeTeam) || sameTeam(team, sample.awayTeam))
    .map((sample) => ({ sample, score: sampleScore(sample) }))
    .filter((item) => item.score)
    .sort((a, b) => String(b.sample.kickoffTime || "").localeCompare(String(a.sample.kickoffTime || "")))
    .slice(0, limit)
    .map(({ sample, score }) => {
      const isHome = sameTeam(team, sample.homeTeam);
      const gf = isHome ? score.home : score.away;
      const ga = isHome ? score.away : score.home;
      return { date: dateKey(sample.kickoffTime), gf, ga, result: gf > ga ? "W" : gf < ga ? "L" : "D", venue: isHome ? "HOME" : "AWAY" };
    });
}

function formProbabilities(homeRows, awayRows) {
  if (homeRows.length < 3 || awayRows.length < 3) return null;
  const points = (rows) => rows.reduce((sum, row) => sum + (row.result === "W" ? 3 : row.result === "D" ? 1 : 0), 0) / (rows.length * 3);
  const homeStrength = points(homeRows);
  const awayStrength = points(awayRows);
  const draw = Math.max(0.2, 0.31 - Math.abs(homeStrength - awayStrength) * 0.15);
  const remaining = 1 - draw;
  const home = remaining * (0.5 + (homeStrength - awayStrength) * 0.45);
  return normalizeProbabilities([home, draw, remaining - home]);
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function poisson(lambda, goals) {
  return Math.exp(-lambda) * (lambda ** goals) / factorial(goals);
}

function expectedGoals(samples, homeTeam, awayTeam, beforeDate) {
  const homeRows = recentTeamForm(samples, homeTeam, beforeDate, 8);
  const awayRows = recentTeamForm(samples, awayTeam, beforeDate, 8);
  const average = (rows, key, fallback) => rows.length ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : fallback;
  const homeVenueRows = homeRows.filter((row) => row.venue === "HOME");
  const awayVenueRows = awayRows.filter((row) => row.venue === "AWAY");
  const homeBasis = homeVenueRows.length >= 3 ? homeVenueRows : homeRows;
  const awayBasis = awayVenueRows.length >= 3 ? awayVenueRows : awayRows;
  const leagueScores = samples.map(sampleScore).filter(Boolean);
  const leagueAverageGoals = leagueScores.length
    ? leagueScores.reduce((sum, score) => sum + score.home + score.away, 0) / leagueScores.length
    : 2.6;
  const leagueOpennessFactor = Math.max(0.82, Math.min(1.22, leagueAverageGoals / 2.6));
  const variance = (rows, key) => {
    if (rows.length < 2) return 0;
    const mean = average(rows, key, 0);
    return rows.reduce((sum, row) => sum + (row[key] - mean) ** 2, 0) / rows.length;
  };
  const homeAttack = average(homeBasis, "gf", 1.35);
  const homeDefence = average(homeBasis, "ga", 1.2);
  const awayAttack = average(awayBasis, "gf", 1.15);
  const awayDefence = average(awayBasis, "ga", 1.35);
  return {
    home: Math.min(3.8, Math.max(0.3, ((homeAttack + awayDefence) / 2) * leagueOpennessFactor)),
    away: Math.min(3.8, Math.max(0.3, ((awayAttack + homeDefence) / 2) * leagueOpennessFactor)),
    homeRows,
    awayRows,
    venueProfile: {
      homeSampleCount: homeVenueRows.length,
      awaySampleCount: awayVenueRows.length,
      homeAttackVariance: round(variance(homeBasis, "gf"), 3),
      homeDefenceVariance: round(variance(homeBasis, "ga"), 3),
      awayAttackVariance: round(variance(awayBasis, "gf"), 3),
      awayDefenceVariance: round(variance(awayBasis, "ga"), 3),
    },
    leagueProfile: {
      sampleCount: leagueScores.length,
      averageGoals: round(leagueAverageGoals, 3),
      opennessFactor: round(leagueOpennessFactor, 3),
    },
  };
}

function scoreGrid(xg) {
  const rows = [];
  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      rows.push({ home, away, score: `${home}-${away}`, probability: poisson(xg.home, home) * poisson(xg.away, away) });
    }
  }
  return rows.sort((a, b) => b.probability - a.probability);
}

function normalizedMap(entries = []) {
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  return new Map(entries.map(([key, value]) => [key, total > 0 ? Math.max(0, Number(value) || 0) / total : 0]));
}

function scoreMarketDistribution(rows = []) {
  const entries = rows.map((row) => [String(row.score || "").replace(":", "-"), validOdd(row.odds)]).filter(([score, odds]) => /^\d+-\d+$/.test(score) && odds);
  return normalizedMap(entries.map(([score, odds]) => [score, 1 / odds]));
}

function historicalScoreDistribution(samples, currentMarket) {
  const currentOdds = [currentMarket.normal?.win, currentMarket.normal?.draw, currentMarket.normal?.lose].map(number);
  const weighted = new Map();
  let sampleCount = 0;
  for (const sample of samples) {
    const score = sampleScore(sample);
    const sampleOdds = [sample.euroHomeOdds ?? sample.sportteryHomeSp, sample.euroDrawOdds ?? sample.sportteryDrawSp, sample.euroAwayOdds ?? sample.sportteryAwaySp].map(number);
    if (!score || sampleOdds.some((value) => value === null) || currentOdds.some((value) => value === null)) continue;
    const distance = sampleOdds.reduce((sum, value, index) => sum + Math.abs(value - currentOdds[index]), 0);
    if (distance > 4.5) continue;
    const key = `${score.home}-${score.away}`;
    weighted.set(key, (weighted.get(key) || 0) + 1 / (1 + distance));
    sampleCount += 1;
  }
  return { sampleCount, probabilities: normalizedMap([...weighted.entries()]) };
}

function blendScoreDistribution(scoreRows, marketRows, historical) {
  const base = normalizedMap(scoreRows.map((row) => [row.score, row.probability]));
  const market = scoreMarketDistribution(marketRows);
  const parts = [
    { label: "fundamental-score-grid", weight: 0.7, probabilities: base },
    historical.sampleCount >= 10 ? { label: "historical-similar", weight: 0.2, probabilities: historical.probabilities } : null,
    market.size ? { label: "sporttery-score-calibration", weight: 0.1, probabilities: market } : null,
  ].filter(Boolean);
  const keys = new Set(parts.flatMap((part) => [...part.probabilities.keys()]));
  const weightTotal = parts.reduce((sum, part) => sum + part.weight, 0);
  const rows = [...keys].map((score) => {
    const matched = score.match(/^(\d+)-(\d+)$/);
    return { score, home: Number(matched?.[1]), away: Number(matched?.[2]), probability: parts.reduce((sum, part) => sum + (part.probabilities.get(score) || 0) * part.weight, 0) / weightTotal };
  }).filter((row) => Number.isFinite(row.home) && Number.isFinite(row.away)).sort((a, b) => b.probability - a.probability);
  return { rows, parts: parts.map((part) => ({ label: part.label, weight: part.weight })), marketComplete: market.size >= 8, historicalSampleCount: historical.sampleCount };
}

function totalMarketDistribution(rows = []) {
  const entries = rows.map((row) => [String(row.goals ?? ""), validOdd(row.odds)]).filter(([goals, odds]) => /^(?:[0-6]|7\+)$/.test(goals) && odds);
  return normalizedMap(entries.map(([goals, odds]) => [goals, 1 / odds]));
}

function totalGoalModel(scoreRows, marketRows) {
  const fromScores = new Map();
  scoreRows.forEach((row) => { const key = row.home + row.away >= 7 ? "7+" : String(row.home + row.away); fromScores.set(key, (fromScores.get(key) || 0) + row.probability); });
  const scoreProbabilities = normalizedMap([...fromScores.entries()]);
  const marketProbabilities = totalMarketDistribution(marketRows);
  const parts = [{ label: "joint-score-model", weight: 0.85, probabilities: scoreProbabilities }, marketProbabilities.size ? { label: "sporttery-total-calibration", weight: 0.15, probabilities: marketProbabilities } : null].filter(Boolean);
  const weightTotal = parts.reduce((sum, part) => sum + part.weight, 0);
  const keys = new Set(parts.flatMap((part) => [...part.probabilities.keys()]));
  const probabilities = normalizedMap([...keys].map((key) => [key, parts.reduce((sum, part) => sum + (part.probabilities.get(key) || 0) * part.weight, 0) / weightTotal]));
  const ranked = [...probabilities.entries()].sort((a, b) => b[1] - a[1]);
  return { probabilities, pick: ranked.slice(0, 2).map(([goals]) => `${goals}球`).join("/"), components: parts.map((part) => ({ label: part.label, weight: part.weight })), marketComplete: marketProbabilities.size >= 8 };
}

function resultFromScores(rows) {
  return normalizeProbabilities([
    rows.filter((row) => row.home > row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home === row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home < row.away).reduce((sum, row) => sum + row.probability, 0),
  ]);
}

function researchAudit(research = {}, asOf = new Date().toISOString()) {
  const weights = { teamState: 0.2, injuries: 0.18, expectedLineups: 0.17, motivation: 0.12, weatherVenue: 0.05, styleMatchup: 0.18, marketNews: 0.1 };
  const freshnessHours = { teamState: 168, injuries: 24, expectedLineups: 24, motivation: 72, weatherVenue: 48, styleMatchup: 168, marketNews: 6 };
  const adjustment = { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 };
  const items = RESEARCH_KEYS.map((key) => {
    const entry = research[key] || {};
    const sources = Array.isArray(entry.sources) ? entry.sources.filter((source) => source?.url && source?.title) : [];
    const observedAt = entry.observedAt || "";
    const capturedFresh = entry.capturedAt && Date.now() - Date.parse(entry.capturedAt) <= 72 * 60 * 60 * 1000;
    const observedFresh = observedAt && Date.now() - Date.parse(observedAt) <= (freshnessHours[key] || 72) * 60 * 60 * 1000;
    const impact = entry.impact || {};
    const numericImpact = ["home", "draw", "away", "xgHome", "xgAway"].every((field) => Number.isFinite(Number(impact[field])));
    const evidenceGrade = String(entry.evidenceGrade || "").toUpperCase();
    const beforeLock = (!entry.capturedAt || Date.parse(entry.capturedAt) <= Date.parse(asOf)) && (!observedAt || Date.parse(observedAt) <= Date.parse(asOf));
    const verified = entry.status === "VERIFIED" && String(entry.summary || "").trim().length >= 20 && sources.length > 0 && capturedFresh && observedFresh && beforeLock && numericImpact && ["A", "B", "C"].includes(evidenceGrade);
    const nonDecisiveUnavailable = ["injuries", "expectedLineups"].includes(key)
      && entry.status === "NOT_PUBLISHED"
      && String(entry.summary || "").trim().length >= 20
      && sources.length > 0 && capturedFresh && observedFresh && beforeLock && numericImpact
      && ["home", "draw", "away", "xgHome", "xgAway"].every((field) => Number(impact[field]) === 0);
    const complete = verified || nonDecisiveUnavailable;
    if (complete) {
      const weight = weights[key] || 0;
      for (const field of Object.keys(adjustment)) adjustment[field] += Number(impact[field]) * weight;
    }
    return { key, complete, verified, nonDecisiveUnavailable, status: entry.status || "MISSING", summary: entry.summary || "", sources, capturedAt: entry.capturedAt || "", observedAt, freshnessHours: freshnessHours[key] || 72, capturedFresh: Boolean(capturedFresh), observedFresh: Boolean(observedFresh), beforeLock: Boolean(beforeLock), evidenceGrade, impact: numericImpact ? Object.fromEntries(Object.keys(adjustment).map((field) => [field, round(Number(impact[field]))])) : null };
  });
  const capped = Object.fromEntries(Object.entries(adjustment).map(([key, value]) => [key, round(Math.max(key.startsWith("xg") ? -0.5 : -0.12, Math.min(key.startsWith("xg") ? 0.5 : 0.12, value)))]));
  return { complete: items.every((item) => item.complete), items, missing: items.filter((item) => !item.complete).map((item) => item.key), adjustment: capped };
}

function oddsMovementAudit(history = {}) {
  const had = Array.isArray(history.had) ? history.had : [];
  const snapshots = had.filter((row) => [row.h, row.d, row.a].every((value) => validOdd(value)));
  const latest = snapshots.at(-1) || null;
  const distance = (left, right) => Math.abs(Number(left) - Number(right));
  const cleanSnapshots = latest ? snapshots.filter((row) => {
    const aligned = distance(row.h, latest.h) + distance(row.a, latest.a);
    const reversed = distance(row.h, latest.a) + distance(row.a, latest.h);
    return aligned <= reversed;
  }) : [];
  const first = cleanSnapshots[0] || null;
  const movementMagnitude = first && latest
    ? round(Math.abs(Number(first.h) - Number(latest.h)) + Math.abs(Number(first.d) - Number(latest.d)) + Math.abs(Number(first.a) - Number(latest.a)), 3)
    : 0;
  return {
    complete: cleanSnapshots.length >= 2,
    snapshots: snapshots.length,
    cleanSnapshots: cleanSnapshots.length,
    rejectedOrientationSnapshots: snapshots.length - cleanSnapshots.length,
    first,
    latest,
    movementMagnitude,
    marketState: movementMagnitude >= 0.05 ? "MOVED" : "STABLE",
  };
}

function scoreResult(row) {
  return row.home > row.away ? "HOME" : row.home < row.away ? "AWAY" : "DRAW";
}

function daysBetween(left, right) {
  const a = Date.parse(String(left || "").slice(0, 10));
  const b = Date.parse(String(right || "").slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86400000 : Infinity;
}

function handicapResult(score, handicap) {
  const line = number(String(handicap ?? "0").replace("+", "")) ?? 0;
  const adjusted = score.home + line - score.away;
  return adjusted > 0 ? "让胜" : adjusted < 0 ? "让负" : "让平";
}

const handicapLabels = ["让胜", "让平", "让负"];

function handicapProbabilitiesFromScores(rows, handicap) {
  const totals = Object.fromEntries(handicapLabels.map((label) => [label, 0]));
  for (const row of rows) totals[handicapResult(row, handicap)] += Number(row.probability || 0);
  return normalizeProbabilities(handicapLabels.map((label) => totals[label]));
}

function historicalHandicapDistribution(samples, currentMarket, handicap) {
  const currentOdds = [currentMarket.normal?.win, currentMarket.normal?.draw, currentMarket.normal?.lose].map(number);
  const rows = samples.map((sample) => {
    const score = sampleScore(sample);
    const sampleOdds = [sample.euroHomeOdds ?? sample.sportteryHomeSp, sample.euroDrawOdds ?? sample.sportteryDrawSp, sample.euroAwayOdds ?? sample.sportteryAwaySp].map(number);
    if (!score || sampleOdds.some((value) => value === null) || currentOdds.some((value) => value === null)) return null;
    const oddsDistance = sampleOdds.reduce((sum, value, index) => sum + Math.abs(value - currentOdds[index]), 0);
    const lineDistance = Number.isFinite(Number(sample.asianHandicap)) ? Math.abs(Number(sample.asianHandicap) - Number(handicap || 0)) : 0.75;
    if (oddsDistance > 4.5 || lineDistance > 1) return null;
    return { result: handicapResult(score, handicap), weight: 1 / (1 + oddsDistance + lineDistance * 1.5) };
  }).filter(Boolean).sort((a, b) => b.weight - a.weight).slice(0, 80);
  if (rows.length < 10) return { complete: false, sampleCount: rows.length, probabilities: null };
  const totals = Object.fromEntries(handicapLabels.map((label) => [label, 0]));
  rows.forEach((row) => { totals[row.result] += row.weight; });
  return { complete: true, sampleCount: rows.length, probabilities: normalizeProbabilities(handicapLabels.map((label) => totals[label])) };
}

function jointDirectionHandicapDecision(scoreRows, directionProbabilities, handicapProbabilities, handicap) {
  const scoreTotal = scoreRows.reduce((sum, row) => sum + Number(row.probability || 0), 0) || 1;
  const joint = new Map();
  for (const row of scoreRows) {
    const key = `${scoreResult(row)}|${handicapResult(row, handicap)}`;
    joint.set(key, (joint.get(key) || 0) + Number(row.probability || 0) / scoreTotal);
  }
  const candidates = [];
  resultLabels.forEach((direction, directionIndex) => handicapLabels.forEach((handicapLabel, handicapIndex) => {
    const key = `${direction}|${handicapLabel}`;
    const scoreProbability = joint.get(key) || 0;
    if (scoreProbability <= 0) return;
    const marginalProduct = directionProbabilities[directionIndex] * handicapProbabilities[handicapIndex];
    candidates.push({ direction, handicapPick: handicapLabel, scoreProbability, marginalProduct, score: scoreProbability * 0.65 + marginalProduct * 0.35 });
  }));
  candidates.sort((a, b) => b.score - a.score);
  return { selected: candidates[0] || null, candidates };
}

function totalGoalsPick(rows) {
  const totals = new Map();
  for (const row of rows) totals.set(row.home + row.away, (totals.get(row.home + row.away) || 0) + row.probability);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([goals]) => `${goals >= 7 ? "7+" : goals}球`).join("/");
}

function matchType(rows) {
  const average = rows.reduce((sum, row) => sum + (row.home + row.away) * row.probability, 0);
  return average < 1.9 ? "闷局" : average < 2.9 ? "常规局" : average < 3.8 ? "开放局" : "打花局";
}

export function researchTemplate(match = {}) {
  return {
    match: { matchId: match.matchId || "", league: match.league || "", home: match.home || "", away: match.away || "", kickoffTime: match.kickoffTime || "" },
    generatedAt: new Date().toISOString(),
    ...Object.fromEntries(RESEARCH_KEYS.map((key) => [key, { status: "MISSING", evidenceGrade: "", summary: "", capturedAt: "", observedAt: "", sources: [], impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 } }])),
  };
}

export function runUnifiedPrediction(context = {}, options = {}) {
  const match = context.match || {};
  const market = context.market || {};
  const samples = Array.isArray(context.samples) ? context.samples.filter((sample) => sample.league === match.league) : [];
  const beforeDate = dateKey(match.matchDate || match.ticaiDate || match.kickoffTime);
  const marketBaseline = noVig([market.normal?.win, market.normal?.draw, market.normal?.lose]);
  const asOf = context.asOf || new Date().toISOString();
  const research = researchAudit(context.research, asOf);
  const verifiedRecentMatches = Array.isArray(context.research?.teamState?.recentMatches)
    ? context.research.teamState.recentMatches
    : [];
  const baseXg = expectedGoals([...samples, ...verifiedRecentMatches], match.home, match.away, beforeDate);
  const xg = { ...baseXg, home: Math.max(0.2, baseXg.home + research.adjustment.xgHome), away: Math.max(0.2, baseXg.away + research.adjustment.xgAway) };
  const poissonScores = scoreGrid(xg);
  const formBaseline = formProbabilities(xg.homeRows, xg.awayRows);
  const historicalScores = historicalScoreDistribution(samples, market);
  const scoreModel = blendScoreDistribution(poissonScores, market.scoreOdds || [], historicalScores);
  const scores = scoreModel.rows;
  // V4 stable contract: all four markets share one joint score distribution.
  // Sporttery prices calibrate at a bounded weight and never replace missing fundamentals.
  const scoreProbabilities = resultFromScores(scores);
  const baselineParts = [
    { label: "joint-score-model", weight: 0.85, values: scoreProbabilities },
    marketBaseline ? { label: "sporttery-wdl-calibration", weight: 0.15, values: marketBaseline.probabilities } : null,
  ].filter(Boolean);
  const weightTotal = baselineParts.reduce((sum, part) => sum + part.weight, 0);
  const baselineProbabilities = normalizeProbabilities(resultLabels.map((_, index) => baselineParts.reduce((sum, part) => sum + part.values[index] * part.weight, 0) / weightTotal));
  const probabilities = normalizeProbabilities(baselineProbabilities.map((value, index) => value + [research.adjustment.home, research.adjustment.draw, research.adjustment.away][index] * 0.25));
  const rankedResults = resultLabels.map((label, index) => ({ label, text: resultText[label], probability: probabilities[index] })).sort((a, b) => b.probability - a.probability);
  let mainScore = scores[0];
  let counterScore = scores.find((row) => scoreResult(row) !== scoreResult(mainScore)) || scores[1];
  let topScores = [mainScore, counterScore].filter(Boolean);
  const totalModel = totalGoalModel(scores, market.totalGoalsOdds || []);
  const movement = oddsMovementAudit(context.oddsHistory);
  const sampleGate = samples.length >= 10;
  const oddsGate = Boolean(marketBaseline);
  const scoreGate = topScores.length === 2 && topScores.every((row) => row.probability > 0);
  let handicapMapped = topScores.map((row) => ({ score: row.score, result: handicapResult(row, match.handicap) }));
  const handicapScoreProbabilities = handicapProbabilitiesFromScores(scores, match.handicap);
  const handicapMarket = noVig([market.handicapOdds?.win, market.handicapOdds?.draw, market.handicapOdds?.lose]);
  const handicapHistory = historicalHandicapDistribution(samples, market, match.handicap);
  const handicapParts = [
    { label: "joint-score-model", weight: 0.75, probabilities: handicapScoreProbabilities },
    handicapHistory.complete ? { label: "historical-similar", weight: 0.15, probabilities: handicapHistory.probabilities } : null,
    handicapMarket ? { label: "sporttery-handicap-calibration", weight: 0.1, probabilities: handicapMarket.probabilities } : null,
  ].filter(Boolean);
  const handicapWeightTotal = handicapParts.reduce((sum, part) => sum + part.weight, 0);
  const handicapProbabilities = normalizeProbabilities(handicapLabels.map((_, index) => handicapParts.reduce((sum, part) => sum + part.probabilities[index] * part.weight, 0) / handicapWeightTotal));
  const rankedHandicap = handicapLabels.map((label, index) => ({ label, probability: handicapProbabilities[index] })).sort((a, b) => b.probability - a.probability);
  const jointDecision = jointDirectionHandicapDecision(scores, probabilities, handicapProbabilities, match.handicap);
  const independentDirectionLeader = rankedResults[0].label;
  const independentHandicapLeader = rankedHandicap[0]?.label || "待判";
  const independentPair = jointDecision.candidates.find((item) => item.direction === independentDirectionLeader && item.handicapPick === independentHandicapLeader) || { direction: independentDirectionLeader, handicapPick: independentHandicapLeader, scoreProbability: 0, marginalProduct: 0, score: 0 };
  // Compatibility alone never changes a pick. When independent leaders conflict,
  // the shared score model acts as an evidence arbiter and ranks all supported
  // pairs by joint score mass plus the two independent marginal probabilities.
  const conditionalDirectionCandidates = jointDecision.candidates
    .filter((item) => item.direction === independentDirectionLeader)
    .sort((left, right) => right.score - left.score);
  const resolvedPair = independentPair.scoreProbability > 0 ? independentPair : conditionalDirectionCandidates[0];
  const selectedDirection = resolvedPair?.direction || independentDirectionLeader;
  const handicapPick = resolvedPair?.handicapPick || independentHandicapLeader;
  const jointCompatibility = Boolean(resolvedPair && resolvedPair.scoreProbability > 0);
  const jointResolutionApplied = selectedDirection !== independentDirectionLeader || handicapPick !== independentHandicapLeader;
  mainScore = scores.find((row) => scoreResult(row) === selectedDirection && handicapResult(row, match.handicap) === handicapPick)
    || scores.find((row) => scoreResult(row) === selectedDirection)
    || scores[0];
  counterScore = scores.find((row) => scoreResult(row) !== selectedDirection) || scores.find((row) => row.score !== mainScore.score);
  topScores = [mainScore, counterScore].filter(Boolean);
  handicapMapped = topScores.map((row) => ({ score: row.score, result: handicapResult(row, match.handicap) }));
  const handicapIndependent = Boolean(handicapMarket && handicapParts.length >= 2 && rankedHandicap[0]?.probability > 0);
  const conflict = rankedResults[0].probability - rankedResults[1].probability < 0.06;
  const marketRanked = marketBaseline
    ? resultLabels.map((label, index) => ({ label, probability: marketBaseline.probabilities[index] })).sort((a, b) => b.probability - a.probability)
    : [];
  const drawEvidenceCount = research.items.filter((item) => item.complete && Number(item.impact?.draw || 0) - Number(item.impact?.[marketRanked[0]?.label?.toLowerCase()] || 0) >= 0.02).length;
  const drawOverrideNeeded = rankedResults[0].label === "DRAW" && marketRanked[0]?.label !== "DRAW" && marketRanked[0]?.probability - (marketBaseline?.probabilities[1] || 0) >= 0.12;
  const drawOverrideJustified = !drawOverrideNeeded || drawEvidenceCount >= 2;
  const counterScriptDiverges = topScores.length === 2 && scoreResult(topScores[0]) !== scoreResult(topScores[1]);
  const selectedDirectionProbability = probabilities[resultLabels.indexOf(selectedDirection)] || 0;
  const counterDirection = scoreResult(topScores[1]);
  const counterDirectionProbability = probabilities[resultLabels.indexOf(counterDirection)] || 0;
  const counterScoreProbability = Number(topScores[1]?.probability || 0);
  const counterPathRisk = counterScriptDiverges
    ? Math.min(12, Math.round(counterDirectionProbability * 12 + counterScoreProbability * 35))
    : 0;
  const newestHomeForm = xg.homeRows[0]?.date || "";
  const newestAwayForm = xg.awayRows[0]?.date || "";
  // The 2026 Eliteserien pauses across the World Cup window. Keep the normal
  // 21-day gate everywhere else, but allow the verified pre-match research
  // layer to bridge that scheduled league break without treating old seasons
  // as current form.
  const formFreshnessDays = match.league === "挪超" && research.complete ? 60 : 21;
  const recentFormFresh = daysBetween(newestHomeForm, beforeDate) <= formFreshnessDays && daysBetween(newestAwayForm, beforeDate) <= formFreshnessDays;
  const fundamentalDataComplete = xg.homeRows.length >= 5 && xg.awayRows.length >= 5 && Boolean(formBaseline) && recentFormFresh;
  const evidenceCompleteness = RESEARCH_KEYS.filter((key) => research.items.find((item) => item.key === key)?.complete).length / RESEARCH_KEYS.length;
  const unavailableNonDecisiveCount = research.items.filter((item) => item.nonDecisiveUnavailable).length;
  const sourceCapturedAt = Date.parse(context.sourceCapturedAt || "");
  const kickoffAt = Date.parse(match.kickoffTime || `${beforeDate}T23:59:59+08:00`);
  const temporalIntegrity = !Number.isFinite(sourceCapturedAt) || !Number.isFinite(kickoffAt) || sourceCapturedAt <= kickoffAt;
  const dataQualityScore = Math.round(
    (fundamentalDataComplete ? 35 : Math.min(25, (xg.homeRows.length + xg.awayRows.length) * 2.5))
    + Math.min(25, samples.length / 2)
    + evidenceCompleteness * 25 - unavailableNonDecisiveCount * 4
    + (movement.complete ? 10 : 0)
    + (temporalIntegrity ? 5 : 0)
  );
  const normalOddsComplete = Boolean(marketBaseline);
  const handicapOddsComplete = Boolean(handicapMarket);
  const scoreMarketComplete = scoreModel.marketComplete;
  const totalsMarketComplete = totalModel.marketComplete;
  const scoreIndependent = scoreModel.parts.length >= 2;
  const totalsIndependent = totalModel.components.length >= 2;
  const stepScores = [
    { id: 1, key: "spReview", title: "当前胜平负 SP 复核", score: normalOddsComplete ? 100 : 0, passed: normalOddsComplete },
    { id: 2, key: "rulesMotivation", title: "赛事规则/动机", score: research.items.find((item) => item.key === "motivation")?.complete ? 100 : 0, passed: Boolean(research.items.find((item) => item.key === "motivation")?.complete) },
    { id: 3, key: "teamState", title: "球队状态", score: fundamentalDataComplete ? 100 : Math.round(Math.min(90, (xg.homeRows.length + xg.awayRows.length) * 9)), passed: fundamentalDataComplete && ["teamState", "injuries", "expectedLineups"].every((key) => research.items.find((item) => item.key === key)?.complete) },
    { id: 4, key: "styleMatchup", title: "风格对位", score: research.items.find((item) => item.key === "styleMatchup")?.complete ? 100 : 0, passed: Boolean(research.items.find((item) => item.key === "styleMatchup")?.complete) },
    { id: 5, key: "marketSamples", title: "盘口和样本", score: Math.round((normalOddsComplete ? 40 : 0) + Math.min(40, samples.length / 2) + (recentFormFresh ? 20 : 0)), passed: normalOddsComplete && samples.length >= 30 && recentFormFresh },
    { id: 6, key: "stateTransfer", title: "状态转移", score: movement.complete && research.items.find((item) => item.key === "marketNews")?.complete ? 100 : 0, passed: movement.complete && Boolean(research.items.find((item) => item.key === "marketNews")?.complete) },
    { id: 7, key: "scoreTotals", title: "比分/总进球独立闸门", score: [scoreGate, scoreIndependent, totalsIndependent, counterScriptDiverges].filter(Boolean).length * 25, passed: scoreGate && scoreMarketComplete && totalsMarketComplete && scoreIndependent && totalsIndependent && counterScriptDiverges },
    { id: 8, key: "handicapGate", title: "让球独立闸门", score: handicapIndependent ? 100 : 0, passed: handicapIndependent },
    { id: 9, key: "failureValue", title: "失败方式和值过滤", score: research.complete && drawOverrideJustified ? 100 : 0, passed: research.complete && drawOverrideJustified },
  ].map((step) => ({ ...step, score: round(step.score, 0) }));
  const tenStepPassed = stepScores.every((step) => step.passed);
  stepScores.push({ id: 10, key: "finalLock", title: "最终锁版", score: tenStepPassed ? 100 : 0, passed: tenStepPassed });
  const gates = {
    completeOdds: oddsGate,
    fundamentalData: fundamentalDataComplete,
    temporalIntegrity,
    historicalSamples: sampleGate,
    oddsMovement: movement.complete,
    preMatchResearch: research.complete,
    scoreValidation: scoreGate,
    scoreIndependent,
    totalsIndependent,
    decisionConflictResolved: !conflict || research.complete,
    handicapIndependent,
    jointCompatibility,
    counterScriptDiverges,
    drawOverrideJustified,
    recentFormFresh,
    tenStepMechanism: tenStepPassed,
  };
  const allGatesPass = Object.values(gates).every(Boolean);
  const requestedFinal = String(options.lockType || "PRE_LOCK").toUpperCase() === "FINAL_LOCK";
  const lockType = requestedFinal && allGatesPass ? "FINAL_LOCK" : "PRE_LOCK";
  const confidence = Math.round(Math.max(0, Math.min(100, selectedDirectionProbability * 100 - counterPathRisk - (conflict ? 8 : 0) + (research.complete ? 5 : -10) + (movement.complete ? 3 : -5))));
  const advice = !allGatesPass ? "观察" : confidence >= 62 ? "主打" : confidence >= 55 ? "可选" : confidence >= 48 ? "谨慎" : "跳过";
  return {
    contractVersion: "UNIFIED_PREDICTION_V4",
    generatedAt: new Date().toISOString(),
    match,
    requestedLockType: requestedFinal ? "FINAL_LOCK" : "PRE_LOCK",
    lockType,
    modelVersion: match.league === "世界杯" ? "V4-UNIFIED" : "V1-UNIFIED",
    featureSet: {
      market: marketBaseline,
      baselineParts: baselineParts.map((part) => ({ label: part.label, weight: part.weight, probabilities: part.values.map((value) => round(value)) })),
      probabilities: Object.fromEntries(resultLabels.map((label, index) => [label, round(probabilities[index])])),
      baselineProbabilities: Object.fromEntries(resultLabels.map((label, index) => [label, round(baselineProbabilities[index])])),
      xg: { home: round(xg.home, 2), away: round(xg.away, 2) },
      venueProfile: xg.venueProfile,
      leagueProfile: xg.leagueProfile,
      recentForm: { home: xg.homeRows, away: xg.awayRows, verifiedEvidenceRows: verifiedRecentMatches.length },
      recentFormFresh,
      fundamentalDataComplete,
      dataQuality: { score: dataQualityScore, grade: dataQualityScore >= 85 ? "A" : dataQualityScore >= 70 ? "B" : dataQualityScore >= 55 ? "C" : "D", temporalIntegrity, evidenceCompleteness: round(evidenceCompleteness), unavailableNonDecisiveCount, minimumRecentMatchesPerTeam: 5 },
      sampleCount: samples.length,
      oddsMovement: movement,
      research,
      handicap: {
        line: number(String(match.handicap ?? "0").replace("+", "")) ?? 0,
        probabilities: Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapProbabilities[index])])),
        scoreGridProbabilities: Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapScoreProbabilities[index])])),
        marketProbabilities: handicapMarket ? Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapMarket.probabilities[index])])) : null,
        historicalProbabilities: handicapHistory.probabilities ? Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapHistory.probabilities[index])])) : null,
        historicalSampleCount: handicapHistory.sampleCount,
        components: handicapParts.map((part) => ({ label: part.label, weight: part.weight })),
      },
      score: { components: scoreModel.parts, historicalSampleCount: scoreModel.historicalSampleCount, marketComplete: scoreModel.marketComplete },
      totals: { probabilities: Object.fromEntries(totalModel.probabilities), components: totalModel.components, marketComplete: totalModel.marketComplete },
      jointDecision: { selected: resolvedPair, candidateCount: jointDecision.candidates.length, independentDirectionLeader, independentHandicapLeader, independentPairCompatible: independentPair.scoreProbability > 0, resolutionApplied: jointResolutionApplied, directionPreserved: selectedDirection === independentDirectionLeader, role: "CONDITIONAL_HANDICAP_EVIDENCE_AFTER_INDEPENDENT_CONFLICT" },
    },
    scenarioSet: topScores.map((row, index) => ({ rank: index + 1, score: row.score, probability: round(row.probability), direction: scoreResult(row), directionProbability: round(probabilities[resultLabels.indexOf(scoreResult(row))] || 0), handicapResult: handicapMapped[index]?.result, role: index === 0 ? "MAIN_PATH" : "COUNTER_PATH" })),
    tenStepResult: { passed: tenStepPassed, steps: stepScores, averageScore: round(stepScores.reduce((sum, step) => sum + step.score, 0) / stepScores.length, 1) },
    gateResult: { passed: allGatesPass, gates, blockers: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name) },
    backtestContract: { probabilityFields: ["HOME", "DRAW", "AWAY"], metrics: ["brierScore", "logLoss", "calibrationBin"], resultScope: "90_MINUTES", sampleVersion: context.sampleVersion || "rolling-current", caseReuse: "PREFERRED_FINAL_LOCK_ONLY", immutablePreMatchSnapshot: true },
    lifecycleContract: { version: "STABLE_2026_V1", states: ["DATA_PENDING", "DATA_REPAIR", "MODEL_READY", "CONSISTENCY_CHECK", "FINAL_LOCK", "RESULT_SETTLED", "BASE_CASE"], currentState: lockType === "FINAL_LOCK" ? "FINAL_LOCK" : fundamentalDataComplete && research.complete ? "CONSISTENCY_CHECK" : "DATA_REPAIR", champion: "UNIFIED_PREDICTION_V4", challengerPolicy: "shadow-only until out-of-sample calibration and loss metrics improve with sufficient samples" },
    modelLessons: {
      version: "LESSONS_2026-07-12",
      rules: [
        "让球不穿不得自动推翻胜平负方向",
        "最终方向按全部场景概率汇总，不按单一主比分决定",
        "第二比分必须覆盖不同赛果方向",
        "明显市场热门改选平局至少需要两项独立量化证据",
        "状态、阵容和市场消息必须按各自新鲜度验收",
        "PRE_LOCK不计正式模型命中率",
        "体彩赔率只做有上限的校准，不得替代缺失的基本面",
        "胜平负、让球、总进球和比分必须共享同一联合比分分布",
        "每队至少五场新鲜赛前比赛数据，缺失时进入DATA_REPAIR",
        "伤停和预计首发必须先搜索；未发布时只允许记录NOT_PUBLISHED、中性0并降低数据质量，不得虚构",
        "只有preferred FINAL_LOCK赛后结算才能生成并复用Base Case",
        "第二路径必须进入最终方向概率和置信扣分，不得只作文字保险",
        "联赛强弱差必须结合主队主场、客队客场的攻防均值与方差，并用联赛开放度校正xG",
      ],
      drawOverrideNeeded,
      drawEvidenceCount,
      counterScriptDiverges,
      counterPathRisk,
      counterDirectionProbability: round(counterDirectionProbability),
      counterScoreProbability: round(counterScoreProbability),
    },
    finalDecision: {
      winDrawLose: resultText[selectedDirection],
      recommendationSide: selectedDirection,
      handicapPick,
      totalGoalsPick: totalModel.pick,
      scores: topScores.map((row) => row.score),
      matchType: matchType(scores),
      confidence,
      confidenceAdjustments: { counterPathRisk: -counterPathRisk },
      advice,
      conflict,
    },
  };
}

export { RESEARCH_KEYS };
