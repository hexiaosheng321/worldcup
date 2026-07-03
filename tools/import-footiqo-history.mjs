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

const oddsJson = args.get("odds-json");
const scoresJson = args.get("scores-json");
const league = args.get("league") || "世界杯";
const source = args.get("source") || "footiqo";
const sourceUrl = args.get("source-url") || "https://footiqo.com/database/leagues/world-cup/";
const output = args.get("output") || path.join(process.cwd(), "web/data/externalHistoricalSamples.js");
const dryRun = args.get("dry-run") === "true";

if (!oddsJson || !scoresJson) {
  console.error(`Usage:
  node tools/import-footiqo-history.mjs --odds-json /tmp/odds.json --scores-json /tmp/scores.json --league 世界杯 [--dry-run]

Notes:
  - Imports Footiqo wpDataTables JSON exports as external-history samples.
  - Footiqo World Cup odds include 1X2, totals 0.5/1.5/2.5/3.5/4.5, and BTTS.
  - No Asian handicap line/water is inferred.`);
  process.exit(1);
}

const ODDS_COLUMNS = [
  "id",
  "matchDate",
  "Country",
  "League",
  "Season",
  "homeTeam",
  "awayTeam",
  "xbetClose1FT",
  "xbetCloseXFT",
  "xbetClose2FT",
  "xbetCloseOver05",
  "xbetCloseUnder05",
  "xbetCloseOver15",
  "xbetCloseUnder15",
  "xbetCloseOver25",
  "xbetCloseUnder25",
  "xbetCloseOver35",
  "xbetCloseUnder35",
  "xbetCloseOver45",
  "xbetCloseUnder45",
  "xbetCloseBTTSY",
  "xbetCloseBTTSN",
];

const SCORE_COLUMNS = [
  "id",
  "matchDate",
  "Country",
  "League",
  "Season",
  "homeTeam",
  "awayTeam",
  "ftHomeTeamGoals",
  "ftAwayTeamGoals",
  "ftResult",
  "htHomeTeamGoals",
  "htAwayTeamGoals",
  "htResult",
  "stHomeTeamGoals",
  "stAwayTeamGoals",
  "stResult",
];

function readWpDataTablesJson(filePath, columns) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed.data)) {
    throw new Error(`Invalid Footiqo JSON data: ${filePath}`);
  }
  return parsed.data.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])));
}

function readExistingSamples(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const found = text.match(/window\.WC_EXTERNAL_HISTORICAL_SAMPLES\s*=\s*(\[[\s\S]*?\]);/);
  return found ? JSON.parse(found[1]) : [];
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function slug(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function numberOrUndefined(value) {
  const text = cleanText(value);
  if (!text || text === "-") return undefined;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function parseFootiqoDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{2})-(\d{2})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return text;
  const [, dd, mm, yy, hh = "00", min = "00"] = match;
  const rawYear = Number(yy);
  const year = rawYear < 100 ? (rawYear >= 80 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  return `${year}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00`;
}

function result1x2(homeGoals, awayGoals, fallback = "") {
  if (Number.isFinite(homeGoals) && Number.isFinite(awayGoals)) {
    if (homeGoals > awayGoals) return "HOME";
    if (homeGoals < awayGoals) return "AWAY";
    return "DRAW";
  }
  if (fallback === "H") return "HOME";
  if (fallback === "A") return "AWAY";
  if (fallback === "D") return "DRAW";
  return "";
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
  return "外部赔率样本";
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

function sampleKey(row) {
  return [row.matchDate, row.Season, row.homeTeam, row.awayTeam].map(cleanText).join("|");
}

const oddsRows = readWpDataTablesJson(oddsJson, ODDS_COLUMNS);
const scoreRows = readWpDataTablesJson(scoresJson, SCORE_COLUMNS);
const scoreByKey = new Map(scoreRows.map((row) => [sampleKey(row), row]));

const samples = oddsRows.map((oddsRow, index) => {
  const scoreRow = scoreByKey.get(sampleKey(oddsRow));
  if (!scoreRow) return null;
  const homeGoals = numberOrUndefined(scoreRow.ftHomeTeamGoals);
  const awayGoals = numberOrUndefined(scoreRow.ftAwayTeamGoals);
  const actualResult = result1x2(homeGoals, awayGoals, scoreRow.ftResult);
  const homeOdds = numberOrUndefined(oddsRow.xbetClose1FT);
  const drawOdds = numberOrUndefined(oddsRow.xbetCloseXFT);
  const awayOdds = numberOrUndefined(oddsRow.xbetClose2FT);
  const over25Odds = numberOrUndefined(oddsRow.xbetCloseOver25);
  const under25Odds = numberOrUndefined(oddsRow.xbetCloseUnder25);
  const recommendationSide = marketSide(homeOdds, drawOdds, awayOdds);
  const has1x2 = [homeOdds, drawOdds, awayOdds].every(Number.isFinite);
  const hasTotal = [over25Odds, under25Odds].every(Number.isFinite);
  const kickoffTime = parseFootiqoDate(oddsRow.matchDate);
  const season = cleanText(oddsRow.Season);
  const score = Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? `${homeGoals}-${awayGoals}` : "";
  return {
    caseId: `external-${source}-${slug(league)}-${slug(season)}-${slug(oddsRow.id || index + 1)}`,
    sampleType: "external-history",
    source,
    sourceUrl,
    sourceCapturedAt: new Date().toISOString(),
    matchId: `${source}-${season}-${oddsRow.id || index + 1}`,
    league,
    sourceLeague: oddsRow.League,
    season,
    homeTeam: oddsRow.homeTeam,
    awayTeam: oddsRow.awayTeam,
    kickoffTime,
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
    bookmakerCount1x2: has1x2 ? 1 : undefined,
    bookmakerCountTotal: hasTotal ? 1 : undefined,
    dataQuality: has1x2 && hasTotal ? "MEDIUM" : has1x2 ? "MEDIUM" : "LOW",
    actualResult,
    actualHomeGoals: homeGoals,
    actualAwayGoals: awayGoals,
    actualGoals: score ? homeGoals + awayGoals : undefined,
    score,
    hitStatus: recommendationSide && actualResult ? (recommendationSide === actualResult ? "WIN" : "LOSE") : "VOID",
    payload: {
      sampleRole: "external-market-reference",
      sourceProvider: "Footiqo",
      marketProvider: "1xBet closing odds",
      noAsianHandicap: true,
      sourceCountry: oddsRow.Country,
      sourceLeague: oddsRow.League,
      sourceScoreRowId: scoreRow.id,
      footiqoOdds: {
        over05: numberOrUndefined(oddsRow.xbetCloseOver05),
        under05: numberOrUndefined(oddsRow.xbetCloseUnder05),
        over15: numberOrUndefined(oddsRow.xbetCloseOver15),
        under15: numberOrUndefined(oddsRow.xbetCloseUnder15),
        over25: over25Odds,
        under25: under25Odds,
        over35: numberOrUndefined(oddsRow.xbetCloseOver35),
        under35: numberOrUndefined(oddsRow.xbetCloseUnder35),
        over45: numberOrUndefined(oddsRow.xbetCloseOver45),
        under45: numberOrUndefined(oddsRow.xbetCloseUnder45),
        bttsYes: numberOrUndefined(oddsRow.xbetCloseBTTSY),
        bttsNo: numberOrUndefined(oddsRow.xbetCloseBTTSN),
      },
      halfTime: {
        homeGoals: numberOrUndefined(scoreRow.htHomeTeamGoals),
        awayGoals: numberOrUndefined(scoreRow.htAwayTeamGoals),
        result: scoreRow.htResult,
      },
      secondHalf: {
        homeGoals: numberOrUndefined(scoreRow.stHomeTeamGoals),
        awayGoals: numberOrUndefined(scoreRow.stAwayTeamGoals),
        result: scoreRow.stResult,
      },
    },
  };
}).filter(Boolean);

const missingScoreRows = oddsRows.length - samples.length;
const unique = new Map();
samples.forEach((item) => {
  const key = `${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`;
  if (!unique.has(key)) unique.set(key, item);
});

const current = readExistingSamples(output);
const merged = new Map(current.map((item) => [`${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`, item]));
unique.forEach((item, key) => merged.set(key, item));
const result = [...merged.values()].sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)));

if (!dryRun) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(result, null, 2)};\n`,
    "utf8",
  );
}

console.log(JSON.stringify({
  source,
  league,
  oddsRows: oddsRows.length,
  scoreRows: scoreRows.length,
  missingScoreRows,
  imported: unique.size,
  total: result.length,
  dryRun,
  output,
}, null, 2));
