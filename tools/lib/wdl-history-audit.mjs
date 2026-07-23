import {
  WDL_LABELS,
  normalizeWdlProbabilities,
  wdlLeader,
  wdlProbabilityMetrics,
} from "./wdl-calibrator.mjs";

function round(value, digits = 4) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
}

function distribution(rows = [], selector) {
  const total = rows.length || 1;
  return Object.fromEntries(WDL_LABELS.map((label) => [
    label,
    round(rows.filter((row) => selector(row) === label).length / total),
  ]));
}

export function aggregateWdl(rows = [], probabilityField = "modelProbabilities") {
  const valid = rows.filter((row) => normalizeWdlProbabilities(row?.[probabilityField]) && WDL_LABELS.includes(row.actual));
  const metrics = valid.map((row) => wdlProbabilityMetrics(row[probabilityField], row.actual));
  return {
    total: valid.length,
    hits: metrics.filter((metric) => metric.hit).length,
    hitRate: valid.length ? round(metrics.filter((metric) => metric.hit).length / valid.length) : null,
    averageBrier: valid.length ? round(metrics.reduce((sum, metric) => sum + metric.brier, 0) / valid.length) : null,
    averageLogLoss: valid.length ? round(metrics.reduce((sum, metric) => sum + metric.logLoss, 0) / valid.length) : null,
    averageProbabilities: Object.fromEntries(WDL_LABELS.map((label) => [
      label,
      valid.length ? round(valid.reduce((sum, row) => sum + normalizeWdlProbabilities(row[probabilityField])[label], 0) / valid.length) : null,
    ])),
    leaderDistribution: distribution(valid, (row) => wdlLeader(row[probabilityField])),
    actualDistribution: distribution(valid, (row) => row.actual),
  };
}

function groupedMetrics(rows = [], keySelector) {
  const keys = [...new Set(rows.map(keySelector).filter(Boolean))].sort();
  return Object.fromEntries(keys.map((key) => {
    const group = rows.filter((row) => keySelector(row) === key);
    return [key, {
      model: aggregateWdl(group, "modelProbabilities"),
      market: aggregateWdl(group, "marketProbabilities"),
    }];
  }));
}

function blendProbabilities(joint, market, jointWeight) {
  const left = normalizeWdlProbabilities(joint);
  const right = normalizeWdlProbabilities(market);
  if (!left || !right) return null;
  return normalizeWdlProbabilities(Object.fromEntries(WDL_LABELS.map((label) => [
    label,
    left[label] * jointWeight + right[label] * (1 - jointWeight),
  ])));
}

function meanLogLoss(rows = [], jointWeight) {
  const metrics = rows.map((row) => {
    const probabilities = blendProbabilities(
      row.probabilityComponents?.jointScoreModel,
      row.probabilityComponents?.marketCalibration,
      jointWeight,
    );
    return wdlProbabilityMetrics(probabilities, row.actual);
  }).filter(Boolean);
  return metrics.length
    ? metrics.reduce((sum, metric) => sum + metric.logLoss, 0) / metrics.length
    : Infinity;
}

export function rollingSourceBlendBacktest(rows = [], options = {}) {
  const ordered = rows
    .filter((row) => (
      row.probabilityComponents?.jointScoreModel
      && row.probabilityComponents?.marketCalibration
      && WDL_LABELS.includes(row.actual)
    ))
    .sort((left, right) => String(left.lockedAt).localeCompare(String(right.lockedAt)) || String(left.matchId).localeCompare(String(right.matchId)));
  const minimumTrain = Math.max(20, Number(options.minimumTrain || 40));
  const testBlock = Math.max(5, Number(options.testBlock || 10));
  const predictions = [];
  const fittedWeights = [];
  for (let start = minimumTrain; start < ordered.length; start += testBlock) {
    const train = ordered.slice(0, start);
    const test = ordered.slice(start, Math.min(ordered.length, start + testBlock));
    const candidates = Array.from({ length: 101 }, (_, index) => index / 100);
    const fitted = candidates
      .map((jointWeight) => ({ jointWeight, logLoss: meanLogLoss(train, jointWeight) }))
      .sort((left, right) => left.logLoss - right.logLoss || left.jointWeight - right.jointWeight)[0];
    fittedWeights.push({
      trainSamples: train.length,
      testSamples: test.length,
      jointWeight: fitted.jointWeight,
      marketWeight: round(1 - fitted.jointWeight),
      trainLogLoss: round(fitted.logLoss),
    });
    for (const sample of test) {
      predictions.push({
        ...sample,
        learnedBlend: blendProbabilities(
          sample.probabilityComponents.jointScoreModel,
          sample.probabilityComponents.marketCalibration,
          fitted.jointWeight,
        ),
        fixedCurrentBlend: blendProbabilities(
          sample.probabilityComponents.jointScoreModel,
          sample.probabilityComponents.marketCalibration,
          0.85,
        ),
      });
    }
  }
  return {
    eligibleSamples: ordered.length,
    outOfSampleSamples: predictions.length,
    minimumTrain,
    testBlock,
    fittedWeights,
    learnedBlend: aggregateWdl(predictions, "learnedBlend"),
    fixedCurrentBlend: aggregateWdl(predictions, "fixedCurrentBlend"),
    jointScoreModel: aggregateWdl(predictions.map((row) => ({
      ...row,
      jointScoreModel: row.probabilityComponents.jointScoreModel,
    })), "jointScoreModel"),
    marketCalibration: aggregateWdl(predictions.map((row) => ({
      ...row,
      marketCalibration: row.probabilityComponents.marketCalibration,
    })), "marketCalibration"),
  };
}

function sourceDecomposition(rows = []) {
  const comparable = rows.filter((row) => row.probabilityComponents);
  return {
    comparableSamples: comparable.length,
    jointScoreModel: aggregateWdl(comparable.map((row) => ({
      ...row,
      jointScoreModel: row.probabilityComponents?.jointScoreModel,
    })), "jointScoreModel"),
    marketCalibration: aggregateWdl(comparable.map((row) => ({
      ...row,
      marketCalibration: row.probabilityComponents?.marketCalibration,
    })), "marketCalibration"),
    blendedBaseline: aggregateWdl(comparable.map((row) => ({
      ...row,
      blendedBaseline: row.probabilityComponents?.blendedBaseline,
    })), "blendedBaseline"),
    postEvidenceModel: aggregateWdl(comparable.map((row) => ({
      ...row,
      postEvidenceModel: row.probabilityComponents?.postEvidenceModel,
    })), "postEvidenceModel"),
  };
}

export function buildLockedHistoryAudit(manifest = {}, options = {}) {
  const records = Array.isArray(manifest.records) ? manifest.records : [];
  const samples = Array.isArray(manifest.samples) ? manifest.samples : [];
  const modelMarketAgreement = samples.filter((row) => (
    wdlLeader(row.modelProbabilities) === wdlLeader(row.marketProbabilities)
  ));
  const modelMarketConflict = samples.filter((row) => (
    wdlLeader(row.modelProbabilities) !== wdlLeader(row.marketProbabilities)
  ));
  const decomposition = sourceDecomposition(samples);
  const rollingBlend = rollingSourceBlendBacktest(samples, options);
  const model = aggregateWdl(samples, "modelProbabilities");
  const market = aggregateWdl(samples, "marketProbabilities");
  const failureSignals = {
    storedModelDirectionBelowMarket: Number(model.hitRate) < Number(market.hitRate),
    storedModelBrierWorseThanMarket: Number(model.averageBrier) > Number(market.averageBrier),
    storedModelLogLossWorseThanMarket: Number(model.averageLogLoss) > Number(market.averageLogLoss),
    jointScoreSourceBelowMarket: Number(decomposition.jointScoreModel.hitRate) < Number(decomposition.marketCalibration.hitRate),
    fixed8515BlendBelowMarketOutOfSample: Number(rollingBlend.fixedCurrentBlend.hitRate) < Number(rollingBlend.marketCalibration.hitRate)
      || Number(rollingBlend.fixedCurrentBlend.averageLogLoss) > Number(rollingBlend.marketCalibration.averageLogLoss),
  };
  return {
    contractVersion: "WDL_LOCKED_HISTORY_AUDIT_V1",
    generatedAt: new Date().toISOString(),
    sampleBoundary: {
      auditedRecords: records.length,
      strictProbabilitySamples: samples.length,
      auditOnlyRecords: records.length - samples.length,
      exclusions: manifest.exclusions || {},
      policy: "UNIQUE_LATEST_MANUAL_LOCK_WITH_PREMATCH_TIMESTAMP_MODEL_PROBABILITIES_MARKET_PROBABILITIES_AND_90_MINUTE_RESULT",
    },
    overall: { model, market },
    agreement: {
      sameLeaderSamples: modelMarketAgreement.length,
      conflictSamples: modelMarketConflict.length,
      sameLeaderModel: aggregateWdl(modelMarketAgreement, "modelProbabilities"),
      conflictModel: aggregateWdl(modelMarketConflict, "modelProbabilities"),
      conflictMarket: aggregateWdl(modelMarketConflict, "marketProbabilities"),
    },
    byRevision: groupedMetrics(samples, (row) => row.modelRevision || "LEGACY_UNSPECIFIED"),
    byLeague: groupedMetrics(samples, (row) => row.league || "通用"),
    byLockType: groupedMetrics(samples, (row) => row.lockType || "UNKNOWN"),
    byGrade: groupedMetrics(samples, (row) => row.finalGrade || "UNSPECIFIED"),
    sourceDecomposition: decomposition,
    rollingSourceBlend: rollingBlend,
    failureSignals,
  };
}
