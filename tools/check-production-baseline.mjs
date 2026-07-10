import fs from "node:fs";
import { execFileSync } from "node:child_process";

const index = fs.readFileSync("web/index.html", "utf8");
const main = fs.readFileSync("web/app/app-main.js", "utf8");
const sync = fs.readFileSync("tools/sync-sporttery-cache.mjs", "utf8");
const api = fs.readFileSync("web/functions/api/[[path]].js", "utf8");
const leagueContext = fs.readFileSync("tools/league-v1-context.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/sporttery-auto-deploy.yml", "utf8");
const unifiedEngine = fs.readFileSync("tools/lib/unified-prediction-engine.mjs", "utf8");
const unifiedRunner = fs.readFileSync("tools/run-unified-prediction.mjs", "utf8");

const retiredMarkers = [
  'data-tab="path"',
  'data-tab="knockout"',
  'id="path"',
  'id="knockout"',
  'activateTab("path")',
  'activateTab("knockout")',
];

const foundRetired = retiredMarkers.filter((marker) => index.includes(marker) || main.includes(marker));
if (foundRetired.length) {
  throw new Error(`Production baseline rejected retired World Cup UI: ${foundRetired.join(", ")}`);
}

const requiredMarkers = [
  'data-tab="schedule"',
  'id="schedule"',
  'hash === "#worldcup" || hash === "#worldcup-knockout"',
  'activateTab("schedule")',
];
const missingRequired = requiredMarkers.filter((marker) => !index.includes(marker) && !main.includes(marker));
if (missingRequired.length) {
  throw new Error(`Production baseline missing required World Cup behavior: ${missingRequired.join(", ")}`);
}

if (!fs.readFileSync("web/app/app-core.js", "utf8").includes('CLOUD_BOOTSTRAP_CACHE_KEY = "wc_cloud_bootstrap_initial_v2"')) {
  throw new Error("Production baseline requires the corrected score-cache namespace.");
}
if (!fs.readFileSync("web/lib/cloudStore.js", "utf8").includes('cache: options.cache || "no-store"')) {
  throw new Error("Production baseline requires uncached Cloudflare bootstrap reads.");
}

const syncMarkers = [
  "/api/sync/sporttery-snapshot",
  "/api/sync/okooo-live",
  "/api/sync/okooo-results",
  "/api/sync/live-results",
  "/api/sync/reconcile-completed-samples",
];
const missingSyncMarkers = syncMarkers.filter((marker) => !sync.includes(marker));
if (missingSyncMarkers.length) {
  throw new Error(`Production baseline missing automatic score pipeline: ${missingSyncMarkers.join(", ")}`);
}

const rollingSampleMarkers = [
  "upsertCompletedMatchHistoricalSample",
  "ensureMatchForStoredResult",
  "seededMatches",
  'source = "completed-match-auto"',
  'path === "sync/reconcile-completed-samples"',
  'path === "historical-samples/rolling"',
];
const missingRollingSampleMarkers = rollingSampleMarkers.filter((marker) => !api.includes(marker));
if (missingRollingSampleMarkers.length) {
  throw new Error(`Production baseline missing completed-match sample ingestion: ${missingRollingSampleMarkers.join(", ")}`);
}
if (!leagueContext.includes("/api/historical-samples/rolling?limit=1000")) {
  throw new Error("Production baseline requires rolling completed samples in the next prediction context.");
}
if (!workflow.includes('cron: "*/30 * * * *"')) {
  throw new Error("Production baseline requires 24/7 completed-match synchronization.");
}
const unifiedPredictionMarkers = [
  "UNIFIED_PREDICTION_V1",
  "preMatchResearch",
  "decisionConflictResolved",
  "handicapMapping",
  "researchTemplate",
  "model-runs",
];
const missingUnifiedPredictionMarkers = unifiedPredictionMarkers.filter((marker) => !unifiedEngine.includes(marker) && !unifiedRunner.includes(marker) && !api.includes(marker));
if (missingUnifiedPredictionMarkers.length) {
  throw new Error(`Production baseline missing unified prediction contract: ${missingUnifiedPredictionMarkers.join(", ")}`);
}
const syncPositions = syncMarkers.map((marker) => sync.indexOf(marker));
if (!syncPositions.every((position, index) => index === 0 || position > syncPositions[index - 1])) {
  throw new Error("Production baseline requires match seeding before live schedule and result synchronization.");
}

const regularTimeMarkers = [
  'scoreMode: usesRegularTime ? "regularTime" : "fullTime"',
  '!/extra|after|penalt|shootout|aet/i.test(status)',
  "liveFallbackRowHasUsableScore",
];
const missingRegularTimeMarkers = regularTimeMarkers.filter((marker) => !api.includes(marker));
if (missingRegularTimeMarkers.length) {
  throw new Error(`Production baseline must preserve 90-minute result scoring: ${missingRegularTimeMarkers.join(", ")}`);
}

const okoooDirectionMarkers = [
  'normal["16"]',
  'normal["14"]',
  'handicapOdds["13"]',
  'handicapOdds["10"]',
];
const missingOkoooDirectionMarkers = okoooDirectionMarkers.filter((marker) => !api.includes(marker));
if (missingOkoooDirectionMarkers.length) {
  throw new Error(`Production baseline missing OKOOO home/away option mapping: ${missingOkoooDirectionMarkers.join(", ")}`);
}

if (!process.env.GITHUB_ACTIONS) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const remoteMain = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  if (head !== remoteMain) {
    throw new Error(`Production deploy must use the pushed origin/main commit. HEAD=${head.slice(0, 8)} origin/main=${remoteMain.slice(0, 8)}`);
  }
  const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) throw new Error("Production deploy requires a clean worktree.");
}

console.log("Production baseline verified: current World Cup navigation, full D1 score loading, automatic result pipeline, and source alignment checks passed.");
