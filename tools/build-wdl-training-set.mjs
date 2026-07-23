import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const args = new Map(process.argv.slice(2).map((item, index, source) => item.startsWith("--") ? [item.slice(2), source[index + 1]] : null).filter(Boolean));
const locksFile = path.resolve(args.get("locks") || "/tmp/wdl-r17-locks.json");
const resultsFile = path.resolve(args.get("results") || "/tmp/wdl-r17-results.js");
const staticDataFile = path.resolve(args.get("static-data") || "web/data.js");
const runsFile = args.get("runs") ? path.resolve(args.get("runs")) : "";
const outputFile = path.resolve(args.get("output") || "web/data/wdl-calibration-training-r17.json");

function windowValue(file, variable) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context.window[variable];
}

function probabilityMap(values = []) {
  const numeric = values.map(Number);
  const total = numeric.reduce((sum, value) => sum + (Number.isFinite(value) && value >= 0 ? value : 0), 0);
  if (numeric.some((value) => !Number.isFinite(value) || value < 0) || total <= 0) return null;
  return { HOME: numeric[0] / total, DRAW: numeric[1] / total, AWAY: numeric[2] / total };
}

function probabilityObject(value) {
  if (Array.isArray(value)) return probabilityMap(value);
  if (!value || typeof value !== "object") return null;
  return probabilityMap(["HOME", "DRAW", "AWAY"].map((label) => value[label]));
}

function probabilitiesFromOdds(values = []) {
  const odds = values.map(Number);
  if (odds.some((value) => !Number.isFinite(value) || value <= 1)) return null;
  return probabilityMap(odds.map((value) => 1 / value));
}

function percentageMidpoint(value = "") {
  const values = String(value).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!values.length) return NaN;
  return (values[0] + (values[1] ?? values[0])) / 200;
}

function normalizeLeague(value = "") {
  const text = String(value || "").trim();
  if (/^(?:瑞典超|瑞超|Allsvenskan)$/i.test(text)) return "瑞超";
  if (/^(?:韩职|K联赛|K League)$/i.test(text)) return "韩职";
  if (/^(?:挪超|Eliteserien)$/i.test(text)) return "挪超";
  return text || "通用";
}

function compactMatchId(value = "") {
  return String(value || "").replace(/^sporttery-/, "").replace(/^id-/, "");
}

function scoreOutcome(score = "") {
  const [home, away] = String(score || "").split(/[:-]/).map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { actual: home > away ? "HOME" : home < away ? "AWAY" : "DRAW", score: `${home}-${away}` };
}

function kickoffAt(row = {}, payload = {}, pred = {}) {
  for (const candidate of [row.kickoff_time, payload.kickoffTime, pred.kickoffAt].filter(Boolean)) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const date = pred.matchDate || payload.matchDate || "";
  const time = pred.kickoffTime || "";
  const parsed = Date.parse(`${date}T${time || "00:00"}:00+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

const locksPayload = JSON.parse(fs.readFileSync(locksFile, "utf8"));
const runsPayload = runsFile && fs.existsSync(runsFile)
  ? JSON.parse(fs.readFileSync(runsFile, "utf8"))
  : { runs: [] };
const liveResults = windowValue(resultsFile, "LIVE_SPORTTERY_RESULTS")?.results || [];
const staticData = windowValue(staticDataFile, "WC_DATA") || {};
const resultById = new Map(liveResults.filter((row) => row.score).map((row) => [compactMatchId(row.matchId), row]));
const runById = new Map((runsPayload.runs || []).map((row) => [String(row.run_id || row.runId || ""), row]));

function modelRunAudit(item) {
  const modelRunId = String(item.row.model_run_id || item.payload.modelRunId || item.pred.modelRunId || "");
  const run = runById.get(modelRunId);
  if (!run) return { modelRunId, modelRunLinked: false, probabilityComponents: null, runRevision: "" };
  try {
    const output = typeof run.output_json === "string" ? JSON.parse(run.output_json) : run.output_json || {};
    const baselineParts = output.featureSet?.baselineParts || [];
    const part = (label) => probabilityObject(baselineParts.find((entry) => entry.label === label)?.probabilities);
    return {
      modelRunId,
      modelRunLinked: true,
      runRevision: output.modelLessons?.version || output.modelRevision || run.model_version || "",
      probabilityComponents: {
        jointScoreModel: part("joint-score-model"),
        marketCalibration: part("sporttery-wdl-calibration"),
        blendedBaseline: probabilityObject(output.featureSet?.baselineProbabilities),
        postEvidenceModel: probabilityObject(output.featureSet?.probabilities),
      },
    };
  } catch {
    return { modelRunId, modelRunLinked: true, probabilityComponents: null, runRevision: "" };
  }
}

const parsedLocks = (locksPayload.locks || []).flatMap((row) => {
  try {
    const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json || {};
    const pred = payload.sportteryPrediction || payload.prediction || payload;
    const autoGenerated = payload.autoGenerated === true || pred.autoGenerated === true;
    return [{ row, payload, pred, autoGenerated, matchId: compactMatchId(row.match_id || payload.matchId || pred.matchId) }];
  } catch {
    return [];
  }
});
const latestManualByMatch = new Map();
for (const item of parsedLocks.filter((entry) => !entry.autoGenerated && entry.matchId)) {
  const prior = latestManualByMatch.get(item.matchId);
  if (!prior || String(item.row.locked_at).localeCompare(String(prior.row.locked_at)) > 0) latestManualByMatch.set(item.matchId, item);
}

const records = [];
for (const item of latestManualByMatch.values()) {
  const result = resultById.get(item.matchId);
  const outcome = scoreOutcome(result?.score);
  const lockedAt = String(item.row.locked_at || item.payload.lockedAt || "");
  const kickoff = kickoffAt(item.row, item.payload, item.pred);
  const modelProbabilities = probabilityMap([
    item.row.model_home_prob ?? item.payload.modelHomeProb,
    item.row.model_draw_prob ?? item.payload.modelDrawProb,
    item.row.model_away_prob ?? item.payload.modelAwayProb,
  ]);
  const marketProbabilities = probabilityMap([
    item.row.sporttery_home_prob ?? item.payload.sportteryHomeProb,
    item.row.sporttery_draw_prob ?? item.payload.sportteryDrawProb,
    item.row.sporttery_away_prob ?? item.payload.sportteryAwayProb,
  ]) || probabilitiesFromOdds([
    item.row.sporttery_home_sp ?? item.payload.sportteryHomeSp,
    item.row.sporttery_draw_sp ?? item.payload.sportteryDrawSp,
    item.row.sporttery_away_sp ?? item.payload.sportteryAwaySp,
  ]);
  const runAudit = modelRunAudit(item);
  const gaps = [];
  if (!outcome) gaps.push("RESULT_NOT_SETTLED");
  if (!lockedAt || !kickoff || Date.parse(lockedAt) >= Date.parse(kickoff)) gaps.push("TEMPORAL_INTEGRITY_FAILED");
  if (!modelProbabilities) gaps.push("MODEL_PROBABILITIES_INCOMPLETE");
  if (!marketProbabilities) gaps.push("NORMAL_WDL_MARKET_UNAVAILABLE");
  records.push({
    recordId: `d1:${item.row.lock_id}`,
    sourceType: "D1_LOCK",
    matchId: item.matchId,
    lockId: item.row.lock_id,
    lockType: item.row.lock_type,
    modelRunId: runAudit.modelRunId,
    modelRunLinked: runAudit.modelRunLinked,
    league: normalizeLeague(item.row.league || item.payload.league || item.pred.competition),
    lockedAt,
    kickoffAt: kickoff,
    modelRevision: runAudit.runRevision || item.payload.modelRevision || item.pred.modelRevision || "LEGACY_UNSPECIFIED",
    finalGrade: item.row.final_grade || item.payload.finalGrade || item.pred.finalGrade || "",
    finalAction: item.row.final_action || item.payload.finalAction || item.pred.finalAction || "",
    recommendationSide: item.row.recommendation_side || item.payload.recommendationSide || item.pred.recommendationSide || "",
    modelProbabilities,
    marketProbabilities,
    probabilityComponents: runAudit.probabilityComponents,
    actual: outcome?.actual || null,
    score: outcome?.score || "",
    resultSource: result?.resultSource || result?.source || "",
    trainingEligibility: gaps.length ? "AUDIT_ONLY" : "MARKET_AND_MODEL",
    dataGaps: gaps,
  });
}

const worldCupMatchByNo = new Map((staticData.matches || []).map((match) => [String(match.no), match]));
for (const pred of staticData.predictions || []) {
  const match = worldCupMatchByNo.get(String(pred.no));
  const outcome = scoreOutcome(match?.score);
  const modelProbabilities = probabilityMap([percentageMidpoint(pred.homeProb), percentageMidpoint(pred.drawProb), percentageMidpoint(pred.awayProb)]);
  const gaps = ["LEGACY_LOCK_TIMESTAMP_UNAVAILABLE", "NORMAL_WDL_MARKET_UNAVAILABLE"];
  if (!outcome) gaps.push("RESULT_NOT_SETTLED");
  if (!modelProbabilities) gaps.push("MODEL_PROBABILITIES_INCOMPLETE");
  records.push({
    recordId: `static-wc:${pred.no}`,
    sourceType: "STATIC_WORLD_CUP_LOCK",
    matchId: `world-cup-${pred.no}`,
    lockId: `static-wc-${pred.no}`,
    lockType: "FINAL_LOCK",
    modelRunId: "",
    modelRunLinked: false,
    league: "世界杯",
    lockedAt: "",
    kickoffAt: match?.date ? `${match.date}T00:00:00+08:00` : "",
    modelRevision: pred.type || pred.modelVersion || "LEGACY_WORLD_CUP",
    finalGrade: pred.finalGrade || pred.rating || "",
    finalAction: pred.finalAction || "",
    recommendationSide: pred.recommendationSide || "",
    modelProbabilities,
    marketProbabilities: null,
    probabilityComponents: null,
    actual: outcome?.actual || null,
    score: outcome?.score || "",
    resultSource: "STATIC_VERIFIED_SCORE",
    trainingEligibility: "AUDIT_ONLY",
    dataGaps: [...new Set(gaps)],
  });
}

for (const pred of staticData.sportteryPredictions || []) {
  const matchId = compactMatchId(pred.matchId || pred.sportteryKey);
  if (!matchId || latestManualByMatch.has(matchId)) continue;
  const result = resultById.get(matchId);
  const outcome = scoreOutcome(result?.score);
  const modelProbabilities = probabilityMap([percentageMidpoint(pred.homeProb), percentageMidpoint(pred.drawProb), percentageMidpoint(pred.awayProb)]);
  const gaps = ["LEGACY_LOCK_TIMESTAMP_UNAVAILABLE", "NORMAL_WDL_MARKET_UNAVAILABLE"];
  if (!outcome) gaps.push("RESULT_NOT_SETTLED");
  if (!modelProbabilities) gaps.push("MODEL_PROBABILITIES_INCOMPLETE");
  records.push({
    recordId: `static-sporttery:${matchId}`,
    sourceType: "STATIC_SPORTTTERY_LOCK",
    matchId,
    lockId: pred.lockId || `static-sporttery-${matchId}`,
    lockType: pred.lockType || "FINAL_LOCK",
    modelRunId: pred.modelRunId || "",
    modelRunLinked: false,
    league: normalizeLeague(pred.competition),
    lockedAt: pred.lockedAt || "",
    kickoffAt: pred.matchDate ? `${pred.matchDate}T${pred.kickoffTime || "00:00"}:00+08:00` : "",
    modelRevision: pred.modelRevision || pred.modelVersion || "LEGACY_SPORTTERRY",
    finalGrade: pred.finalGrade || pred.rating || "",
    finalAction: pred.finalAction || "",
    recommendationSide: pred.recommendationSide || "",
    modelProbabilities,
    marketProbabilities: null,
    probabilityComponents: null,
    actual: outcome?.actual || null,
    score: outcome?.score || "",
    resultSource: result?.resultSource || result?.source || "",
    trainingEligibility: "AUDIT_ONLY",
    dataGaps: [...new Set(gaps)],
  });
}

records.sort((left, right) => String(left.kickoffAt).localeCompare(String(right.kickoffAt)) || left.recordId.localeCompare(right.recordId));
const samples = records.filter((record) => record.trainingEligibility === "MARKET_AND_MODEL").map((record) => ({ ...record }));
const exclusions = records.flatMap((record) => record.dataGaps).reduce((counts, reason) => ({ ...counts, [reason]: (counts[reason] || 0) + 1 }), {});
const leagueCounts = Object.fromEntries([...new Set(samples.map((sample) => sample.league))].sort().map((league) => [league, samples.filter((sample) => sample.league === league).length]));
const sourceCounts = records.reduce((counts, record) => ({ ...counts, [record.sourceType]: (counts[record.sourceType] || 0) + 1 }), {});
const output = {
  contractVersion: "WDL_LOCKED_TRAINING_MANIFEST_V3",
  generatedAt: new Date().toISOString(),
  source: { locksFile, resultsFile, staticDataFile, runsFile, lockRows: parsedLocks.length, modelRunRows: runById.size, latestManualD1Matches: latestManualByMatch.size },
  auditedRecords: records.length,
  eligibleSamples: samples.length,
  sourceCounts,
  exclusions,
  leagueCounts,
  records,
  samples,
};
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, auditedRecords: records.length, eligibleSamples: samples.length, sourceCounts, exclusions, leagueCounts }, null, 2));
