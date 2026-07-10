import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { loadExternalSamples, loadSportterySpHistory, findSpHistory } from "./league-v1-context.mjs";
import { researchTemplate, runUnifiedPrediction } from "./lib/unified-prediction-engine.mjs";

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
const templatePath = path.resolve(args.get("research-template") || "/tmp/unified-research-template.json");
const publishRun = String(args.get("publish-run") || "false").toLowerCase() === "true";

if (!matchQuery) {
  console.error("Usage: node tools/run-unified-prediction.mjs --match <matchId|issue|no|team> [--evidence research.json] [--lock FINAL_LOCK]");
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

const match = {
  matchId: String(item.matchId || item.sportteryKey || item.orderId || ""),
  issue: item.issue || item.no || "",
  no: item.no || "",
  league: leagueName(item.league),
  home: item.home || "",
  away: item.away || "",
  matchDate: item.matchDate || item.ticaiDate || oddsData.lotterNo || "",
  kickoffTime: item.kickoffTime || "",
  handicap: item.handicap || "0",
};

const research = evidencePath
  ? JSON.parse(await fs.readFile(evidencePath, "utf8"))
  : researchTemplate(match);
if (!evidencePath) await fs.writeFile(templatePath, `${JSON.stringify(research, null, 2)}\n`, "utf8");

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
const result = runUnifiedPrediction({
  match,
  market: {
    normal: item.normal || {},
    handicapOdds: item.handicapOdds || {},
    scoreOdds: item.scoreOdds || [],
    totalGoalsOdds: item.totalGoalsOdds || [],
  },
  oddsHistory: historyRow.history || {},
  samples,
  research,
}, { lockType: requestedLockType });

result.sourceContext = {
  sportteryCapturedAt: oddsData.updatedAt || "",
  rollingSamplesIncluded: samples.filter((sample) => sample.source === "completed-match-auto").length,
  researchEvidencePath: evidencePath,
  researchTemplatePath: evidencePath ? "" : templatePath,
};
if (publishRun) {
  const response = await fetch(`${apiBase}/api/model-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      matchId: match.matchId,
      modelVersion: result.modelVersion,
      runType: result.lockType,
      input: { match, market: result.featureSet.market, research },
      output: result,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const published = await response.json();
  if (!response.ok || !published.ok) throw new Error(`Model run publish failed: ${published.error || response.status}`);
  result.sourceContext.modelRunId = published.runId;
}
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: true,
  match,
  output: outputPath,
  lockType: result.lockType,
  blockers: result.gateResult.blockers,
  decision: result.finalDecision,
  researchTemplate: evidencePath ? "" : templatePath,
  modelRunId: result.sourceContext.modelRunId || "",
}, null, 2));
