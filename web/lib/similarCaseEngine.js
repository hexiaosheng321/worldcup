window.WC_SIMILAR_CASE_ENGINE = (() => {
  const SIMILARITY_WEIGHTS = {
    league: 0.03,
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

  const competitionRules = [
    ["世界杯", /世界杯|World Cup/i],
    ["芬超", /芬超|Finland|Veikkausliiga/i],
    ["日职", /日职|J1|J联赛|Japan/i],
    ["韩职", /韩职|K联赛|K League/i],
    ["欧冠", /欧冠|Champions League/i],
    ["欧联", /欧联|Europa League/i],
    ["英超", /英超|Premier League/i],
    ["西甲", /西甲|La Liga/i],
    ["意甲", /意甲|Serie A/i],
    ["德甲", /德甲|Bundesliga/i],
    ["法甲", /法甲|Ligue 1/i],
  ];

  function normalizeCompetition(value = "") {
    const text = String(value || "").trim();
    const found = competitionRules.find(([, pattern]) => pattern.test(text));
    if (found) return found[0];
    return text || "未分类赛事";
  }

  function leagueScore(current, sample) {
    const left = normalizeCompetition(current.league);
    const right = normalizeCompetition(sample.league);
    if (left === right) return 100;
    return 0;
  }

  function sameCompetition(current, sample) {
    return normalizeCompetition(current.league) === normalizeCompetition(sample.league);
  }

  function formatScore(home, away) {
    if (!Number.isFinite(Number(home)) || !Number.isFinite(Number(away))) return "";
    return `${Number(home)}-${Number(away)}`;
  }

  function countBy(rows, getter, limit = 5) {
    const map = new Map();
    rows.forEach((row) => {
      const key = getter(row);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([label, count]) => ({ label, count, rate: rows.length ? count / rows.length : 0 }));
  }

  function handicapResult(item) {
    const home = Number(item.actualHomeGoals);
    const away = Number(item.actualAwayGoals);
    const line = Number(item.asianHandicap);
    if (![home, away, line].every(Number.isFinite)) return "";
    const adjusted = home + line - away;
    if (adjusted > 0) return "让胜";
    if (adjusted === 0) return "让平";
    return "让负";
  }

  function samplePolicy(sampleCount) {
    if (sampleCount >= 30) {
      return {
        level: "FULL",
        label: "可参与置信修正",
        note: "同赛事样本达到 30 场，允许进入最终置信修正。",
      };
    }
    if (sampleCount >= 10) {
      return {
        level: "RISK_ONLY",
        label: "仅做风险提示",
        note: "同赛事样本 10-29 场，只提示风险，不改最终置信。",
      };
    }
    return {
      level: "DISPLAY_ONLY",
      label: "只展示不修正",
      note: "同赛事样本不足 10 场，只展示，不参与最终判断。",
    };
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
    const policy = samplePolicy(cases.length);
    return {
      sampleCount: cases.length,
      competition: normalizeCompetition(current.league),
      samplePolicy: policy.level,
      samplePolicyLabel: policy.label,
      samplePolicyNote: policy.note,
      homeWinRate: rate(cases, (item) => item.actualResult === "HOME"),
      drawRate: rate(cases, (item) => item.actualResult === "DRAW"),
      awayWinRate: rate(cases, (item) => item.actualResult === "AWAY"),
      avgGoals: average(cases, (item) => Number(item.actualGoals)),
      totalGoalDistribution: countBy(cases, (item) => `${Number(item.actualGoals)}球`),
      commonScores: countBy(cases, (item) => formatScore(item.actualHomeGoals, item.actualAwayGoals)),
      handicapDistribution: countBy(cases, handicapResult),
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
    if (!stats || stats.sampleCount < 30) return 0;
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
    if (!stats || stats.sampleCount < 10) flags.push("同赛事样本不足，不参与修正");
    if (stats?.sampleCount >= 10 && stats.sampleCount < 30) flags.push("样本只做风险提示，不改置信");
    if (stats?.sampleCount >= 10 && stats.sameRecommendationHitRate < 0.45) flags.push("当前推荐历史命中率偏低");
    if (stats?.drawRate >= 0.34) flags.push("历史平局率偏高，建议防平");
    if (stats?.upsetRate >= 0.3) flags.push("历史冷门率偏高");
    const topLose = topCases.filter((item) => item.hitStatus === "LOSE").length;
    const topWin = topCases.filter((item) => item.hitStatus === "WIN").length;
    if (topCases.length && topLose > topWin) flags.push("高相似案例失败较多");
    return flags;
  }

  function summaryText(stats, adjustment, flags) {
    if (!stats || stats.sampleCount < 10) {
      return `当前仅在【${stats?.competition || "同赛事"}】匹配到 ${stats?.sampleCount || 0} 场相似案例，样本量不足，只展示，不参与置信度修正。`;
    }
    if (stats.sampleCount < 30) {
      const hitRate = (stats.sameRecommendationHitRate * 100).toFixed(1);
      const warning = flags.length ? ` ${flags.join("；")}。` : "";
      return `【${stats.competition}】同赛事匹配到 ${stats.sampleCount} 场，当前推荐历史命中率 ${hitRate}%，样本只做风险提示，不调整最终置信。${warning}`;
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
      .filter((item) => sameCompetition(currentMatch, item))
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
    normalizeCompetition,
    samplePolicy,
    findSimilarCases,
    buildSimilarCaseStats,
    generateWarningFlags,
    calculateConfidenceAdjustment,
  };
})();
