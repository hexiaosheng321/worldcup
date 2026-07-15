window.WC_REVIEW_ENGINE = (() => {
  function evaluateLockedPrediction(lock, result) {
    if (!lock || !result) {
      return { hitStatus: "VOID", reviewText: "缺少锁版或赛果，暂不验票。" };
    }
    const side = lock.recommendationSide;
    let directionHit = side === result.result1x2;
    if (side === "DOUBLE") {
      const text = String(lock.recommendation || "");
      const coversHome = /主|胜|HOME/.test(text);
      const coversDraw = /平|DRAW/.test(text);
      const coversAway = /客|负|AWAY/.test(text);
      if (
        (result.result1x2 === "HOME" && coversHome) ||
        (result.result1x2 === "DRAW" && coversDraw) ||
        (result.result1x2 === "AWAY" && coversAway)
      ) {
        directionHit = true;
      }
    }
    const officialDirectionPick = ["HOME", "DRAW", "AWAY", "DOUBLE"].includes(side);
    const isSkipped = lock.finalAction === "跳过";
    const hitStatus = !isSkipped && officialDirectionPick ? (directionHit ? "WIN" : "LOSE") : "VOID";
    return {
      hitStatus,
      betOutcome: hitStatus,
      modelAudit: { directionHit: officialDirectionPick ? directionHit : null },
      reviewText: hitStatus === "WIN" ? "赛前推荐命中。" : hitStatus === "LOSE" ? "赛前推荐未命中。" : "跳过场不计正式胜负，模型方向继续影子验票。",
    };
  }

  function generateCaseTags(lock, result, review) {
    const failureTags = [];
    const successTags = [];
    if (review.hitStatus === "LOSE" && lock.finalGrade === "A") failureTags.push("A级推荐失败");
    if (review.hitStatus === "LOSE" && lock.riskScore >= 65) failureTags.push("高风险推荐失败");
    if (review.hitStatus === "LOSE" && result.result1x2 === "DRAW" && lock.recommendationSide !== "DRAW") failureTags.push("平局漏防");
    if (review.hitStatus === "LOSE" && lock.dataQuality === "LOW") failureTags.push("数据质量低导致失败");
    if (review.hitStatus === "VOID" && review.modelAudit?.directionHit === false) failureTags.push("跳过场方向影子验票失败");
    if (review.hitStatus === "WIN" && Number(lock.consistencyScore) >= 4) successTags.push("欧亚一致命中");
    if (review.hitStatus === "WIN" && Number(lock.riskScore) <= 30) successTags.push("低风险命中");
    if (review.hitStatus === "WIN" && lock.finalGrade === "A") successTags.push("A级推荐命中");
    if (review.hitStatus === "WIN" && lock.recommendationSide === "HOME") successTags.push("主胜价值命中");
    return { failureTags, successTags };
  }

  function generateCaseFromLock(lock, result, review) {
    if (!lock || !result || !review) return null;
    if (lock.lockType !== "FINAL_LOCK") return null;
    if (lock.resultStatus === "PENDING") return null;
    const tags = generateCaseTags(lock, result, review);
    return {
      caseId: `case-${lock.lockId}`,
      sourceLockId: lock.lockId,
      matchId: lock.matchId,
      league: lock.league,
      homeTeam: lock.homeTeam,
      awayTeam: lock.awayTeam,
      kickoffTime: lock.kickoffTime,
      modelVersion: "V4",
      modelHomeProb: lock.modelHomeProb,
      modelDrawProb: lock.modelDrawProb,
      modelAwayProb: lock.modelAwayProb,
      recommendation: lock.recommendation,
      recommendationSide: lock.recommendationSide,
      finalGrade: lock.finalGrade,
      finalAction: lock.finalAction,
      confidenceScore: lock.confidenceScore,
      riskScore: lock.riskScore,
      consistencyScore: lock.consistencyScore,
      sportteryHomeSp: lock.sportteryHomeSp,
      sportteryDrawSp: lock.sportteryDrawSp,
      sportteryAwaySp: lock.sportteryAwaySp,
      sportteryHomeProb: lock.sportteryHomeProb,
      sportteryDrawProb: lock.sportteryDrawProb,
      sportteryAwayProb: lock.sportteryAwayProb,
      valueHomeGap: lock.valueHomeGap,
      valueDrawGap: lock.valueDrawGap,
      valueAwayGap: lock.valueAwayGap,
      asianHandicap: lock.asianHandicap,
      asianHomeWater: lock.asianHomeWater,
      asianAwayWater: lock.asianAwayWater,
      euroHomeOdds: lock.euroHomeOdds,
      euroDrawOdds: lock.euroDrawOdds,
      euroAwayOdds: lock.euroAwayOdds,
      euroHomeProb: lock.euroHomeProb,
      euroDrawProb: lock.euroDrawProb,
      euroAwayProb: lock.euroAwayProb,
      dataQuality: lock.dataQuality,
      actualResult: result.result1x2,
      actualHomeGoals: result.fullTimeHomeGoals,
      actualAwayGoals: result.fullTimeAwayGoals,
      actualGoals: result.totalGoals,
      hitStatus: review.hitStatus,
      betOutcome: review.betOutcome || review.hitStatus,
      modelAudit: review.modelAudit || null,
      failureTags: tags.failureTags,
      successTags: tags.successTags,
      createdAt: result.reviewedAt || new Date().toISOString(),
    };
  }

  return {
    evaluateLockedPrediction,
    generateCaseFromLock,
    generateCaseTags,
  };
})();
