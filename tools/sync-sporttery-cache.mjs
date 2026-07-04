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

let cacheOk = false;
try {
  const calculatorRaw = await getJson(`${cacheBase}/sporttery/calculator.json`);
  const resultPages = [];
  for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
    resultPages.push(await getJson(`${cacheBase}/sporttery/results-page-${pageNo}.json`));
  }
  cacheOk = (await postApi("/api/sync/sporttery-cache", { calculatorRaw, resultPages })).ok;
} catch (error) {
  console.warn(`sporttery cache sync skipped: ${error.message}`);
}

const officialResults = await postApi("/api/sync/sporttery-results?pages=5");
const liveFallback = await postApi("/api/sync/live-results");

if (!cacheOk && !officialResults.ok && !liveFallback.ok) {
  process.exit(1);
}
