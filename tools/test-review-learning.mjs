import assert from "node:assert/strict";
import { evaluateLock } from "../web/functions/api/lib/utils.js";
import { caseDiagnosticPayload, upgradeNoteFromCase } from "../web/functions/api/[[path]].js";

const lock = {
  lock_id: "test-lock",
  match_id: "test-match",
  model_version: "V1-UNIFIED",
  league: "欧冠",
  home_team: "主队",
  away_team: "客队",
  final_grade: "B",
  final_action: "跳过",
  recommendation_side: "HOME",
  recommendation: "胜",
  model_home_prob: 0.52,
  model_draw_prob: 0.28,
  model_away_prob: 0.2,
  asian_handicap: -1,
  kickoff_time: "2026-07-15T20:00:00+08:00",
  payload_json: JSON.stringify({
    sportteryPrediction: {
      handicapPick: "让胜",
      totalGoalsPick: "2球/3球",
      predictedScores: ["1-2", "0-2"],
      unifiedRunEvidence: {
        seasonLearning: { league: "欧冠", season: "2026", mode: "CHALLENGER_SHADOW" },
      },
    },
  }),
};
const result = {
  result_1x2: "AWAY",
  full_time_home_goals: 1,
  full_time_away_goals: 2,
  total_goals: 3,
  payload_json: "{}",
};
const review = evaluateLock(lock, result);

assert.equal(review.betOutcome, "VOID");
assert.equal(review.hitStatus, "VOID");
assert.equal(review.modelAudit.directionHit, false);
assert.ok(review.probabilityMetrics.brierScore > 0);
assert.ok(review.probabilityMetrics.logLoss > 0);

const failedShadowPayload = caseDiagnosticPayload(lock, result, review, { failureTags: [], successTags: [] });
assert.equal(failedShadowPayload.learningEligibility, "SHADOW_AUDIT");
assert.equal(failedShadowPayload.modelAudit.status, "FAIL");
assert.equal(failedShadowPayload.modelAudit.winDrawLoseSingleHit, false);
assert.equal(failedShadowPayload.modelAudit.handicapSingleHit, false);
assert.equal(failedShadowPayload.modelAudit.totalGoalsDoubleHit, true);
assert.equal(failedShadowPayload.modelAudit.scoreDoubleHit, true);
assert.equal(failedShadowPayload.seasonLearning.mode, "CHALLENGER_SHADOW");
const failedShadowNote = upgradeNoteFromCase(lock, result, review, "case-test", failedShadowPayload);
assert.equal(failedShadowNote.triggerType, "MODEL_FAILURE");
assert.equal(failedShadowNote.status, "OPEN");
assert.equal(failedShadowNote.recommendation.shouldUpgradeModel, true);
assert.ok(!failedShadowNote.title.includes("命中样本沉淀"));

const passedShadowNote = upgradeNoteFromCase(lock, result, {
  ...review,
  modelAudit: { directionHit: true },
}, "case-pass", {
  failureMode: "四组件全部命中",
  handicapHit: true,
  totalGoalsHit: true,
  scoreCovered: true,
  modelAudit: {
    status: "PASS",
    winDrawLoseSingleHit: true,
    handicapSingleHit: true,
    totalGoalsDoubleHit: true,
    scoreDoubleHit: true,
  },
});
assert.equal(passedShadowNote.triggerType, "SHADOW_OBSERVATION");
assert.equal(passedShadowNote.status, "OBSERVED");
assert.equal(passedShadowNote.recommendation.shouldUpgradeModel, false);

const incompleteNote = upgradeNoteFromCase(lock, result, review, "case-partial", {
  failureMode: "组件数据不完整",
  handicapHit: null,
  totalGoalsHit: true,
  scoreCovered: null,
  modelAudit: { status: "PARTIAL", winDrawLoseSingleHit: true, handicapSingleHit: null, totalGoalsDoubleHit: true, scoreDoubleHit: null },
});
assert.equal(incompleteNote.triggerType, "DATA_QUALITY_OBSERVATION");
assert.equal(incompleteNote.status, "OPEN");
assert.ok(!incompleteNote.title.includes("命中样本沉淀"));

console.log("Review learning tests passed.");
