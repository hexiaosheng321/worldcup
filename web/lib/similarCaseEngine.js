window.WC_SIMILAR_CASE_ENGINE = (() => {
  const SIMILARITY_WEIGHTS = {
    league: 0.1,
    modelProb: 0.22,
    sportterySp: 0.15,
    valueGap: 0.15,
    asianHandicap: 0.13,
    waterLevel: 0.08,
    euroProb: 0.08,
    consistency: 0.05,
    risk: 0.03,
    grade: 0.01,
  };

  const gradeRank = { A: 4, B: 3, C: 2, D: 1 };

  function hasNumbers(...values) {
    return values.every((value) => Number.isFinite(Number(value)));
  }

  function clampScore(value) {
    return Math.max(0, Math.min(100, value));
  }

  function leagueScore(current, sample) {
    if (current.league === sample.league) return 100;
    const left = String(current.league || "");
    const right = String(sample.league || "");
    if (left && right && (left.includes(right) || right.includes(left))) return 70;
    return 40;
  }

  function calculateSimilarity(current, sample) {
    const parts = [];
    function add(key, score) {
      if (!Number.isFinite(score)) return;
      parts.push({ key, score: clampScore(score), weight: SIMILARITY_WEIGHTS[key] || 0 });
    }
    add("league", leagueScore(current, sample));
    if (hasNumbers(current.modelHomeProb, current.modelDrawProb, current.modelAwayProb, sample.modelHomeProb, sample.modelDrawProb, sample.modelAwayProb)) {
      const distance =
        Math.abs(current.modelHomeProb - sample.modelHomeProb) +
        Math.abs(current.modelDrawProb - sample.modelDrawProb) +
        Math.abs(current.modelAwayProb - sample.modelAwayProb);
      add("modelProb", 100 - distance * 100);
    }
    if (hasNumbers(current.sportteryHomeSp, current.sportteryDrawSp, current.sportteryAwaySp, sample.sportteryHomeSp, sample.sportteryDrawSp, sample.sportteryAwaySp)) {
      const distance =
        Math.abs(current.sportteryHomeSp - sample.sportteryHomeSp) +
        Math.abs(current.sportteryDrawSp - sample.sportteryDrawSp) +
        Math.abs(current.sportteryAwaySp - sample.sportteryAwaySp);
      add("sportterySp", 100 - distance * 20);
    }
    if (hasNumbers(current.valueHomeGap, current.valueDrawGap, current.valueAwayGap, sample.valueHomeGap, sample.valueDrawGap, sample.valueAwayGap)) {
      const distance =
        Math.abs(current.valueHomeGap - sample.valueHomeGap) +
        Math.abs(current.valueDrawGap - sample.valueDrawGap) +
        Math.abs(current.valueAwayGap - sample.valueAwayGap);
      add("valueGap", 100 - distance * 100);
    }
    if (hasNumbers(current.asianHandicap, sample.asianHandicap)) {
      add("asianHandicap", 100 - Math.abs(current.asianHandicap - sample.asianHandicap) * 40);
    }
    if (hasNumbers(current.asianHomeWater, current.asianAwayWater, sample.asianHomeWater, sample.asianAwayWater)) {
      const distance = Math.abs(current.asianHomeWater - sample.asianHomeWater) + Math.abs(current.asianAwayWater - sample.asianAwayWater);
      add("waterLevel", 100 - distance * 50);
    }
    if (hasNumbers(current.euroHomeProb, current.euroDrawProb, current.euroAwayProb, sample.euroHomeProb, sample.euroDrawProb, sample.euroAwayProb)) {
      const distance =
        Math.abs(current.euroHomeProb - sample.euroHomeProb) +
        Math.abs(current.euroDrawProb - sample.euroDrawProb) +
        Math.abs(current.euroAwayProb - sample.euroAwayProb);
      add("euroProb", 100 - distance * 100);
    }
    if (hasNumbers(current.consistencyScore, sample.consistencyScore)) {
      add("consistency", 100 - Math.abs(current.consistencyScore - sample.consistencyScore) * 10);
    }
    if (hasNumbers(current.riskScore, sample.riskScore)) {
      add("risk", 100 - Math.abs(current.riskScore - sample.riskScore));
    }
    if (current.finalGrade && sample.finalGrade) {
      const diff = Math.abs((gradeRank[current.finalGrade] || 1) - (gradeRank[sample.finalGrade] || 1));
      add("grade", diff === 0 ? 100 : diff === 1 ? 70 : diff === 2 ? 40 : 20);
    }
    const weightTotal = parts.reduce((sum, item) => sum + item.weight, 0);
    if (!weightTotal) return 0;
    return Math.round(parts.reduce((sum, item) => sum + item.score * item.weight, 0) / weightTotal);
  }

  function average(rows, getter) {
    const values = rows.map(getter).filter((item) => Number.isFinite(item));
    if (!values.length) return 0;
    return values.reduce((sum, item) => sum + item, 0) / values.length;
  }

  function rate(rows, predicate) {
    if (!rows.length) return 0;
    return rows.filter(predicate).length / rows.length;
  }

  function buildSimilarCaseStats(cases, current) {
    const sameRecommendation = cases.filter((item) => item.recommendationSide === current.recommendationSide);
    const sameGrade = cases.filter((item) => item.finalGrade === current.finalGrade);
    return {
      sampleCount: cases.length,
      homeWinRate: rate(cases, (item) => item.actualResult === "HOME"),
      drawRate: rate(cases, (item) => item.actualResult === "DRAW"),
      awayWinRate: rate(cases, (item) => item.actualResult === "AWAY"),
      avgGoals: average(cases, (item) => Number(item.actualGoals)),
      over25Rate: rate(cases, (item) => Number(item.actualGoals) > 2.5),
      under25Rate: rate(cases, (item) => Number(item.actualGoals) <= 2.5),
      sameRecommendationCount: sameRecommendation.length,
      sameRecommendationHitRate: rate(sameRecommendation, (item) => item.hitStatus === "WIN"),
      sameGradeCount: sameGrade.length,
      sameGradeHitRate: rate(sameGrade, (item) => item.hitStatus === "WIN"),
      avgRiskScore: average(cases, (item) => Number(item.riskScore)),
      avgConsistencyScore: average(cases, (item) => Number(item.consistencyScore)),
      upsetRate: rate(cases, (item) => ["C", "D"].includes(item.finalGrade) && item.hitStatus === "WIN"),
    };
  }

  function calculateConfidenceAdjustment(stats) {
    if (!stats || stats.sampleCount < 10) return 0;
    let value = 0;
    if (stats.sameRecommendationHitRate >= 0.58) value += 3;
    if (stats.sampleCount >= 30 && stats.sameRecommendationHitRate >= 0.62) value += 5;
    if (stats.sameRecommendationHitRate < 0.45) value -= 5;
    if (stats.drawRate >= 0.34) value -= 2;
    if (stats.upsetRate >= 0.3) value -= 3;
    return value;
  }

  function generateWarningFlags(stats, topCases) {
    const flags = [];
    if (!stats || stats.sampleCount < 5) flags.push("相似样本不足");
    if (stats?.sampleCount >= 10 && stats.sameRecommendationHitRate < 0.45) flags.push("当前推荐历史命中率偏低");
    if (stats?.drawRate >= 0.34) flags.push("历史平局率偏高，建议防平");
    if (stats?.upsetRate >= 0.3) flags.push("历史冷门率偏高");
    const topLose = topCases.filter((item) => item.hitStatus === "LOSE").length;
    const topWin = topCases.filter((item) => item.hitStatus === "WIN").length;
    if (topCases.length && topLose > topWin) flags.push("高相似案例失败较多");
    return flags;
  }

  function summaryText(stats, adjustment, flags) {
    if (!stats || stats.sampleCount < 5) {
      return `当前仅匹配到 ${stats?.sampleCount || 0} 场相似案例，样本量不足，只作为参考，不参与置信度修正。`;
    }
    const hitRate = (stats.sameRecommendationHitRate * 100).toFixed(1);
    const direction = adjustment > 0 ? "置信度小幅上调" : adjustment < 0 ? "置信度下调" : "置信度不调整";
    const warning = flags.length ? ` ${flags.join("；")}。` : "";
    return `匹配到 ${stats.sampleCount} 场相似案例，当前推荐在历史相似样本中的命中率为 ${hitRate}%，${direction}。${warning}`;
  }

  function keyReasons(current, sample) {
    const reasons = [];
    if (current.league === sample.league) reasons.push("赛事类型一致");
    if (current.finalGrade === sample.finalGrade) reasons.push("等级一致");
    if (current.recommendationSide === sample.recommendationSide) reasons.push("推荐方向一致");
    if (hasNumbers(current.riskScore, sample.riskScore) && Math.abs(current.riskScore - sample.riskScore) <= 10) reasons.push("风险分接近");
    return reasons.slice(0, 4);
  }

  function findSimilarCases(currentMatch, caseBase, options = {}) {
    const threshold = options.threshold ?? 65;
    const pool = (caseBase || [])
      .filter((item) => item.modelVersion === "V4")
      .filter((item) => String(item.matchId) !== String(currentMatch.matchId))
      .filter((item) => ["HIGH", "MEDIUM"].includes(item.dataQuality || "MEDIUM"))
      .map((item) => ({
        ...item,
        similarityScore: calculateSimilarity(currentMatch, item),
        keyReasons: keyReasons(currentMatch, item),
      }))
      .filter((item) => item.similarityScore >= threshold)
      .sort((a, b) => b.similarityScore - a.similarityScore);
    const samples = pool.slice(0, options.sampleLimit || 50);
    const topCases = samples.slice(0, options.topLimit || 5).map((item) => ({
      caseId: item.caseId,
      matchId: item.matchId,
      league: item.league,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      kickoffTime: item.kickoffTime,
      similarityScore: item.similarityScore,
      recommendation: item.recommendation,
      finalGrade: item.finalGrade,
      hitStatus: item.hitStatus,
      actualResult: item.actualResult,
      actualGoals: item.actualGoals,
      keyReasons: item.keyReasons,
    }));
    const stats = buildSimilarCaseStats(samples, currentMatch);
    const confidenceAdjustment = calculateConfidenceAdjustment(stats);
    const warningFlags = generateWarningFlags(stats, topCases);
    return {
      sampleCount: samples.length,
      topCases,
      stats,
      confidenceAdjustment,
      warningFlags,
      summaryText: summaryText(stats, confidenceAdjustment, warningFlags),
    };
  }

  return {
    calculateSimilarity,
    findSimilarCases,
    buildSimilarCaseStats,
    generateWarningFlags,
    calculateConfidenceAdjustment,
  };
})();
