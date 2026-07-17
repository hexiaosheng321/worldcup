import fs from "node:fs";
import { execFileSync } from "node:child_process";

const index = fs.readFileSync("web/index.html", "utf8");
const main = fs.readFileSync("web/app/app-main.js", "utf8");
const dataApp = fs.readFileSync("web/app/app-data.js", "utf8");
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
const unifiedPublisher = fs.readFileSync("tools/publish-unified-locks.mjs", "utf8");
const i18n = fs.readFileSync("web/app/app-i18n.js", "utf8");
const baseStyles = fs.readFileSync("web/styles-base.css", "utf8");
const reviewEngine = fs.readFileSync("web/lib/reviewEngine.js", "utf8");
const firecrawlContext = fs.readFileSync("web/data/firecrawlObjectiveContext.js", "utf8");

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
  '<base href="/" />',
];
const missingRequired = requiredMarkers.filter((marker) => !index.includes(marker) && !main.includes(marker));
if (missingRequired.length) {
  throw new Error(`Production baseline missing required World Cup behavior: ${missingRequired.join(", ")}`);
}
for (const marker of ["data-language-toggle", "data-language-option=\"zh-CN\"", "data-language-option=\"ja\"", "data-language-option=\"en\"", "app/app-i18n.js?v=20260717_postponed_lifecycle_v1"]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing language selector marker: ${marker}`);
}
if (!index.includes("lib/similarCaseEngine.js?v=20260716_brazil_league_fix_r1")) {
  throw new Error("Production baseline requires the Brazil Serie A competition-normalization cache namespace.");
}
if (!index.includes("app/app-detail.js?v=20260716_brazil_profile_null_guard_r1") || !detailApp.includes("pred = pred || {}")) {
  throw new Error("Production baseline requires the league-profile null-data guard and cache namespace.");
}
if (!baseStyles.includes("body.home-mode .home-topbar") || !baseStyles.includes("overflow: visible")) {
  throw new Error("Production baseline must keep the language menu outside the header clipping box");
}
for (const marker of ["Mobile reading system", "font-size: 15px", "min-height: 44px", "@media (max-width: 640px)"]) {
  if (!baseStyles.includes(marker)) throw new Error(`Production baseline missing mobile readability marker: ${marker}`);
}
for (const marker of ["activeRoots", "requestAnimationFrame", "loadDictionary", "ticai:localechange"]) {
  if (!i18n.includes(marker)) throw new Error(`Production baseline missing safe i18n runtime marker: ${marker}`);
}
for (const localeFile of ["web/i18n/en.json", "web/i18n/ja.json"]) {
  const locale = fs.readFileSync(localeFile, "utf8");
  for (const marker of ["A级方向命中率", "B级方向命中率", "C级方向命中率", "D级方向命中率", "暂无验证样本", "延期追踪", "无效样本"]) {
    if (!locale.includes(marker)) throw new Error(`Production baseline missing confidence backtest translation in ${localeFile}: ${marker}`);
  }
}
if (i18n.includes("MutationObserver") || i18n.includes("observer.observe")) {
  throw new Error("Production baseline rejects DOM-observer localization because it caused repeated full-page work.");
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
const goalTrackDetail = fs.readFileSync("web/app/app-detail.js", "utf8");
for (const marker of ["data-goal-trend-maximize", "openGoalTrendModal", "trend-table-expanded"]) {
  if (!goalTrackDetail.includes(marker) && !main.includes(marker) && !styles.includes(marker)) {
    throw new Error(`Production baseline missing goal-track maximize marker: ${marker}`);
  }
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
for (const marker of ["canonicalSportteryMatchPath", "currentSportteryRouteKey", "normalizeLegacySportteryRoute", "updateSportterySeoMetadata"]) {
  if (!appCore.includes(marker)) throw new Error(`Production baseline missing canonical match route marker: ${marker}`);
}
for (const marker of ["history.pushState", "canonicalSportteryMatchPath", "handleClientRouteChange"]) {
  if (!appDetail.includes(marker)) throw new Error(`Production baseline missing canonical detail navigation marker: ${marker}`);
}
for (const marker of ['window.addEventListener("popstate"', "canonicalSportteryMatchPath(sportteryKey)"]) {
  if (!main.includes(marker)) throw new Error(`Production baseline missing canonical route analytics marker: ${marker}`);
}
for (const marker of ["canonicalAnalyticsPagePath", "analyticsCanonicalPagePathSql", "sportterySitemap"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing canonical analytics or sitemap marker: ${marker}`);
}
for (const marker of ["lockRowToSportteryMatch", "mergeLiveTargetMatches", "d1LiveTargetMatches", "insertMissingLiveTargetMatch", "lockedPredictionOnlyCount"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing lock-backed live-score target marker: ${marker}`);
}
for (const marker of ["sportteryRequestCandidates", "targetUrl, fallback", 'stage: "upstream-results-fetch"', "retryable: true"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing resilient Sporttery result-source marker: ${marker}`);
}
if (!dataApp.includes("if (!force || !window.WC_CLOUD_STORE?.syncSportteryResults) return false")) {
  throw new Error("Production baseline forbids ordinary visitors from triggering a server-side Sporttery result write sync.");
}
for (const marker of ["WC_FIRECRAWL_OBJECTIVE_CONTEXT", "firecrawl-objective-context-placeholder", "matches: []"]) {
  if (!firecrawlContext.includes(marker)) throw new Error(`Production baseline missing safe Firecrawl placeholder marker: ${marker}`);
}
for (const marker of ["liveFallbackRowHasScheduledStatus", "liveFallbackRowHasMatchStatus", "liveFallbackRowMatchesSportteryMatch", "scheduled", "sourceState"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing scheduled live-score matching marker: ${marker}`);
}
for (const marker of ["liveScoreIsScheduled", "实时源已匹配", '"WAIT"']) {
  if (!appCore.includes(marker) && !homeApp.includes(marker)) throw new Error(`Production baseline missing matched scheduled-fixture UI marker: ${marker}`);
}
for (const marker of ["liveFallbackRowsFromSyncLogs", "d1RecentLiveFallbackRows", "staleSnapshotCount", "isStaleSnapshot"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing resilient live-score snapshot marker: ${marker}`);
}
for (const marker of [
  "20260717_sporttery_dedupe_v1",
  "app/app-data.js?v=20260717_sporttery_dedupe_v1",
]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing Sporttery dedupe cache namespace: ${marker}`);
}
for (const marker of ["dedupeSportteryMatchRows", "authoritativeSportteryMatchId", "sporttery-okooo-"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing authoritative Sporttery fixture dedupe marker: ${marker}`);
}
for (const marker of ["dedupeSportteryPoolRows", "sportteryPoolRowQuality", "sportteryNoDateTeamMatch"]) {
  if (!appCore.includes(marker) && !homeApp.includes(marker)) throw new Error(`Production baseline missing client Sporttery fixture dedupe marker: ${marker}`);
}
for (const marker of [
  "20260717_postponed_lifecycle_v1",
  "styles.css?v=20260717_postponed_lifecycle_v1",
  "app/app-panels.js?v=20260717_postponed_lifecycle_v1",
]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing postponed lifecycle cache namespace: ${marker}`);
}
for (const marker of ["sportteryReviewLifecycle", "POSTPONED", "RESCHEDULED", "无效样本"]) {
  if (!appCore.includes(marker) && !panels.includes(marker)) throw new Error(`Production baseline missing postponed review lifecycle marker: ${marker}`);
}
for (const marker of [
  "20260717_postponed_pool_filter_v1",
  "app/app-core.js?v=20260717_postponed_pool_filter_v1",
  "app/app-home.js?v=20260717_postponed_pool_filter_v1",
]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing postponed pool filter cache namespace: ${marker}`);
}
for (const marker of ["sportteryPoolShouldHide", "hiddenByExceptionalStatus", "!item.hiddenByExceptionalStatus"]) {
  if (!appCore.includes(marker) && !homeApp.includes(marker)) throw new Error(`Production baseline missing postponed pool visibility marker: ${marker}`);
}
if (!fs.readFileSync("web/robots.txt", "utf8").includes("https://ticai-model.com/api/sitemap.xml")) {
  throw new Error("Production baseline requires the canonical sporttery sitemap in robots.txt.");
}
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
const apiRoute = fs.readFileSync("web/functions/api/[[path]].js", "utf8");
for (const marker of ["async function edgeCached", 'keepSearchParams: ["includeCases", "scope"]', "{ ttl: 8 }"]) {
  if (!apiRoute.includes(marker)) throw new Error(`Production baseline missing safe edge microcache marker: ${marker}`);
}
if (!apiRoute.includes("const matchLimit = initialScope ? 30 : 200") || !apiRoute.includes("const lockLimit = initialScope ? 20 : 200")) {
  throw new Error("Production baseline requires the reduced initial bootstrap scope.");
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
  "LESSONS_2026-07-17_MARKET_SCOPED_GATES_R15",
  "HHAD_ONLY",
  "marketAvailability",
  "FULL_JOINT_GRID_ONLY_NO_OFFICIAL_SCORE_REFEED",
  "componentFoundationEligible",
  "SHARED_FOUNDATION_WITH_MARKET_SCOPED_CRITICAL_GATES",
  "GRADE_A_B_ONLY_C_OBSERVATION",
  "overallGrade",
  "overallGradeAudit",
  "SHARED_FOUNDATION_FIRST_THEN_MARKET_SCOPED_BLOCKS_AND_COMPONENT_STRENGTH",
  "sharedPackageGapFree",
  "criticalPackageGapFree",
  "SHARED_GAPS_FORCE_PACKAGE_D_MARKET_GAPS_BLOCK_ONLY_AFFECTED_MARKETS",
  "outputConsistencyScore",
  "qualifyingVenueSamplesComplete",
  "outputConsistencyComplete",
  "oneGoalWinProtected",
  "OFFICIAL_SCORE_TOTALS_THEN_HIGHEST_REMAINING_BUCKET",
  "FORMAL_DIRECTION_SCORE_COMPATIBLE_PAIR",
  "DIRECTION_CONDITIONAL_CHALLENGER_SHADOW",
  "LEAGUE_LEARNING_PROFILES",
  "scenarioTotalsCovered",
  "scenarioHandicapCovered",
  "confidenceComponents",
  "scoreCoverageOptimized",
  "riskScenarioAvailable",
  "riskPathRisk",
  "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY",
  "oppositeWinPathChecked",
  "secondScenarioInProbability",
  "twoLegContextComplete",
  "seasonLearning",
  "CHALLENGER_SHADOW",
  "handicapDecisionConflictResolved",
  "winDrawLoseSingleHit",
  "formalHandicapSingleHit",
  "independentHandicapLeaderSingleHit",
  "conditionalHandicapChallengerSingleHit",
  "formalWinDrawLoseHandicapJointHit",
  "totalGoalsDoubleHit",
  "scoreDoubleHit",
  "venueProfile",
  "leagueProfile",
  "crossLeagueStrengthNormalized",
  "evidenceDirectionConflictResolved",
  "competitionStageConsistent",
  "CHALLENGER_SHADOW_35",
  "DECAY_AGGREGATE_LEADER_FOLLOW_UP_GOALS_UNLESS_EXPANSION_EVIDENCE",
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
for (const marker of ["PRE_LOCK", "conditionalHandicapChallenger", "complete unified prediction package", "must publish its", "candidateSelections", "formalSelections", "blocked market leaked into formal markets"]) {
  if (!unifiedPublisher.includes(marker)) throw new Error(`Production baseline missing PRE_LOCK shadow publishing contract: ${marker}`);
}
for (const marker of ["replaySamples", "replaySampleCount", "input: { ...modelInput, samples: replaySamples }"]) {
  if (!unifiedRunner.includes(marker)) throw new Error(`Production baseline missing replayable model-run input contract: ${marker}`);
}
for (const marker of ["betOutcome", "modelAudit", "SHADOW_AUDIT", "SHADOW_OBSERVATION", "SHADOW_PENDING", "challengerPromotion", "四组件全部命中"]) {
  if (!api.includes(marker) && !reviewEngine.includes(marker)) throw new Error(`Production baseline missing self-learning review marker: ${marker}`);
}
for (const marker of ["shadow_model_audits", "createShadowAuditForLock", "only the latest preferred PRE_LOCK can enter Shadow Audit", "SHADOW_"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing PRE_LOCK shadow settlement marker: ${marker}`);
}
if (!api.includes("trigger_type=excluded.trigger_type")) {
  throw new Error("Production baseline requires refreshed upgrade notes to replace stale trigger types.");
}
for (const marker of ["learningEligibility", "probabilityMetrics", "failureMode", "seasonLearning", "modelRevision", "formalHandicapSingleHit", "independentHandicapLeaderSingleHit", "conditionalHandicapChallengerSingleHit", "formalWinDrawLoseHandicapJointHit", "handicapTrackAudit", "diagnosisSummary"]) {
  if (!fs.readFileSync("web/functions/api/lib/utils.js", "utf8").includes(marker)) throw new Error(`Production baseline missing Case API self-learning field: ${marker}`);
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
for (const marker of [
  "function confidenceDirectionBacktests",
  '["A", "B", "C", "D"].map',
  "row.confidence === grade",
  "row.directionHit === true",
  "暂无验证样本",
  "${grade}级方向命中率",
]) {
  if (!panels.includes(marker)) throw new Error(`Production baseline missing confidence-grade direction backtest marker: ${marker}`);
}
for (const marker of [".confidence-backtest-metric", ".grade-a", ".grade-b", ".grade-c", ".grade-d"]) {
  if (!styles.includes(marker)) throw new Error(`Production baseline missing confidence-grade metric style: ${marker}`);
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
for (const marker of [
  'PREFERRED_LOCK_ORDER_SQL = "locked_at DESC, lock_id DESC"',
  "only a latest preferred FINAL_LOCK can enter Case Base",
]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing latest-model lock lifecycle marker: ${marker}`);
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
for (const marker of ["parseFiveHundredKickoffs", 'data-matchtime', 'data-buyendtime', 'data-homesxname', 'data-awaysxname', 'match.home === match.away', "sameFixtureWhere", "$.fiveHundredFixtureId", '500-jczq-matchtime', 'existing-reliable-schedule']) {
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
for (const marker of ["syncHealthDecision", "retryableStatuses", "payload?.ok !== false", 'health.level === "DEGRADED"', "process.exitCode = health.exitCode"]) {
  if (!sync.includes(marker)) throw new Error(`Production baseline requires retry/degraded-success sync policy: ${marker}`);
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

for (const testFile of ["tools/test-competition-normalization.mjs", "tools/test-unified-prediction-engine.mjs", "tools/test-live-score-targets.mjs", "tools/test-online-stability.mjs", "tools/test-postponed-review-lifecycle.mjs"]) {
  execFileSync(process.execPath, [testFile], { stdio: "inherit" });
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
