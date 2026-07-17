import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  fetchSportteryJson,
  sportteryRequestCandidates,
} from "../web/functions/api/[[path]].js";

const targetUrl = "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1";
const env = { SPORTTERY_UPSTREAM_PROXY: "http://114.55.11.209:8787" };
const candidates = sportteryRequestCandidates(env, targetUrl);
assert.deepEqual(candidates, [
  "http://114.55.11.209:8787/sporttery/results-page-1.json",
  targetUrl,
]);

const originalFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  if (String(url) === targetUrl) {
    return new Response(JSON.stringify({ success: true, value: { matchInfoList: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response("error code: 1003", { status: 403 });
};
try {
  const payload = await fetchSportteryJson(env, targetUrl);
  assert.equal(payload.success, true);
  assert.deepEqual(requested, candidates, "the official HTTPS endpoint must follow a failed configured relay");
} finally {
  globalThis.fetch = originalFetch;
}

const firecrawlContext = { window: {} };
vm.runInNewContext(fs.readFileSync("web/data/firecrawlObjectiveContext.js", "utf8"), firecrawlContext);
assert.equal(firecrawlContext.window.WC_FIRECRAWL_OBJECTIVE_CONTEXT.source, "firecrawl-objective-context-placeholder");
assert.deepEqual(Array.from(firecrawlContext.window.WC_FIRECRAWL_OBJECTIVE_CONTEXT.matches), []);

console.log("Online stability tests passed: Firecrawl has valid JavaScript and Sporttery relay failures fall back to official HTTPS.");
