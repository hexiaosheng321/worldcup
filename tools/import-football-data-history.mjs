import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const item = process.argv[i];
  if (!item.startsWith("--")) continue;
  const key = item.slice(2);
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
  args.set(key, value);
}

const output = args.get("output") || path.join(process.cwd(), "web/data/externalHistoricalSamples.js");
const dryRun = args.get("dry-run") === "true";
const source = args.get("source") || "football-data";
const fetchDelayMs = Number(args.get("delay-ms") || 350);
const sampleLimit = Number(args.get("limit") || 0);

const LEAGUE_PRESETS = {
  "英超": { label: "英超", code: "E0", seasons: ["2526", "2425"], kind: "europe" },
  "西甲": { label: "西甲", code: "SP1", seasons: ["2526", "2425"], kind: "europe" },
  "德甲": { label: "德甲", code: "D1", seasons: ["2526", "2425"], kind: "europe" },
  "意甲": { label: "意甲", code: "I1", seasons: ["2526", "2425"], kind: "europe" },
  "法甲": { label: "法甲", code: "F1", seasons: ["2526", "2425"], kind: "europe" },
  "荷甲": { label: "荷甲", code: "N1", seasons: ["2526", "2425"], kind: "europe" },
  "葡超": { label: "葡超", code: "P1", seasons: ["2526", "2425"], kind: "europe" },
  "丹超": { label: "丹超", code: "DNK", seasons: ["2026", "2025"], kind: "year" },
  "芬超": { label: "芬超", code: "FIN", seasons: ["2026", "2025"], kind: "year" },
  "挪超": { label: "挪超", code: "NOR", seasons: ["2026", "2025"], kind: "year" },
  "瑞超": { label: "瑞超", code: "SWE", seasons: ["2026", "2025"], kind: "year" },
  "日职": { label: "日职", code: "JPN", seasons: ["2026", "2025"], kind: "year" },
  "中超": { label: "中超", code: "CHN", seasons: ["2026", "2025"], kind: "year" },
  "美职": { label: "美职", code: "USA", seasons: ["2026", "2025"], kind: "year" },
};

function usage() {
  console.error(`Usage:
  node tools/import-football-data-history.mjs --leagues 英超,西甲,德甲,意甲,法甲,荷甲,葡超,瑞超,挪超,芬超,丹超,日职,中超,美职
  node tools/import-football-data-history.mjs --league 瑞超 --seasons 2026,2025
  node tools/import-football-data-history.mjs --input /path/to/E0.csv --league 英超 --season 2425
  node tools/import-football-data-history.mjs --input-dir /path/to/football-data-csv --leagues 瑞超,挪超,芬超

Notes:
  - Imports Football-Data.co.uk CSV samples as external-history.
  - Uses closing average odds when available, then average odds, then bookmaker odds.
  - Maps 1X2, over/under 2.5, Asian handicap line and Asian handicap water.`);
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
    .filter((line) => line.some((cell) => cleanText(cell)))
    .map((line) => Object.fromEntries(headers.map((header, index) => [cleanText(header), cleanText(line[index] || "")])));
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = numberOrUndefined(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function parseFootballDataDate(value, time = "") {
  const text = cleanText(value);
  const parts = text.split(/[/-]/).map((item) => Number(item));
  if (parts.length < 3 || parts.some((item) => !Number.isFinite(item))) return text;
  const [day, month, rawYear] = parts;
  const year = rawYear < 100 ? (rawYear >= 80 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  const timeText = cleanText(time) || "00:00";
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(timeText) ? timeText.padStart(5, "0") : "00:00";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${normalizedTime}:00`;
}

function result1x2(homeGoals, awayGoals) {
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return "";
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

function footballDataUrl(season, code) {
  return `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
}

function localCsvPath(inputDir, season, code) {
  const candidates = [
    path.join(inputDir, String(season), `${code}.csv`),
    path.join(inputDir, `${season}-${code}.csv`),
    path.join(inputDir, `${code}-${season}.csv`),
    path.join(inputDir, `${code}.csv`),
  ];
  return candidates.find((item) => fs.existsSync(item)) || "";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "text/csv,text/plain,*/*",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Football-Data ${response.status}: ${url}`);
  return response.text();
}

function readExistingSamples(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const found = text.match(/window\.WC_EXTERNAL_HISTORICAL_SAMPLES\s*=\s*(\[[\s\S]*?\]);/);
  return found ? JSON.parse(found[1]) : [];
}

function buildSample(row, preset, season, index, sourceUrl) {
  const homeGoals = numberOrUndefined(row.FTHG ?? row.HG);
  const awayGoals = numberOrUndefined(row.FTAG ?? row.AG);
  const actualResult = result1x2(homeGoals, awayGoals);
  const homeOdds = firstNumber(row, ["AvgCH", "AvgH", "B365CH", "B365H", "MaxCH", "MaxH", "PSCH", "PSH"]);
  const drawOdds = firstNumber(row, ["AvgCD", "AvgD", "B365CD", "B365D", "MaxCD", "MaxD", "PSCD", "PSD"]);
  const awayOdds = firstNumber(row, ["AvgCA", "AvgA", "B365CA", "B365A", "MaxCA", "MaxA", "PSCA", "PSA"]);
  const over25Odds = firstNumber(row, ["AvgC>2.5", "Avg>2.5", "B365C>2.5", "B365>2.5", "MaxC>2.5", "Max>2.5", "PC>2.5", "P>2.5"]);
  const under25Odds = firstNumber(row, ["AvgC<2.5", "Avg<2.5", "B365C<2.5", "B365<2.5", "MaxC<2.5", "Max<2.5", "PC<2.5", "P<2.5"]);
  const asianHandicap = firstNumber(row, ["AHh", "AHCh"]);
  const asianHomeWater = firstNumber(row, ["AvgCAHH", "AvgAHH", "B365CAHH", "B365AHH", "MaxCAHH", "MaxAHH", "PCAHH", "PAHH"]);
  const asianAwayWater = firstNumber(row, ["AvgCAHA", "AvgAHA", "B365CAHA", "B365AHA", "MaxCAHA", "MaxAHA", "PCAHA", "PAHA"]);
  const recommendationSide = marketSide(homeOdds, drawOdds, awayOdds);
  const has1x2 = [homeOdds, drawOdds, awayOdds].every(Number.isFinite);
  const hasTotal = [over25Odds, under25Odds].every(Number.isFinite);
  const hasAsian = Number.isFinite(asianHandicap) && [asianHomeWater, asianAwayWater].every(Number.isFinite);
  const bookmakerCount1x2 = Number(row.Bb1X2 || row.BbMxH || 0) || undefined;
  const bookmakerCountTotal = Number(row.BbOU || row.BbMxOU || 0) || undefined;
  const bookmakerCountAsian = Number(row.BbAH || row.BbMxAH || 0) || undefined;
  const dataQuality = has1x2 && hasTotal && hasAsian ? "HIGH" : has1x2 && (hasTotal || hasAsian) ? "MEDIUM" : has1x2 ? "MEDIUM" : "LOW";
  const kickoffTime = parseFootballDataDate(row.Date, row.Time);
  const score = Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? `${homeGoals}-${awayGoals}` : "";
  return {
    caseId: `external-football-data-${slug(preset.label)}-${slug(season)}-${slug(row.Date)}-${index + 1}`,
    sampleType: "external-history",
    source,
    sourceUrl,
    sourceCapturedAt: new Date().toISOString(),
    matchId: `${source}-${season}-${preset.code}-${index + 1}`,
    league: preset.label,
    season: String(season),
    homeTeam: row.HomeTeam,
    awayTeam: row.AwayTeam,
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
    asianHandicap,
    asianHomeWater,
    asianAwayWater,
    bookmakerCount1x2,
    bookmakerCountTotal,
    bookmakerCountAsian,
    dataQuality,
    actualResult,
    actualHomeGoals: homeGoals,
    actualAwayGoals: awayGoals,
    actualGoals: score ? homeGoals + awayGoals : undefined,
    score,
    hitStatus: recommendationSide && actualResult ? (recommendationSide === actualResult ? "WIN" : "LOSE") : "VOID",
    payload: {
      sampleRole: "external-market-reference",
      resultOnly: !has1x2,
      sourceLeagueCode: preset.code,
      sourceSeason: String(season),
      div: row.Div,
      halfTimeScore: [row.HTHG, row.HTAG].filter((item) => item !== undefined && item !== "").join("-"),
      halfTimeResult: row.HTR,
      rawRow: row,
    },
  };
}

function mergeSamples(current, imported) {
  const merged = new Map(
    current.map((item) => [`${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`, item]),
  );
  imported.forEach((item) => {
    if (!item.homeTeam || !item.awayTeam || !item.kickoffTime || item.dataQuality === "LOW") return;
    const key = `${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`;
    merged.set(key, item);
  });
  return [...merged.values()].sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)));
}

function requestedPresets() {
  if (args.get("input")) {
    const label = args.get("league") || args.get("label");
    const code = args.get("code") || "LOCAL";
    if (!label || !args.get("season")) {
      usage();
      throw new Error("--input requires --league and --season.");
    }
    return [{ label, code, seasons: [args.get("season")], input: args.get("input") }];
  }
  const names = (args.get("leagues") || args.get("league") || "英超,西甲,德甲,意甲,法甲,荷甲,葡超,瑞超,挪超,芬超,丹超,日职,中超,美职")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const overrideSeasons = (args.get("seasons") || args.get("season") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return names.map((name) => {
    const preset = LEAGUE_PRESETS[name];
    if (!preset) throw new Error(`Unknown Football-Data league preset: ${name}`);
    return {
      ...preset,
      seasons: overrideSeasons.length ? overrideSeasons : preset.seasons,
      inputDir: args.get("input-dir") || "",
    };
  });
}

const reports = [];
const imported = [];
for (const preset of requestedPresets()) {
  for (const season of preset.seasons) {
    const localPath = preset.input || (preset.inputDir ? localCsvPath(path.resolve(preset.inputDir), season, preset.code) : "");
    if (preset.inputDir && !localPath) {
      reports.push({
        league: preset.label,
        code: preset.code,
        season,
        sourceUrl: footballDataUrl(season, preset.code),
        inputRows: 0,
        imported: 0,
        withOdds: 0,
        withTotal: 0,
        withAsian: 0,
        skipped: "local CSV not found",
      });
      continue;
    }
    const url = localPath ? path.resolve(localPath) : footballDataUrl(season, preset.code);
    const csv = localPath ? fs.readFileSync(url, "utf8") : await fetchText(url);
    const rows = parseCsv(csv).filter((row) => row.HomeTeam && row.AwayTeam && row.Date);
    const samples = rows
      .map((row, index) => buildSample(row, preset, season, index, preset.input ? url : footballDataUrl(season, preset.code)))
      .filter((item) => item.score)
      .filter((item) => item.dataQuality !== "LOW");
    const limited = sampleLimit > 0 ? samples.slice(-sampleLimit) : samples;
    reports.push({
      league: preset.label,
      code: preset.code,
      season,
      sourceUrl: preset.input ? url : footballDataUrl(season, preset.code),
      inputRows: rows.length,
      imported: limited.length,
      withOdds: limited.filter((item) => Number.isFinite(Number(item.euroHomeOdds))).length,
      withTotal: limited.filter((item) => Number.isFinite(Number(item.over25Odds)) && Number.isFinite(Number(item.under25Odds))).length,
      withAsian: limited.filter((item) => Number.isFinite(Number(item.asianHandicap))).length,
    });
    imported.push(...limited);
    if (!preset.input && fetchDelayMs > 0) await delay(fetchDelayMs);
  }
}

const current = readExistingSamples(output);
const merged = mergeSamples(current, imported);

if (!dryRun) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");
}

console.log(JSON.stringify({
  provider: "football-data",
  imported: imported.length,
  importedWithOdds: imported.filter((item) => Number.isFinite(Number(item.euroHomeOdds))).length,
  importedWithAsian: imported.filter((item) => Number.isFinite(Number(item.asianHandicap))).length,
  existing: current.length,
  total: merged.length,
  dryRun,
  output,
  reports,
}, null, 2));
