import fs from "node:fs/promises";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("Usage: node tools/publish-unified-locks.mjs <matchId...>");
const apiBase = String(process.env.PUBLIC_API_BASE || "https://ticai-model.com").replace(/\/$/, "");
const bootstrap = await (await fetch(`${apiBase}/api/bootstrap?scope=full&includeCases=0`)).json();
const live = (bootstrap.matches || []).map((row) => {
  try { return { ...JSON.parse(row.payload_json || "{}"), cloudMatchId: row.match_id }; } catch { return {}; }
});
const locks = [];

const grade = (confidence) => confidence >= 70 ? "A" : confidence >= 60 ? "B" : confidence >= 45 ? "C" : "D";
const sideText = { HOME: "胜", DRAW: "平", AWAY: "负" };

for (const id of ids) {
  const run = JSON.parse(await fs.readFile(`/tmp/prediction-${id}.json`, "utf8"));
  if (run.lockType !== "FINAL_LOCK" || !run.gateResult?.passed || !run.tenStepResult?.passed) throw new Error(`${id} has not passed FINAL_LOCK gates`);
  const item = live.find((row) => String(row.matchId || row.cloudMatchId || "").replace(/^sporttery-/, "") === String(id));
  if (!item) throw new Error(`${id} missing from live pool`);
  const decision = run.finalDecision;
  const probabilities = run.featureSet.probabilities;
  const modelRunId = run.sourceContext?.modelRunId;
  const handicap = Number(String(item.handicap || "0").replace("+", ""));
  const lock = {
    lockId: `manual-sporttery-${id}-20260711-v3-final-r2`, matchId: `sporttery-${id}`, modelRunId,
    matchCode: item.issue || item.no || "", homeTeam: item.home, awayTeam: item.away, league: run.match.league,
    kickoffTime: `${item.matchDate || item.ticaiDate} ${item.kickoffTime}`, lockedAt: new Date().toISOString(), lockType: "FINAL_LOCK",
    modelVersion: run.modelVersion, finalApproval: true,
    modelHomeProb: probabilities.HOME, modelDrawProb: probabilities.DRAW, modelAwayProb: probabilities.AWAY,
    recommendation: decision.winDrawLose || sideText[decision.recommendationSide], recommendationSide: decision.recommendationSide,
    finalGrade: grade(decision.confidence), finalAction: decision.advice, confidenceScore: decision.confidence,
    riskScore: 100 - decision.confidence, consistencyScore: 100,
    sportteryHomeSp: Number(item.normal?.win), sportteryDrawSp: Number(item.normal?.draw), sportteryAwaySp: Number(item.normal?.lose),
    asianHandicap: handicap, dataQuality: "HIGH",
    reasoningSummary: `统一十步模型已完成当前SP、赛事动机、球队状态、风格对位、近期真实样本、赔率动态、比分总进球、让球独立映射、失败方式和价值过滤。主脚本${decision.scores[0]}，风险脚本${decision.scores[1]}。`,
    sportteryPrediction: {
      type: `${run.match.league} 联赛 V1 模型锁版`, matchId: id, no: item.no || "", issue: item.issue || "",
      matchDate: item.matchDate || item.ticaiDate, kickoffTime: item.kickoffTime, competition: run.match.league,
      home: item.home, away: item.away, modelVersion: run.modelVersion, pick: decision.winDrawLose,
      handicap: item.handicap, handicapPick: decision.handicapPick, totalGoalsPick: decision.totalGoalsPick,
      mainScore: decision.scores[0], counterScore: decision.scores[1], matchType: decision.matchType,
      confidence: grade(decision.confidence), confidenceScore: decision.confidence, advice: decision.advice,
      modelRunId, lockType: "FINAL_LOCK",
    },
  };
  const response = await fetch(`${apiBase}/api/locks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lock) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${id} lock failed: ${result.error || response.status}`);
  locks.push(lock);
  console.log(JSON.stringify({ id, lockId: result.lockId, decision }));
}

const output = `web/data/manual-locks-20260711-v3-r2.json`;
await fs.writeFile(output, `${JSON.stringify(locks, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output, count: locks.length }, null, 2));
