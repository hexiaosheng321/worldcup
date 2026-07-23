import assert from "node:assert/strict";
import {
  aggregateWdl,
  buildLockedHistoryAudit,
  rollingSourceBlendBacktest,
} from "./lib/wdl-history-audit.mjs";

const actuals = ["HOME", "AWAY", "DRAW"];
const samples = Array.from({ length: 60 }, (_, index) => {
  const actual = actuals[index % actuals.length];
  const market = actual === "HOME"
    ? { HOME: 0.6, DRAW: 0.25, AWAY: 0.15 }
    : actual === "AWAY"
      ? { HOME: 0.15, DRAW: 0.25, AWAY: 0.6 }
      : { HOME: 0.3, DRAW: 0.4, AWAY: 0.3 };
  const joint = actual === "HOME"
    ? { HOME: 0.15, DRAW: 0.25, AWAY: 0.6 }
    : actual === "AWAY"
      ? { HOME: 0.6, DRAW: 0.25, AWAY: 0.15 }
      : { HOME: 0.55, DRAW: 0.25, AWAY: 0.2 };
  return {
    matchId: String(index),
    lockedAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
    actual,
    modelProbabilities: joint,
    marketProbabilities: market,
    modelRevision: "SYNTHETIC",
    league: "测试联赛",
    lockType: "FINAL_LOCK",
    finalGrade: "B",
    probabilityComponents: {
      jointScoreModel: joint,
      marketCalibration: market,
      blendedBaseline: joint,
      postEvidenceModel: joint,
    },
  };
});

const marketMetrics = aggregateWdl(samples, "marketProbabilities");
const modelMetrics = aggregateWdl(samples, "modelProbabilities");
assert.equal(marketMetrics.hitRate, 1);
assert.equal(modelMetrics.hitRate, 0);

const rolling = rollingSourceBlendBacktest(samples, { minimumTrain: 30, testBlock: 10 });
assert.equal(rolling.outOfSampleSamples, 30);
assert.ok(rolling.fittedWeights.every((row) => row.jointWeight === 0));
assert.equal(rolling.learnedBlend.hitRate, 1);
assert.equal(rolling.fixedCurrentBlend.hitRate, 0);

const report = buildLockedHistoryAudit({
  records: samples,
  samples,
  exclusions: {},
}, { minimumTrain: 30, testBlock: 10 });
assert.equal(report.failureSignals.storedModelDirectionBelowMarket, true);
assert.equal(report.failureSignals.jointScoreSourceBelowMarket, true);
assert.equal(report.failureSignals.fixed8515BlendBelowMarketOutOfSample, true);

console.log("Locked WDL history audit, source decomposition, and rolling blend backtest verified.");
