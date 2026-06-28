window.WC_REVIEW_ENGINE = (() => {
  function evaluateLockedPrediction(lock, result) {
    if (!lock || !result) {
      return { hitStatus: "VOID", reviewText: "缺少锁版或赛果，暂不验票。" };
    }
    if (lock.finalAction === "跳过") {
      return { hitStatus: "VOID", reviewText: "该场锁版为跳过，不计胜负。" };
    }
    const side = lock.recommendationSide;
    let hitStatus = "LOSE";
    if (side === result.result1x2) hitStatus = "WIN";
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
        hitStatus = "WIN";
      }
    }
    if (side === "OVER" || side === "UNDER") {
      hitStatus = "VOID";
    }
    return {
      hitStatus,
      reviewText: hitStatus === "WIN" ? "赛前推荐命中。" : hitStatus === "LOSE" ? "赛前推荐未命中。" : "该推荐暂不计入胜负。",
    };
  }

  function generateCaseTags(lock, result, review) {
    const failureTags = [];
    const successTags = [];
    if (review.hitStatus === "LOSE" && lock.finalGrade === "A") failureTags.push("A级推荐失败");
    if (review.hitStatus === "LOSE" && lock.riskScore >= 65) failureTags.push("高风险推荐失败");
    if (review.hitStatus === "LOSE" && result.result1x2 === "DRAW" && lock.recommendationSide !== "DRAW") failureTags.push("平局漏防");
    if (review.hitStatus === "LOSE" && lock.dataQuality === "LOW") failureTags.push("数据质量低导致失败");
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
      actualGoals: result.totalGoals,
      hitStatus: review.hitStatus,
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
