import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const item = process.argv[i];
  if (!item.startsWith("--")) continue;
  const key = item.slice(2);
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
  args.set(key, value);
}

const pageUrl = args.get("url");
const outputDir = args.get("output-dir") || "/tmp";
const slug = args.get("slug") || "footiqo-league";

if (!pageUrl) {
  console.error("Usage: node tools/fetch-footiqo-league.mjs --url https://footiqo.com/database/leagues/.../ --slug england-premier-league");
  process.exit(1);
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&");
}

function parseTableDescription(html, tableId) {
  const marker = `id="${tableId}_desc"`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${tableId}_desc in ${pageUrl}`);
  const valueStart = html.indexOf("value='", start) + "value='".length;
  const valueEnd = html.indexOf("'/>", valueStart);
  if (valueStart < 0 || valueEnd < 0) throw new Error(`Could not parse ${tableId}_desc`);
  return JSON.parse(decodeHtmlAttribute(html.slice(valueStart, valueEnd)));
}

function parseNonce(html, tableWpId) {
  const match = html.match(new RegExp(`id="wdtNonceFrontendServerSide_${tableWpId}"[^>]*value="([^"]+)"`));
  return match?.[1] || "";
}

function buildDataTablesBody(description, length, nonce) {
  const columns = description.dataTableParams.columnDefs;
  const body = new URLSearchParams();
  if (nonce) body.set(`wdtNonceFrontendServerSide_${description.tableWpId}`, nonce);
  body.set("_wp_http_referer", new URL(pageUrl).pathname);
  body.set("draw", "1");
  body.set("start", "0");
  body.set("length", String(length));
  body.set("search[value]", "");
  body.set("search[regex]", "false");
  columns.forEach((column, index) => {
    body.set(`columns[${index}][data]`, String(index));
    body.set(`columns[${index}][name]`, column.name || "");
    body.set(`columns[${index}][searchable]`, column.searchable === false ? "false" : "true");
    body.set(`columns[${index}][orderable]`, column.orderable === false ? "false" : "true");
    body.set(`columns[${index}][search][value]`, "");
    body.set(`columns[${index}][search][regex]`, "false");
  });
  body.set("order[0][column]", "1");
  body.set("order[0][dir]", "desc");
  return body;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    },
  });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return {
    text: await response.text(),
    cookie: response.headers.getSetCookie?.().map((item) => item.split(";")[0]).join("; ") || "",
  };
}

async function fetchTable(description, length, nonce, cookie) {
  const url = description.dataTableParams.ajax.url.replaceAll("\\/", "/");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "origin": "https://footiqo.com",
      "referer": pageUrl,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      "x-requested-with": "XMLHttpRequest",
      ...(cookie ? { "cookie": cookie } : {}),
    },
    body: buildDataTablesBody(description, length, nonce),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST ${url} failed: ${response.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`POST ${url} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const page = await fetchText(pageUrl);
const html = page.text;
const scoresDescription = parseTableDescription(html, "table_1");
const oddsDescription = parseTableDescription(html, "table_11");
const scoresNonce = parseNonce(html, scoresDescription.tableWpId);
const oddsNonce = parseNonce(html, oddsDescription.tableWpId);
const probe = await fetchTable(oddsDescription, 1, oddsNonce, page.cookie);
const total = Number(probe.recordsTotal || probe.recordsFiltered || 5000);
const length = Math.max(total, 5000);
const [scores, odds] = await Promise.all([
  fetchTable(scoresDescription, length, scoresNonce, page.cookie),
  fetchTable(oddsDescription, length, oddsNonce, page.cookie),
]);

const scoresPath = path.join(outputDir, `${slug}-scores.json`);
const oddsPath = path.join(outputDir, `${slug}-odds.json`);
fs.writeFileSync(scoresPath, `${JSON.stringify(scores, null, 2)}\n`, "utf8");
fs.writeFileSync(oddsPath, `${JSON.stringify(odds, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  pageUrl,
  scoresTableId: scoresDescription.tableWpId,
  oddsTableId: oddsDescription.tableWpId,
  scoresRows: scores.data?.length || 0,
  oddsRows: odds.data?.length || 0,
  scoresRecordsTotal: scores.recordsTotal,
  oddsRecordsTotal: odds.recordsTotal,
  scoresPath,
  oddsPath,
}, null, 2));
