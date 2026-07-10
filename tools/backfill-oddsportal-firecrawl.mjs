import fs from "node:fs/promises";
import vm from "node:vm";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  args.set(key.slice(2), value && !value.startsWith("--") ? value : "true");
  if (value && !value.startsWith("--")) index += 1;
}

const league = args.get("league") || "";
const season = String(args.get("season") || "");
const limit = Math.max(1, Number(args.get("limit") || 20));
const maxPages = Math.max(1, Number(args.get("pages") || 12));
const concurrency = Math.min(8, Math.max(1, Number(args.get("concurrency") || 4)));
const apply = args.get("apply") === "true";
const debug = args.get("debug") === "true";
const normalizeOnly = args.get("normalize-only") === "true";
const output = args.get("output") || "web/data/externalHistoricalSamples.js";
const apiKey = process.env.FIRECRAWL_API_KEY || "";

const configs = {
  芬超: { slug: "finland/veikkausliiga", sourceLeague: "Veikkausliiga" },
  韩职: { slug: "south-korea/k-league-1", sourceLeague: "K League 1" },
  世界杯: { slug: "world/world-championship", sourceLeague: "World Championship" },
};
const config = configs[league];
if (!config || !season) throw new Error("Use --league 芬超|韩职|世界杯 --season YYYY");

function resultsUrl(page = 1) {
  const suffix = season === "2026" ? config.slug : `${config.slug}-${season}`;
  const base = `https://www.oddsportal.com/football/${suffix}/results/`;
  return page === 1 ? base : `${base}#/page/${page}/`;
}

async function firecrawl(url, actions = []) {
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: 3500,
      timeout: 120000,
      actions,
      location: { country: "US", languages: ["en-US"] },
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(`Firecrawl ${response.status}: ${payload?.error || "unknown error"}`);
  return payload.data;
}

function americanToDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return null;
  return Number((number > 0 ? 1 + number / 100 : 1 + 100 / Math.abs(number)).toFixed(4));
}

function isoDate(text) {
  const match = String(text).match(/^(\d{2}) ([A-Z][a-z]{2}) (\d{4})$/);
  if (!match) return "";
  const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  return `${match[3]}-${months[match[2]] || "00"}-${match[1]}`;
}

function parseResultsPage(markdown = "") {
  const lines = String(markdown).split(/\r?\n/).map((line) => line.trim());
  const rows = [];
  let date = "";
  for (let index = 0; index < lines.length; index += 1) {
    const nextDate = isoDate(lines[index]);
    if (nextDate) date = nextDate;
    const linked = lines[index].match(/^\[FinishedFIN\]\((https:\/\/www\.oddsportal\.com\/football\/h2h\/[^)]+)\)$/);
    if (!linked || !date) continue;
    let end = index + 1;
    while (end < lines.length && !/^\[FinishedFIN\]\(/.test(lines[end]) && !isoDate(lines[end])) end += 1;
    const block = lines.slice(index + 1, end);
    const teams = block
      .map((line) => line.match(/^!\[([^\]]+)\]\([^)]*team-logo/i)?.[1] || "")
      .filter(Boolean)
      .slice(0, 2);
    const dash = block.findIndex((line) => line === "–" || line === "-");
    const before = dash >= 0 ? [...block.slice(0, dash)].reverse().find((line) => /^\d+$/.test(line)) : "";
    const after = dash >= 0 ? block.slice(dash + 1).find((line) => /^\d+$/.test(line)) : "";
    const prices = block.filter((line) => /^[+-]\d+$/.test(line)).slice(-3).map(americanToDecimal);
    if (teams.length !== 2 || before === "" || after === "") continue;
    rows.push({
      date,
      home: teams[0],
      away: teams[1],
      homeGoals: Number(before),
      awayGoals: Number(after),
      url: linked[1],
      odds1x2: prices.length === 3 && prices.every(Boolean) ? prices : [],
    });
  }
  return rows;
}

function normalizedTeam(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "")
    .replace(/footballclub|fc|united|city|club/g, "");
}

function teamScore(left, right) {
  const a = normalizedTeam(left);
  const b = normalizedTeam(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const aset = new Set(a.match(/.{1,2}/g) || []);
  const bset = new Set(b.match(/.{1,2}/g) || []);
  const common = [...aset].filter((item) => bset.has(item)).length;
  return common / Math.max(aset.size, bset.size, 1);
}

function sampleDate(sample) {
  return String(sample.kickoffTime || "").slice(0, 10);
}

function matchRow(sample, row) {
  if (sampleDate(sample) !== row.date) return 0;
  const scoreMatches = Number(sample.actualHomeGoals) === row.homeGoals && Number(sample.actualAwayGoals) === row.awayGoals;
  if (!scoreMatches) return 0;
  return teamScore(sample.homeTeam, row.home) + teamScore(sample.awayTeam, row.away);
}

function textResult(entry) {
  if (entry?.type === "string" && typeof entry.value === "string") return entry.value;
  return entry?.value?.type === "string" ? entry.value.value : "";
}

function marketSlice(text, startLabel, endLabel = "My coupon") {
  const normalized = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n");
  const start = normalized.indexOf(startLabel);
  if (start < 0) return "";
  const end = normalized.indexOf(endLabel, start);
  return normalized.slice(start, end > start ? end : undefined);
}

function parseAmericanPrices(text) {
  return (String(text).match(/(?:^|\n)([+-]\d+)(?=\n|$)/g) || [])
    .map((value) => americanToDecimal(value.trim()))
    .filter(Boolean);
}

function parseOneXTwo(text) {
  const prices = parseAmericanPrices(marketSlice(text, "Bookmakers\n1\nX\n2\nPayout"));
  const triples = [];
  for (let index = 0; index + 2 < prices.length; index += 3) triples.push(prices.slice(index, index + 3));
  if (!triples.length) return null;
  return {
    home: Number((triples.reduce((sum, row) => sum + row[0], 0) / triples.length).toFixed(4)),
    draw: Number((triples.reduce((sum, row) => sum + row[1], 0) / triples.length).toFixed(4)),
    away: Number((triples.reduce((sum, row) => sum + row[2], 0) / triples.length).toFixed(4)),
    bookmakerCount: triples.length,
  };
}

function parseAsianHandicap(text) {
  const section = marketSlice(text, "Handicap\n1\n2\nPayout");
  const pattern = /Asian Handicap\s+([+-]?\d+(?:\.\d+)?)[\s\S]*?AH\s+[+-]?\d+(?:\.\d+)?[\s\S]*?\n\d+\n([+-]\d+)\n([+-]\d+)\n/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(section))) {
    const home = americanToDecimal(match[2]);
    const away = americanToDecimal(match[3]);
    if (home && away) rows.push({ line: Number(match[1]), home, away });
  }
  rows.sort((a, b) => Math.abs(a.home - a.away) - Math.abs(b.home - b.away));
  return { selected: rows[0] || null, rows };
}

function parseOverUnder(text) {
  const section = marketSlice(text, "Handicap\nOver\nUnder\nPayout");
  const pattern = /Over\/Under\s+([+-]?\d+(?:\.\d+)?)[\s\S]*?O\/U\s+[+-]?\d+(?:\.\d+)?[\s\S]*?\n\d+\n([+-]\d+)\n([+-]\d+)\n/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(section))) {
    const over = americanToDecimal(match[2]);
    const under = americanToDecimal(match[3]);
    if (over && under) rows.push({ line: Number(match[1]), over, under });
  }
  const selected = rows.find((row) => row.line === 2.5) || null;
  return { selected, rows };
}

async function scrapeDetail(url) {
  const actions = [
    { type: "executeJavascript", script: "document.querySelector('main')?.innerText || document.body.innerText" },
    { type: "executeJavascript", script: "[...document.querySelectorAll('li[data-testid=navigation-inactive-tab]')].find(el=>el.textContent.trim()==='Asian Handicap')?.click()" },
    { type: "wait", milliseconds: 1800 },
    { type: "executeJavascript", script: "document.querySelector('main')?.innerText || document.body.innerText" },
    { type: "executeJavascript", script: "[...document.querySelectorAll('li[data-testid=navigation-inactive-tab]')].find(el=>el.textContent.trim()==='Over/Under')?.click()" },
    { type: "wait", milliseconds: 1800 },
    { type: "executeJavascript", script: "document.querySelector('main')?.innerText || document.body.innerText" },
  ];
  const data = await firecrawl(url, actions);
  const values = (data.actions?.javascriptReturns || []).map(textResult).filter(Boolean);
  return {
    oneXTwo: parseOneXTwo(values[0] || data.markdown || ""),
    asianHandicap: parseAsianHandicap(values[1] || ""),
    overUnder: parseOverUnder(values[2] || ""),
  };
}

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const samples = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
function normalizeTwoPointFiveOdds() {
  for (const sample of samples) {
    const rows = sample?.payload?.oddsPortalOverUnder;
    if (!Array.isArray(rows)) continue;
    const twoPointFive = rows.find((row) => Number(row?.line) === 2.5);
    if (twoPointFive) {
      sample.over25Odds = twoPointFive.over;
      sample.under25Odds = twoPointFive.under;
    } else {
      delete sample.over25Odds;
      delete sample.under25Odds;
    }
  }
}
if (normalizeOnly) {
  normalizeTwoPointFiveOdds();
  if (apply) await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(samples, null, 2)};\n`, "utf8");
  console.log(JSON.stringify({ normalized: true, applied: apply, output }, null, 2));
  process.exit(0);
}
if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required");
const targets = samples.filter((sample) => sample.league === league && String(sample.season) === season);
const discovered = [];
for (let page = 1; page <= maxPages; page += 1) {
  const data = await firecrawl(resultsUrl(page));
  const rows = parseResultsPage(data.markdown || "");
  if (debug && !rows.length) console.log(String(data.markdown || "").slice(0, 5000));
  const fresh = rows.filter((row) => !discovered.some((item) => item.url === row.url));
  discovered.push(...fresh);
  console.log(JSON.stringify({ step: "results-page", page, rows: rows.length, fresh: fresh.length, total: discovered.length }));
  if (!fresh.length) break;
}

const matches = [];
for (const sample of targets) {
  const ranked = discovered.map((row) => ({ row, score: matchRow(sample, row) })).filter((item) => item.score >= 1.45).sort((a, b) => b.score - a.score);
  if (ranked.length === 1 || (ranked[0] && ranked[0].score > (ranked[1]?.score || 0) + 0.15)) matches.push({ sample, row: ranked[0].row, score: ranked[0].score });
}

let updated = 0;
const selectedMatches = matches.slice(0, limit);
let cursor = 0;
async function enrichNext() {
  const index = cursor++;
  if (index >= selectedMatches.length) return;
  const item = selectedMatches[index];
  try {
  const detail = await scrapeDetail(item.row.url);
  const oneXTwo = detail.oneXTwo || (item.row.odds1x2.length === 3 ? {
    home: item.row.odds1x2[0], draw: item.row.odds1x2[1], away: item.row.odds1x2[2], bookmakerCount: 1,
  } : null);
  if (oneXTwo) {
    item.sample.euroHomeOdds = oneXTwo.home;
    item.sample.euroDrawOdds = oneXTwo.draw;
    item.sample.euroAwayOdds = oneXTwo.away;
    item.sample.sportteryHomeSp = oneXTwo.home;
    item.sample.sportteryDrawSp = oneXTwo.draw;
    item.sample.sportteryAwaySp = oneXTwo.away;
    item.sample.bookmakerCount1x2 = oneXTwo.bookmakerCount;
  }
  if (detail.asianHandicap.selected) {
    item.sample.asianHandicap = detail.asianHandicap.selected.line;
    item.sample.asianHomeWater = detail.asianHandicap.selected.home;
    item.sample.asianAwayWater = detail.asianHandicap.selected.away;
    delete item.sample.asianHandicapLine;
    delete item.sample.asianHomeOdds;
    delete item.sample.asianAwayOdds;
  }
  if (detail.overUnder.selected) {
    item.sample.over25Odds = detail.overUnder.selected.over;
    item.sample.under25Odds = detail.overUnder.selected.under;
  }
  item.sample.payload = {
    ...(item.sample.payload || {}),
    oddsPortalUrl: item.row.url,
    oddsPortalMatchScore: item.score,
    oddsPortalAsianHandicap: detail.asianHandicap.rows,
    oddsPortalOverUnder: detail.overUnder.rows,
    oddsPortalCapturedAt: new Date().toISOString(),
  };
  item.sample.source = String(item.sample.source || "").includes("oddsportal") ? item.sample.source : `${item.sample.source}+oddsportal`;
  updated += 1;
  console.log(JSON.stringify({ step: "detail", updated, caseId: item.sample.caseId, url: item.row.url, oneXTwo, asian: detail.asianHandicap.selected, total: detail.overUnder.selected }));
  } catch (error) {
    console.error(JSON.stringify({ step: "detail-error", caseId: item.sample.caseId, url: item.row.url, message: error?.message || String(error) }));
  }
  return enrichNext();
}
await Promise.all(Array.from({ length: Math.min(concurrency, selectedMatches.length) }, () => enrichNext()));

if (apply && updated) {
  normalizeTwoPointFiveOdds();
  await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(samples, null, 2)};\n`, "utf8");
}
console.log(JSON.stringify({ league, season, targets: targets.length, discovered: discovered.length, matched: matches.length, processed: Math.min(matches.length, limit), updated, applied: apply, output }, null, 2));
