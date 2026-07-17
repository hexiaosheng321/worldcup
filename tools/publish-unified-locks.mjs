import fs from "node:fs/promises";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("Usage: node tools/publish-unified-locks.mjs <matchId...>");
const apiBase = String(process.env.PUBLIC_API_BASE || "https://ticai-model.com").replace(/\/$/, "");
const runLabel = String(process.env.UNIFIED_RUN_LABEL || "v4");
const lockRevision = String(process.env.UNIFIED_LOCK_REVISION || "r2");
const bootstrap = await (await fetch(`${apiBase}/api/bootstrap?scope=full&includeCases=0`)).json();
const live = (bootstrap.matches || []).map((row) => {
  try { return { ...JSON.parse(row.payload_json || "{}"), cloudMatchId: row.match_id }; } catch { return {}; }
});
const locks = [];

const grade = (confidence) => confidence >= 70 ? "A" : confidence >= 60 ? "B" : confidence >= 45 ? "C" : "D";
const completeThreeWayMarket = (odds = {}) => ["win", "draw", "lose"].every((key) => Number.isFinite(Number(odds?.[key])) && Number(odds[key]) > 1);
const completeScoreMarket = (rows = []) => new Set((Array.isArray(rows) ? rows : [])
  .filter((row) => /^\d+[:\-]\d+$/.test(String(row?.score || "")) && Number.isFinite(Number(row?.odds)) && Number(row.odds) > 1)
  .map((row) => String(row.score).replace(":", "-"))).size >= 8;
const completeTotalGoalsMarket = (rows = []) => new Set((Array.isArray(rows) ? rows : [])
  .filter((row) => /^(?:[0-6]|7\+)$/.test(String(row?.goals ?? "")) && Number.isFinite(Number(row?.odds)) && Number(row.odds) > 1)
  .map((row) => String(row.goals))).size >= 8;

for (const id of ids) {
  const run = JSON.parse(await fs.readFile(`/tmp/${runLabel}-${id}.json`, "utf8"));
  const isFinal = run.lockType === "FINAL_LOCK";
  if (!isFinal && run.lockType !== "PRE_LOCK") throw new Error(`${id} has invalid lock type ${run.lockType}`);
  if (isFinal && (!run.gateResult?.passed || !run.tenStepResult?.passed)) throw new Error(`${id} has not passed FINAL_LOCK gates`);
  if (run.contractVersion !== "UNIFIED_PREDICTION_V4" || !run.finalDecision?.winDrawLose || !run.finalDecision?.handicapPick || run.finalDecision?.scores?.length !== 2) {
    throw new Error(`${id} does not contain a complete unified prediction package`);
  }
  const item = live.find((row) => String(row.matchId || row.cloudMatchId || "").replace(/^sporttery-/, "") === String(id));
  if (!item) throw new Error(`${id} missing from live pool`);
  const decision = run.finalDecision;
  const formalMarkets = Array.isArray(decision.formalMarkets) ? decision.formalMarkets : [];
  const formalMarketSet = new Set(formalMarkets);
  const modelMarketAvailability = run.featureSet?.marketAvailability?.markets || {};
  const liveMarketAvailability = {
    winDrawLose: completeThreeWayMarket(item.normal),
    handicap: completeThreeWayMarket(item.handicapOdds),
    totalGoals: completeTotalGoalsMarket(item.totalGoalsOdds),
    scores: completeScoreMarket(item.scoreOdds),
  };
  const criticalPackageGap = decision.criticalPackageGap || {};
  const blockedMarkets = Array.isArray(criticalPackageGap.blockedMarkets) ? criticalPackageGap.blockedMarkets : [];
  if (criticalPackageGap.packageBlocking && formalMarkets.length) throw new Error(`${id} shared critical gap cannot expose formal markets`);
  if (blockedMarkets.some((market) => formalMarketSet.has(market))) throw new Error(`${id} blocked market leaked into formal markets`);
  const unavailableFormalMarkets = formalMarkets.filter((market) => modelMarketAvailability[market] !== true || liveMarketAvailability[market] !== true);
  if (unavailableFormalMarkets.length) throw new Error(`${id} unavailable market leaked into formal markets: ${unavailableFormalMarkets.join(", ")}`);
  const candidateSelections = {
    winDrawLose: modelMarketAvailability.winDrawLose === true ? decision.winDrawLose : null,
    handicap: modelMarketAvailability.handicap === true ? decision.handicapPick : null,
    totalGoals: modelMarketAvailability.totalGoals === true ? decision.totalGoalsPick : null,
    scores: modelMarketAvailability.scores === true ? decision.scores : [],
  };
  const formalSelections = {
    winDrawLose: formalMarketSet.has("winDrawLose") ? decision.winDrawLose : null,
    handicap: formalMarketSet.has("handicap") ? decision.handicapPick : null,
    totalGoals: formalMarketSet.has("totalGoals") ? decision.totalGoalsPick : null,
    scores: formalMarketSet.has("scores") ? decision.scores : [],
  };
  const modelRevision = run.modelLessons?.version || run.modelVersion;
  const independentRisk = run.riskScenario || {};
  const probabilities = run.featureSet.probabilities;
  const outputConsistency = run.featureSet?.totals?.outputConsistency || {};
  const gateCompletionScore = Math.round(Object.values(run.gateResult?.gates || {}).filter(Boolean).length / Math.max(1, Object.keys(run.gateResult?.gates || {}).length) * 100);
  const modelRunId = run.sourceContext?.modelRunId;
  if (!modelRunId) throw new Error(`${id} must publish its ${run.lockType} model run before publishing the lock`);
  const handicap = Number(String(item.handicap || "0").replace("+", ""));
  const lockType = isFinal ? "FINAL_LOCK" : "PRE_LOCK";
  const lockTypeSlug = isFinal ? "final" : "pre";
  const lock = {
    lockId: `manual-sporttery-${id}-${String(item.ticaiDate || item.matchDate || "").replaceAll("-", "")}-v4-${lockTypeSlug}-${lockRevision}`, matchId: `sporttery-${id}`, modelRunId,
    matchCode: item.issue || item.no || "", homeTeam: item.home, awayTeam: item.away, league: run.match.league,
    kickoffTime: `${item.matchDate || item.ticaiDate} ${item.kickoffTime}`, lockedAt: new Date().toISOString(), lockType,
    modelVersion: run.modelVersion, modelRevision, ...(isFinal ? { finalApproval: true } : {}),
    modelHomeProb: probabilities.HOME, modelDrawProb: probabilities.DRAW, modelAwayProb: probabilities.AWAY,
    recommendation: candidateSelections.winDrawLose || "未开售", recommendationSide: candidateSelections.winDrawLose ? decision.recommendationSide : null,
    finalGrade: decision.overallGrade || grade(decision.confidence), finalAction: decision.advice, confidenceScore: decision.confidence,
    riskScore: 100 - decision.confidence, consistencyScore: Number(outputConsistency.score ?? gateCompletionScore),
    sportteryHomeSp: Number(item.normal?.win), sportteryDrawSp: Number(item.normal?.draw), sportteryAwaySp: Number(item.normal?.lose),
    asianHandicap: handicap, dataQuality: run.featureSet?.dataQuality?.grade || "D",
    reasoningSummary: `统一十步模型已完成当前SP、赛事动机、球队状态、风格对位、近期真实样本、赔率动态、比分总进球、让球独立边际、失败方式和价值过滤。让球候选按胜平负主方向下的完整联合净胜球分布选择，并由候选比分验证；独立边际第一项和排除候选项后的次优条件让球分别作风险审计与Challenger影子验票。比分候选按联合概率覆盖选择${decision.scores.join(" / ")}，独立风险剧本${independentRisk.score || "-"}不占候选名额；正式玩法仅以formalSelections为准。`,
    sportteryPrediction: {
      type: `${run.match.league} 稳定 V4 模型${isFinal ? "锁版" : "待锁版"}`, matchId: id, no: item.no || "", issue: item.issue || "",
      matchDate: item.matchDate || item.ticaiDate, kickoffTime: item.kickoffTime, competition: run.match.league,
      home: item.home, away: item.away, modelVersion: run.modelVersion, modelRevision, pick: candidateSelections.winDrawLose || "",
      handicap: item.handicap, handicapPick: candidateSelections.handicap || "", totalGoalsPick: candidateSelections.totalGoals || "",
      mainScore: candidateSelections.scores[0] || "", counterScore: candidateSelections.scores[1] || "", matchType: decision.matchType,
      marketAvailability: modelMarketAvailability,
      candidateSelections,
      formalSelections,
      independentRiskScenario: independentRisk,
      scoreSelectionPolicy: decision.scoreSelectionPolicy,
      officialScoreCoverageProbability: run.featureSet?.score?.officialCoverageProbability ?? null,
      unifiedRunEvidence: {
        modelRevision,
        modelLessons: run.modelLessons || null,
        seasonLearning: run.featureSet?.seasonLearning || null,
        riskScenario: independentRisk,
        scoreSelection: run.featureSet?.score || null,
        crossLeagueNormalization: run.featureSet?.crossLeagueNormalization || null,
        evidenceDirectionConflict: run.featureSet?.evidenceDirectionConflict || null,
        evidenceDrivenRiskChallenger: run.featureSet?.evidenceDrivenRiskChallenger || null,
        conditionalHandicapChallenger: run.featureSet?.conditionalHandicapChallenger || null,
        componentRecommendations: decision.componentRecommendations || null,
        marketAvailability: run.featureSet?.marketAvailability || null,
        outputConsistency,
        criticalPackageGap,
        observationalMarkets: decision.observationalMarkets || [],
        formalMarkets,
        overallGrade: decision.overallGrade || grade(decision.confidence),
        overallGradeAudit: decision.overallGradeAudit || null,
        gateCompletionScore,
        jointDecision: run.featureSet?.jointDecision || null,
        backtestContract: run.backtestContract || null,
        competitionStage: run.featureSet?.competitionStage || null,
        twoLegLeadControl: run.featureSet?.tieContext?.leadControl || null,
      },
      confidence: grade(decision.confidence), confidenceScore: decision.confidence, advice: decision.advice,
      modelRunId, lockType,
    },
  };
  const research = Object.fromEntries((run.featureSet?.research?.items || []).map((entry) => [entry.key, entry.summary]));
  const movement = run.featureSet?.oddsMovement || {};
  const marketAvailability = run.featureSet?.marketAvailability || {};
  const first = movement.first || {};
  const latest = movement.latest || {};
  const handicapProbabilities = run.featureSet?.handicap?.probabilities || {};
  const handicapAudit = run.featureSet?.jointDecision?.handicapDecisionAudit || {};
  const formText = (rows = []) => {
    const recent = rows.slice(0, 5);
    const wins = recent.filter((row) => row.result === "W").length;
    const draws = recent.filter((row) => row.result === "D").length;
    const losses = recent.filter((row) => row.result === "L").length;
    const gf = recent.reduce((sum, row) => sum + Number(row.gf || 0), 0);
    const ga = recent.reduce((sum, row) => sum + Number(row.ga || 0), 0);
    return `近5场${wins}胜${draws}平${losses}负，进${gf}失${ga}`;
  };
  lock.teamState = `主队${lock.homeTeam}${formText(run.featureSet?.recentForm?.home)}；客队${lock.awayTeam}${formText(run.featureSet?.recentForm?.away)}。${research.injuries || ""}${research.expectedLineups || ""}`;
  lock.scorePick = candidateSelections.scores.join(" / ");
  lock.totalGoalsPick = candidateSelections.totalGoals;
  lock.analysis = {
    teamState: lock.teamState,
    finalPick: { winDrawLose: candidateSelections.winDrawLose, handicap: candidateSelections.handicap, scores: candidateSelections.scores, totalGoals: candidateSelections.totalGoals },
    unifiedSteps: [
      marketAvailability.mode === "HHAD_ONLY"
        ? `01 当前可售SP复核：官方未开售普通胜平负；让球${lock.asianHandicap} SP ${item.handicapOdds?.win || "-"} / ${item.handicapOdds?.draw || "-"} / ${item.handicapOdds?.lose || "-"}，按R15 HHAD_ONLY门禁处理。`
        : `01 当前胜平负SP复核：${lock.sportteryHomeSp} / ${lock.sportteryDrawSp} / ${lock.sportteryAwaySp}。`,
      `02 赛事规则与动机：${research.motivation}`,
      `03 球队状态：${lock.teamState}`,
      `04 风格对位：${research.styleMatchup}`,
      `05 盘口与样本：完整盘口样本${run.featureSet.sampleCount}场，两队近期赛果已读取并去重。`,
      `06 赔率动态：${movement.market || "HAD"} ${first.updateDate || ""} ${first.updateTime || ""} ${first.h}/${first.d}/${first.a} -> ${latest.updateDate || ""} ${latest.updateTime || ""} ${latest.h}/${latest.d}/${latest.a}，状态${movement.marketState}。`,
      `07 比分/总进球独立闸门：比分候选${decision.scores.join(" / ")}，总进球候选${decision.totalGoalsPick}，两个比分脚本至少覆盖一个总进球选择；是否正式放行以formalSelections为准。`,
      `08 让球统一闸门：让球${lock.asianHandicap}，让胜${((handicapProbabilities["让胜"] || 0) * 100).toFixed(1)}%、让平${((handicapProbabilities["让平"] || 0) * 100).toFixed(1)}%、让负${((handicapProbabilities["让负"] || 0) * 100).toFixed(1)}%；独立边际第一项${handicapAudit.independentLeader || "-"}，主方向完整分布候选单选${decision.handicapPick}，条件Challenger为${run.featureSet?.conditionalHandicapChallenger?.pick || "-"}，候选比分只作支持性验证。`,
      `09 冲突与失败方式：正式比分${decision.scores.join(" / ")}服务最大概率覆盖；独立风险${independentRisk.score || "-"}只进入风险诊断和置信扣分。`,
      `10 最终${isFinal ? "锁版" : "待锁版"}：${candidateSelections.winDrawLose || "未开售"}；${candidateSelections.handicap || "未开售"}；${candidateSelections.totalGoals || "未开售"}；${candidateSelections.scores.join(" / ") || "未开售"}；${decision.advice}。`,
    ],
  };
  const response = await fetch(`${apiBase}/api/locks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lock) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${id} lock failed: ${result.error || response.status}`);
  locks.push(lock);
  console.log(JSON.stringify({ id, lockId: result.lockId, decision }));
}

const snapshotDate = String(live.find((item) => ids.includes(String(item.matchId)))?.ticaiDate || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
const output = `web/data/manual-locks-${snapshotDate}-v4-${lockRevision}.json`;
let mergedLocks = locks;
try {
  const existingLocks = JSON.parse(await fs.readFile(output, "utf8"));
  const replacedKeys = new Set(locks.map((lock) => `${String(lock.matchId || "")}:${lock.lockType}`));
  mergedLocks = [
    ...existingLocks.filter((lock) => !replacedKeys.has(`${String(lock.matchId || "")}:${lock.lockType}`)),
    ...locks,
  ];
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await fs.writeFile(output, `${JSON.stringify(mergedLocks, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output, publishedCount: locks.length, totalCount: mergedLocks.length }, null, 2));
