import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/lib/r15Backtest.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "r15Backtest.js" });
const engine = sandbox.window.WC_R15_BACKTEST;

const prediction = {
  modelRevision: "LESSONS_2026-07-17_MARKET_SCOPED_GATES_R15",
  lockId: "manual-sporttery-test-v4-pre-r15a",
  lockType: "PRE_LOCK",
  pick: "胜",
  handicapPick: "让胜",
  totalGoalsPick: "2球/3球",
  mainScore: "2-1",
  counterScore: "1-1",
  marketAvailability: { winDrawLose: true, handicap: false, totalGoals: true, scores: true },
  formalSelections: { winDrawLose: "胜", handicap: "让胜", totalGoals: "2球/3球", scores: ["2-1", "1-1"] },
  unifiedRunEvidence: {
    overallGrade: "B",
    componentRecommendations: {
      winDrawLose: { grade: "B" },
      handicap: { grade: "A" },
      totalGoals: { grade: "B" },
      scores: { grade: "B" },
    },
  },
};

assert.equal(engine.isR15Prediction(prediction), true);
assert.equal(engine.isR16Prediction(prediction), false);
assert.equal(engine.isR16Prediction(null), false, "未锁版赛事没有预测对象时不应抛错");
assert.equal(engine.revisionLabel(prediction), "R15a");
assert.equal(engine.inferenceDate({ lockedAt: "2026-07-17T15:59:59Z" }, "2026-07-19"), "2026-07-17");
assert.equal(engine.inferenceDate({ lockedAt: "2026-07-17T16:00:01Z" }, "2026-07-19"), "2026-07-18");

const hit = engine.evaluatePrediction(prediction, {
  score: "2-1",
  direction: "胜",
  handicap: "让平",
  total: 3,
});
assert.equal(hit.markets.winDrawLose.hit, true);
assert.equal(hit.markets.totalGoals.hit, true);
assert.equal(hit.markets.scores.hit, true);
assert.equal(hit.markets.handicap.qualified, false, "未开售玩法不得进入正式统计");
assert.equal(hit.markets.handicap.hit, null);

const pending = engine.evaluatePrediction(prediction, {});
const candidateOnly = engine.evaluatePrediction({
  ...prediction,
  formalSelections: { winDrawLose: null, handicap: null, totalGoals: null, scores: [] },
}, { score: "2-1", direction: "胜", handicap: "让平", total: 3 });
const summary = engine.summarize([hit, pending, candidateOnly]);
assert.equal(summary.verifiedMatches, 1);
assert.equal(summary.pendingMatches, 1);
assert.equal(summary.observationOnly, 1);
assert.deepEqual(JSON.parse(JSON.stringify(summary.metrics.winDrawLose)), {
  hits: 1,
  total: 1,
  grades: {
    A: { hits: 0, total: 0 },
    B: { hits: 1, total: 1 },
    C: { hits: 0, total: 0 },
    D: { hits: 0, total: 0 },
  },
});
assert.equal(summary.metrics.handicap.total, 0);

const legacy = engine.evaluatePrediction({
  modelRevision: "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10",
  formalSelections: prediction.formalSelections,
}, { score: "2-1", direction: "胜", handicap: "让平", total: 3 });
assert.equal(legacy.hasFormal, false, "非R15记录不得进入专项统计");

const r16Prediction = {
  ...prediction,
  matchId: "r16-fixture-001",
  modelRevision: "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16",
  lockId: "manual-sporttery-test-v4-pre-r16",
  marketAvailability: { winDrawLose: true, handicap: true, totalGoals: true, scores: true },
  candidateSelections: { winDrawLose: "胜", handicap: "让平", totalGoals: "2球/3球", scores: ["2-1", "1-1"] },
  formalSelections: { winDrawLose: "胜", handicap: "让平", totalGoals: "2球/3球", scores: [] },
  modelHomeProb: 0.6,
  modelDrawProb: 0.25,
  modelAwayProb: 0.15,
};
assert.equal(engine.isR16Prediction(r16Prediction), true);
assert.equal(engine.revisionLabel(r16Prediction), "R16");
const r17Prediction = { ...r16Prediction, modelRevision: "LESSONS_2026-07-22_WDL_CALIBRATION_R17" };
assert.equal(engine.isR16Prediction(r17Prediction), true, "R17延续R16正式玩法与叶子分轨统计口径");
assert.equal(engine.revisionLabel(r17Prediction), "R16");
const r16Evaluation = engine.evaluatePrediction(r16Prediction, {
  score: "2-1",
  direction: "胜",
  handicap: "让平",
  total: 3,
}, { revision: "R16" });
assert.equal(r16Evaluation.sampleKey, "r16-fixture-001");
assert.equal(r16Evaluation.hasFormal, true);
assert.equal(r16Evaluation.markets.winDrawLose.hit, true);
assert.equal(r16Evaluation.markets.handicap.hit, true);
assert.equal(r16Evaluation.markets.totalGoals.hit, true);
assert.equal(r16Evaluation.markets.scores.qualified, false, "R16前30场比分保持候选观察，不进入正式分母");
assert.equal(r16Evaluation.markets.scores.candidateQualified, true);
assert.equal(r16Evaluation.markets.scores.candidateHit, true);
assert.ok(r16Evaluation.probabilityAudit.brierScore > 0);
assert.ok(r16Evaluation.probabilityAudit.logLoss > 0);
const r16Summary = engine.summarize([r16Evaluation]);
assert.equal(r16Summary.metrics.scores.total, 0);
assert.deepEqual(JSON.parse(JSON.stringify(r16Summary.candidateMetrics.scores)), { hits: 1, total: 1 });
assert.equal(r16Summary.probabilityMetrics.total, 1);
assert.equal(r16Summary.probabilityMetrics.averageBrierScore, r16Evaluation.probabilityAudit.brierScore);
assert.deepEqual(JSON.parse(JSON.stringify(engine.forwardProgress([r16Evaluation]))), {
  cohort: "R16_FORWARD_30",
  settled: 1,
  target: 30,
  remaining: 29,
  complete: false,
  status: "COLLECTING",
});
assert.equal(engine.forwardProgress([r16Evaluation, r16Evaluation]).settled, 1);
assert.equal(engine.nonScorePredictionAvailable({
  ...r16Prediction,
  mainScore: "",
  counterScore: "",
  candidateSelections: { winDrawLose: "胜", handicap: "让平", totalGoals: "2球/3球", scores: [] },
  formalSelections: { winDrawLose: "胜", handicap: "让平", totalGoals: "2球/3球", scores: [] },
}), true, "R16比分为空时三个非比分玩法仍构成可展示推演");

const currentLocks = JSON.parse(fs.readFileSync(new URL("../web/data/manual-locks-20260717-v4-r15a.json", import.meta.url), "utf8"));
const currentEvaluations = currentLocks.map((lock) => engine.evaluatePrediction({
  ...lock.sportteryPrediction,
  lockId: lock.lockId,
  finalGrade: lock.finalGrade,
}, {}));
const currentSummary = engine.summarize(currentEvaluations);
assert.equal(currentSummary.totalRows, 8);
assert.equal(currentSummary.verifiedMatches, 0);
assert.equal(currentSummary.pendingMatches, 4);
assert.equal(currentSummary.observationOnly, 4);
assert.equal(currentEvaluations[2].markets.winDrawLose.available, false);
assert.equal(currentEvaluations[2].markets.winDrawLose.qualified, false);

console.log("R15 backtest scope tests passed: only available formal selections enter verified denominators.");
