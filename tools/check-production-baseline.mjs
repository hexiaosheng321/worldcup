import fs from "node:fs";
import { execFileSync } from "node:child_process";

const index = fs.readFileSync("web/index.html", "utf8");
const main = fs.readFileSync("web/app/app-main.js", "utf8");
const dataApp = fs.readFileSync("web/app/app-data.js", "utf8");
const homeApp = fs.readFileSync("web/app/app-home.js", "utf8");
const detailApp = fs.readFileSync("web/app/app-detail.js", "utf8");
const panels = fs.readFileSync("web/app/app-panels.js", "utf8");
const statsCore = fs.readFileSync("web/app/app-core.js", "utf8");
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
const r18CohortBackfill = fs.readFileSync("tools/backfill-r18-validation-cohorts.mjs", "utf8");
const i18n = fs.readFileSync("web/app/app-i18n.js", "utf8");
const baseStyles = fs.readFileSync("web/styles-base.css", "utf8");
const reviewEngine = fs.readFileSync("web/lib/reviewEngine.js", "utf8");
const similarCaseEngine = fs.readFileSync("web/lib/similarCaseEngine.js", "utf8");
const r15Backtest = fs.readFileSync("web/lib/r15Backtest.js", "utf8");
const firecrawlContext = fs.readFileSync("web/data/firecrawlObjectiveContext.js", "utf8");
const spCompactionMigration = fs.readFileSync("migrations/0006_compact_existing_sp_snapshots.sql", "utf8");
const canonicalIdMigration = fs.readFileSync("migrations/0007_restore_20260718_canonical_match_ids.sql", "utf8");
const r16ReviewMigration = fs.readFileSync("migrations/0008_r16_review_learning_states.sql", "utf8");
const r16CohortMigration = fs.readFileSync("migrations/0009_r16_validation_cohorts.sql", "utf8");
const completeInferenceCaseMigration = fs.readFileSync("migrations/0010_complete_inference_case_roles.sql", "utf8");
const r18ParallelMigration = fs.readFileSync("migrations/0011_r18_parallel_model_runs.sql", "utf8");
const wdlCalibrationArtifact = JSON.parse(fs.readFileSync("tools/data/wdl-calibration-r17.json", "utf8"));
const wdlR18Artifact = JSON.parse(fs.readFileSync("tools/data/wdl-residual-r18.json", "utf8"));
const wdlR18Residual = fs.readFileSync("tools/lib/wdl-residual-challenger.mjs", "utf8");
const wdlTrainingManifest = JSON.parse(fs.readFileSync("web/data/wdl-calibration-training-r17.json", "utf8"));

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
if (detailApp.includes("完整推演总览")) {
  throw new Error("Production baseline rejects the duplicated full-projection summary above the lock action.");
}
for (const marker of ["function failureModeText", "independentRiskScenario", "历史锁版未记录这一层风险依据", "无法根据赛后结果反向补写", "failure-risk=20260722_v1"]) {
  if (!panels.includes(marker) && !index.includes(marker)) throw new Error(`Production baseline missing failure-risk compatibility marker: ${marker}`);
}
for (const marker of ["const failureRiskText", "failureMode: failureRiskText", "body.sportteryPrediction = hydratedPrediction"]) {
  if (!api.includes(marker) && !unifiedPublisher.includes(marker)) throw new Error(`Production baseline missing unified PRE/FINAL failure-risk hydration: ${marker}`);
}
if (!index.includes("20260722_failure_risk_compat_v1")) {
  throw new Error("Production baseline requires the failure-risk compatibility build marker.");
}
for (const marker of ["内部正式 Case Base 诊断", "影子观察只作诊断，不计正式命中率", "外部历史样本不进入正式命中率分母", "VOID/未验票及影子观察不计正式分母", "threshold: 65"]) {
  if (!detailApp.includes(marker)) throw new Error(`Production baseline missing Case Base boundary marker: ${marker}`);
}
if (!index.includes("case-base-boundaries=20260722_v2")) {
  throw new Error("Production baseline requires the Case Base boundary cache namespace.");
}
for (const marker of ["sameLeagueSettledCount", "championFormalCount", "formalEvaluatedCount", "voidExcludedCount", "shadowObservationCount", "qualityEligibleCount", "featureComparableCount", "thresholdMatchedCount"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing similar-case diagnostic stage: ${marker}`);
}
if (api.includes('addPart(parts, "league"') || similarCaseEngine.includes('add("league"')) {
  throw new Error("Production baseline requires league to remain a hard filter rather than a repeated similarity weight.");
}
if (unifiedPublisher.includes("完整盘口样本") || !unifiedPublisher.includes("同联赛历史背景样本")) {
  throw new Error("Production baseline requires historical-background wording to stay distinct from formal Case Base counts.");
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
if (!index.includes('href="#sporttery" data-sporttery-pool>进入完整赛程 →</a>') || /data-home-enter[^>]*>进入完整赛程 →/.test(index)) {
  throw new Error("Production baseline requires the homepage full-schedule link to open the sporttery pool before and after scripts initialize.");
}
for (const marker of ["function orderedSportteryPoolGroups", 'view !== "finished"', "String(rightDate || \"\").localeCompare(String(leftDate || \"\"))", "sporttery-order=20260723_finished_desc_v1"]) {
  if (!homeApp.includes(marker) && !index.includes(marker)) {
    throw new Error(`Production baseline missing newest-first finished-pool ordering: ${marker}`);
  }
}
const topNavStart = index.indexOf('<nav aria-label="总站模块">');
const topNavEnd = index.indexOf("</nav>", topNavStart);
const topNav = topNavStart >= 0 && topNavEnd > topNavStart ? index.slice(topNavStart, topNavEnd) : "";
const expectedTopNav = [
  "data-site-home>首页",
  "data-sporttery-pool>赛事池",
  "data-odds-map>盘口图谱",
  "data-site-locks>赛事锁版",
  "data-model-stats>统计和回测研究",
  "data-model-intro>模型介绍",
  "data-about-site>关于本站",
];
let topNavCursor = -1;
for (const marker of expectedTopNav) {
  const position = topNav.indexOf(marker, topNavCursor + 1);
  if (position < 0) throw new Error(`Production baseline missing or misordered top navigation item: ${marker}`);
  topNavCursor = position;
}
if (topNav.includes("data-home-enter") || topNav.includes(">世界杯<")) {
  throw new Error("Production baseline rejects the redundant World Cup entry in the top navigation.");
}
if ((index.match(/data-home-enter/g) || []).length !== 1 || !index.includes("data-home-enter>回顾2026世界杯专题</button>")) {
  throw new Error("Production baseline requires one homepage-only 2026 World Cup review entry.");
}
if (!index.includes("20260722_worldcup_review_nav_v1") || !index.includes("worldcup-review-nav=20260722_v1")) {
  throw new Error("Production baseline requires the World Cup review navigation cache namespace.");
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
for (const marker of ["market_unavailable_r1", "未开售", "marketAvailability"]) {
  if (!index.includes(marker) && !detailApp.includes(marker) && !main.includes(marker)) throw new Error(`Production baseline missing unavailable-market presentation: ${marker}`);
}
for (const marker of [
  "20260718_market_closed_review_v1",
  "function reviewMarketCell",
  'return `<span class="market-closed">不开盘</span>`',
  "const directionVerifiedRows = rows.filter((row) => row.directionHit !== null)",
  "actualDirection && marketAvailability.winDrawLose ? pred.pick === actualDirection : null",
]) {
  if (!index.includes(marker) && !panels.includes(marker)) throw new Error(`Production baseline missing closed-market backtest guard: ${marker}`);
}
if (!styles.includes(".market-closed")) {
  throw new Error("Production baseline requires a neutral closed-market status treatment.");
}
for (const marker of ["evaluationOutcome", "inferenceDate", "summarizeDaily", "candidateSelections", "candidateMetrics", 'pred.lockedAt || pred.generatedAt', 'hitCount > 0 ? "PARTIAL" : "MISS"', "rate: verifiedMatches.length ? hits / verifiedMatches.length : null"]) {
  if (!r15Backtest.includes(marker)) throw new Error(`Production baseline missing R15 daily review aggregation: ${marker}`);
}
for (const marker of ["20260722_r16_forward_30_v1", "active-r11=20260724_r11_baseline_v1", "data-r15-daily-review-open", "openR15DailyReviewModal", "r15-daily-review-modal", "r15-row-released", "同一赛事只计一次", "等待首场R11记录"]) {
  if (!index.includes(marker) && !panels.includes(marker) && !main.includes(marker)) throw new Error(`Production baseline missing R16 forward review window: ${marker}`);
}
if (!["推演日 = lockedAt 北京时间", "每日2串1推荐 / 复盘", "后台R11逐场账本"].some((marker) => index.includes(marker) || panels.includes(marker) || main.includes(marker))) {
  throw new Error("Production baseline missing the active R11 daily review entry point.");
}
for (const marker of ["r16-score-leaf=20260722_r16_non_score_lock_v1", "r16-forward=20260722_r16_forward_30_v1"]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing R16 frontend cache namespace: ${marker}`);
}
for (const marker of [".r15-daily-review-launch", ".r15-daily-overview", ".r15-daily-match-list", ".r15-backtest-table tbody tr.r15-row-released", ".r15-release-flag"]) {
  if (!styles.includes(marker)) throw new Error(`Production baseline missing R15 daily review styling: ${marker}`);
}
for (const marker of ["const releasedRows = rows.filter(({ evaluation }) => evaluation.hasFormal)", "正式放行审计账本", "尚未读取到正式放行记录", "正式放行 · ${status}"]) {
  if (!panels.includes(marker)) throw new Error(`Production baseline missing formal-release-only R15 ledger marker: ${marker}`);
}
for (const marker of [".r15-market-result.released", ".r15-market-result.released.grade-a"]) {
  if (!styles.includes(marker)) throw new Error(`Production baseline missing released-market emphasis: ${marker}`);
}
for (const marker of ["function statsAuditKickoffMeta", "function compareStatsAuditKickoff", "const dateCompare = left.date.localeCompare(right.date)", "const orderedVisibleRows = visibleRows.slice().sort(compareStatsAuditKickoff)", "比赛日期 / 开赛", "最早比赛在上 · 最新比赛在下", "当日按开赛时间排序"]) {
  if (!panels.includes(marker)) throw new Error(`Production baseline missing chronological stats ledger ordering: ${marker}`);
}
for (const marker of ["20260722_stats_refresh_toolbar_v1", "stats-refresh=20260722_v1"]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing stats refresh cache marker: ${marker}`);
}
for (const marker of ["function cloudPredictionFieldIsBlank", "function mergeCloudPredictionSnapshot", "mergeCloudPredictionSnapshot(old, item)"]) {
  if (!statsCore.includes(marker)) throw new Error(`Production baseline missing non-destructive prediction refresh merge: ${marker}`);
}
if (!dataApp.includes('scope: refreshScope') || !dataApp.includes('currentRouteNeedsFullCloudBootstrap()')) {
  throw new Error("Production baseline requires route-aware full statistics refresh scope.");
}
for (const marker of ["global-stats-toolbar-actions", "global-stats-toolbar-filter", "data-global-stats-league", "data-global-stats-date"]) {
  if (!panels.includes(marker) && !styles.includes(marker)) throw new Error(`Production baseline missing integrated stats toolbar filter: ${marker}`);
}
if (index.includes('id="global-stats-league-filter"') || main.includes('querySelector("#global-stats-league-filter")')) {
  throw new Error("Production baseline rejects the separate global statistics filter banner.");
}
for (const marker of ["height: clamp(620px, calc(100dvh - 170px), 980px)", "height: clamp(520px, calc(100dvh - 150px), 780px)"]) {
  if (!styles.includes(marker)) throw new Error(`Production baseline missing expanded statistics table viewport: ${marker}`);
}
for (const marker of [".stats-kickoff-cell", ".global-stats-sort-note"]) {
  if (!styles.includes(marker)) throw new Error(`Production baseline missing stats kickoff hierarchy styling: ${marker}`);
}
const globalStatsLedgerBlock = panels.slice(panels.indexOf("const tableRows = orderedVisibleRows"), panels.indexOf("function openGlobalStatsModal"));
if (globalStatsLedgerBlock.includes("<th>玩法</th>") || globalStatsLedgerBlock.includes("<td>${dash(playType)}</td>")) {
  throw new Error("Production baseline rejects the redundant play-type column in the global stats ledger.");
}
if (globalStatsLedgerBlock.includes("<th>版本</th>") || globalStatsLedgerBlock.includes("<td><span class=\"version-badge\">${predictionModelVersion(pred)}</span></td>")) {
  throw new Error("Production baseline rejects the redundant version column in the global stats ledger.");
}
if (!baseStyles.includes("body.home-mode .home-topbar") || !baseStyles.includes("overflow: visible")) {
  throw new Error("Production baseline must keep the language menu outside the header clipping box");
}
for (const marker of ["mobile-stats-strip=20260722_v1", ".global-stats-cards .review-summary-grid", "scroll-snap-type: x proximity", "grid-template-rows: repeat(3, 88px)", "grid-auto-columns: clamp(132px, 42vw, 156px)"]) {
  if (!index.includes(marker) && !styles.includes(marker) && !fs.readFileSync("web/styles-effects.css", "utf8").includes(marker)) {
    throw new Error(`Production baseline missing compact mobile stats strip: ${marker}`);
  }
}
for (const marker of ["Mobile reading system", "font-size: 15px", "min-height: 44px", "@media (max-width: 640px)"]) {
  if (!baseStyles.includes(marker)) throw new Error(`Production baseline missing mobile readability marker: ${marker}`);
}
for (const marker of ["activeRoots", "requestAnimationFrame", "loadDictionary", "ticai:localechange"]) {
  if (!i18n.includes(marker)) throw new Error(`Production baseline missing safe i18n runtime marker: ${marker}`);
}
for (const localeFile of ["web/i18n/en.json", "web/i18n/ja.json"]) {
  const locale = fs.readFileSync(localeFile, "utf8");
  for (const marker of ["A级方向命中率", "B级方向命中率", "C级方向命中率", "D级方向命中率", "暂无验证样本", "延期追踪", "无效样本", "赛事锁版", "回顾2026世界杯专题"]) {
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

if (!fs.readFileSync("web/app/app-core.js", "utf8").includes('CLOUD_BOOTSTRAP_CACHE_KEY = "wc_cloud_bootstrap_scoped_r11_v4"')) {
  throw new Error("Production baseline requires the scoped R11 bootstrap-cache namespace.");
}
const appData = fs.readFileSync("web/app/app-data.js", "utf8");
for (const marker of ['scope: scope === "full" ? "full" : "initial"', 'requiredScope === "full" && payload.scope !== "full"', "writeCloudBootstrapCache(payload, requestedScope)"]) {
  if (!appData.includes(marker)) throw new Error(`Production baseline requires scope-safe stats bootstrap caching: ${marker}`);
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
]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing postponed lifecycle cache namespace: ${marker}`);
}
for (const marker of ["sportteryReviewLifecycle", "POSTPONED", "RESCHEDULED", "无效样本"]) {
  if (!appCore.includes(marker) && !panels.includes(marker)) throw new Error(`Production baseline missing postponed review lifecycle marker: ${marker}`);
}
for (const marker of [
  "20260718_postponed_schedule_retention_v1",
  "app/app-core.js?v=20260718_postponed_schedule_retention_v1",
  "app/app-home.js?v=20260718_postponed_schedule_retention_v1",
]) {
  if (!index.includes(marker)) throw new Error(`Production baseline missing postponed schedule retention cache namespace: ${marker}`);
}
if (!index.includes("app/app-panels.js?v=")) {
  throw new Error("Production baseline missing the app-panels cache namespace.");
}
for (const marker of ["sportteryPoolShouldHide", "sportteryPostponedLockExpired", "POSTPONED_LOCK_RETENTION_DAYS", "activeSportteryPredictions", "hiddenByExceptionalStatus", "!item.hiddenByExceptionalStatus"]) {
  if (!appCore.includes(marker) && !homeApp.includes(marker)) throw new Error(`Production baseline missing postponed pool visibility marker: ${marker}`);
}
for (const marker of ["sportteryPostponedLockExpired(item || pred, pred)", "POSTPONED", "RESCHEDULED"]) {
  if (!panels.includes(marker) && !appCore.includes(marker)) throw new Error(`Production baseline missing expired postponed-lock marker: ${marker}`);
}
for (const marker of ["liveFallbackPersistedStatus", "persistLiveFixtureStatus", "statusObservedAt", "UPDATE locked_predictions", "EXPIRED_POSTPONED", "datetime(kickoff_time) <= datetime(?, '-7 days')", "matches.status IN ('POSTPONED', 'CANCELLED', 'ABANDONED', 'SUSPENDED')"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing persistent exceptional-fixture status marker: ${marker}`);
}
if (!fs.readFileSync("web/robots.txt", "utf8").includes("https://ticai-model.com/api/sitemap.xml")) {
  throw new Error("Production baseline requires the canonical sporttery sitemap in robots.txt.");
}
if (!appCore.includes("return handicapLineFromPrediction(pred) || handicapLine(pred?.no)")) {
  throw new Error("Production baseline requires the locked prediction handicap before any number-only fallback.");
}
if (!appCore.includes("const resolvedHandicapCandidate = originalHandicap || primaryHandicap") || !appCore.includes('handicapAvailable ? resolvedHandicapCandidate : "未开售"')) {
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
  "LESSONS_2026-07-16_FULL_JOINT_GRID_R11",
  "HHAD_ONLY",
  "marketAvailability",
  "FULL_JOINT_GRID_ONLY_NO_OFFICIAL_SCORE_REFEED",
  "componentFoundationEligible",
  "SHARED_FOUNDATION_WITH_MARKET_SCOPED_CRITICAL_GATES",
  "R11_BASELINE_FORMAL_ADMISSION",
  "overallGrade",
  "overallGradeAudit",
  "SHARED_FOUNDATION_THEN_WDL_HANDICAP_TOTALS_SCORE_LEAF_EXCLUDED",
  "sharedPackageGapFree",
  "criticalPackageGapFree",
  "SHARED_GAPS_FORCE_PACKAGE_D_MARKET_GAPS_BLOCK_ONLY_AFFECTED_MARKETS",
  "outputConsistencyScore",
  "qualifyingVenueSamplesComplete",
  "outputConsistencyComplete",
  "oneGoalWinProtected",
  "FULL_JOINT_TOTAL_MARGINAL_TOP_TWO",
  "FORMAL_DIRECTION_SCORE_COMPATIBLE_PAIR",
  "DIRECTION_CONDITIONAL_CHALLENGER_SHADOW",
  "LEAGUE_LEARNING_PROFILES",
  "R11_BASELINE",
  "TERMINAL_EXACT_SCORE_OUTPUT_ONLY",
  "TERMINAL_SCORE_LEAF_NO_UPSTREAM_GATE_OR_PACKAGE_EFFECT",
  "predictiveConfidence",
  "confidenceComponents",
  "scoreCoverageOptimized",
  "riskScenarioAvailable",
  "riskPathRisk",
  "TOP_TWO_APPROVED_LEAGUE_SEASON_JOINT_PROBABILITY",
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
for (const marker of ["PRE_LOCK", "conditionalHandicapChallenger", "complete unified prediction package", "must publish its", "candidateSelections", "formalSelections", "blocked market leaked into formal markets", "unavailable market leaked into formal markets"]) {
  if (!unifiedPublisher.includes(marker)) throw new Error(`Production baseline missing PRE_LOCK shadow publishing contract: ${marker}`);
}
for (const marker of ["replaySamples", "replaySampleCount", "const pairedInput = { ...modelInput, samples: replaySamples }", "input: pairedInput", "MODEL_GOVERNANCE_ADMIN_TOKEN", "model-governance/approved", "governanceNoteIds", "learningGovernance: governance.learningGovernance", "r16Validation: governance.r16Validation"]) {
  if (!unifiedRunner.includes(marker)) throw new Error(`Production baseline missing replayable model-run input contract: ${marker}`);
}
if (unifiedRunner.includes("governanceSnapshotPath") || unifiedRunner.includes('args.get("governance")')) {
  throw new Error("Production baseline rejects arbitrary local governance snapshots in the Champion runner.");
}
for (const marker of ["!run.finalDecision?.totalGoalsPick", "exact-score leaf must be an array", "比分叶子当前不可用"]) {
  if (!unifiedPublisher.includes(marker)) throw new Error(`Production baseline missing R16 score-leaf publishing isolation: ${marker}`);
}
for (const marker of ["betOutcome", "modelAudit", "SHADOW_AUDIT", "SHADOW_OBSERVATION", "REVIEW_LEARNING_STATUSES", "reviewLearningTransitionAudit", "SINGLE_PRIMARY_MODULE_REQUIRED", "MANUAL_REVIEW_APPROVAL_REQUIRED", "challengerPromotion", "四组件全部命中"]) {
  if (!api.includes(marker) && !reviewEngine.includes(marker)) throw new Error(`Production baseline missing self-learning review marker: ${marker}`);
}
for (const marker of ["MODEL_GOVERNANCE_ADMIN_TOKEN", "modelGovernanceAuthorization", "model-validation-cohorts", "model-validation-samples", "evaluateStoredValidationCohort", "validationCohortMetrics", "targetProbabilityDistribution", "SERVER_DERIVED_VALIDATION_REQUIRED", "D1_PROMOTED_SERVER_VALIDATED_ONLY", "model-governance/approved"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing R16 server-governance contract: ${marker}`);
}
for (const marker of ["model_validation_cohorts", "model_validation_samples", "champion_revision", "challenger_revision", "input_hash"]) {
  if (!r16CohortMigration.includes(marker)) throw new Error(`Production baseline missing R16 fixed-cohort migration marker: ${marker}`);
}
for (const marker of ["SHADOW_PENDING", "PROPOSED", "OBSERVATION"]) {
  if (!r16ReviewMigration.includes(marker)) throw new Error(`Production baseline missing R16 review-state migration marker: ${marker}`);
}
for (const marker of ["nonScorePredictionAvailable", "isR16Prediction", "pred.lockId"] ) {
  if (!r15Backtest.includes(marker) && !fs.readFileSync("web/app/app-core.js", "utf8").includes(marker)) throw new Error(`Production baseline missing R16 non-score UI isolation: ${marker}`);
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
for (const marker of ["every inference lock must link to its immutable model run", "linked model run did not pass the complete ten-step FINAL_LOCK contract", "independent handicap probabilities", "independent handicap probability leader", "independent score probabilities", "independent total-goals probabilities", "jointly compatible direction and handicap pair", "complete non-market fundamentals"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing mandatory FINAL_LOCK gate: ${marker}`);
}
for (const marker of ["model_run_id", "case_role", "CHAMPION_FORMAL", "SHADOW_OBSERVATION", "preferred_at_settlement"]) {
  if (!completeInferenceCaseMigration.includes(marker) || !api.includes(marker)) throw new Error(`Production baseline missing complete inference persistence marker: ${marker}`);
}
for (const marker of ["every model run must preserve the complete UNIFIED_PREDICTION_V4 ten-step pre-match snapshot", "pagination", "beforeId", "every inference lock must link to its immutable model run"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing complete inference history API marker: ${marker}`);
}
for (const marker of ['args.get("dry-run")', 'args.get("publish-run") || "true"']) {
  if (!unifiedRunner.includes(marker)) throw new Error(`Production baseline requires D1 recording by default for unified inference: ${marker}`);
}
if (
  wdlTrainingManifest.contractVersion !== "WDL_LOCKED_TRAINING_MANIFEST_V3"
  || wdlTrainingManifest.auditedRecords < 188
  || wdlTrainingManifest.records?.length !== wdlTrainingManifest.auditedRecords
  || wdlCalibrationArtifact.trainingSource?.auditedRecords !== wdlTrainingManifest.auditedRecords
  || wdlCalibrationArtifact.trainingSource?.eligibleSamples !== wdlTrainingManifest.eligibleSamples
) {
  throw new Error("Production baseline requires a complete, versioned WDL audit manifest aligned with the calibration artifact.");
}
if (wdlCalibrationArtifact.status !== "CHALLENGER" || wdlCalibrationArtifact.promotionDecision !== "NOT_PROMOTED" || Object.values(wdlCalibrationArtifact.leagueProfiles || {}).some((profile) => profile.enabled === true)) {
  throw new Error("Production baseline requires R17 to remain a non-promoted Challenger with every Champion application gate disabled.");
}
if (wdlR18Artifact.status !== "CHALLENGER" || wdlR18Artifact.automaticPromotion !== false || wdlR18Artifact.championRevision !== "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16") {
  throw new Error("Production baseline requires R18 to remain a forward-validation-only Challenger paired against stable R16.");
}
for (const marker of ["WDL_R18_MARKET_RESIDUAL_SELECTOR_V1", "minimumPatternSupport", "minimumModelEdge", "rollingWdlResidualBacktest", "EXPANDING_WINDOW_OUT_OF_SAMPLE_THEN_30_TO_50_FORWARD_SAME_INPUT_PAIRS"]) {
  if (!wdlR18Residual.includes(marker) && !JSON.stringify(wdlR18Artifact).includes(marker)) throw new Error(`Production baseline missing R18 residual-learning guardrail: ${marker}`);
}
for (const marker of ["run_role", "comparison_group_id", "idx_model_runs_comparison_group"]) {
  if (!r18ParallelMigration.includes(marker) || !api.includes(marker)) throw new Error(`Production baseline missing R16/R18 paired-run persistence marker: ${marker}`);
}
for (const marker of ["buildR18Challenger", 'publishModelRun(result, "CHAMPION")', 'publishModelRun(r18Challenger, "CHALLENGER")', "r18ChallengerRunId"]) {
  if (!unifiedRunner.includes(marker)) throw new Error(`Production baseline missing R16/R18 same-input parallel runner marker: ${marker}`);
}
for (const marker of ["registerR18ValidationPair", "model-validation-cohorts", "model-validation-samples", "r18ValidationRegistration", "SKIPPED_NO_GOVERNANCE_TOKEN"]) {
  if (!unifiedRunner.includes(marker)) throw new Error(`Production baseline missing automatic R18 validation registration marker: ${marker}`);
}
for (const marker of ["comparison_group_id", "model-validation-cohorts", "model-validation-samples", "alreadyRegistered"]) {
  if (!r18CohortBackfill.includes(marker)) throw new Error(`Production baseline missing historical R18 cohort backfill marker: ${marker}`);
}
for (const marker of ["validation cohort id already exists with a different contract", "registered: false", "registered: true"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing idempotent R18 validation collection marker: ${marker}`);
}
for (const marker of ["CHALLENGER model runs are shadow-only and cannot publish inference locks", "paired validation runs must share one comparison group", "shadowEvaluationMarkets", "validationEligible"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline missing R18 publication isolation marker: ${marker}`);
}
for (const marker of ["R11_BASELINE_FORMAL_ADMISSION", "marketConflictResolvedForFormal", "R11_BASELINE_ACTIVE"]) {
  if (!unifiedEngine.includes(marker)) throw new Error(`Production baseline missing active R11 baseline marker: ${marker}`);
}
for (const marker of ["enrichPredictionFromUnifiedRun", "const hydratedPrediction = enrichPredictionFromUnifiedRun", "body.sportteryPrediction = hydratedPrediction"]) {
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
  "settledCaseRole",
  "该赛前推演完整进入影子案例库",
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
for (const marker of ["parseFiveHundredKickoffs", 'data-matchtime', 'data-buyendtime', 'data-homesxname', 'data-awaysxname', 'match.home === match.away', "byFixture", "payload.fiveHundredFixtureId", "duplicateMatchIds", '500-jczq-matchtime', 'existing-reliable-schedule']) {
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
  'fiveHundred ? "500-jczq-matchtime" : "pending-verified-schedule"',
  "fiveHundredByOrderId",
  "sourceMatchId",
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
if (!sync.includes('postApi("/api/sync/okooo-live")') || sync.includes("fetchSportteryJson(calculatorUrl)")) {
  throw new Error("Production baseline requires the reachable sync runner to use OKOOO odds with 500.com schedule correction, without official schedule/odds dependency.");
}
for (const marker of ["syncHealthDecision", "retryableStatuses", "payload?.ok !== false", 'health.level === "DEGRADED"', "process.exitCode = health.exitCode"]) {
  if (!sync.includes(marker)) throw new Error(`Production baseline requires retry/degraded-success sync policy: ${marker}`);
}
for (const marker of ["persistOkoooMatchesToD1", "db.batch", "opening-plus-changes-plus-30m-heartbeat", "maxSnapshotsPerMatch = 128", "newest_rank <= 24 OR s.opening_rank = 1", "existing-d1-match-identity", "protectedDuplicatesSkipped"]) {
  if (!api.includes(marker)) throw new Error(`Production baseline requires bounded batched SP history: ${marker}`);
}
for (const marker of ["LAG(odds_key)", "first_rank <> 1", "last_rank <> 1", "hourly_rank <> 1", "odds_key IS previous_key"]) {
  if (!spCompactionMigration.includes(marker)) throw new Error(`Production baseline requires classification-safe legacy SP compaction: ${marker}`);
}
for (const marker of ["sporttery-2040546", "sporttery-2040559", "restored-existing-d1-canonical", "UPDATE odds_snapshots", "UPDATE matches"]) {
  if (!canonicalIdMigration.includes(marker)) throw new Error(`Production baseline requires the July 18 canonical match-id restoration: ${marker}`);
}
for (const marker of ["odds sync completed with non-critical failures", "okooo-primary-500-schedule-multi-source-results"]) {
  if (!syncWorker.includes(marker)) throw new Error(`Production baseline requires OKOOO-first odds sync isolation: ${marker}`);
}
for (const forbidden of ['postPagesApi(env, "/api/sync/sporttery")', 'postPagesApi(env, "/api/sync/sporttery-cache"', 'postPagesApi(env, "/api/sync/sporttery-results', "falling back to local sporttery sync"]) {
  if (syncWorker.includes(forbidden)) throw new Error(`Production baseline rejects unstable official odds fallback in the 5-minute worker: ${forbidden}`);
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

for (const testFile of ["tools/test-competition-normalization.mjs", "tools/test-case-base-boundaries.mjs", "tools/test-unified-prediction-engine.mjs", "tools/test-wdl-calibrator.mjs", "tools/test-live-score-targets.mjs", "tools/test-online-stability.mjs", "tools/test-postponed-review-lifecycle.mjs", "tools/test-prediction-refresh-merge.mjs"]) {
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
