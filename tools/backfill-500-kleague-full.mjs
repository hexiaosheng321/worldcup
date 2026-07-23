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

const output = args.get("output") || "web/data/externalHistoricalSamples.js";
const apply = args.get("apply") === "true";
const limit = Math.max(0, Number(args.get("limit") || 0));
const concurrency = Math.min(3, Math.max(1, Number(args.get("concurrency") || 2)));
const delayMs = Math.max(350, Number(args.get("delay-ms") || 650));
const selectedSeasons = new Set(String(args.get("seasons") || "2024,2025,2026").split(",").map((value) => value.trim()));
const seasonConfigs = [
  {
    season: "2024",
    stages: [
      { stageId: 20554, rounds: 33, label: "regular" },
      { stageId: 21414, rounds: [34, 35, 36, 37, 38], label: "championship" },
      { stageId: 21415, rounds: [34, 35, 36, 37, 38], label: "relegation" },
    ],
  },
  {
    season: "2025",
    stages: [
      { stageId: 21669, rounds: 33, label: "regular" },
      { stageId: 24709, rounds: 5, label: "championship" },
      { stageId: 24713, rounds: 5, label: "relegation" },
    ],
  },
  {
    season: "2026",
    stages: [
      { stageId: 26488, rounds: 33, label: "regular" },
    ],
  },
].filter((row) => selectedSeasons.has(row.season));

if (!seasonConfigs.length) throw new Error("Use --seasons 2024,2025,2026");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchText(url, encoding = "gb18030", successfulDelayMs = delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36",
          referer: url.includes("odds.500.com") ? "https://liansai.500.com/" : "https://www.500.com/",
        },
        signal: AbortSignal.timeout(35_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const text = new TextDecoder(encoding).decode(bytes);
      if (/访问过于频繁|安全验证|请求被拒绝|Access Denied/i.test(text)) {
        throw new Error(`blocked ${url}`);
      }
      await wait(successfulDelayMs);
      return text;
    } catch (error) {
      lastError = error;
      await wait(Math.min(12_000, 1000 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

function cleanText(value = "") {
  return String(value).replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function finiteOdds(values) {
  return values.length === 3 && values.every((value) => Number.isFinite(value) && value > 1.001 && value < 100);
}

function averageTriples(rows) {
  if (!rows.length) return null;
  return {
    home: Number((rows.reduce((sum, row) => sum + row[0], 0) / rows.length).toFixed(4)),
    draw: Number((rows.reduce((sum, row) => sum + row[1], 0) / rows.length).toFixed(4)),
    away: Number((rows.reduce((sum, row) => sum + row[2], 0) / rows.length).toFixed(4)),
    bookmakerCount: rows.length,
  };
}

function parseEuropeanOdds(html = "") {
  const openingRows = [];
  const latestRows = [];
  const starts = [...html.matchAll(/<tr[^>]*\bttl="zy"[^>]*>/gi)];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index + starts[index][0].length;
    const end = starts[index + 1]?.index ?? html.indexOf("</table>", start);
    const block = html.slice(start, end > start ? end : html.length);
    const priceTable = block.match(/<td>\s*<table[^>]*class="pl_table_data"[^>]*>([\s\S]*?)<\/table>/i)?.[1] || "";
    const priceRows = [...priceTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((entry) => [...entry[1].matchAll(/<td[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi)].map((match) => Number(match[1])))
      .filter(finiteOdds);
    if (priceRows[0]) openingRows.push(priceRows[0]);
    if (priceRows[1]) latestRows.push(priceRows[1]);
  }
  return {
    opening: averageTriples(openingRows),
    latest: averageTriples(latestRows),
  };
}

function parseAsian(html = "") {
  const refs = [...html.matchAll(/<td[^>]*\bref="(-?\d+(?:\.\d+)?)"[^>]*>/g)].map((match) => Number(match[1]));
  if (!refs.length) return null;
  const latest = refs.filter((_, index) => index % 2 === 0);
  const opening = refs.filter((_, index) => index % 2 === 1);
  const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
  return {
    opening: opening.length ? median(opening) : median(latest),
    latest: median(latest),
    bookmakerCount: Math.max(opening.length, latest.length),
    movement: refs,
  };
}

function noVig(odds) {
  const inverse = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const total = inverse.reduce((sum, value) => sum + value, 0);
  return inverse.map((value) => Number((value / total).toFixed(6)));
}

function resultSide(home, away) {
  return home > away ? "HOME" : home < away ? "AWAY" : "DRAW";
}

function marketSide(odds) {
  const values = [odds.home, odds.draw, odds.away];
  return ["HOME", "DRAW", "AWAY"][values.indexOf(Math.min(...values))];
}

async function discoverRows() {
  const rows = [];
  for (const season of seasonConfigs) {
    for (const stage of season.stages) {
      const rounds = Array.isArray(stage.rounds)
        ? stage.rounds
        : Array.from({ length: stage.rounds }, (_, index) => index + 1);
      for (const round of rounds) {
        const url = `https://liansai.500.com/index.php?c=score&a=getmatch&stid=${stage.stageId}&round=${round}`;
        const list = JSON.parse(await fetchText(url, "gb18030", 80));
        const completed = list
          .filter((row) => Number(row.status) === 5)
          .map((row) => ({ ...row, round, stage: stage.label, season: season.season }));
        rows.push(...completed);
        console.log(JSON.stringify({
          step: "schedule",
          season: season.season,
          stage: stage.label,
          round,
          completed: completed.length,
        }));
      }
    }
  }
  const unique = new Map(rows.map((row) => [String(row.fid), row]));
  return [...unique.values()].sort((left, right) => String(left.stime).localeCompare(String(right.stime)));
}

async function enrichRow(row) {
  const [europeanHtml, asianHtml] = await Promise.all([
    fetchText(`https://odds.500.com/fenxi/ouzhi-${row.fid}.shtml`),
    fetchText(`https://odds.500.com/fenxi/yazhi-${row.fid}.shtml`),
  ]);
  const european = parseEuropeanOdds(europeanHtml);
  const asian = parseAsian(asianHtml);
  if (!european.opening) throw new Error(`${row.fid}: opening 1X2 missing`);
  if (!asian || !Number.isFinite(asian.opening)) throw new Error(`${row.fid}: opening Asian handicap missing`);
  const probability = noVig(european.opening);
  const actualHomeGoals = Number(row.hscore);
  const actualAwayGoals = Number(row.gscore);
  const recommendationSide = marketSide(european.opening);
  const actualResult = resultSide(actualHomeGoals, actualAwayGoals);
  return {
    caseId: `external-500-full-韩职-${row.season}-${row.fid}`,
    sampleType: "external-history",
    source: "500.com-full-history",
    sourceUrl: `https://odds.500.com/fenxi/ouzhi-${row.fid}.shtml`,
    sourceCapturedAt: new Date().toISOString(),
    matchId: `500-${row.fid}`,
    league: "韩职",
    sourceLeague: "K1联赛",
    season: row.season,
    homeTeam: cleanText(row.hname),
    awayTeam: cleanText(row.gname),
    kickoffTime: row.stime,
    modelVersion: "EXTERNAL_HISTORY",
    recommendation: `开盘市场${{ HOME: "主胜", DRAW: "平", AWAY: "客胜" }[recommendationSide]}`,
    recommendationSide,
    sportteryHomeSp: european.opening.home,
    sportteryDrawSp: european.opening.draw,
    sportteryAwaySp: european.opening.away,
    euroHomeOdds: european.opening.home,
    euroDrawOdds: european.opening.draw,
    euroAwayOdds: european.opening.away,
    euroHomeProb: probability[0],
    euroDrawProb: probability[1],
    euroAwayProb: probability[2],
    bookmakerCount1x2: european.opening.bookmakerCount,
    asianHandicap: asian.opening,
    dataQuality: "HIGH",
    actualResult,
    actualHomeGoals,
    actualAwayGoals,
    actualGoals: actualHomeGoals + actualAwayGoals,
    score: `${actualHomeGoals}-${actualAwayGoals}`,
    hitStatus: recommendationSide === actualResult ? "WIN" : "LOSE",
    payload: {
      sampleRole: "external-market-reference",
      sourceProvider: "500.com full K League history",
      ninetyMinuteResult: true,
      round: row.round,
      halfTimeScore: `${row.hhalfscore}-${row.ghalfscore}`,
      oddsSemantics: {
        primaryFields: "opening-bookmaker-average",
        opening: european.opening,
        latest: european.latest,
      },
      asianSemantics: {
        primaryFields: "opening-bookmaker-median",
        opening: asian.opening,
        latest: asian.latest,
        bookmakerCount: asian.bookmakerCount,
        movement: asian.movement,
      },
      odds500MatchId: row.fid,
    },
  };
}

async function mapConcurrent(rows, worker, size) {
  const results = new Array(rows.length);
  let cursor = 0;
  async function next() {
    const index = cursor++;
    if (index >= rows.length) return;
    try {
      results[index] = await worker(rows[index]);
    } catch (error) {
      results[index] = { error: error?.message || String(error), row: rows[index] };
    }
    if ((index + 1) % 20 === 0 || index + 1 === rows.length) {
      console.log(JSON.stringify({ step: "details", completed: index + 1, total: rows.length }));
    }
    return next();
  }
  await Promise.all(Array.from({ length: size }, () => next()));
  return results;
}

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const existing = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const targetSeasons = new Set(seasonConfigs.map((row) => row.season));
const reusable = new Map(existing
  .filter((row) =>
    row.league === "韩职"
    && row.source === "500.com-full-history"
    && targetSeasons.has(String(row.season))
  )
  .map((row) => [row.matchId, row]));

const discovered = await discoverRows();
const selected = limit ? discovered.slice(0, limit) : discovered;
console.log(JSON.stringify({ step: "discovered", matches: discovered.length, selected: selected.length, reusable: reusable.size }));
const results = await mapConcurrent(selected, (row) => reusable.get(`500-${row.fid}`) || enrichRow(row), concurrency);
const completed = results.filter((row) => row && !row.error);
const errors = results.filter((row) => row?.error);

const preserved = existing.filter((row) =>
  row.league !== "韩职"
  || row.source !== "500.com-full-history"
  || !targetSeasons.has(String(row.season))
);
const merged = [...preserved, ...completed];

if (apply && !errors.length) {
  await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  applied: apply && !errors.length,
  output,
  seasons: [...targetSeasons],
  discovered: discovered.length,
  selected: selected.length,
  completed: completed.length,
  errors: errors.length,
  samples: completed.slice(0, 3).map((row) => ({
    matchId: row.matchId,
    match: `${row.homeTeam} vs ${row.awayTeam}`,
    opening: [row.euroHomeOdds, row.euroDrawOdds, row.euroAwayOdds],
    latest: row.payload?.oddsSemantics?.latest,
    asianOpening: row.asianHandicap,
    asianLatest: row.payload?.asianSemantics?.latest,
    score: row.score,
  })),
  errorSamples: errors.slice(0, 12),
  existing: existing.length,
  merged: errors.length ? existing.length : merged.length,
}, null, 2));

if (errors.length) process.exitCode = 1;
