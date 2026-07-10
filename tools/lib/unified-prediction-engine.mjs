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
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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
      return { date: dateKey(sample.kickoffTime), gf, ga, result: gf > ga ? "W" : gf < ga ? "L" : "D" };
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
  const homeAttack = average(homeRows, "gf", 1.35);
  const homeDefence = average(homeRows, "ga", 1.2);
  const awayAttack = average(awayRows, "gf", 1.15);
  const awayDefence = average(awayRows, "ga", 1.35);
  return {
    home: Math.min(3.6, Math.max(0.35, (homeAttack + awayDefence) / 2)),
    away: Math.min(3.6, Math.max(0.35, (awayAttack + homeDefence) / 2)),
    homeRows,
    awayRows,
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

function resultFromScores(rows) {
  return normalizeProbabilities([
    rows.filter((row) => row.home > row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home === row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home < row.away).reduce((sum, row) => sum + row.probability, 0),
  ]);
}

function researchAudit(research = {}) {
  const items = RESEARCH_KEYS.map((key) => {
    const entry = research[key] || {};
    const sources = Array.isArray(entry.sources) ? entry.sources.filter((source) => source?.url && source?.title) : [];
    const fresh = entry.capturedAt && Date.now() - Date.parse(entry.capturedAt) <= 72 * 60 * 60 * 1000;
    const complete = entry.status === "VERIFIED" && String(entry.summary || "").trim().length >= 20 && sources.length > 0 && fresh;
    return { key, complete, status: entry.status || "MISSING", summary: entry.summary || "", sources, capturedAt: entry.capturedAt || "" };
  });
  return { complete: items.every((item) => item.complete), items, missing: items.filter((item) => !item.complete).map((item) => item.key) };
}

function oddsMovementAudit(history = {}) {
  const had = Array.isArray(history.had) ? history.had : [];
  const snapshots = had.filter((row) => [row.h, row.d, row.a].every((value) => validOdd(value)));
  return {
    complete: snapshots.length >= 2,
    snapshots: snapshots.length,
    first: snapshots[0] || null,
    latest: snapshots.at(-1) || null,
  };
}

function handicapResult(score, handicap) {
  const line = number(String(handicap ?? "0").replace("+", "")) ?? 0;
  const adjusted = score.home + line - score.away;
  return adjusted > 0 ? "让胜" : adjusted < 0 ? "让负" : "让平";
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
    ...Object.fromEntries(RESEARCH_KEYS.map((key) => [key, { status: "MISSING", summary: "", capturedAt: "", sources: [] }])),
  };
}

export function runUnifiedPrediction(context = {}, options = {}) {
  const match = context.match || {};
  const market = context.market || {};
  const samples = Array.isArray(context.samples) ? context.samples.filter((sample) => sample.league === match.league) : [];
  const beforeDate = dateKey(match.matchDate || match.ticaiDate || match.kickoffTime);
  const marketBaseline = noVig([market.normal?.win, market.normal?.draw, market.normal?.lose]);
  const xg = expectedGoals(samples, match.home, match.away, beforeDate);
  const scores = scoreGrid(xg);
  const poissonBaseline = resultFromScores(scores);
  const formBaseline = formProbabilities(xg.homeRows, xg.awayRows);
  const baselineParts = [
    marketBaseline ? { label: "market", weight: 0.4, values: marketBaseline.probabilities } : null,
    { label: "poisson", weight: 0.35, values: poissonBaseline },
    formBaseline ? { label: "form", weight: 0.25, values: formBaseline } : null,
  ].filter(Boolean);
  const weightTotal = baselineParts.reduce((sum, part) => sum + part.weight, 0);
  const probabilities = normalizeProbabilities(resultLabels.map((_, index) => baselineParts.reduce((sum, part) => sum + part.values[index] * part.weight, 0) / weightTotal));
  const rankedResults = resultLabels.map((label, index) => ({ label, text: resultText[label], probability: probabilities[index] })).sort((a, b) => b.probability - a.probability);
  const topScores = scores.slice(0, 2);
  const research = researchAudit(context.research);
  const movement = oddsMovementAudit(context.oddsHistory);
  const sampleGate = samples.length >= 10;
  const oddsGate = Boolean(marketBaseline);
  const scoreGate = topScores.length === 2 && topScores.every((row) => row.probability > 0);
  const handicapMapped = topScores.map((row) => ({ score: row.score, result: handicapResult(row, match.handicap) }));
  const handicapConsensus = handicapMapped[0]?.result === handicapMapped[1]?.result ? handicapMapped[0].result : handicapMapped[0]?.result || "待判";
  const conflict = rankedResults[0].probability - rankedResults[1].probability < 0.06;
  const gates = {
    completeOdds: oddsGate,
    historicalSamples: sampleGate,
    oddsMovement: movement.complete,
    preMatchResearch: research.complete,
    scoreValidation: scoreGate,
    decisionConflictResolved: !conflict || research.complete,
    handicapMapping: handicapMapped.length === 2,
  };
  const allGatesPass = Object.values(gates).every(Boolean);
  const requestedFinal = String(options.lockType || "PRE_LOCK").toUpperCase() === "FINAL_LOCK";
  const lockType = requestedFinal && allGatesPass ? "FINAL_LOCK" : "PRE_LOCK";
  const confidence = Math.round(Math.max(0, Math.min(100, rankedResults[0].probability * 100 - (conflict ? 8 : 0) + (research.complete ? 5 : -10) + (movement.complete ? 3 : -5))));
  const advice = !allGatesPass ? "观察" : confidence >= 62 ? "主打" : confidence >= 55 ? "可选" : confidence >= 48 ? "谨慎" : "跳过";
  return {
    contractVersion: "UNIFIED_PREDICTION_V1",
    generatedAt: new Date().toISOString(),
    match,
    requestedLockType: requestedFinal ? "FINAL_LOCK" : "PRE_LOCK",
    lockType,
    modelVersion: match.league === "世界杯" ? "V4-UNIFIED" : "V1-UNIFIED",
    featureSet: {
      market: marketBaseline,
      baselineParts: baselineParts.map((part) => ({ label: part.label, weight: part.weight, probabilities: part.values.map((value) => round(value)) })),
      probabilities: Object.fromEntries(resultLabels.map((label, index) => [label, round(probabilities[index])])),
      xg: { home: round(xg.home, 2), away: round(xg.away, 2) },
      recentForm: { home: xg.homeRows, away: xg.awayRows },
      sampleCount: samples.length,
      oddsMovement: movement,
      research,
    },
    scenarioSet: topScores.map((row, index) => ({ rank: index + 1, score: row.score, probability: round(row.probability), handicapResult: handicapMapped[index]?.result })),
    gateResult: { passed: allGatesPass, gates, blockers: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name) },
    finalDecision: {
      winDrawLose: rankedResults[0].text,
      recommendationSide: rankedResults[0].label,
      handicapPick: handicapConsensus,
      totalGoalsPick: totalGoalsPick(scores),
      scores: topScores.map((row) => row.score),
      matchType: matchType(scores),
      confidence,
      advice,
      conflict,
    },
  };
}

export { RESEARCH_KEYS };
