import fs from "node:fs/promises";
import vm from "node:vm";

const output = "web/data/externalHistoricalSamples.js";
const limit = Math.max(1, Number(process.argv[2] || 120));
const earliestDate = "2025-07-11";
const seasons = [
  { seasonId: 19554, season: "2026", rounds: 16 },
  { seasonId: 7396, season: "2025", rounds: 33 },
];

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder("gbk").decode(bytes);
}

function pattern(row) {
  return (row.lost >= 1.4 && row.lost <= 1.8)
    || (row.win >= 1.55 && row.win <= 1.95)
    || (row.win >= 2.1 && row.win <= 2.7 && row.lost >= 2.1 && row.lost <= 3.3);
}

function parseAsian(html) {
  const refs = [...html.matchAll(/<td[^>]*\bref="(-?\d+(?:\.\d+)?)"[^>]*>/g)].map((match) => Number(match[1]));
  if (!refs.length) return null;
  const current = refs.filter((_, index) => index % 2 === 0);
  const opening = refs.filter((_, index) => index % 2 === 1);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return {
    opening: opening.length ? median(opening) : median(current),
    current: median(current),
    bookmakerCount: Math.max(opening.length, current.length),
    movement: refs,
  };
}

const rows = [];
for (const season of seasons) {
  for (let round = 1; round <= season.rounds; round += 1) {
    const text = await fetchText(`https://liansai.500.com/index.php?c=match&a=getmatch&sid=${season.seasonId}&round=${round}`);
    const list = JSON.parse(text);
    rows.push(...list.filter((row) => Number(row.status) === 5 && String(row.stime).slice(0, 10) >= earliestDate).map((row) => ({ ...row, round, season: season.season })));
  }
}

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const samples = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const existingSourceSamples = samples.filter((sample) => sample.source === "500.com");
if (existingSourceSamples.length >= limit) {
  console.log(JSON.stringify({ skipped: true, reason: "source batch already complete", existing: existingSourceSamples.length, limit }, null, 2));
  process.exit(0);
}
const known = new Set(samples.filter((sample) => sample.league === "韩职").map((sample) => `${String(sample.kickoffTime).slice(0, 10)}|${sample.homeTeam}|${sample.awayTeam}`));
const needed = limit - existingSourceSamples.length;
const candidates = rows
  .filter((row) => !known.has(`${row.stime.slice(0, 10)}|${row.hname}|${row.gname}`))
  .sort((a, b) => Number(pattern(b)) - Number(pattern(a)) || String(b.stime).localeCompare(String(a.stime)))
  .slice(0, needed * 2);

const added = [];
for (const row of candidates) {
  if (added.length >= needed) break;
  const asian = parseAsian(await fetchText(`https://odds.500.com/fenxi/yazhi-${row.fid}.shtml`));
  if (!asian || !Number.isFinite(asian.opening)) continue;
  const raw = [1 / row.win, 1 / row.draw, 1 / row.lost];
  const probabilityTotal = raw.reduce((sum, value) => sum + value, 0);
  const actualResult = row.hscore > row.gscore ? "HOME" : row.hscore < row.gscore ? "AWAY" : "DRAW";
  added.push({
    caseId: `external-500-韩职-2026-${row.fid}`,
    sampleType: "external-history",
    source: "500.com",
    sourceUrl: `https://odds.500.com/fenxi/yazhi-${row.fid}.shtml`,
    sourceCapturedAt: new Date().toISOString(),
    matchId: `500-${row.fid}`,
    league: "韩职",
    sourceLeague: "K1联赛",
    season: row.season,
    homeTeam: row.hname,
    awayTeam: row.gname,
    kickoffTime: row.stime,
    modelVersion: "EXTERNAL_HISTORY",
    recommendation: row.win < row.draw && row.win < row.lost ? "市场主胜" : row.lost < row.draw ? "市场客胜" : "市场平",
    recommendationSide: row.win < row.draw && row.win < row.lost ? "HOME" : row.lost < row.draw ? "AWAY" : "DRAW",
    sportteryHomeSp: row.win,
    sportteryDrawSp: row.draw,
    sportteryAwaySp: row.lost,
    euroHomeOdds: row.win,
    euroDrawOdds: row.draw,
    euroAwayOdds: row.lost,
    euroHomeProb: Number((raw[0] / probabilityTotal).toFixed(4)),
    euroDrawProb: Number((raw[1] / probabilityTotal).toFixed(4)),
    euroAwayProb: Number((raw[2] / probabilityTotal).toFixed(4)),
    asianHandicap: asian.opening,
    dataQuality: "HIGH",
    actualResult,
    actualHomeGoals: Number(row.hscore),
    actualAwayGoals: Number(row.gscore),
    actualGoals: Number(row.hscore) + Number(row.gscore),
    score: `${row.hscore}-${row.gscore}`,
    hitStatus: "PENDING",
    payload: {
      sampleRole: "external-market-reference",
      sourceProvider: "500.com",
      ninetyMinuteResult: true,
      round: row.round,
      halfTimeScore: `${row.hhalfscore}-${row.ghalfscore}`,
      asianOpening: asian.opening,
      asianCurrent: asian.current,
      asianBookmakerCount: asian.bookmakerCount,
      asianMovement: asian.movement,
      odds500MatchId: row.fid,
    },
  });
}

if (added.length < Math.min(15, needed)) throw new Error(`Only ${added.length} complete samples found; refusing partial backfill`);
samples.push(...added);
await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(samples, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ discovered: rows.length, candidates: candidates.length, added: added.length, total: samples.length, samples: added.map((sample) => ({ matchId: sample.matchId, teams: `${sample.homeTeam} vs ${sample.awayTeam}`, odds: [sample.euroHomeOdds, sample.euroDrawOdds, sample.euroAwayOdds], asianHandicap: sample.asianHandicap, score: sample.score })) }, null, 2));
