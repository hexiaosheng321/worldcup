(function attachR15Backtest(global) {
  const MARKET_KEYS = ["winDrawLose", "handicap", "totalGoals", "scores"];
  const EMPTY_SELECTIONS = new Set(["", "-", "无", "跳过", "未开售", "待定"]);

  function revisionText(pred = {}) {
    return [
      pred.modelRevision,
      pred.unifiedRunEvidence?.modelRevision,
      pred.unifiedRunEvidence?.modelLessons?.version,
      pred.lockId,
      pred.type,
    ].filter(Boolean).join(" ");
  }

  function isR15Prediction(pred = {}) {
    return /(?:^|[^A-Z0-9])R15A?(?:[^A-Z0-9]|$)/i.test(revisionText(pred));
  }

  function revisionLabel(pred = {}) {
    const text = revisionText(pred);
    if (/(?:^|[^A-Z0-9])R15A(?:[^A-Z0-9]|$)/i.test(text)) return "R15a";
    return isR15Prediction(pred) ? "R15" : "-";
  }

  function formalSelections(pred = {}) {
    const source = pred.formalSelections || pred.unifiedRunEvidence?.formalSelections || {};
    return {
      winDrawLose: source.winDrawLose || null,
      handicap: source.handicap || null,
      totalGoals: source.totalGoals || null,
      scores: Array.isArray(source.scores)
        ? source.scores.filter(Boolean)
        : String(source.scores || "").split(/\s*[\/、,，]\s*/).filter(Boolean),
    };
  }

  function componentRecommendations(pred = {}) {
    return pred.componentRecommendations || pred.unifiedRunEvidence?.componentRecommendations || {};
  }

  function marketAvailability(pred = {}) {
    const source = pred.marketAvailability || pred.unifiedRunEvidence?.marketAvailability || {};
    return source.markets || source;
  }

  function usableSelection(value) {
    if (Array.isArray(value)) return value.some((item) => !EMPTY_SELECTIONS.has(String(item || "").trim()));
    return !EMPTY_SELECTIONS.has(String(value || "").trim());
  }

  function normalizedScore(value) {
    return String(value || "").trim().replace(":", "-");
  }

  function totalGoalOptions(value) {
    return String(value || "")
      .replace(/球/g, "")
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function evaluatePrediction(pred = {}, actual = {}) {
    const formal = formalSelections(pred);
    const availability = marketAvailability(pred);
    const components = componentRecommendations(pred);
    const verified = Boolean(actual.score);
    const actualTotal = Number(actual.total);
    const markets = {};

    MARKET_KEYS.forEach((market) => {
      const selection = formal[market];
      const available = availability[market] !== false;
      const qualified = isR15Prediction(pred) && available && usableSelection(selection);
      let hit = null;
      if (qualified && verified) {
        if (market === "winDrawLose") hit = selection === actual.direction;
        if (market === "handicap") hit = selection === actual.handicap;
        if (market === "totalGoals") {
          const actualBucket = actualTotal >= 7 ? "7+" : String(actualTotal);
          hit = Number.isFinite(actualTotal) && totalGoalOptions(selection).includes(actualBucket);
        }
        if (market === "scores") {
          hit = selection.map(normalizedScore).includes(normalizedScore(actual.score));
        }
      }
      markets[market] = {
        selection,
        available,
        qualified,
        grade: components[market]?.grade || "-",
        hit,
      };
    });

    const hasFormal = MARKET_KEYS.some((market) => markets[market].qualified);
    return {
      revision: revisionLabel(pred),
      overallGrade: pred.unifiedRunEvidence?.overallGrade || pred.overallGrade || pred.finalGrade || "-",
      verified,
      hasFormal,
      markets,
    };
  }

  function summarize(evaluations = []) {
    const metrics = Object.fromEntries(MARKET_KEYS.map((market) => {
      const eligible = evaluations.filter((item) => item.verified && item.markets[market]?.qualified);
      const hits = eligible.filter((item) => item.markets[market].hit === true).length;
      const grades = Object.fromEntries(["A", "B", "C", "D"].map((grade) => {
        const rows = eligible.filter((item) => item.markets[market].grade === grade);
        return [grade, { hits: rows.filter((item) => item.markets[market].hit === true).length, total: rows.length }];
      }));
      return [market, { hits, total: eligible.length, grades }];
    }));
    return {
      totalRows: evaluations.length,
      verifiedMatches: evaluations.filter((item) => item.verified && item.hasFormal).length,
      pendingMatches: evaluations.filter((item) => !item.verified && item.hasFormal).length,
      observationOnly: evaluations.filter((item) => !item.hasFormal).length,
      metrics,
    };
  }

  global.WC_R15_BACKTEST = {
    MARKET_KEYS,
    isR15Prediction,
    revisionLabel,
    formalSelections,
    componentRecommendations,
    marketAvailability,
    evaluatePrediction,
    summarize,
  };
})(typeof window === "undefined" ? globalThis : window);
