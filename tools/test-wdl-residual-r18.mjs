import assert from "node:assert/strict";
import artifact from "./data/wdl-residual-r18.json" with { type: "json" };
import { predictWdlResidualChallenger, trainWdlResidualChallenger } from "./lib/wdl-residual-challenger.mjs";

assert.equal(artifact.status, "CHALLENGER");
assert.equal(artifact.automaticPromotion, false);
assert.equal(artifact.promotionDecision, "FORWARD_VALIDATION_REQUIRED");
assert.equal(artifact.championRevision, "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16");
assert.ok(artifact.sampleCount >= 50);

const agreement = predictWdlResidualChallenger({
  league: "测试联赛",
  marketProbabilities: { HOME: 0.5, DRAW: 0.3, AWAY: 0.2 },
  modelProbabilities: { HOME: 0.45, DRAW: 0.35, AWAY: 0.2 },
}, artifact);
assert.equal(agreement.selection, "HOME");
assert.equal(agreement.override, false);

const synthetic = Array.from({ length: 20 }, (_, index) => ({
  league: "测试联赛",
  marketProbabilities: { HOME: 0.42, DRAW: 0.38, AWAY: 0.2 },
  modelProbabilities: { HOME: 0.35, DRAW: 0.45, AWAY: 0.2 },
  actual: index < 16 ? "DRAW" : "HOME",
}));
const learned = trainWdlResidualChallenger(synthetic, { minimumPatternSupport: 8, minimumModelEdge: 0.08 });
const override = predictWdlResidualChallenger(synthetic[0], learned);
assert.equal(override.selection, "DRAW");
assert.equal(override.override, true);
assert.equal(override.reason, "HISTORICAL_RESIDUAL_SUPPORTS_MODEL_OVERRIDE");

console.log("R18 residual selector, non-promotion contract, and evidence-gated override verified.");
