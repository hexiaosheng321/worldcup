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

const output = args.get("output") || path.join(process.cwd(), "web/data/externalHistoricalSamples.js");
const dryRun = args.get("dry-run") === "true";
const seasons = (args.get("seasons") || args.get("season") || "2026,2025")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const sampleLimit = Number(args.get("limit") || 100);
const includeIncomplete = args.get("include-incomplete") === "true";
const withOdds = args.get("with-odds") !== "false";
const apiKey =
  args.get("api-key") ||
  process.env.APISPORTS_API_KEY ||
  process.env.API_FOOTBALL_V3_KEY ||
  process.env.APIFOOTBALL_V3_API_KEY ||
  "";

const LEAGUE_PRESETS = {
  "瑞超": { label: "瑞超", apiFootballLeagueId: 113, sourceName: "Swedish Allsvenskan" },
  "韩职": { label: "韩职", apiFootballLeagueId: 292, sourceName: "K League 1" },
  "韩职2": { label: "韩职", apiFootballLeagueId: 293, sourceName: "K League 2" },
  "日职": { label: "日职", apiFootballLeagueId: 98, sourceName: "J1 League" },
  "芬超": { label: "芬超", apiFootballLeagueId: 244, sourceName: "Veikkausliiga" },
  "挪超": { label: "挪超", apiFootballLeagueId: 103, sourceName: "Eliteserien" },
  "丹超": { label: "丹超", apiFootballLeagueId: 119, sourceName: "Superliga" },
  "法甲": { label: "法甲", apiFootballLeagueId: 61, sourceName: "Ligue 1" },
  "英超": { label: "英超", apiFootballLeagueId: 39, sourceName: "Premier League" },
  "西甲": { label: "西甲", apiFootballLeagueId: 140, sourceName: "La Liga" },
  "德甲": { label: "德甲", apiFootballLeagueId: 78, sourceName: "Bundesliga" },
  "意甲": { label: "意甲", apiFootballLeagueId: 135, sourceName: "Serie A" },
  "荷甲": { label: "荷甲", apiFootballLeagueId: 88, sourceName: "Eredivisie" },
  "葡超": { label: "葡超", apiFootballLeagueId: 94, sourceName: "Primeira Liga" },
  "美职": { label: "美职", apiFootballLeagueId: 253, sourceName: "Major League Soccer" },
  "中超": { label: "中超", apiFootballLeagueId: 169, sourceName: "Chinese Super League" },
  "澳超": { label: "澳超", apiFootballLeagueId: 188, sourceName: "A-League" },
  "欧冠": { label: "欧冠", apiFootballLeagueId: 2, sourceName: "UEFA Champions League" },
  "欧联": { label: "欧联", apiFootballLeagueId: 3, sourceName: "UEFA Europa League" },
  "亚冠精英": { label: "亚冠精英", apiFootballLeagueId: 17, sourceName: "AFC Champions League Elite" },
  "亚冠二级": { label: "亚冠二级", apiFootballLeagueId: 18, sourceName: "AFC Champions League Two" },
};

function usage() {
  console.error(`Usage:
  node tools/import-api-football-history.mjs --leagues 瑞超,韩职,韩职2 --seasons 2026,2025 [--limit 100] [--api-key KEY] [--dry-run]
  node tools/import-api-football-history.mjs --league-id 113 --league 瑞超 --seasons 2026,2025 [--api-key KEY]

Env:
  APISPORTS_API_KEY or API_FOOTBALL_V3_KEY or APIFOOTBALL_V3_API_KEY

Notes:
  - Writes external-history / EXTERNAL_HISTORY samples only.
  - Case Base remains limited to project FINAL_LOCK -> result -> review samples.`);
}

if (!apiKey) {
  usage();
  throw new Error("Missing API-Football v3 key. Pass --api-key or set APISPORTS_API_KEY.");
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

function average(values) {
  const numbers = values.map(numberOrUndefined).filter(Number.isFinite);
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
  return "外部赛果样本";
}

function scoreText(homeGoals, awayGoals) {
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return "";
  return `${homeGoals}-${awayGoals}`;
}

async function fetchApiFootball(pathname, params = {}) {
  const url = new URL(`https://v3.football.api-sports.io/${pathname.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`API-Football ${response.status}: ${text.slice(0, 240)}`);
  const raw = JSON.parse(text);
  const errors = raw?.errors;
  if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) {
    throw new Error(`API-Football errors: ${JSON.stringify(errors).slice(0, 240)}`);
  }
  return raw;
}

async function fetchPaged(pathname, params = {}) {
  const first = await fetchApiFootball(pathname, params);
  const total = Number(first?.paging?.total || 1);
  const rows = [...(first.response || [])];
  for (let page = 2; page <= total; page += 1) {
    const next = await fetchApiFootball(pathname, { ...params, page });
    rows.push(...(next.response || []));
  }
  return rows;
}

function normalizeFixture(row, fallback = {}) {
  const homeGoals = numberOrUndefined(row.goals?.home ?? row.score?.fulltime?.home);
  const awayGoals = numberOrUndefined(row.goals?.away ?? row.score?.fulltime?.away);
  return {
    sourceMatchId: cleanText(row.fixture?.id),
    sourceLeague: cleanText(row.league?.name || fallback.sourceName),
    sourceSeason: cleanText(row.league?.season || fallback.season),
    homeTeam: cleanText(row.teams?.home?.name),
    awayTeam: cleanText(row.teams?.away?.name),
    kickoffTime: cleanText(row.fixture?.date),
    homeGoals,
    awayGoals,
    round: cleanText(row.league?.round),
    status: cleanText(row.fixture?.status?.short || row.fixture?.status?.long),
    rawFixture: row,
  };
}

function oddsValuesByName(oddsRow = {}) {
  const result = {
    matchWinner: [],
    over25: [],
    under25: [],
    rawOdds: oddsRow,
  };
  for (const bookmaker of oddsRow.bookmakers || []) {
    for (const bet of bookmaker.bets || []) {
      const betName = cleanText(bet.name).toLowerCase();
      const values = bet.values || [];
      if (/match winner|1x2|winner/.test(betName) && !/half|period|extra/.test(betName)) {
        const home = values.find((item) => /^home$/i.test(cleanText(item.value)) || /^1$/.test(cleanText(item.value)));
        const draw = values.find((item) => /^draw$/i.test(cleanText(item.value)) || /^x$/i.test(cleanText(item.value)));
        const away = values.find((item) => /^away$/i.test(cleanText(item.value)) || /^2$/.test(cleanText(item.value)));
        result.matchWinner.push({
          bookmaker: bookmaker.name || bookmaker.id || "",
          home: numberOrUndefined(home?.odd),
          draw: numberOrUndefined(draw?.odd),
          away: numberOrUndefined(away?.odd),
        });
      }
      if (/goals over\/under|over\/under|total/i.test(bet.name || "")) {
        const over = values.find((item) => /^over\s*2\.5$/i.test(cleanText(item.value)));
        const under = values.find((item) => /^under\s*2\.5$/i.test(cleanText(item.value)));
        if (over) result.over25.push({ bookmaker: bookmaker.name || bookmaker.id || "", odd: numberOrUndefined(over.odd) });
        if (under) result.under25.push({ bookmaker: bookmaker.name || bookmaker.id || "", odd: numberOrUndefined(under.odd) });
      }
    }
  }
  return result;
}

function buildSample(fixture, odds, preset, season) {
  const actualResult = result1x2(fixture.homeGoals, fixture.awayGoals);
  const score = scoreText(fixture.homeGoals, fixture.awayGoals);
  const complete = Boolean(actualResult && score);
  const matchWinner = odds.matchWinner || [];
  const homeOdds = average(matchWinner.map((item) => item.home));
  const drawOdds = average(matchWinner.map((item) => item.draw));
  const awayOdds = average(matchWinner.map((item) => item.away));
  const over25Odds = average((odds.over25 || []).map((item) => item.odd));
  const under25Odds = average((odds.under25 || []).map((item) => item.odd));
  const recommendationSide = marketSide(homeOdds, drawOdds, awayOdds);
  const hasOdds = [homeOdds, drawOdds, awayOdds].every(Number.isFinite);
  const dataQuality = hasOdds && matchWinner.length >= 5 ? "HIGH" : hasOdds ? "MEDIUM" : complete ? "MEDIUM" : "LOW";
  return {
    caseId: `external-api-football-${slug(preset.label)}-${slug(season)}-${slug(fixture.sourceMatchId || `${fixture.kickoffTime}-${fixture.homeTeam}-${fixture.awayTeam}`)}`,
    sampleType: "external-history",
    source: "api-football",
    sourceUrl: fixture.sourceMatchId ? `https://www.api-football.com/fixtures/${fixture.sourceMatchId}` : "",
    sourceCapturedAt: new Date().toISOString(),
    matchId: fixture.sourceMatchId || `${season}-${slug(fixture.homeTeam)}-${slug(fixture.awayTeam)}-${slug(fixture.kickoffTime)}`,
    league: preset.label,
    season: String(season),
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    kickoffTime: fixture.kickoffTime,
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
    bookmakerCount1x2: matchWinner.length,
    bookmakerCountTotal: Math.max((odds.over25 || []).length, (odds.under25 || []).length),
    dataQuality,
    actualResult,
    actualHomeGoals: fixture.homeGoals,
    actualAwayGoals: fixture.awayGoals,
    actualGoals: complete ? fixture.homeGoals + fixture.awayGoals : undefined,
    score,
    hitStatus: hasOdds && recommendationSide ? (recommendationSide === actualResult ? "WIN" : "LOSE") : "VOID",
    payload: {
      sampleRole: "external-reference",
      sampleGrade: dataQuality === "HIGH" ? "B" : dataQuality === "MEDIUM" ? "C" : "D",
      resultOnly: !hasOdds,
      sourceLeague: fixture.sourceLeague || preset.sourceName,
      sourceSeason: String(season),
      leagueId: preset.apiFootballLeagueId,
      round: fixture.round,
      status: fixture.status,
      oneXTwoMarket: matchWinner,
      overUnder25Market: { over25: odds.over25 || [], under25: odds.under25 || [] },
      rawFixture: fixture.rawFixture,
      rawOdds: odds.rawOdds,
    },
  };
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

function requestedPresets() {
  if (args.get("league-id")) {
    return [{
      label: args.get("league") || args.get("label") || "未分类赛事",
      apiFootballLeagueId: Number(args.get("league-id")),
      sourceName: args.get("source-name") || "",
    }];
  }
  const names = (args.get("leagues") || args.get("league") || "瑞超,韩职,韩职2")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return names.map((name) => {
    const preset = LEAGUE_PRESETS[name];
    if (!preset) throw new Error(`Unknown league preset: ${name}. Use --league-id for custom leagues.`);
    return preset;
  });
}

async function importLeagueSeason(preset, season) {
  const fixturesRaw = await fetchPaged("fixtures", { league: preset.apiFootballLeagueId, season });
  const fixtures = fixturesRaw
    .map((item) => normalizeFixture(item, { ...preset, season }))
    .filter((item) => item.homeTeam && item.awayTeam && item.kickoffTime)
    .filter((item) => includeIncomplete || item.actualResult || Number.isFinite(item.homeGoals))
    .sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)))
    .slice(0, sampleLimit);

  const oddsByFixture = new Map();
  if (withOdds) {
    const oddsRaw = await fetchPaged("odds", { league: preset.apiFootballLeagueId, season });
    oddsRaw.forEach((row) => {
      const fixtureId = cleanText(row.fixture?.id);
      if (!fixtureId) return;
      oddsByFixture.set(fixtureId, oddsValuesByName(row));
    });
  }

  const samples = fixtures
    .map((fixture) => buildSample(fixture, oddsByFixture.get(fixture.sourceMatchId) || {}, preset, season))
    .filter((item) => includeIncomplete || item.dataQuality !== "LOW");
  return {
    league: preset.label,
    leagueId: preset.apiFootballLeagueId,
    season,
    fixtures: fixtures.length,
    oddsRows: oddsByFixture.size,
    imported: samples.length,
    withOdds: samples.filter((item) => Number.isFinite(Number(item.euroHomeOdds))).length,
    samples,
  };
}

const reports = [];
const imported = [];
for (const preset of requestedPresets()) {
  for (const season of seasons) {
    const report = await importLeagueSeason(preset, season);
    reports.push(Object.fromEntries(Object.entries(report).filter(([key]) => key !== "samples")));
    imported.push(...report.samples);
  }
}

const current = readExistingSamples(output);
const merged = mergeSamples(current, imported);

if (!dryRun) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");
}

console.log(JSON.stringify({
  provider: "api-football",
  seasons,
  sampleLimit,
  imported: imported.length,
  importedWithOdds: imported.filter((item) => Number.isFinite(Number(item.euroHomeOdds))).length,
  existing: current.length,
  total: merged.length,
  dryRun,
  output,
  reports,
}, null, 2));
