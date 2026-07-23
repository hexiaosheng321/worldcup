(function attachR15Backtest(global) {
  const MARKET_KEYS = ["winDrawLose", "handicap", "totalGoals", "scores"];
  const EMPTY_SELECTIONS = new Set(["", "-", "无", "跳过", "未开售", "待定"]);

  function revisionText(pred = {}) {
    pred = pred || {};
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

  function isR16Prediction(pred = {}) {
    return /(?:^|[^A-Z0-9])R1[67](?:[^A-Z0-9]|$)/i.test(revisionText(pred));
  }

  function isRevisionPrediction(pred = {}, revision = "R15") {
    return String(revision || "R15").toUpperCase() === "R16" ? isR16Prediction(pred) : isR15Prediction(pred);
  }

  function revisionLabel(pred = {}) {
    const text = revisionText(pred);
    if (/(?:^|[^A-Z0-9])R1[67](?:[^A-Z0-9]|$)/i.test(text)) return "R16";
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

  function candidateSelections(pred = {}) {
    const source = pred.candidateSelections || pred.unifiedRunEvidence?.candidateSelections || {};
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

  function nonScorePredictionAvailable(pred = {}) {
    const formal = formalSelections(pred);
    const candidates = candidateSelections(pred);
    return [
      formal.winDrawLose,
      formal.handicap,
      formal.totalGoals,
      candidates.winDrawLose,
      candidates.handicap,
      candidates.totalGoals,
      pred.pick,
      pred.recommendationSide,
      pred.handicapPick,
      pred.handicapRecommendation,
      pred.totalGoalsPick,
    ].some(usableSelection);
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

  function predictionSampleKey(pred = {}) {
    const direct = pred.matchId || pred.match_id || pred.fixtureId || pred.fixture_id || pred.unifiedRunEvidence?.matchId;
    if (direct) return String(direct).replace(/^sporttery-/, "");
    const date = inferenceDate(pred, pred.date || pred.matchDate || pred.ticaiDate || "");
    const home = pred.home || pred.homeTeam || pred.home_team || "";
    const away = pred.away || pred.awayTeam || pred.away_team || "";
    if (home && away) return `${date}|${home}|${away}`;
    return String(pred.lockId || pred.lock_id || "").trim();
  }

  function selectionHit(market, selection, actual = {}, actualTotal = Number(actual.total)) {
    if (market === "winDrawLose") return selection === actual.direction;
    if (market === "handicap") return selection === actual.handicap;
    if (market === "totalGoals") {
      const actualBucket = actualTotal >= 7 ? "7+" : String(actualTotal);
      return Number.isFinite(actualTotal) && totalGoalOptions(selection).includes(actualBucket);
    }
    if (market === "scores") return selection.map(normalizedScore).includes(normalizedScore(actual.score));
    return false;
  }

  function directionKey(value) {
    const text = String(value || "").trim().toUpperCase();
    if (["HOME", "H", "胜"].includes(text)) return "HOME";
    if (["DRAW", "D", "平"].includes(text)) return "DRAW";
    if (["AWAY", "A", "负"].includes(text)) return "AWAY";
    return "";
  }

  function probabilityAudit(pred = {}, actual = {}) {
    const evidence = pred.unifiedRunEvidence || {};
    const source = evidence.probabilities || evidence.featureSet?.probabilities || {};
    const raw = {
      HOME: Number(pred.modelHomeProb ?? pred.model_home_prob ?? source.HOME),
      DRAW: Number(pred.modelDrawProb ?? pred.model_draw_prob ?? source.DRAW),
      AWAY: Number(pred.modelAwayProb ?? pred.model_away_prob ?? source.AWAY),
    };
    const total = Object.values(raw).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const actualDirection = directionKey(actual.direction);
    if (!actualDirection || Object.values(raw).some((value) => !Number.isFinite(value) || value < 0) || total <= 0) return null;
    const probabilities = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / total]));
    const brierScore = Object.entries(probabilities).reduce((sum, [key, value]) => sum + (value - (key === actualDirection ? 1 : 0)) ** 2, 0);
    const logLoss = -Math.log(Math.max(1e-15, probabilities[actualDirection]));
    return { probabilities, actualDirection, brierScore, logLoss };
  }

  function evaluatePrediction(pred = {}, actual = {}, options = {}) {
    const formal = formalSelections(pred);
    const candidates = candidateSelections(pred);
    const availability = marketAvailability(pred);
    const components = componentRecommendations(pred);
    const verified = Boolean(actual.score);
    const actualTotal = Number(actual.total);
    const markets = {};

    MARKET_KEYS.forEach((market) => {
      const selection = formal[market];
      const candidateSelection = candidates[market];
      const available = availability[market] !== false;
      const qualified = isRevisionPrediction(pred, options.revision || "R15") && available && usableSelection(selection);
      const candidateQualified = isRevisionPrediction(pred, options.revision || "R15") && available && usableSelection(candidateSelection);
      let hit = null;
      if (qualified && verified) hit = selectionHit(market, selection, actual, actualTotal);
      const candidateHit = candidateQualified && verified ? selectionHit(market, candidateSelection, actual, actualTotal) : null;
      markets[market] = {
        selection,
        candidateSelection,
        available,
        qualified,
        candidateQualified,
        grade: components[market]?.grade || "-",
        hit,
        candidateHit,
      };
    });

    const hasFormal = MARKET_KEYS.some((market) => markets[market].qualified);
    return {
      sampleKey: predictionSampleKey(pred),
      revision: revisionLabel(pred),
      overallGrade: pred.unifiedRunEvidence?.overallGrade || pred.overallGrade || pred.finalGrade || "-",
      verified,
      hasFormal,
      markets,
      probabilityAudit: verified ? probabilityAudit(pred, actual) : null,
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
    const candidateMetrics = Object.fromEntries(MARKET_KEYS.map((market) => {
      const eligible = evaluations.filter((item) => item.verified && item.markets[market]?.candidateQualified);
      return [market, {
        hits: eligible.filter((item) => item.markets[market].candidateHit === true).length,
        total: eligible.length,
      }];
    }));
    const probabilityRows = evaluations.map((item) => item.probabilityAudit).filter(Boolean);
    return {
      totalRows: evaluations.length,
      verifiedMatches: evaluations.filter((item) => item.verified && item.hasFormal).length,
      pendingMatches: evaluations.filter((item) => !item.verified && item.hasFormal).length,
      observationOnly: evaluations.filter((item) => !item.hasFormal).length,
      metrics,
      candidateMetrics,
      probabilityMetrics: {
        total: probabilityRows.length,
        averageBrierScore: probabilityRows.length ? probabilityRows.reduce((sum, item) => sum + item.brierScore, 0) / probabilityRows.length : null,
        averageLogLoss: probabilityRows.length ? probabilityRows.reduce((sum, item) => sum + item.logLoss, 0) / probabilityRows.length : null,
      },
    };
  }

  function evaluationOutcome(evaluation = {}) {
    const formalMarkets = MARKET_KEYS.filter((market) => evaluation.markets?.[market]?.qualified);
    if (!formalMarkets.length) {
      return { status: "OBSERVE", formalMarkets, hitCount: 0, totalMarkets: 0, allHit: false };
    }
    if (!evaluation.verified) {
      return { status: "PENDING", formalMarkets, hitCount: 0, totalMarkets: formalMarkets.length, allHit: false };
    }
    const hitCount = formalMarkets.filter((market) => evaluation.markets[market].hit === true).length;
    const missCount = formalMarkets.filter((market) => evaluation.markets[market].hit === false).length;
    return {
      status: missCount === 0 ? "HIT" : hitCount > 0 ? "PARTIAL" : "MISS",
      formalMarkets,
      hitCount,
      totalMarkets: formalMarkets.length,
      allHit: missCount === 0,
    };
  }

  function inferenceDate(pred = {}, fallback = "") {
    const explicit = String(pred.inferenceDate || pred.reviewDate || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(explicit)) return explicit.slice(0, 10);
    const timestamp = pred.lockedAt || pred.generatedAt || pred.publishedAt || pred.createdAt || "";
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return new Date(parsed + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fallbackText = String(fallback || "").trim();
    return /^\d{4}-\d{2}-\d{2}/.test(fallbackText) ? fallbackText.slice(0, 10) : "未标日期";
  }

  function summarizeDaily(records = []) {
    const groups = new Map();
    records.forEach((record) => {
      const date = inferenceDate(record?.pred || record, record?.date);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(record);
    });
    return [...groups.entries()]
      .map(([date, rows]) => {
        const matches = rows
          .filter((row) => row.evaluation?.hasFormal)
          .map((row) => ({ ...row, outcome: evaluationOutcome(row.evaluation) }));
        const verifiedMatches = matches.filter((row) => row.evaluation?.verified);
        const hits = verifiedMatches.filter((row) => row.outcome.allHit).length;
        return {
          date,
          opened: rows.length,
          released: matches.length,
          verified: verifiedMatches.length,
          hits,
          partial: verifiedMatches.filter((row) => row.outcome.status === "PARTIAL").length,
          misses: verifiedMatches.filter((row) => row.outcome.status === "MISS").length,
          pending: matches.filter((row) => !row.evaluation?.verified).length,
          rate: verifiedMatches.length ? hits / verifiedMatches.length : null,
          matches,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function forwardProgress(evaluations = [], target = 30) {
    const settledKeys = new Set();
    evaluations.forEach((item, index) => {
      if (item.revision !== "R16" || !item.verified) return;
      settledKeys.add(item.sampleKey || `anonymous:${index}`);
    });
    const settled = settledKeys.size;
    return {
      cohort: "R16_FORWARD_30",
      settled,
      target,
      remaining: Math.max(0, target - settled),
      complete: settled >= target,
      status: settled >= target ? "READY_FOR_REVIEW" : "COLLECTING",
    };
  }

  global.WC_R15_BACKTEST = {
    MARKET_KEYS,
    isR15Prediction,
    isR16Prediction,
    isRevisionPrediction,
    revisionLabel,
    formalSelections,
    candidateSelections,
    componentRecommendations,
    marketAvailability,
    nonScorePredictionAvailable,
    predictionSampleKey,
    evaluatePrediction,
    evaluationOutcome,
    inferenceDate,
    summarize,
    summarizeDaily,
    forwardProgress,
    probabilityAudit,
  };
})(typeof window === "undefined" ? globalThis : window);
