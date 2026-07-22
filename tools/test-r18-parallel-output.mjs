import assert from "node:assert/strict";
import artifact from "./data/wdl-residual-r18.json" with { type: "json" };
import { buildR18Challenger } from "./lib/r18-parallel-output.mjs";

const champion = {
  contractVersion: "UNIFIED_PREDICTION_V4",
  generatedAt: "2026-07-22T00:00:00.000Z",
  lockType: "FINAL_LOCK",
  modelVersion: "V1-UNIFIED",
  match: { league: "挪超" },
  featureSet: {
    market: { probabilities: [0.5, 0.3, 0.2] },
    probabilities: { HOME: 0.3, DRAW: 0.45, AWAY: 0.25 },
  },
  finalDecision: { winDrawLose: "平", recommendationSide: "DRAW", formalMarkets: ["winDrawLose", "handicap"] },
  lifecycleContract: { champion: "UNIFIED_PREDICTION_R16" },
  modelLessons: { version: artifact.championRevision, rules: [] },
  backtestContract: { version: "R16_FORWARD_30_V1" },
};

const challenger = buildR18Challenger(champion, artifact);
assert.equal(champion.finalDecision.formalMarkets.length, 2);
assert.equal(challenger.shadowOnly, true);
assert.equal(challenger.publicationEligible, false);
assert.deepEqual(challenger.finalDecision.formalMarkets, []);
assert.deepEqual(challenger.finalDecision.shadowEvaluationMarkets, champion.finalDecision.formalMarkets);
assert.equal(challenger.validationEligible, true);
assert.equal(challenger.finalDecision.decisionStatus, "R18_SHADOW_ONLY");
assert.equal(challenger.lifecycleContract.champion, "UNIFIED_PREDICTION_R16");
assert.equal(challenger.lifecycleContract.runRole, "CHALLENGER");
assert.equal(challenger.modelLessons.version, artifact.modelRevision);
assert.deepEqual(challenger.featureSet.championProbabilities, champion.featureSet.probabilities);

console.log("R16/R18 output isolation and R18 shadow-only contract verified.");
