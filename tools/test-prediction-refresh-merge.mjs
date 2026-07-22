import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("web/app/app-core.js", "utf8");
const start = source.indexOf("function cloudPredictionFieldIsBlank");
const end = source.indexOf("function mergeCloudAutoPredictions", start);

assert.ok(start >= 0 && end > start, "prediction refresh merge helpers must exist");

const context = {};
vm.runInNewContext(
  `${source.slice(start, end)}\nglobalThis.mergeCloudPredictionSnapshot = mergeCloudPredictionSnapshot;`,
  context
);

const complete = {
  pick: "胜",
  handicapPick: "让胜",
  totalGoalsPick: "2球/3球",
  mainScore: "2-0",
  counterScore: "2-1",
  confidence: "B",
  marketAvailability: { winDrawLose: true, handicap: true, totalGoals: true, scores: true },
  formalSelections: [{ market: "winDrawLose", pick: "胜" }],
};

const sparseRefresh = {
  pick: "",
  handicapPick: null,
  totalGoalsPick: undefined,
  mainScore: " ",
  counterScore: "",
  confidence: "A",
  lockedAt: "2026-07-22T08:00:00.000Z",
  marketAvailability: { handicap: false },
  formalSelections: [],
};

const merged = context.mergeCloudPredictionSnapshot(complete, sparseRefresh);

assert.equal(merged.pick, "胜");
assert.equal(merged.handicapPick, "让胜");
assert.equal(merged.totalGoalsPick, "2球/3球");
assert.equal(merged.mainScore, "2-0");
assert.equal(merged.counterScore, "2-1");
assert.equal(merged.confidence, "A");
assert.equal(merged.lockedAt, "2026-07-22T08:00:00.000Z");
assert.equal(merged.marketAvailability.winDrawLose, true);
assert.equal(merged.marketAvailability.handicap, false);
assert.deepEqual(merged.formalSelections, complete.formalSelections);

console.log("Prediction refresh merge test passed: sparse cloud rows cannot erase complete locked fields.");
