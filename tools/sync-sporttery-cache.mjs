const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";

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

console.log(`Okooo: ${okoooResults.ok ? "✅" : "❌"} | Live: ${liveFallback.ok ? "✅" : "❌"}`);

if (!okoooResults.ok && !liveFallback.ok) {
  console.error("主要数据源失败");
  process.exit(1);
}
