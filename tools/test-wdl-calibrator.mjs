import assert from "node:assert/strict";
import fs from "node:fs";
import artifact from "./data/wdl-calibration-r17.json" with { type: "json" };
import { predictWdlTemperature, wdlLeader } from "./lib/wdl-calibrator.mjs";

const manifest = JSON.parse(fs.readFileSync("web/data/wdl-calibration-training-r17.json", "utf8"));
assert.equal(manifest.auditedRecords, 188);
assert.equal(manifest.sourceCounts.STATIC_WORLD_CUP_LOCK, 62);
assert.equal(manifest.sourceCounts.D1_LOCK, 120);
assert.equal(manifest.sourceCounts.STATIC_SPORTTTERY_LOCK, 6);
assert.equal(manifest.records.length, 188);
assert.equal(manifest.samples.length, manifest.eligibleSamples);
assert.ok(manifest.records.every((record) => Array.isArray(record.dataGaps)));
assert.ok(manifest.records.filter((record) => record.trainingEligibility === "AUDIT_ONLY").every((record) => record.dataGaps.length > 0));

assert.equal(artifact.status, "CHALLENGER");
assert.equal(artifact.automaticPromotion, false);
assert.equal(artifact.promotionDecision, "NOT_PROMOTED");
assert.equal(artifact.leagueProfiles["挪超"].enabled, false);
assert.equal(artifact.leagueProfiles["瑞超"].enabled, false);
assert.equal(artifact.leagueProfiles["韩职"].enabled, false);
assert.ok(artifact.validation.calibrated.hitRate > artifact.validation.model.hitRate);
assert.ok(artifact.validation.calibrated.averageBrier < artifact.validation.market.averageBrier);
assert.ok(artifact.validation.calibrated.averageLogLoss < artifact.validation.market.averageLogLoss);

const marketProbabilities = { HOME: 0.5, DRAW: 0.3, AWAY: 0.2 };
const norway = predictWdlTemperature({ league: "挪超", marketProbabilities }, artifact, { requireValidatedLeague: true });
assert.equal(norway.applied, false);
assert.equal(norway.reason, "LEAGUE_PROFILE_NOT_VALIDATED");
const korea = predictWdlTemperature({ league: "韩职", marketProbabilities }, artifact, { requireValidatedLeague: true });
assert.equal(korea.applied, false);
assert.equal(korea.reason, "LEAGUE_PROFILE_NOT_VALIDATED");

console.log("R17 research manifest retained and all Champion application gates disabled.");
