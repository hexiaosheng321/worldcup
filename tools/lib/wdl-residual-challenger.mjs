import { WDL_LABELS, normalizeWdlProbabilities, wdlLeader, wdlProbabilityMetrics } from "./wdl-calibrator.mjs";

function marginBin(probabilities = {}) {
  const ranked = WDL_LABELS.map((label) => Number(probabilities[label] || 0)).sort((a, b) => b - a);
  const margin = ranked[0] - ranked[1];
  if (margin <= 0.06) return "CLOSE_0_06";
  if (margin <= 0.15) return "MEDIUM_0_15";
  return "STRONG_OVER_0_15";
}

function patternFor(sample = {}) {
  const market = normalizeWdlProbabilities(sample.marketProbabilities);
  const model = normalizeWdlProbabilities(sample.modelProbabilities);
  if (!market || !model) return null;
  const marketLeader = wdlLeader(market);
  const modelLeader = wdlLeader(model);
  return {
    market,
    model,
    marketLeader,
    modelLeader,
    disagreement: marketLeader !== modelLeader,
    key: `${marketLeader}_TO_${modelLeader}|${marginBin(market)}`,
  };
}

function emptyStats() {
  return { sampleCount: 0, marketHits: 0, modelHits: 0, bothMissed: 0, delta: 0 };
}

function addStats(target, sample, pattern) {
  target.sampleCount += 1;
  target.marketHits += Number(pattern.marketLeader === sample.actual);
  target.modelHits += Number(pattern.modelLeader === sample.actual);
  target.bothMissed += Number(pattern.marketLeader !== sample.actual && pattern.modelLeader !== sample.actual);
  target.delta = target.modelHits - target.marketHits;
}

function summarize(rows = []) {
  const overall = emptyStats();
  const patterns = {};
  for (const sample of rows) {
    const pattern = patternFor(sample);
    if (!pattern?.disagreement || !WDL_LABELS.includes(sample.actual)) continue;
    patterns[pattern.key] ||= emptyStats();
    addStats(overall, sample, pattern);
    addStats(patterns[pattern.key], sample, pattern);
  }
  return { overall, patterns };
}

function enrichProfiles(summary, priorEdge = 0, priorStrength = 12) {
  return Object.fromEntries(Object.entries(summary.patterns).map(([key, stats]) => {
    const edge = (stats.delta + priorStrength * priorEdge) / (stats.sampleCount + priorStrength);
    return [key, { ...stats, rawEdge: stats.sampleCount ? stats.delta / stats.sampleCount : 0, shrunkModelEdge: edge }];
  }));
}

export function trainWdlResidualChallenger(samples = [], options = {}) {
  const globalPriorStrength = Math.max(1, Number(options.globalPriorStrength || 12));
  const leagueShrinkage = Math.max(1, Number(options.leagueShrinkage || 16));
  const globalSummary = summarize(samples);
  const globalEdge = globalSummary.overall.sampleCount
    ? globalSummary.overall.delta / globalSummary.overall.sampleCount
    : 0;
  const globalProfiles = enrichProfiles(globalSummary, globalEdge, globalPriorStrength);
  const leagues = [...new Set(samples.map((sample) => String(sample.league || "通用")))].sort();
  const leagueProfiles = Object.fromEntries(leagues.map((league) => {
    const summary = summarize(samples.filter((sample) => String(sample.league || "通用") === league));
    const patterns = Object.fromEntries(Object.entries(summary.patterns).map(([key, stats]) => {
      const parentEdge = globalProfiles[key]?.shrunkModelEdge ?? globalEdge;
      return [key, {
        ...stats,
        rawEdge: stats.sampleCount ? stats.delta / stats.sampleCount : 0,
        shrunkModelEdge: (stats.delta + leagueShrinkage * parentEdge) / (stats.sampleCount + leagueShrinkage),
        parentEdge,
      }];
    }));
    return [league, { disagreementSampleCount: summary.overall.sampleCount, patterns }];
  }));
  return {
    contractVersion: "WDL_R18_MARKET_RESIDUAL_SELECTOR_V1",
    sampleCount: samples.length,
    globalPriorStrength,
    leagueShrinkage,
    minimumPatternSupport: Math.max(4, Number(options.minimumPatternSupport || 8)),
    minimumModelEdge: Math.max(0.01, Number(options.minimumModelEdge || 0.08)),
    globalDisagreement: { ...globalSummary.overall, rawModelEdge: globalEdge },
    globalProfiles,
    leagueProfiles,
  };
}

export function predictWdlResidualChallenger(sample = {}, artifact = {}) {
  const pattern = patternFor(sample);
  if (!pattern) return { applied: false, reason: "COMPARABLE_PROBABILITIES_UNAVAILABLE", probabilities: null, selection: "" };
  if (!pattern.disagreement) {
    return {
      applied: true,
      reason: "MODEL_MARKET_AGREE",
      selection: pattern.marketLeader,
      source: "AGREEMENT_MARKET_PROBABILITIES",
      probabilities: pattern.market,
      patternKey: pattern.key,
      override: false,
    };
  }
  const league = String(sample.league || "通用");
  const globalProfile = artifact.globalProfiles?.[pattern.key];
  const leagueProfile = artifact.leagueProfiles?.[league]?.patterns?.[pattern.key];
  const support = Number(globalProfile?.sampleCount || 0);
  const leagueSupport = Number(leagueProfile?.sampleCount || 0);
  const edge = Number(leagueProfile?.shrunkModelEdge ?? globalProfile?.shrunkModelEdge ?? artifact.globalDisagreement?.rawModelEdge ?? 0);
  const evidenceSufficient = support >= Number(artifact.minimumPatternSupport || 8);
  const override = evidenceSufficient && edge >= Number(artifact.minimumModelEdge || 0.08);
  return {
    applied: true,
    reason: override ? "HISTORICAL_RESIDUAL_SUPPORTS_MODEL_OVERRIDE" : evidenceSufficient ? "HISTORICAL_RESIDUAL_FAVOURS_MARKET" : "INSUFFICIENT_PATTERN_SUPPORT_KEEP_MARKET",
    selection: override ? pattern.modelLeader : pattern.marketLeader,
    source: override ? "R16_MODEL_PROBABILITIES" : "MARKET_PROBABILITIES",
    probabilities: override ? pattern.model : pattern.market,
    marketLeader: pattern.marketLeader,
    modelLeader: pattern.modelLeader,
    patternKey: pattern.key,
    globalSupport: support,
    leagueSupport,
    shrunkModelEdge: edge,
    override,
  };
}

function aggregatePredictions(rows = [], field = "r18") {
  const valid = rows.filter((row) => row[field]?.probabilities && WDL_LABELS.includes(row.sample.actual));
  const metrics = valid.map((row) => wdlProbabilityMetrics(row[field].probabilities, row.sample.actual));
  return {
    hits: metrics.filter((metric) => metric.hit).length,
    total: metrics.length,
    hitRate: metrics.length ? metrics.filter((metric) => metric.hit).length / metrics.length : null,
    averageBrier: metrics.length ? metrics.reduce((sum, metric) => sum + metric.brier, 0) / metrics.length : null,
    averageLogLoss: metrics.length ? metrics.reduce((sum, metric) => sum + metric.logLoss, 0) / metrics.length : null,
  };
}

export function rollingWdlResidualBacktest(samples = [], options = {}) {
  const ordered = [...samples].sort((left, right) => String(left.lockedAt).localeCompare(String(right.lockedAt)) || String(left.matchId).localeCompare(String(right.matchId)));
  const minimumTrain = Math.max(30, Number(options.minimumTrain || 40));
  const testBlock = Math.max(5, Number(options.testBlock || 12));
  const predictions = [];
  for (let start = minimumTrain; start < ordered.length; start += testBlock) {
    const artifact = trainWdlResidualChallenger(ordered.slice(0, start), options);
    for (const sample of ordered.slice(start, Math.min(ordered.length, start + testBlock))) {
      predictions.push({
        sample,
        r18: predictWdlResidualChallenger(sample, artifact),
        champion: { probabilities: normalizeWdlProbabilities(sample.modelProbabilities) },
        market: { probabilities: normalizeWdlProbabilities(sample.marketProbabilities) },
      });
    }
  }
  const overall = {
    champion: aggregatePredictions(predictions, "champion"),
    market: aggregatePredictions(predictions, "market"),
    challenger: aggregatePredictions(predictions, "r18"),
    overrides: predictions.filter((row) => row.r18.override).length,
  };
  const leagues = [...new Set(predictions.map((row) => row.sample.league))].sort();
  const byLeague = Object.fromEntries(leagues.map((league) => {
    const rows = predictions.filter((row) => row.sample.league === league);
    return [league, {
      champion: aggregatePredictions(rows, "champion"),
      market: aggregatePredictions(rows, "market"),
      challenger: aggregatePredictions(rows, "r18"),
      overrides: rows.filter((row) => row.r18.override).length,
    }];
  }));
  return { minimumTrain, testBlock, predictions, overall, byLeague };
}

export function finalizeWdlResidualArtifact(samples = [], backtest = {}, options = {}) {
  const artifact = trainWdlResidualChallenger(samples, options);
  const overall = backtest.overall || {};
  return {
    ...artifact,
    status: "CHALLENGER",
    automaticPromotion: false,
    promotionDecision: "FORWARD_VALIDATION_REQUIRED",
    validationMethod: "EXPANDING_WINDOW_OUT_OF_SAMPLE_THEN_30_TO_50_FORWARD_SAME_INPUT_PAIRS",
    validation: overall,
    researchChecks: {
      sufficientOutOfSampleSize: Number(overall.challenger?.total || 0) >= 50,
      directionBeatsChampion: Number(overall.challenger?.hitRate || 0) > Number(overall.champion?.hitRate || 0),
      brierNotDegraded: Number(overall.challenger?.averageBrier || Infinity) <= Number(overall.champion?.averageBrier || Infinity),
      logLossNotDegraded: Number(overall.challenger?.averageLogLoss || Infinity) <= Number(overall.champion?.averageLogLoss || Infinity),
    },
  };
}
