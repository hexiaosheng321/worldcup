const cacheBase = process.env.SPORTTERY_CACHE_BASE || "http://114.55.11.209:8787";
const apiBase = process.env.PUBLIC_API_BASE || "https://worldcup-dashboard-4hr.pages.dev";

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} ${response.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

const calculatorRaw = await getJson(`${cacheBase}/sporttery/calculator.json`);
const resultPages = [];
for (let pageNo = 1; pageNo <= 5; pageNo += 1) {
  resultPages.push(await getJson(`${cacheBase}/sporttery/results-page-${pageNo}.json`));
}

const response = await fetch(`${apiBase}/api/sync/sporttery-cache`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-apifootball-api-key": process.env.APIFOOTBALL_API_KEY || "",
    "x-football-data-api-key": process.env.FOOTBALL_DATA_API_KEY || "",
    "x-thesportsdb-api-key": process.env.THESPORTSDB_API_KEY || "",
  },
  body: JSON.stringify({ calculatorRaw, resultPages }),
});

const text = await response.text();
console.log(text);
if (!response.ok) process.exit(1);
