const cacheBase = process.env.SPORTTERY_CACHE_BASE || "http://114.55.11.209:8787";
const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";

const headers = {
  "content-type": "application/json",
  "x-sporttery-upstream-proxy": process.env.SPORTTERY_UPSTREAM_PROXY || "",
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

  return {
    ok: response.ok,
    status: response.status,
    text,
  };
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${url} ${response.status}: ${text.slice(0, 180)}`);
  }

  const data = JSON.parse(text);

  if (data?.ok === false) {
    throw new Error(`${url}: ${data.error || "upstream returned ok=false"}`);
  }

  return data;
}

let hasUsefulSync = false;

// 1. OKOOO 先跑。现在它已经确认可以成功。
const okoooResults = await postApi("/api/sync/okooo-results");
if (okoooResults.ok) hasUsefulSync = true;

// 2. 第三方比分兜底。
const liveFallback = await postApi("/api/sync/live-results");
if (liveFallback.ok) hasUsefulSync = true;

// 3. 体彩官方放到后面。它经常 403，不能作为主链路。
const officialSporttery = await postApi("/api/sync/sporttery");
if (officialSporttery.ok) hasUsefulSync = true;

// 4. 官方赛果也放后面。
const officialResults = await postApi("/api/sync/sporttery-results?pages=5");
if (officialResults.ok) hasUsefulSync = true;

// 5. 旧缓存服务器最后兜底。现在它 503，所以只作为备用。
if (!officialSporttery.ok) {
  try {
    const calculatorRaw = await getJson(`${cacheBase}/sporttery/calculator.json`);
    const resultPages = [];

    for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
      resultPages.push(await getJson(`${cacheBase}/sporttery/results-page-${pageNo}.json`));
    }

    const cacheSync = await postApi("/api/sync/sporttery-cache", {
      calculatorRaw,
      resultPages,
    });

    if (cacheSync.ok) hasUsefulSync = true;
  } catch (error) {
    console.warn(`sporttery cache sync skipped: ${error.message}`);
  }
}

if (!hasUsefulSync) {
  console.error("No sync source succeeded.");
  process.exit(1);
}
