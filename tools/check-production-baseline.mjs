import fs from "node:fs";
import { execFileSync } from "node:child_process";

const index = fs.readFileSync("web/index.html", "utf8");
const main = fs.readFileSync("web/app/app-main.js", "utf8");
const dataApp = fs.readFileSync("web/app/app-data.js", "utf8");
const i18nApp = fs.readFileSync("web/app/app-i18n.js", "utf8");
const homeApp = fs.readFileSync("web/app/app-home.js", "utf8");
const detailApp = fs.readFileSync("web/app/app-detail.js", "utf8");
const panels = fs.readFileSync("web/app/app-panels.js", "utf8");
const styles = fs.readFileSync("web/styles.css", "utf8");
const sync = fs.readFileSync("tools/sync-sporttery-cache.mjs", "utf8");
const api = fs.readFileSync("web/functions/api/[[path]].js", "utf8");
const leagueContext = fs.readFileSync("tools/league-v1-context.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/sporttery-auto-deploy.yml", "utf8");
const syncWorker = fs.readFileSync("worker/sync-worker.js", "utf8");
const syncWorkerConfig = fs.readFileSync("wrangler.sync.jsonc", "utf8");
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
if (index.includes("odds-map-updated") || panels.includes("预赛日期") || panels.includes("debugPre")) {
  throw new Error("Production baseline rejects the retired odds-map timestamp/debug row.");
}
if (panels.includes("review-version-strip") || panels.includes("全体彩口径")) {
  throw new Error("Production baseline rejects the retired model-version hit-rate strip.");
}
for (const marker of ["function statsLeagueName", "allRows.map((row) => row.league)", 'aria-label="选择联赛"']) {
  if (!panels.includes(marker)) throw new Error(`Production baseline requires league-only stats filtering: ${marker}`);
}
for (const marker of ['data-odds-open-detail=', 'title="进入比赛详情"']) {
  if (!panels.includes(marker)) throw new Error(`Production baseline requires odds-map match detail navigation: ${marker}`);
}
if (!detailApp.includes('matchDetailReturnTarget === "odds-map"') || !detailApp.includes("← 返回盘口图谱")) {
  throw new Error("Production baseline requires odds-map detail return navigation.");
}
if (panels.includes("全部联赛 / 专题") || panels.includes('aria-label="选择联赛或专题"')) {
  throw new Error("Production baseline rejects model/topic categories in the league filter.");
}
if (panels.includes("renderCalibrationPanel") || panels.includes("calibration-panel") || panels.includes("模型校准统计")) {
  throw new Error("Production baseline rejects the retired calibration summary panels.");
}
for (const marker of ['value="last7"', 'value="last15"', 'label="按月份"', 'label="按单日"', "globalStatsDateMatches"]) {
  if (!panels.includes(marker)) throw new Error(`Production baseline missing date-range filter marker: ${marker}`);
}
const statsCore = fs.readFileSync("web/app/app-core.js", "utf8");
if (!statsCore.includes('let activeGlobalStatsDate = "last7"') || !panels.includes('activeGlobalStatsDate = "last7"')) {
  throw new Error("Production baseline requires model stats to default and fall back to the latest seven days.");
}
if (!panels.includes('const competitions = new Set(visibleRows.map((row) => row.league))') || !panels.includes('<strong>${rows.length}</strong>')) {
  throw new Error("Production baseline requires summary cards and detail rows to share the active date range.");
}
for (const marker of ["openOddsSignalSummaryModal", "oddsSignalSummaryRows", 'data-odds-signal-summary="strong"', 'data-odds-signal-summary="conflict"', 'data-odds-signal-summary="home-hot"']) {
  if (!panels.includes(marker)) throw new Error(`Production baseline missing odds signal modal marker: ${marker}`);
}
if (!main.includes("[data-odds-signal-summary]")) {
  throw new Error("Production baseline requires click handling for odds signal summary cards.");
}
if (!styles.includes(".global-stats-table-toolbar button span") || !styles.includes("color: #ffffff;")) {
  throw new Error("Production baseline requires high-contrast text in the global-stats maximize button.");
}

if (!fs.readFileSync("web/app/app-core.js", "utf8").includes('CLOUD_BOOTSTRAP_CACHE_KEY = "wc_cloud_bootstrap_initial_v3"')) {
  throw new Error("Production baseline requires the corrected score-cache namespace.");
}
if (!fs.readFileSync("web/app/app-core.js", "utf8").includes("result.matchId || result.sportteryKey || result.cloudMatchId") || !fs.readFileSync("web/app/app-data.js", "utf8").includes("cloudWorldCupMatches") || !fs.readFileSync("web/app/app-data.js", "utf8").includes("data.matches = matches")) {
  throw new Error("Production baseline requires D1 World Cup results to rehydrate the goal-track match array by match id.");
}
if (!fs.readFileSync("web/app/app-core.js", "utf8").includes('return `${competition} 联赛 ${version} 模型`')) {
  throw new Error("Production baseline requires canonical public model names.");
}
const appCore = fs.readFileSync("web/app/app-core.js", "utf8");
const appDetail = fs.readFileSync("web/app/app-detail.js", "utf8");
if (!appCore.includes("return handicapLineFromPrediction(pred) || handicapLine(pred?.no)")) {
  throw new Error("Production baseline requires the locked prediction handicap before any number-only fallback.");
}
if (!appCore.includes("const resolvedHandicap = originalHandicap || primaryHandicap")) {
  throw new Error("Production baseline forbids presentation code from rewriting an explicit locked handicap conclusion.");
}
if (!appDetail.includes("handicapLine(match)")) {
  throw new Error("Production baseline requires full fixture identity for detail-page handicap lookup.");
}
if (appDetail.includes("renderProjectionFlowGrid") || appDetail.includes('class="match-page-section projection-flow"')) {
  throw new Error("Production baseline rejects the duplicate pre-summary projection flow grid.");
}
if (appDetail.includes("handicapLine(match.no)")) {
  throw new Error("Production baseline rejects repeated three-digit match numbers as detail-page handicap identity.");
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
if (!syncWorkerConfig.includes('"*/5 * * * *"') || !syncWorker.includes('postPagesApi(env, "/api/sync/okooo-live"') || !syncWorker.includes('postPagesApi(env, "/api/sync/reconcile-completed-samples"')) {
  throw new Error("Production baseline requires Cloudflare 5-minute OKOOO live schedule synchronization.");
}
const unifiedPredictionMarkers = [
  "UNIFIED_PREDICTION_V4",
  "preMatchResearch",
  "decisionConflictResolved",
  "handicapIndependent",
  "scoreIndependent",
  "totalsIndependent",
  "jointCompatibility",
  "researchTemplate",
  "model-runs",
  "tenStepResult",
  "backtestContract",
  "LESSONS_2026-07-13_LEAGUE_R1",
  "LEAGUE_LEARNING_PROFILES",
  "scenarioTotalsCovered",
  "scenarioHandicapCovered",
  "confidenceComponents",
  "counterScriptDiverges",
  "counterPathRisk",
  "venueProfile",
  "leagueProfile",
  "drawOverrideJustified",
  "recentFormFresh",
  "fundamentalData",
  "temporalIntegrity",
  "lifecycleContract",
];
const missingUnifiedPredictionMarkers = unifiedPredictionMarkers.filter((marker) => !unifiedEngine.includes(marker) && !unifiedRunner.includes(marker) && !api.includes(marker));
if (missingUnifiedPredictionMarkers.length) {
  throw new Error(`Production baseline missing unified prediction contract: ${missingUnifiedPredictionMarkers.join(", ")}`);
}
for (const marker of ["FINAL_LOCK requires modelRunId", "linked model run did not pass the complete ten-step FINAL_LOCK contract", "independent handicap probabilities", "independent handicap probability leader", "independent score probabilities", "independent total-goals probabilities", "jointly compatible direction and handicap pair", "complete non-market fundamentals"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing mandatory FINAL_LOCK gate: ${marker}`);
}
for (const marker of ["enrichPredictionFromUnifiedRun", "body.sportteryPrediction = enrichPredictionFromUnifiedRun"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires FINAL_LOCK evidence hydration: ${marker}`);
}
for (const marker of ["dedupeHistoricalSamples", "canonicalHistoricalTeam", "duplicateSources"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires cross-source historical sample deduplication: ${marker}`);
}
const confidenceGradeBlock = panels.slice(panels.indexOf("function confidenceGrade"), panels.indexOf("function confidenceAdvice"));
for (const marker of ['score >= 70', 'score >= 60', 'score >= 50']) {
  if (!confidenceGradeBlock.includes(marker)) throw new Error(`Production baseline requires unified A/B/C/D confidence grading: ${marker}`);
}
if (/return "[ABC][+-]"/.test(confidenceGradeBlock)) {
  throw new Error("Production baseline rejects plus/minus confidence grades.");
}
for (const marker of ["renderJudgementRiskPanel", 'data-fixed-detail-panel="judgement-risk"']) {
  if (!detailApp.includes(marker)) throw new Error(`Production baseline requires persistent judgement risk panel: ${marker}`);
}
const worldCupFullMode = detailApp.slice(detailApp.indexOf("function renderWorldCupFullProjection"), detailApp.indexOf("function renderMatchDetail"));
const worldCupDetailShell = detailApp.slice(detailApp.indexOf("function renderMatchDetail"), detailApp.indexOf("function openMatchPage"));
const sportteryFullMode = detailApp.slice(detailApp.indexOf("function renderSportteryV4FullMode"), detailApp.indexOf("function renderSportteryDataSupport"));
const sportteryDetailShell = detailApp.slice(detailApp.indexOf("function renderSportteryMatchDetail"), detailApp.indexOf("function openSportteryMatchPage"));
if (!worldCupFullMode.includes("renderJudgementRiskPanel(pred)") || !sportteryFullMode.includes("renderJudgementRiskPanel(modelPred, research.riskNotes)")) {
  throw new Error("Production baseline requires judgement risk inside every full projection mode.");
}
if (worldCupDetailShell.includes("renderJudgementRiskPanel(") || sportteryDetailShell.includes("renderJudgementRiskPanel(")) {
  throw new Error("Production baseline rejects judgement risk outside full projection mode.");
}
if (!api.includes("only the preferred FINAL_LOCK can enter Case Base")) {
  throw new Error("Production baseline requires one official Case per preferred FINAL_LOCK.");
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
for (const marker of ["beijingDateTimeFromUtc", 'timezone", "Asia/Shanghai"', "kickoffUpdated", "live-schedule-"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires real kickoff-time hydration: ${marker}`);
}
for (const marker of ["parseFiveHundredKickoffs", 'data-matchtime', 'data-buyendtime', '500-jczq-matchtime', 'existing-reliable-schedule']) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires preferred 500.com kickoff-time ingestion: ${marker}`);
}

const okoooDirectionMarkers = [
  'normal["16"]',
  'normal["14"]',
  'handicapOdds["13"]',
  'handicapOdds["10"]',
  "boundary.SportteryWDL",
  "okoooScoreOptionMap",
  "okoooTotalGoalsOdds",
];
const missingOkoooDirectionMarkers = okoooDirectionMarkers.filter((marker) => !api.includes(marker));
if (missingOkoooDirectionMarkers.length) {
  throw new Error(`Production baseline missing OKOOO home/away option mapping: ${missingOkoooDirectionMarkers.join(", ")}`);
}

const kickoffSourceMarkers = [
  "salesCloseTime",
  'fiveHundred ? "500-jczq-matchtime" : "pending-official-schedule"',
  "officialByOrderId",
  'body.calculatorRaw || body.calculator || null',
];
const missingKickoffSourceMarkers = kickoffSourceMarkers.filter((marker) => !api.includes(marker));
if (missingKickoffSourceMarkers.length) {
  throw new Error(`Production baseline must keep sale-close and real kickoff clocks separate: ${missingKickoffSourceMarkers.join(", ")}`);
}
for (const marker of ["okoooLiveCenterUrl", "fetchOkoooJczqLiveScores", "OKOOO-live", "ctrl_homescore", "ctrl_awayscore"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires OKOOO in-play score ingestion: ${marker}`);
}
if (!appCore.includes('row.source === "OKOOO-live"') || !appCore.includes("row.externalId") || !api.includes('row.source === "OKOOO-live"') || !api.includes("row.externalId")) {
  throw new Error("Production baseline requires exact OKOOO Sporttery match-id matching before ambiguous team-name fallback.");
}
for (const marker of ['data-live-score-active', 'dataset.liveScoreActive === "1"']) {
  if (!homeApp.includes(marker)) throw new Error(`Production baseline requires homepage live-score timer protection: ${marker}`);
}
if (!sync.includes('postApi("/api/sync/okooo-live", { calculatorRaw })')) {
  throw new Error("Production baseline requires the reachable sync runner to supply official kickoff times to OKOOO odds sync.");
}
for (const marker of ["syncHealthDecision", "retryableStatuses", 'health.level === "DEGRADED"', "process.exitCode = health.exitCode"]) {
  if (!sync.includes(marker)) throw new Error(`Production baseline requires retry/degraded-success sync policy: ${marker}`);
}
for (const marker of ['data-language-option="zh-CN"', 'data-language-option="ja"', 'data-language-option="en"', "app/app-i18n.js"]) {
  if (!index.includes(marker)) throw new Error(`Production baseline requires Chinese/Japanese/English language controls: ${marker}`);
}
for (const marker of ["ticai_ui_locale_v1", "MutationObserver", "WC_I18N", 'document.documentElement.lang = locale']) {
  if (!i18nApp.includes(marker)) throw new Error(`Production baseline requires persistent localization runtime: ${marker}`);
}
if (index.includes('<script src="./live-sporttery-data.js')) {
  throw new Error("Production baseline rejects stale local sporttery data as a first-paint script.");
}
for (const marker of [
  "const liveScoresReady = refreshLiveFootballScoresData({ rerender: false })",
  'loadCloudBootstrapData({ rerender: false, scope: "initial" })',
  "if (await liveScoresReady) renderCurrentRouteSurfaces()",
]) {
  if (!main.includes(marker)) throw new Error(`Production baseline requires non-blocking parallel mobile homepage hydration: ${marker}`);
}
if (!dataApp.includes("const maxAgeMs = 15 * 60 * 1000")) {
  throw new Error("Production baseline requires a freshness limit on the first-paint cloud cache.");
}
for (const marker of ["sportteryDetailNavigationPending", "previousScrollY", 'behavior: "auto"']) {
  if (!detailApp.includes(marker) && !appCore.includes(marker)) {
    throw new Error(`Production baseline requires scroll-preserving detail refresh: ${marker}`);
  }
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
