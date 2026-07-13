import assert from "node:assert/strict";
import { syncHealthDecision } from "./lib/sync-health.mjs";

const healthy = syncHealthDecision({ snapshotSeed: true, okoooLive: true, okoooResults: true, sportteryResults: true, liveFallback: true, reconciled: true });
assert.equal(healthy.level, "HEALTHY");
assert.equal(healthy.exitCode, 0);

const upstreamDegraded = syncHealthDecision({ snapshotSeed: true, okoooLive: false, okoooResults: true, sportteryResults: false, liveFallback: true, reconciled: false });
assert.equal(upstreamDegraded.level, "DEGRADED");
assert.equal(upstreamDegraded.exitCode, 0);
assert.ok(upstreamDegraded.warnings.includes("样本回填延迟"));

const critical = syncHealthDecision({ snapshotSeed: false, okoooLive: false, okoooResults: false, sportteryResults: false, liveFallback: false, reconciled: false });
assert.equal(critical.level, "FAILURE");
assert.equal(critical.exitCode, 1);

console.log("Sync health policy verified.");
