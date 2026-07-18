import assert from "node:assert/strict";
import { evaluateLock, rowToCase } from "../web/functions/api/lib/utils.js";
import { PREFERRED_LOCK_ORDER_SQL, caseDiagnosticPayload, upgradeNoteFromCase } from "../web/functions/api/[[path]].js";

assert.equal(PREFERRED_LOCK_ORDER_SQL, "locked_at DESC, lock_id DESC");
assert.ok(!PREFERRED_LOCK_ORDER_SQL.includes("lock_type"));

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
      scoreSelectionPolicy: "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY",
      officialScoreCoverageProbability: 0.22,
      modelRevision: "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10",
      unifiedRunEvidence: {
        modelRevision: "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10",
        modelLessons: { version: "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10" },
        seasonLearning: { league: "欧冠", season: "2026", mode: "CHALLENGER_SHADOW" },
        scoreSelection: { selectionPolicy: "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY", officialCoverageProbability: 0.22 },
        jointDecision: { independentHandicapLeader: "让负", independentHandicapRisk: { pick: "让负" } },
        conditionalHandicapChallenger: { pick: "让平" },
        backtestContract: { metrics: ["formalHandicapSingleHit", "independentHandicapLeaderSingleHit", "conditionalHandicapChallengerSingleHit", "formalWinDrawLoseHandicapJointHit"] },
        crossLeagueNormalization: { complete: true, policy: "LEAGUE_STRENGTH_X_OPPONENT_QUALITY_X_MATCH_TYPE_X_RECENCY" },
        evidenceDirectionConflict: { materialConflict: true, resolved: false },
        evidenceDrivenRiskChallenger: { mode: "CHALLENGER_SHADOW_35", challengerWeight: 0.35 },
        competitionStage: { consistent: true, matchCanonical: "QUALIFYING" },
        twoLegLeadControl: { applied: true, factor: 0.88 },
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
assert.equal(failedShadowPayload.modelAudit.formalHandicapSingleHit, false);
assert.equal(failedShadowPayload.modelAudit.independentHandicapLeaderSingleHit, true);
assert.equal(failedShadowPayload.modelAudit.conditionalHandicapChallengerSingleHit, false);
assert.equal(failedShadowPayload.modelAudit.formalWinDrawLoseHandicapJointHit, false);
assert.equal(failedShadowPayload.modelAudit.totalGoalsDoubleHit, true);
assert.equal(failedShadowPayload.modelAudit.scoreDoubleHit, true);
assert.equal(failedShadowPayload.modelRevision, "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10");
assert.equal(failedShadowPayload.scoreSelectionPolicy, "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY");
assert.equal(failedShadowPayload.officialScoreCoverageProbability, 0.22);
assert.equal(failedShadowPayload.independentHandicapLeader, "让负");
assert.equal(failedShadowPayload.independentHandicapLeaderSingleHit, true);
assert.equal(failedShadowPayload.conditionalHandicapChallenger, "让平");
assert.equal(failedShadowPayload.conditionalHandicapChallengerSingleHit, false);
assert.equal(failedShadowPayload.formalWinDrawLoseHandicapJointHit, false);
assert.equal(failedShadowPayload.handicapTrackAudit.actual, "让负");
assert.ok(failedShadowPayload.backtestContract.metrics.includes("formalWinDrawLoseHandicapJointHit"));
assert.equal(failedShadowPayload.seasonLearning.mode, "CHALLENGER_SHADOW");
assert.equal(failedShadowPayload.crossLeagueNormalization.complete, true);
assert.equal(failedShadowPayload.evidenceDirectionConflict.materialConflict, true);
assert.equal(failedShadowPayload.evidenceDrivenRiskChallenger.challengerWeight, 0.35);
assert.equal(failedShadowPayload.competitionStageAudit.matchCanonical, "QUALIFYING");
assert.equal(failedShadowPayload.twoLegLeadControl.factor, 0.88);
const riskOnlyPayload = caseDiagnosticPayload({
  ...lock,
  payload_json: JSON.stringify({
    sportteryPrediction: {
      handicapPick: "让胜",
      totalGoalsPick: "2球/3球",
      predictedScores: ["0-1", "0-2"],
      independentRiskScenario: { score: "1-2", probability: 0.08 },
      reasoningSummary: "正式比分0-1/0-2，独立风险1-2。",
    },
  }),
}, result, review, { failureTags: [], successTags: [] });
assert.deepEqual(riskOnlyPayload.predictedScores, ["0-1", "0-2"]);
assert.equal(riskOnlyPayload.scoreCovered, false);
assert.equal(riskOnlyPayload.independentRiskScenario.score, "1-2");
const failedShadowNote = upgradeNoteFromCase(lock, result, review, "case-test", failedShadowPayload);
assert.equal(failedShadowNote.triggerType, "MODEL_FAILURE");
assert.equal(failedShadowNote.status, "SHADOW_PENDING");
assert.equal(failedShadowNote.recommendation.shouldUpgradeModel, true);
assert.equal(failedShadowNote.recommendation.challengerPromotion.status, "SHADOW_PENDING");
assert.ok(failedShadowNote.recommendation.challengerPromotion.modules.includes("HANDICAP"));
assert.equal(failedShadowNote.recommendation.challengerPromotion.minimumSettledSamples, 30);
assert.equal(failedShadowNote.recommendation.challengerPromotion.targetSettledSamples, 50);
assert.ok(failedShadowNote.recommendation.challengerPromotion.guardrailMetrics.includes("formalWinDrawLoseHandicapJointHit"));
assert.ok(!failedShadowNote.title.includes("命中样本沉淀"));

const r15Lock = {
  ...lock,
  lock_id: "test-r15-pre-lock",
  lock_type: "PRE_LOCK",
  match_id: "test-r15-match",
  league: "瑞超",
  final_grade: "C",
  final_action: "观察",
  recommendation_side: "HOME",
  recommendation: "胜",
  payload_json: JSON.stringify({
    sportteryPrediction: {
      modelRevision: "LESSONS_2026-07-17_MARKET_SCOPED_GATES_R15",
      candidateSelections: {
        winDrawLose: "胜",
        handicap: "让胜",
        totalGoals: "2球/3球",
        scores: ["1-1", "2-1"],
      },
      formalSelections: {
        winDrawLose: null,
        handicap: null,
        totalGoals: "2球/3球",
        scores: [],
      },
      unifiedRunEvidence: {
        modelRevision: "LESSONS_2026-07-17_MARKET_SCOPED_GATES_R15",
        outputConsistency: { complete: true, score: 92.2 },
        criticalPackageGap: { marketBlocking: true, blockedMarkets: ["handicap"] },
        jointDecision: { independentHandicapLeader: "让负", independentHandicapRisk: { pick: "让负" } },
        conditionalHandicapChallenger: { pick: "让平" },
      },
    },
  }),
};
const r15Result = {
  result_1x2: "HOME",
  full_time_home_goals: 2,
  full_time_away_goals: 1,
  total_goals: 3,
  payload_json: "{}",
};
const r15Review = { ...evaluateLock(r15Lock, r15Result), hitStatus: "VOID", betOutcome: "VOID" };
const r15Payload = caseDiagnosticPayload(r15Lock, r15Result, r15Review, { failureTags: [], successTags: [] });
assert.equal(r15Payload.learningEligibility, "SHADOW_AUDIT");
assert.equal(r15Payload.modelAudit.componentAuditScope, "CANDIDATE_SHADOW");
assert.deepEqual(r15Payload.modelAudit.failedComponents, ["handicapSingleHit"]);
assert.equal(r15Payload.modelAudit.candidateWinDrawLoseSingleHit, true);
assert.equal(r15Payload.modelAudit.candidateHandicapSingleHit, false);
assert.equal(r15Payload.modelAudit.candidateTotalGoalsDoubleHit, true);
assert.equal(r15Payload.modelAudit.candidateScoreDoubleHit, true);
assert.equal(r15Payload.modelAudit.formalWinDrawLoseSingleHit, null);
assert.equal(r15Payload.modelAudit.formalHandicapSingleHit, null);
assert.equal(r15Payload.modelAudit.formalTotalGoalsDoubleHit, true);
assert.equal(r15Payload.modelAudit.formalScoreDoubleHit, null);
assert.equal(r15Payload.formalWinDrawLoseHandicapJointHit, null);
assert.equal(r15Payload.handicapTrackAudit.formal.pick, "");
assert.equal(r15Payload.handicapTrackAudit.formal.hit, null);
assert.equal(r15Payload.handicapTrackAudit.candidate.pick, "让胜");
assert.equal(r15Payload.handicapTrackAudit.conditionalChallenger.hit, true);
assert.equal(r15Payload.selectionAudit.accountingPolicy, "FINAL_LOCK_FORMAL_SELECTIONS_PRE_LOCK_CANDIDATE_SHADOW");
assert.equal(r15Payload.outputConsistency.score, 92.2);
assert.deepEqual(r15Payload.criticalPackageGap.blockedMarkets, ["handicap"]);
const r15Note = upgradeNoteFromCase(r15Lock, r15Result, r15Review, "case-r15", r15Payload);
assert.equal(r15Note.status, "SHADOW_PENDING");
assert.ok(r15Note.title.includes("候选让球影子失败"));
assert.ok(!r15Note.title.includes("正式让球单选失败"));
assert.equal(r15Note.recommendation.challengerPromotion.accountingScope, "CANDIDATE_SHADOW");
assert.deepEqual(r15Note.recommendation.challengerPromotion.primaryMetrics, ["candidateHandicapSingleHit"]);
assert.ok(r15Note.recommendation.nextActions.some((action) => action.includes("R15已关闭该让球正式玩法")));
const exposedR15Case = rowToCase({
  case_id: "case-r15",
  source_lock_id: r15Lock.lock_id,
  match_id: r15Lock.match_id,
  hit_status: "VOID",
  payload_json: JSON.stringify(r15Payload),
  failure_tags_json: "[]",
  success_tags_json: "[]",
});
assert.equal(exposedR15Case.candidateHandicapSingleHit, false);
assert.equal(exposedR15Case.formalHandicapSingleHit, null, "正式让球为空时不得回退到候选结果");
assert.equal(exposedR15Case.selectionAudit.scope, "CANDIDATE_SHADOW");

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

const exposedCase = rowToCase({
  case_id: "case-test",
  source_lock_id: "test-lock",
  match_id: "test-match",
  hit_status: "VOID",
  payload_json: JSON.stringify(failedShadowPayload),
  failure_tags_json: "[]",
  success_tags_json: "[]",
});
assert.equal(exposedCase.betOutcome, "VOID");
assert.equal(exposedCase.learningEligibility, "SHADOW_AUDIT");
assert.equal(exposedCase.modelAudit.status, "FAIL");
assert.equal(exposedCase.modelRevision, "LESSONS_2026-07-16_AGGREGATE_HANDICAP_LEARNING_R10");
assert.equal(exposedCase.formalHandicapSingleHit, false);
assert.equal(exposedCase.independentHandicapLeaderSingleHit, true);
assert.equal(exposedCase.conditionalHandicapChallengerSingleHit, false);
assert.equal(exposedCase.formalWinDrawLoseHandicapJointHit, false);
assert.equal(exposedCase.handicapTrackAudit.independent.pick, "让负");
assert.equal(exposedCase.failureMode, failedShadowPayload.failureMode);
assert.equal(exposedCase.seasonLearning.mode, "CHALLENGER_SHADOW");
assert.equal(exposedCase.crossLeagueNormalization.complete, true);
assert.equal(exposedCase.evidenceDirectionConflict.materialConflict, true);
assert.equal(exposedCase.evidenceDrivenRiskChallenger.challengerWeight, 0.35);
assert.equal(exposedCase.competitionStageAudit.matchCanonical, "QUALIFYING");
assert.equal(exposedCase.twoLegLeadControl.factor, 0.88);

console.log("Review learning tests passed.");
