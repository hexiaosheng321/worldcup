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

const input = args.get("input");
const league = args.get("league") || "未分类赛事";
const season = args.get("season") || "";
const source = args.get("source") || "oddsportal";
const output = args.get("output") || path.join(process.cwd(), "web/data/externalHistoricalSamples.js");

if (!input) {
  console.error("Missing --input");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quote) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quote = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quote = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter((line) => line.some((cell) => String(cell || "").trim()))
    .map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] || ""])));
}

function parsePythonList(value) {
  const text = String(value || "").trim();
  if (!text || text === "[]") return [];
  try {
    return JSON.parse(text.replace(/'/g, '"'));
  } catch {
    return [];
  }
}

function cleanNumber(value) {
  const text = String(value || "").trim().split("(")[0];
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return undefined;
  return Number((numbers.reduce((sum, item) => sum + item, 0) / numbers.length).toFixed(3));
}

function impliedProbabilities(homeOdds, drawOdds, awayOdds) {
  if (![homeOdds, drawOdds, awayOdds].every(Number.isFinite)) return {};
  const raw = [1 / homeOdds, 1 / drawOdds, 1 / awayOdds];
  const total = raw.reduce((sum, item) => sum + item, 0);
  return {
    euroHomeProb: Number((raw[0] / total).toFixed(4)),
    euroDrawProb: Number((raw[1] / total).toFixed(4)),
    euroAwayProb: Number((raw[2] / total).toFixed(4)),
  };
}

function result1x2(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

function marketSide(homeOdds, drawOdds, awayOdds) {
  const rows = [
    ["HOME", homeOdds],
    ["DRAW", drawOdds],
    ["AWAY", awayOdds],
  ].filter(([, value]) => Number.isFinite(value));
  rows.sort((a, b) => a[1] - b[1]);
  return rows[0]?.[0] || "";
}

function sideLabel(side) {
  if (side === "HOME") return "市场主胜";
  if (side === "DRAW") return "市场平局";
  if (side === "AWAY") return "市场客胜";
  return "市场方向";
}

const csv = fs.readFileSync(input, "utf8");
const rows = parseCsv(csv);
const samples = rows.map((row, index) => {
  const market = parsePythonList(row["1x2_market"]).filter((item) => item.period === "FullTime");
  const totals = parsePythonList(row.over_under_2_5_market).filter((item) => item.period === "FullTime");
  const homeOdds = average(market.map((item) => cleanNumber(item["1"])));
  const drawOdds = average(market.map((item) => cleanNumber(item.X)));
  const awayOdds = average(market.map((item) => cleanNumber(item["2"])));
  const over25Odds = average(totals.map((item) => cleanNumber(item.odds_over)));
  const under25Odds = average(totals.map((item) => cleanNumber(item.odds_under)));
  const homeGoals = Number(row.home_score);
  const awayGoals = Number(row.away_score);
  const recommendationSide = marketSide(homeOdds, drawOdds, awayOdds);
  const actualResult = result1x2(homeGoals, awayGoals);
  return {
    caseId: `external-${source}-${league}-${season}-${index + 1}`.replace(/\s+/g, "-").toLowerCase(),
    sampleType: "external-history",
    source,
    sourceUrl: row.match_link || "",
    sourceCapturedAt: row.scraped_date || "",
    matchId: row.match_link ? row.match_link.split("#").pop() : `${season}-${index + 1}`,
    league,
    season,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffTime: row.match_date,
    modelVersion: "EXTERNAL_HISTORY",
    recommendation: sideLabel(recommendationSide),
    recommendationSide,
    sportteryHomeSp: homeOdds,
    sportteryDrawSp: drawOdds,
    sportteryAwaySp: awayOdds,
    euroHomeOdds: homeOdds,
    euroDrawOdds: drawOdds,
    euroAwayOdds: awayOdds,
    ...impliedProbabilities(homeOdds, drawOdds, awayOdds),
    over25Odds,
    under25Odds,
    bookmakerCount1x2: market.length,
    bookmakerCountTotal: totals.length,
    dataQuality: market.length >= 8 && totals.length >= 6 ? "HIGH" : market.length >= 3 ? "MEDIUM" : "LOW",
    actualResult,
    actualHomeGoals: homeGoals,
    actualAwayGoals: awayGoals,
    actualGoals: homeGoals + awayGoals,
    score: `${homeGoals}-${awayGoals}`,
    hitStatus: recommendationSide === actualResult ? "WIN" : "LOSE",
    venue: row.venue || "",
    venueTown: row.venue_town || "",
    venueCountry: row.venue_country || "",
    payload: {
      leagueName: row.league_name,
      partialResults: row.partial_results,
      oneXTwoMarket: market,
      overUnder25Market: totals,
    },
  };
});

const byId = new Map();
samples.forEach((item) => {
  const key = `${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`;
  if (!byId.has(key)) byId.set(key, item);
});
const unique = [...byId.values()].sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)));

const existing = fs.existsSync(output)
  ? fs.readFileSync(output, "utf8").match(/window\.WC_EXTERNAL_HISTORICAL_SAMPLES\s*=\s*(\[[\s\S]*?\]);/)
  : null;
const current = existing ? JSON.parse(existing[1]) : [];
const merged = new Map(current.map((item) => [`${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`, item]));
unique.forEach((item) => merged.set(`${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`, item));
const result = [...merged.values()].sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)));

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(result, null, 2)};\n`,
  "utf8",
);

console.log(JSON.stringify({ inputRows: rows.length, imported: unique.length, total: result.length, output }, null, 2));
