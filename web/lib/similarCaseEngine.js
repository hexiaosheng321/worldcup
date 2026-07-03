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
    ["女足世界杯", /女足世界杯|World Cup - Women|Women's World Cup|Women World Cup/i],
    ["世界杯", /世界杯|World Cup/i],
    ["芬超", /芬超|Finland|Veikkausliiga/i],
    ["日职", /日职|J1|J联赛|Japan/i],
    ["韩职", /韩职|K联赛|K League/i],
    ["欧冠", /欧冠|Champions League/i],
    ["欧联", /欧联|Europa League/i],
    ["瑞超", /瑞超|Allsvenskan|Sweden/i],
    ["挪超", /挪超|Eliteserien|Norway/i],
    ["丹超", /丹超|Superliga|Denmark/i],
    ["英超", /英超|Premier League/i],
    ["西甲", /西甲|La Liga/i],
    ["意甲", /意甲|Serie A/i],
    ["德甲", /德甲|Bundesliga/i],
    ["法甲", /法甲|Ligue 1/i],
    ["荷甲", /荷甲|Eredivisie|Netherlands/i],
    ["葡超", /葡超|Primeira Liga|Portugal/i],
    ["美职", /美职|MLS|Major League Soccer/i],
    ["澳超", /澳超|A-League|Australia/i],
    ["中超", /中超|Chinese Super League|China Super League/i],
    ["亚冠精英", /亚冠精英|AFC Champions League Elite/i],
    ["亚冠二级", /亚冠二级|AFC Champions League Two/i],
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

  function isExternalSample(item) {
    return item?.sampleType === "external-history" || item?.modelVersion === "EXTERNAL_HISTORY";
  }

  function externalSampleLabel(item) {
    if (!isExternalSample(item)) return "";
    const hasOdds = hasNumbers(item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp) || hasNumbers(item.euroHomeOdds, item.euroDrawOdds, item.euroAwayOdds);
    return hasOdds ? "外部历史赔率样本" : "外部历史赛果样本";
  }

  function loadExternalSamples() {
    return Array.isArray(window.WC_EXTERNAL_HISTORICAL_SAMPLES) ? window.WC_EXTERNAL_HISTORICAL_SAMPLES : [];
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
    const lockedCases = cases.filter((item) => !isExternalSample(item));
    const externalCases = cases.filter(isExternalSample);
    const sameRecommendation = lockedCases.filter((item) => item.recommendationSide === current.recommendationSide);
    const sameGrade = lockedCases.filter((item) => item.finalGrade === current.finalGrade);
    const policy = samplePolicy(cases.length);
    const policyLabel =
      lockedCases.length >= 30
        ? policy.label
        : externalCases.length >= 30
          ? "参与分布校验"
          : policy.label;
    const policyNote =
      lockedCases.length >= 30
        ? policy.note
        : externalCases.length >= 30
          ? "外部历史样本达到 30 场，可参与赛果、进球、比分分布校验，但不直接修正模型命中率。"
          : policy.note;
    return {
      sampleCount: cases.length,
      lockedSampleCount: lockedCases.length,
      externalSampleCount: externalCases.length,
      competition: normalizeCompetition(current.league),
      samplePolicy: policy.level,
      samplePolicyLabel: policyLabel,
      samplePolicyNote: policyNote,
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
      marketFavoriteHitRate: rate(externalCases, (item) => item.hitStatus === "WIN"),
      sameGradeCount: sameGrade.length,
      sameGradeHitRate: rate(sameGrade, (item) => item.hitStatus === "WIN"),
      avgRiskScore: average(cases, (item) => Number(item.riskScore)),
      avgConsistencyScore: average(cases, (item) => Number(item.consistencyScore)),
      upsetRate: rate(lockedCases, (item) => ["C", "D"].includes(item.finalGrade) && item.hitStatus === "WIN"),
    };
  }

  function calculateConfidenceAdjustment(stats) {
    if (!stats || stats.lockedSampleCount < 30) return 0;
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
    if (stats?.sampleCount >= 10 && stats.lockedSampleCount < 30) flags.push("锁版样本不足，不改模型置信");
    if (stats?.lockedSampleCount >= 10 && stats.sameRecommendationHitRate < 0.45) flags.push("当前推荐历史命中率偏低");
    if (stats?.drawRate >= 0.34) flags.push("历史平局率偏高，建议防平");
    if (stats?.upsetRate >= 0.3) flags.push("历史冷门率偏高");
    const topLocked = topCases.filter((item) => item.sampleType !== "外部历史");
    const topLose = topLocked.filter((item) => item.hitStatus === "LOSE").length;
    const topWin = topLocked.filter((item) => item.hitStatus === "WIN").length;
    if (topCases.length && topLose > topWin) flags.push("高相似案例失败较多");
    return flags;
  }

  function summaryText(stats, adjustment, flags) {
    if (!stats || stats.sampleCount < 10) {
      return `当前仅在【${stats?.competition || "同赛事"}】匹配到 ${stats?.sampleCount || 0} 场相似案例，样本量不足，只展示，不参与置信度修正。`;
    }
    if (stats.lockedSampleCount < 30) {
      const hitRate = (stats.sameRecommendationHitRate * 100).toFixed(1);
      const warning = flags.length ? ` ${flags.join("；")}。` : "";
      return `【${stats.competition}】同赛事匹配到 ${stats.sampleCount} 场，其中锁版案例 ${stats.lockedSampleCount} 场、外部历史样本 ${stats.externalSampleCount} 场。外部样本参与赛果、进球和比分分布校验；锁版样本不足 30 场，暂不调整模型置信。当前推荐锁版命中率 ${hitRate}%。${warning}`;
    }
    const hitRate = (stats.sameRecommendationHitRate * 100).toFixed(1);
    const direction = adjustment > 0 ? "置信度小幅上调" : adjustment < 0 ? "置信度下调" : "置信度不调整";
    const warning = flags.length ? ` ${flags.join("；")}。` : "";
    return `匹配到 ${stats.sampleCount} 场相似案例，当前推荐在历史相似样本中的命中率为 ${hitRate}%，${direction}。${warning}`;
  }

  function keyReasons(current, sample) {
    const reasons = [];
    if (sameCompetition(current, sample)) reasons.push("赛事类型一致");
    if (isExternalSample(sample)) reasons.push(externalSampleLabel(sample));
    if (current.finalGrade === sample.finalGrade) reasons.push("等级一致");
    if (current.recommendationSide === sample.recommendationSide) reasons.push("推荐方向一致");
    if (hasNumbers(current.sportteryHomeSp, sample.sportteryHomeSp, current.sportteryDrawSp, sample.sportteryDrawSp, current.sportteryAwaySp, sample.sportteryAwaySp)) {
      reasons.push("胜平负赔率接近");
    }
    if (hasNumbers(current.riskScore, sample.riskScore) && Math.abs(current.riskScore - sample.riskScore) <= 10) reasons.push("风险分接近");
    return reasons.slice(0, 4);
  }

  function findSimilarCases(currentMatch, caseBase, options = {}) {
    const threshold = options.threshold ?? 65;
    const externalSamples = options.externalSamples || loadExternalSamples();
    const combinedSamples = [...(caseBase || []), ...externalSamples];
    const pool = combinedSamples
      .filter((item) => item.modelVersion === "V4" || isExternalSample(item))
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
      sampleType: isExternalSample(item) ? "外部历史" : "锁版案例",
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      kickoffTime: item.kickoffTime,
      similarityScore: item.similarityScore,
      recommendation: item.recommendation,
      finalGrade: item.finalGrade,
      hitStatus: item.hitStatus,
      sportteryHomeSp: item.sportteryHomeSp,
      sportteryDrawSp: item.sportteryDrawSp,
      sportteryAwaySp: item.sportteryAwaySp,
      euroHomeOdds: item.euroHomeOdds,
      euroDrawOdds: item.euroDrawOdds,
      euroAwayOdds: item.euroAwayOdds,
      asianHandicap: item.asianHandicap,
      over25Odds: item.over25Odds,
      under25Odds: item.under25Odds,
      actualResult: item.actualResult,
      actualHomeGoals: item.actualHomeGoals,
      actualAwayGoals: item.actualAwayGoals,
      actualGoals: item.actualGoals,
      score: item.score || formatScore(item.actualHomeGoals, item.actualAwayGoals),
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
