import fs from "node:fs/promises";
import vm from "node:vm";

const output = "web/data/externalHistoricalSamples.js";
const target = Math.max(1, Number(process.argv[2] || 100));
const requested = new Set(String(process.argv[3] || "挪超,瑞超").split(",").map((item) => item.trim()).filter(Boolean));
const configs = [
  { league: "挪超", sourceLeague: "挪威超级联赛", seasons: [{ id: 19507, season: "2026", rounds: 30 }, { id: 9059, season: "2025", rounds: 30 }] },
  { league: "瑞超", sourceLeague: "瑞典超级联赛", seasons: [{ id: 19501, season: "2026", rounds: 30 }, { id: 7376, season: "2025", rounds: 30 }] },
  { league: "美职", sourceLeague: "美国职业大联盟", seasons: [{ id: 19471, season: "2026", rounds: 34 }] },
  { league: "巴西甲", sourceLeague: "巴西甲级联赛", seasons: [{ id: 19498, season: "2026", rounds: 38 }] },
].filter((item) => requested.has(item.league));

if (!configs.length) throw new Error(`No supported leagues requested: ${[...requested].join(",")}`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer: "https://liansai.500.com/" } });
    if (response.ok) return new TextDecoder("gbk").decode(new Uint8Array(await response.arrayBuffer()));
    if (response.status !== 429 || attempt === attempts - 1) throw new Error(`${response.status} ${url}`);
    await wait(1500 * (2 ** attempt));
  }
  throw new Error(`unreachable ${url}`);
}

function parseAsian(html) {
  const refs = [...html.matchAll(/<td[^>]*\bref="(-?\d+(?:\.\d+)?)"[^>]*>/g)].map((match) => Number(match[1]));
  if (!refs.length) return null;
  const current = refs.filter((_, index) => index % 2 === 0);
  const opening = refs.filter((_, index) => index % 2 === 1);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { opening: opening.length ? median(opening) : median(current), current: median(current), bookmakerCount: Math.max(opening.length, current.length), movement: refs };
}

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const samples = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const report = [];

for (const config of configs) {
  const sourceSamples = samples.filter((sample) => sample.league === config.league && sample.source === "500.com");
  const known = new Set(sourceSamples.map((sample) => `${String(sample.kickoffTime).slice(0, 10)}|${sample.homeTeam}|${sample.awayTeam}`));
  const completeExisting = sourceSamples.filter((sample) => [sample.euroHomeOdds, sample.euroDrawOdds, sample.euroAwayOdds, sample.asianHandicap, sample.actualHomeGoals, sample.actualAwayGoals].every(Number.isFinite));
  const needed = Math.max(0, target - completeExisting.length);
  const rows = [];
  for (const season of config.seasons) {
    if (rows.length >= needed * 2 && needed > 0) break;
    for (let round = 1; round <= season.rounds; round += 1) {
      const list = JSON.parse(await fetchText(`https://liansai.500.com/index.php?c=match&a=getmatch&sid=${season.id}&round=${round}`));
      rows.push(...list.filter((row) => Number(row.status) === 5).map((row) => ({ ...row, round, season: season.season })));
    }
  }
  const candidates = rows
    .filter((row) => [row.win, row.draw, row.lost, row.hscore, row.gscore].every((value) => Number.isFinite(Number(value))))
    .filter((row) => !known.has(`${String(row.stime).slice(0, 10)}|${row.hname}|${row.gname}`))
    .sort((a, b) => String(b.stime).localeCompare(String(a.stime)));
  const added = [];
  for (const row of candidates) {
    if (added.length >= needed) break;
    await wait(850);
    let asian;
    try {
      asian = parseAsian(await fetchText(`https://odds.500.com/fenxi/yazhi-${row.fid}.shtml`));
    } catch (error) {
      if (!String(error.message).startsWith("429 ")) throw error;
      console.warn(`rate limited after retries, skipped ${row.fid}`);
      continue;
    }
    if (!asian || !Number.isFinite(asian.opening)) continue;
    const odds = [Number(row.win), Number(row.draw), Number(row.lost)];
    const raw = odds.map((value) => 1 / value);
    const total = raw.reduce((sum, value) => sum + value, 0);
    const homeGoals = Number(row.hscore);
    const awayGoals = Number(row.gscore);
    const actualResult = homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW";
    added.push({
      caseId: `external-500-${config.league}-${row.season}-${row.fid}`, sampleType: "external-history", source: "500.com",
      sourceUrl: `https://odds.500.com/fenxi/yazhi-${row.fid}.shtml`, sourceCapturedAt: new Date().toISOString(), matchId: `500-${row.fid}`,
      league: config.league, sourceLeague: config.sourceLeague, season: row.season, homeTeam: row.hname, awayTeam: row.gname, kickoffTime: row.stime,
      modelVersion: "EXTERNAL_HISTORY", recommendation: odds[0] < odds[1] && odds[0] < odds[2] ? "市场主胜" : odds[2] < odds[1] ? "市场客胜" : "市场平",
      recommendationSide: odds[0] < odds[1] && odds[0] < odds[2] ? "HOME" : odds[2] < odds[1] ? "AWAY" : "DRAW",
      sportteryHomeSp: odds[0], sportteryDrawSp: odds[1], sportteryAwaySp: odds[2], euroHomeOdds: odds[0], euroDrawOdds: odds[1], euroAwayOdds: odds[2],
      euroHomeProb: Number((raw[0] / total).toFixed(4)), euroDrawProb: Number((raw[1] / total).toFixed(4)), euroAwayProb: Number((raw[2] / total).toFixed(4)),
      asianHandicap: asian.opening, dataQuality: "HIGH", actualResult, actualHomeGoals: homeGoals, actualAwayGoals: awayGoals, actualGoals: homeGoals + awayGoals,
      score: `${homeGoals}-${awayGoals}`, hitStatus: "PENDING", payload: { sampleRole: "external-market-reference", sourceProvider: "500.com", ninetyMinuteResult: true, round: row.round, halfTimeScore: `${row.hhalfscore}-${row.ghalfscore}`, asianOpening: asian.opening, asianCurrent: asian.current, asianBookmakerCount: asian.bookmakerCount, asianMovement: asian.movement, odds500MatchId: row.fid },
    });
  }
  if (completeExisting.length + added.length < target) throw new Error(`${config.league} only has ${completeExisting.length + added.length}/${target} complete samples`);
  samples.push(...added);
  report.push({ league: config.league, existing: completeExisting.length, discovered: rows.length, added: added.length, complete: completeExisting.length + added.length, newest: added[0]?.kickoffTime, oldestAdded: added.at(-1)?.kickoffTime });
}

await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(samples, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ target, report, total: samples.length }, null, 2));
