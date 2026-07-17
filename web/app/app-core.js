// app-core.js — 全局状态、纯工具函数
window.WC_DATA = window.WC_DATA || {
  updatedAt: "",
  currentModelVersion: "V4",
  timezone: "Asia/Shanghai",
  currentDate: "",
  tournamentTotalMatches: 104,
  ticaiDateOffsetDays: 1,
  historicalDrawRates: [],
  historicalScoreFrequencies: [],
  matches: [],
  predictions: [],
};
const data = window.WC_DATA;
let matches = mergeWorldCupSportteryMatches(data.matches || [], window.LIVE_SPORTTERY_ODDS?.matches || []);
data.matches = matches;
const predictionMap = new Map((data.predictions || []).map((item) => [item.no, item]));
const SPORTTERY_CLOUD_API_URL = "";
const SPORTTERY_API_URL = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";
const SPORTTERY_RESULTS_API_URL =
  "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1";
const SPORTTERY_FIXED_BONUS_API_URL =
  "https://webapi.sporttery.cn/gateway/uniform/football/getFixedBonusV1.qry";
const CLOUD_BOOTSTRAP_CACHE_KEY = "wc_cloud_bootstrap_initial_v3";
const SPORTTERY_RESULT_PENDING_WINDOW_MINUTES = 135;
const STATIC_SNAPSHOT_FALLBACKS = [
  "./live-sporttery-data.js?v=13task-20260705-2025",
  "./live-sporttery-results.js?v=13task-20260705-2025",
  "./live-sporttery-sp-history.js?v=13task-20260705-2025",
  "./live-football-scores.js",
  "./football-data-context.js",
  "./odds-data.js",
];
let oddsData = window.LIVE_SPORTTERY_ODDS?.matches?.length
  ? window.LIVE_SPORTTERY_ODDS
  : window.OKOOO_ODDS || { matches: [] };
let resultsData = window.LIVE_SPORTTERY_RESULTS?.results?.length
  ? window.LIVE_SPORTTERY_RESULTS
  : { results: [] };
let spHistoryData = window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length
  ? window.LIVE_SPORTTERY_SP_HISTORY
  : { matches: [] };
let liveFootballData = window.LIVE_FOOTBALL_SCORES?.matches?.length
  ? window.LIVE_FOOTBALL_SCORES
  : { matches: [] };
let footballDataContext = window.FOOTBALL_DATA_CONTEXT?.matches?.length
  ? window.FOOTBALL_DATA_CONTEXT
  : { matches: [], standings: [] };
let cloudBootstrapLoaded = false;
let cloudBootstrapAttempted = false;
const cloudBootstrapPending = new Map();
const sportteryLockFetchPending = new Set();
let worldCupStaticDataLoaded = Boolean(data.predictions?.length && data.matches?.length);
let worldCupStaticDataPending = null;
const dynamicScriptPromises = new Map();

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const searchInput = document.querySelector("#search");
const statusFilter = document.querySelector("#status-filter");
const resetButton = document.querySelector("#reset");
const homeEnters = document.querySelectorAll("[data-home-enter]");
const siteHome = document.querySelector("[data-site-home]");
const sportteryPoolButtons = document.querySelectorAll("[data-sporttery-pool]");
const siteLocksButtons = document.querySelectorAll("[data-site-locks]");
const modelIntroButtons = document.querySelectorAll("[data-model-intro]");
const modelStatsButtons = document.querySelectorAll("[data-model-stats]");
const oddsMapButtons = document.querySelectorAll("[data-odds-map]");
const aboutSiteButtons = document.querySelectorAll("[data-about-site]");
let modelNoticeTimer;
let activeGlobalStatsDate = "last7";
let activeGlobalStatsLeague = "all";
let activeSportteryPoolView = "open";
let activeOddsMapView = "pre";
let matchDetailReturnTarget = "path";
let sportteryDetailNavigationPending = false;
let sportteryPoolItemCache = new Map();
let homeCountdownTimer;
let matchFlowTimer;
const teamFlags = {
  瑞士: "🇨🇭",
  加拿大: "🇨🇦",
  哥伦比亚: "🇨🇴",
  刚果: "🇨🇩",
  "刚果（金）": "🇨🇩",
  波黑: "🇧🇦",
  卡塔尔: "🇶🇦",
  苏格兰: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  巴西: "🇧🇷",
  摩洛哥: "🇲🇦",
  海地: "🇭🇹",
  南非: "🇿🇦",
  韩国: "🇰🇷",
  捷克: "🇨🇿",
  墨西哥: "🇲🇽",
  库拉索: "🇨🇼",
  科特迪瓦: "🇨🇮",
  厄瓜多尔: "🇪🇨",
  德国: "🇩🇪",
  日本: "🇯🇵",
  瑞典: "🇸🇪",
  突尼斯: "🇹🇳",
  荷兰: "🇳🇱",
  美国: "🇺🇸",
  澳大利亚: "🇦🇺",
  挪威: "🇳🇴",
  巴拉圭: "🇵🇾",
  埃及: "🇪🇬",
  葡萄牙: "🇵🇹",
  乌兹别克斯坦: "🇺🇿",
  英格兰: "🏴",
  加纳: "🇬🇭",
  巴拿马: "🇵🇦",
  克罗地亚: "🇭🇷",
  法国: "🇫🇷",
  阿根廷: "🇦🇷",
  西班牙: "🇪🇸",
  比利时: "🇧🇪",
  乌拉圭: "🇺🇾",
};

function showHome() {
  resetPageSeoMetadata();
  document.body.classList.add("home-mode");
  document.body.classList.remove(
    "dashboard-mode",
    "is-detail-page",
    "sporttery-detail-mode",
    "sporttery-mode",
    "site-locks-mode",
    "model-intro-mode",
    "model-stats-mode",
    "odds-map-mode",
    "about-site-mode"
  );
  document.querySelectorAll(".home-topbar nav button").forEach((button) => {
    button.classList.remove("active");
    button.removeAttribute("aria-current");
  });
  siteHome?.classList.add("active");
  siteHome?.setAttribute("aria-current", "page");
}

function showDashboard() {
  document.body.classList.add("dashboard-mode");
  document.body.classList.remove("home-mode");
  document.querySelectorAll(".home-topbar nav button").forEach((button) => {
    button.classList.remove("active");
    button.removeAttribute("aria-current");
  });
  const active =
    window.location.hash === "#sporttery" || isSportteryDetailRoute()
      ? "[data-sporttery-pool]"
      : window.location.hash === "#locks"
        ? "[data-site-locks]"
      : window.location.hash === "#model-intro"
        ? "[data-model-intro]"
        : window.location.hash === "#model-stats"
          ? "[data-model-stats]"
          : window.location.hash === "#odds-map"
            ? "[data-odds-map]"
            : window.location.hash === "#about"
              ? "[data-about-site]"
        : "[data-home-enter]";
  const activeNavButton = document.querySelector(`.home-topbar ${active}`);
  activeNavButton?.classList.add("active");
  activeNavButton?.setAttribute("aria-current", "page");
}

function parseScore(score) {
  const normalized = String(score || "").trim().replace(":", "-");
  if (!normalized || !normalized.includes("-")) return null;
  const [home, away] = normalized.split("-").map(Number);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;
  return { home, away, total: home + away };
}

function direction(score) {
  const parsed = parseScore(score);
  if (!parsed) return "";
  if (parsed.home > parsed.away) return "胜";
  if (parsed.home < parsed.away) return "负";
  return "平";
}

function scoreShape(score) {
  const parsed = parseScore(score);
  if (!parsed) return "";
  const high = Math.max(parsed.home, parsed.away);
  const low = Math.min(parsed.home, parsed.away);
  return `${high}-${low}`;
}

function scoreShapeLabel(score) {
  return score.replace("-", ":");
}

function normalizedIssueNo(value = "") {
  const found = String(value || "").match(/(\d{3})$/);
  return found ? found[1] : String(value || "");
}

function findOddsRow(rows = [], matchOrNo) {
  const match = typeof matchOrNo === "object" ? matchOrNo : null;
  const targetNo = normalizedIssueNo(match?.no || matchOrNo);
  if (!match && targetNo) {
    const byNo = rows.find(
      (item) =>
        normalizedIssueNo(item.no) === targetNo ||
        normalizedIssueNo(item.issue) === targetNo ||
        normalizedIssueNo(item.orderId) === targetNo
    );
    if (byNo) return byNo;
  }
  if (!match) return null;
  if (match.matchId) {
    const byId = rows.find((item) => String(item.matchId || "") === String(match.matchId));
    if (byId) return byId;
  }
  return (
    rows.find(
      (item) =>
        item.ticaiDate === match.date &&
        looseTeamMatch(match.home, item.home) &&
        looseTeamMatch(match.away, item.away)
    ) ||
    rows.find(
      (item) =>
        item.matchDate === match.date &&
        looseTeamMatch(match.home, item.home) &&
        looseTeamMatch(match.away, item.away)
    ) ||
    rows.find(
      (item) =>
        looseTeamMatch(match.home, item.home) &&
        looseTeamMatch(match.away, item.away)
    ) ||
    (targetNo
      ? rows.find(
          (item) =>
            (normalizedIssueNo(item.no) === targetNo ||
              normalizedIssueNo(item.issue) === targetNo ||
              normalizedIssueNo(item.orderId) === targetNo) &&
            (!match.date || [item.ticaiDate, item.matchDate, item.date].includes(match.date))
        )
      : null) ||
    null
  );
}

function oddsMatch(matchOrNo) {
  const match =
    typeof matchOrNo === "object"
      ? matchOrNo
      : matches.find((item) => normalizedIssueNo(item.no) === normalizedIssueNo(matchOrNo));
  const rows = oddsData.matches || [];
  return findOddsRow(rows, match || matchOrNo);
}

function toOdd(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function compactSportteryNo(matchNumStr = "", matchNum = "") {
  const text = String(matchNumStr || matchNum || "");
  const found = text.match(/(\d{3})$/);
  return found ? found[1] : text.slice(-3).padStart(3, "0");
}

const teamAliases = {
  民主刚果: ["刚果金", "刚果（金）", "刚果民主共和国", "DR Congo", "Congo DR"],
  "刚果（金）": ["民主刚果", "刚果金", "刚果民主共和国", "DR Congo", "Congo DR"],
  刚果金: ["民主刚果", "刚果（金）", "刚果民主共和国", "DR Congo", "Congo DR"],
  乌兹别克斯坦: ["乌兹别克", "Uzbekistan"],
  乌兹别克: ["乌兹别克斯坦", "Uzbekistan"],
  阿尔及利亚: ["阿尔及利", "Algeria"],
  阿尔及利: ["阿尔及利亚", "Algeria"],
  科特迪瓦: ["象牙海岸", "Ivory Coast", "Cote dIvoire", "Côte dIvoire"],
  佛得角: ["佛得角共和国", "Cape Verde", "Cabo Verde"],
  波黑: ["波斯尼亚", "波斯尼亚和黑塞哥维那", "Bosnia", "Bosnia Herzegovina", "Bosnia and Herzegovina", "Bosnia-Herzegovina"],
  坦山猫: ["Ilves", "Tampereen Ilves", "Ilves Tampere"],
  塞伊奈: ["SJK", "Seinajoen JK", "Seinäjoen JK", "SJK Seinajoki"],
  赫尔辛基: ["HJK", "HJK Helsinki"],
  库奥皮奥: ["KuPS", "Kuopion Palloseura"],
  玛丽港: ["Mariehamn", "IFK Mariehamn"],
  国际图尔: ["Inter Turku", "FC Inter Turku"],
  TPS图尔: ["TPS", "TPS Turku"],
  雅罗: ["Jaro", "FF Jaro"],
  赫尔火花: ["Haka", "FC Haka"],
  瓦萨: ["VPS", "Vaasa VPS"],
  AC奥卢: ["AC Oulu", "Oulu"],
  拉赫蒂: ["Lahti", "FC Lahti"],
};

function normalizeTeamName(name = "") {
  return String(name || "")
    .toLowerCase()
    .replace(/[\s·.'’\-()（）]/g, "");
}

function teamSearchNames(name = "") {
  const direct = String(name || "").trim();
  const aliases = teamAliases[direct] || [];
  const reverseAliases = Object.entries(teamAliases)
    .filter(([, values]) => values.some((item) => normalizeTeamName(item) === normalizeTeamName(direct)))
    .map(([key]) => key);
  return [...new Set([direct, ...aliases, ...reverseAliases].filter(Boolean).map(normalizeTeamName))];
}

function normalizeSportteryHandicap(goalLine = "") {
  const raw = String(goalLine || "0").trim();
  if (!raw) return "0";
  const numeric = Number(raw.replace("+", ""));
  if (Number.isNaN(numeric)) return raw;
  if (numeric > 0) return `+${numeric}`;
  return String(numeric);
}

function sportteryMarketOdds(market) {
  if (!market || !market.h) return null;
  return {
    win: toOdd(market.h),
    draw: toOdd(market.d),
    lose: toOdd(market.a),
  };
}

function sportteryScoreBucket(home, away) {
  if (home > away) return "胜";
  if (home < away) return "负";
  return "平";
}

function sportteryScoreOdds(crs = {}) {
  return Object.entries(crs)
    .flatMap(([key, value]) => {
      if (!value || key.endsWith("f")) return [];
      if (key === "s1sh") return [{ score: "胜其它", odds: toOdd(value), bucket: "胜" }];
      if (key === "s1sd") return [{ score: "平其它", odds: toOdd(value), bucket: "平" }];
      if (key === "s1sa") return [{ score: "负其它", odds: toOdd(value), bucket: "负" }];
      const found = key.match(/^s(\d{2})s(\d{2})$/);
      if (!found) return [];
      const home = Number(found[1]);
      const away = Number(found[2]);
      return [{ score: `${home}:${away}`, odds: toOdd(value), bucket: sportteryScoreBucket(home, away) }];
    })
    .sort((a, b) => Number(a.odds) - Number(b.odds))
    .slice(0, 12);
}

function sportteryTotalGoalsOdds(ttg = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = ttg[`s${index}`];
    if (!value) return null;
    return { goals: index === 7 ? "7+" : String(index), odds: toOdd(value) };
  }).filter(Boolean);
}

function sportteryLatestUpdate(match) {
  return [match.had, match.hhad, match.crs, match.ttg, match.hafu]
    .map((market) => `${market?.updateDate || ""} ${market?.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function normalizeSportteryPayload(raw, capturedAt = new Date().toISOString()) {
  const days = raw?.value?.matchInfoList || [];
  const items = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => ({
      orderId: String(match.matchNum || ""),
      issue: match.matchNumStr || "",
      no: compactSportteryNo(match.matchNumStr, match.matchNum),
      ticaiDate: day.businessDate || match.businessDate || match.matchDate || "",
      matchDate: match.matchDate || "",
      kickoffTime: String(match.matchTime || "").slice(0, 5),
      league: match.leagueAbbName || match.leagueAllName || "竞彩",
      matchId: String(match.matchId || ""),
      home: match.homeTeamAbbName || match.homeTeamAllName || "",
      away: match.awayTeamAbbName || match.awayTeamAllName || "",
      venue: match.remark || "",
      statusCode: match.matchStatus || "",
      score: "",
      handicap: normalizeSportteryHandicap(match.hhad?.goalLine),
      normal: sportteryMarketOdds(match.had),
      handicapOdds: sportteryMarketOdds(match.hhad),
      scoreOdds: sportteryScoreOdds(match.crs || {}),
      totalGoalsOdds: sportteryTotalGoalsOdds(match.ttg || {}),
      updatedAt: sportteryLatestUpdate(match),
    }))
  );
  return {
    source: "中国体育彩票官方接口",
    apiEndpoint: SPORTTERY_API_URL,
    lotterNo: days[0]?.businessDate || "",
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: raw?.value?.totalCount || items.length,
    lastUpdateTime: raw?.value?.lastUpdateTime || "",
    matchDates: days.map((day) => day.businessDate).filter(Boolean),
    matches: items,
  };
}

function normalizeSportteryHistory(match, value = {}) {
  const oddsHistory = value.oddsHistory || {};
  const updatedAt = [
    ...(oddsHistory.hadList || []),
    ...(oddsHistory.hhadList || []),
    ...(oddsHistory.ttgList || []),
    ...(oddsHistory.crsList || []),
    ...(oddsHistory.hafuList || []),
  ]
    .map((item) => `${item.updateDate || ""} ${item.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  return {
    orderId: match.orderId || "",
    issue: match.issue || "",
    no: match.no || "",
    ticaiDate: match.ticaiDate || "",
    matchDate: match.matchDate || "",
    kickoffTime: match.kickoffTime || "",
    league: match.league || "竞彩",
    matchId: match.matchId || "",
    home: match.home || "",
    away: match.away || "",
    handicap: match.handicap || "0",
    updatedAt,
    history: {
      had: oddsHistory.hadList || [],
      hhad: oddsHistory.hhadList || [],
      ttg: oddsHistory.ttgList || [],
      crs: oddsHistory.crsList || [],
      hafu: oddsHistory.hafuList || [],
    },
  };
}

function looseTeamMatch(fullName = "", sourceName = "") {
  if (!fullName || !sourceName) return false;
  const fullSet = teamSearchNames(fullName);
  const sourceSet = teamSearchNames(sourceName);
  return fullSet.some((left) => sourceSet.some((right) => left.includes(right) || right.includes(left)));
}

function matchFromOddsItem(item) {
  const targetNo = normalizedIssueNo(item.no || item.issue || item.orderId);
  if (targetNo && isWorldCupSportteryItem(item)) {
    const byNo = matches.find((match) => normalizedIssueNo(match.no) === targetNo && (match.ticaiDate === item.ticaiDate || match.matchDate === item.ticaiDate || match.date === item.ticaiDate));
    if (byNo) return byNo;
  }
  return matches.find(
    (match) =>
      match.date === item.ticaiDate &&
      looseTeamMatch(match.home, item.home) &&
      looseTeamMatch(match.away, item.away)
  );
}

function matchFromResultItem(item) {
  return matches.find(
    (match) =>
      (match.date === item.ticaiDate || match.date === item.matchDate) &&
      looseTeamMatch(match.home, item.home) &&
      looseTeamMatch(match.away, item.away)
  );
}

function normalizeResultScore(score = "") {
  const text = String(score || "").trim().replace(":", "-");
  return parseScore(text) ? text : "";
}

function isWorldCupSportteryItem(item = {}) {
  return /世界杯|world\s*cup/i.test(String(item.league || item.competition || item.tournament || ""));
}

function sportteryWorldCupMatchNo(item = {}) {
  return normalizedIssueNo(item.no || item.issue || item.orderId || item.matchCode || "");
}

function mergeWorldCupSportteryMatches(baseMatches = [], sportteryMatches = []) {
  const byNo = new Map(baseMatches.map((match) => [normalizedIssueNo(match.no), { ...match }]));
  (sportteryMatches || [])
    .filter(isWorldCupSportteryItem)
    .forEach((item) => {
      const no = sportteryWorldCupMatchNo(item);
      if (!no || !item.home || !item.away) return;
      const current = byNo.get(no);
      const next = {
        no,
        date: item.matchDate || item.ticaiDate || item.date || current?.date || "",
        group: current?.group || item.group || (Number(no) >= 73 ? "32强" : ""),
        home: current?.home || item.home,
        away: current?.away || item.away,
        score: normalizeResultScore(current?.score) || normalizeResultScore(item.score),
        issue: current?.issue || item.issue || "",
        matchId: current?.matchId || item.matchId || "",
        ticaiDate: current?.ticaiDate || item.ticaiDate || "",
        matchDate: current?.matchDate || item.matchDate || "",
        kickoffTime: current?.kickoffTime || item.kickoffTime || "",
        statusName: current?.statusName || item.statusName || "",
        source: current?.source || "sporttery-official",
      };
      byNo.set(no, next);
    });

  return [...byNo.values()].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare) return dateCompare;
    return Number(normalizedIssueNo(a.no)) - Number(normalizedIssueNo(b.no));
  });
}

function resultForSportteryItem(item) {
  const results = resultsData.results || [];
  return results.find((result) => result.matchId && item.matchId && result.matchId === item.matchId)
    || results.find(
      (result) =>
        result.issue === item.issue &&
        result.ticaiDate === item.ticaiDate &&
        looseTeamMatch(result.home, item.home) &&
        looseTeamMatch(result.away, item.away)
    )
    || results.find(
      (result) =>
        result.matchDate === item.matchDate &&
        looseTeamMatch(result.home, item.home) &&
        looseTeamMatch(result.away, item.away)
    );
}

function verifiedSportteryScore(item = {}) {
  const result = resultForSportteryItem(item);
  const itemScore = sportteryResultIsFinished(item) ? normalizeResultScore(item.score) : "";
  const resultScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  if (itemScore) return itemScore;
  if (resultScore) return resultScore;
  const usableResultScore = sportteryScoreIsUsable(result) ? normalizeResultScore(result?.score) : "";
  if (usableResultScore) return usableResultScore;
  const usableItemScore = sportteryScoreIsUsable(item) ? normalizeResultScore(item?.score) : "";
  if (usableItemScore) return usableItemScore;
  const liveScore = liveScoreForSportteryItem(item);
  return liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "";
}

function liveScoreForSportteryItem(item) {
  const rows = liveFootballData.matches || [];
  const sportteryMatchId = String(item.matchId || item.sportteryKey || item.cloudMatchId || "").replace(/^sporttery-/, "");
  const exactOkoooRow = sportteryMatchId
    ? rows.find((row) => row.source === "OKOOO-live" && String(row.externalId || "").replace(/^sporttery-/, "") === sportteryMatchId)
    : null;
  if (exactOkoooRow) return exactOkoooRow;
  return rows.find(
    (row) =>
      liveDateMatchesSportteryItem(item, row) &&
      looseTeamMatch(item.home, row.homeZh || row.home) &&
      looseTeamMatch(item.away, row.awayZh || row.away)
  ) || rows.find(
    (row) =>
      liveDateMatchesSportteryItem(item, row) &&
      looseTeamMatch(item.home, row.home) &&
      looseTeamMatch(item.away, row.away)
  );
}

function dateDistanceDays(left = "", right = "") {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return Infinity;
  return Math.abs(leftMs - rightMs) / 86400000;
}

function liveDateMatchesSportteryItem(item = {}, row = {}) {
  if (!row.date) return true;
  return [item.matchDate, item.ticaiDate, item.date]
    .filter(Boolean)
    .some((date) => dateDistanceDays(date, row.date) <= 1);
}

function footballDataContextForSportteryItem(item = {}) {
  const rows = footballDataContext.matches || [];
  const key = item.sportteryKey || sportteryItemKey(item);
  const firecrawlContext = firecrawlContextForSportteryItem(item);
  const footballContext = rows.find((row) =>
    row.sportteryKey === key ||
    row.matchId === item.matchId ||
    (normalizedIssueNo(row.issue) && normalizedIssueNo(row.issue) === normalizedIssueNo(item.issue || item.no))
  )?.context || rows.find((row) =>
    row.matchDate === item.matchDate &&
    looseTeamMatch(item.home, row.home) &&
    looseTeamMatch(item.away, row.away)
  )?.context || item.footballDataContext || {};
  if (!firecrawlContext) return footballContext;
  return {
    ...footballContext,
    firecrawl: firecrawlContext,
    source: [footballContext.source, firecrawlContext.source].filter(Boolean).join(" + ") || firecrawlContext.source,
    importedAt: firecrawlContext.importedAt || footballContext.importedAt,
    stateSummary: [footballContext.stateSummary, firecrawlContext.stateSummary].filter(Boolean).join(" "),
  };
}

function firecrawlContextForSportteryItem(item = {}) {
  const rows = window.WC_FIRECRAWL_OBJECTIVE_CONTEXT?.matches || [];
  if (!rows.length) return null;
  const key = item.sportteryKey || sportteryItemKey(item);
  const row = rows.find((entry) =>
    entry.sportteryKey === key ||
    entry.matchId === item.matchId ||
    (normalizedIssueNo(entry.issue) && normalizedIssueNo(entry.issue) === normalizedIssueNo(item.issue || item.no))
  ) || rows.find((entry) =>
    dateDistanceDays(entry.matchDate, item.matchDate || item.ticaiDate || item.date) <= 1 &&
    looseTeamMatch(item.home, entry.home) &&
    looseTeamMatch(item.away, entry.away)
  );
  if (!row) return null;
  const injuryText = [...(row.injuries || []), ...(row.suspensions || [])]
    .map((entry) => typeof entry === "string" ? entry : [entry.player, entry.reason, entry.status].filter(Boolean).join("/"))
    .filter(Boolean)
    .slice(0, 4)
    .join("；");
  const parts = [
    row.summary ? `Firecrawl客观层：${row.summary}` : "",
    row.tacticalStyle ? `战术对位：${row.tacticalStyle}` : "",
    row.schedulePressure ? `赛程压力：${row.schedulePressure}` : "",
    row.motivation ? `比赛动机：${row.motivation}` : "",
    injuryText ? `伤停停赛：${injuryText}` : "",
    row.missingFields?.length ? `仍缺：${row.missingFields.join("、")}` : "",
  ].filter(Boolean);
  return {
    source: "firecrawl-agent",
    importedAt: row.fetchedAt,
    hasState: Boolean(row.summary || row.tacticalStyle || row.schedulePressure || row.injuries?.length || row.suspensions?.length),
    stateSummary: parts.join(" "),
    sourceUrls: row.sourceUrls || [],
    payload: row,
  };
}

function exceptionalLiveStatusText(row = {}) {
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.minute || ""}`;
  const matched = status.match(/(postponed?|cancelled?|canceled?|abandoned?|suspended?|延期|推迟|取消|腰斩|中止)/i)?.[1] || "";
  if (!matched) return "";
  if (/postpon|延期|推迟/i.test(matched)) return "延期";
  if (/cancel|取消/i.test(matched)) return "取消";
  if (/abandon|腰斩/i.test(matched)) return "腰斩";
  return "中止";
}

function liveScoreIsScheduled(row = {}) {
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.rawStatus || ""}`;
  return Boolean(
    row &&
    !row.live &&
    !row.isFinished &&
    !normalizeResultScore(row.score) &&
    (row.scheduled === true || /\bscheduled\b|not\s*started|未开赛|待开赛|等待开赛|^\s*未\s*$/i.test(status))
  );
}

function liveScoreStatusText(row) {
  if (!row) return "";
  const exceptionalStatus = exceptionalLiveStatusText(row);
  if (exceptionalStatus) return exceptionalStatus;
  if (liveScoreIsScheduled(row)) return "等待开赛";
  if (row.isFinished) return "已完赛";
  if (row.minute) return `进行中 ${row.minute}`;
  if (row.statusLabel) return row.statusLabel;
  return row.live ? "进行中" : "";
}

function sportteryResultIsFinished(row = {}) {
  const status = `${row.statusCode || ""} ${row.statusName || ""} ${row.statusLabel || ""}`;
  return Boolean(normalizeResultScore(row.score)) && (/已完成|已完赛|完场|全场|开奖|finished|finish|ft\b/i.test(status) || String(row.statusCode || "") === "11");
}

function sportteryScoreIsUsable(row = {}) {
  return Boolean(normalizeResultScore(row.score)) && !/取消|延期|腰斩|推迟|cancel|postpon/i.test(`${row.statusName || ""} ${row.statusLabel || ""}`);
}

function sportteryItemKey(item = {}) {
  if (item.matchId) return `id-${item.matchId}`;
  const cloudMatchId = String(item.cloudMatchId || "").replace(/^sporttery-/, "");
  if (cloudMatchId) return `id-${cloudMatchId}`;
  return `issue-${item.issue || item.no || item.orderId || ""}-${item.ticaiDate || item.matchDate || ""}`;
}

function sportteryLookupKeys(item = {}) {
  const issue = normalizedIssueNo(item.issue || item.no || item.orderId);
  const dates = [item.ticaiDate, item.matchDate, item.date].filter(Boolean);
  const teamKey = [item.league, item.home, item.away].map((value) => String(value || "").trim()).join("__");
  const keys = [
    sportteryItemKey(item),
    item.sportteryKey,
    item.matchId ? `id-${item.matchId}` : "",
    item.cloudMatchId ? `id-${String(item.cloudMatchId).replace(/^sporttery-/, "")}` : "",
    item.matchId,
    item.cloudMatchId,
    `issue-${item.issue || item.no || item.orderId || ""}-${item.ticaiDate || item.matchDate || ""}`,
    issue ? `issue-${issue}` : "",
    ...dates.map((date) => (issue ? `issue-${issue}-${date}` : "")),
    teamKey.replace(/_/g, "") ? `teams-${teamKey}-${dates[0] || ""}` : "",
  ];
  return [...new Set(keys.map((value) => String(value || "").trim()).filter(Boolean))];
}

function sportteryLookupKeyFromHash(value = "") {
  const raw = String(value || "").replace(/^#?sporttery-match-/, "").trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function sportteryRouteKeyFromPath(pathname = window.location.pathname || "/") {
  const path = String(pathname || "");
  const match = path.match(/^\/sporttery-match\/([^/?#]+)\/?$/) || path.match(/^\/sporttery-match-([^/?#]+)\/?$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function currentSportteryRouteKey() {
  const pathKey = sportteryRouteKeyFromPath();
  if (pathKey) return sportteryLookupKeyFromHash(pathKey);
  const hashMatch = (window.location.hash || "").match(/^#sporttery-match-(.+)$/);
  return hashMatch ? sportteryLookupKeyFromHash(hashMatch[1]) : "";
}

function isSportteryDetailRoute() {
  return Boolean(currentSportteryRouteKey());
}

function canonicalSportteryMatchPath(key = "") {
  const compact = sportteryComparableId(sportteryLookupKeyFromHash(key));
  return compact ? `/sporttery-match/${encodeURIComponent(compact)}` : "/sporttery-match";
}

function normalizeLegacySportteryRoute() {
  const key = currentSportteryRouteKey();
  if (!key) return false;
  const targetPath = canonicalSportteryMatchPath(key);
  const currentPath = window.location.pathname || "/";
  if (currentPath === targetPath && !window.location.hash) return false;
  history.replaceState("", document.title, `${targetPath}${window.location.search || ""}`);
  return true;
}

function ensureSeoMeta(name) {
  let meta = document.head.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  return meta;
}

function setCanonicalPageUrl(pathname = "/") {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", `https://ticai-model.com${pathname}`);
}

function resetPageSeoMetadata() {
  document.title = "体彩足彩模型中心";
  ensureSeoMeta("description").setAttribute("content", "聚合赛程、盘口快照、赛前锁版和赛后复盘的足彩模型研究工作台。");
  setCanonicalPageUrl("/");
}

function updateSportterySeoMetadata(item = {}, pred = null) {
  const home = item.displayHome || item.home || "";
  const away = item.displayAway || item.away || "";
  const league = item.league || item.competition || "竞彩";
  const routeKey = item.matchId || item.cloudMatchId || item.sportteryKey || currentSportteryRouteKey();
  const matchLabel = home && away ? `${home} vs ${away}` : "比赛锁版详情";
  const pickText = pred?.pick || pred?.recommendationSide || "";
  document.title = `${matchLabel}赛前锁版与模型推演 | 体彩足彩模型中心`;
  ensureSeoMeta("description").setAttribute(
    "content",
    `${matchLabel}的${league}赛前锁版、盘口依据、总进球与比分推演${pickText ? `，当前锁版结论为${pickText}` : ""}。`
  );
  setCanonicalPageUrl(canonicalSportteryMatchPath(routeKey));
}

function cacheSportteryPoolItems(items = []) {
  sportteryPoolItemCache = new Map();
  items.forEach((item) => {
    sportteryLookupKeys(item).forEach((key) => {
      sportteryPoolItemCache.set(key, item);
    });
  });
}

function sportteryComparableId(value = "") {
  return String(value || "")
    .replace(/^#?sporttery-match-/, "")
    .replace(/^id-/, "")
    .replace(/^sporttery-/, "")
    .trim();
}

function sameSportteryIdentity(left = "", right = "") {
  const a = sportteryComparableId(left);
  const b = sportteryComparableId(right);
  return Boolean(a && b && a === b);
}

function findSportteryItemByKey(key = "") {
  const lookupKey = sportteryLookupKeyFromHash(key);
  const cached = sportteryPoolItemCache.get(lookupKey);
  if (cached) return cached;
  const rows = [...sportteryPoolItemCache.values(), ...(oddsData.matches || []), ...(resultsData.results || [])];
  return rows.find((item) =>
    sportteryLookupKeys(item).includes(lookupKey) ||
    sameSportteryIdentity(sportteryItemKey(item), lookupKey) ||
    sameSportteryIdentity(item.sportteryKey, lookupKey) ||
    sameSportteryIdentity(item.matchId, lookupKey) ||
    sameSportteryIdentity(item.cloudMatchId, lookupKey)
  ) || rows.find((item) => {
    const normalizedLookup = normalizedIssueNo(lookupKey);
    return Boolean(normalizedLookup && normalizedIssueNo(item.issue || item.no || item.orderId) === normalizedLookup);
  });
}

function sportteryNoDateTeamMatch(left = {}, right = {}) {
  const leftNo = normalizedIssueNo(left.no || left.issue || left.orderId || left.matchCode);
  const rightNo = normalizedIssueNo(right.no || right.issue || right.orderId || right.matchCode);
  if (!leftNo || !rightNo || leftNo !== rightNo) return false;
  const leftDates = [left.ticaiDate, left.matchDate, left.date].filter(Boolean);
  const rightDates = [right.ticaiDate, right.matchDate, right.date].filter(Boolean);
  if (leftDates.length && rightDates.length && !leftDates.some((date) => rightDates.includes(date))) return false;
  const leftIssue = String(left.issue || left.matchCode || "");
  const rightIssue = String(right.issue || right.matchCode || "");
  if (leftIssue && rightIssue && leftIssue !== rightIssue) return false;
  if (left.home && left.away && right.home && right.away) {
    return looseTeamMatch(left.home, right.home) && looseTeamMatch(left.away, right.away);
  }
  return Boolean(leftIssue && rightIssue && leftIssue === rightIssue);
}

function sportteryPredictionForItem(item = {}) {
  const key = sportteryItemKey(item);
  const linkedMatch = matchFromOddsItem(item) || matchFromResultItem(item);
  const worldCupRows = data.predictions || [];
  const sportteryRows = data.sportteryPredictions || [];
  const sportteryPred = sportteryRows.find((pred) => pred.sportteryKey && (pred.sportteryKey === key || sameSportteryIdentity(pred.sportteryKey, key)))
    || sportteryRows.find((pred) => pred.matchId && item.matchId && sameSportteryIdentity(pred.matchId, item.matchId))
    || sportteryRows.find(
      (pred) =>
        sportteryNoDateTeamMatch(item, pred)
    )
    || sportteryRows.find(
      (pred) =>
        [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date) &&
        looseTeamMatch(pred.home, item.home) &&
        looseTeamMatch(pred.away, item.away)
    );
  if (sportteryPred) return sportteryPred;
  const worldCupPred = linkedMatch
    ? latestPredictionFor(linkedMatch.no)
    : worldCupRows.find(
        (pred) =>
          pred.no &&
          item.no &&
          pred.no === item.no &&
          [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date)
      )
      || worldCupRows.find(
        (pred) =>
          [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date) &&
          looseTeamMatch(pred.home, item.home) &&
          looseTeamMatch(pred.away, item.away)
      );
  if (worldCupPred) return worldCupPred;
  return null;
}

function findSportteryItemForPrediction(pred = {}) {
  const rows = [...(oddsData.matches || []), ...(resultsData.results || [])];
  return rows.find((item) => pred.sportteryKey && (sportteryItemKey(item) === pred.sportteryKey || item.sportteryKey === pred.sportteryKey || sameSportteryIdentity(sportteryItemKey(item), pred.sportteryKey) || sameSportteryIdentity(item.sportteryKey, pred.sportteryKey)))
    || rows.find((item) => pred.matchId && item.matchId && sameSportteryIdentity(pred.matchId, item.matchId))
    || rows.find(
      (item) =>
        sportteryNoDateTeamMatch(item, pred)
    )
    || rows.find(
      (item) =>
        [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date) &&
        looseTeamMatch(pred.home, item.home) &&
        looseTeamMatch(pred.away, item.away)
    );
}

function worldCupMatchForSportteryPrediction(pred = {}, item = null) {
  const linked = item ? matchFromOddsItem(item) || matchFromResultItem(item) : null;
  if (linked) return linked;
  return matches.find(
    (match) =>
      pred.no &&
      match.no &&
      normalizedIssueNo(pred.no) === normalizedIssueNo(match.no) &&
      [pred.date, pred.matchDate].filter(Boolean).includes(match.date)
  )
    || matches.find(
      (match) =>
        [pred.date, pred.matchDate].filter(Boolean).includes(match.date) &&
        looseTeamMatch(match.home, pred.home) &&
        looseTeamMatch(match.away, pred.away)
    )
    || null;
}

function hasOfficialWorldCupLock(pred = {}, item = null) {
  const linkedMatch = worldCupMatchForSportteryPrediction(pred, item);
  return Boolean(linkedMatch && latestPredictionFor(linkedMatch.no));
}

function mergeCloudAutoPredictions(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const current = data.sportteryPredictions || [];
  const keyFor = (item) => item.sportteryKey || (item.matchId ? `id-${item.matchId}` : `${item.no || ""}-${item.date || item.matchDate || ""}`);
  const byKey = new Map(current.map((item) => [keyFor(item), item]));
  let changed = false;
  rows.forEach((item) => {
    const nextLockType = item.lockType || item.lock_type || "";
    const nextManual = !item.autoGenerated && ["FINAL_LOCK", "PRE_LOCK"].includes(nextLockType);
    if (!nextManual && hasOfficialWorldCupLock(item, findSportteryItemForPrediction(item))) return;
    const key = item.sportteryKey || (item.matchId ? `id-${item.matchId}` : `${item.no || ""}-${item.date || item.matchDate || ""}`);
    if (!key) return;
    const old = byKey.get(key);
    if (!old) {
      byKey.set(key, item);
      changed = true;
      return;
    }
    const oldAuto = old.autoGenerated || old.lockId;
    const oldTime = Date.parse(old.lockedAt || old.generatedAt || "");
    const nextTime = Date.parse(item.lockedAt || item.generatedAt || "");
    const nextIsNewer = Number.isFinite(nextTime) && (!Number.isFinite(oldTime) || nextTime >= oldTime);
    if ((nextManual && nextIsNewer) || (oldAuto && nextIsNewer)) {
      byKey.set(key, { ...old, ...item });
      changed = true;
    }
  });
  if (!changed) return false;
  data.sportteryPredictions = [...byKey.values()];
  runtimeCaseBaseCache = null;
  return true;
}

function scorePairFromPick(value = "") {
  const parts = String(value || "")
    .split(/\s*[/、,，]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [parts[0] || "", parts[1] || ""];
}

function unifiedStepsForPrediction(pred = {}) {
  return pred.unifiedSteps || pred.analysis?.unifiedSteps || pred.payload?.unifiedSteps || [];
}

function rawUnifiedStepText(pred = {}, stepNo = 0) {
  const rows = unifiedStepsForPrediction(pred);
  const padded = String(stepNo).padStart(2, "0");
  const row = rows.find((item) => {
    const text = String(item || "").trim();
    return text.startsWith(`${stepNo} `) || text.startsWith(`${stepNo}.`) || text.startsWith(`${stepNo}、`) || text.startsWith(`${padded} `);
  });
  return row ? String(row).replace(/^\d+\s*[.、]?\s*/, "") : "";
}

function unifiedStepText(pred = {}, stepNo = 0) {
  const text = rawUnifiedStepText(pred, stepNo);
  if (stepNo === 1 && /概率底盘|胜平负赔率|胜平负 SP/i.test(text)) {
    return probabilityBaselineText(pred);
  }
  if (stepNo === 7 && /主脚本|反脚本|常规脚本|比赛脚本/i.test(text)) {
    return matchDevelopmentText(pred);
  }
  return text;
}

function cloudLockRowsToPredictions(rows = []) {
  return (rows || [])
    .filter((row) => ["FINAL_LOCK", "PRE_LOCK"].includes(row.lock_type || row.lockType))
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, {});
      const prediction = payload.sportteryPrediction || payload.prediction || payload;
      const analysis = prediction.analysis || payload.analysis || prediction.payload || payload.payload || {};
      const finalPick = prediction.finalPick || prediction.analysis?.finalPick || payload.finalPick || {};
      const finalScoresText = Array.isArray(finalPick.scores) ? finalPick.scores.join(" / ") : finalPick.scores || "";
      const scorePair = Array.isArray(finalPick.scores)
        ? [finalPick.scores[0] || "", finalPick.scores[1] || ""]
        : scorePairFromPick(prediction.scorePick || finalScoresText || "");
      const rawMatchId = prediction.matchId || row.match_id || "";
      const compactMatchId = String(rawMatchId || "").replace(/^sporttery-/, "");
      const lockType = row.lock_type || row.lockType || prediction.lockType || "FINAL_LOCK";
      if (payload.autoGenerated || prediction.autoGenerated) return null;
      if (!prediction?.home && !prediction?.homeTeam && !row.home_team) return null;
      return {
        ...prediction,
        sportteryKey: prediction.sportteryKey || (compactMatchId ? `id-${compactMatchId}` : ""),
        matchId: compactMatchId,
        cloudMatchId: String(rawMatchId || row.match_id || ""),
        no: prediction.no || prediction.matchCode || compactSportteryNo(row.match_code, row.match_id),
        issue: prediction.issue || prediction.matchCode || row.match_code || "",
        date: prediction.date || prediction.matchDate || String(prediction.kickoffTime || row.kickoff_time || "").slice(0, 10),
        matchDate: prediction.matchDate || prediction.date || String(prediction.kickoffTime || row.kickoff_time || "").slice(0, 10),
        kickoffTime: prediction.kickoffClock || prediction.kickoffTimeText || String(prediction.kickoffTime || row.kickoff_time || "").slice(11, 16),
        competition: prediction.competition || prediction.league || row.league || "竞彩",
        league: prediction.league || prediction.competition || row.league || "竞彩",
        home: prediction.home || prediction.homeTeam || row.home_team || "",
        away: prediction.away || prediction.awayTeam || row.away_team || "",
        homeTeam: prediction.homeTeam || prediction.home || row.home_team || "",
        awayTeam: prediction.awayTeam || prediction.away || row.away_team || "",
        modelVersion: prediction.modelVersion || row.model_version || "V4",
        confidence: prediction.confidence || row.final_grade || "",
        advice: prediction.advice || prediction.finalAction || finalPick.advice || row.final_action || "",
        pick: prediction.pick || prediction.recommendationSide || finalPick.winDrawLose || row.recommendation_side || row.recommendation || "",
        handicapPick: prediction.handicapPick || prediction.handicapRecommendation || finalPick.handicap || "",
        totalGoalsPick: prediction.totalGoalsPick || finalPick.totalGoals || "",
        mainScore: prediction.mainScore || scorePair[0] || "",
        counterScore: prediction.counterScore || scorePair[1] || "",
        scorePick: prediction.scorePick || finalScoresText || scorePair.filter(Boolean).join(" / "),
        lockId: row.lock_id || prediction.lockId || "",
        lockType,
        lockedAt: row.locked_at || prediction.lockedAt || "",
        resultStatus: row.result_status || prediction.resultStatus || "",
        autoGenerated: false,
        decisionProcess: prediction.decisionProcess || analysis.decisionProcess || "V4按固定顺序执行：胜平负SP复核、赛事规则、球队状态、风格对位、机构线、赔率动态、常规脚本、半场/60分钟触发、冲突闸门、比分总进球、让球独立闸门、失败方式、价值过滤、锁版动作。",
        unifiedSteps: prediction.unifiedSteps || analysis.unifiedSteps || [],
        teamState: prediction.teamState || analysis.teamState || "",
        lineMovement: prediction.lineMovement || analysis.lineMovement || "",
        hardGate: prediction.hardGate || analysis.hardGate || "",
        keyJudgement: prediction.keyJudgement || analysis.keyJudgement || "",
        dataQuality: prediction.dataQuality || analysis.dataQuality || row.data_quality || "",
        competitionRules: prediction.competitionRules || analysis.competitionRules || unifiedStepText(analysis, 2),
        groupSituation: prediction.groupSituation || analysis.groupSituation || unifiedStepText(analysis, 2),
        recentAnalysis: prediction.recentAnalysis || analysis.recentAnalysis || analysis.teamState || unifiedStepText(analysis, 3),
        styleMatchup: prediction.styleMatchup || analysis.styleMatchup || unifiedStepText(analysis, 4),
        institutionLine: prediction.institutionLine || analysis.institutionLine || unifiedStepText(analysis, 5),
        marketGap: prediction.marketGap || analysis.marketGap || unifiedStepText(analysis, 5),
        oddsMovement: prediction.oddsMovement || analysis.oddsMovement || analysis.lineMovement || unifiedStepText(analysis, 6),
        script: prediction.script || analysis.script || rawUnifiedStepText(analysis, 7),
        stateTransfer: prediction.stateTransfer || analysis.stateTransfer || unifiedStepText(analysis, 8),
        decisionConflict: prediction.decisionConflict || analysis.decisionConflict || analysis.hardGate || unifiedStepText(analysis, 9),
        totalGoalsValidation: prediction.totalGoalsValidation || analysis.totalGoalsValidation || unifiedStepText(analysis, 10),
        handicapGate: prediction.handicapGate || analysis.handicapGate || unifiedStepText(analysis, 11),
        failureMode: prediction.failureMode || analysis.failureMode || unifiedStepText(analysis, 12),
        valueFilter: prediction.valueFilter || analysis.valueFilter || unifiedStepText(analysis, 13),
        finalDecisionAction: prediction.finalDecisionAction || analysis.finalDecisionAction || prediction.finalAction || unifiedStepText(analysis, 14),
      };
    })
    .filter(Boolean);
}

function cloudMatchIdForSportteryItem(item = {}) {
  const raw = item.cloudMatchId || item.matchId || sportteryItemKey(item);
  const compact = sportteryComparableId(raw);
  return compact ? `sporttery-${compact}` : "";
}

async function ensureSportteryLockForItem(item = {}, key = "") {
  const matchId = cloudMatchIdForSportteryItem(item);
  if (!matchId || !window.WC_CLOUD_STORE?.getPreferredLock) return false;
  if (sportteryLockFetchPending.has(matchId)) return false;
  sportteryLockFetchPending.add(matchId);
  try {
    const preferred = await window.WC_CLOUD_STORE.getPreferredLock(matchId);
    const lockRows = preferred?.lock
      ? [preferred.lock]
      : (await window.WC_CLOUD_STORE.listLocks?.(matchId))?.locks || [];
    const changed = mergeCloudAutoPredictions(cloudLockRowsToPredictions(lockRows));
    const currentKey = currentSportteryRouteKey();
    if (changed && currentKey && (currentKey === key || sameSportteryIdentity(currentKey, key) || sameSportteryIdentity(currentKey, matchId))) {
      renderSportteryMatchDetail(currentKey);
    }
    return changed;
  } catch {
    return false;
  } finally {
    sportteryLockFetchPending.delete(matchId);
  }
}

function hasCompleteSportteryLockFields(pred = {}) {
  if (!pred) return false;
  const scores = [pred.mainScore, pred.counterScore].filter(Boolean);
  return Boolean(
    pred.lockId &&
    (pred.pick || pred.recommendationSide) &&
    (pred.handicapPick || pred.handicapRecommendation) &&
    (scores.length || pred.scorePick)
  );
}

function resultForWorldCupMatch(match) {
  const results = resultsData.results || [];
  const matchId = String(match.matchId || match.sportteryKey || match.cloudMatchId || "").replace(/^sporttery-/, "");
  return (matchId ? results.find((result) => String(result.matchId || result.sportteryKey || result.cloudMatchId || "").replace(/^sporttery-/, "") === matchId) : null) || results.find(
    (result) =>
      (result.ticaiDate === match.date || result.matchDate === match.date) &&
      looseTeamMatch(match.home, result.home) &&
      looseTeamMatch(match.away, result.away)
  );
}

function officialScoreForMatch(match) {
  const result = resultForWorldCupMatch(match);
  const odds = oddsMatch(match);
  const liveScore = liveScoreForSportteryItem({ ...match, ...odds });
  const resultScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  if (resultScore) return resultScore;
  const usableResultScore = sportteryScoreIsUsable(result) ? normalizeResultScore(result?.score) : "";
  if (usableResultScore) return usableResultScore;
  const finishedLiveScore = liveScore?.isFinished && liveScoreUsesRegularTime(liveScore) ? normalizeResultScore(liveScore.score) : "";
  if (finishedLiveScore) return finishedLiveScore;
  const isSportteryBacked = Boolean(match?.sportteryKey || match?.matchId || odds?.matchId);
  if (isSportteryBacked) return "";
  return normalizeResultScore(odds?.score) || normalizeResultScore(match?.score);
}

function liveScoreUsesRegularTime(row = {}) {
  const source = String(row.source || "");
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.scoreDuration || ""}`;
  if (/football-data\.org/i.test(source)) return row.scoreMode !== "fullTime" || !/extra|after|penalt|shootout|aet/i.test(status);
  return !/extra|after|penalt|shootout|aet|加时|点球/i.test(status);
}

function currentLiveScoreForMatch(match) {
  const odds = oddsMatch(match);
  const liveScore = liveScoreForSportteryItem({ ...match, ...odds });
  if (!liveScore || liveScore.isFinished) return "";
  if (!liveScoreUsesRegularTime(liveScore)) return "";
  const statusText = `${liveScore.status || ""} ${liveScore.statusName || ""} ${liveScore.statusLabel || ""} ${liveScore.minute || ""}`;
  if (!liveScore.live && !/^\s*(\d+(\+\d+)?'?|half|半场|中场|paused|in[_\s-]?play|live)/i.test(statusText)) return "";
  return normalizeResultScore(liveScore.score);
}

function applyResultBackfill() {
  (oddsData.matches || []).forEach((item) => {
    const result = resultForSportteryItem(item);
    const liveScore = liveScoreForSportteryItem(item);
    const score = verifiedSportteryScore(item) || (liveScore?.isFinished && liveScoreUsesRegularTime(liveScore) ? normalizeResultScore(liveScore?.score) : "");
    if (!score) return;
    item.score = score;
    item.result = result?.result || direction(score);
    item.statusCode = result?.statusCode || item.statusCode;
    item.statusName = result?.statusName || liveScore?.statusLabel || item.statusName || "已完成";
    item.halfScore = result?.halfScore || liveScore?.halfScore || item.halfScore || "";
    item.liveScoreSource = liveScore?.source || item.liveScoreSource || "";
    item.winner = liveScore?.winnerZh || item.winner || "";
    item.winnerSide = liveScore?.winnerSide || item.winnerSide || "";
    item.penaltyScore = liveScore?.penaltyScore || item.penaltyScore || "";
    item.scoreDuration = liveScore?.scoreDuration || item.scoreDuration || "";
  });
  matches.forEach((match) => {
    const result = resultForWorldCupMatch(match);
    const odds = oddsMatch(match);
    const liveScore = liveScoreForSportteryItem({ ...match, ...odds });
    const score = verifiedSportteryScore({ ...match, ...odds }) || (liveScore?.isFinished && liveScoreUsesRegularTime(liveScore) ? normalizeResultScore(liveScore?.score) : "");
    if (!score) return;
    match.score = score;
    match.officialResultSource = result?.score ? "sporttery" : liveScore?.source || "live-fallback";
    match.halfScore = result?.halfScore || liveScore?.halfScore || match.halfScore || "";
    match.winner = liveScore?.winnerZh || match.winner || "";
    match.winnerSide = liveScore?.winnerSide || match.winnerSide || "";
    match.penaltyScore = liveScore?.penaltyScore || match.penaltyScore || "";
    match.scoreDuration = liveScore?.scoreDuration || match.scoreDuration || "";
  });
}

function handicapLine(no) {
  return oddsMatch(no)?.handicap || "";
}

function handicapLineFromPrediction(pred) {
  const text = `${pred?.handicap || ""} ${pred?.marketGap || ""}`;
  const match = matches.find((item) => item.no === pred?.no);
  const home = match?.home || pred?.home || "";
  if (home) {
    const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const homePattern = new RegExp(`${escapedHome}\\s*([+-]\\d+(?:\\.\\d+)?)`);
    const homeMatch = text.match(homePattern);
    if (homeMatch) return homeMatch[1];
  }
  const generalMatch = text.match(/([+-]\d+(?:\.\d+)?)/);
  return generalMatch ? generalMatch[1] : "";
}

function reviewHandicapLine(pred) {
  // A three-digit Sporttery number repeats across sales days and leagues.
  // The locked prediction's own line is authoritative; number-only lookup is
  // fallback for legacy records that genuinely have no handicap field.
  return handicapLineFromPrediction(pred) || handicapLine(pred?.no);
}

function handicapDirection(score, handicap) {
  const parsed = parseScore(score);
  if (!parsed || handicap === "") return "";
  const adjustedHome = parsed.home + Number(handicap);
  if (Number.isNaN(adjustedHome)) return "";
  if (adjustedHome > parsed.away) return "让胜";
  if (adjustedHome < parsed.away) return "让负";
  return "让平";
}

function handicapPick(pred) {
  return pred.handicapPick || handicapDirection(pred.mainScore, reviewHandicapLine(pred));
}

function resolvedPredictionDecision(pred, context = {}) {
  if (!pred) return null;
  const mainScore = pred.mainScore || pred.score1 || "";
  const primaryDirection = direction(mainScore);
  const primaryHandicap = handicapDirection(mainScore, context.handicapLine || reviewHandicapLine(pred));
  const originalPick = pred.pick || context.directionPick || "";
  const originalHandicap = handicapPick(pred) || context.handicapPick || "";
  // Never rewrite an explicit locked conclusion in the presentation layer.
  // Score-derived values are only fallbacks for incomplete legacy records.
  const resolvedPick = originalPick || primaryDirection || "";
  const resolvedHandicap = originalHandicap || primaryHandicap || "";
  const conflicts = [];
  if (primaryDirection && originalPick && primaryDirection !== originalPick) {
    conflicts.push(`锁版胜平负${originalPick}与主比分映射${primaryDirection}不一致`);
  }
  if (primaryHandicap && originalHandicap && primaryHandicap !== originalHandicap) {
    conflicts.push(`锁版让球${originalHandicap}与主比分映射${primaryHandicap}不一致`);
  }
  const hasConflict = conflicts.length > 0;
  const resolution = hasConflict
    ? `一致性告警：${conflicts.join("，")}；前端保留正式锁版结论，不做二次改写。`
    : pred.conflictResolution || pred.decisionGateConflict || "";
  return {
    pick: resolvedPick,
    handicapPick: resolvedHandicap,
    mainScore,
    hasConflict,
    resolution,
    originalPick,
    originalHandicap,
  };
}

function displayModelText(value) {
  return String(value || "")
    .replaceAll("主剧本", "比分预测")
    .replaceAll("反剧本", "比分预测")
    .replaceAll("主比分", "比分预测")
    .replaceAll("反比分", "比分预测")
    .replace(/待人工补充/g, "系统侧待补齐")
    .replace(/待人工校准/g, "系统侧待校准")
    .replace(/阵容伤停和人工确认未完成前/g, "关键客观信息由系统继续补齐期间")
    .replace(/阵容伤停和人工确认前/g, "阵容伤停和关键客观信息补齐前")
    .replace(/未人工确认/g, "关键客观信息仍在系统补齐")
    .replace(/未人工阵容确认/g, "关键阵容信息仍在系统补齐")
    .replace(/阵容伤停仍需人工确认/g, "阵容伤停信息仍在系统补齐")
    .replace(/人工确认后才允许/g, "关键客观信息补齐后才允许")
    .replace(/人工确认后的/g, "关键客观信息补齐后的")
    .replace(/人工确认锁版/g, "关键客观信息补齐锁版")
    .replace(/V4链路人工确认/g, "V4链路关键客观信息补齐")
    .replace(/人工确认前/g, "关键客观信息补齐前")
    .replace(/人工确认后/g, "关键客观信息补齐后");
}

function modelVersionFromText(...values) {
  const text = values.filter(Boolean).join(" ");
  const match = text.match(/\bV\s*(\d+)\b/i);
  return match ? `V${match[1]}` : "";
}

function baseCompetitionLabel(value = "") {
  const text = String(value || "")
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/\bV\s*\d+\b/gi, "")
    .replace(/32强|淘汰赛|联赛模型|模型|专题|当前/g, "")
    .trim();
  return text || "";
}

function modelDisplayName(pred = {}, match = {}, fallback = "") {
  const rawModelVersion =
    pred.modelVersion ||
    modelVersionFromText(pred.type, pred.competitionModel, pred.eventModel, pred.competitionType, fallback);
  const rawVersion = modelVersionFromText(rawModelVersion) || rawModelVersion;
  const explicitCompetition =
    baseCompetitionLabel(pred.competition) ||
    baseCompetitionLabel(match.league) ||
    baseCompetitionLabel(match.competition);
  const version = rawVersion || "V1";
  if (explicitCompetition && !/世界杯|World Cup/i.test(explicitCompetition)) {
    const competition = explicitCompetition.replace(/联赛$/, "").trim();
    if (/体彩|竞彩/.test(competition)) return `${competition} ${version} 模型`;
    return `${competition} 联赛 ${version} 模型`;
  }
  const text = [
    pred.competition,
    pred.competitionModel,
    pred.eventModel,
    pred.competitionType,
    match.competition,
    match.league,
    fallback,
  ]
    .filter(Boolean)
    .join(" ");
  if (/世界杯|World Cup/i.test(text)) {
    const version = rawVersion || data.currentModelVersion || "V4";
    return `世界杯 ${version} 模型`;
  }
  const competition =
    explicitCompetition ||
    baseCompetitionLabel(fallback) ||
    "体彩联赛";
  const normalizedCompetition = competition.replace(/联赛$/, "").trim();
  if (/体彩|竞彩/.test(normalizedCompetition)) return `${normalizedCompetition} ${version} 模型`;
  return `${normalizedCompetition} 联赛 ${version} 模型`;
}
