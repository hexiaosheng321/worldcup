import fs from "node:fs/promises";
import vm from "node:vm";

const output = "web/data/externalHistoricalSamples.js";
const target = Number(process.argv[2] || 100);
const capturedAt = new Date().toISOString();
const stages = [
  { seasonId: "20000", stageId: "28104", season: "2026/2027" },
  { seasonId: "20000", stageId: "28103", season: "2026/2027" },
  { seasonId: "9107", stageId: "26605", season: "2025/2026" },
  { seasonId: "9107", stageId: "26834", season: "2025/2026" },
  { seasonId: "9107", stageId: "27048", season: "2025/2026" },
  { seasonId: "9107", stageId: "22231", season: "2025/2026" },
  { seasonId: "9107", stageId: "22298", season: "2025/2026" },
  { seasonId: "9107", stageId: "22299", season: "2025/2026" },
  { seasonId: "9107", stageId: "22383", season: "2025/2026" },
];
const leagueStage = { stageId: "22464", season: "2025/2026" };

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer: "https://liansai.500.com/" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchGbk(url) {
  return new TextDecoder("gbk").decode(await fetchBuffer(url));
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function asianLine(value = "") {
  const raw = stripHtml(value).replace(/^受/, "");
  const parts = { 平手: 0, 半球: 0.5, 一球: 1, 球半: 1.5, 两球: 2, 两球半: 2.5, 三球: 3 };
  const number = raw.includes("/")
    ? raw.split("/").map((item) => parts[item]).filter(Number.isFinite).reduce((sum, item) => sum + item, 0) / 2
    : parts[raw];
  if (!Number.isFinite(number)) return null;
  return value.includes("受") ? number : -number;
}

function impliedProbabilities(odds) {
  const raw = odds.map((value) => 1 / value);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => Number((value / total).toFixed(4)));
}

function parseStageRows(html, config) {
  const rows = [];
  const pattern = /<tr data-fid="(\d+)"[^>]*data-hid="(\d+)"[^>]*data-gid="(\d+)"[^>]*data-status="(\d+)"[^>]*data-hscore="([^\"]+)"[^>]*data-ascore="([^\"]+)"[^>]*data-time="([^\"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  for (const match of html.matchAll(pattern)) {
    const cells = [...match[8].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((item) => stripHtml(item[1]));
    const teams = [...match[8].matchAll(/<a href="\/team\/(\d+)\/"[^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
      .map((item) => ({ id: item[1], title: item[2], name: stripHtml(item[3]) }));
    const odds = (cells.find((item) => /^\d+(?:\.\d+)? \d+(?:\.\d+)? \d+(?:\.\d+)?$/.test(item)) || "").split(" ").map(Number);
    const asianHandicapText = cells.find((item) => /平手|半球|一球|球半|两球|三球/.test(item)) || "";
    if (Number(match[4]) !== 5 || teams.length !== 2 || odds.length !== 3 || !odds.every((value) => value > 1)) continue;
    const line = asianLine(asianHandicapText);
    if (!Number.isFinite(line)) continue;
    const half = stripHtml(match[8]).match(/\((\d+):(\d+)\)/);
    rows.push({
      fid: match[1], stageId: config.stageId, season: config.season, kickoffTime: match[7],
      home: teams[0], away: teams[1], score: [Number(match[5]), Number(match[6])], odds,
      asianHandicap: line, asianHandicapText, halfTimeScore: half ? `${half[1]}-${half[2]}` : "",
    });
  }
  return rows;
}

function parseLeagueStageRows(rows) {
  return rows.filter((row) => Number(row.status) === 5).map((row) => ({
    fid: String(row.fid), stageId: leagueStage.stageId, season: leagueStage.season, kickoffTime: row.stime,
    home: { id: String(row.hid), title: row.hname, name: row.hsxname || row.hname },
    away: { id: String(row.gid), title: row.gname, name: row.gsxname || row.gname },
    score: [Number(row.hscore), Number(row.gscore)], odds: [Number(row.win), Number(row.draw), Number(row.lost)],
    asianHandicap: asianLine(row.handline), asianHandicapText: row.handline,
    halfTimeScore: `${row.hhalfscore}-${row.ghalfscore}`,
  })).filter((row) => row.odds.every((value) => value > 1) && Number.isFinite(row.asianHandicap));
}

function sampleFromRow(row) {
  const [homeOdds, drawOdds, awayOdds] = row.odds;
  const [euroHomeProb, euroDrawProb, euroAwayProb] = impliedProbabilities(row.odds);
  const [actualHomeGoals, actualAwayGoals] = row.score;
  const recommendationSide = homeOdds < drawOdds && homeOdds < awayOdds ? "HOME" : awayOdds < drawOdds ? "AWAY" : "DRAW";
  const actualResult = actualHomeGoals > actualAwayGoals ? "HOME" : actualHomeGoals < actualAwayGoals ? "AWAY" : "DRAW";
  return {
    caseId: `external-500-欧联-${row.season.replaceAll("/", "-")}-${row.fid}`,
    sampleType: "external-history",
    source: "500.com",
    sourceUrl: `https://odds.500.com/fenxi/shuju-${row.fid}.shtml`,
    sourceCapturedAt: capturedAt,
    matchId: `500-${row.fid}`,
    league: "欧联",
    sourceLeague: "欧罗巴杯",
    season: row.season,
    homeTeam: row.home.name,
    awayTeam: row.away.name,
    kickoffTime: row.kickoffTime,
    modelVersion: "EXTERNAL_HISTORY",
    recommendation: recommendationSide === "HOME" ? "市场主胜" : recommendationSide === "AWAY" ? "市场客胜" : "市场平",
    recommendationSide,
    sportteryHomeSp: homeOdds,
    sportteryDrawSp: drawOdds,
    sportteryAwaySp: awayOdds,
    euroHomeOdds: homeOdds,
    euroDrawOdds: drawOdds,
    euroAwayOdds: awayOdds,
    euroHomeProb,
    euroDrawProb,
    euroAwayProb,
    asianHandicap: row.asianHandicap,
    asianHandicapText: row.asianHandicapText,
    dataQuality: "HIGH",
    actualResult,
    actualHomeGoals,
    actualAwayGoals,
    actualGoals: actualHomeGoals + actualAwayGoals,
    score: `${actualHomeGoals}-${actualAwayGoals}`,
    hitStatus: recommendationSide === actualResult ? "WIN" : "LOSE",
    payload: {
      sampleRole: "external-market-reference",
      sourceProvider: "500.com",
      ninetyMinuteResult: true,
      stageId: row.stageId,
      halfTimeScore: row.halfTimeScore || "",
      homeTeamInfo: { sourceTeamId: row.home.id, canonicalName: row.home.title || row.home.name, sourceUrl: `https://liansai.500.com/team/${row.home.id}/` },
      awayTeamInfo: { sourceTeamId: row.away.id, canonicalName: row.away.title || row.away.name, sourceUrl: `https://liansai.500.com/team/${row.away.id}/` },
      asianOpening: row.asianHandicap,
      asianOpeningText: row.asianHandicapText,
      odds500MatchId: row.fid,
    },
  };
}

const stagePages = await Promise.all(stages.map(async (config) => ({
  config,
  html: await fetchGbk(`https://liansai.500.com/zuqiu-${config.seasonId}/jifen-${config.stageId}/`),
})));
const rows = stagePages.flatMap(({ config, html }) => parseStageRows(html, config));
const leagueStageRaw = JSON.parse(new TextDecoder("utf-8").decode(await fetchBuffer(`https://liansai.500.com/index.php?c=score&a=getmatch&stid=${leagueStage.stageId}&round=A`)));
rows.push(...parseLeagueStageRows(leagueStageRaw));

const selected = [...new Map(rows.map((row) => [row.fid, row])).values()]
  .sort((a, b) => String(b.kickoffTime).localeCompare(String(a.kickoffTime)))
  .slice(0, target);
if (selected.length < target) throw new Error(`Only ${selected.length} complete 500.com Europa samples found; target is ${target}`);
const imported = selected.map(sampleFromRow);

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const existing = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const firstEuropaIndex = existing.findIndex((sample) => sample.league === "欧联");
const withoutOldPrimary = existing.filter((sample) => !(sample.league === "欧联" && /^(500\.com|okooo)/i.test(String(sample.source || sample.dataSource || ""))));
const insertionIndex = firstEuropaIndex < 0 ? withoutOldPrimary.length : Math.min(firstEuropaIndex, withoutOldPrimary.length);
const merged = [...withoutOldPrimary.slice(0, insertionIndex), ...imported, ...withoutOldPrimary.slice(insertionIndex)];
await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");

console.log(JSON.stringify({
  replacedPrimary: existing.length - withoutOldPrimary.length,
  imported: imported.length,
  seasons: Object.fromEntries([...new Set(imported.map((sample) => sample.season))].map((season) => [season, imported.filter((sample) => sample.season === season).length])),
  currentSeasonTeams: [...new Set(imported.filter((sample) => sample.season === "2026/2027").flatMap((sample) => [sample.homeTeam, sample.awayTeam]))],
  completeWithAsianHandicap: imported.filter((sample) => Number.isFinite(sample.asianHandicap)).length,
  total: merged.length,
}, null, 2));
