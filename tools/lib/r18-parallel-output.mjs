import { predictWdlResidualChallenger } from "./wdl-residual-challenger.mjs";

const RESULT_TEXT = { HOME: "胜", DRAW: "平", AWAY: "负" };

export function buildR18Challenger(champion, artifact) {
  const challenger = structuredClone(champion);
  const marketValues = champion.featureSet?.market?.probabilities;
  const marketProbabilities = Array.isArray(marketValues)
    ? Object.fromEntries(["HOME", "DRAW", "AWAY"].map((label, index) => [label, Number(marketValues[index] || 0)]))
    : null;
  const audit = predictWdlResidualChallenger({
    league: champion.match?.league,
    marketProbabilities,
    modelProbabilities: champion.featureSet?.probabilities,
  }, artifact);
  challenger.generatedAt = champion.generatedAt;
  challenger.modelVersion = "WDL-R18-CHALLENGER";
  challenger.shadowOnly = true;
  challenger.publicationEligible = false;
  challenger.validationEligible = audit.applied === true;
  challenger.validationExclusionReason = audit.applied === true ? "" : audit.reason;
  challenger.featureSet.r18WdlResidual = {
    ...audit,
    probabilities: audit.probabilities || null,
    artifactId: artifact.modelId,
    artifactRevision: artifact.modelRevision,
    championRevision: artifact.championRevision,
    forwardValidationRequired: true,
  };
  if (audit.probabilities && audit.selection) {
    challenger.featureSet.championProbabilities = champion.featureSet.probabilities;
    challenger.featureSet.probabilities = audit.probabilities;
    challenger.finalDecision.winDrawLose = RESULT_TEXT[audit.selection];
    challenger.finalDecision.recommendationSide = audit.selection;
  }
  challenger.finalDecision.shadowEvaluationMarkets = [...(champion.finalDecision.formalMarkets || [])];
  challenger.finalDecision.formalMarkets = [];
  challenger.finalDecision.observationalMarkets = ["winDrawLose"];
  challenger.finalDecision.decisionStatus = "R18_SHADOW_ONLY";
  challenger.finalDecision.advice = "影子验证，不可发布";
  challenger.lifecycleContract = {
    ...challenger.lifecycleContract,
    version: "R18_PARALLEL_FORWARD_2026_V1",
    champion: "UNIFIED_PREDICTION_R16",
    challenger: "WDL_R18_MARKET_RESIDUAL_SELECTOR",
    runRole: "CHALLENGER",
  };
  challenger.modelLessons = {
    ...challenger.modelLessons,
    version: artifact.modelRevision,
    rules: [
      "R18只学习R16与市场方向分歧的历史残差；证据不足时保留市场方向，达到支持度和收缩优势门槛才允许R16覆盖",
      "R18与R16必须使用完全相同且不可修改的赛前输入，影子结论不得进入formalSelections或锁版",
      "至少积累30至50场同输入前向样本，并同时通过方向命中、Brier、Log Loss与覆盖率守门后才可申请人工晋级",
    ],
  };
  challenger.backtestContract = {
    ...challenger.backtestContract,
    version: "R18_FORWARD_30_TO_50_V1",
    cohort: "R16_CHAMPION_VS_R18_CHALLENGER",
    pairedSameInputRequired: true,
    automaticPromotion: false,
  };
  return challenger;
}
