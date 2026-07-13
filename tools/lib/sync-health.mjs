export function syncHealthDecision(status = {}) {
  const scheduleAvailable = Boolean(status.snapshotSeed || status.okoooLive);
  const resultAvailable = Boolean(status.okoooResults || status.sportteryResults || status.liveFallback);
  const warnings = [];
  if (!status.snapshotSeed) warnings.push("赛事快照未更新");
  if (!status.okoooLive) warnings.push("OKOOO赛程未更新");
  if (!status.okoooResults && !status.sportteryResults) warnings.push("主赛果源未更新");
  if (!status.liveFallback) warnings.push("备用实时比分未更新");
  if (!status.reconciled) warnings.push("样本回填延迟");
  if (!scheduleAvailable && !resultAvailable) {
    return { level: "FAILURE", exitCode: 1, warnings, message: "赛事池、主赛果源和备用实时源同时不可用" };
  }
  if (warnings.length) {
    return { level: "DEGRADED", exitCode: 0, warnings, message: "核心网站数据仍可用，失败分支留待下一轮自动补齐" };
  }
  return { level: "HEALTHY", exitCode: 0, warnings: [], message: "全部数据源同步成功" };
}
