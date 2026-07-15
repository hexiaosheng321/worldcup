import assert from "node:assert/strict";
import { RESEARCH_KEYS, handicapDecisionAudit, runUnifiedPrediction, selectOfficialScores } from "./lib/unified-prediction-engine.mjs";

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
    totalGoalsOdds: Array.from({ length: 8 }, (_, index) => ({ goals: index === 7 ? "7+" : String(index), odds: String(3 + index) })),
  },
  oddsHistory: { had: [{ h: 2.4, d: 3.1, a: 2.7 }, { h: 2.3, d: 3.1, a: 2.8 }] },
  samples,
  research,
};

const final = runUnifiedPrediction(context, { lockType: "FINAL_LOCK" });
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
assert.equal(final.gateResult.gates.jointCompatibility, true);
assert.equal(final.featureSet.jointDecision.selected.direction, final.finalDecision.recommendationSide);
assert.equal(final.featureSet.jointDecision.selected.handicapPick, final.finalDecision.handicapPick);
assert.equal(final.featureSet.baselineParts.find((part) => part.label === "sporttery-wdl-calibration").weight, 0.15);
assert.equal(final.featureSet.dataQuality.minimumRecentMatchesPerTeam, 5);
assert.equal(final.modelLessons.version, "LESSONS_2026-07-15_SCORE_COVERAGE_R5");
assert.equal(final.gateResult.gates.oppositeWinPathChecked, true);
assert.equal(final.gateResult.gates.secondScenarioInProbability, true);
assert.equal(final.gateResult.gates.twoLegContextComplete, true);
assert.equal(final.featureSet.scenarioDirectionCalibration.weight, 0.2);
assert.equal(final.featureSet.scenarioDirectionCalibration.applied, true);
assert.equal(final.featureSet.seasonLearning.mode, "BOUNDED_SCORE_CALIBRATION");
assert.equal(final.featureSet.seasonLearning.appliedToChampion, true);
assert.equal(final.featureSet.seasonLearning.appliedScope, "SCORE_DISTRIBUTION_ONLY");
assert.equal(final.featureSet.seasonLearning.season, "2026");
assert.ok(final.featureSet.score.components.some((part) => part.label === "league-season-score-calibration"));
assert.equal(final.featureSet.score.selectionPolicy, "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY");
assert.deepEqual(final.finalDecision.scores, final.featureSet.score.topCandidates.slice(0, 2).map((row) => row.score));
assert.equal(final.modelLessons.seasonSpecific.season, "2026");
assert.ok(final.backtestContract.metrics.includes("winDrawLoseSingleHit"));
assert.ok(final.backtestContract.metrics.includes("handicapSingleHit"));
assert.ok(final.backtestContract.metrics.includes("totalGoalsDoubleHit"));
assert.ok(final.backtestContract.metrics.includes("scoreDoubleHit"));
assert.equal(final.modelLessons.leagueSpecific.league, "韩职");
assert.equal(final.featureSet.leagueLearning.version, "KLEAGUE_2026-07-12_R1");
assert.equal(final.gateResult.gates.scenarioTotalsCovered, true);
assert.equal(final.gateResult.gates.scenarioHandicapCovered, true);
assert.equal(final.gateResult.gates.scoreCoverageOptimized, true);
assert.equal(final.gateResult.gates.riskScenarioAvailable, true);
assert.equal(final.finalDecision.confidenceAdjustments.leagueLearning, -2);
assert.equal(Object.keys(final.finalDecision.confidenceComponents).length, 4);
assert.ok(final.finalDecision.confidenceComponents.handicap > 0);
assert.equal(final.lifecycleContract.champion, "UNIFIED_PREDICTION_V4");
assert.equal(final.scenarioSet[0].handicapResult, final.finalDecision.handicapPick);
assert.equal(Object.keys(final.featureSet.handicap.probabilities).length, 3);
assert.equal(Object.keys(final.featureSet.totals.probabilities).length >= 2, true);
assert.equal(new Set(final.finalDecision.scores).size, 2);

const materialHandicapConflict = handicapDecisionAudit([
  { label: "让胜", probability: 0.552 },
  { label: "让负", probability: 0.242 },
  { label: "让平", probability: 0.206 },
], "让负");
assert.equal(materialHandicapConflict.materialConflict, true);
assert.ok(materialHandicapConflict.probabilityGap > 0.1);

const blocked = runUnifiedPrediction({ ...context, research: { ...research, injuries: { status: "MISSING" } } }, { lockType: "FINAL_LOCK" });
assert.equal(blocked.lockType, "PRE_LOCK");
assert.ok(blocked.gateResult.blockers.includes("preMatchResearch"));

const thinFundamentals = runUnifiedPrediction({ ...context, samples: samples.filter((_, index) => index < 4) }, { lockType: "FINAL_LOCK" });
assert.equal(thinFundamentals.lockType, "PRE_LOCK");
assert.ok(thinFundamentals.gateResult.blockers.includes("fundamentalData"));
assert.equal(thinFundamentals.featureSet.seasonLearning.appliedToChampion, false);
assert.ok(!thinFundamentals.featureSet.score.components.some((part) => part.label === "league-season-score-calibration"));

for (const [league, version, penalty] of [
  ["韩职", "KLEAGUE_2026-07-12_R1", 2],
  ["瑞超", "ALLSVENSKAN_2026-07-14_R2", 3],
  ["挪超", "ELITESERIEN_2026-07-12_R1", 3],
]) {
  const leagueSamples = samples.map((sample) => ({ ...sample, league }));
  const learned = runUnifiedPrediction({ ...context, match: { ...context.match, league }, samples: leagueSamples }, { lockType: "FINAL_LOCK" });
  assert.equal(learned.featureSet.leagueLearning.version, version);
  assert.equal(learned.modelLessons.leagueSpecific.league, league);
  assert.equal(learned.finalDecision.confidenceAdjustments.leagueLearning, -penalty);
  assert.ok(learned.modelLessons.leagueSpecific.rules.length >= 2);
}

const swedishAlias = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "瑞典超" },
  samples: samples.map((sample) => ({ ...sample, league: "瑞典超" })),
}, { lockType: "FINAL_LOCK" });
assert.equal(swedishAlias.featureSet.leagueLearning.version, "ALLSVENSKAN_2026-07-14_R2");

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

const twoLegResearch = {
  ...research,
  motivation: {
    ...research.motivation,
    summary: "欧冠资格赛次回合，主队总比分落后，必须追赶；客队领先并可以控制比赛。",
  },
};
const missingTwoLegContext = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: twoLegResearch,
}, { lockType: "FINAL_LOCK" });
assert.equal(missingTwoLegContext.lockType, "PRE_LOCK");
assert.ok(missingTwoLegContext.gateResult.blockers.includes("twoLegContextComplete"));

const completeTwoLegContext = runUnifiedPrediction({
  ...context,
  match: { ...context.match, league: "欧冠" },
  samples: samples.map((sample) => ({ ...sample, league: "欧冠" })),
  research: twoLegResearch,
  tieContext: { isTwoLeg: true, legNumber: 2, aggregateHomeBeforeMatch: 0, aggregateAwayBeforeMatch: 1 },
}, { lockType: "FINAL_LOCK" });
assert.equal(completeTwoLegContext.lockType, "FINAL_LOCK");
assert.equal(completeTwoLegContext.featureSet.tieContext.objectives.home, "TRAILING_MUST_CHASE");
assert.deepEqual(completeTwoLegContext.featureSet.tieContext.resultScopes, ["NINETY_MINUTE_WDL", "MATCH_GOAL_DIFFERENCE", "TIE_ADVANCEMENT"]);
assert.ok(completeTwoLegContext.featureSet.tieContext.advancementProbabilities.AWAY_ADVANCES > 0);

console.log("Unified prediction engine gates verified.");
