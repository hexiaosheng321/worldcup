window.WC_LOCK_ENGINE = (() => {
  function nowIso() {
    return new Date().toISOString();
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function finalGrade(value) {
    const text = String(value || "D").trim().toUpperCase();
    if (text.startsWith("A")) return "A";
    if (text.startsWith("B")) return "B";
    if (text.startsWith("C")) return "C";
    return "D";
  }

  function finalAction(value) {
    const text = String(value || "");
    if (text.includes("主")) return "主推";
    if (text.includes("可")) return "可选";
    if (text.includes("跳")) return "跳过";
    return "谨慎";
  }

  function recommendationSide(value) {
    if (value === "胜") return "HOME";
    if (value === "平") return "DRAW";
    if (value === "负") return "AWAY";
    if (/双|不败|胜\/平|平\/负|胜\/负/.test(String(value || ""))) return "DOUBLE";
    return "SKIP";
  }

  function buildLockedPrediction(match = {}, options = {}) {
    const lockedAt = options.lockedAt || nowIso();
    const lockType = options.lockType === "PRE_LOCK" ? "PRE_LOCK" : "FINAL_LOCK";
    const matchId = String(options.matchId || match.matchId || match.no || "");
    return {
      lockId: options.lockId || `${matchId || "match"}-${lockType}-${Date.now()}`,
      matchId,
      matchCode: options.matchCode || match.no || match.issue || "",
      homeTeam: options.homeTeam || match.home || match.homeTeam || "",
      awayTeam: options.awayTeam || match.away || match.awayTeam || "",
      league: options.league || match.league || match.competition || match.group || "世界杯",
      kickoffTime: options.kickoffTime || match.kickoffTime || match.matchDate || match.date || "",
      lockedAt,
      lockType,
      modelVersion: "V4",
      modelHomeProb: safeNumber(options.modelHomeProb),
      modelDrawProb: safeNumber(options.modelDrawProb),
      modelAwayProb: safeNumber(options.modelAwayProb),
      recommendation: options.recommendation || options.pick || "",
      recommendationSide: options.recommendationSide || recommendationSide(options.pick || options.recommendation),
      finalGrade: finalGrade(options.finalGrade || options.confidence),
      finalAction: finalAction(options.finalAction || options.advice),
      confidenceScore: safeNumber(options.confidenceScore),
      riskScore: safeNumber(options.riskScore),
      consistencyScore: options.consistencyScore === undefined ? undefined : safeNumber(options.consistencyScore),
      sportteryHomeSp: options.sportteryHomeSp === undefined ? undefined : safeNumber(options.sportteryHomeSp),
      sportteryDrawSp: options.sportteryDrawSp === undefined ? undefined : safeNumber(options.sportteryDrawSp),
      sportteryAwaySp: options.sportteryAwaySp === undefined ? undefined : safeNumber(options.sportteryAwaySp),
      sportteryHomeProb: options.sportteryHomeProb,
      sportteryDrawProb: options.sportteryDrawProb,
      sportteryAwayProb: options.sportteryAwayProb,
      valueHomeGap: options.valueHomeGap,
      valueDrawGap: options.valueDrawGap,
      valueAwayGap: options.valueAwayGap,
      asianHandicap: options.asianHandicap,
      asianHomeWater: options.asianHomeWater,
      asianAwayWater: options.asianAwayWater,
      euroHomeOdds: options.euroHomeOdds,
      euroDrawOdds: options.euroDrawOdds,
      euroAwayOdds: options.euroAwayOdds,
      euroHomeProb: options.euroHomeProb,
      euroDrawProb: options.euroDrawProb,
      euroAwayProb: options.euroAwayProb,
      dataQuality: ["HIGH", "MEDIUM", "LOW"].includes(options.dataQuality) ? options.dataQuality : "MEDIUM",
      reasoningSummary: options.reasoningSummary || "",
      downgradeReasons: Array.isArray(options.downgradeReasons) ? options.downgradeReasons : [],
      resultStatus: options.resultStatus || "PENDING",
    };
  }

  function loadLocks() {
    return Array.isArray(window.WC_LOCKED_PREDICTIONS) ? window.WC_LOCKED_PREDICTIONS : [];
  }

  function preventOverwrite(locks, lock) {
    return !locks.some((item) => item.lockId === lock.lockId);
  }

  function createLock(match, options = {}) {
    const locks = loadLocks();
    const lock = buildLockedPrediction(match, options);
    if (!preventOverwrite(locks, lock)) {
      throw new Error("锁版记录不可覆盖：lockId 已存在");
    }
    locks.push(lock);
    window.WC_LOCKED_PREDICTIONS = locks;
    return lock;
  }

  function getPreferredLock(matchId, locks = loadLocks()) {
    const rows = locks
      .filter((item) => String(item.matchId) === String(matchId))
      .slice()
      .sort((a, b) => String(b.lockedAt).localeCompare(String(a.lockedAt)));
    return rows.find((item) => item.lockType === "FINAL_LOCK") || rows[0] || null;
  }

  return {
    buildLockedPrediction,
    createLock,
    getPreferredLock,
    preventOverwrite,
    recommendationSide,
    finalGrade,
    finalAction,
  };
})();
