export const WDL_LABELS = Object.freeze(["HOME", "DRAW", "AWAY"]);
const EPSILON = 1e-12;

export function normalizeWdlProbabilities(source = {}) {
  const values = WDL_LABELS.map((label) => Math.max(0, Number(source?.[label]) || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  return Object.fromEntries(WDL_LABELS.map((label, index) => [label, values[index] / total]));
}

export function wdlLeader(source = {}) {
  const probabilities = normalizeWdlProbabilities(source);
  if (!probabilities) return "";
  return WDL_LABELS.reduce((best, label) => probabilities[label] > probabilities[best] ? label : best, "HOME");
}

export function temperatureScaleWdl(source = {}, temperature = 1) {
  const probabilities = normalizeWdlProbabilities(source);
  const safeTemperature = Math.max(0.25, Math.min(4, Number(temperature) || 1));
  if (!probabilities) return null;
  const powered = Object.fromEntries(WDL_LABELS.map((label) => [label, Math.max(EPSILON, probabilities[label]) ** (1 / safeTemperature)]));
  return normalizeWdlProbabilities(powered);
}

export function wdlProbabilityMetrics(source = {}, actual = "") {
  const probabilities = normalizeWdlProbabilities(source);
  if (!probabilities || !WDL_LABELS.includes(actual)) return null;
  return {
    hit: wdlLeader(probabilities) === actual,
    brier: WDL_LABELS.reduce((sum, label) => sum + (probabilities[label] - Number(label === actual)) ** 2, 0),
    logLoss: -Math.log(Math.max(EPSILON, probabilities[actual])),
  };
}

function aggregate(rows = [], probabilityField = "probabilities", selectionField = "selection") {
  const valid = rows.filter((row) => row[probabilityField] && WDL_LABELS.includes(row.actual));
  const metrics = valid.map((row) => wdlProbabilityMetrics(row[probabilityField], row.actual));
  const hits = valid.filter((row) => row[selectionField] === row.actual).length;
  return {
    hits,
    total: valid.length,
    hitRate: valid.length ? hits / valid.length : null,
    averageBrier: valid.length ? metrics.reduce((sum, item) => sum + item.brier, 0) / valid.length : null,
    averageLogLoss: valid.length ? metrics.reduce((sum, item) => sum + item.logLoss, 0) / valid.length : null,
  };
}

function temperatureCandidates() {
  return Array.from({ length: 151 }, (_, index) => Number((0.5 + index * 0.01).toFixed(2)));
}

function fitTemperature(samples = [], probabilityField = "marketProbabilities") {
  const eligible = samples.filter((sample) => sample[probabilityField] && WDL_LABELS.includes(sample.actual));
  if (!eligible.length) return 1;
  return temperatureCandidates().map((temperature) => {
    const logLoss = eligible.reduce((sum, sample) => sum + wdlProbabilityMetrics(temperatureScaleWdl(sample[probabilityField], temperature), sample.actual).logLoss, 0) / eligible.length;
    return { temperature, logLoss };
  }).sort((left, right) => left.logLoss - right.logLoss || Math.abs(left.temperature - 1) - Math.abs(right.temperature - 1))[0].temperature;
}

export function trainWdlTemperatureCalibration(samples = [], options = {}) {
  const probabilityField = options.probabilityField || "marketProbabilities";
  const shrinkage = Math.max(1, Number(options.leagueShrinkage || 50));
  const globalTemperature = fitTemperature(samples, probabilityField);
  const leagues = [...new Set(samples.map((sample) => String(sample.league || "通用")))].sort();
  const leagueProfiles = Object.fromEntries(leagues.map((league) => {
    const rows = samples.filter((sample) => String(sample.league || "通用") === league);
    const rawTemperature = fitTemperature(rows, probabilityField);
    const weight = rows.length / (rows.length + shrinkage);
    const temperature = globalTemperature + weight * (rawTemperature - globalTemperature);
    return [league, { sampleCount: rows.length, rawTemperature, shrinkageWeight: weight, temperature }];
  }));
  return {
    contractVersion: "WDL_MARKET_TEMPERATURE_LEAGUE_SHRINKAGE_V1",
    probabilityField,
    sampleCount: samples.length,
    globalTemperature,
    leagueShrinkage: shrinkage,
    leagueProfiles,
  };
}

export function predictWdlTemperature(sample = {}, artifact = {}, options = {}) {
  const probabilityField = artifact.probabilityField || "marketProbabilities";
  const source = normalizeWdlProbabilities(sample[probabilityField]);
  if (!source) return { applied: false, reason: "PROBABILITIES_UNAVAILABLE", probabilities: null, selectedLeader: "" };
  const league = String(sample.league || "通用");
  const profile = artifact.leagueProfiles?.[league];
  if (options.requireValidatedLeague === true && profile?.enabled !== true) {
    return { applied: false, reason: "LEAGUE_PROFILE_NOT_VALIDATED", probabilities: null, selectedLeader: "", league, leagueSampleCount: Number(profile?.sampleCount || 0) };
  }
  const useLeague = options.globalOnly !== true && profile && profile.enabled !== false;
  const temperature = useLeague ? profile.temperature : artifact.globalTemperature;
  const probabilities = temperatureScaleWdl(source, temperature);
  return {
    applied: true,
    probabilities,
    selectedLeader: wdlLeader(probabilities),
    sourceLeader: wdlLeader(source),
    league,
    temperature,
    calibrationMode: useLeague ? "GLOBAL_PLUS_LEAGUE_SHRINKAGE" : "GLOBAL_FALLBACK",
    leagueSampleCount: Number(profile?.sampleCount || 0),
  };
}

function metricsForPredictions(rows = []) {
  return {
    market: aggregate(rows.map((row) => ({ ...row, probabilities: row.marketProbabilities, selection: row.marketSelection }))),
    model: aggregate(rows.map((row) => ({ ...row, probabilities: row.modelProbabilities, selection: row.modelSelection }))),
    globalCalibration: aggregate(rows.map((row) => ({ ...row, probabilities: row.globalProbabilities, selection: row.globalSelection }))),
    calibrated: aggregate(rows.map((row) => ({ ...row, probabilities: row.calibratedProbabilities, selection: row.calibratedSelection }))),
  };
}

export function rollingWdlTemperatureBacktest(samples = [], options = {}) {
  const ordered = [...samples].sort((left, right) => String(left.lockedAt).localeCompare(String(right.lockedAt)) || String(left.matchId).localeCompare(String(right.matchId)));
  const minimumTrain = Math.max(30, Number(options.minimumTrain || 40));
  const testBlock = Math.max(5, Number(options.testBlock || 12));
  const predictions = [];
  for (let start = minimumTrain; start < ordered.length; start += testBlock) {
    const train = ordered.slice(0, start);
    const test = ordered.slice(start, Math.min(ordered.length, start + testBlock));
    const artifact = trainWdlTemperatureCalibration(train, options);
    for (const sample of test) {
      const global = predictWdlTemperature(sample, artifact, { globalOnly: true });
      const calibrated = predictWdlTemperature(sample, artifact);
      predictions.push({
        sample,
        actual: sample.actual,
        marketProbabilities: sample.marketProbabilities,
        modelProbabilities: sample.modelProbabilities,
        globalProbabilities: global.probabilities,
        calibratedProbabilities: calibrated.probabilities,
        marketSelection: wdlLeader(sample.marketProbabilities),
        modelSelection: wdlLeader(sample.modelProbabilities),
        globalSelection: global.selectedLeader,
        calibratedSelection: calibrated.selectedLeader,
        temperature: calibrated.temperature,
      });
    }
  }
  const leagues = [...new Set(predictions.map((row) => row.sample.league))].sort();
  return {
    minimumTrain,
    testBlock,
    predictions,
    overall: metricsForPredictions(predictions),
    byLeague: Object.fromEntries(leagues.map((league) => [league, metricsForPredictions(predictions.filter((row) => row.sample.league === league))])),
  };
}

export function finalizeWdlTemperatureArtifact(samples = [], backtest = {}, options = {}) {
  const artifact = trainWdlTemperatureCalibration(samples, options);
  const overall = backtest.overall || {};
  const globalChecks = {
    sufficientOutOfSampleSize: Number(overall.calibrated?.total || 0) >= 50,
    directionBeatsStoredModel: Number(overall.calibrated?.hitRate || 0) > Number(overall.model?.hitRate || 0),
    directionNotBelowMarket: Number(overall.calibrated?.hitRate || 0) >= Number(overall.market?.hitRate || 0),
    brierBeatsBoth: Number(overall.calibrated?.averageBrier || Infinity) < Math.min(Number(overall.market?.averageBrier || Infinity), Number(overall.model?.averageBrier || Infinity)),
    logLossBeatsBoth: Number(overall.calibrated?.averageLogLoss || Infinity) < Math.min(Number(overall.market?.averageLogLoss || Infinity), Number(overall.model?.averageLogLoss || Infinity)),
  };
  const leagueValidation = Object.fromEntries(Object.entries(backtest.byLeague || {}).map(([league, metrics]) => {
    const enoughSamples = Number(metrics.calibrated?.total || 0) >= 8;
    const directionNotDegraded = Number(metrics.calibrated?.hitRate || 0) >= Math.max(Number(metrics.market?.hitRate || 0), Number(metrics.model?.hitRate || 0));
    const probabilityNotDegraded = Number(metrics.calibrated?.averageBrier || Infinity) <= Number(metrics.market?.averageBrier || Infinity)
      && Number(metrics.calibrated?.averageLogLoss || Infinity) <= Number(metrics.market?.averageLogLoss || Infinity);
    return [league, { enoughSamples, directionNotDegraded, probabilityNotDegraded, status: enoughSamples && directionNotDegraded && probabilityNotDegraded ? "VALIDATED" : "GLOBAL_FALLBACK" }];
  }));
  for (const [league, profile] of Object.entries(artifact.leagueProfiles)) {
    profile.validation = leagueValidation[league] || { enoughSamples: false, directionNotDegraded: false, probabilityNotDegraded: false, status: "GLOBAL_FALLBACK" };
    profile.enabled = profile.validation.status === "VALIDATED";
  }
  return {
    ...artifact,
    status: Object.values(globalChecks).every(Boolean) ? "ELIGIBLE" : "CHALLENGER",
    automaticPromotion: false,
    directionPolicy: "VALIDATED_LEAGUE_MARKET_CALIBRATION_WITH_R16_MODEL_FALLBACK",
    globalChecks,
    leagueValidation,
    validation: overall,
  };
}
