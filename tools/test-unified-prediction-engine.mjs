import assert from "node:assert/strict";
import { RESEARCH_KEYS, criticalPackageGapAudit, evidenceDirectionConflictAudit, handicapDecisionAudit, oneGoalWinAudit, outputConsistencyAudit, overallComponentGradeAudit, packageAdviceForGrade, packageMarketSelection, runUnifiedPrediction, selectConditionalHandicapDecision, selectFormalHandicapDecision, selectOfficialScores } from "./lib/unified-prediction-engine.mjs";
import { buildTeamState, dedupeSamples } from "./league-v1-context.mjs";

const dedupedSettlementSamples = dedupeSamples([
  { league: "世界杯", kickoffTime: "2026-07-11 03:00", homeTeam: "西班牙", awayTeam: "比利时", actualHomeGoals: 2, actualAwayGoals: 1, score: "2-1", source: "completed-match-auto" },
  { league: "世界杯", kickoffTime: "2026-07-10 22:00", homeTeam: "西班牙", awayTeam: "比利时", actualHomeGoals: 2, actualAwayGoals: 1, score: "2-1", source: "d1-base-case" },
]);
assert.equal(dedupedSettlementSamples.length, 1);
assert.equal(dedupedSettlementSamples[0].source, "d1-base-case");

const distinctLeagueSamples = dedupeSamples([
  { league: "西甲", kickoffTime: "2026-07-10 22:00", homeTeam: "西班牙", awayTeam: "比利时", actualHomeGoals: 2, actualAwayGoals: 1, score: "2-1", source: "completed-match-auto" },
  { league: "世界杯", kickoffTime: "2026-07-11 03:00", homeTeam: "西班牙", awayTeam: "比利时", actualHomeGoals: 2, actualAwayGoals: 1, score: "2-1", source: "d1-base-case" },
]);
assert.equal(distinctLeagueSamples.length, 2);

const dedupedFinnishAliases = dedupeSamples([
  { league: "芬超", kickoffTime: "2026-06-28", homeTeam: "TPS", awayTeam: "Jaro", actualHomeGoals: 3, actualAwayGoals: 2, score: "3-2", source: "completed-match-auto" },
  { league: "芬超", kickoffTime: "2026-06-27", homeTeam: "Turku PS", awayTeam: "FF Jaro", actualHomeGoals: 3, actualAwayGoals: 2, score: "3-2", source: "d1-base-case" },
]);
assert.equal(dedupedFinnishAliases.length, 1);
assert.equal(dedupedFinnishAliases[0].source, "d1-base-case");

const currentSeasonState = buildTeamState([
  { league: "芬超", kickoffTime: "2025-07-01", homeTeam: "Inter Turku", awayTeam: "Old Opponent", actualHomeGoals: 4, actualAwayGoals: 0 },
  { league: "芬超", kickoffTime: "2026-05-01", homeTeam: "Inter Turku", awayTeam: "Current Opponent", actualHomeGoals: 1, actualAwayGoals: 0 },
], { league: "芬超", home: "国际图", away: "Current Opponent", matchDate: "2026-07-19" });
assert.equal(currentSeasonState.homeState.played, 1);
assert.equal(currentSeasonState.homeState.points, 3);

const finnishAliasSamples = [
  { league: "芬超", kickoffTime: "2026-07-10", homeTeam: "FF Jaro", awayTeam: "Opponent A", actualHomeGoals: 2, actualAwayGoals: 1 },
  { league: "芬超", kickoffTime: "2026-07-05", homeTeam: "Opponent B", awayTeam: "Jaro", actualHomeGoals: 0, actualAwayGoals: 1 },
  { league: "芬超", kickoffTime: "2026-06-29", homeTeam: "Jaro", awayTeam: "Opponent C", actualHomeGoals: 1, actualAwayGoals: 1 },
  { league: "芬超", kickoffTime: "2026-06-22", homeTeam: "Opponent D", awayTeam: "FF Jaro", actualHomeGoals: 2, actualAwayGoals: 0 },
  { league: "芬超", kickoffTime: "2026-06-15", homeTeam: "Jaro", awayTeam: "Opponent E", actualHomeGoals: 3, actualAwayGoals: 1 },
  { league: "芬超", kickoffTime: "2026-07-11", homeTeam: "Inter Turku", awayTeam: "Opponent F", actualHomeGoals: 2, actualAwayGoals: 0 },
  { league: "芬超", kickoffTime: "2026-07-06", homeTeam: "Opponent G", awayTeam: "FC Inter Turku", actualHomeGoals: 1, actualAwayGoals: 2 },
  { league: "芬超", kickoffTime: "2026-06-30", homeTeam: "FC Inter", awayTeam: "Opponent H", actualHomeGoals: 1, actualAwayGoals: 0 },
  { league: "芬超", kickoffTime: "2026-06-23", homeTeam: "Opponent I", awayTeam: "Inter Turku", actualHomeGoals: 2, actualAwayGoals: 2 },
  { league: "芬超", kickoffTime: "2026-06-16", homeTeam: "Inter Turku", awayTeam: "Opponent J", actualHomeGoals: 3, actualAwayGoals: 0 },
];

const sameDirectionCoverage = selectOfficialScores([
  { score: "2-0", probability: 0.16 },
  { score: "3-0", probability: 0.13 },
  { score: "1-1", probability: 0.11 },
]);
assert.deepEqual(sameDirectionCoverage.map((row) => row.score), ["2-0", "3-0"]);

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
    scoreOdds: ["0:0", "1:0", "0:1", "1:1", "2:0", "0:2", "2:1", "1:2"].map((score, index) => ({ score, odds: String(6 + index) })),
    totalGoalsOdds: Array.from({ length: 8 }, (_, index) => ({ goals: index === 7 ? "7+" : String(index), odds: String(index <= 1 ? 1.5 + index * 0.1 : 30 + index) })),
  },
  oddsHistory: { had: [{ h: 2.4, d: 3.1, a: 2.7 }, { h: 2.3, d: 3.1, a: 2.8 }] },
  samples,
  research,
};

const final = runUnifiedPrediction(context, { lockType: "FINAL_LOCK" });
const historicalEvidenceAt = "2026-07-21T05:30:00.000Z";
const historicalResearch = Object.fromEntries(RESEARCH_KEYS.map((key) => [key, {
  ...research[key],
  capturedAt: historicalEvidenceAt,
  observedAt: historicalEvidenceAt,
}]));
const historicalReplay = runUnifiedPrediction({
  ...context,
  asOf: "2026-07-21T06:00:00.000Z",
  match: { ...context.match, matchDate: "2026-07-21" },
  research: historicalResearch,
}, { lockType: "FINAL_LOCK" });
assert.equal(historicalReplay.gateResult.gates.preMatchResearch, true, "历史回放必须以冻结快照asOf计算证据新鲜度，不得使用当前系统时间");
assert.equal(final.contractVersion, "UNIFIED_PREDICTION_V4");
assert.equal(final.lockType, "FINAL_LOCK");
assert.deepEqual(final.gateResult.blockers, []);
assert.equal(final.tenStepResult.steps.length, 10);
assert.equal(final.tenStepResult.passed, true);
assert.equal(final.modelLessons.scoreCoverageOptimized, true);
assert.ok(final.modelLessons.counterPathRisk > 0);
assert.equal(final.scenarioSet[1].role, "SECONDARY_COVERAGE_PATH");
assert.ok(final.scenarioSet[1].directionProbability > 0);
if (final.finalDecision.recommendationSide === "HOME") assert.equal(final.riskScenario.direction, "AWAY");
if (final.finalDecision.recommendationSide === "AWAY") assert.equal(final.riskScenario.direction, "HOME");
assert.equal(final.finalDecision.confidenceAdjustments.counterPathRisk, -final.modelLessons.counterPathRisk);
assert.equal(final.finalDecision.confidenceAdjustments.riskPathRisk, -final.modelLessons.riskPathRisk);
assert.equal(final.riskScenario.role, "INDEPENDENT_RISK_PATH");
assert.equal(final.riskScenario.occupiesOfficialScoreSlot, false);
assert.equal(final.finalDecision.riskScenario, final.riskScenario.score);
assert.ok(final.featureSet.leagueProfile.opennessFactor > 0);
assert.ok(Number.isFinite(final.featureSet.venueProfile.homeAttackVariance));
assert.equal(final.featureSet.handicap.components.length >= 2, true);
assert.equal(final.featureSet.score.components.length >= 2, true);
assert.equal(final.featureSet.totals.components.length >= 2, true);
assert.equal(final.featureSet.jointDecision.selected.direction, final.finalDecision.recommendationSide);
assert.equal(final.featureSet.jointDecision.selected.handicapPick, final.finalDecision.handicapPick);
assert.equal(final.featureSet.jointDecision.role, "INDEPENDENT_MARKET_MARGINALS_WITH_FULL_GRID_CROSS_AUDIT");
assert.equal(final.featureSet.jointDecision.independentHandicapLeader, final.finalDecision.handicapPick);
assert.equal(final.featureSet.baselineParts.find((part) => part.label === "sporttery-wdl-calibration").weight, 0.15);
assert.equal(final.featureSet.dataQuality.minimumRecentMatchesPerTeam, 5);
assert.equal(final.modelLessons.version, "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16");
assert.equal(final.gateResult.gates.crossLeagueStrengthNormalized, true);
assert.equal(final.gateResult.gates.evidenceDirectionConflictResolved, true);
assert.equal(final.gateResult.gates.competitionStageConsistent, true);
assert.equal(final.featureSet.evidenceDrivenRiskChallenger.promotedToChampion, false);
assert.equal(final.gateResult.gates.oppositeWinPathChecked, true);
assert.equal(final.gateResult.componentAudits.scores.secondScenarioInProbability, true);
assert.equal("secondScenarioInProbability" in final.gateResult.gates, false);
assert.equal(final.gateResult.gates.twoLegContextComplete, true);
assert.equal(final.featureSet.scenarioDirectionCalibration.weight, 0);
assert.equal(final.featureSet.scenarioDirectionCalibration.applied, false);
assert.equal(final.featureSet.scenarioDirectionCalibration.role, "OFFICIAL_SCORE_DIRECTION_AUDIT_ONLY");
assert.equal(final.featureSet.scenarioDirectionCalibration.policy, "FULL_JOINT_GRID_ONLY_NO_OFFICIAL_SCORE_REFEED");
assert.deepEqual(final.featureSet.probabilities, final.featureSet.scenarioDirectionCalibration.preScenario);
assert.notDeepEqual(final.featureSet.probabilities, final.featureSet.scenarioDirectionCalibration.scenarioOnly);
assert.equal(final.featureSet.seasonLearning.mode, "ELIGIBLE_FOR_REVIEW");
assert.equal(final.featureSet.seasonLearning.appliedToChampion, false);
assert.equal(final.featureSet.seasonLearning.appliedScope, "NONE");
assert.equal(final.featureSet.seasonLearning.season, "2026");
assert.ok(!final.featureSet.score.components.some((part) => part.label === "league-season-score-calibration"));
assert.equal(final.featureSet.score.selectionPolicy, "TOP_TWO_APPROVED_LEAGUE_SEASON_JOINT_PROBABILITY");
assert.deepEqual(final.finalDecision.scores, final.featureSet.score.topCandidates.slice(0, 2).map((row) => row.score));
assert.equal(final.modelLessons.seasonSpecific.season, "2026");
assert.ok(final.backtestContract.metrics.includes("winDrawLoseSingleHit"));
assert.ok(final.backtestContract.metrics.includes("formalHandicapSingleHit"));
assert.ok(final.backtestContract.metrics.includes("independentHandicapLeaderSingleHit"));
assert.ok(final.backtestContract.metrics.includes("conditionalHandicapChallengerSingleHit"));
assert.equal(final.backtestContract.directionPolicy, "FULL_JOINT_GRID_ONLY_NO_OFFICIAL_SCORE_REFEED");
assert.ok(final.backtestContract.metrics.includes("formalWinDrawLoseHandicapJointHit"));
assert.ok(final.backtestContract.metrics.includes("totalGoalsDoubleHit"));
assert.ok(final.backtestContract.metrics.includes("scoreDoubleHit"));
assert.equal(final.modelLessons.leagueSpecific.league, "韩职");
assert.equal(final.featureSet.leagueLearning.version, "KLEAGUE_2026-07-12_R1");
assert.equal(final.gateResult.gates.outputConsistencyComplete, true);
assert.equal(final.gateResult.gates.sharedPackageGapFree, true);
assert.equal(final.gateResult.gates.criticalPackageGapFree, true);
assert.equal(final.gateResult.gates.oneGoalWinProtected, true);
assert.equal(final.gateResult.gates.qualifyingVenueSamplesComplete, true);
assert.equal(final.gateResult.componentAudits.scores.coverageOptimized, true);
assert.equal(final.gateResult.componentAudits.scores.riskScenarioAvailable, true);
assert.equal(final.gateResult.componentAudits.scores.excludedFromGlobalGates, true);
assert.equal(Math.abs(final.finalDecision.confidenceAdjustments.leagueLearning), 0);
assert.equal(final.featureSet.leagueLearning.applicationMode, "CHALLENGER_SHADOW");
assert.equal(final.featureSet.leagueLearning.appliedToChampion, false);
assert.equal(Object.keys(final.finalDecision.confidenceComponents).length, 5);
assert.equal(Object.keys(final.finalDecision.confidenceAdjustments).length, 6);
assert.ok(final.finalDecision.confidenceComponents.handicap > 0);
assert.equal(final.lifecycleContract.champion, "UNIFIED_PREDICTION_R16");
assert.equal(Object.keys(final.featureSet.handicap.probabilities).length, 3);
assert.equal(Object.keys(final.featureSet.totals.probabilities).length >= 2, true);
assert.equal(new Set(final.finalDecision.scores).size, 2);
assert.equal(final.featureSet.totals.selectionPolicy, "FULL_JOINT_TOTAL_MARGINAL_TOP_TWO");
assert.equal(final.featureSet.totals.outputConsistency.complete, true);
assert.ok(final.featureSet.totals.outputConsistency.score >= 75);
assert.equal(final.featureSet.totals.outputConsistency.grade, "B");
assert.equal(final.featureSet.totals.outputConsistency.criticalConflict, false);
assert.equal(final.backtestContract.componentPolicy, "SHARED_FOUNDATION_WITH_MARKET_SCOPED_CRITICAL_GATES");
assert.equal(final.backtestContract.formalAdmissionPolicy, "R16_FORMAL_RISK_GUARD_20260723_V1");
assert.equal(final.backtestContract.cohort, "R16_FORWARD_30");
assert.equal(final.featureSet.forwardValidation.status, "COLLECTING");
assert.equal(final.featureSet.score.outputRole, "TERMINAL_EXACT_SCORE_OUTPUT_ONLY");
assert.equal(final.finalDecision.componentRecommendations.scores.grade, "C");
assert.equal(final.finalDecision.componentRecommendations.scores.formalEligible, false);
assert.equal(final.finalDecision.componentRecommendations.handicap.formalEligible, false);
assert.equal(final.finalDecision.componentRecommendations.totalGoals.formalEligible, false);
assert.equal(final.finalDecision.componentRecommendations.handicap.formalAdmissionStatus, "OBSERVATION_ONLY_UNTIL_COMPONENT_30_REVIEW");
assert.equal(final.finalDecision.componentRecommendations.totalGoals.formalAdmissionStatus, "OBSERVATION_ONLY_UNTIL_COMPONENT_30_REVIEW");
assert.equal(final.finalDecision.formalAdmissionPolicy, "R16_FORMAL_RISK_GUARD_20260723_V1");
assert.ok(!final.finalDecision.formalMarkets.includes("scores"));
assert.ok(!final.finalDecision.formalMarkets.includes("handicap"));
assert.ok(!final.finalDecision.formalMarkets.includes("totalGoals"));
assert.equal(final.finalDecision.confidenceAdjustments.outputConsistency, 0);
assert.equal(final.finalDecision.predictiveConfidence.separatedFromOutputConsistency, true);
assert.ok(final.backtestContract.metrics.includes("componentGradeHitRate"));
assert.ok(final.backtestContract.metrics.includes("formalMarketCoverageByComponent"));
assert.ok(final.backtestContract.metrics.includes("overallGradePackageHit"));
assert.ok(final.backtestContract.metrics.includes("outputConsistencyScore"));
assert.ok(final.backtestContract.metrics.includes("criticalPackageGapRate"));
assert.deepEqual(Object.keys(final.finalDecision.componentRecommendations), ["winDrawLose", "handicap", "totalGoals", "scores"]);
assert.ok(Object.values(final.finalDecision.componentRecommendations).every((item) => ["A", "B", "C", "D"].includes(item.grade)));
assert.ok(["A", "B", "C", "D"].includes(final.finalDecision.overallGrade));
assert.equal(final.finalDecision.overallGradeAudit.policy, "SHARED_FOUNDATION_THEN_WDL_HANDICAP_TOTALS_SCORE_LEAF_EXCLUDED");
assert.equal(final.finalDecision.overallGradeAudit.foundationEligible, true);
assert.ok(final.finalDecision.overallGradeAudit.eligibleCount >= final.finalDecision.overallGradeAudit.actionableCount);
assert.ok(({ A: ["主打", "可选", "谨慎", "跳过"], B: ["可选", "谨慎", "跳过"], C: ["谨慎", "跳过"], D: ["跳过"] })[final.finalDecision.overallGrade].includes(final.finalDecision.advice));
assert.equal(final.featureSet.componentFoundationEligible, true);
assert.equal(final.featureSet.criticalPackageGap.blocking, false);
assert.ok(Array.isArray(final.finalDecision.formalMarkets));

const unresolvedMarketConflict = evidenceDirectionConflictAudit({
  marketBaseline: { probabilities: [0.62, 0.23, 0.15] },
  tieAudit: { aggregateLeader: "LEVEL" },
  research: {},
  selectedDirection: "AWAY",
  auditedResearch: { items: [] },
});
assert.equal(unresolvedMarketConflict.marketDirection, "HOME");
assert.equal(unresolvedMarketConflict.marketConflict, true);
assert.equal(unresolvedMarketConflict.marketConflictResolvedForFormal, false);
assert.equal(unresolvedMarketConflict.formalWinDrawLoseAction, "OBSERVATION_ONLY");

const supportedMarketConflict = evidenceDirectionConflictAudit({
  marketBaseline: { probabilities: [0.62, 0.23, 0.15] },
  tieAudit: { aggregateLeader: "LEVEL" },
  research: {},
  selectedDirection: "AWAY",
  auditedResearch: {
    items: [
      { key: "teamState", complete: true, impact: { home: -0.03, away: 0.03 } },
      { key: "injuries", complete: true, impact: { home: -0.04, away: 0.04 } },
    ],
  },
});
assert.equal(supportedMarketConflict.marketConflictResolvedForFormal, true);
assert.equal(supportedMarketConflict.marketOverrideSupportCount, 2);
assert.equal(supportedMarketConflict.formalWinDrawLoseAction, "ALLOW");

const alternateOfficialScores = runUnifiedPrediction(context, {
  lockType: "FINAL_LOCK",
  officialScoreSelector: (rows) => rows.slice(2, 4),
});
assert.notDeepEqual(alternateOfficialScores.finalDecision.scores, final.finalDecision.scores);
assert.deepEqual(alternateOfficialScores.featureSet.probabilities, final.featureSet.probabilities, "更换两个比分不得改变胜平负概率");
assert.deepEqual(alternateOfficialScores.featureSet.handicap.probabilities, final.featureSet.handicap.probabilities, "更换两个比分不得改变让球概率");
assert.deepEqual(alternateOfficialScores.featureSet.totals.probabilities, final.featureSet.totals.probabilities, "更换两个比分不得改变总进球概率");
assert.equal(alternateOfficialScores.finalDecision.winDrawLose, final.finalDecision.winDrawLose);
assert.equal(alternateOfficialScores.finalDecision.handicapPick, final.finalDecision.handicapPick);
assert.equal(alternateOfficialScores.finalDecision.totalGoalsPick, final.finalDecision.totalGoalsPick);
assert.equal(alternateOfficialScores.finalDecision.confidence, final.finalDecision.confidence, "比分叶子不得改变整体预测置信度");
assert.equal(alternateOfficialScores.lockType, final.lockType, "比分叶子不得改变锁版状态");
assert.deepEqual(alternateOfficialScores.gateResult.gates, final.gateResult.gates, "比分叶子不得改变全局门禁");
assert.equal(alternateOfficialScores.finalDecision.overallGrade, final.finalDecision.overallGrade, "比分叶子不得改变整包评级");
assert.equal(alternateOfficialScores.finalDecision.advice, final.finalDecision.advice, "比分叶子不得改变整包建议");
assert.deepEqual(alternateOfficialScores.finalDecision.formalMarkets.filter((market) => market !== "scores"), final.finalDecision.formalMarkets.filter((market) => market !== "scores"), "比分叶子不得改变非比分正式玩法");
for (const market of ["winDrawLose", "handicap", "totalGoals"]) {
  assert.deepEqual(alternateOfficialScores.finalDecision.componentRecommendations[market], final.finalDecision.componentRecommendations[market], `比分叶子不得改变${market}组件结论`);
}
const missingOfficialScores = runUnifiedPrediction(context, {
  lockType: "FINAL_LOCK",
  officialScoreSelector: () => [],
});
assert.deepEqual(missingOfficialScores.finalDecision.scores, []);
assert.equal(missingOfficialScores.gateResult.componentAudits.scores.selectionValid, false);
assert.equal(missingOfficialScores.finalDecision.componentRecommendations.scores.formalEligible, false);
assert.equal(missingOfficialScores.lockType, final.lockType, "比分缺失也不得改变整场锁版");
assert.deepEqual(missingOfficialScores.gateResult.gates, final.gateResult.gates, "比分缺失也不得改变全局门禁");
assert.equal(missingOfficialScores.finalDecision.overallGrade, final.finalDecision.overallGrade);
assert.equal(missingOfficialScores.finalDecision.advice, final.finalDecision.advice);
assert.deepEqual(missingOfficialScores.finalDecision.formalMarkets.filter((market) => market !== "scores"), final.finalDecision.formalMarkets.filter((market) => market !== "scores"));

const reviewedR16 = runUnifiedPrediction({
  ...context,
  r16Validation: {
    status: "PROMOTED",
    primaryModule: "EXACT_SCORE",
    league: "韩职",
    season: "2026",
    settledSamples: 30,
    reviewApproved: true,
    approvedBy: "manual-reviewer",
    approvedAt: "2026-08-22T12:00:00+08:00",
    governanceNoteId: "note-exact-score",
    cohortId: "cohort-exact-score",
    serverDerived: true,
    startedAt: "2026-07-22",
    validation: {
      guardrailsPassed: true,
      candidateHitRate: 0.22,
      championHitRate: 0.18,
      brierScore: 0.61,
      baselineBrierScore: 0.63,
      logLoss: 0.98,
      baselineLogLoss: 1.02,
      formalCoverageRate: 0.7,
      baselineCoverageRate: 0.68,
      abcdMonotonic: true,
    },
  },
}, { lockType: "FINAL_LOCK" });
assert.equal(reviewedR16.featureSet.forwardValidation.status, "REVIEW_APPROVED");
assert.equal(reviewedR16.featureSet.forwardValidation.scoreFormalAdmissionEligible, true);
assert.equal(reviewedR16.finalDecision.componentRecommendations.scores.formalEligible, true);

const unapprovedR16 = runUnifiedPrediction({
  ...context,
  r16Validation: { settledSamples: 30, reviewApproved: true, startedAt: "2026-07-22" },
}, { lockType: "FINAL_LOCK" });
assert.equal(unapprovedR16.featureSet.forwardValidation.status, "READY_FOR_REVIEW");
assert.equal(unapprovedR16.featureSet.forwardValidation.scoreFormalAdmissionEligible, false, "30场和单一布尔值不得自动放行比分");

const approvedValidation = {
  guardrailsPassed: true,
  candidateHitRate: 0.58,
  championHitRate: 0.54,
  brierScore: 0.6,
  baselineBrierScore: 0.62,
  logLoss: 0.96,
  baselineLogLoss: 1.01,
  formalCoverageRate: 0.72,
  baselineCoverageRate: 0.7,
  abcdMonotonic: true,
};
const governedCalibration = runUnifiedPrediction({
  ...context,
  learningGovernance: {
    leagueCalibration: {
      status: "PROMOTED",
      primaryModule: "LEAGUE_CALIBRATION",
      league: "韩职",
      settledSamples: 30,
      reviewApproved: true,
      approvedBy: "manual-reviewer",
      approvedAt: "2026-08-22T12:00:00+08:00",
      governanceNoteId: "note-league",
      cohortId: "cohort-league",
      serverDerived: true,
      validation: approvedValidation,
    },
    seasonScoreCalibration: {
      status: "PROMOTED",
      primaryModule: "SEASON_SCORE_CALIBRATION",
      league: "韩职",
      season: "2026",
      settledSamples: 30,
      reviewApproved: true,
      approvedBy: "manual-reviewer",
      approvedAt: "2026-08-22T12:00:00+08:00",
      governanceNoteId: "note-season",
      cohortId: "cohort-season",
      serverDerived: true,
      validation: approvedValidation,
    },
  },
}, { lockType: "FINAL_LOCK" });
assert.equal(governedCalibration.featureSet.leagueLearning.appliedToChampion, true);
assert.equal(governedCalibration.featureSet.leagueLearning.applicationMode, "CHAMPION_CALIBRATION");
assert.equal(governedCalibration.featureSet.seasonLearning.appliedToChampion, true);
assert.equal(governedCalibration.featureSet.seasonLearning.mode, "BOUNDED_SCORE_CALIBRATION");
assert.ok(governedCalibration.featureSet.score.components.some((part) => part.label === "league-season-score-calibration"));
const missingScopeGovernance = runUnifiedPrediction({
  ...context,
  learningGovernance: {
    leagueCalibration: {
      status: "PROMOTED",
      primaryModule: "LEAGUE_CALIBRATION",
      settledSamples: 30,
      reviewApproved: true,
      approvedBy: "manual-reviewer",
      approvedAt: "2026-08-22T12:00:00+08:00",
      governanceNoteId: "note-missing-scope",
      cohortId: "cohort-missing-scope",
      serverDerived: true,
      validation: approvedValidation,
    },
  },
}, { lockType: "FINAL_LOCK" });
assert.equal(missingScopeGovernance.featureSet.leagueLearning.appliedToChampion, false, "缺少联赛作用域的治理记录不得应用");

const jaroInterAliases = runUnifiedPrediction({
  ...context,
  match: { matchId: "finnish-aliases", league: "芬超", home: "雅罗", away: "国际图", matchDate: "2026-07-19", handicap: "+1" },
  samples: finnishAliasSamples,
}, { lockType: "PRE_LOCK" });
assert.equal(jaroInterAliases.featureSet.recentForm.home.length, 5);
assert.equal(jaroInterAliases.featureSet.recentForm.away.length, 5);

const recommendation = (grade, advice = "可选", eligible = true) => ({ grade, advice, eligible, probability: 0.6 });
const allMarketsAvailable = { winDrawLose: true, handicap: true, totalGoals: true, scores: true };
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("D", "跳过", false),
  totalGoals: recommendation("D", "跳过", false),
  scores: recommendation("D", "跳过", false),
}, true).grade, "C");
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("B"),
  totalGoals: recommendation("C", "谨慎"),
  scores: recommendation("C", "谨慎"),
}, true).grade, "B");
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("A", "主打"),
  totalGoals: recommendation("A", "主打"),
  scores: recommendation("A", "主打"),
}, true).grade, "A");
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("A", "主打"),
  totalGoals: recommendation("A", "主打"),
  scores: recommendation("A", "主打"),
}, false).grade, "D");
assert.equal(packageAdviceForGrade("主打", "B", true), "可选");
assert.equal(packageAdviceForGrade("主打", "C", true), "谨慎");
assert.equal(packageAdviceForGrade("主打", "D", true), "跳过");
assert.equal(packageAdviceForGrade("观察", "D", false), "跳过");
assert.equal(packageAdviceForGrade("观察", "C", false), "观察");

const hhadOnly = runUnifiedPrediction({
  ...context,
  market: { ...context.market, normal: { win: "", draw: "", lose: "" } },
  oddsHistory: {
    had: [],
    hhad: [
      { updateDate: "2026-07-17", updateTime: "10:00:00", goalLine: "-2", h: 2.02, d: 4.0, a: 2.65 },
      { updateDate: "2026-07-17", updateTime: "11:00:00", goalLine: "-2", h: 1.94, d: 4.05, a: 2.73 },
    ],
  },
}, { lockType: "FINAL_LOCK" });
assert.equal(hhadOnly.modelLessons.version, "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16");
assert.equal(hhadOnly.featureSet.marketAvailability.mode, "HHAD_ONLY");
assert.equal(hhadOnly.featureSet.marketAvailability.complete, true);
assert.equal(hhadOnly.featureSet.marketAvailability.markets.winDrawLose, false);
assert.equal(hhadOnly.featureSet.marketAvailability.markets.handicap, true);
assert.equal(hhadOnly.featureSet.oddsMovement.market, "HHAD");
assert.equal(hhadOnly.gateResult.gates.completeOdds, true);
assert.equal(hhadOnly.gateResult.gates.oddsMovement, true);
assert.equal(hhadOnly.tenStepResult.steps[0].title, "当前可售让球 SP 复核");
assert.equal(hhadOnly.featureSet.baselineParts.some((part) => part.label === "sporttery-wdl-calibration"), false);
assert.equal(hhadOnly.finalDecision.confidenceAdjustments.marketAvailability, -4);
assert.ok(hhadOnly.finalDecision.winDrawLose);
assert.ok(!hhadOnly.finalDecision.formalMarkets.includes("winDrawLose"));

const partialHad = runUnifiedPrediction({
  ...context,
  market: { ...context.market, normal: { win: "1.80", draw: "", lose: "4.50" } },
  oddsHistory: { had: [], hhad: [{ goalLine: "-2", h: 2.02, d: 4.0, a: 2.65 }, { goalLine: "-2", h: 1.94, d: 4.05, a: 2.73 }] },
}, { lockType: "FINAL_LOCK" });
assert.equal(partialHad.featureSet.marketAvailability.mode, "DATA_INCOMPLETE");
assert.equal(partialHad.gateResult.gates.completeOdds, false);
assert.equal(partialHad.lockType, "PRE_LOCK");

const materialHandicapConflict = handicapDecisionAudit([
  { label: "让胜", probability: 0.552 },
  { label: "让负", probability: 0.242 },
  { label: "让平", probability: 0.206 },
], "让负");
assert.equal(materialHandicapConflict.materialConflict, true);
assert.ok(materialHandicapConflict.probabilityGap > 0.1);
assert.equal(materialHandicapConflict.resolved, false);

const conditionalLeader = selectConditionalHandicapDecision([
  { direction: "HOME", handicapPick: "让平", scoreProbability: 0.21, conditionalProbability: 0.42, marginalProduct: 0.13 },
  { direction: "HOME", handicapPick: "让胜", scoreProbability: 0.29, conditionalProbability: 0.58, marginalProduct: 0.11 },
  { direction: "DRAW", handicapPick: "让负", scoreProbability: 0.27, conditionalProbability: 1, marginalProduct: 0.14 },
], "HOME");
assert.equal(conditionalLeader.handicapPick, "让胜");
const formalScoreCompatible = selectFormalHandicapDecision([
  { direction: "HOME", handicapPick: "让平", scoreProbability: 0.21, conditionalProbability: 0.42, marginalProduct: 0.13 },
  { direction: "HOME", handicapPick: "让胜", scoreProbability: 0.29, conditionalProbability: 0.58, marginalProduct: 0.11 },
  { direction: "DRAW", handicapPick: "让负", scoreProbability: 0.27, conditionalProbability: 1, marginalProduct: 0.14 },
], "HOME", [
  { score: "2-1", home: 2, away: 1, probability: 0.12 },
  { score: "1-1", home: 1, away: 1, probability: 0.11 },
], "-1");
assert.equal(formalScoreCompatible.handicapPick, "让胜");
assert.equal(formalScoreCompatible.officialScoreSupported, false);
assert.deepEqual(formalScoreCompatible.officialScoreSupport, []);
const runnerUpConditional = selectConditionalHandicapDecision([
  { direction: "HOME", handicapPick: "让胜", conditionalProbability: 0.58, scoreProbability: 0.29 },
  { direction: "HOME", handicapPick: "让平", conditionalProbability: 0.42, scoreProbability: 0.21 },
], "HOME", "让胜");
assert.equal(runnerUpConditional.handicapPick, "让平");
const oneGoalWinSupported = oneGoalWinAudit({
  direction: "HOME",
  handicapPick: "让胜",
  handicap: "-1",
  candidates: [
    { direction: "HOME", handicapPick: "让平", conditionalProbability: 0.44 },
    { direction: "HOME", handicapPick: "让胜", conditionalProbability: 0.56 },
  ],
});
assert.equal(oneGoalWinSupported.required, true);
assert.equal(oneGoalWinSupported.complete, true);
assert.equal(oneGoalWinSupported.fullDistributionSupportsCover, true);
assert.equal(oneGoalWinSupported.action, "ALLOW");
const oneGoalWinBlocked = oneGoalWinAudit({
  direction: "HOME",
  handicapPick: "让胜",
  handicap: "-1",
  candidates: [
    { direction: "HOME", handicapPick: "让平", conditionalProbability: 0.58 },
    { direction: "HOME", handicapPick: "让胜", conditionalProbability: 0.42 },
  ],
});
assert.equal(oneGoalWinBlocked.complete, false);
assert.equal(oneGoalWinBlocked.action, "BLOCK_HANDICAP_FORMAL_KEEP_SHADOW");

const highXgOutputConflict = outputConsistencyAudit({
  scoreRows: [
    { home: 2, away: 1, probability: 0.32 },
    { home: 2, away: 0, probability: 0.25 },
    { home: 3, away: 2, probability: 0.23 },
    { home: 4, away: 1, probability: 0.2 },
  ],
  officialScores: [{ score: "2-1", home: 2, away: 1 }, { score: "2-0", home: 2, away: 0 }],
  selectedTotalKeys: ["3", "4"],
  totalProbabilities: new Map([["2", 0.25], ["3", 0.32], ["5", 0.43]]),
  xg: { home: 3.8, away: 1.2 },
  venueProfile: { homeAttackVariance: 1.4, awayDefenceVariance: 1.6 },
  leagueProfile: { opennessFactor: 1.16 },
  directionProbability: 0.79,
});
assert.equal(highXgOutputConflict.xgAligned, false);
assert.equal(highXgOutputConflict.highVarianceTailRequired, true);
assert.equal(highXgOutputConflict.highVarianceTailCovered, false);
assert.equal(highXgOutputConflict.complete, false);
assert.equal(highXgOutputConflict.grade, "D");
assert.ok(highXgOutputConflict.score < 60);
assert.equal(highXgOutputConflict.criticalConflict, true);
assert.ok(highXgOutputConflict.criticalReasons.includes("HIGH_VARIANCE_TAIL_NOT_COVERED"));

const mildOutputConflict = outputConsistencyAudit({
  scoreRows: [
    { home: 1, away: 1, probability: 0.5 },
    { home: 1, away: 0, probability: 0.5 },
  ],
  officialScores: [{ score: "1-1", home: 1, away: 1 }, { score: "1-0", home: 1, away: 0 }],
  selectedTotalKeys: ["2", "1"],
  totalProbabilities: new Map([["2", 0.5], ["1", 0.5]]),
  xg: { home: 2, away: 1 },
  venueProfile: { homeAttackVariance: 0.8, awayDefenceVariance: 0.9 },
  leagueProfile: { opennessFactor: 1 },
  directionProbability: 0.58,
});
assert.equal(mildOutputConflict.complete, false);
assert.equal(mildOutputConflict.grade, "B");
assert.ok(mildOutputConflict.score >= 75);
assert.equal(mildOutputConflict.criticalConflict, false);
assert.equal(mildOutputConflict.selectedDistributionCoverageRatio, 1);
assert.equal(mildOutputConflict.officialScoreCoverageRole, "AUDIT_ONLY_NO_SCORE_OR_GATE_EFFECT");

const extremeGap = criticalPackageGapAudit({
  foundationEligible: true,
  qualifyingVenueSamples: { required: false, complete: true },
  tieAudit: { required: false, complete: true },
  stageAudit: { required: false, complete: true },
  handicapDecision: { materialConflict: true, resolved: false, independentLeader: "让胜", selected: "让负" },
  outputConsistency: mildOutputConflict,
});
assert.equal(extremeGap.blocking, true);
assert.equal(extremeGap.packageBlocking, false);
assert.equal(extremeGap.marketBlocking, true);
assert.equal(extremeGap.extremeHandicapConflict, true);
assert.ok(extremeGap.reasons.includes("EXTREME_HANDICAP_CONFLICT"));
assert.deepEqual(extremeGap.blockedMarkets, ["handicap"]);
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("D", "跳过", false),
  totalGoals: recommendation("C", "谨慎"),
  scores: recommendation("C", "谨慎"),
}, true, extremeGap).grade, "C");
const extremePackageMarkets = packageMarketSelection({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("D", "跳过", false),
  totalGoals: recommendation("C", "谨慎"),
  scores: recommendation("C", "谨慎"),
}, extremeGap, allMarketsAvailable);
assert.deepEqual(extremePackageMarkets.observationalMarkets, ["winDrawLose", "totalGoals", "scores"]);
assert.deepEqual(extremePackageMarkets.formalMarkets, ["winDrawLose"]);

const outputScopedGap = criticalPackageGapAudit({
  foundationEligible: true,
  qualifyingVenueSamples: { required: false, complete: true },
  tieAudit: { required: false, complete: true },
  stageAudit: { required: false, complete: true },
  handicapDecision: { materialConflict: false, resolved: true, independentLeader: "让平", selected: "让平" },
  outputConsistency: highXgOutputConflict,
});
assert.equal(outputScopedGap.packageBlocking, false);
assert.deepEqual(outputScopedGap.blockedMarkets, ["totalGoals"]);
const outputScopedMarkets = packageMarketSelection({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("B"),
  totalGoals: recommendation("C", "谨慎"),
  scores: recommendation("C", "谨慎"),
}, outputScopedGap, allMarketsAvailable);
assert.deepEqual(outputScopedMarkets.observationalMarkets, ["winDrawLose", "handicap", "totalGoals", "scores"]);
assert.deepEqual(outputScopedMarkets.formalMarkets, ["winDrawLose", "handicap"]);

const sharedGap = criticalPackageGapAudit({
  foundationEligible: false,
  qualifyingVenueSamples: { required: false, complete: true },
  tieAudit: { required: false, complete: true },
  stageAudit: { required: false, complete: true },
  handicapDecision: { materialConflict: false, resolved: true },
  outputConsistency: mildOutputConflict,
});
assert.equal(sharedGap.packageBlocking, true);
assert.deepEqual(sharedGap.blockedMarkets, []);
assert.equal(overallComponentGradeAudit({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("B"),
  totalGoals: recommendation("C", "谨慎"),
  scores: recommendation("C", "谨慎"),
}, true, sharedGap).grade, "D");
assert.deepEqual(packageMarketSelection({
  winDrawLose: recommendation("A", "主打"),
  handicap: recommendation("B"),
}, sharedGap, allMarketsAvailable).formalMarkets, []);
const resolvedHandicapConflict = handicapDecisionAudit([
  { label: "让负", probability: 0.497 },
  { label: "让胜", probability: 0.261 },
  { label: "让平", probability: 0.242 },
], conditionalLeader.handicapPick, {
  mode: "DIRECTION_CONDITIONAL_LEADER",
  directionPreserved: true,
  isConditionalLeader: true,
  scoreProbability: conditionalLeader.scoreProbability,
  conditionalProbability: conditionalLeader.conditionalProbability,
});
assert.equal(resolvedHandicapConflict.materialConflict, true);
assert.equal(resolvedHandicapConflict.conditionalResolution, false);
assert.equal(resolvedHandicapConflict.resolved, false);
assert.ok(resolvedHandicapConflict.confidencePenalty > 0);

const independentChampionConflict = runUnifiedPrediction({
  ...context,
  match: { ...context.match, handicap: "-1" },
  market: {
    ...context.market,
    normal: { win: "1.70", draw: "3.65", lose: "4.70" },
    handicapOdds: { win: "3.60", draw: "3.35", lose: "1.78" },
  },
}, { lockType: "FINAL_LOCK" });
assert.equal(independentChampionConflict.finalDecision.recommendationSide, "HOME");
assert.notEqual(independentChampionConflict.finalDecision.handicapPick, independentChampionConflict.featureSet.conditionalHandicapChallenger.pick);
assert.equal(independentChampionConflict.featureSet.jointDecision.independentHandicapLeader, "让负");
assert.equal(independentChampionConflict.featureSet.jointDecision.selected.direction, "HOME");
assert.equal(independentChampionConflict.featureSet.jointDecision.selected.handicapPick, independentChampionConflict.finalDecision.handicapPick);
assert.equal(independentChampionConflict.featureSet.conditionalHandicapChallenger.mode, "DIRECTION_CONDITIONAL_CHALLENGER_SHADOW");
assert.equal(independentChampionConflict.featureSet.conditionalHandicapChallenger.promotedToChampion, false);
assert.equal(independentChampionConflict.featureSet.conditionalHandicapChallenger.learningEligibility, "SHADOW_AUDIT_ONLY");
assert.equal(typeof independentChampionConflict.featureSet.conditionalHandicapChallenger.differsFromChampion, "boolean");
assert.equal(independentChampionConflict.featureSet.conditionalHandicapChallenger.differsFromIndependentLeader, true);
assert.equal(independentChampionConflict.lockType, "FINAL_LOCK");
assert.equal(independentChampionConflict.finalDecision.decisionStatus, "FINAL_LOCK_ELIGIBLE");
assert.equal(independentChampionConflict.gateResult.gates.handicapDecisionConflictResolved, true);
assert.equal(independentChampionConflict.finalDecision.handicapPick, "让负");
assert.equal(independentChampionConflict.finalDecision.scores.length, 2);

const blocked = runUnifiedPrediction({ ...context, research: { ...research, injuries: { status: "MISSING" } } }, { lockType: "FINAL_LOCK" });
assert.equal(blocked.lockType, "PRE_LOCK");
assert.ok(blocked.gateResult.blockers.includes("preMatchResearch"));

const thinFundamentals = runUnifiedPrediction({ ...context, samples: samples.filter((_, index) => index < 4) }, { lockType: "FINAL_LOCK" });
assert.equal(thinFundamentals.lockType, "PRE_LOCK");
assert.ok(thinFundamentals.gateResult.blockers.includes("fundamentalData"));
assert.equal(thinFundamentals.featureSet.seasonLearning.appliedToChampion, false);
assert.ok(!thinFundamentals.featureSet.score.components.some((part) => part.label === "league-season-score-calibration"));

const mlsPauseSamples = samples.map((sample) => ({ ...sample, league: "美职", kickoffTime: "2026-05-24" }));
const mlsRestart = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "美职", matchDate: "2026-07-17" },
  samples: mlsPauseSamples,
}, { lockType: "FINAL_LOCK" });
assert.equal(mlsRestart.featureSet.recentFormFresh, true);
const expiredRestartBridge = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "美职", matchDate: "2026-07-25" },
  samples: mlsPauseSamples,
}, { lockType: "FINAL_LOCK" });
assert.equal(expiredRestartBridge.featureSet.recentFormFresh, false);

for (const [league, version, penalty] of [
  ["韩职", "KLEAGUE_2026-07-12_R1", 0],
  ["瑞超", "ALLSVENSKAN_2026-07-14_R2", 0],
  ["挪超", "ELITESERIEN_2026-07-12_R1", 0],
]) {
  const leagueSamples = samples.map((sample) => ({ ...sample, league }));
  const learned = runUnifiedPrediction({ ...context, match: { ...context.match, league }, samples: leagueSamples }, { lockType: "FINAL_LOCK" });
  assert.equal(learned.featureSet.leagueLearning.version, version);
  assert.equal(learned.modelLessons.leagueSpecific.league, league);
  assert.equal(Math.abs(learned.finalDecision.confidenceAdjustments.leagueLearning), penalty);
  assert.equal(learned.featureSet.leagueLearning.applicationMode, "CHALLENGER_SHADOW");
  assert.equal(learned.featureSet.leagueLearning.appliedToChampion, false);
  assert.ok(learned.modelLessons.leagueSpecific.rules.length >= 2);
}

const swedishAlias = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "瑞典超" },
  samples: samples.map((sample) => ({ ...sample, league: "瑞典超" })),
}, { lockType: "FINAL_LOCK" });
assert.equal(swedishAlias.featureSet.leagueLearning.version, "ALLSVENSKAN_2026-07-14_R2");

const opponentAliasDuplicate = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "瑞超", home: "主队", away: "韦斯特" },
  samples: [
    ...samples.map((sample) => ({ ...sample, league: "瑞超" })),
    { league: "瑞超", kickoffTime: "2026-07-04 21:00", homeTeam: "哈姆斯塔德", awayTeam: "瓦斯特拉斯", actualHomeGoals: 1, actualAwayGoals: 3, source: "historical-feed" },
    { league: "瑞超", kickoffTime: "2026-07-04 21:00", homeTeam: "哈尔姆斯", awayTeam: "韦斯特罗", actualHomeGoals: 1, actualAwayGoals: 3, source: "d1-base-case" },
    { league: "瑞超", kickoffTime: "2026-07-03 21:00", homeTeam: "韦斯特", awayTeam: "对手丙", actualHomeGoals: 2, actualAwayGoals: 0 },
    { league: "瑞超", kickoffTime: "2026-07-02 21:00", homeTeam: "对手丁", awayTeam: "韦斯特", actualHomeGoals: 0, actualAwayGoals: 1 },
    { league: "瑞超", kickoffTime: "2026-07-01 21:00", homeTeam: "韦斯特", awayTeam: "对手戊", actualHomeGoals: 1, actualAwayGoals: 1 },
    { league: "瑞超", kickoffTime: "2026-06-30 21:00", homeTeam: "对手己", awayTeam: "韦斯特", actualHomeGoals: 2, actualAwayGoals: 2 },
  ],
}, { lockType: "PRE_LOCK" });
const duplicatePerspectiveKeys = opponentAliasDuplicate.featureSet.recentForm.away.map((row) => [row.date, row.venue, row.rawGf, row.rawGa].join("|"));
assert.equal(duplicatePerspectiveKeys.filter((key) => key === "2026-07-04|AWAY|3|1").length, 1);
assert.equal(new Set(duplicatePerspectiveKeys).size, duplicatePerspectiveKeys.length);

const swedishStrongFavourite = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "瑞超" },
  market: { ...context.market, normal: { win: "1.18", draw: "5.90", lose: "8.85" } },
  samples: samples.map((sample) => ({
    ...sample,
    league: "瑞超",
    actualHomeGoals: sample.homeTeam === "客队" ? 0 : sample.actualHomeGoals,
    actualAwayGoals: sample.awayTeam === "客队" ? 0 : sample.actualAwayGoals,
  })),
}, { lockType: "FINAL_LOCK" });
assert.equal(swedishStrongFavourite.featureSet.leagueLearning.appliedSignals.strongHomeFavourite, true);
assert.equal(swedishStrongFavourite.featureSet.leagueLearning.appliedSignals.weakAwayAttack, true);
assert.ok(swedishStrongFavourite.modelLessons.leagueSpecific.rules.some((rule) => rule.includes("2-0/3-0")));

const genericStrongFavourite = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "芬超" },
  market: { ...context.market, normal: { win: "1.18", draw: "5.90", lose: "8.85" } },
  samples: samples.map((sample) => ({ ...sample, league: "芬超" })),
}, { lockType: "FINAL_LOCK" });
assert.equal(genericStrongFavourite.featureSet.leagueLearning.appliedSignals.strongHomeFavourite, false);

const uclAliasSamples = Array.from({ length: 6 }, (_, index) => ({
  league: index % 2 ? "匈甲" : "冰岛超",
  kickoffTime: `2026-07-0${index + 1}`,
  matchType: "OFFICIAL",
  leagueStrengthFactor: index % 2 ? 0.86 : 0.82,
  opponentQualityFactor: 1,
  homeTeam: index % 2 ? "吉奥里" : "对手甲",
  awayTeam: index % 2 ? "对手乙" : "维京古尔",
  actualHomeGoals: index % 2 ? 2 : 0,
  actualAwayGoals: index % 2 ? 0 : 1,
}));
const uclAliases = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", home: "杰尔", away: "维京人" },
  samples: uclAliasSamples,
}, { lockType: "PRE_LOCK" });
assert.equal(uclAliases.featureSet.recentForm.home.length, 3);
assert.equal(uclAliases.featureSet.recentForm.away.length, 3);
assert.equal(uclAliases.featureSet.crossLeagueNormalization.complete, true);
assert.equal(uclAliases.featureSet.crossLeagueNormalization.home.normalizedCrossLeague, 3);

const finnishAliases = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "芬超", home: "塞伊奈", away: "库普斯" },
  samples: [
    ...Array.from({ length: 5 }, (_, index) => ({ league: "芬超", kickoffTime: `2026-06-${String(index + 1).padStart(2, "0")}`, homeTeam: "SJK", awayTeam: `芬兰对手${index}`, actualHomeGoals: 2, actualAwayGoals: 1 })),
    ...Array.from({ length: 5 }, (_, index) => ({ league: "芬超", kickoffTime: `2026-06-${String(index + 10).padStart(2, "0")}`, homeTeam: `芬兰对手乙${index}`, awayTeam: "KuPS", actualHomeGoals: 0, actualAwayGoals: 2 })),
  ],
}, { lockType: "PRE_LOCK" });
assert.equal(finnishAliases.featureSet.recentForm.home.length, 5);
assert.equal(finnishAliases.featureSet.recentForm.away.length, 5);

const ilvesAlias = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "芬超", home: "TPS", away: "坦山猫" },
  samples: [
    ...Array.from({ length: 8 }, (_, index) => ({ league: "芬超", kickoffTime: `2026-06-${String(index + 1).padStart(2, "0")}`, homeTeam: "TPS", awayTeam: `芬兰对手甲${index}`, actualHomeGoals: 2, actualAwayGoals: 1 })),
    ...Array.from({ length: 8 }, (_, index) => ({ league: "芬超", kickoffTime: `2026-06-${String(index + 10).padStart(2, "0")}`, homeTeam: `芬兰对手乙${index}`, awayTeam: "Ilves", actualHomeGoals: 0, actualAwayGoals: 2 })),
  ],
}, { lockType: "PRE_LOCK" });
assert.equal(ilvesAlias.featureSet.recentForm.home.length, 8);
assert.equal(ilvesAlias.featureSet.recentForm.away.length, 8);

const uclUnnormalized = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", home: "杰尔", away: "维京人" },
  samples: uclAliasSamples.map(({ leagueStrengthFactor, opponentQualityFactor, matchType, ...sample }) => sample),
}, { lockType: "FINAL_LOCK" });
assert.equal(uclUnnormalized.lockType, "PRE_LOCK");
assert.equal(uclUnnormalized.featureSet.crossLeagueNormalization.complete, false);
assert.ok(uclUnnormalized.gateResult.blockers.includes("crossLeagueStrengthNormalized"));

const twoLegResearch = {
  ...research,
  competitionStage: "QUALIFYING",
  motivation: {
    ...research.motivation,
    summary: "欧冠资格赛次回合，主队总比分落后，必须追赶；客队领先并可以控制比赛。",
  },
};
const missingTwoLegContext = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", competitionStage: "QUALIFYING" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: twoLegResearch,
}, { lockType: "FINAL_LOCK" });
assert.equal(missingTwoLegContext.lockType, "PRE_LOCK");
assert.ok(missingTwoLegContext.gateResult.blockers.includes("twoLegContextComplete"));

const zeroVenueQualification = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", competitionStage: "QUALIFYING" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: twoLegResearch,
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(zeroVenueQualification.featureSet.qualifyingVenueSamples.directVenueSamples.away, 0);
assert.equal(zeroVenueQualification.featureSet.qualifyingVenueSamples.complete, false);
assert.ok(zeroVenueQualification.gateResult.blockers.includes("qualifyingVenueSamplesComplete"));
assert.equal(zeroVenueQualification.featureSet.componentFoundationEligible, false);
assert.deepEqual(zeroVenueQualification.finalDecision.formalMarkets, []);
assert.equal(zeroVenueQualification.finalDecision.overallGrade, "D");
assert.equal(zeroVenueQualification.finalDecision.overallGradeAudit.foundationEligible, false);
assert.equal(zeroVenueQualification.finalDecision.overallGradeAudit.reason, "SHARED_CRITICAL_PACKAGE_GAP");
assert.ok(zeroVenueQualification.finalDecision.criticalPackageGap.reasons.includes("QUALIFYING_VENUE_SAMPLE_GAP"));
assert.ok(Object.values(zeroVenueQualification.finalDecision.componentRecommendations).every((item) => item.grade === "D" && item.advice === "跳过"));

const qualificationReplacementResearch = {
  ...twoLegResearch,
  teamState: {
    ...twoLegResearch.teamState,
    venueSampleReplacements: {
      away: {
        status: "VERIFIED",
        sampleCount: 3,
        leagueStrengthFactor: 1,
        sources: [{ title: "Verified same-strength away sample", url: "https://example.com/away-sample" }],
      },
    },
  },
};
const completeTwoLegContext = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", competitionStage: "QUALIFYING" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: qualificationReplacementResearch,
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(completeTwoLegContext.lockType, "FINAL_LOCK");
assert.equal(completeTwoLegContext.featureSet.qualifyingVenueSamples.verifiedSameStrengthReplacement.away, true);
assert.equal(completeTwoLegContext.featureSet.tieContext.objectives.home, "TRAILING_MUST_CHASE");
assert.deepEqual(completeTwoLegContext.featureSet.tieContext.resultScopes, ["NINETY_MINUTE_WDL", "MATCH_GOAL_DIFFERENCE", "TIE_ADVANCEMENT"]);
assert.ok(completeTwoLegContext.featureSet.tieContext.advancementProbabilities.AWAY_ADVANCES > 0);
assert.equal(completeTwoLegContext.featureSet.tieContext.leadControl.applied, true);
assert.equal(completeTwoLegContext.featureSet.tieContext.leadControl.factor, 0.88);
assert.ok(completeTwoLegContext.featureSet.tieContext.leadControl.after.away < completeTwoLegContext.featureSet.tieContext.leadControl.before.away);

const mismatchedStage = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", competitionStage: "ROUND_OF_32" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: { ...twoLegResearch, competitionStage: "SEMI_FINAL" },
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(mismatchedStage.lockType, "PRE_LOCK");
assert.equal(mismatchedStage.featureSet.competitionStage.consistent, false);
assert.ok(mismatchedStage.gateResult.blockers.includes("competitionStageConsistent"));

const conflictResearch = Object.fromEntries(RESEARCH_KEYS.map((key) => [key, {
  ...research[key],
  impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 },
}]));
conflictResearch.competitionStage = "QUALIFYING";
conflictResearch.styleMatchup = { ...conflictResearch.styleMatchup, firstGoalSide: "AWAY" };
conflictResearch.motivation = {
  ...conflictResearch.motivation,
  summary: "欧冠资格赛次回合，主队总比分落后必须前压，客队领先并能够利用追分暴露。",
};
const conflictSamples = Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? {
  league: "欧冠", kickoffTime: `2026-06-${String(1 + (index % 28)).padStart(2, "0")}`,
  homeTeam: "追分主队", awayTeam: `主队对手${index}`, actualHomeGoals: 3, actualAwayGoals: 0,
} : {
  league: "欧冠", kickoffTime: `2026-06-${String(1 + (index % 28)).padStart(2, "0")}`,
  homeTeam: `客队对手${index}`, awayTeam: "领先客队", actualHomeGoals: 1, actualAwayGoals: 1,
});
const evidenceConflict = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", home: "追分主队", away: "领先客队", competitionStage: "QUALIFYING" },
  market: { ...context.market, normal: { win: "3.25", draw: "3.20", lose: "2.05" } },
  samples: conflictSamples,
  research: conflictResearch,
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(evidenceConflict.finalDecision.recommendationSide, "HOME");
assert.equal(evidenceConflict.featureSet.evidenceDirectionConflict.materialConflict, true);
assert.equal(evidenceConflict.featureSet.evidenceDirectionConflict.quantitativeSupportCount, 0);
assert.equal(evidenceConflict.featureSet.evidenceDrivenRiskChallenger.challengerWeight, 0.35);
assert.equal(evidenceConflict.lockType, "PRE_LOCK");
assert.ok(evidenceConflict.gateResult.blockers.includes("evidenceDirectionConflictResolved"));

const resolvedConflictResearch = {
  ...conflictResearch,
  teamState: { ...conflictResearch.teamState, impact: { home: 0.04, draw: 0, away: 0, xgHome: 0, xgAway: 0 } },
  injuries: { ...conflictResearch.injuries, impact: { home: 0.04, draw: 0, away: 0, xgHome: 0, xgAway: 0 } },
};
const evidenceConflictResolved = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠", home: "追分主队", away: "领先客队", competitionStage: "QUALIFYING" },
  market: { ...context.market, normal: { win: "3.25", draw: "3.20", lose: "2.05" } },
  samples: conflictSamples,
  research: resolvedConflictResearch,
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(evidenceConflictResolved.featureSet.evidenceDirectionConflict.materialConflict, true);
assert.equal(evidenceConflictResolved.featureSet.evidenceDirectionConflict.quantitativeSupportCount, 2);
assert.equal(evidenceConflictResolved.featureSet.evidenceDirectionConflict.resolved, true);
assert.ok(!evidenceConflictResolved.gateResult.blockers.includes("evidenceDirectionConflictResolved"));

console.log("Unified prediction engine gates verified.");
