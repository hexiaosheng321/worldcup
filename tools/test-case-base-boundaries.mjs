import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { canonicalDataQuality, caseDataQualityEligible } from "../web/functions/api/lib/utils.js";
import { onRequest } from "../web/functions/api/[[path]].js";

assert.equal(canonicalDataQuality("A"), "HIGH");
assert.equal(canonicalDataQuality("B"), "MEDIUM");
assert.equal(canonicalDataQuality("HIGH"), "HIGH");
assert.equal(canonicalDataQuality("MEDIUM"), "MEDIUM");
assert.equal(canonicalDataQuality("LOW"), "LOW");
assert.equal(caseDataQualityEligible("A"), true);
assert.equal(caseDataQualityEligible("B"), true);
assert.equal(caseDataQualityEligible("LOW"), false);

const apiSource = fs.readFileSync(new URL("../web/functions/api/[[path]].js", import.meta.url), "utf8");
const browserSource = fs.readFileSync(new URL("../web/lib/similarCaseEngine.js", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("../web/app/app-detail.js", import.meta.url), "utf8");
const legacyDetailSource = fs.readFileSync(new URL("../web/app.js", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const publisherSource = fs.readFileSync(new URL("./publish-unified-locks.mjs", import.meta.url), "utf8");
const enricherSource = fs.readFileSync(new URL("./enrich-unified-lock-file.mjs", import.meta.url), "utf8");

assert.equal(apiSource.includes('addPart(parts, "league"'), false, "league must be a hard filter, not a backend similarity weight");
assert.equal(browserSource.includes('add("league"'), false, "league must be a hard filter, not a browser similarity weight");
for (const marker of ["sameLeagueSettledCount", "championFormalCount", "formalEvaluatedCount", "voidExcludedCount", "shadowObservationCount", "qualityEligibleCount", "featureComparableCount", "thresholdMatchedCount"]) {
  assert.ok(apiSource.includes(marker), `similar-case diagnostics missing ${marker}`);
  assert.ok(detailSource.includes(marker), `detail diagnostics missing ${marker}`);
}
for (const source of [detailSource, legacyDetailSource]) {
  assert.ok(source.includes("内部正式 Case Base 诊断"));
  assert.ok(source.includes("影子观察只作诊断，不计正式命中率"));
  assert.ok(source.includes("外部历史样本不进入正式命中率分母"));
  assert.ok(source.includes("VOID/未验票及影子观察不计正式分母"));
  assert.ok(source.includes("threshold: 65"));
  assert.equal(source.includes("锁版 / 外部"), false);
}
assert.ok(indexSource.includes("case-base-boundaries=20260722_v2"));
for (const source of [publisherSource, enricherSource]) {
  assert.ok(source.includes("同联赛历史背景样本"));
  assert.equal(source.includes("完整盘口样本"), false);
}

const sandbox = { window: {} };
vm.runInNewContext(browserSource, sandbox, { filename: "similarCaseEngine.js" });
const engine = sandbox.window.WC_SIMILAR_CASE_ENGINE;
const current = { matchId: "current", league: "韩职", modelVersion: "V4", asianHandicap: -0.5 };
const legacyA = {
  caseId: "case-a",
  matchId: "past-a",
  league: "K League 1",
  modelVersion: "V4",
  dataQuality: "A",
  asianHandicap: -0.5,
  actualResult: "HOME",
  actualGoals: 2,
  hitStatus: "WIN",
};
const otherLeague = { ...legacyA, caseId: "case-b", matchId: "past-b", league: "日职" };
const formalVoid = { ...legacyA, caseId: "case-void", matchId: "past-void", hitStatus: "VOID" };
const result = engine.findSimilarCases(current, [legacyA, formalVoid, otherLeague], { externalSamples: [], threshold: 65 });
assert.equal(result.sampleCount, 1, "legacy A quality should remain eligible while another league stays excluded");
assert.equal(result.stats.lockedSampleCount, 1, "VOID must stay outside the browser formal denominator");
assert.equal(result.topCases[0].caseId, "case-a");

const d1Rows = [
  { case_id: "formal-a", match_id: "past-1", league: "K League 1", case_role: "CHAMPION_FORMAL", data_quality: "A", model_home_prob: 0.5, model_draw_prob: 0.3, model_away_prob: 0.2, actual_result: "HOME", actual_goals: 2, hit_status: "WIN", payload_json: "{}" },
  { case_id: "shadow", match_id: "past-2", league: "韩职", case_role: "SHADOW_OBSERVATION", data_quality: "MEDIUM", model_home_prob: 0.5, model_draw_prob: 0.3, model_away_prob: 0.2, actual_result: "DRAW", actual_goals: 2, hit_status: "VOID", payload_json: "{}" },
  { case_id: "formal-low", match_id: "past-3", league: "韩职", case_role: "CHAMPION_FORMAL", data_quality: "LOW", model_home_prob: 0.5, model_draw_prob: 0.3, model_away_prob: 0.2, actual_result: "AWAY", actual_goals: 3, hit_status: "LOSE", payload_json: "{}" },
  { case_id: "formal-void", match_id: "past-void", league: "韩职", case_role: "CHAMPION_FORMAL", data_quality: "A", model_home_prob: 0.5, model_draw_prob: 0.3, model_away_prob: 0.2, actual_result: "HOME", actual_goals: 2, hit_status: "VOID", payload_json: "{}" },
  { case_id: "other-league", match_id: "past-4", league: "日职", case_role: "CHAMPION_FORMAL", data_quality: "HIGH", model_home_prob: 0.5, model_draw_prob: 0.3, model_away_prob: 0.2, actual_result: "HOME", actual_goals: 1, hit_status: "WIN", payload_json: "{}" },
];
const db = {
  prepare(sql) {
    const statement = {
      bind() { return statement; },
      async all() {
        if (sql.includes("PRAGMA table_info(case_base)")) {
          return { results: [{ name: "case_role" }, { name: "source_lock_type" }, { name: "preferred_at_settlement" }] };
        }
        if (sql.includes("SELECT * FROM case_base")) return { results: d1Rows };
        throw new Error(`Unexpected test query: ${sql}`);
      },
      async run() { return { success: true }; },
    };
    return statement;
  },
};
const response = await onRequest({
  request: new Request("https://example.test/api/similar-cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ matchId: "current", league: "韩职", threshold: 65, modelHomeProb: 0.5, modelDrawProb: 0.3, modelAwayProb: 0.2 }),
  }),
  env: { DB: db },
});
const payload = await response.json();
assert.equal(payload.ok, true);
assert.deepEqual(payload.diagnostics, {
  sameLeagueSettledCount: 4,
  championFormalCount: 3,
  formalEvaluatedCount: 2,
  voidExcludedCount: 1,
  shadowObservationCount: 1,
  qualityEligibleCount: 1,
  featureComparableCount: 1,
  thresholdMatchedCount: 1,
  threshold: 65,
});
assert.equal(payload.sampleCount, 1);
assert.equal(payload.topCases[0].caseId, "formal-a");

console.log("Case Base boundary tests passed: formal WIN/LOSE, VOID, shadow and external samples remain separate and diagnostics are visible.");
