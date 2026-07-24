import assert from "node:assert/strict";
import fs from "node:fs";
import { RESEARCH_KEYS, runUnifiedPrediction } from "./lib/unified-prediction-engine.mjs";

const capturedAt = new Date().toISOString();
const research = Object.fromEntries(RESEARCH_KEYS.map((key) => [key, {
  status: "VERIFIED",
  evidenceGrade: "A",
  summary: `R11 baseline test ${key}`,
  capturedAt,
  observedAt: capturedAt,
  sources: [{ title: "R11 test source", url: "https://example.com/r11" }],
  impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 },
}]));
const samples = Array.from({ length: 12 }, (_, index) => ({
  league: "韩职",
  kickoffTime: `2026-07-${String(1 + index).padStart(2, "0")} 18:00`,
  homeTeam: index % 2 ? "主队" : "对手",
  awayTeam: index % 2 ? "对手" : "客队",
  actualHomeGoals: index % 3,
  actualAwayGoals: (index + 1) % 2,
}));
const result = runUnifiedPrediction({
  match: { matchId: "r11-test", league: "韩职", home: "主队", away: "客队", matchDate: "2026-07-24", handicap: "-0.5" },
  market: {
    normal: { win: "2.10", draw: "3.30", lose: "3.20" },
    handicapOdds: { win: "2.00", draw: "3.40", lose: "3.40" },
    scoreOdds: Array.from({ length: 8 }, (_, index) => ({ score: `${index % 3}-${Math.floor(index / 3)}`, odds: String(5 + index) })),
    totalGoalsOdds: Array.from({ length: 8 }, (_, index) => ({ goals: index === 7 ? "7+" : String(index), odds: String(2 + index) })),
  },
  oddsHistory: { had: [{ h: 2.1, d: 3.3, a: 3.2 }, { h: 2.05, d: 3.35, a: 3.25 }] },
  samples,
  research,
}, { lockType: "PRE_LOCK" });

assert.equal(result.modelLessons.version, "LESSONS_2026-07-16_FULL_JOINT_GRID_R11");
assert.equal(result.lifecycleContract.champion, "UNIFIED_PREDICTION_R11");
assert.equal(result.backtestContract.cohort, "R11_BASELINE");
assert.equal(result.backtestContract.handicapPolicy, "DIRECTION_CONDITIONED_FULL_GRID_MARGIN_LEADER");
assert.equal(result.featureSet.scenarioDirectionCalibration.weight, 0);
assert.equal(result.featureSet.scenarioDirectionCalibration.applied, false);
assert.equal(result.featureSet.jointDecision.role, "FORMAL_DIRECTION_SCORE_COMPATIBLE_PAIR");
assert.equal(result.finalDecision.formalAdmissionPolicy, "R11_BASELINE_FORMAL_ADMISSION");
assert.equal(result.featureSet.forwardValidation.status, "BASELINE_ACTIVE");

const runner = fs.readFileSync("tools/run-unified-prediction.mjs", "utf8");
const publisher = fs.readFileSync("tools/publish-unified-locks.mjs", "utf8");
const appCore = fs.readFileSync("web/app/app-core.js", "utf8");
assert.match(runner, /enableR18Shadow/);
assert.match(runner, /String\(args\.get\("r18-shadow"\) \|\| "false"\)/);
assert.match(publisher, /UNIFIED_LOCK_REVISION \|\| "r11"/);
assert.match(publisher, /ACTIVE_MODEL_REVISION = "LESSONS_2026-07-16_FULL_JOINT_GRID_R11"/);
assert.match(appCore, /wc_cloud_bootstrap_scoped_r11_v4/);

console.log("R11 active baseline verified: probability direction, direction-conditioned handicap, publication defaults, and UI cache namespace are aligned.");
