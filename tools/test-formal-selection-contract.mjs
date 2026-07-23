import assert from "node:assert/strict";
import {
  formalPairCompatible,
  formalSelectionSummary,
} from "./lib/formal-selection-contract.mjs";

assert.equal(formalPairCompatible("胜", "让负", -1), false);
assert.equal(formalPairCompatible("胜", "让平", -1), true);
assert.equal(formalPairCompatible("胜", "让胜", -1), true);
assert.equal(formalPairCompatible("平", "让负", -1), true);
assert.equal(formalPairCompatible("负", "让负", -1), true);
assert.equal(formalPairCompatible("负", "让胜", 1), false);
assert.equal(formalPairCompatible("负", "让平", 1), true);
assert.equal(formalPairCompatible(null, "让负", -1), true);

assert.equal(formalSelectionSummary({}), "无正式玩法");
assert.equal(
  formalSelectionSummary({ winDrawLose: "胜", handicap: null, totalGoals: "2球", scores: [] }),
  "胜平负 胜；总进球 2球"
);

console.log("formal selection contract tests passed");
