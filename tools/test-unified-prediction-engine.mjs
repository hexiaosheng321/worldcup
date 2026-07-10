import assert from "node:assert/strict";
import { RESEARCH_KEYS, runUnifiedPrediction } from "./lib/unified-prediction-engine.mjs";

const capturedAt = new Date().toISOString();
const research = Object.fromEntries(RESEARCH_KEYS.map((key) => [key, {
  status: "VERIFIED",
  evidenceGrade: "A",
  summary: `这是用于验证统一推演门禁的${key}完整赛前证据摘要。`,
  capturedAt,
  observedAt: capturedAt,
  sources: [{ title: "Test evidence", url: "https://example.com/evidence" }],
  impact: { home: 0.01, draw: 0, away: -0.01, xgHome: 0.05, xgAway: -0.05 },
}]));
const samples = Array.from({ length: 40 }, (_, index) => ({
  league: "韩职",
  kickoffTime: `2026-06-${String(20 + (index % 11)).padStart(2, "0")}`,
  homeTeam: index % 2 ? "主队" : "客队",
  awayTeam: index % 2 ? "对手甲" : "对手乙",
  actualHomeGoals: 1 + (index % 2),
  actualAwayGoals: index % 2,
}));
const context = {
  match: { matchId: "test", league: "韩职", home: "主队", away: "客队", matchDate: "2026-07-12", handicap: "0" },
  market: {
    normal: { win: "2.30", draw: "3.10", lose: "2.80" },
    handicapOdds: { win: "2.30", draw: "3.10", lose: "2.80" },
    scoreOdds: Array.from({ length: 8 }, (_, index) => ({ score: `${index % 4}:${index % 3}`, odds: String(6 + index) })),
    totalGoalsOdds: Array.from({ length: 8 }, (_, index) => ({ goals: String(index), odds: String(3 + index) })),
  },
  oddsHistory: { had: [{ h: 2.4, d: 3.1, a: 2.7 }, { h: 2.3, d: 3.1, a: 2.8 }] },
  samples,
  research,
};

const final = runUnifiedPrediction(context, { lockType: "FINAL_LOCK" });
assert.equal(final.contractVersion, "UNIFIED_PREDICTION_V2");
assert.equal(final.lockType, "FINAL_LOCK");
assert.deepEqual(final.gateResult.blockers, []);
assert.equal(final.tenStepResult.steps.length, 10);
assert.equal(final.tenStepResult.passed, true);
assert.equal(final.modelLessons.counterScriptDiverges, true);
assert.notEqual(final.scenarioSet[0].score.split("-")[0] > final.scenarioSet[0].score.split("-")[1], final.scenarioSet[1].score.split("-")[0] > final.scenarioSet[1].score.split("-")[1]);

const blocked = runUnifiedPrediction({ ...context, research: { ...research, injuries: { status: "MISSING" } } }, { lockType: "FINAL_LOCK" });
assert.equal(blocked.lockType, "PRE_LOCK");
assert.ok(blocked.gateResult.blockers.includes("preMatchResearch"));

console.log("Unified prediction engine gates verified.");
