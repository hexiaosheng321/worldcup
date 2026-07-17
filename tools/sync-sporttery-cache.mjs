import { readFile } from "node:fs/promises";
import { fetchSportteryJson } from "./sporttery-utils.mjs";
import { syncHealthDecision } from "./lib/sync-health.mjs";

const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";
const calculatorUrl = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";

async function snapshotMatches() {
  const source = await readFile(new URL("../web/live-sporttery-data.js", import.meta.url), "utf8");
  const matched = source.match(/=\s*([\s\S]*);\s*$/);
  if (!matched) throw new Error("live Sporttery snapshot is not valid JSON assignment");
  const data = JSON.parse(matched[1]);
  return Array.isArray(data.matches) ? data.matches : [];
}

const retryableStatuses = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

async function postApi(path, body = {}, options = {}) {
  const headers = {
    "content-type": "application/json",
    "x-apifootball-api-key": process.env.APIFOOTBALL_API_KEY || "",
    "x-football-data-api-key": process.env.FOOTBALL_DATA_API_KEY || "",
    "x-thesportsdb-api-key": process.env.THESPORTSDB_API_KEY || "",
  };

  const attempts = Math.max(1, Number(options.attempts || 3));
  let last = { ok: false, status: 0, text: "", attempts: 0 };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {}
      last = { ok: response.ok && payload?.ok !== false, status: response.status, text, payload, attempts: attempt };
      console.log(`${path} ${response.status} [${attempt}/${attempts}]: ${text.slice(0, 200)}`);
      if (last.ok || !retryableStatuses.has(response.status) || attempt === attempts) return last;
    } catch (error) {
      last = { ok: false, status: 0, text: error.message || "network error", attempts: attempt };
      console.warn(`${path} network error [${attempt}/${attempts}]: ${last.text}`);
      if (attempt === attempts) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return last;
}

// ==================== 重点修改 ====================
// 优先 Okooo + 国际数据源，完全绕过 Sporttery 主接口
console.log("=== 开始同步（优先 Okooo） ===");

// D1 必须先有比赛主记录，后续赛果才能按 matchId/orderId 自动落库。
const snapshotSeed = await postApi("/api/sync/sporttery-snapshot", { matches: await snapshotMatches() });
let calculatorRaw = null;
try {
  calculatorRaw = await fetchSportteryJson(calculatorUrl);
} catch (error) {
  console.warn(`体彩官方赛程读取失败，OKOOO赔率仍同步但不使用停售时间作为开球时间：${error.message}`);
}
const okoooLive = await postApi("/api/sync/okooo-live", { calculatorRaw });
const okoooResults = await postApi("/api/sync/okooo-results");
const liveFallback = await postApi("/api/sync/live-results");

// Sporttery 只尝试一次，不强求
let sportteryOk = false;
try {
  const officialResults = await postApi("/api/sync/sporttery-results?pages=5");
  sportteryOk = officialResults.ok;
} catch (e) {
  console.warn("Sporttery 官方同步失败（正常）");
}
const reconciled = await postApi("/api/sync/reconcile-completed-samples");

console.log(`Snapshot: ${snapshotSeed.ok ? "✅" : "❌"} | Okooo赛程: ${okoooLive.ok ? "✅" : "❌"} | Okooo赛果: ${okoooResults.ok ? "✅" : "❌"} | Live: ${liveFallback.ok ? "✅" : "❌"} | 样本回填: ${reconciled.ok ? "✅" : "❌"}`);
const health = syncHealthDecision({
  snapshotSeed: snapshotSeed.ok,
  okoooLive: okoooLive.ok,
  okoooResults: okoooResults.ok,
  sportteryResults: sportteryOk,
  liveFallback: liveFallback.ok,
  reconciled: reconciled.ok,
});
if (health.level === "DEGRADED") {
  console.warn(`::warning title=数据同步降级成功::${health.warnings.join("；")}。${health.message}`);
} else if (health.level === "FAILURE") {
  console.error(`::error title=数据同步不可用::${health.warnings.join("；")}。${health.message}`);
}
process.exitCode = health.exitCode;
