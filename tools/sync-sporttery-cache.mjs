import { readFile } from "node:fs/promises";
import { fetchSportteryJson } from "./sporttery-utils.mjs";

const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";
const calculatorUrl = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";

async function snapshotMatches() {
  const source = await readFile(new URL("../web/live-sporttery-data.js", import.meta.url), "utf8");
  const matched = source.match(/=\s*([\s\S]*);\s*$/);
  if (!matched) throw new Error("live Sporttery snapshot is not valid JSON assignment");
  const data = JSON.parse(matched[1]);
  return Array.isArray(data.matches) ? data.matches : [];
}

async function postApi(path, body = {}) {
  const headers = {
    "content-type": "application/json",
    "x-apifootball-api-key": process.env.APIFOOTBALL_API_KEY || "",
    "x-football-data-api-key": process.env.FOOTBALL_DATA_API_KEY || "",
    "x-thesportsdb-api-key": process.env.THESPORTSDB_API_KEY || "",
  };

  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`${path} ${response.status}: ${text.slice(0, 200)}`);
  return { ok: response.ok, text };
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

if (!snapshotSeed.ok || !reconciled.ok || (!okoooLive.ok && !okoooResults.ok && !liveFallback.ok)) {
  console.error("主要数据源失败");
  process.exit(1);
}
