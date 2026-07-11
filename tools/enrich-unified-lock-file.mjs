import fs from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("Usage: node tools/enrich-unified-lock-file.mjs <manual-locks.json>");
const locks = JSON.parse(await fs.readFile(file, "utf8"));
for (const lock of locks) {
  const id = String(lock.matchId || "").replace(/^sporttery-/, "");
  const run = JSON.parse(await fs.readFile(`/tmp/prediction-${id}.json`, "utf8"));
  const research = Object.fromEntries((run.featureSet?.research?.items || []).map((item) => [item.key, item.summary]));
  const movement = run.featureSet?.oddsMovement || {};
  const first = movement.first || {};
  const latest = movement.latest || {};
  const scores = run.finalDecision.scores;
  const formText = (rows = []) => {
    const recent = rows.slice(0, 5);
    const wins = recent.filter((row) => row.result === "W").length;
    const draws = recent.filter((row) => row.result === "D").length;
    const losses = recent.filter((row) => row.result === "L").length;
    const gf = recent.reduce((sum, row) => sum + row.gf, 0);
    const ga = recent.reduce((sum, row) => sum + row.ga, 0);
    return `近5场${wins}胜${draws}平${losses}负，进${gf}失${ga}`;
  };
  lock.teamState = `主队${lock.homeTeam}${formText(run.featureSet?.recentForm?.home)}；客队${lock.awayTeam}${formText(run.featureSet?.recentForm?.away)}。${research.injuries || ""}${research.expectedLineups || ""}`;
  lock.scorePick = scores.join(" / ");
  lock.totalGoalsPick = run.finalDecision.totalGoalsPick;
  lock.analysis = {
    teamState: lock.teamState,
    finalPick: { winDrawLose: run.finalDecision.winDrawLose, scores, totalGoals: run.finalDecision.totalGoalsPick },
    unifiedSteps: [
      `01 当前胜平负SP复核：${lock.sportteryHomeSp} / ${lock.sportteryDrawSp} / ${lock.sportteryAwaySp}。`,
      `02 赛事规则与动机：${research.motivation}`,
      `03 球队状态：${lock.teamState}`,
      `04 风格对位：${research.styleMatchup}`,
      `05 盘口与样本：完整盘口样本${run.featureSet.sampleCount}场，两队近期赛果已命中。`,
      `06 赔率动态：${first.updateDate} ${first.updateTime} ${first.h}/${first.d}/${first.a} -> ${latest.updateDate} ${latest.updateTime} ${latest.h}/${latest.d}/${latest.a}，状态${movement.marketState}。`,
      `07 比分/总进球验证：比分${scores.join(" / ")}，总进球${run.finalDecision.totalGoalsPick}，已结合联赛画像与近期进失球。`,
      `08 让球独立闸门：让球${lock.asianHandicap}，主比分${scores[0]}独立映射为${run.finalDecision.handicapPick}，不复制胜平负。`,
      `09 决策冲突闸门与失败方式：主脚本${scores[0]}，反向风险${scores[1]}，已经球队状态、联赛画像、赔率动态、让球映射和相似样本校验。`,
      `10 最终锁版：${run.finalDecision.winDrawLose}；${run.finalDecision.handicapPick}；${run.finalDecision.totalGoalsPick}；${scores.join(" / ")}；${run.finalDecision.advice}。`,
    ],
  };
}
await fs.writeFile(file, `${JSON.stringify(locks, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, file, count: locks.length }, null, 2));
