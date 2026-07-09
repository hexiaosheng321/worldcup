const cacheBase = process.env.SPORTTERY_CACHE_BASE || "http://114.55.11.209:8787";
const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} ${response.status}: ${text.slice(0, 160)}`);
  const data = JSON.parse(text);
  if (data?.ok === false) throw new Error(`${url}: ${data.error || "upstream returned ok=false"}`);
  return data;
}

const headers = {
  "content-type": "application/json",
  "x-apifootball-api-key": process.env.APIFOOTBALL_API_KEY || "",
  "x-football-data-api-key": process.env.FOOTBALL_DATA_API_KEY || "",
  "x-thesportsdb-api-key": process.env.THESPORTSDB_API_KEY || "",
};

async function postApi(path, body = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`${path} ${response.status}: ${text}`);
  return { ok: response.ok, text };
}

// ==================== 修改重点 ====================
// 优先使用 Okooo（不需要代理），Sporttery 作为备用
console.log("=== 开始同步：优先 Okooo ===");

const okoooResults = await postApi("/api/sync/okooo-results");

let cacheOk = false;
try {
  // Sporttery 缓存尝试（可能失败，没关系）
  const calculatorRaw = await getJson(`${cacheBase}/sporttery/calculator.json`);
  const resultPages = [];
  for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
    resultPages.push(await getJson(`${cacheBase}/sporttery/results-page-${pageNo}.json`));
  }
  cacheOk = (await postApi("/api/sync/sporttery-cache", { calculatorRaw, resultPages })).ok;
} catch (error) {
  console.warn(`Sporttery cache 失败，继续使用 Okooo: ${error.message}`);
}

const officialResults = await postApi("/api/sync/sporttery-results?pages=5");
const liveFallback = await postApi("/api/sync/live-results");

console.log(`同步完成 - Okooo: ${okoooResults.ok ? "成功" : "失败"} | Sporttery: ${cacheOk ? "成功" : "失败"}`);

if (!okoooResults.ok && !cacheOk && !officialResults.ok && !liveFallback.ok) {
  console.error("所有数据源都失败");
  process.exit(1);
}
