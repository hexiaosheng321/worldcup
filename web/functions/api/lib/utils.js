// 共享工具函数 — 从 [[path]].js 提取
// 被所有 API 路由模块 import

export const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

export function javascript(source, status = 200) {
  return new Response(source, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function readJson(request) {
  if (request.method === "GET") return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }
  return env.DB;
}

export function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function n(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const BJT_OFFSET_MS = 8 * 60 * 60 * 1000;
export const AUTO_DECISION_CUTOFF = "19:50";
export const SALE_CLOSE_TIME = "22:00";

export function bjtParts(date = new Date()) {
  const shifted = new Date(date.getTime() + BJT_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

export function bjtAt(dateText = "", timeText = "00:00") {
  if (!dateText) return NaN;
  return Date.parse(`${dateText}T${String(timeText || "00:00").slice(0, 5)}:00+08:00`);
}

export function addMinutes(timestamp, minutes) {
  return Number.isFinite(timestamp) ? timestamp + minutes * 60 * 1000 : NaN;
}

export function isoFromMs(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

export async function sha256Hex(text = "") {
  const data = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}


export function sideFromResult(home, away) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

export function evaluateLock(lock, result) {
  if (!lock || !result) return { hitStatus: "VOID", betOutcome: "VOID", reviewText: "缺少锁版或赛果。", probabilityMetrics: null, modelAudit: null };
  let directionHit = lock.recommendation_side === result.result_1x2;
  if (lock.recommendation_side === "DOUBLE") {
    const text = String(lock.recommendation || "");
    const coversHome = /主|胜|HOME/.test(text);
    const coversDraw = /平|DRAW/.test(text);
    const coversAway = /客|负|AWAY/.test(text);
    if (
      (result.result_1x2 === "HOME" && coversHome) ||
      (result.result_1x2 === "DRAW" && coversDraw) ||
      (result.result_1x2 === "AWAY" && coversAway)
    ) {
      directionHit = true;
    }
  }
  const officialDirectionPick = ["HOME", "DRAW", "AWAY", "DOUBLE"].includes(lock.recommendation_side);
  const isSkipped = lock.final_action === "跳过";
  const betOutcome = !isSkipped && officialDirectionPick ? (directionHit ? "WIN" : "LOSE") : "VOID";
  const probabilities = [Number(lock.model_home_prob), Number(lock.model_draw_prob), Number(lock.model_away_prob)];
  const outcomeIndex = result.result_1x2 === "HOME" ? 0 : result.result_1x2 === "DRAW" ? 1 : result.result_1x2 === "AWAY" ? 2 : -1;
  const probabilityMetrics = outcomeIndex >= 0 && probabilities.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    ? {
        brierScore: Number(probabilities.reduce((sum, value, index) => sum + (value - (index === outcomeIndex ? 1 : 0)) ** 2, 0).toFixed(6)),
        logLoss: Number((-Math.log(Math.max(1e-9, probabilities[outcomeIndex]))).toFixed(6)),
        calibrationBin: `${Math.floor(Math.max(...probabilities) * 10) * 10}-${Math.min(100, Math.floor(Math.max(...probabilities) * 10) * 10 + 9)}%`,
      }
    : null;
  return {
    hitStatus: betOutcome,
    betOutcome,
    reviewText: betOutcome === "WIN"
      ? "赛前推荐命中。"
      : betOutcome === "LOSE"
        ? "赛前推荐未命中。"
        : isSkipped
          ? "跳过场次不计正式投注胜负；模型方向继续验票。"
          : "该推荐不计正式投注胜负；模型方向继续验票。",
    probabilityMetrics,
    modelAudit: { directionHit: officialDirectionPick ? directionHit : null },
  };
}

export function caseTags(lock, result, review) {
  const failureTags = [];
  const successTags = [];
  if (review.hitStatus === "LOSE" && lock.final_grade === "A") failureTags.push("A级推荐失败");
  if (review.hitStatus === "LOSE" && Number(lock.risk_score) >= 65) failureTags.push("高风险推荐失败");
  if (review.hitStatus === "LOSE" && result.result_1x2 === "DRAW" && lock.recommendation_side !== "DRAW") failureTags.push("平局漏防");
  if (review.hitStatus === "LOSE" && lock.data_quality === "LOW") failureTags.push("数据质量低导致失败");
  if (review.hitStatus === "VOID" && review.modelAudit?.directionHit === false) failureTags.push("跳过场方向影子验票失败");
  if (review.hitStatus === "WIN" && Number(lock.consistency_score) >= 4) successTags.push("欧亚一致命中");
  if (review.hitStatus === "WIN" && Number(lock.risk_score) <= 30) successTags.push("低风险命中");
  if (review.hitStatus === "WIN" && lock.final_grade === "A") successTags.push("A级推荐命中");
  return { failureTags, successTags };
}

export function rowToCase(row) {
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
  return {
    caseId: row.case_id,
    sourceLockId: row.source_lock_id,
    matchId: row.match_id,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffTime: row.kickoff_time,
    modelVersion: row.model_version,
    modelHomeProb: row.model_home_prob,
    modelDrawProb: row.model_draw_prob,
    modelAwayProb: row.model_away_prob,
    recommendation: row.recommendation,
    recommendationSide: row.recommendation_side,
    finalGrade: row.final_grade,
    finalAction: row.final_action,
    confidenceScore: row.confidence_score,
    riskScore: row.risk_score,
    consistencyScore: row.consistency_score,
    sportteryHomeSp: row.sporttery_home_sp,
    sportteryDrawSp: row.sporttery_draw_sp,
    sportteryAwaySp: row.sporttery_away_sp,
    sportteryHomeProb: row.sporttery_home_prob,
    sportteryDrawProb: row.sporttery_draw_prob,
    sportteryAwayProb: row.sporttery_away_prob,
    valueHomeGap: row.value_home_gap,
    valueDrawGap: row.value_draw_gap,
    valueAwayGap: row.value_away_gap,
    asianHandicap: row.asian_handicap,
    asianHomeWater: row.asian_home_water,
    asianAwayWater: row.asian_away_water,
    euroHomeOdds: row.euro_home_odds,
    euroDrawOdds: row.euro_draw_odds,
    euroAwayOdds: row.euro_away_odds,
    euroHomeProb: row.euro_home_prob,
    euroDrawProb: row.euro_draw_prob,
    euroAwayProb: row.euro_away_prob,
    dataQuality: row.data_quality,
    actualResult: row.actual_result,
    actualHomeGoals: payload.actualHomeGoals,
    actualAwayGoals: payload.actualAwayGoals,
    actualGoals: row.actual_goals,
    actualScore: payload.actualScore,
    match: payload.match,
    leagueType: payload.leagueType || row.league,
    lockedOdds: payload.lockedOdds,
    oddsMovement: Array.isArray(payload.oddsMovement) ? payload.oddsMovement : [],
    handicap: payload.handicap ?? row.asian_handicap,
    judgementBasis: payload.judgementBasis || "",
    predictedHandicapResult: payload.predictedHandicapResult || "",
    handicapHit: payload.handicapHit ?? null,
    predictedTotalGoals: payload.predictedTotalGoals || "",
    totalGoalsHit: payload.totalGoalsHit ?? null,
    predictedScores: Array.isArray(payload.predictedScores) ? payload.predictedScores : [],
    scoreCovered: payload.scoreCovered ?? null,
    scoreSelectionPolicy: payload.scoreSelectionPolicy || "",
    officialScoreCoverageProbability: payload.officialScoreCoverageProbability ?? null,
    independentRiskScenario: payload.independentRiskScenario || null,
    matchType: payload.matchType || "",
    hitStatus: row.hit_status,
    betOutcome: payload.betOutcome || row.hit_status,
    learningEligibility: payload.learningEligibility || (row.hit_status === "VOID" ? "SHADOW_AUDIT" : "OFFICIAL_RECOMMENDATION"),
    probabilityMetrics: payload.probabilityMetrics || null,
    modelAudit: payload.modelAudit || null,
    failureMode: payload.failureMode || "",
    season: payload.season || "unknown",
    seasonLearning: payload.seasonLearning || null,
    diagnosisSummary: payload.diagnosisSummary || "",
    failureTags: parseArray(row.failure_tags_json),
    successTags: parseArray(row.success_tags_json),
    createdAt: row.created_at,
  };
}

export function parseArray(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function parseObject(text, fallback = {}) {
  if (text && typeof text === "object" && !Array.isArray(text)) return text;
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function isWorldCupLeague(league = "") {
  return /世界杯|World Cup/i.test(String(league || ""));
}

export function hasFinalApproval(body = {}) {
  return body.finalApproval === true || body.final_approval === true || body.payload?.finalApproval === true;
}

export function firstLockText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function isBlankValue(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

export function isDefaultNumber(value) {
  return value === undefined || value === null || Number(value) === 0;
}

export function pickSideText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(HOME|主|胜)$/i.test(text)) return "胜";
  if (/^(DRAW|平)$/i.test(text)) return "平";
  if (/^(AWAY|客|负)$/i.test(text)) return "负";
  return text;
}

export function lockPayloadShape(source = {}) {
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  const prediction = source.sportteryPrediction || source.prediction || payload.sportteryPrediction || payload.prediction || source;
  const analysis = prediction.analysis || source.analysis || payload.analysis || prediction.payload || payload.payload || {};
  const finalPick = prediction.finalPick || analysis.finalPick || source.finalPick || payload.finalPick || {};
  return { payload, prediction, analysis, finalPick };
}

export function lockSummaryFromShape(shape) {
  const { prediction, analysis, finalPick } = shape;
  const scores = Array.isArray(finalPick.scores) ? finalPick.scores.join(" / ") : firstLockText(finalPick.scores);
  const pick = firstLockText(
    prediction.pick,
    prediction.recommendation,
    prediction.recommendationSide,
    finalPick.winDrawLose
  );
  const handicap = firstLockText(prediction.handicapPick, prediction.handicapRecommendation, finalPick.handicap);
  const totalGoals = firstLockText(prediction.totalGoalsPick, finalPick.totalGoals);
  const scorePick = firstLockText(prediction.scorePick, scores);
  return {
    recommendation: firstLockText(prediction.recommendation, pickSideText(pick)),
    recommendationSide: firstLockText(prediction.recommendationSide, finalPick.winDrawLose, pick),
    finalGrade: firstLockText(prediction.finalGrade, prediction.confidence, finalPick.confidence),
    finalAction: firstLockText(prediction.finalAction, prediction.advice, finalPick.advice),
    dataQuality: firstLockText(prediction.dataQuality, analysis.dataQuality),
    reasoningSummary: firstLockText(
      prediction.reasoningSummary,
      analysis.keyJudgement,
      analysis.hardGate,
      [pickSideText(pick), handicap, totalGoals, scorePick].filter(Boolean).join(" / ")
    ),
    modelHomeProb: firstNumber(prediction.modelHomeProb, prediction.homeProb, analysis.modelHomeProb),
    modelDrawProb: firstNumber(prediction.modelDrawProb, prediction.drawProb, analysis.modelDrawProb),
    modelAwayProb: firstNumber(prediction.modelAwayProb, prediction.awayProb, analysis.modelAwayProb),
    confidenceScore: firstNumber(prediction.confidenceScore, prediction.confidence_score),
    riskScore: firstNumber(prediction.riskScore, prediction.risk_score),
    consistencyScore: firstNumber(prediction.consistencyScore, prediction.consistency_score),
  };
}

export function enrichLockRow(row = {}) {
  const parsed = parseObject(row.payload_json, {});
  const summary = lockSummaryFromShape(lockPayloadShape(parsed));
  return {
    ...row,
    model_home_prob: isDefaultNumber(row.model_home_prob) && summary.modelHomeProb !== null ? summary.modelHomeProb : row.model_home_prob,
    model_draw_prob: isDefaultNumber(row.model_draw_prob) && summary.modelDrawProb !== null ? summary.modelDrawProb : row.model_draw_prob,
    model_away_prob: isDefaultNumber(row.model_away_prob) && summary.modelAwayProb !== null ? summary.modelAwayProb : row.model_away_prob,
    recommendation: isBlankValue(row.recommendation) ? summary.recommendation : row.recommendation,
    recommendation_side: isBlankValue(row.recommendation_side) || row.recommendation_side === "SKIP" ? summary.recommendationSide : row.recommendation_side,
    final_grade: isBlankValue(row.final_grade) || row.final_grade === "D" ? summary.finalGrade || row.final_grade : row.final_grade,
    final_action: isBlankValue(row.final_action) ? summary.finalAction : row.final_action,
    confidence_score: isDefaultNumber(row.confidence_score) && summary.confidenceScore !== null ? summary.confidenceScore : row.confidence_score,
    risk_score: isDefaultNumber(row.risk_score) && summary.riskScore !== null ? summary.riskScore : row.risk_score,
    consistency_score: row.consistency_score === undefined || row.consistency_score === null ? summary.consistencyScore : row.consistency_score,
    data_quality: isBlankValue(row.data_quality) ? summary.dataQuality : row.data_quality,
    reasoning_summary: isBlankValue(row.reasoning_summary) ? summary.reasoningSummary : row.reasoning_summary,
  };
}
