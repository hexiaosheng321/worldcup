import fs from "node:fs/promises";
import vm from "node:vm";

const output = "web/data/externalHistoricalSamples.js";
const auditOutput = "web/data/directVenueSamples-20260717.json";
const sampleLimit = 5;
const capturedAt = new Date().toISOString();

const targets = [
  { code: "五201", matchId: "sporttery-1318499", fixtureId: "1362704", league: "瑞超", displayHome: "哥德堡", displayAway: "布鲁马", competitions: ["瑞典超"], kickoffTime: "2026-07-18 01:00" },
  { code: "五202", matchId: "sporttery-1318501", fixtureId: "1362710", league: "瑞超", displayHome: "米亚尔", displayAway: "韦斯特", competitions: ["瑞典超"], kickoffTime: "2026-07-18 01:00" },
  { code: "五203", matchId: "sporttery-1317623", fixtureId: "1363900", league: "挪超", displayHome: "博德闪", displayAway: "腓特烈", competitions: ["挪超"], kickoffTime: "2026-07-18 01:15" },
  { code: "五204", matchId: "sporttery-1334804", fixtureId: "1362048", league: "巴西甲", displayHome: "巴伊亚", displayAway: "沙佩科", competitions: ["巴甲"], kickoffTime: "2026-07-18 06:30" },
  { code: "五205", matchId: "sporttery-1316879", fixtureId: "1362351", league: "巴西甲", displayHome: "弗鲁米", displayAway: "布拉干", competitions: ["巴甲"], kickoffTime: "2026-07-18 07:00" },
  { code: "五206", matchId: "sporttery-1316883", fixtureId: "1362361", league: "巴西甲", displayHome: "迈拉索", displayAway: "格雷米", competitions: ["巴甲"], kickoffTime: "2026-07-18 07:00" },
  { code: "五207", matchId: "sporttery-1324068", fixtureId: "1358420", league: "美职", displayHome: "纳什维", displayAway: "亚特兰", competitions: ["美职联"], kickoffTime: "2026-07-18 08:10" },
  { code: "五208", matchId: "sporttery-1324069", fixtureId: "1358422", league: "美职", displayHome: "洛城银河", displayAway: "洛杉矶FC", competitions: ["美职联"], kickoffTime: "2026-07-18 10:25" },
];

const context = { window: {} };
vm.runInNewContext(await fs.readFile(output, "utf8"), context);
const samples = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];

async function fetchGbk(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", referer: "https://trade.500.com/jczq/" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new TextDecoder("gbk").decode(new Uint8Array(await response.arrayBuffer()));
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fullDate(value = "") {
  const matched = String(value).match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!matched) return "";
  return `20${matched[1]}-${matched[2]}-${matched[3]}`;
}

function resultSide(homeGoals, awayGoals) {
  return homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW";
}

function parseVenueForm(html, formId, role, target) {
  const block = html.match(new RegExp(`<form name="${formId}"[\\s\\S]*?<\\/form>`))?.[0] || "";
  if (!block) throw new Error(`${target.code} missing 500.com venue form ${formId}`);
  const sourceTeam = stripHtml(block.match(/<strong class="team_name">([\s\S]*?)<\/strong>/)?.[1] || "");
  const selectedVenue = stripHtml(block.match(/<span class="selt_t">[\s\S]*?<em[^>]*>([\s\S]*?)<\/em>/)?.[1] || "");
  const expectedVenue = role === "HOME" ? "主场" : "客场";
  if (!sourceTeam || selectedVenue !== expectedVenue) {
    throw new Error(`${target.code} ${role} venue identity failed: ${sourceTeam}/${selectedVenue}`);
  }

  const rows = [];
  for (const matched of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...matched[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((item) => item[1]);
    if (cells.length < 3) continue;
    const competition = stripHtml(cells[0]);
    const kickoffTime = fullDate(stripHtml(cells[1]));
    const fixtureId = cells[2].match(/shuju-(\d+)\.shtml/)?.[1] || "";
    const homeTeam = stripHtml(cells[2].match(/<span class="dz-l[^"]*">([\s\S]*?)<\/span>/)?.[1] || "");
    const awayTeam = stripHtml(cells[2].match(/<span class="dz-r[^"]*">([\s\S]*?)<\/span>/)?.[1] || "");
    const scoreText = stripHtml(cells[2].match(/<em>([\s\S]*?)<\/em>/)?.[1] || "");
    const score = scoreText.match(/(\d+)\s*:\s*(\d+)/);
    if (!fixtureId || !kickoffTime || !homeTeam || !awayTeam || !score) continue;
    const actualHomeGoals = Number(score[1]);
    const actualAwayGoals = Number(score[2]);
    const formalCompetition = target.competitions.includes(competition);
    const correctVenue = role === "HOME" ? homeTeam === sourceTeam : awayTeam === sourceTeam;
    const beforeTargetKickoff = kickoffTime < target.kickoffTime.slice(0, 10);
    if (!formalCompetition || !correctVenue || !beforeTargetKickoff) continue;
    rows.push({
      fixtureId,
      competition,
      kickoffTime,
      homeTeam,
      awayTeam,
      actualHomeGoals,
      actualAwayGoals,
      score: `${actualHomeGoals}-${actualAwayGoals}`,
      actualResult: resultSide(actualHomeGoals, actualAwayGoals),
      sourceUrl: `https://odds.500.com/fenxi/shuju-${fixtureId}.shtml`,
      formalCompetition,
      beforeTargetKickoff,
      venueVerified: correctVenue,
    });
  }
  const selected = rows.slice(0, sampleLimit);
  const selectedIds = new Set(selected.map((row) => row.fixtureId));
  const libraryFallback = samples
    .filter((sample) => sample.league === target.league && /^500\.com$/i.test(String(sample.source || "")))
    .filter((sample) => role === "HOME" ? sample.homeTeam === sourceTeam : sample.awayTeam === sourceTeam)
    .map((sample) => {
      const fixtureId = String(sample.matchId || "").match(/^500-(\d+)$/)?.[1]
        || String(sample.sourceUrl || "").match(/-(\d+)\.shtml/)?.[1]
        || "";
      const kickoffTime = String(sample.kickoffTime || "").slice(0, 10);
      const actualHomeGoals = Number(sample.actualHomeGoals);
      const actualAwayGoals = Number(sample.actualAwayGoals);
      if (!fixtureId || !kickoffTime || !Number.isFinite(actualHomeGoals) || !Number.isFinite(actualAwayGoals)) return null;
      return {
        fixtureId,
        competition: target.competitions[0],
        kickoffTime,
        homeTeam: sample.homeTeam,
        awayTeam: sample.awayTeam,
        actualHomeGoals,
        actualAwayGoals,
        score: `${actualHomeGoals}-${actualAwayGoals}`,
        actualResult: resultSide(actualHomeGoals, actualAwayGoals),
        sourceUrl: `https://odds.500.com/fenxi/shuju-${fixtureId}.shtml`,
        formalCompetition: true,
        beforeTargetKickoff: kickoffTime < target.kickoffTime.slice(0, 10),
        venueVerified: true,
        libraryFallback: true,
        previousSeasonFallback: kickoffTime.slice(0, 4) < target.kickoffTime.slice(0, 4),
      };
    })
    .filter((row) => row && row.beforeTargetKickoff && !selectedIds.has(row.fixtureId))
    .sort((left, right) => right.kickoffTime.localeCompare(left.kickoffTime));
  while (selected.length < sampleLimit && libraryFallback.length) {
    const row = libraryFallback.shift();
    selected.push(row);
    selectedIds.add(row.fixtureId);
  }
  if (selected.length < sampleLimit) {
    throw new Error(`${target.code} ${sourceTeam} ${expectedVenue} only has ${selected.length}/${sampleLimit} completed formal samples`);
  }
  return { role, sourceTeam, expectedVenue, samples: selected };
}

const groups = [];
for (const target of targets) {
  const sourceUrl = `https://odds.500.com/fenxi/shuju-${target.fixtureId}.shtml`;
  const html = await fetchGbk(sourceUrl);
  const pageTitle = stripHtml(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
  const home = parseVenueForm(html, "zhanji_11", "HOME", target);
  const away = parseVenueForm(html, "zhanji_20", "AWAY", target);
  groups.push(
    { ...target, pageTitle, targetSourceUrl: sourceUrl, ...home },
    { ...target, pageTitle, targetSourceUrl: sourceUrl, ...away },
  );
}

let added = 0;
let reused = 0;

for (const group of groups) {
  for (const row of group.samples) {
    const targetMeta = {
      targetMatchCode: group.code,
      targetMatchId: group.matchId,
      targetFixtureId: group.fixtureId,
      targetKickoffTime: group.kickoffTime,
      targetTeam: group.sourceTeam,
      targetTeamRole: group.role,
      venueRequirement: group.expectedVenue,
    };
    let sample = samples.find((item) => String(item.matchId || "") === `500-${row.fixtureId}`)
      || samples.find((item) => String(item.sourceUrl || "").includes(`-${row.fixtureId}.shtml`));
    if (sample) {
      const storedHome = Number(sample.actualHomeGoals);
      const storedAway = Number(sample.actualAwayGoals);
      if (Number.isFinite(storedHome) && Number.isFinite(storedAway)
        && (storedHome !== row.actualHomeGoals || storedAway !== row.actualAwayGoals)) {
        throw new Error(`score conflict for 500-${row.fixtureId}: ${storedHome}-${storedAway} vs ${row.score}`);
      }
      sample.homeTeam = row.homeTeam;
      sample.awayTeam = row.awayTeam;
      sample.sourceUrl = row.sourceUrl;
      reused += 1;
    } else {
      sample = {
        caseId: `external-500-direct-venue-${group.league}-${row.fixtureId}`,
        sampleType: "external-history",
        source: "500.com",
        sourceUrl: row.sourceUrl,
        sourceCapturedAt: capturedAt,
        matchId: `500-${row.fixtureId}`,
        league: group.league,
        sourceLeague: row.competition,
        season: row.kickoffTime.slice(0, 4),
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        kickoffTime: row.kickoffTime,
        modelVersion: "EXTERNAL_HISTORY",
        recommendation: "",
        recommendationSide: "",
        dataQuality: "HIGH",
        actualResult: row.actualResult,
        actualHomeGoals: row.actualHomeGoals,
        actualAwayGoals: row.actualAwayGoals,
        actualGoals: row.actualHomeGoals + row.actualAwayGoals,
        score: row.score,
        hitStatus: "PENDING",
        matchType: "LEAGUE",
        isFriendly: false,
        payload: {},
      };
      samples.push(sample);
      added += 1;
    }
    const payload = sample.payload && typeof sample.payload === "object" ? sample.payload : {};
    const directVenueTargets = Array.isArray(payload.directVenueTargets) ? payload.directVenueTargets : [];
    const key = `${targetMeta.targetMatchId}|${targetMeta.targetTeamRole}`;
    if (!directVenueTargets.some((item) => `${item.targetMatchId}|${item.targetTeamRole}` === key)) {
      directVenueTargets.push(targetMeta);
    }
    sample.payload = {
      ...payload,
      sourceProvider: "500.com",
      ninetyMinuteResult: true,
      formalCompetitionVerified: true,
      directVenueVerified: true,
      odds500MatchId: row.fixtureId,
      directVenueTargets,
    };
  }
}

const audit = {
  schemaVersion: 1,
  generatedAt: capturedAt,
  policy: {
    sampleCountPerTeam: sampleLimit,
    homeTeamVenue: "HOME",
    awayTeamVenue: "AWAY",
    formalCompetitionOnly: true,
    strictlyBeforeTargetKickoff: true,
    scoreDuration: "REGULAR_TIME_FULL_TIME",
    primarySource: "500.com",
  },
  targetMatchCount: targets.length,
  teamVenueGroupCount: groups.length,
  sampleAssignmentCount: groups.reduce((sum, group) => sum + group.samples.length, 0),
  uniqueSourceMatchCount: new Set(groups.flatMap((group) => group.samples.map((row) => row.fixtureId))).size,
  libraryMerge: { added, reused },
  groups,
};

await fs.writeFile(output, `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${JSON.stringify(samples, null, 2)};\n`, "utf8");
await fs.writeFile(auditOutput, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, auditOutput, total: samples.length, ...audit.libraryMerge, groups: groups.length, assignments: audit.sampleAssignmentCount, uniqueSourceMatches: audit.uniqueSourceMatchCount }, null, 2));
