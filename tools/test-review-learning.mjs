import assert from "node:assert/strict";
import { evaluateLock, rowToCase } from "../web/functions/api/lib/utils.js";
import { PREFERRED_LOCK_ORDER_SQL, REVIEW_LEARNING_STATUSES, caseDiagnosticPayload, enrichPredictionFromUnifiedRun, modelGovernanceAuthorization, normalizeReviewLearningStatus, reviewLearningTransitionAudit, settledCaseRole, upgradeNoteFromCase, validationCohortMetrics } from "../web/functions/api/[[path]].js";

assert.equal(PREFERRED_LOCK_ORDER_SQL, "locked_at DESC, lock_id DESC");
assert.ok(!PREFERRED_LOCK_ORDER_SQL.includes("lock_type"));
assert.equal(settledCaseRole("FINAL_LOCK", true), "CHAMPION_FORMAL");
assert.equal(settledCaseRole("FINAL_LOCK", false), "SHADOW_OBSERVATION");
assert.equal(settledCaseRole("PRE_LOCK", true), "SHADOW_OBSERVATION");

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
assert.equal(failedShadowNote.status, "PROPOSED");
assert.equal(failedShadowNote.recommendation.shouldUpgradeModel, true);
assert.equal(failedShadowNote.recommendation.challengerPromotion.status, "PROPOSED");
assert.equal(failedShadowNote.recommendation.challengerPromotion.modules.length, 1);
assert.equal(failedShadowNote.recommendation.challengerPromotion.primaryModule, failedShadowNote.recommendation.challengerPromotion.modules[0]);
assert.ok(failedShadowNote.recommendation.challengerPromotion.observedModules.includes("HANDICAP"));
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
assert.equal(r15Note.status, "PROPOSED");
assert.ok(r15Note.title.includes("候选让球影子失败"));
assert.ok(!r15Note.title.includes("正式让球单选失败"));
assert.equal(r15Note.recommendation.challengerPromotion.accountingScope, "CANDIDATE_SHADOW");
assert.deepEqual(r15Note.recommendation.challengerPromotion.primaryMetrics, ["candidateHandicapSingleHit"]);
assert.ok(r15Note.recommendation.nextActions.some((action) => action.includes("R15已关闭该让球正式玩法")));
const exposedR15Case = rowToCase({
  case_id: "case-r15",
  case_role: "SHADOW_OBSERVATION",
  source_lock_type: "PRE_LOCK",
  preferred_at_settlement: 1,
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
assert.equal(exposedR15Case.caseRole, "SHADOW_OBSERVATION");
assert.equal(exposedR15Case.sourceLockType, "PRE_LOCK");
assert.equal(exposedR15Case.preferredAtSettlement, true);

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
assert.equal(passedShadowNote.status, "OBSERVATION");
assert.equal(passedShadowNote.recommendation.shouldUpgradeModel, false);

const incompleteNote = upgradeNoteFromCase(lock, result, review, "case-partial", {
  failureMode: "组件数据不完整",
  handicapHit: null,
  totalGoalsHit: true,
  scoreCovered: null,
  modelAudit: { status: "PARTIAL", winDrawLoseSingleHit: true, handicapSingleHit: null, totalGoalsDoubleHit: true, scoreDoubleHit: null },
});
assert.equal(incompleteNote.triggerType, "DATA_QUALITY_OBSERVATION");
assert.equal(incompleteNote.status, "OBSERVATION");
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

assert.deepEqual(REVIEW_LEARNING_STATUSES, ["OBSERVATION", "PROPOSED", "CHALLENGER", "VALIDATING", "ELIGIBLE", "PROMOTED", "REJECTED", "RETIRED"]);
assert.equal(normalizeReviewLearningStatus("SHADOW_PENDING"), "PROPOSED");
assert.equal(normalizeReviewLearningStatus("OPEN"), "OBSERVATION");
const singleModulePayload = {
  recommendation: {
    challengerPromotion: { primaryModule: "HANDICAP", modules: ["HANDICAP"] },
  },
};
assert.equal(reviewLearningTransitionAudit("PROPOSED", "CHALLENGER", singleModulePayload).valid, true);
assert.equal(reviewLearningTransitionAudit("PROPOSED", "CHALLENGER", {
  recommendation: { challengerPromotion: { primaryModule: "HANDICAP", modules: ["HANDICAP", "WIN_DRAW_LOSE"] } },
}).valid, false, "一个Challenger不得同时改多个模块");
assert.equal(reviewLearningTransitionAudit("CHALLENGER", "VALIDATING", singleModulePayload).valid, true);
const incompleteValidation = reviewLearningTransitionAudit("VALIDATING", "ELIGIBLE", {
  ...singleModulePayload,
  validation: { settledSamples: 29, guardrailsPassed: true },
});
assert.equal(incompleteValidation.valid, false);
assert.ok(incompleteValidation.reasons.includes("SETTLED_SAMPLES_BELOW_30"));
const validValidation = {
  serverDerived: true,
  settledSamples: 30,
  guardrailsPassed: true,
  candidateHitRate: 0.58,
  championHitRate: 0.53,
  brierScore: 0.59,
  baselineBrierScore: 0.62,
  logLoss: 0.95,
  baselineLogLoss: 1.01,
  formalCoverageRate: 0.72,
  baselineCoverageRate: 0.7,
  abcdMonotonic: true,
};
const clientClaimedValidation = reviewLearningTransitionAudit("VALIDATING", "ELIGIBLE", {
  ...singleModulePayload,
  validation: { ...validValidation, serverDerived: false },
});
assert.equal(clientClaimedValidation.valid, false, "客户端声称命中率不得用于治理晋级");
assert.ok(clientClaimedValidation.reasons.includes("SERVER_DERIVED_VALIDATION_REQUIRED"));
assert.equal(reviewLearningTransitionAudit("VALIDATING", "ELIGIBLE", { ...singleModulePayload, validation: validValidation }).valid, true);
const automaticPromotion = reviewLearningTransitionAudit("ELIGIBLE", "PROMOTED", { ...singleModulePayload, validation: validValidation });
assert.equal(automaticPromotion.valid, false, "达到30场和守门指标也不得自动晋级");
assert.ok(automaticPromotion.reasons.includes("MANUAL_REVIEW_APPROVAL_REQUIRED"));
assert.equal(reviewLearningTransitionAudit("ELIGIBLE", "PROMOTED", {
  ...singleModulePayload,
  validation: validValidation,
  reviewApproved: true,
  approvedBy: "manual-reviewer",
  approvedAt: "2026-08-22T12:00:00+08:00",
}).valid, true);
assert.equal(reviewLearningTransitionAudit("PROPOSED", "PROMOTED", {
  ...singleModulePayload,
  validation: validValidation,
  reviewApproved: true,
  approvedBy: "manual-reviewer",
  approvedAt: "2026-08-22T12:00:00+08:00",
}).valid, false, "不得跳过VALIDATING和ELIGIBLE直接晋级");

const scoreLeafUnavailable = enrichPredictionFromUnifiedRun({
  mainScore: "2-1",
  counterScore: "1-1",
  candidateSelections: { scores: ["2-1", "1-1"] },
  formalSelections: { scores: ["2-1", "1-1"] },
}, {
  contractVersion: "UNIFIED_PREDICTION_V4",
  modelLessons: { version: "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16" },
  finalDecision: {
    winDrawLose: "胜",
    handicapPick: "让平",
    totalGoalsPick: "2球/3球",
    scores: [],
    formalMarkets: ["winDrawLose", "handicap", "totalGoals"],
  },
  featureSet: {
    probabilities: { HOME: 0.55, DRAW: 0.27, AWAY: 0.18 },
    marketAvailability: { markets: { winDrawLose: true, handicap: true, totalGoals: true, scores: true } },
    handicap: { probabilities: { "让胜": 0.3, "让平": 0.4, "让负": 0.3 } },
  },
  scenarioSet: [],
});
assert.equal(scoreLeafUnavailable.mainScore, "");
assert.equal(scoreLeafUnavailable.counterScore, "");
assert.deepEqual(scoreLeafUnavailable.predictedScores, []);
assert.deepEqual(scoreLeafUnavailable.candidateSelections.scores, []);
assert.deepEqual(scoreLeafUnavailable.formalSelections.scores, []);
assert.equal(scoreLeafUnavailable.formalSelections.winDrawLose, "胜");
assert.equal(scoreLeafUnavailable.formalSelections.handicap, "让平");
assert.equal(scoreLeafUnavailable.formalSelections.totalGoals, "2球/3球");
assert.equal(scoreLeafUnavailable.pick, "胜");
assert.equal(scoreLeafUnavailable.handicapPick, "让平");
assert.equal(scoreLeafUnavailable.totalGoalsPick, "2球/3球");

const observationOnlySelections = enrichPredictionFromUnifiedRun({
  pick: "胜",
  handicapPick: "让负",
  totalGoalsPick: "3球/2球",
  mainScore: "1-1",
  counterScore: "2-1",
}, {
  contractVersion: "UNIFIED_PREDICTION_V4",
  modelLessons: { version: "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16" },
  finalDecision: {
    winDrawLose: "胜",
    handicapPick: "让负",
    totalGoalsPick: "3球/2球",
    scores: ["1-1", "2-1"],
    formalMarkets: [],
  },
  featureSet: {
    probabilities: { HOME: 0.54, DRAW: 0.24, AWAY: 0.22 },
    marketAvailability: { markets: { winDrawLose: true, handicap: true, totalGoals: true, scores: true } },
    handicap: { probabilities: { "让胜": 0.32, "让平": 0.22, "让负": 0.46 } },
  },
  scenarioSet: [{ score: "1-1", probability: 0.11 }, { score: "2-1", probability: 0.09 }],
});
assert.equal(observationOnlySelections.pick, "");
assert.equal(observationOnlySelections.handicapPick, "");
assert.equal(observationOnlySelections.totalGoalsPick, "");
assert.equal(observationOnlySelections.mainScore, "");
assert.equal(observationOnlySelections.counterScore, "");
assert.deepEqual(observationOnlySelections.formalSelections, {
  winDrawLose: null,
  handicap: null,
  totalGoals: null,
  scores: [],
});
assert.deepEqual(observationOnlySelections.candidateSelections.scores, ["1-1", "2-1"]);
assert.equal(observationOnlySelections.finalDecisionAction, "无正式玩法，候选仅保留观察");

const requestWithHeaders = (token = "", user = "") => ({
  headers: new Headers({ "x-admin-token": token, "x-admin-user": user }),
});
assert.equal(modelGovernanceAuthorization(requestWithHeaders("secret", "reviewer"), { MODEL_GOVERNANCE_ADMIN_TOKEN: "secret" }).authorized, true);
assert.equal(modelGovernanceAuthorization(requestWithHeaders("wrong", "reviewer"), { MODEL_GOVERNANCE_ADMIN_TOKEN: "secret" }).authorized, false);
assert.equal(modelGovernanceAuthorization(requestWithHeaders("secret", ""), { MODEL_GOVERNANCE_ADMIN_TOKEN: "secret" }).authorized, false);

const gradePlan = [
  ...Array.from({ length: 8 }, () => ["A", true]),
  ...Array.from({ length: 6 }, () => ["B", true]),
  ...Array.from({ length: 2 }, () => ["B", false]),
  ...Array.from({ length: 3 }, () => ["C", true]),
  ...Array.from({ length: 4 }, () => ["C", false]),
  ...Array.from({ length: 7 }, () => ["D", false]),
];
const cohortRows = gradePlan.map(([grade, challengerHit], index) => {
  const output = (challenger) => JSON.stringify({
    match: { handicap: "-1" },
    featureSet: { probabilities: challenger ? { HOME: 0.7, DRAW: 0.2, AWAY: 0.1 } : { HOME: 0.2, DRAW: 0.3, AWAY: 0.5 } },
    finalDecision: {
      winDrawLose: challenger && challengerHit ? "胜" : "负",
      handicapPick: "让胜",
      totalGoalsPick: "2球/3球",
      scores: ["2-0", "2-1"],
      formalMarkets: ["winDrawLose", "handicap", "totalGoals"],
      componentRecommendations: { winDrawLose: { grade: challenger ? grade : "C" } },
    },
  });
  return {
    match_id: `cohort-${index}`,
    champion_output_json: output(false),
    challenger_output_json: output(true),
    full_time_home_goals: 2,
    full_time_away_goals: 0,
    result_1x2: "HOME",
    total_goals: 2,
  };
});
const derivedCohort = validationCohortMetrics(cohortRows, { primary_module: "WIN_DRAW_LOSE", target_market: "winDrawLose" });
assert.equal(derivedCohort.serverDerived, true);
assert.equal(derivedCohort.settledSamples, 30);
assert.equal(derivedCohort.targetMarket, "winDrawLose");
assert.ok(derivedCohort.candidateHitRate > derivedCohort.championHitRate);
assert.ok(derivedCohort.brierScore < derivedCohort.baselineBrierScore);
assert.ok(derivedCohort.logLoss < derivedCohort.baselineLogLoss);
assert.equal(derivedCohort.abcdMonotonic, true);
assert.equal(derivedCohort.guardrailsPassed, true);

const exactScoreRows = Array.from({ length: 30 }, (_, index) => {
  const grade = index < 15 ? "A" : "B";
  const output = (challenger) => JSON.stringify({
    featureSet: {
      probabilities: { HOME: 0.6, DRAW: 0.25, AWAY: 0.15 },
      score: { probabilities: challenger ? { "2-0": 0.6, "1-0": 0.4 } : { "2-0": 0.3, "1-0": 0.7 } },
    },
    finalDecision: {
      scores: challenger ? ["2-0", "1-0"] : ["1-0", "0-0"],
      formalMarkets: ["scores"],
      componentRecommendations: { scores: { grade } },
    },
  });
  return {
    match_id: `score-cohort-${index}`,
    champion_output_json: output(false),
    challenger_output_json: output(true),
    full_time_home_goals: 2,
    full_time_away_goals: 0,
    result_1x2: "HOME",
    total_goals: 2,
  };
});
const exactScoreCohort = validationCohortMetrics(exactScoreRows, { primary_module: "EXACT_SCORE", target_market: "scores" });
assert.equal(exactScoreCohort.targetMarket, "scores");
assert.equal(exactScoreCohort.candidateHitRate, 1);
assert.equal(exactScoreCohort.championHitRate, 0);
assert.ok(exactScoreCohort.brierScore < exactScoreCohort.baselineBrierScore, "比分晋级必须读取比分分布，不得复用胜平负概率");
assert.ok(exactScoreCohort.logLoss < exactScoreCohort.baselineLogLoss);
assert.equal(exactScoreCohort.guardrailsPassed, true);

console.log("Review learning tests passed.");
