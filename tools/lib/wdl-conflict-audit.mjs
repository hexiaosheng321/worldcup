import {
  normalizeWdlProbabilities,
  wdlLeader,
} from "./wdl-calibrator.mjs";

function round(value, digits = 4) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function poisson(lambda, goals) {
  return Math.exp(-lambda) * (lambda ** goals) / factorial(goals);
}

export function poissonWdlProbabilities(xg = {}) {
  const homeXg = Number(xg.home);
  const awayXg = Number(xg.away);
  if (!Number.isFinite(homeXg) || !Number.isFinite(awayXg)) return null;
  const probabilities = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      const probability = poisson(homeXg, home) * poisson(awayXg, away);
      probabilities[home > away ? "HOME" : home < away ? "AWAY" : "DRAW"] += probability;
    }
  }
  return normalizeWdlProbabilities(probabilities);
}

function duplicateCount(rows = []) {
  const keys = rows.map((row) => [
    row.date || "",
    row.gf ?? "",
    row.ga ?? "",
    row.result || "",
    row.venue || "",
  ].join("|"));
  return keys.length - new Set(keys).size;
}

function maximumVariance(profile = null) {
  if (!profile) return null;
  return Math.max(
    Number(profile.homeAttackVariance || 0),
    Number(profile.homeDefenceVariance || 0),
    Number(profile.awayAttackVariance || 0),
    Number(profile.awayDefenceVariance || 0),
  );
}

function countBy(rows = [], selector) {
  const result = {};
  for (const row of rows) {
    const key = String(selector(row) || "UNKNOWN");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function outcome(actual, model, market) {
  if (actual === model && actual === market) return "BOTH_HIT";
  if (actual === model) return "MODEL_WINS";
  if (actual === market) return "MARKET_WINS";
  return "BOTH_MISS";
}

function attribution(leaders = {}) {
  if (!leaders.jointScore) return "SNAPSHOT_UNAVAILABLE";
  if (leaders.poisson && leaders.poisson !== leaders.market) return "POISSON_XG_SOURCE";
  if (leaders.jointScore !== leaders.market) return "SCORE_DISTRIBUTION_BLEND";
  if (leaders.blendedBaseline && leaders.blendedBaseline !== leaders.market) return "BASELINE_BLEND";
  if (leaders.postEvidence && leaders.postEvidence !== leaders.market) return "POST_BASELINE_ADJUSTMENT";
  if (leaders.model !== leaders.market) return "STORED_OUTPUT_MISMATCH";
  return "NO_CONFLICT";
}

function sourceRiskSignals(featureSet = {}) {
  const homeRows = Array.isArray(featureSet.recentForm?.home) ? featureSet.recentForm.home : [];
  const awayRows = Array.isArray(featureSet.recentForm?.away) ? featureSet.recentForm.away : [];
  const venue = featureSet.venueProfile || null;
  const xg = featureSet.xg || null;
  const minimumFormRows = Math.min(homeRows.length, awayRows.length);
  const xgGap = xg ? Math.abs(Number(xg.home) - Number(xg.away)) : null;
  const variance = maximumVariance(venue);
  const duplicates = duplicateCount(homeRows) + duplicateCount(awayRows);
  const sparseVenue = Boolean(venue) && (
    Number(venue.homeSampleCount || 0) < 3
    || Number(venue.awaySampleCount || 0) < 3
  );
  const tags = [];
  if (minimumFormRows < 5) tags.push("INSUFFICIENT_RECENT_FORM");
  if (sparseVenue) tags.push("SPARSE_DIRECT_VENUE");
  if (variance !== null && variance >= 2) tags.push("HIGH_FORM_VARIANCE");
  if (xgGap !== null && xgGap >= 0.75) tags.push("EXTREME_XG_GAP");
  if (duplicates > 0) tags.push("DUPLICATE_FORM_ROWS_IN_SNAPSHOT");
  return {
    homeFormRows: homeRows.length,
    awayFormRows: awayRows.length,
    minimumFormRows,
    homeVenueRows: venue ? Number(venue.homeSampleCount || 0) : null,
    awayVenueRows: venue ? Number(venue.awaySampleCount || 0) : null,
    maximumFormVariance: round(variance),
    xgGap: round(xgGap),
    duplicateFormRows: duplicates,
    fundamentalDataComplete: featureSet.fundamentalDataComplete ?? null,
    dataQualityGrade: featureSet.dataQuality?.grade || "",
    tags,
  };
}

function runIndex(runsPayload = {}) {
  const rows = Array.isArray(runsPayload)
    ? runsPayload
    : runsPayload.runs || runsPayload.results || runsPayload.data || [];
  return new Map(rows.map((row) => [String(row.run_id || row.runId || ""), row]));
}

function sourcePerformance(rows = []) {
  const summary = (group) => ({
    samples: group.length,
    marketHits: group.filter((row) => row.actual === row.market).length,
    poissonHits: group.filter((row) => row.actual === row.poisson).length,
    jointScoreHits: group.filter((row) => row.actual === row.jointScore).length,
    finalModelHits: group.filter((row) => row.actual === row.model).length,
  });
  return {
    all: summary(rows),
    minimumFormUnder3: summary(rows.filter((row) => row.risks.minimumFormRows < 3)),
    xgGapAtLeast075: summary(rows.filter((row) => Number(row.risks.xgGap) >= 0.75)),
    maximumVarianceAtLeast2: summary(rows.filter((row) => Number(row.risks.maximumFormVariance) >= 2)),
    sparseDirectVenue: summary(rows.filter((row) => row.risks.tags.includes("SPARSE_DIRECT_VENUE"))),
  };
}

export function buildWdlConflictAudit(manifest = {}, runsPayload = {}) {
  const index = runIndex(runsPayload);
  const strictSamples = Array.isArray(manifest.samples) ? manifest.samples : [];
  const sourceRows = strictSamples.map((sample) => {
    const run = index.get(String(sample.modelRunId || ""));
    const output = parseJson(run?.output_json ?? run?.output);
    const featureSet = output?.featureSet || {};
    const jointScore = sample.probabilityComponents?.jointScoreModel;
    const poisson = poissonWdlProbabilities(featureSet.xg);
    if (!jointScore || !poisson) return null;
    return {
      actual: sample.actual,
      market: wdlLeader(sample.marketProbabilities),
      poisson: wdlLeader(poisson),
      jointScore: wdlLeader(jointScore),
      model: wdlLeader(sample.modelProbabilities),
      risks: sourceRiskSignals(featureSet),
    };
  }).filter(Boolean);
  const conflicts = strictSamples.filter((row) => (
    wdlLeader(row.modelProbabilities) !== wdlLeader(row.marketProbabilities)
  )).map((sample) => {
    const run = index.get(String(sample.modelRunId || ""));
    const output = parseJson(run?.output_json ?? run?.output);
    const featureSet = output?.featureSet || {};
    const components = sample.probabilityComponents || {};
    const poissonProbabilities = poissonWdlProbabilities(featureSet.xg);
    const leaders = {
      actual: sample.actual,
      market: wdlLeader(sample.marketProbabilities),
      poisson: wdlLeader(poissonProbabilities),
      jointScore: wdlLeader(components.jointScoreModel),
      blendedBaseline: wdlLeader(components.blendedBaseline),
      postEvidence: wdlLeader(components.postEvidenceModel),
      model: wdlLeader(sample.modelProbabilities),
    };
    const risks = sourceRiskSignals(featureSet);
    return {
      matchId: sample.matchId,
      match: output?.match ? {
        league: output.match.league || sample.league || "",
        home: output.match.home || "",
        away: output.match.away || "",
      } : {
        league: sample.league || "",
        home: "",
        away: "",
      },
      lockedAt: sample.lockedAt,
      modelRevision: sample.modelRevision,
      lockType: sample.lockType,
      score: sample.score,
      leaders,
      outcome: outcome(leaders.actual, leaders.model, leaders.market),
      attribution: attribution(leaders),
      xg: featureSet.xg ? {
        home: round(featureSet.xg.home),
        away: round(featureSet.xg.away),
      } : null,
      marketProbabilities: normalizeWdlProbabilities(sample.marketProbabilities),
      modelProbabilities: normalizeWdlProbabilities(sample.modelProbabilities),
      poissonProbabilities,
      jointScoreProbabilities: normalizeWdlProbabilities(components.jointScoreModel),
      sourceRiskSignals: risks,
      researchAdjustment: featureSet.research?.adjustment || null,
      scoreSource: featureSet.score ? {
        components: featureSet.score.components || [],
        historicalSampleCount: Number(featureSet.score.historicalSampleCount || 0),
        marketComplete: Boolean(featureSet.score.marketComplete),
      } : null,
    };
  });

  const linked = conflicts.filter((row) => row.attribution !== "SNAPSHOT_UNAVAILABLE");
  const sourceConflicts = linked.filter((row) => row.attribution === "POISSON_XG_SOURCE");
  const signalCounts = {};
  for (const row of linked) {
    for (const tag of row.sourceRiskSignals.tags) {
      signalCounts[tag] = (signalCounts[tag] || 0) + 1;
    }
  }
  const poissonJointDifferences = linked.filter((row) => (
    row.leaders.poisson && row.leaders.poisson !== row.leaders.jointScore
  ));
  return {
    contractVersion: "WDL_CONFLICT_ROOT_CAUSE_AUDIT_V1",
    generatedAt: new Date().toISOString(),
    sampleBoundary: {
      auditedRecords: Number(manifest.auditedRecords || manifest.records?.length || 0),
      strictProbabilitySamples: strictSamples.length,
      modelMarketConflictSamples: conflicts.length,
      linkedRunSnapshots: linked.length,
    },
    outcome: countBy(conflicts, (row) => row.outcome),
    attribution: countBy(conflicts, (row) => row.attribution),
    sourceDiagnosis: {
      poissonXgSourceConflicts: sourceConflicts.length,
      poissonAndJointLeaderDifferences: poissonJointDifferences.length,
      sourceRiskSignalCounts: signalCounts,
      extremeXgGapSamples: linked.filter((row) => Number(row.sourceRiskSignals.xgGap) >= 0.75).length,
      highVarianceSamples: linked.filter((row) => Number(row.sourceRiskSignals.maximumFormVariance) >= 2).length,
      insufficientRecentFormSamples: linked.filter((row) => row.sourceRiskSignals.minimumFormRows < 5).length,
      sparseVenueSamples: linked.filter((row) => row.sourceRiskSignals.tags.includes("SPARSE_DIRECT_VENUE")).length,
      duplicateFormSnapshotSamples: linked.filter((row) => row.sourceRiskSignals.duplicateFormRows > 0).length,
      interpretation: "OVERLAPPING_RISK_SIGNALS_NOT_CAUSAL_COUNTS",
    },
    sourcePerformance: sourcePerformance(sourceRows),
    byRevision: Object.fromEntries(
      [...new Set(conflicts.map((row) => row.modelRevision || "LEGACY_UNSPECIFIED"))].map((revision) => {
        const rows = conflicts.filter((row) => (row.modelRevision || "LEGACY_UNSPECIFIED") === revision);
        return [revision, {
          conflicts: rows.length,
          outcomes: countBy(rows, (row) => row.outcome),
          attributions: countBy(rows, (row) => row.attribution),
        }];
      }),
    ),
    byLeague: Object.fromEntries(
      [...new Set(conflicts.map((row) => row.match.league || "UNKNOWN"))].map((league) => {
        const rows = conflicts.filter((row) => (row.match.league || "UNKNOWN") === league);
        return [league, {
          conflicts: rows.length,
          outcomes: countBy(rows, (row) => row.outcome),
        }];
      }),
    ),
    conflicts,
  };
}
