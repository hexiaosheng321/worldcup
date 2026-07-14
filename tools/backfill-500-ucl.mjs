import fs from "node:fs/promises";
import vm from "node:vm";

const output = "web/data/externalHistoricalSamples.js";
const relatedAnalysisIds = process.argv.includes("--analysis-ids")
  ? String(process.argv[process.argv.indexOf("--analysis-ids") + 1] || "").split(",").filter(Boolean)
  : [];
const stageIds = ["22226", "22227", "22228", "22384", "26604", "26833", "27047", "27298", "27570"];
const leagueStageId = "22536";
const capturedAt = new Date().toISOString();

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

function normalizeKickoffTime(value = "") {
  const raw = stripHtml(value);
  return /^\d{2}-\d{2}-\d{2}$/.test(raw) ? `20${raw}` : raw;
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

function sampleFromRow(row) {
  const [homeOdds, drawOdds, awayOdds] = row.odds;
  const [euroHomeProb, euroDrawProb, euroAwayProb] = impliedProbabilities(row.odds);
  const [actualHomeGoals, actualAwayGoals] = row.score;
  const recommendationSide = homeOdds < drawOdds && homeOdds < awayOdds ? "HOME" : awayOdds < drawOdds ? "AWAY" : "DRAW";
  const actualResult = actualHomeGoals > actualAwayGoals ? "HOME" : actualHomeGoals < actualAwayGoals ? "AWAY" : "DRAW";
  return {
    caseId: `external-500-${row.league}-${row.season.replace("/", "-")}-${row.fid}`,
    sampleType: "external-history",
    source: "500.com",
    sourceUrl: `https://odds.500.com/fenxi/shuju-${row.fid}.shtml`,
    sourceCapturedAt: capturedAt,
    matchId: `500-${row.fid}`,
    league: row.league,
    sourceLeague: row.sourceLeague || row.league,
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

function parseStageRows(html, stageId) {
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
    rows.push({ fid: match[1], stageId, league: "欧冠", sourceLeague: "欧洲联赛冠军杯", season: "2025/2026", kickoffTime: match[7], home: teams[0], away: teams[1], score: [Number(match[5]), Number(match[6])], odds, asianHandicap: line, asianHandicapText, halfTimeScore: half ? `${half[1]}-${half[2]}` : "" });
  }
  return rows;
}

function parseLeagueStageRows(rows) {
  return rows.filter((row) => Number(row.status) === 5).map((row) => ({
    fid: String(row.fid), stageId: leagueStageId, league: "欧冠", sourceLeague: "欧洲联赛冠军杯", season: "2025/2026", kickoffTime: row.stime,
    home: { id: String(row.hid), title: row.hname, name: row.hsxname || row.hname },
    away: { id: String(row.gid), title: row.gname, name: row.gsxname || row.gname },
    score: [Number(row.hscore), Number(row.gscore)], odds: [Number(row.win), Number(row.draw), Number(row.lost)],
    asianHandicap: asianLine(row.handline), asianHandicapText: row.handline,
    halfTimeScore: `${row.hhalfscore}-${row.ghalfscore}`,
  })).filter((row) => row.odds.every((value) => value > 1) && Number.isFinite(row.asianHandicap));
}

function parseRelatedRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr fid="(\d+)" sid="5"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((item) => stripHtml(item[1]));
    const title = match[2].match(/title="([^"]+)数据分析"/)?.[1] || "";
    const names = title.split("VS");
    const score = stripHtml(match[2]).match(/(\d+)\s*:\s*(\d+)/);
    const marketCells = [...match[2].matchAll(/pub_table_pl">([\s\S]*?)<\/p>/g)].map((item) => stripHtml(item[1]));
    const odds = String(marketCells[0] || "").split(" ").map(Number);
    const asianHandicapText = match[2].match(/table_pl_center">([^<]+)</)?.[1] || "";
    if (names.length !== 2 || !score || odds.length !== 3 || !odds.every((value) => value > 1) || !asianHandicapText) continue;
    const kickoffTime = normalizeKickoffTime(cells[1]);
    const league = cells[0] || "未分类赛事";
    rows.push({ fid: match[1], league, sourceLeague: league === "欧冠" ? "欧洲联赛冠军杯" : league, season: league === "欧冠" ? "2026/2027" : kickoffTime.slice(0, 4), kickoffTime, homeName: names[0], awayName: names[1], score: [Number(score[1]), Number(score[2])], odds, asianHandicapText, asianHandicap: asianLine(asianHandicapText), halfTimeScore: cells[3]?.replace(/\s*:\s*/, "-") || "" });
  }
  return rows;
}

function parseHeaderTeams(html) {
  return [...html.matchAll(/<a class="hd_name" href="https:\/\/liansai\.500\.com\/team\/(\d+)\/"[^>]*>([^<]+)<\/a>/g)]
    .slice(0, 2).map((item) => ({ id: item[1], title: stripHtml(item[2]), name: stripHtml(item[2]) }));
}

const stagePages = await Promise.all(stageIds.map(async (stageId) => ({ stageId, html: await fetchGbk(`https://liansai.500.com/zuqiu-9106/jifen-${stageId}/`) })));
const rows = stagePages.flatMap(({ stageId, html }) => parseStageRows(html, stageId));
const leagueStageRaw = JSON.parse(new TextDecoder("utf-8").decode(await fetchBuffer(`https://liansai.500.com/index.php?c=score&a=getmatch&stid=${leagueStageId}&round=A`)));
rows.push(...parseLeagueStageRows(leagueStageRaw));

const relatedCandidates = [];
for (const analysisId of relatedAnalysisIds) relatedCandidates.push(...parseRelatedRows(await fetchGbk(`https://odds.500.com/fenxi/shuju-${analysisId}.shtml`)));
const uniqueRelated = new Map();
for (const row of relatedCandidates) if (!uniqueRelated.has(row.fid)) uniqueRelated.set(row.fid, row);
for (const row of uniqueRelated.values()) {
  const teams = parseHeaderTeams(await fetchGbk(`https://odds.500.com/fenxi/shuju-${row.fid}.shtml`));
  if (teams.length !== 2 || !Number.isFinite(row.asianHandicap)) continue;
  rows.push({ ...row, stageId: "2026-2027-related", home: teams[0], away: teams[1] });
}

const imported = [...new Map(rows.map((row) => [row.fid, sampleFromRow(row)])).values()];
const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const existing = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const firstOldUclIndex = existing.findIndex((sample) => sample.league === "欧冠");
const importedMatchIds = new Set(imported.map((sample) => sample.matchId));
const withoutOldUcl = existing.filter((sample) => sample.league !== "欧冠" && !importedMatchIds.has(sample.matchId));
const insertionIndex = firstOldUclIndex < 0 ? withoutOldUcl.length : Math.min(firstOldUclIndex, withoutOldUcl.length);
const merged = [...withoutOldUcl.slice(0, insertionIndex), ...imported, ...withoutOldUcl.slice(insertionIndex)];
await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(merged, null, 2)};\n`, "utf8");

console.log(JSON.stringify({ removedOrReplaced: existing.length - withoutOldUcl.length, imported: imported.length, ucl: imported.filter((sample) => sample.league === "欧冠").length, relatedTeamHistory: imported.filter((sample) => sample.league !== "欧冠").length, completeWithAsianHandicap: imported.filter((sample) => Number.isFinite(sample.asianHandicap)).length, relatedCurrentTeams: imported.filter((sample) => sample.season === "2026/2027").map((sample) => `${sample.homeTeam} ${sample.score} ${sample.awayTeam}`), total: merged.length }, null, 2));
