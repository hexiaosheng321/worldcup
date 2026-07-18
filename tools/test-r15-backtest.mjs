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
assert.equal(engine.revisionLabel(prediction), "R15a");

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

const partialHit = engine.evaluatePrediction(prediction, {
  score: "1-0",
  direction: "胜",
  handicap: "让平",
  total: 1,
});
const daily = engine.summarizeDaily([
  { date: "2026-07-18", matchName: "主队A vs 客队A", evaluation: hit },
  { date: "2026-07-18", matchName: "主队B vs 客队B", evaluation: partialHit },
  { date: "2026-07-18", matchName: "主队C vs 客队C", evaluation: pending },
  { date: "2026-07-18", matchName: "主队D vs 客队D", evaluation: candidateOnly },
]);
assert.equal(daily.length, 1);
assert.equal(daily[0].opened, 4);
assert.equal(daily[0].released, 3);
assert.equal(daily[0].verified, 2);
assert.equal(daily[0].hits, 1);
assert.equal(daily[0].partial, 1);
assert.equal(daily[0].pending, 1);
assert.equal(daily[0].rate, 0.5);
assert.equal(daily[0].matches[0].outcome.status, "HIT");
assert.equal(daily[0].matches[1].outcome.status, "PARTIAL");

const legacy = engine.evaluatePrediction({
  modelRevision: "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10",
  formalSelections: prediction.formalSelections,
}, { score: "2-1", direction: "胜", handicap: "让平", total: 3 });
assert.equal(legacy.hasFormal, false, "非R15记录不得进入专项统计");

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
