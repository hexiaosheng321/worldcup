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

const provider = String(args.get("provider") || "").toLowerCase();
const league = args.get("league") || "未分类赛事";
const season = args.get("season") || "";
const output = args.get("output") || path.join(process.cwd(), "web/data/externalHistoricalSamples.js");
const dryRun = args.get("dry-run") === "true";

function usage() {
  console.error(`Usage:
  node tools/import-free-history-api.mjs --provider football-data --competition-code CODE --season YYYY --league 联赛名 [--api-key KEY] [--dry-run]
  node tools/import-free-history-api.mjs --provider thesportsdb --league-id ID --season YYYY-YYYY --league 联赛名 [--api-key KEY] [--dry-run]

Notes:
  - Imported rows are external-history / EXTERNAL_HISTORY only.
  - Result-only API rows are used as distribution references, not Case Base locks.`);
}

if (!provider || !league || !season) {
  usage();
  process.exit(1);
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
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function result1x2(homeGoals, awayGoals) {
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return "";
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

function scoreText(homeGoals, awayGoals) {
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return "";
  return `${homeGoals}-${awayGoals}`;
}

function kickoffFromDateTime(date, time) {
  const dateText = cleanText(date);
  const timeText = cleanText(time);
  if (!dateText) return "";
  if (!timeText) return dateText;
  return `${dateText}T${timeText.replace(/Z$/i, "")}Z`;
}

function sourceUrlFor(providerName, id) {
  if (providerName === "football-data") return id ? `https://api.football-data.org/v4/matches/${id}` : "";
  if (providerName === "thesportsdb") return id ? `https://www.thesportsdb.com/event/${id}` : "";
  return "";
}

function buildExternalSample({
  source,
  sourceMatchId,
  sourceLeague,
  sourceSeason,
  homeTeam,
  awayTeam,
  kickoffTime,
  homeGoals,
  awayGoals,
  round,
  status,
  raw,
}) {
  const actualResult = result1x2(homeGoals, awayGoals);
  const score = scoreText(homeGoals, awayGoals);
  const complete = Boolean(actualResult && score);
  const normalizedSeason = sourceSeason || season;
  const normalizedLeague = league || sourceLeague || "未分类赛事";
  return {
    caseId: `external-${source}-${slug(normalizedLeague)}-${slug(normalizedSeason)}-${slug(sourceMatchId || `${kickoffTime}-${homeTeam}-${awayTeam}`)}`,
    sampleType: "external-history",
    source,
    sourceUrl: sourceUrlFor(source, sourceMatchId),
    sourceCapturedAt: new Date().toISOString(),
    matchId: sourceMatchId || `${normalizedSeason}-${slug(homeTeam)}-${slug(awayTeam)}-${slug(kickoffTime)}`,
    league: normalizedLeague,
    season: normalizedSeason,
    homeTeam,
    awayTeam,
    kickoffTime,
    modelVersion: "EXTERNAL_HISTORY",
    recommendation: "外部赛果样本",
    recommendationSide: "",
    bookmakerCount1x2: 0,
    bookmakerCountTotal: 0,
    dataQuality: complete ? "MEDIUM" : "LOW",
    actualResult,
    actualHomeGoals: homeGoals,
    actualAwayGoals: awayGoals,
    actualGoals: complete ? homeGoals + awayGoals : undefined,
    score,
    hitStatus: "VOID",
    payload: {
      sampleRole: "external-reference",
      sampleGrade: complete ? "C" : "D",
      resultOnly: true,
      sourceLeague,
      sourceSeason: normalizedSeason,
      round,
      status,
      raw,
    },
  };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

async function fetchFootballDataSamples() {
  const competitionCode = args.get("competition-code");
  const apiKey = args.get("api-key") || process.env.FOOTBALL_DATA_API_KEY || "";
  if (!competitionCode) throw new Error("Missing --competition-code for football-data provider");
  if (!apiKey) throw new Error("Missing --api-key or FOOTBALL_DATA_API_KEY for football-data provider");
  const url = new URL(`https://api.football-data.org/v4/competitions/${encodeURIComponent(competitionCode)}/matches`);
  url.searchParams.set("season", season);
  const raw = await fetchJson(url, { "X-Auth-Token": apiKey });
  return (raw.matches || []).map((match) => {
    const full = match.score?.regularTime || match.score?.fullTime || {};
    const homeGoals = numberOrUndefined(full.home);
    const awayGoals = numberOrUndefined(full.away);
    return buildExternalSample({
      source: "football-data",
      sourceMatchId: cleanText(match.id),
      sourceLeague: cleanText(raw.competition?.name || match.competition?.name),
      sourceSeason: cleanText(raw.season?.startDate || "").slice(0, 4) || season,
      homeTeam: cleanText(match.homeTeam?.name),
      awayTeam: cleanText(match.awayTeam?.name),
      kickoffTime: cleanText(match.utcDate),
      homeGoals,
      awayGoals,
      round: match.matchday ? `matchday-${match.matchday}` : cleanText(match.stage),
      status: cleanText(match.status),
      raw: match,
    });
  });
}

async function fetchTheSportsDbSamples() {
  const leagueId = args.get("league-id");
  const apiKey = args.get("api-key") || process.env.THESPORTSDB_API_KEY || "3";
  if (!leagueId) throw new Error("Missing --league-id for thesportsdb provider");
  const url = new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(apiKey)}/eventsseason.php`);
  url.searchParams.set("id", leagueId);
  url.searchParams.set("s", season);
  const raw = await fetchJson(url);
  return (raw.events || []).map((event) =>
    buildExternalSample({
      source: "thesportsdb",
      sourceMatchId: cleanText(event.idEvent),
      sourceLeague: cleanText(event.strLeague),
      sourceSeason: cleanText(event.strSeason) || season,
      homeTeam: cleanText(event.strHomeTeam),
      awayTeam: cleanText(event.strAwayTeam),
      kickoffTime: cleanText(event.strTimestamp) || kickoffFromDateTime(event.dateEvent, event.strTime),
      homeGoals: numberOrUndefined(event.intHomeScore),
      awayGoals: numberOrUndefined(event.intAwayScore),
      round: cleanText(event.intRound),
      status: cleanText(event.strStatus),
      raw: event,
    }),
  );
}

function readExistingSamples(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const found = text.match(/window\.WC_EXTERNAL_HISTORICAL_SAMPLES\s*=\s*(\[[\s\S]*?\]);/);
  return found ? JSON.parse(found[1]) : [];
}

function mergeSamples(current, imported) {
  const merged = new Map(
    current.map((item) => [`${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`, item]),
  );
  imported.forEach((item) => {
    if (!item.homeTeam || !item.awayTeam || !item.kickoffTime) return;
    const key = `${item.source}|${item.league}|${item.season}|${item.kickoffTime}|${item.homeTeam}|${item.awayTeam}`;
    merged.set(key, item);
  });
  return [...merged.values()].sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)));
}

const fetchers = {
  "football-data": fetchFootballDataSamples,
  thesportsdb: fetchTheSportsDbSamples,
};

if (!fetchers[provider]) {
  usage();
  throw new Error(`Unsupported provider: ${provider}`);
}

const imported = (await fetchers[provider]()).filter((item) => item.dataQuality !== "LOW" || args.get("include-incomplete") === "true");
const current = readExistingSamples(output);
const merged = mergeSamples(current, imported);

if (!dryRun) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      provider,
      league,
      season,
      fetched: imported.length,
      existing: current.length,
      total: merged.length,
      dryRun,
      output,
    },
    null,
    2,
  ),
);
