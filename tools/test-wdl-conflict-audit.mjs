import assert from "node:assert/strict";
import {
  buildWdlConflictAudit,
  poissonWdlProbabilities,
} from "./lib/wdl-conflict-audit.mjs";

const probabilities = poissonWdlProbabilities({ home: 2, away: 0.5 });
assert.equal(Object.keys(probabilities).length, 3);
assert.equal(probabilities.HOME > probabilities.AWAY, true);

const samples = [
  {
    matchId: "source-conflict",
    modelRunId: "run-source",
    modelRevision: "R16",
    lockType: "FINAL_LOCK",
    lockedAt: "2026-07-22T00:00:00Z",
    league: "测试",
    score: "0-1",
    actual: "AWAY",
    modelProbabilities: { HOME: 0.55, DRAW: 0.25, AWAY: 0.2 },
    marketProbabilities: { HOME: 0.25, DRAW: 0.25, AWAY: 0.5 },
    probabilityComponents: {
      jointScoreModel: { HOME: 0.6, DRAW: 0.25, AWAY: 0.15 },
      blendedBaseline: { HOME: 0.55, DRAW: 0.25, AWAY: 0.2 },
      postEvidenceModel: { HOME: 0.55, DRAW: 0.25, AWAY: 0.2 },
    },
  },
  {
    matchId: "blend-conflict",
    modelRunId: "run-blend",
    modelRevision: "R16",
    lockType: "PRE_LOCK",
    lockedAt: "2026-07-22T01:00:00Z",
    league: "测试",
    score: "1-0",
    actual: "HOME",
    modelProbabilities: { HOME: 0.36, DRAW: 0.37, AWAY: 0.27 },
    marketProbabilities: { HOME: 0.4, DRAW: 0.35, AWAY: 0.25 },
    probabilityComponents: {
      jointScoreModel: { HOME: 0.39, DRAW: 0.38, AWAY: 0.23 },
      blendedBaseline: { HOME: 0.36, DRAW: 0.37, AWAY: 0.27 },
      postEvidenceModel: { HOME: 0.36, DRAW: 0.37, AWAY: 0.27 },
    },
  },
  {
    matchId: "missing-run",
    modelRunId: "",
    modelRevision: "LEGACY",
    lockType: "FINAL_LOCK",
    lockedAt: "2026-07-22T02:00:00Z",
    league: "测试",
    score: "1-1",
    actual: "DRAW",
    modelProbabilities: { HOME: 0.25, DRAW: 0.45, AWAY: 0.3 },
    marketProbabilities: { HOME: 0.5, DRAW: 0.3, AWAY: 0.2 },
    probabilityComponents: null,
  },
];
const runs = {
  runs: [
    {
      run_id: "run-source",
      output_json: JSON.stringify({
        match: { league: "测试", home: "甲", away: "乙" },
        featureSet: {
          xg: { home: 2, away: 0.5 },
          recentForm: {
            home: [
              { date: "2026-07-01", gf: 2, ga: 0, result: "W", venue: "HOME" },
              { date: "2026-07-01", gf: 2, ga: 0, result: "W", venue: "HOME" },
            ],
            away: [{ date: "2026-07-01", gf: 0, ga: 2, result: "L", venue: "AWAY" }],
          },
          venueProfile: {
            homeSampleCount: 2,
            awaySampleCount: 1,
            homeAttackVariance: 2.5,
          },
          fundamentalDataComplete: false,
          dataQuality: { grade: "C" },
        },
      }),
    },
    {
      run_id: "run-blend",
      output_json: JSON.stringify({
        match: { league: "测试", home: "丙", away: "丁" },
        featureSet: {
          xg: { home: 1.2, away: 1.1 },
          recentForm: { home: [], away: [] },
        },
      }),
    },
  ],
};

const audit = buildWdlConflictAudit({
  auditedRecords: 3,
  samples,
}, runs);

assert.equal(audit.sampleBoundary.modelMarketConflictSamples, 3);
assert.equal(audit.attribution.POISSON_XG_SOURCE, 1);
assert.equal(audit.attribution.BASELINE_BLEND, 1);
assert.equal(audit.attribution.SNAPSHOT_UNAVAILABLE, 1);
assert.equal(audit.outcome.MARKET_WINS, 2);
assert.equal(audit.outcome.MODEL_WINS, 1);
assert.equal(audit.sourceDiagnosis.duplicateFormSnapshotSamples, 1);
assert.equal(audit.sourceDiagnosis.insufficientRecentFormSamples, 2);
assert.equal(audit.sourcePerformance.all.samples, 2);
assert.equal(audit.sourcePerformance.minimumFormUnder3.samples, 2);

console.log("WDL conflict root-cause audit tests passed.");
