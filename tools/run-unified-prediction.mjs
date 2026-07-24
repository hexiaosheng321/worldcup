import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { loadExternalSamples, loadSportterySpHistory, findSpHistory } from "./league-v1-context.mjs";
import { researchTemplate, runUnifiedPrediction } from "./lib/unified-prediction-engine.mjs";
import r18Artifact from "./data/wdl-residual-r18.json" with { type: "json" };
import { buildR18Challenger } from "./lib/r18-parallel-output.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  args.set(key.slice(2), value && !value.startsWith("--") ? value : "true");
  if (value && !value.startsWith("--")) index += 1;
}

const matchQuery = String(args.get("match") || "").trim();
const requestedLockType = String(args.get("lock") || "PRE_LOCK").toUpperCase();
const evidencePath = args.get("evidence") ? path.resolve(args.get("evidence")) : "";
const outputPath = path.resolve(args.get("output") || "/tmp/unified-prediction.json");
const outputParts = path.parse(outputPath);
const challengerOutputPath = path.resolve(args.get("challenger-output") || path.join(outputParts.dir, `${outputParts.name}.r18-shadow${outputParts.ext || ".json"}`));
const templatePath = path.resolve(args.get("research-template") || "/tmp/unified-research-template.json");
const publishRun = String(args.get("dry-run") || "false").toLowerCase() !== "true"
  && String(args.get("publish-run") || "true").toLowerCase() !== "false";
// R11 is the active Champion.  R18 remains available only for explicit
// historical/shadow research and is never generated or published by default.
const enableR18Shadow = String(args.get("r18-shadow") || "false").toLowerCase() === "true";

if (!matchQuery) {
  console.error("Usage: node tools/run-unified-prediction.mjs --match <matchId|issue|no|team> [--evidence research.json] [--lock FINAL_LOCK] [--dry-run]");
  process.exit(1);
}

function windowValue(content, variable) {
  const context = { window: {} };
  vm.runInNewContext(content, context);
  return context.window[variable];
}

function leagueName(value = "") {
  const text = String(value || "");
  if (/世界杯|World Cup/i.test(text)) return "世界杯";
  if (/芬超|Veikkausliiga/i.test(text)) return "芬超";
  if (/瑞典超|瑞超|Allsvenskan|Sweden/i.test(text)) return "瑞超";
  if (/挪超|Eliteserien|Norway/i.test(text)) return "挪超";
  if (/韩职|K联赛|K League/i.test(text)) return "韩职";
  return text;
}

function matchesQuery(item) {
  const values = [item.matchId, item.sportteryKey, item.orderId, item.issue, item.no, item.home, item.away]
    .map((value) => String(value || "").toLowerCase());
  return values.some((value) => value && (value === matchQuery.toLowerCase() || value.includes(matchQuery.toLowerCase())));
}

const apiBase = String(process.env.PUBLIC_API_BASE || "https://ticai-model.com").replace(/\/$/, "");
let oddsData = { matches: [] };
let bootstrapPayload = null;
for (const scope of ["full", "initial"]) {
  try {
    const bootstrap = await fetch(`${apiBase}/api/bootstrap?scope=${scope}&includeCases=0`, { signal: AbortSignal.timeout(12000) });
    if (bootstrap.ok) {
      const payload = await bootstrap.json();
      if (!payload.ok || !Array.isArray(payload.matches) || !payload.matches.length) continue;
      bootstrapPayload = payload;
      oddsData = {
        updatedAt: new Date().toISOString(),
        matches: (payload.matches || []).map((row) => {
          try { return { ...JSON.parse(row.payload_json || "{}"), cloudMatchId: row.match_id }; }
          catch { return {}; }
        }).filter((row) => row.home && row.away),
      };
      break;
    }
  } catch {}
}
if (!oddsData.matches?.length) {
  try {
    const response = await fetch(`${apiBase}/api/live-sporttery-data.js`, { signal: AbortSignal.timeout(12000) });
    if (response.ok) oddsData = windowValue(await response.text(), "LIVE_SPORTTERY_ODDS") || oddsData;
  } catch {}
}
if (!oddsData.matches?.length) {
  const oddsFile = await fs.readFile("web/live-sporttery-data.js", "utf8");
  oddsData = windowValue(oddsFile, "LIVE_SPORTTERY_ODDS") || oddsData;
}
const candidates = (oddsData.matches || []).filter(matchesQuery);
const exactId = candidates.find((candidate) => [candidate.matchId, candidate.sportteryKey].some((value) => String(value || "") === matchQuery));
const item = exactId || candidates.sort((a, b) =>
  `${b.matchDate || b.ticaiDate || ""} ${b.kickoffTime || ""}`.localeCompare(`${a.matchDate || a.ticaiDate || ""} ${a.kickoffTime || ""}`)
)[0];
if (!item) throw new Error(`Match not found in live Sporttery pool: ${matchQuery}`);

// Some sales feeds expose a city-level short name that is not a unique club
// identity.  Keep the public display label untouched, but use the verified
// fixture identity for historical sample matching inside the model.
const canonicalFixtureTeams = {
  "2040552": { away: "GAIS" },
  "1318497": { away: "GAIS" },
};
const fixtureTeamIdentity = canonicalFixtureTeams[String(item.matchId || "")]
  || canonicalFixtureTeams[String(item.sportteryKey || item.sourceMatchId || "")]
  || {};

const match = {
  matchId: String(item.matchId || item.sportteryKey || item.orderId || ""),
  issue: item.issue || item.no || "",
  no: item.no || "",
  league: leagueName(item.league),
  home: fixtureTeamIdentity.home || item.home || "",
  away: fixtureTeamIdentity.away || item.away || "",
  matchDate: item.matchDate || item.ticaiDate || oddsData.lotterNo || "",
  kickoffTime: item.kickoffTime || "",
  season: item.season || item.seasonLabel || "",
  round: item.round || item.matchday || "",
  matchday: item.matchday || item.round || "",
  competitionType: item.competitionType || item.competition || "",
  competitionContext: item.competitionContext || null,
  footballDataContext: item.footballDataContext || null,
  handicap: item.handicap || "0",
  competitionStage: item.competitionStage || item.stage || item.round || "",
};

const research = evidencePath
  ? JSON.parse(await fs.readFile(evidencePath, "utf8"))
  : researchTemplate(match);
if (!evidencePath) await fs.writeFile(templatePath, `${JSON.stringify(research, null, 2)}\n`, "utf8");
const governanceToken = String(process.env.MODEL_GOVERNANCE_ADMIN_TOKEN || "").trim();
const governanceAdminUser = String(process.env.MODEL_GOVERNANCE_ADMIN_USER || "prediction-runner").trim();
const governanceHeaders = {
  "content-type": "application/json",
  "x-admin-token": governanceToken,
  "x-admin-user": governanceAdminUser,
};
let governance = { learningGovernance: {}, r16Validation: {}, approvedNotes: [], source: "NO_APPROVED_GOVERNANCE" };
if (governanceToken) {
  const season = String(match.season || match.matchDate || "").slice(0, 4);
  const response = await fetch(`${apiBase}/api/model-governance/approved?league=${encodeURIComponent(match.league)}&season=${encodeURIComponent(season)}`, {
    headers: governanceHeaders,
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`Approved D1 governance fetch failed: ${payload.error || response.status}`);
  governance = payload;
}

async function registerR18ValidationPair(championRunId, challengerRunId, championOutput, challengerOutput) {
  if (!governanceToken) return { status: "SKIPPED_NO_GOVERNANCE_TOKEN" };
  const season = String(match.season || match.matchDate || "").slice(0, 4);
  const leagueSlug = String(match.league || "unknown").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "unknown";
  const cohortId = `r16-r18-wdl-${leagueSlug}-${season}`;
  const championRevision = String(championOutput.modelLessons?.version || championOutput.modelVersion || "").trim();
  const challengerRevision = String(challengerOutput.modelLessons?.version || challengerOutput.modelVersion || "").trim();
  const createResponse = await fetch(`${apiBase}/api/model-validation-cohorts`, {
    method: "POST",
    headers: governanceHeaders,
    body: JSON.stringify({
      cohortId,
      primaryModule: "WIN_DRAW_LOSE",
      targetMarket: "winDrawLose",
      league: match.league,
      season,
      championRevision,
      challengerRevision,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const cohort = await createResponse.json();
  if (!createResponse.ok || !cohort.ok) throw new Error(`R18 validation cohort ensure failed: ${cohort.error || createResponse.status}`);
  const sampleResponse = await fetch(`${apiBase}/api/model-validation-samples`, {
    method: "POST",
    headers: governanceHeaders,
    body: JSON.stringify({ cohortId, championRunId, challengerRunId }),
    signal: AbortSignal.timeout(12000),
  });
  const sample = await sampleResponse.json();
  if (!sampleResponse.ok || !sample.ok) throw new Error(`R18 validation sample registration failed: ${sample.error || sampleResponse.status}`);
  return {
    status: sample.registered === false ? "ALREADY_REGISTERED" : "REGISTERED",
    cohortId,
    championRunId: sample.championRunId || championRunId,
    challengerRunId: sample.challengerRunId || challengerRunId,
    inputHash: sample.inputHash || "",
  };
}

async function loadLiveSpHistory() {
  if (bootstrapPayload?.spHistory) return bootstrapPayload.spHistory;
  try {
    const response = await fetch(`${apiBase}/api/live-sporttery-sp-history.js`, { signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const value = windowValue(await response.text(), "LIVE_SPORTTERY_SP_HISTORY");
      if (value) return value;
    }
  } catch {}
  return loadSportterySpHistory("web/live-sporttery-sp-history.js");
}

const [samples, spHistory] = await Promise.all([
  loadExternalSamples("web/data/externalHistoricalSamples.js"),
  loadLiveSpHistory(),
]);
const historyRow = findSpHistory(spHistory, item) || { history: {} };
const market = {
  normal: item.normal || {},
  handicapOdds: item.handicapOdds || {},
  scoreOdds: item.scoreOdds || [],
  totalGoalsOdds: item.totalGoalsOdds || [],
};
const modelInput = {
  match,
  market,
  oddsHistory: historyRow.history || {},
  samples,
  research,
  // When a verified research packet supplies explicit recent team states,
  // pass them through so the narrative/model does not get shadowed by an
  // empty auto-derived state object from the generic sample library.
  teamState: research.teamState?.homeState && research.teamState?.awayState
    ? research.teamState
    : null,
  tieContext: research.tieContext || null,
  footballDataContext: match.footballDataContext || null,
  learningGovernance: governance.learningGovernance || {},
  r16Validation: governance.r16Validation || {},
  asOf: new Date().toISOString(),
  sourceCapturedAt: oddsData.updatedAt || "",
};
const result = runUnifiedPrediction(modelInput, { lockType: requestedLockType });

const r18Challenger = enableR18Shadow ? buildR18Challenger(result, r18Artifact) : null;

const compactTeam = (value = "") => String(value).toLowerCase().replace(/football club|futbol club|soccer club|\bfc\b|\bsc\b|足球俱乐部|俱乐部|[^\p{L}\p{N}]/gu, "");
const matchTeamKeys = [compactTeam(match.home), compactTeam(match.away)].filter(Boolean);
const replaySamples = samples.filter((sample) => {
  if (sample.league === match.league) return true;
  const sampleTeams = [compactTeam(sample.homeTeam), compactTeam(sample.awayTeam)].filter(Boolean);
  return matchTeamKeys.some((team) => sampleTeams.some((candidate) => candidate === team || (Math.min(candidate.length, team.length) >= 3 && (candidate.includes(team) || team.includes(candidate)))));
});

result.sourceContext = {
  sportteryCapturedAt: oddsData.updatedAt || "",
  rollingSamplesIncluded: samples.filter((sample) => sample.source === "completed-match-auto").length,
  baseCasesIncluded: samples.filter((sample) => sample.source === "d1-base-case").length,
  replaySampleCount: replaySamples.length,
  researchEvidencePath: evidencePath,
  governanceSource: governance.source,
  governanceNoteIds: (governance.approvedNotes || []).map((item) => item.noteId),
  researchTemplatePath: evidencePath ? "" : templatePath,
};
if (r18Challenger) r18Challenger.sourceContext = { ...result.sourceContext };
if (publishRun) {
  const comparisonGroupId = `r16-r18-${match.matchId}-${crypto.randomUUID()}`;
  const pairedInput = { ...modelInput, samples: replaySamples };
  const publishModelRun = async (output, runRole) => {
    const response = await fetch(`${apiBase}/api/model-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: match.matchId,
        modelVersion: output.modelVersion,
        runType: output.lockType,
        runRole,
        comparisonGroupId,
        input: pairedInput,
        output,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const published = await response.json();
    if (!response.ok || !published.ok) throw new Error(`${runRole} model run publish failed: ${published.error || response.status}`);
    return published;
  };
  const championPublished = await publishModelRun(result, "CHAMPION");
  result.sourceContext.modelRunId = championPublished.runId;
  result.sourceContext.comparisonGroupId = comparisonGroupId;
  if (r18Challenger) {
    const challengerPublished = await publishModelRun(r18Challenger, "CHALLENGER");
    result.sourceContext.r18ChallengerRunId = challengerPublished.runId;
    r18Challenger.sourceContext = {
      ...r18Challenger.sourceContext,
      modelRunId: challengerPublished.runId,
      championRunId: championPublished.runId,
      comparisonGroupId,
    };
    try {
      const registration = await registerR18ValidationPair(
        championPublished.runId,
        challengerPublished.runId,
        result,
        r18Challenger,
      );
      result.sourceContext.r18ValidationRegistration = registration;
      r18Challenger.sourceContext.r18ValidationRegistration = registration;
    } catch (error) {
      const registration = { status: "FAILED", error: error?.message || String(error) };
      result.sourceContext.r18ValidationRegistration = registration;
      r18Challenger.sourceContext.r18ValidationRegistration = registration;
    }
  }
}
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
if (r18Challenger) await fs.writeFile(challengerOutputPath, `${JSON.stringify(r18Challenger, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: true,
  match,
  output: outputPath,
  challengerOutput: r18Challenger ? challengerOutputPath : "",
  lockType: result.lockType,
  blockers: result.gateResult.blockers,
  decision: result.finalDecision,
  researchTemplate: evidencePath ? "" : templatePath,
  modelRunId: result.sourceContext.modelRunId || "",
  r18ChallengerRunId: result.sourceContext.r18ChallengerRunId || "",
  comparisonGroupId: result.sourceContext.comparisonGroupId || "",
  r18ValidationRegistration: result.sourceContext.r18ValidationRegistration || null,
}, null, 2));
