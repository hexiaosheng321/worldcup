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
const sideText = { HOME: "胜", DRAW: "平", AWAY: "负" };

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
  const independentRisk = run.riskScenario || {};
  const probabilities = run.featureSet.probabilities;
  const modelRunId = run.sourceContext?.modelRunId;
  if (!modelRunId) throw new Error(`${id} must publish its ${run.lockType} model run before publishing the lock`);
  const handicap = Number(String(item.handicap || "0").replace("+", ""));
  const lockType = isFinal ? "FINAL_LOCK" : "PRE_LOCK";
  const lockTypeSlug = isFinal ? "final" : "pre";
  const lock = {
    lockId: `manual-sporttery-${id}-${String(item.ticaiDate || item.matchDate || "").replaceAll("-", "")}-v4-${lockTypeSlug}-${lockRevision}`, matchId: `sporttery-${id}`, modelRunId,
    matchCode: item.issue || item.no || "", homeTeam: item.home, awayTeam: item.away, league: run.match.league,
    kickoffTime: `${item.matchDate || item.ticaiDate} ${item.kickoffTime}`, lockedAt: new Date().toISOString(), lockType,
    modelVersion: run.modelVersion, ...(isFinal ? { finalApproval: true } : {}),
    modelHomeProb: probabilities.HOME, modelDrawProb: probabilities.DRAW, modelAwayProb: probabilities.AWAY,
    recommendation: decision.winDrawLose || sideText[decision.recommendationSide], recommendationSide: decision.recommendationSide,
    finalGrade: grade(decision.confidence), finalAction: decision.advice, confidenceScore: decision.confidence,
    riskScore: 100 - decision.confidence, consistencyScore: Math.round(Object.values(run.gateResult?.gates || {}).filter(Boolean).length / Math.max(1, Object.keys(run.gateResult?.gates || {}).length) * 100),
    sportteryHomeSp: Number(item.normal?.win), sportteryDrawSp: Number(item.normal?.draw), sportteryAwaySp: Number(item.normal?.lose),
    asianHandicap: handicap, dataQuality: run.featureSet?.dataQuality?.grade || "D",
    reasoningSummary: `统一十步模型已完成当前SP、赛事动机、球队状态、风格对位、近期真实样本、赔率动态、比分总进球、让球独立边际、失败方式和价值过滤。正式让球使用独立概率第一项，条件让球只作Challenger影子验票。正式比分按联合概率覆盖选择${decision.scores.join(" / ")}，独立风险剧本${independentRisk.score || "-"}不占正式名额。`,
    sportteryPrediction: {
      type: `${run.match.league} 稳定 V4 模型${isFinal ? "锁版" : "待锁版"}`, matchId: id, no: item.no || "", issue: item.issue || "",
      matchDate: item.matchDate || item.ticaiDate, kickoffTime: item.kickoffTime, competition: run.match.league,
      home: item.home, away: item.away, modelVersion: run.modelVersion, pick: decision.winDrawLose,
      handicap: item.handicap, handicapPick: decision.handicapPick, totalGoalsPick: decision.totalGoalsPick,
      mainScore: decision.scores[0], counterScore: decision.scores[1], matchType: decision.matchType,
      independentRiskScenario: independentRisk,
      scoreSelectionPolicy: decision.scoreSelectionPolicy,
      officialScoreCoverageProbability: run.featureSet?.score?.officialCoverageProbability ?? null,
      unifiedRunEvidence: {
        seasonLearning: run.featureSet?.seasonLearning || null,
        riskScenario: independentRisk,
        scoreSelection: run.featureSet?.score || null,
        crossLeagueNormalization: run.featureSet?.crossLeagueNormalization || null,
        evidenceDirectionConflict: run.featureSet?.evidenceDirectionConflict || null,
        evidenceDrivenRiskChallenger: run.featureSet?.evidenceDrivenRiskChallenger || null,
        conditionalHandicapChallenger: run.featureSet?.conditionalHandicapChallenger || null,
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
  lock.scorePick = decision.scores.join(" / ");
  lock.totalGoalsPick = decision.totalGoalsPick;
  lock.analysis = {
    teamState: lock.teamState,
    finalPick: { winDrawLose: decision.winDrawLose, scores: decision.scores, totalGoals: decision.totalGoalsPick },
    unifiedSteps: [
      `01 当前胜平负SP复核：${lock.sportteryHomeSp} / ${lock.sportteryDrawSp} / ${lock.sportteryAwaySp}。`,
      `02 赛事规则与动机：${research.motivation}`,
      `03 球队状态：${lock.teamState}`,
      `04 风格对位：${research.styleMatchup}`,
      `05 盘口与样本：完整盘口样本${run.featureSet.sampleCount}场，两队近期赛果已读取并去重。`,
      `06 赔率动态：${first.updateDate} ${first.updateTime} ${first.h}/${first.d}/${first.a} -> ${latest.updateDate} ${latest.updateTime} ${latest.h}/${latest.d}/${latest.a}，状态${movement.marketState}。`,
      `07 比分/总进球独立闸门：比分${decision.scores.join(" / ")}，总进球${decision.totalGoalsPick}，两个比分脚本至少覆盖一个总进球选择。`,
      `08 让球独立闸门：让球${lock.asianHandicap}，让胜${((handicapProbabilities["让胜"] || 0) * 100).toFixed(1)}%、让平${((handicapProbabilities["让平"] || 0) * 100).toFixed(1)}%、让负${((handicapProbabilities["让负"] || 0) * 100).toFixed(1)}%；正式Champion为${handicapAudit.independentLeader || "-"}，条件Challenger为${run.featureSet?.conditionalHandicapChallenger?.pick || "-"}，最终单选${decision.handicapPick}。`,
      `09 冲突与失败方式：正式比分${decision.scores.join(" / ")}服务最大概率覆盖；独立风险${independentRisk.score || "-"}只进入风险诊断和置信扣分。`,
      `10 最终${isFinal ? "锁版" : "待锁版"}：${decision.winDrawLose}；${decision.handicapPick}；${decision.totalGoalsPick}；${decision.scores.join(" / ")}；${decision.advice}。`,
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
