import assert from "node:assert/strict";
import { validationCohortMetrics } from "../web/functions/api/[[path]].js";

const baseOutput = {
  match: { handicap: "-1" },
  featureSet: { probabilities: { HOME: 0.55, DRAW: 0.25, AWAY: 0.2 } },
  finalDecision: {
    winDrawLose: "胜",
    recommendationSide: "HOME",
    componentRecommendations: { winDrawLose: { grade: "B" } },
    formalMarkets: ["winDrawLose"],
  },
};
const challengerOutput = structuredClone(baseOutput);
challengerOutput.shadowOnly = true;
challengerOutput.publicationEligible = false;
challengerOutput.validationEligible = true;
challengerOutput.finalDecision.shadowEvaluationMarkets = ["winDrawLose"];
challengerOutput.finalDecision.formalMarkets = [];

const metrics = validationCohortMetrics([{
  championOutput: baseOutput,
  challengerOutput,
  full_time_home_goals: 2,
  full_time_away_goals: 0,
  result_1x2: "HOME",
  total_goals: 2,
}], { primaryModule: "WIN_DRAW_LOSE", targetMarket: "winDrawLose" });

assert.equal(metrics.settledSamples, 1);
assert.equal(metrics.baselineCoverageRate, 0.25);
assert.equal(metrics.formalCoverageRate, 0.25);

challengerOutput.validationEligible = false;
const excluded = validationCohortMetrics([{
  championOutput: baseOutput,
  challengerOutput,
  full_time_home_goals: 2,
  full_time_away_goals: 0,
  result_1x2: "HOME",
  total_goals: 2,
}], { primaryModule: "WIN_DRAW_LOSE", targetMarket: "winDrawLose" });
assert.equal(excluded.settledSamples, 0);

console.log("R18 shadow evaluation coverage and invalid-market denominator exclusion verified.");
