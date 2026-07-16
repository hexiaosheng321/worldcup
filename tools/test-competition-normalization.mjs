import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeCompetition as normalizeApiCompetition } from "../web/functions/api/[[path]].js";

const cases = [
  ["巴西甲", "巴西甲"],
  ["巴甲", "巴西甲"],
  ["Brasileirao", "巴西甲"],
  ["Brasileirão", "巴西甲"],
  ["Brazil Serie A", "巴西甲"],
  ["Brazilian Série A", "巴西甲"],
  ["西甲", "西甲"],
  ["La Liga", "西甲"],
  ["意甲", "意甲"],
  ["Serie A", "意甲"],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeApiCompetition(input), expected, `API competition normalization failed for ${input}`);
}

const browserSource = fs.readFileSync(new URL("../web/lib/similarCaseEngine.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(browserSource, sandbox, { filename: "similarCaseEngine.js" });
const normalizeBrowserCompetition = sandbox.window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition;
for (const [input, expected] of cases) {
  assert.equal(normalizeBrowserCompetition(input), expected, `browser competition normalization failed for ${input}`);
}

console.log("Competition normalization tests passed: Brazil Serie A remains distinct from La Liga and Serie A.");
