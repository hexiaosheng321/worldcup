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
const CLOUD_BOOTSTRAP_CACHE_KEY = "wc_cloud_bootstrap_initial_v1";
const STATIC_SNAPSHOT_FALLBACKS = [
  "./live-sporttery-data.js",
  "./live-sporttery-results.js",
  "./live-sporttery-sp-history.js",
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
let cloudBootstrapPending = null;
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
const oddsSelections = new Map();
const collapsedOddsDates = new Set();
let activeSheetMatchNo = "";
let modelNoticeTimer;
let activeReviewView = "ticket";
let activeReviewDate = "all";
let activeGlobalStatsDate = "all";
let activeGlobalStatsLeague = "all";
let activeSportteryPoolView = "open";
let activeOddsMapView = "pre";
let matchDetailReturnTarget = "today";
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
  document.querySelectorAll(".home-topbar nav button").forEach((button) => button.classList.remove("active"));
  siteHome?.classList.add("active");
}

function showDashboard() {
  document.body.classList.add("dashboard-mode");
  document.body.classList.remove("home-mode");
  document.querySelectorAll(".home-topbar nav button").forEach((button) => button.classList.remove("active"));
  const active =
    window.location.hash === "#sporttery" || window.location.hash.startsWith("#sporttery-match-")
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
  document.querySelector(`.home-topbar ${active}`)?.classList.add("active");
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
  if (targetNo) {
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
    const byNo = matches.find((match) => normalizedIssueNo(match.no) === targetNo);
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
  return rows.find((row) =>
    row.sportteryKey === key ||
    row.matchId === item.matchId ||
    (normalizedIssueNo(row.issue) && normalizedIssueNo(row.issue) === normalizedIssueNo(item.issue || item.no))
  )?.context || rows.find((row) =>
    row.matchDate === item.matchDate &&
    looseTeamMatch(item.home, row.home) &&
    looseTeamMatch(item.away, row.away)
  )?.context || item.footballDataContext || {};
}

function liveScoreStatusText(row) {
  if (!row) return "";
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

function sportteryPredictionForItem(item = {}) {
  const key = sportteryItemKey(item);
  const linkedMatch = matchFromOddsItem(item) || matchFromResultItem(item);
  const worldCupRows = data.predictions || [];
  const sportteryRows = data.sportteryPredictions || [];
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
  return sportteryRows.find((pred) => pred.sportteryKey && (pred.sportteryKey === key || sameSportteryIdentity(pred.sportteryKey, key)))
    || sportteryRows.find((pred) => pred.matchId && item.matchId && sameSportteryIdentity(pred.matchId, item.matchId))
    || sportteryRows.find(
      (pred) =>
        pred.no &&
        item.no &&
        pred.no === item.no &&
        [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date)
    )
    || sportteryRows.find(
      (pred) =>
        [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date) &&
        looseTeamMatch(pred.home, item.home) &&
        looseTeamMatch(pred.away, item.away)
    );
}

function findSportteryItemForPrediction(pred = {}) {
  const rows = [...(oddsData.matches || []), ...(resultsData.results || [])];
  return rows.find((item) => pred.sportteryKey && (sportteryItemKey(item) === pred.sportteryKey || item.sportteryKey === pred.sportteryKey || sameSportteryIdentity(sportteryItemKey(item), pred.sportteryKey) || sameSportteryIdentity(item.sportteryKey, pred.sportteryKey)))
    || rows.find((item) => pred.matchId && item.matchId && sameSportteryIdentity(pred.matchId, item.matchId))
    || rows.find(
      (item) =>
        pred.no &&
        item.no &&
        pred.no === item.no &&
        [item.ticaiDate, item.matchDate].includes(pred.matchDate || pred.date)
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
    const nextManual = !item.autoGenerated && item.lockType === "FINAL_LOCK";
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

function cloudLockRowsToPredictions(rows = []) {
  return (rows || [])
    .filter((row) => row.lock_type === "FINAL_LOCK" || row.lockType === "FINAL_LOCK")
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, {});
      const prediction = payload.sportteryPrediction || payload.prediction || payload;
      if (payload.autoGenerated || prediction.autoGenerated) return null;
      if (!prediction?.home && !row.home_team) return null;
      return {
        ...prediction,
        sportteryKey: prediction.sportteryKey || (row.match_id ? `id-${String(row.match_id).replace(/^sporttery-/, "")}` : ""),
        matchId: prediction.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
        no: prediction.no || compactSportteryNo(row.match_code, row.match_id),
        issue: prediction.issue || row.match_code || "",
        date: prediction.date || String(row.kickoff_time || "").slice(0, 10),
        matchDate: prediction.matchDate || String(row.kickoff_time || "").slice(0, 10),
        kickoffTime: prediction.kickoffTime || String(row.kickoff_time || "").slice(11, 16),
        competition: prediction.competition || row.league || "竞彩",
        home: prediction.home || row.home_team || "",
        away: prediction.away || row.away_team || "",
        modelVersion: prediction.modelVersion || row.model_version || "V4",
        confidence: prediction.confidence || row.final_grade || "",
        advice: prediction.advice || row.final_action || "",
        pick: prediction.pick || row.recommendation || "",
        lockId: row.lock_id || prediction.lockId || "",
        lockType: row.lock_type || row.lockType || "FINAL_LOCK",
        lockedAt: row.locked_at || prediction.lockedAt || "",
        resultStatus: row.result_status || prediction.resultStatus || "",
      };
    })
    .filter(Boolean);
}

function resultForWorldCupMatch(match) {
  const results = resultsData.results || [];
  return results.find(
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
  return handicapLine(pred?.no) || handicapLineFromPrediction(pred);
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
  const resolvedPick = primaryDirection || originalPick || "";
  const resolvedHandicap = primaryHandicap || originalHandicap || "";
  const conflicts = [];
  if (primaryDirection && originalPick && primaryDirection !== originalPick) {
    conflicts.push(`胜平负由${originalPick}改为${primaryDirection}`);
  }
  if (primaryHandicap && originalHandicap && primaryHandicap !== originalHandicap) {
    conflicts.push(`让球由${originalHandicap}改为${primaryHandicap}`);
  }
  const hasConflict = conflicts.length > 0;
  const resolution = hasConflict
    ? `冲突闸门：主比分 ${mainScore} 权重最高，${conflicts.join("，")}；反比分只保留为风险分支。`
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
    .replaceAll("反比分", "比分预测");
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
  const rawVersion =
    pred.modelVersion ||
    modelVersionFromText(pred.type, pred.competitionModel, pred.eventModel, pred.competitionType, fallback);
  const explicitCompetition =
    baseCompetitionLabel(pred.competition) ||
    baseCompetitionLabel(match.league) ||
    baseCompetitionLabel(match.competition);
  const version = rawVersion || "V1";
  if (explicitCompetition && !/世界杯|World Cup/i.test(explicitCompetition)) {
    if (/联赛$/.test(explicitCompetition)) return `${explicitCompetition} ${version}`;
    if (/体彩|竞彩/.test(explicitCompetition)) return `${explicitCompetition} ${version}`;
    return `${explicitCompetition}联赛 ${version}`;
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
  if (/联赛$/.test(competition)) return `${competition} ${version}`;
  if (/体彩|竞彩/.test(competition)) return `${competition} ${version}`;
  return `${competition}联赛 ${version}`;
}

function handicapLabel(pred) {
  const match = matches.find((item) => item.no === pred.no);
  const line = reviewHandicapLine(pred);
  const home = match?.home || pred?.home || "";
  return home && line ? `${home}${line}` : "";
}

function uniquePredictionCount() {
  return new Set([
    ...data.predictions.map((item) => `wc-${item.no}`),
    ...(data.sportteryPredictions || []).map((item) => `sp-${item.sportteryKey || item.no}`),
  ]).size;
}

function predictionVersionRank(pred) {
  const version = predictionModelVersion(pred);
  if (version === "V1") return 1;
  if (version === "V2") return 2;
  if (version === "V3") return 3;
  if (version === "V4") return 4;
  return 0;
}

function predictionModelVersion(pred) {
  if (!pred) return "";
  if (pred.modelVersion) return pred.modelVersion;
  if ((pred.type || "").includes("V4")) return "V4";
  if ((pred.type || "").includes("V3")) return "V3";
  if ((pred.type || "").includes("V2")) return "V2";
  if ((pred.type || "").includes("V1")) return "V1";
  return Number(pred.no) >= 25 ? "V2" : "V1";
}

function predictionVersionLabel(pred) {
  if (!pred) return "";
  return `${predictionModelVersion(pred)} 锁版`;
}

function groupedPredictions() {
  return matches
    .map((match) => ({
      match,
      predictions: data.predictions
        .filter((pred) => pred.no === match.no)
        .slice()
        .sort((a, b) => predictionVersionRank(b) - predictionVersionRank(a)),
    }))
    .filter((item) => item.predictions.length)
    .sort((a, b) => {
      const dateCompare = b.match.date.localeCompare(a.match.date);
      if (dateCompare !== 0) return dateCompare;
      return Number(b.match.no) - Number(a.match.no);
    });
}

function sportteryWorldCupGroupedPredictions() {
  const staticKeys = new Set(
    groupedPredictions().map(({ match }) => `${match.no}-${match.date}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`)
  );
  return (data.sportteryPredictions || [])
    .map((pred) => {
      const item = findSportteryItemForPrediction(pred);
      const competition = pred.competition || pred.competitionModel || item?.league || "";
      if (!/世界杯|world\s*cup/i.test(competition)) return null;
      if (hasOfficialWorldCupLock(pred, item)) return null;
      const actualScore = item ? verifiedSportteryScore(item) : "";
      const match = {
        no: pred.no || item?.no || "",
        date: pred.date || pred.matchDate || item?.ticaiDate || item?.matchDate || "",
        matchDate: pred.matchDate || item?.matchDate || pred.date || item?.ticaiDate || "",
        kickoffTime: pred.kickoffTime || item?.kickoffTime || "",
        group: pred.group || pred.competition || item?.league || "世界杯",
        competition: pred.competition || item?.league || "世界杯",
        league: pred.competition || item?.league || "世界杯",
        home: pred.home || item?.home || "",
        away: pred.away || item?.away || "",
        score: actualScore,
        sportteryKey: pred.sportteryKey || (item ? sportteryItemKey(item) : ""),
        matchId: pred.matchId || item?.matchId || "",
      };
      const key = `${match.no}-${match.date}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`;
      if (!match.home || !match.away || staticKeys.has(key)) return null;
      return { match, predictions: [pred] };
    })
    .filter(Boolean);
}

function groupedWorldCupPredictions() {
  return [...groupedPredictions(), ...sportteryWorldCupGroupedPredictions()].sort((a, b) => {
    const dateCompare = String(b.match.date || "").localeCompare(String(a.match.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b.match.no || 0) - Number(a.match.no || 0);
  });
}

function latestPredictionFor(no) {
  return data.predictions
    .filter((pred) => pred.no === no)
    .slice()
    .sort((a, b) => predictionVersionRank(b) - predictionVersionRank(a))[0];
}

function goalBucket(total) {
  if (total >= 7) return "7+球";
  return `${total}球`;
}

function getFilteredMatches() {
  const keyword = searchInput?.value.trim() || "";
  const status = statusFilter?.value || "all";
  return matches.filter((match) => {
    const textHit = !keyword || `${match.home}${match.away}${match.group}`.includes(keyword);
    const isFinished = Boolean(parseScore(officialScoreForMatch(match)));
    const hasPrediction = predictionMap.has(match.no);
    const statusHit =
      status === "all" ||
      (status === "finished" && isFinished) ||
      (status === "upcoming" && !isFinished) ||
      (status === "predicted" && hasPrediction);
    return textHit && statusHit;
  });
}

function formatDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ticaiDate(match) {
  const odds = oddsMatch(match);
  if (odds?.ticaiDate) return odds.ticaiDate;
  if (match.ticaiDate) return match.ticaiDate;
  return addDays(match.date, data.ticaiDateOffsetDays || 0);
}

function ticaiIssue(match) {
  return oddsMatch(match)?.issue || match.no;
}

function dashboardToday() {
  if (data.currentDate) return data.currentDate;
  return calendarToday();
}

function calendarToday() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function currentSportteryBusinessDate(currentCalendarDate = calendarToday()) {
  const oddsDates = [...(oddsData.matchDates || [])].filter(Boolean).sort();
  const oddsLotterNo = oddsData.lotterNo || "";
  return (
    (oddsDates.includes(currentCalendarDate) ? currentCalendarDate : "") ||
    (oddsLotterNo && oddsLotterNo >= currentCalendarDate ? oddsLotterNo : "") ||
    oddsDates.find((date) => date >= currentCalendarDate) ||
    oddsDates.at(-1) ||
    currentCalendarDate
  );
}

function recentSportteryDateSet(currentCalendarDate = calendarToday(), currentSportteryDate = currentSportteryBusinessDate(currentCalendarDate)) {
  return new Set(
    [currentCalendarDate, addDays(currentCalendarDate, -1), currentSportteryDate, addDays(currentSportteryDate, -1)].filter(Boolean)
  );
}

function itemMatchesDateSet(item = {}, dateSet = new Set()) {
  return [item.ticaiDate, item.matchDate, item.date].filter(Boolean).some((date) => dateSet.has(date));
}

function uniqueSportteryRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = sportteryItemKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function homeReferenceDate() {
  return currentSportteryBusinessDate(calendarToday());
}

function homeUpcomingMatches() {
  const baseDate = homeReferenceDate();
  const recentPoolDates = recentSportteryDateSet();
  const future = matches
    .filter((match) => !parseScore(officialScoreForMatch(match)) && match.date >= baseDate)
    .map((match) => ({ ...match, homeDate: match.date }));
  const sportteryOnly = (oddsData.matches || [])
    .filter((item) => !matchFromOddsItem(item))
    .filter((item) => {
      const score = verifiedSportteryScore(item);
      if (score) return false;
      const saleDate = item.ticaiDate || item.matchDate || "";
      return saleDate >= baseDate || item.matchDate >= baseDate || itemMatchesDateSet(item, recentPoolDates);
    })
    .map((item) => ({
      ...item,
      no: item.no || item.issue,
      date: item.matchDate || item.ticaiDate || baseDate,
      homeDate: item.matchDate || item.ticaiDate || baseDate,
      group: item.league || "竞彩",
      sportteryKey: sportteryItemKey(item),
      sportteryOnly: true,
    }));
  const merged = [...future, ...sportteryOnly]
    .slice()
    .sort((a, b) => (a.homeDate || a.date).localeCompare(b.homeDate || b.date) || Number(a.no) - Number(b.no));
  if (merged.length) return merged;
  return matches
    .filter((match) => !parseScore(officialScoreForMatch(match)))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.no) - Number(b.no));
}

function sportteryWorldCupFlowMatches(dateSet = new Set()) {
  return (oddsData.matches || [])
    .filter((item) => /世界杯|world\s*cup/i.test(item.league || item.competition || ""))
    .filter((item) => itemMatchesDateSet(item, dateSet))
    .map((item) => ({
      no: item.no || compactSportteryNo(item.issue, item.matchId),
      date: item.ticaiDate || item.matchDate || dashboardToday(),
      matchDate: item.matchDate || item.ticaiDate || dashboardToday(),
      ticaiDate: item.ticaiDate || "",
      kickoffTime: item.kickoffTime || "",
      group: item.stage || item.round || item.league || "世界杯",
      competition: item.league || "世界杯",
      league: item.league || "世界杯",
      home: item.home,
      away: item.away,
      score: normalizeResultScore(item.score),
      issue: item.issue || "",
      matchId: item.matchId || "",
      statusCode: item.statusCode || "",
      statusName: item.statusName || "",
      sportteryKey: sportteryItemKey(item),
      sportteryOnly: true,
    }));
}

function worldCupMatchFlowMatches(today, tomorrow) {
  const dateSet = new Set([today, tomorrow].filter(Boolean));
  const staticRows = matches.filter((m) => dateSet.has(m.date) || dateSet.has(ticaiDate(m)) || dateSet.has(m.matchDate));
  const byKey = new Map(
    staticRows.map((match) => [
      `${normalizedIssueNo(match.no)}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`,
      match,
    ])
  );
  sportteryWorldCupFlowMatches(dateSet).forEach((match) => {
    const key = `${normalizedIssueNo(match.no)}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`;
    if (!byKey.has(key)) byKey.set(key, match);
  });
  return [...byKey.values()].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(normalizedIssueNo(a.no)) - Number(normalizedIssueNo(b.no));
  });
}

function parseKickoffAt(date, time) {
  if (!date || !time) return null;
  const cleanTime = String(time).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(cleanTime)) return null;
  const parsed = Date.parse(`${date}T${cleanTime}:00+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoffElapsedMinutes(kickoffAt) {
  if (!kickoffAt) return null;
  return Math.max(0, Math.floor((Date.now() - kickoffAt) / 60000));
}

function isPastResultWindow(kickoffAt) {
  const elapsed = kickoffElapsedMinutes(kickoffAt);
  return elapsed !== null && elapsed > 105;
}

function inferredLiveText(statusName, kickoffAt) {
  if (statusName && statusName !== "待开奖") return statusName;
  if (kickoffElapsedMinutes(kickoffAt) === null) return "进行中";
  if (isPastResultWindow(kickoffAt)) return "待回填";
  return "进行中";
}

function inferredLiveNote(statusName, kickoffAt) {
  const elapsed = kickoffElapsedMinutes(kickoffAt);
  if (statusName && statusName !== "待开奖") return "来自体彩官方状态";
  if (elapsed === null) return "等待官方比分回填";
  if (elapsed > 105) return "比赛已超过常规时间窗口，等待官方比分回填";
  return `已开赛约 ${elapsed} 分钟，等待官方比分回填`;
}

function homeFallbackKickoff(match) {
  const date = match?.matchDate || match?.date || match?.ticaiDate || homeReferenceDate();
  const time = match?.kickoffTime || match?.matchTime;
  return parseKickoffAt(date, time);
}

function homeCountdownCandidates() {
  const now = Date.now();
  const liveMatches = (oddsData.matches || [])
    .map((match) => {
      const reference = matchFromOddsItem(match) || {};
      const kickoffAt = homeFallbackKickoff(match);
      const score = verifiedSportteryScore(match);
      return {
        ...reference,
        ...match,
        group: reference.group || match.group || match.league || "竞彩",
        date: match.matchDate || reference.date || match.ticaiDate,
        kickoffAt,
        score,
      };
    })
    .filter((match) => !match.score && Number.isFinite(match.kickoffAt) && match.kickoffAt >= now)
    .sort((a, b) => a.kickoffAt - b.kickoffAt || Number(a.no) - Number(b.no));

  if (liveMatches.length) return liveMatches;

  return homeUpcomingMatches()
    .map((match) => ({ ...match, kickoffAt: homeFallbackKickoff(match) }))
    .sort((a, b) => a.kickoffAt - b.kickoffAt || Number(a.no) - Number(b.no));
}

function formatCountdownDuration(diffMs) {
  const safeDiff = Math.max(0, diffMs);
  const hours = Math.floor(safeDiff / 3600000);
  const minutes = Math.floor((safeDiff % 3600000) / 60000);
  const seconds = Math.floor((safeDiff % 60000) / 1000);
  return { hours, minutes, seconds };
}

function flagForTeam(team) {
  return teamFlags[team] || "";
}

function renderHomeCountdown() {
  const next = homeCountdownCandidates()[0];
  const nextMatch = document.querySelector("#home-next-match");
  const nextHour = document.querySelector("#home-countdown-hour");
  const nextMinute = document.querySelector("#home-countdown-minute");
  const nextSecond = document.querySelector("#home-countdown-second");
  if (!next) {
    if (nextMatch) nextMatch.textContent = "- vs -";
    if (nextHour) nextHour.textContent = "00";
    if (nextMinute) nextMinute.textContent = "00";
    if (nextSecond) nextSecond.textContent = "00";
    return;
  }

  const diff = formatCountdownDuration(next.kickoffAt - Date.now());
  if (nextMatch) {
    nextMatch.innerHTML = `
      <span class="team-flag">${flagForTeam(next.home)}</span>
      <span>${next.home}</span>
      <small>vs</small>
      <span>${next.away}</span>
      <span class="team-flag">${flagForTeam(next.away)}</span>
    `;
  }
  if (nextHour) nextHour.textContent = String(diff.hours).padStart(2, "0");
  if (nextMinute) nextMinute.textContent = String(diff.minutes).padStart(2, "0");
  if (nextSecond) nextSecond.textContent = String(diff.seconds).padStart(2, "0");
}

function startHomeCountdown() {
  renderHomeCountdown();
  clearInterval(homeCountdownTimer);
  homeCountdownTimer = setInterval(renderHomeCountdown, 1000);
}

function matchKickoffAt(match) {
  const odds = oddsMatch(match);
  const result = resultForWorldCupMatch(match);
  const date = odds?.matchDate || result?.matchDate || match.matchDate || match.date;
  const time = odds?.kickoffTime || result?.kickoffTime || match.kickoffTime;
  return parseKickoffAt(date, time);
}

function liveScoreForMatch(match) {
  return officialScoreForMatch(match) || currentLiveScoreForMatch(match);
}

function liveStatusForMatch(match) {
  const officialScore = officialScoreForMatch(match);
  const odds = oddsMatch(match);
  const liveRow = liveScoreForSportteryItem({ ...match, ...odds });
  const liveScore = currentLiveScoreForMatch(match);
  const result = resultForWorldCupMatch(match);
  const kickoffAt = matchKickoffAt(match);
  const now = Date.now();
  if (officialScore) {
    return {
      tone: "finished",
      label: "已完赛",
      value: officialScore,
      note: result?.statusName || "官方赛果已回填",
      kickoffAt,
    };
  }
  if (liveScore) {
    return {
      tone: "live",
      label: liveScoreStatusText(liveRow) || "进行中",
      value: liveScore,
      note: liveRow?.source ? `实时比分 · ${liveRow.source}` : "实时比分",
      kickoffAt,
    };
  }
  if (kickoffAt && now >= kickoffAt) {
    const statusName = result?.statusName || "";
    if (isPastResultWindow(kickoffAt)) {
      return {
        tone: "pending-result",
        label: "待回填",
        value: "待回填",
        note: inferredLiveNote(statusName, kickoffAt),
        kickoffAt,
      };
    }
    return {
      tone: "live",
      label: inferredLiveText(statusName, kickoffAt) === "待回填" ? "待回填" : "进行中",
      value: inferredLiveText(statusName, kickoffAt),
      note: inferredLiveNote(statusName, kickoffAt),
      kickoffAt,
    };
  }
  if (kickoffAt) {
    return {
      tone: "countdown",
      label: "距开赛",
      value: "",
      note: "北京开球时间",
      kickoffAt,
    };
  }
  return {
    tone: "pending",
    label: "待赛",
    value: "时间待同步",
    note: "等待赛程源",
    kickoffAt: null,
  };
}

function formatMatchCountdown(kickoffAt) {
  if (!kickoffAt) return "时间待同步";
  const diff = kickoffAt - Date.now();
  if (diff <= 0) return isPastResultWindow(kickoffAt) ? "待回填" : "进行中";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}天 ${String(hours).padStart(2, "0")}时`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function homeSportteryStatus(item = {}) {
  const result = resultForSportteryItem(item);
  const liveScore = liveScoreForSportteryItem(item);
  const resultScore = verifiedSportteryScore(item);
  const liveScoreText = normalizeResultScore(liveScore?.score);
  const kickoffAt = homeFallbackKickoff(item);
  if (resultScore) {
    return {
      tone: "finished",
      label: "已完赛",
      value: resultScore,
      note: result?.statusName || item.statusName || "赛果已回填",
      kickoffAt,
    };
  }
  if (liveScoreText && liveScoreStatusText(liveScore)) {
    return {
      tone: liveScore?.isFinished ? "finished" : "live",
      label: liveScoreStatusText(liveScore),
      value: liveScoreText,
      note: liveScore?.source ? `实时比分 · ${liveScore.source}` : "实时比分",
      kickoffAt,
    };
  }
  if (kickoffAt && Date.now() >= kickoffAt) {
    return isPastResultWindow(kickoffAt)
      ? {
          tone: "pending-result",
          label: "待回填",
          value: "待回填",
          note: "比赛已超过常规时间窗口，等待官方比分回填",
          kickoffAt,
        }
      : {
          tone: "live",
          label: "进行中",
          value: "进行中",
          note: "等待官方比分回填",
          kickoffAt,
        };
  }
  return {
    tone: "countdown",
    label: "距开赛",
    value: "",
    note: "北京开球时间",
    kickoffAt,
  };
}

function updateMatchFlowTimers() {
  document.querySelectorAll("[data-match-countdown]").forEach((node) => {
    const kickoffAt = Number(node.dataset.kickoffAt);
    const homeCard = node.closest(".home-match-card");
    if (homeCard?.classList.contains("finished")) return;
    node.textContent = formatMatchCountdown(kickoffAt);
    const card = node.closest(".match-card");
    if (card && kickoffAt && Date.now() >= kickoffAt && !card.classList.contains("finished")) {
      const label = card.querySelector("[data-live-label]");
      const note = card.querySelector("[data-live-note]");
      if (isPastResultWindow(kickoffAt)) {
        card.classList.remove("is-live");
        if (label) label.textContent = "待回填";
        if (note) note.textContent = "比赛已超过常规时间窗口，等待官方比分回填";
      } else {
        card.classList.add("is-live");
        if (label) label.textContent = "进行中";
        if (note) note.textContent = "等待官方比分回填";
      }
    }
    if (homeCard && kickoffAt && Date.now() >= kickoffAt) {
      const label = homeCard.querySelector("[data-home-live-label]");
      const note = homeCard.querySelector("[data-home-live-note]");
      homeCard.classList.toggle("is-live", !isPastResultWindow(kickoffAt));
      homeCard.classList.toggle("pending-result", isPastResultWindow(kickoffAt));
      if (label) label.textContent = isPastResultWindow(kickoffAt) ? "待回填" : "进行中";
      if (note) note.textContent = isPastResultWindow(kickoffAt)
        ? "比赛已超过常规时间窗口，等待官方比分回填"
        : "等待官方比分回填";
    }
  });
}

function startMatchFlowTimers() {
  updateMatchFlowTimers();
  clearInterval(matchFlowTimer);
  matchFlowTimer = setInterval(updateMatchFlowTimers, 1000);
}

function dataFreshnessLabel(value) {
  return formatCapturedAt(value) || "等待快照";
}

function renderHomeResearchLab() {
  const grid = document.querySelector("#home-research-grid");
  if (!grid) return;
  const oddsRows = oddsMapRows();
  const conflictCount = oddsRows.filter((row) => row.riskFlags.length).length;
  const highCount = oddsRows.filter((row) => row.pressureLevel === "强异动").length;
  const teams = buildTeamTable();
  const topPath = teams.slice().sort((a, b) => b.title - a.title)[0];
  const locked = data.predictions.length;
  const verified = matches.filter((match) => parseScore(officialScoreForMatch(match)) && latestPredictionFor(match.no)).length;
  const services = [
    {
      label: "实时数据服务",
      value: `${oddsData.matches?.length || 0} 场`,
      note: `开盘 ${dataFreshnessLabel(oddsData.importedAt || oddsData.lastUpdateTime)}`,
      tone: "data",
    },
    {
      label: "SP 漂移雷达",
      value: `${highCount}/${oddsRows.length || 0}`,
      note: `${conflictCount} 个跨市场冲突`,
      tone: "sp",
    },
    {
      label: "模型锁版库",
      value: `${locked} 条`,
      note: `${verified} 条已有赛果可回测`,
      tone: "model",
    },
    {
      label: "世界杯路径",
      value: topPath?.name || "待计算",
      note: topPath ? `冠军模拟 ${pct(topPath.title)}` : "积分榜待更新",
      tone: "path",
    },
    {
      label: "证据输入清单",
      value: "5 层",
      note: "盘口 / SP / 赛果 / 路径 / 模型文本",
      tone: "check",
    },
  ];
  grid.innerHTML = services
    .map(
      (item) => `
        <article class="${item.tone}">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <em>${item.note}</em>
        </article>
      `
    )
    .join("");
}

function renderHome() {
  const upcoming = homeUpcomingMatches();
  const grid = document.querySelector("#home-upcoming-grid");
  startHomeCountdown();
  renderHomeResearchLab();
  if (!grid) return;
  grid.innerHTML = upcoming
    .slice(0, 6)
    .map((match) => {
      const kickoffAt = matchKickoffAt(match);
      const liveStatus = match.sportteryOnly ? homeSportteryStatus(match) : liveStatusForMatch(match);
      const effectiveKickoffAt = liveStatus.kickoffAt || kickoffAt;
      const groupLabel = match.sportteryOnly ? match.group || "竞彩" : `${match.group} 组`;
      const hasPrediction = match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no);
      const cardTarget = match.sportteryOnly
        ? `data-home-sporttery-key="${encodeURIComponent(match.sportteryKey || sportteryItemKey(match))}"`
        : `data-home-match-no="${match.no}"`;
      const kickoffLabel = effectiveKickoffAt
        ? new Date(effectiveKickoffAt).toLocaleTimeString("zh-CN", {
            timeZone: data.timezone || "Asia/Shanghai",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "时间待同步";
      const countdownValue = liveStatus.tone === "countdown"
        ? formatMatchCountdown(effectiveKickoffAt)
        : liveStatus.value || liveStatus.label;
      const countdownLabel = liveStatus.tone === "countdown" ? "距离开赛" : liveStatus.label;
      const countdownNote = liveStatus.tone === "countdown" ? `${kickoffLabel} 北京时间` : liveStatus.note;
      return `
        <button type="button" class="home-match-card ${liveStatus.tone === "live" ? "is-live" : ""} ${liveStatus.tone === "pending-result" ? "pending-result" : ""} ${liveStatus.tone === "finished" ? "finished" : ""}" ${cardTarget}>
          <span>${groupLabel}</span>
          <em>${formatDate(match.date)}</em>
          <strong>${match.home}<small>vs</small>${match.away}</strong>
          <div class="home-match-countdown">
            <small data-home-live-label>${countdownLabel}</small>
            <strong data-match-countdown data-kickoff-at="${effectiveKickoffAt || ""}">${countdownValue}</strong>
            <em data-home-live-note>${countdownNote}</em>
          </div>
          <b>${hasPrediction ? "已有推演" : "待锁版"}</b>
        </button>
      `;
    })
    .join("");
  startMatchFlowTimers();
}

function lowestOddOption(options = [], labelKey = "score") {
  return [...options]
    .map((item) => ({ ...item, number: numberOdd(item.odds) }))
    .filter((item) => item.number)
    .sort((a, b) => a.number - b.number)[0]?.[labelKey];
}

function marketFavoriteText(odds) {
  if (!odds?.normal) return "";
  const rows = [
    ["胜", odds.normal.win],
    ["平", odds.normal.draw],
    ["负", odds.normal.lose],
  ]
    .map(([label, odd]) => ({ label, odd: numberOdd(odd) }))
    .filter((item) => item.odd);
  if (!rows.length) return "";
  const top = rows.sort((a, b) => a.odd - b.odd)[0];
  return `${top.label} ${top.odd.toFixed(2)}`;
}

function matchLiveDataSummary(match, pred) {
  const odds = oddsMatch(match);
  const spRow = spRadarForMatch(match.no);
  const consistency = pred ? marketConsistency(match.no, pred) : null;
  const gate = pred ? autoDecisionGate(match.no, pred) : null;
  const scoreLow = odds ? lowestOddOption(odds.scoreOdds, "score") : "";
  const totalLow = odds ? lowestOddOption(odds.totalGoalsOdds, "goals") : "";
  const items = [];

  if (odds) {
    items.push(["体彩开盘", odds.issue || match.no, "ready"]);
    items.push(["盘口", `${match.home}${odds.handicap || "0"}`, "ready"]);
    const favorite = marketFavoriteText(odds);
    if (favorite) items.push(["胜平负低位", favorite, "ready"]);
    if (scoreLow) items.push(["比分低赔", scoreLow.replace(":", "-"), "watch"]);
    if (totalLow) items.push(["总进球低赔", `${totalLow}球`, "watch"]);
  } else {
    items.push(["体彩开盘", pred ? "已截止" : "待同步", pred ? "closed" : "pending"]);
  }

  if (spRow?.strongest) {
    items.push(["SP异动", `${spRow.strongest.market} ${spRow.strongest.label}`, spRow.volatility >= 0.08 ? "hot" : "ready"]);
    items.push(["盘口温度", spRow.pressureLevel, spRow.riskFlags.length ? "hot" : "watch"]);
  } else {
    items.push(["SP历史", pred ? "锁版复核" : "等待快照", pred ? "closed" : "pending"]);
  }

  if (gate) items.push(["证据等级", `${gate.level} ${gate.score}`, gate.tone === "cold" ? "watch" : gate.tone === "watch" ? "watch" : "ready"]);
  if (consistency) items.push(["一致性", `${consistency.label} ${consistency.score || "-"}`, consistency.score < 50 ? "hot" : "ready"]);

  return items.slice(0, 7);
}

function matchCard(match, options = {}) {
  const pred = match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no);
  const liveStatus = liveStatusForMatch(match);
  const finished = liveStatus.tone === "finished";
  const displayDate = options.dateGetter ? options.dateGetter(match) : ticaiDate(match);
  const statusText = finished ? "已完赛" : liveStatus.tone === "live" ? "进行中" : liveStatus.tone === "pending-result" ? "待回填" : "待赛";
  const modelText = pred ? `模型 ${pred.pick}` : "待锁版";
  const scoreText = pred ? `比分 ${pred.mainScore} / ${pred.counterScore}` : "等待推演";
  const liveItems = matchLiveDataSummary(match, pred);
  const liveValue =
    liveStatus.tone === "countdown"
      ? `<strong data-match-countdown data-kickoff-at="${liveStatus.kickoffAt}">${formatMatchCountdown(liveStatus.kickoffAt)}</strong>`
      : `<strong>${liveStatus.value}</strong>`;
  const cardTarget = match.sportteryOnly
    ? `data-sporttery-match-key="${encodeURIComponent(match.sportteryKey || sportteryItemKey(match))}"`
    : `data-match-no="${match.no}"`;
  return `
    <article class="match-card ${finished ? "finished" : "upcoming"} ${liveStatus.tone === "live" ? "is-live" : ""} ${pred ? "has-model" : "no-model"}" ${cardTarget}>
      <div class="match-meta">
        <span class="match-issue">${match.no}</span>
        <span>${formatDate(displayDate)} · ${match.group}组</span>
      </div>
      <div class="teams">
        <strong>${match.home}</strong>
        <b>${liveScoreForMatch(match) || "vs"}</b>
        <strong>${match.away}</strong>
      </div>
      <div class="match-live-status ${liveStatus.tone}">
        <span data-live-label>${liveStatus.label}</span>
        ${liveValue}
        <em data-live-note>${liveStatus.note}</em>
      </div>
      <div class="match-card-insight">
        <span class="status-dot ${finished ? "done" : "open"}"></span>
        <strong>${modelText}</strong>
        <em>${scoreText}</em>
      </div>
      <div class="match-live-strip">
        ${liveItems.map(([label, value, tone]) => `<span class="${tone}"><b>${label}</b><strong>${value}</strong></span>`).join("")}
      </div>
      <div class="card-foot">
        <span class="${finished ? "status-done" : "status-open"}">${statusText}</span>
        ${pred ? `<span class="model-chip">${pred.totalGoalsPick || "总进球待定"}</span>` : "<span>暂无模型</span>"}
      </div>
      <span class="card-deep-link">进入单场详情页 ›</span>
    </article>
  `;
}

function renderMatchLanes(sourceMatches, options = {}) {
  const dateGetter = options.dateGetter || ticaiDate;
  const groups = sourceMatches.reduce((acc, match) => {
    const date = dateGetter(match);
    if (!acc.has(date)) acc.set(date, []);
    acc.get(date).push(match);
    return acc;
  }, new Map());

  return [...groups.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, items]) => {
      const modelCount = items.filter((match) => (match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no))).length;
      return `
        <section class="day-lane">
          <div class="day-lane-head">
            <div>
              <span>${formatDate(date)}</span>
              <strong>${items.length} 场</strong>
            </div>
            <em>${modelCount}/${items.length} 锁版</em>
          </div>
          <div class="match-grid">${items.map((match) => matchCard(match, { dateGetter })).join("")}</div>
        </section>
      `;
    })
    .join("");
}

function sportteryPoolItems() {
  const resultRows = resultsData.results || [];
  const currentCalendarDate = calendarToday();
  const currentSportteryDate = currentSportteryBusinessDate(currentCalendarDate);
  const recentPoolDates = recentSportteryDateSet(currentCalendarDate, currentSportteryDate);
  const now = Date.now();
  const openItems = (oddsData.matches || [])
    .map((item) => {
      const linkedMatch = matchFromOddsItem(item);
      const result = resultForSportteryItem(item);
      const liveScore = liveScoreForSportteryItem(item);
      const resultScore = verifiedSportteryScore(item);
      const liveScoreText = normalizeResultScore(liveScore?.score);
      const score = resultScore || (liveScore?.isFinished ? liveScoreText : "");
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const elapsed = kickoffElapsedMinutes(kickoffAt);
      const likelyPastLiveWindow = !score && elapsed !== null && elapsed > 105 && !liveScoreText;
      const liveSignal = Boolean(liveScore?.live || liveScoreStatusText(liveScore));
      const kickoffStarted = Number.isFinite(kickoffAt) && now >= kickoffAt;
      const isLive = !score && !likelyPastLiveWindow && ((Boolean(liveScoreText) && liveSignal) || kickoffStarted);
      const displayScore = score || (isLive ? liveScoreText : "");
      const modelPred = sportteryPredictionForItem(item);
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || oddsData.lotterNo || dashboardToday(),
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        score,
        liveScore: liveScoreText,
        displayScore,
        liveStatus: liveScoreStatusText(liveScore),
        liveHalfScore: liveScore?.halfScore || "",
        liveSource: liveScore?.source || "",
        sourceType: "open",
        poolTone: score ? "finished" : isLive ? "live" : "open",
        status: score
          ? "已完赛"
          : likelyPastLiveWindow
            ? "待回填"
            : isLive
              ? liveScoreStatusText(liveScore) || "进行中"
              : modelPred ? "已有推演" : "已开盘",
        pendingResultNote: likelyPastLiveWindow ? inferredLiveNote(item.statusName, kickoffAt) : "",
      };
    })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate) || String(a.issue).localeCompare(String(b.issue)));
  const visibleOpenItems = openItems.filter((item) => {
    if (item.poolTone !== "open") return false;
    const ticaiDate = item.ticaiDate || "";
    const matchDate = item.matchDate || "";
    const saleDate = ticaiDate || matchDate;
    return saleDate >= currentSportteryDate || matchDate === currentCalendarDate || (!normalizeResultScore(item.score) && itemMatchesDateSet(item, recentPoolDates));
  });

  const resultKeys = new Set(
    resultRows
      .filter((item) => sportteryResultIsFinished(item))
      .map((item) =>
        [
          normalizedIssueNo(item.no || item.issue),
          item.ticaiDate || "",
          item.matchDate || "",
          `${item.home || ""}__${item.away || ""}`,
        ].join("|")
      )
  );
  const worldCupFinishedFallbackRows = matches
    .filter((match) => normalizeResultScore(officialScoreForMatch(match)))
    .map((match) => {
      const odds = oddsMatch(match) || {};
      const score = officialScoreForMatch(match);
      return {
        ...odds,
        orderId: odds.orderId || "",
        issue: odds.issue || match.no,
        no: match.no,
        ticaiDate: odds.ticaiDate || match.date,
        matchDate: odds.matchDate || match.date,
        kickoffTime: odds.kickoffTime || "",
        league: odds.league || "世界杯",
        matchId: odds.matchId || "",
        home: match.home,
        away: match.away,
        statusCode: odds.statusCode || "11",
        statusName: "已完成",
        score,
        result: direction(score),
        resultSource: "worldcup-data-fallback",
        linkedMatch: match,
      };
    })
    .filter((item) => {
      const key = [
        normalizedIssueNo(item.no || item.issue),
        item.ticaiDate || "",
        item.matchDate || "",
        `${item.home || ""}__${item.away || ""}`,
      ].join("|");
      return !resultKeys.has(key);
    });
  const liveFinishedFallbackRows = openItems
    .filter((item) => sportteryResultIsFinished(item))
    .filter((item) => {
      const key = [
        normalizedIssueNo(item.no || item.issue),
        item.ticaiDate || "",
        item.matchDate || "",
        `${item.home || ""}__${item.away || ""}`,
      ].join("|");
      return !resultKeys.has(key);
    })
    .map((item) => ({
      ...item,
      statusCode: item.statusCode || "11",
      statusName: item.statusName && item.statusName !== "待开奖" ? item.statusName : "已完成",
      result: item.result || direction(item.score),
      resultSource: item.liveSource || "live-fallback",
    }));

  const seenFinishedKeys = new Set();
  const finishedItems = [...resultRows, ...worldCupFinishedFallbackRows, ...liveFinishedFallbackRows]
    .filter((item) => {
      const key = sportteryItemKey(item);
      if (seenFinishedKeys.has(key)) return false;
      seenFinishedKeys.add(key);
      return true;
    })
    .filter((item) => {
      return itemMatchesDateSet(item, recentPoolDates);
    })
    .filter((item) => normalizeResultScore(item.score))
    .map((item) => {
      const linkedMatch = item.linkedMatch || matchFromResultItem(item);
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || item.matchDate || currentSportteryDate,
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        sourceType: "finished",
        poolTone: "finished",
        status: item.statusName || "已完赛",
      };
    })
    .sort((a, b) => String(a.issue).localeCompare(String(b.issue)));

  const liveResultItems = resultRows
    .filter((item) => !normalizeResultScore(item.score))
    .filter((item) => itemMatchesDateSet(item, recentPoolDates))
    .filter((item) => {
      const status = `${item.statusCode || ""} ${item.statusName || ""}`;
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const hasStarted = Number.isFinite(kickoffAt) && Date.now() >= kickoffAt;
      return hasStarted || /进行|半场|中场|暂停|加时|未完成|比赛中|待开奖|[1-9]\d?'/.test(status);
    })
    .map((item) => {
      const linkedMatch = matchFromResultItem(item);
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const pendingResult = isPastResultWindow(kickoffAt);
      const liveScore = liveScoreForSportteryItem(item);
      const score = liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "";
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || item.matchDate || dashboardToday(),
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        score,
        displayScore: score,
        liveHalfScore: liveScore?.halfScore || "",
        liveSource: liveScore?.source || "",
        sourceType: score ? "finished" : "live",
        poolTone: score ? "finished" : pendingResult ? "open" : "live",
        status: score ? "已完赛" : inferredLiveText(item.statusName, kickoffAt),
        liveNote: score ? "" : inferredLiveNote(item.statusName, kickoffAt),
        pendingResultNote: pendingResult ? inferredLiveNote(item.statusName, kickoffAt) : "",
      };
    })
    .filter((item) => item.poolTone === "live" || item.pendingResultNote);

  const liveOpenItems = openItems.filter((item) => item.poolTone === "live" || (item.pendingResultNote && itemMatchesDateSet(item, recentPoolDates)));
  if (activeSportteryPoolView === "finished") return finishedItems;
  if (activeSportteryPoolView === "live") return uniqueSportteryRows([...liveResultItems, ...liveOpenItems]);
  return visibleOpenItems;
}

function sportteryPoolCard(item) {
  const linked = Boolean(item.linkedNo);
  const cardKey = encodeURIComponent(item.sportteryKey || sportteryItemKey(item));
  const handicap = item.handicap || "0";
  const normalText = item.normal
    ? `胜 ${item.normal.win} · 平 ${item.normal.draw} · 负 ${item.normal.lose}`
    : `让球 ${handicap}`;
  const score = normalizeResultScore(item.score);
  const displayScore = normalizeResultScore(item.displayScore) || score;
  const isLive = item.poolTone === "live";
  const statusLine = isLive ? item.status || "进行中" : item.status;
  const marketText = item.sourceType === "finished"
    ? `半场 ${item.halfScore || "-"} · ${item.result || direction(score) || "-"}`
    : item.sourceType === "live"
      ? item.liveScore
        ? `半场 ${item.liveHalfScore || "-"} · ${item.liveSource || "实时比分源"}`
        : item.liveNote || "实时源未匹配，等待官方比分回填"
      : isLive
        ? item.liveScore
          ? `半场 ${item.liveHalfScore || "-"} · ${item.liveSource || "实时比分源"}`
          : "实时源未匹配，等待官方比分回填"
        : item.pendingResultNote || normalText;
  return `
    <article class="match-card sporttery-card ${score ? "finished" : ""} ${isLive ? "is-live" : ""}" data-sporttery-match-key="${cardKey}" ${linked ? `data-pool-match-no="${item.linkedNo}"` : ""}>
      <div class="match-meta">
        <span>${item.issue || item.no} · ${item.displayGroup}</span>
        <span>${formatDate(item.displayDate)}</span>
      </div>
      <div class="teams">
        <strong>${item.displayHome}</strong>
        <b>${displayScore || (isLive ? "LIVE" : "vs")}</b>
        <strong>${item.displayAway}</strong>
      </div>
      <div class="match-card-insight">
        <strong>${statusLine}</strong>
        <em>${marketText}</em>
      </div>
      <div class="card-foot">
        <span>${item.league || "体彩"}</span>
        <span>进入体彩详情 ›</span>
      </div>
    </article>
  `;
}

function renderSportteryPool() {
  const target = document.querySelector("#sporttery-pool-grid");
  if (!target) return;
  const items = sportteryPoolItems();
  cacheSportteryPoolItems(items);
  const grouped = items.reduce((acc, item) => {
    if (!acc.has(item.displayDate)) acc.set(item.displayDate, []);
    acc.get(item.displayDate).push(item);
    return acc;
  }, new Map());
  const linkedCount = items.filter((item) => item.linkedNo).length;
  const countNode = document.querySelector("#sporttery-pool-count");
  const labelNode = document.querySelector("#sporttery-pool-label");
  const sourceNode = document.querySelector("#sporttery-source");
  document.querySelectorAll("[data-pool-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.poolView === activeSportteryPoolView);
  });
  if (countNode) countNode.textContent = `${items.length} 场`;
  if (labelNode) {
    const labelMap = {
      open: `${linkedCount}/${items.length} 已匹配模型`,
      live: `${items.length} 场实时`,
      finished: `${items.length} 场完赛`,
    };
    labelNode.textContent = labelMap[activeSportteryPoolView] || `${linkedCount}/${items.length} 已匹配模型`;
  }
  if (sourceNode) {
    const stamp = oddsData.lastUpdateTime || formatCapturedAt(oddsData.importedAt) || "等待刷新";
    const source = oddsData.isCloudSnapshot ? "Cloudflare D1 云端数据" : oddsData.isLiveSnapshot ? "体彩官方实时接口" : "本地静态兜底";
    const resultStamp = formatCapturedAt(resultsData.importedAt);
    const resultSource = resultsData.isCloudSnapshot
      ? "Cloudflare D1 云端赛果"
      : resultsData.isStaticFallback
        ? "本地赛果静态兜底"
        : "体彩官方赛果接口";
    const liveStamp = formatCapturedAt(liveFootballData.importedAt);
    const liveSource = liveFootballData.isCloudSnapshot
      ? "Cloudflare D1 实时比分"
      : liveFootballData.isStaticFallback
        ? "本地实时比分静态兜底"
        : "football-data/APIfootball 实时比分";
    sourceNode.textContent =
      activeSportteryPoolView === "finished"
        ? `数据源：${resultSource} · ${resultStamp || "已有快照"}`
        : activeSportteryPoolView === "live"
          ? `数据源：${source} + ${liveSource} · ${liveStamp || stamp}`
          : `数据源：${source} · ${stamp}`;
  }
  target.innerHTML = grouped.size
    ? [...grouped.entries()]
        .map(
          ([date, groupItems]) => `
            <section class="day-lane">
              <div class="day-lane-head">
                <div>
                  <span>${formatDate(date)}</span>
                  <strong>${groupItems.length} 场${activeSportteryPoolView === "finished" ? "完赛" : activeSportteryPoolView === "live" ? "实时" : "开盘"}</strong>
                </div>
                <em>${groupItems.filter((item) => item.linkedNo).length}/${groupItems.length} 已匹配</em>
              </div>
              <div class="match-grid">${groupItems.map(sportteryPoolCard).join("")}</div>
            </section>
          `
        )
        .join("")
    : !cloudBootstrapAttempted && !oddsData.matches?.length
      ? dataLoadingMarkup("正在同步赛事池", "正在读取 Cloudflare D1 开盘、赛果和实时比分数据。")
    : `<p class='empty'>暂无${activeSportteryPoolView === "finished" ? "今日已完赛" : activeSportteryPoolView === "live" ? "正在比赛中" : "体彩开盘"}赛事</p>`;
}

function formatCapturedAt(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataLoadingMarkup(title = "正在同步云端数据", detail = "正在读取 Cloudflare D1 最新数据，稍后会自动显示。") {
  return `
    <section class="data-loading-panel" aria-live="polite">
      <div>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <strong>${title}</strong>
      <p>${detail}</p>
    </section>
  `;
}

function rerenderOddsSurfaces() {
  applyResultBackfill();
  refreshRuntimeCaseBase();
  renderHome();
  renderToday();
  renderSportteryPool();
  renderSiteLocks();
  renderOddsMap();
  renderSignals();
  renderStats();
  renderReview();
  renderGlobalStats();
  renderOdds();
  const match = window.location.hash.match(/^#match-(.+)$/);
  if (match) renderMatchDetail(match[1]);
  const sportteryMatch = window.location.hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
}

function renderCurrentRouteSurfaces() {
  applyResultBackfill();
  refreshRuntimeCaseBase();
  const hash = window.location.hash || "";
  const match = hash.match(/^#match-(.+)$/);
  if (match) {
    renderMatchDetail(match[1]);
    return;
  }
  const sportteryMatch = hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) {
    renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
    return;
  }
  if (hash === "#model-stats") {
    renderGlobalStats();
    return;
  }
  if (hash === "#sporttery") {
    renderSportteryPool();
    return;
  }
  if (hash === "#locks") {
    renderSiteLocks();
    return;
  }
  if (hash === "#odds-map") {
    renderOddsMap();
    return;
  }
  if (hash === "#worldcup-review") {
    renderReview();
    return;
  }
  if (hash === "#worldcup") {
    renderToday();
    renderSchedule();
    renderPath();
    return;
  }
  if (hash === "#worldcup-knockout") {
    renderKnockout();
    return;
  }
  if (hash === "#model-intro" || hash === "#about") {
    return;
  }
  if (!hash) {
    renderInitialHomeOnly();
    return;
  }
  renderAll();
}

function normalizeSportteryResultPayload(raw, capturedAt = new Date().toISOString()) {
  const days = raw?.value?.matchInfoList || [];
  const results = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => {
      const score = normalizeResultScore(match.sectionsNo999 || "");
      return {
        orderId: String(match.matchNum || ""),
        issue: match.matchNumStr || "",
        no: compactSportteryNo(match.matchNumStr, match.matchNum),
        ticaiDate: day.matchDate || match.businessDate || match.matchDate || "",
        matchDate: match.matchDate || "",
        kickoffTime: String(match.matchTime || "").slice(0, 5),
        league: match.leagueAbbName || match.leagueAllName || "竞彩",
        matchId: String(match.matchId || ""),
        home: match.homeTeamAbbName || match.homeTeamAllName || "",
        away: match.awayTeamAbbName || match.awayTeamAllName || "",
        statusCode: match.matchStatus || "",
        statusName: match.matchStatusName || "",
        halfScore: String(match.sectionsNo1 || "").replace(":", "-"),
        fullScoreRaw: match.sectionsNo999 || "",
        score,
        result: score ? direction(score) : "",
      };
    })
  );
  return {
    source: "中国体育彩票官方赛果接口",
    apiEndpoint: SPORTTERY_RESULTS_API_URL,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: results.length,
    matchDates: days.map((day) => day.matchDate || day.businessDate).filter(Boolean),
    results,
  };
}

async function refreshSportteryLiveData() {
  try {
    const response = await fetch(SPORTTERY_API_URL, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Sporttery API ${response.status}`);
    const raw = await response.json();
    if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API error");
    const nextData = normalizeSportteryPayload(raw);
    if (!nextData.matches.length) return;
    oddsData = nextData;
    window.LIVE_SPORTTERY_ODDS = nextData;
    renderCurrentRouteSurfaces();
  } catch (error) {
    console.warn("体彩官方实时刷新失败，继续使用当前快照。", error);
    const sourceNode = document.querySelector("#sporttery-source");
    if (sourceNode && oddsData.matches?.length) {
      const stamp = oddsData.lastUpdateTime || formatCapturedAt(oddsData.importedAt) || "已有快照";
      sourceNode.textContent = `数据源：当前快照 · ${stamp} · 刷新失败`;
    }
  }
}

async function refreshSportteryResultsData() {
  try {
    const response = await fetch(SPORTTERY_RESULTS_API_URL, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Sporttery results API ${response.status}`);
    const raw = await response.json();
    if (!raw.success) throw new Error(raw.errorMessage || "Sporttery results API error");
    const nextData = normalizeSportteryResultPayload(raw);
    if (!nextData.results.length) return;
    resultsData = nextData;
    window.LIVE_SPORTTERY_RESULTS = nextData;
    renderCurrentRouteSurfaces();
  } catch (error) {
    console.warn("体彩官方赛果刷新失败，继续使用当前赛果快照。", error);
  }
}

async function refreshSportterySpHistoryData(sourceMatches = oddsData.matches || []) {
  const matchesForHistory = sourceMatches.filter((match) => match.matchId).slice(0, 30);
  if (!matchesForHistory.length) return;
  const capturedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    matchesForHistory.map(async (match) => {
      const url = `${SPORTTERY_FIXED_BONUS_API_URL}?clientCode=3001&matchId=${encodeURIComponent(match.matchId)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${match.matchId} ${response.status}`);
      const raw = await response.json();
      if (!raw.success) throw new Error(raw.errorMessage || `${match.matchId} API error`);
      return normalizeSportteryHistory(match, raw.value || {});
    })
  );
  const histories = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);
  if (!histories.length) return;
  spHistoryData = {
    source: "中国体育彩票官方 SP 历史接口",
    apiEndpoint: SPORTTERY_FIXED_BONUS_API_URL,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: histories.length,
    errors: settled
      .map((item, index) => item.status === "rejected"
        ? { matchId: String(matchesForHistory[index]?.matchId || ""), message: item.reason?.message || "unknown" }
        : null)
      .filter(Boolean),
    matches: histories,
  };
  window.LIVE_SPORTTERY_SP_HISTORY = spHistoryData;
  renderCurrentRouteSurfaces();
}

function oddsMapNeedsSpHistoryRefresh() {
  if (!oddsData.matches?.some((match) => match.matchId)) return false;
  if (!spHistoryData.matches?.length) return true;
  return !oddsMapRows().some((row) => !oddsMapScoreForRow(row)?.score);
}

function scheduleSportterySpHistoryRefresh(delay = 400) {
  if (!oddsMapNeedsSpHistoryRefresh()) return;
  runWhenPageIdle(() => refreshSportterySpHistoryData(oddsData.matches || []), delay);
}

function loadScriptOnce(src) {
  if (dynamicScriptPromises.has(src)) return dynamicScriptPromises.get(src);
  if (document.querySelector(`script[data-dynamic-src="${src}"][data-loaded="true"]`)) return Promise.resolve();
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.dataset.dynamicSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      dynamicScriptPromises.delete(src);
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
  dynamicScriptPromises.set(src, promise);
  return promise;
}

function loadFreshScript(src) {
  const resolvedSrc = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolvedSrc;
    script.dataset.freshSrc = src;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

function markStaticFallback(payload, fallbackSource) {
  return {
    ...payload,
    source: `${payload.source || fallbackSource}（静态兜底）`,
    isCloudSnapshot: false,
    isStaticFallback: true,
  };
}

async function loadWorldCupStaticDataFallback({ rerender = false } = {}) {
  if (data.predictions?.length && data.matches?.length) {
    worldCupStaticDataLoaded = true;
    return false;
  }
  if (worldCupStaticDataPending) {
    const changed = await worldCupStaticDataPending;
    if (rerender) renderCurrentRouteSurfaces();
    return changed;
  }
  const currentData = data;
  worldCupStaticDataPending = (async () => {
    await loadScriptOnce("./data.js");
    if (!window.WC_DATA || window.WC_DATA === currentData) return false;
    Object.assign(currentData, window.WC_DATA);
    window.WC_DATA = currentData;
    matches = mergeWorldCupSportteryMatches(currentData.matches || [], oddsData.matches || []);
    currentData.matches = matches;
    predictionMap.clear();
    (currentData.predictions || []).forEach((item) => predictionMap.set(item.no, item));
    worldCupStaticDataLoaded = Boolean(currentData.predictions?.length && currentData.matches?.length);
    return worldCupStaticDataLoaded;
  })();
  try {
    const changed = await worldCupStaticDataPending;
    if (changed && rerender) renderCurrentRouteSurfaces();
    return changed;
  } finally {
    worldCupStaticDataPending = null;
  }
}

async function loadStaticSnapshotFallback({ rerender = false } = {}) {
  await Promise.allSettled(STATIC_SNAPSHOT_FALLBACKS.map(loadScriptOnce));
  let changed = false;
  if (!oddsData.matches?.length && window.LIVE_SPORTTERY_ODDS?.matches?.length) {
    oddsData = markStaticFallback(window.LIVE_SPORTTERY_ODDS, "本地赛事池快照");
    window.LIVE_SPORTTERY_ODDS = oddsData;
    changed = true;
  }
  if (!oddsData.matches?.length && window.OKOOO_ODDS?.matches?.length) {
    oddsData = markStaticFallback(window.OKOOO_ODDS, "本地赔率快照");
    changed = true;
  }
  if (!resultsData.results?.length && window.LIVE_SPORTTERY_RESULTS?.results?.length) {
    resultsData = markStaticFallback(window.LIVE_SPORTTERY_RESULTS, "本地赛果快照");
    window.LIVE_SPORTTERY_RESULTS = resultsData;
    changed = true;
  }
  if (!spHistoryData.matches?.length && window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length) {
    spHistoryData = markStaticFallback(window.LIVE_SPORTTERY_SP_HISTORY, "本地SP历史快照");
    window.LIVE_SPORTTERY_SP_HISTORY = spHistoryData;
    changed = true;
  }
  if (!liveFootballData.matches?.length && window.LIVE_FOOTBALL_SCORES?.matches?.length) {
    liveFootballData = markStaticFallback(window.LIVE_FOOTBALL_SCORES, "本地实时比分快照");
    window.LIVE_FOOTBALL_SCORES = liveFootballData;
    changed = true;
  }
  if (!footballDataContext.matches?.length && window.FOOTBALL_DATA_CONTEXT?.matches?.length) {
    footballDataContext = markStaticFallback(window.FOOTBALL_DATA_CONTEXT, "本地football-data上下文");
    window.FOOTBALL_DATA_CONTEXT = footballDataContext;
    changed = true;
  }
  if (changed && rerender) renderCurrentRouteSurfaces();
  return changed;
}

async function refreshLiveFootballScoresData({ rerender = false } = {}) {
  try {
    await loadFreshScript("/api/live-football-scores.js");
    if (!window.LIVE_FOOTBALL_SCORES?.matches?.length) return false;
    liveFootballData = window.LIVE_FOOTBALL_SCORES;
    if (rerender) renderCurrentRouteSurfaces();
    return true;
  } catch (error) {
    console.warn("实时比分刷新失败，继续使用当前快照。", error);
    return false;
  }
}

function parseCloudJson(text, fallback = null) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function cloudMatchRowsToOddsData(rows = [], capturedAt = new Date().toISOString()) {
  const matchesFromRows = rows
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, null);
      const base = payload?.home && payload?.away
        ? payload
        : {
        orderId: row.match_id || "",
        issue: row.match_code || "",
        no: compactSportteryNo(row.match_code, row.match_id),
        ticaiDate: String(row.kickoff_time || "").slice(0, 10),
        matchDate: String(row.kickoff_time || "").slice(0, 10),
        kickoffTime: String(row.kickoff_time || "").slice(11, 16),
        league: row.league || "竞彩",
        matchId: String(row.match_id || "").replace(/^sporttery-/, ""),
        home: row.home_team || "",
        away: row.away_team || "",
        statusCode: row.status || "",
        score: "",
      };
      const fallback = findOddsRow(oddsData.matches || [], base) || {};
      const kickoffDate = String(row.kickoff_time || "");
      return {
        ...fallback,
        ...base,
        no: base.no || fallback.no || compactSportteryNo(base.issue || row.match_code, base.matchId || row.match_id),
        issue: base.issue || fallback.issue || row.match_code || "",
        ticaiDate: base.ticaiDate || fallback.ticaiDate || kickoffDate.slice(0, 10),
        matchDate: base.matchDate || fallback.matchDate || kickoffDate.slice(0, 10),
        kickoffTime: base.kickoffTime || fallback.kickoffTime || kickoffDate.slice(11, 16),
        matchId: base.matchId || fallback.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
        home: base.home || fallback.home || row.home_team || "",
        away: base.away || fallback.away || row.away_team || "",
      };
    })
    .filter((item) => item.home && item.away);
  return {
    source: "Cloudflare D1 + 中国体育彩票官方接口",
    apiEndpoint: "/api/bootstrap",
    importedAt: capturedAt,
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: matchesFromRows.length,
    lastUpdateTime: capturedAt,
    matchDates: [...new Set(matchesFromRows.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    matches: matchesFromRows.sort(
      (a, b) =>
        String(a.ticaiDate || a.matchDate).localeCompare(String(b.ticaiDate || b.matchDate)) ||
        String(a.issue || a.no).localeCompare(String(b.issue || b.no))
    ),
  };
}

function cloudResultRowsToResultsData(rows = [], matchRows = [], capturedAt = new Date().toISOString()) {
  const matchPayloadById = new Map(
    matchRows.map((row) => [row.match_id, parseCloudJson(row.payload_json, {})])
  );
  const resultsFromRows = rows
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, {});
      const matchPayload = matchPayloadById.get(row.match_id) || {};
      const score = `${row.full_time_home_goals}-${row.full_time_away_goals}`;
      return {
        ...matchPayload,
        ...payload,
        orderId: payload.orderId || matchPayload.orderId || row.match_id,
        issue: payload.issue || matchPayload.issue || "",
        no: payload.no || matchPayload.no || compactSportteryNo(matchPayload.issue, row.match_id),
        ticaiDate: payload.ticaiDate || matchPayload.ticaiDate || String(matchPayload.matchDate || "").slice(0, 10),
        matchDate: payload.matchDate || matchPayload.matchDate || "",
        kickoffTime: payload.kickoffTime || matchPayload.kickoffTime || "",
        league: payload.league || matchPayload.league || "竞彩",
        matchId: payload.matchId || matchPayload.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
        home: payload.home || matchPayload.home || "",
        away: payload.away || matchPayload.away || "",
        score,
        fullScoreRaw: `${row.full_time_home_goals}:${row.full_time_away_goals}`,
        result: direction(score),
      };
    })
    .filter((item) => item.home && item.away && normalizeResultScore(item.score));
  return {
    source: "Cloudflare D1 + 中国体育彩票官方赛果接口",
    apiEndpoint: "/api/bootstrap",
    importedAt: capturedAt,
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: resultsFromRows.length,
    matchDates: [...new Set(resultsFromRows.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    results: resultsFromRows.sort(
      (a, b) =>
        String(a.ticaiDate || a.matchDate).localeCompare(String(b.ticaiDate || b.matchDate)) ||
        String(a.issue || a.no).localeCompare(String(b.issue || b.no))
    ),
  };
}

function applyCloudBootstrapPayload(payload, { rerender = false, cached = false } = {}) {
  if (!payload?.ok) return false;
  window.WC_CLOUD_BOOTSTRAP = payload;
  const capturedAt =
    payload.matches?.[0]?.updated_at ||
    payload.results?.[0]?.reviewed_at ||
    payload.cases?.[0]?.createdAt ||
    new Date().toISOString();
  let changed = false;
  if (payload.matches?.length) {
    oddsData = cloudMatchRowsToOddsData(payload.matches, capturedAt);
    if (cached) oddsData.isCachedSnapshot = true;
    window.LIVE_SPORTTERY_ODDS = oddsData;
    changed = true;
  }
  if (payload.results?.length) {
    resultsData = cloudResultRowsToResultsData(payload.results, payload.matches || [], capturedAt);
    if (cached) resultsData.isCachedSnapshot = true;
    window.LIVE_SPORTTERY_RESULTS = resultsData;
    changed = true;
  }
  if (payload.cases?.length && window.WC_CASE_BASE?.appendCases) {
    if (window.WC_CASE_BASE.appendCases(payload.cases)) {
      runtimeCaseBaseCache = null;
      changed = true;
    }
  }
  if (mergeCloudAutoPredictions(cloudLockRowsToPredictions(payload.locks || []))) {
    changed = true;
  }
  cloudBootstrapLoaded = true;
  if (changed && rerender) renderCurrentRouteSurfaces();
  return changed;
}

function writeCloudBootstrapCache(payload) {
  try {
    const cachePayload = {
      ok: true,
      cachedAt: new Date().toISOString(),
      matches: payload.matches || [],
      locks: payload.locks || [],
      results: payload.results || [],
      cases: [],
      autoPredictions: [],
    };
    localStorage.setItem(CLOUD_BOOTSTRAP_CACHE_KEY, JSON.stringify(cachePayload));
  } catch {}
}

function restoreCloudBootstrapCache() {
  try {
    const raw = localStorage.getItem(CLOUD_BOOTSTRAP_CACHE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    return applyCloudBootstrapPayload(payload, { cached: true });
  } catch {
    return false;
  }
}

async function loadCloudBootstrapData({ rerender = false, includeCases = false } = {}) {
  if (!window.WC_CLOUD_STORE?.bootstrap) return false;
  if (cloudBootstrapPending) {
    const changed = await cloudBootstrapPending;
    if (rerender) renderCurrentRouteSurfaces();
    return changed;
  }
  cloudBootstrapPending = (async () => {
    cloudBootstrapAttempted = true;
    const payload = await window.WC_CLOUD_STORE.bootstrap({ includeCases });
    if (!payload?.ok) return false;
    writeCloudBootstrapCache(payload);
    return applyCloudBootstrapPayload(payload, { rerender, cached: false });
  })();
  try {
    return await cloudBootstrapPending;
  } finally {
    cloudBootstrapPending = null;
  }
}

let cloudCaseBaseLoaded = false;

async function loadCloudCaseBaseData({ rerender = false } = {}) {
  if (cloudCaseBaseLoaded || !window.WC_CLOUD_STORE?.listCases || !window.WC_CASE_BASE?.appendCases) return false;
  const payload = await window.WC_CLOUD_STORE.listCases();
  if (!payload?.ok || !payload.cases?.length) return false;
  cloudCaseBaseLoaded = true;
  const added = window.WC_CASE_BASE.appendCases(payload.cases);
  if (added) {
    runtimeCaseBaseCache = null;
    if (rerender) renderCurrentRouteSurfaces();
  }
  return Boolean(added);
}

async function refreshSportteryCloudData() {
  const loadedCloud = await loadCloudBootstrapData({ rerender: true });
  if (loadedCloud) {
    await refreshLiveFootballScoresData({ rerender: true });
    scheduleSportterySpHistoryRefresh();
    return;
  }
  if (oddsData.isCloudSnapshot || resultsData.isCloudSnapshot || liveFootballData.isCloudSnapshot) {
    await refreshLiveFootballScoresData({ rerender: true });
    renderCurrentRouteSurfaces();
    scheduleSportterySpHistoryRefresh();
    return;
  }
  if (!SPORTTERY_CLOUD_API_URL) {
    await refreshLiveFootballScoresData({ rerender: false });
    await loadStaticSnapshotFallback({ rerender: true });
    renderCurrentRouteSurfaces();
    scheduleSportterySpHistoryRefresh();
    return;
  }
  try {
    const response = await fetch(SPORTTERY_CLOUD_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sporttery cloud API ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Sporttery cloud API error");
    let changed = false;
    if (payload.odds?.matches?.length) {
      oddsData = payload.odds;
      window.LIVE_SPORTTERY_ODDS = payload.odds;
      changed = true;
    }
    if (payload.results?.results?.length) {
      resultsData = payload.results;
      window.LIVE_SPORTTERY_RESULTS = payload.results;
      changed = true;
    }
    if (payload.spHistory?.matches?.length) {
      spHistoryData = payload.spHistory;
      window.LIVE_SPORTTERY_SP_HISTORY = payload.spHistory;
      changed = true;
    }
    if (payload.liveFootball?.matches?.length) {
      liveFootballData = payload.liveFootball;
      window.LIVE_FOOTBALL_SCORES = payload.liveFootball;
      changed = true;
    }
    if (await refreshLiveFootballScoresData({ rerender: false })) changed = true;
    if (changed) {
      const sourceNode = document.querySelector("#sporttery-source");
      if (sourceNode) {
        const stamp =
          payload.updatedAt ||
          payload.odds?.lastUpdateTime ||
          formatCapturedAt(payload.odds?.importedAt || payload.results?.importedAt);
        sourceNode.textContent = `数据源：Cloudflare 云端数据同步 · ${stamp || "最新快照"}`;
      }
      renderCurrentRouteSurfaces();
      scheduleSportterySpHistoryRefresh();
    }
  } catch (error) {
    console.warn("Cloudflare 云端数据刷新失败，尝试使用本地静态兜底。", error);
    await loadStaticSnapshotFallback({ rerender: true });
    scheduleSportterySpHistoryRefresh();
  }
}

function renderSignals() {
  const finished = matches.filter((match) => parseScore(officialScoreForMatch(match)));
  const totalGoals = finished.reduce((sum, match) => sum + parseScore(officialScoreForMatch(match)).total, 0);
  document.querySelector("#signal-finished").textContent = finished.length;
  document.querySelector("#signal-upcoming").textContent = matches.length - finished.length;
  document.querySelector("#signal-predicted").textContent = uniquePredictionCount();
  document.querySelector("#signal-goals").textContent = finished.length ? (totalGoals / finished.length).toFixed(2) : "0.00";
  const heroVersion = document.querySelector("#hero-model-version");
  if (heroVersion) heroVersion.textContent = `当前模型 ${data.currentModelVersion || "V4"}`;
}

function renderToday() {
  if (!worldCupStaticDataLoaded && !matches.length) {
    document.querySelector("#today-count").textContent = "同步中";
    document.querySelector("#today-date").textContent = "正在读取世界杯赛程";
    document.querySelector("#next-label").textContent = "世界杯";
    document.querySelector("#today-grid").innerHTML = dataLoadingMarkup(
      "正在同步世界杯赛程",
      "正在读取完整赛程、赛果和模型锁版数据。"
    );
    return;
  }
  const today = currentSportteryBusinessDate(calendarToday());
  const tomorrow = addDays(today, 1);
  const targetMatches = worldCupMatchFlowMatches(today, tomorrow);
  const fallbackDates = [...new Set([
    ...matches.filter((m) => !parseScore(officialScoreForMatch(m))).map((m) => m.date),
    ...(oddsData.matches || [])
      .filter((item) => /世界杯|world\s*cup/i.test(item.league || item.competition || ""))
      .map((item) => item.ticaiDate || item.matchDate)
      .filter(Boolean),
  ])].sort().slice(0, 2);
  const fallbackMatches = targetMatches.length
    ? targetMatches
    : [
        ...matches.filter((m) => fallbackDates.includes(m.date)),
        ...sportteryWorldCupFlowMatches(new Set(fallbackDates)),
      ];
  document.querySelector("#today-count").textContent = `${fallbackMatches.length} 场`;
  document.querySelector("#today-date").textContent = `${formatDate(today)}-${formatDate(tomorrow)} · 北京时间`;
  document.querySelector("#next-label").textContent = `${formatDate(today)} / ${formatDate(tomorrow)}`;
  document.querySelector("#today-grid").innerHTML = renderMatchLanes(fallbackMatches, { dateGetter: (match) => match.date });
  startMatchFlowTimers();
}

const signalPageCopy = {
  finished: {
    eyebrow: "Finished Matches",
    title: "已完赛场次记录",
    pill: "赛果档案",
    note: "按比赛日期整理所有已产生比分的场次，点击任意卡片可进入单场详情。",
  },
  upcoming: {
    eyebrow: "Future Schedule",
    title: "未开赛未来赛程",
    pill: "待赛列表",
    note: "这里集中展示尚未产生比分的未来场次，方便后续逐场补推演。",
  },
  predicted: {
    eyebrow: "Locked Model",
    title: "已有推演比赛",
    pill: "模型锁版",
    note: "这里集中展示已经有模型推演的比赛，点击卡片可直接进入单场详情。",
  },
};

function signalMatches(type) {
  if (type === "finished") {
    return matches.filter((match) => parseScore(officialScoreForMatch(match)));
  }
  if (type === "upcoming") {
    return matches.filter((match) => !parseScore(officialScoreForMatch(match)));
  }
  if (type === "predicted") {
    return matches.filter((match) => latestPredictionFor(match.no));
  }
  return [];
}

function openSignalPage(type) {
  const body = document.querySelector("#signal-detail-body");
  const copy = signalPageCopy[type];
  if (!body || !copy) return;
  const items = signalMatches(type).slice().sort((a, b) => {
    const dateCompare = ticaiDate(a).localeCompare(ticaiDate(b));
    if (dateCompare !== 0) return dateCompare;
    return Number(a.no) - Number(b.no);
  });
  body.innerHTML = `
    <div class="signal-page-toolbar">
      <button type="button" data-signal-back>← 积分榜</button>
      <span>${copy.pill} · ${items.length} 场</span>
    </div>
    <div class="section-head signal-page-head">
      <div>
        <p class="eyebrow">${copy.eyebrow}</p>
        <h2>${copy.title}</h2>
        <p>${copy.note}</p>
      </div>
      <span class="pill">${items.length} 场</span>
    </div>
    <div class="signal-page-list">
      ${items.length ? renderMatchLanes(items) : "<p class='empty'>暂无场次</p>"}
    </div>
  `;
  activateTab("signal-detail");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showModelNotice(message) {
  let notice = document.querySelector("#model-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "model-notice";
    notice.className = "model-notice";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(modelNoticeTimer);
  modelNoticeTimer = setTimeout(() => notice.classList.remove("show"), 2200);
}

function activateTab(tabName) {
  const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
  const targetPanel = document.querySelector(`#${tabName}`);
  if (!targetPanel) return;
  showDashboard();
  document.body.classList.toggle("is-detail-page", tabName === "match-detail");
  if (tabName !== "match-detail") document.body.classList.remove("sporttery-detail-mode");
  document.body.classList.toggle("sporttery-mode", tabName === "sporttery-pool");
  document.body.classList.toggle("site-locks-mode", tabName === "site-locks");
  document.body.classList.toggle("model-intro-mode", tabName === "model-intro");
  document.body.classList.toggle("model-stats-mode", tabName === "model-stats");
  document.body.classList.toggle("odds-map-mode", tabName === "odds-map");
  document.body.classList.toggle("about-site-mode", tabName === "about-site");
  tabs.forEach((item) => item.classList.remove("active"));
  panels.forEach((item) => item.classList.remove("active-panel"));
  if (targetTab) targetTab.classList.add("active");
  targetPanel.classList.add("active-panel");
  requestAnimationFrame(function(){
    var items = targetPanel.querySelectorAll(".match-card, .model-card, .insight-card, .bar-row, .hist-row, .score-table > div, .home-research-grid > article");
    items.forEach(function(el, i){
      if (i < 20) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = "fadeInUp 0.35s ease " + (i * 0.04) + "s both"; }
    });
  });
}

function openModelForMatch(no) {
  const card = document.querySelector(`#model-card-${no}`);
  if (!card) {
    showModelNotice(`第 ${no} 场等待推演`);
    return;
  }
  activateTab("model");
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("focus-model");
    setTimeout(() => card.classList.remove("focus-model"), 2200);
  });
}

function openReviewForMatch(no) {
  activateTab("review");
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-review-no="${no}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("focus-model");
    setTimeout(() => row.classList.remove("focus-model"), 1800);
  });
}

function reviewMatchButton(match) {
  if (match.sportteryKey) {
    return `
      <button type="button" class="review-match-link" data-review-open-sporttery="${match.sportteryKey}" title="进入体彩推演页">
        ${match.home} vs ${match.away}
      </button>
    `;
  }
  return `
    <button type="button" class="review-match-link" data-review-open-match="${match.no}" title="进入模型推演页">
      ${match.home} vs ${match.away}
    </button>
  `;
}

function renderQuickMatchMode(match, pred, filter, finished, hLabel) {
  const scoreText = officialScoreForMatch(match);
  if (!pred) {
    return `
      <section class="quick-decision-board">
        <article class="quick-main-card">
          <span>当前状态</span>
          <strong>${finished ? "已完赛" : "待锁版"}</strong>
          <p>${finished ? `赛果 ${scoreText}` : "这场还没有模型输出，先保留赛程和盘口信息。"}</p>
        </article>
        <article>
          <span>盘口</span>
          <strong>${hLabel || "暂无"}</strong>
          <p>等待模型推演后再评估证据质量。</p>
        </article>
      </section>
    `;
  }
  const gate = autoDecisionGate(match.no, pred);
  const consistency = marketConsistency(match.no, pred);
  const evidence = modelEvidenceScore(match.no, pred);
  return `
    <section class="quick-decision-board">
      <article class="quick-main-card ${gate.tone}">
        <span>证据质量</span>
        <strong>${gate.level}</strong>
        <p>${gate.action} · ${gate.notes.join(" / ")}</p>
      </article>
      <article>
        <span>最终锁版</span>
        <strong>${pred.pick} / ${handicapPick(pred) || "让球待定"}</strong>
        <p>总进球 ${pred.totalGoalsPick || "暂无"} · 比分 ${pred.mainScore} / ${pred.counterScore}</p>
      </article>
      <article>
        <span>风险状态</span>
        <strong>${consistency.label}</strong>
        <p>${consistency.detail}</p>
      </article>
      <article>
        <span>证据完整度</span>
        <strong>${evidence.score}%</strong>
        <p>${evidence.readyCount}/${evidence.total} 类证据已接入</p>
      </article>
    </section>
    <section class="match-page-section quick-reason-card">
      <span>关键判断</span>
      <p>${displayModelText(pred.keyJudgement || pred.marketGap || pred.script)}</p>
    </section>
    <section class="match-page-section quick-risk-card">
      <span>赛前风险</span>
      <div class="quick-risk-grid">
        <div><b>比赛类型</b><strong>${filter.type}</strong></div>
        <div><b>置信等级</b><strong>${filter.grade}</strong></div>
        <div><b>建议动作</b><strong>${filter.advice}</strong></div>
        <div><b>候选比分</b><strong>${filter.scorePool}</strong></div>
      </div>
    </section>
  `;
}

function compactProjectionValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return displayModelText(value);
}

function projectionScorePick(pred, fallback = "") {
  const scores = [pred?.mainScore || pred?.score1, pred?.counterScore || pred?.score2].filter(Boolean);
  return scores.length ? scores.join(" / ") : fallback || pred?.scorePick || "-";
}

function renderProjectionDecisionDeck(match, pred, filter, options = {}) {
  const gate = options.gate === false ? null : match?.no ? autoDecisionGate(match.no, pred) : null;
  const resolved = resolvedPredictionDecision(pred, { handicapLine: match ? handicapLine(match.no) : "" });
  const scorePick = projectionScorePick(pred, options.scorePick);
  const totalPick = pred?.totalGoalsPick || options.totalPick || "-";
  const handicap = resolved?.handicapPick || handicapPick(pred) || options.handicapPick || "-";
  const issue = options.issue || (match ? ticaiIssue(match) : pred?.issue) || "-";
  const version = pred ? predictionVersionLabel(pred) : "待推演";
  const summary = resolved?.hasConflict
    ? `${resolved.resolution} 最终单选 ${resolved.pick || "-"}；让球 ${handicap}；总进球 ${totalPick}；比分 ${scorePick}`
    : finalDecisionActionText(pred) || `单选 ${pred?.pick || "-"}；让球 ${handicap}；总进球 ${totalPick}；比分 ${scorePick}`;
  const competition = pred
    ? modelDisplayName(pred, match, options.competition || pred?.competitionModel || pred?.competitionType || (match?.group ? `${match.group}组` : ""))
    : options.competition || (match?.group ? `${match.group}组` : "");
  const meta = [
    competition,
    gate ? `证据 ${gate.level} / ${gate.score}` : "",
    filter?.grade ? `置信 ${filter.grade}` : "",
    filter?.advice ? `动作 ${filter.advice}` : "",
  ].filter(Boolean);
  return `
    <section class="match-page-section projection-deck">
      <div class="projection-deck-head">
        <span>完整推演总览</span>
        <strong>${compactProjectionValue(summary)}</strong>
        <em>${meta.join(" · ")}</em>
      </div>
      <div class="projection-deck-grid">
        <article><small>体彩期号</small><b>${issue}</b></article>
        <article><small>模型版本</small><b>${version}</b></article>
        <article><small>单选</small><b>${resolved?.pick || pred?.pick || options.directionPick || "-"}</b></article>
        <article><small>让球</small><b>${handicap}</b></article>
        <article><small>总进球</small><b>${totalPick}</b></article>
        <article><small>比分预测</small><b>${scorePick}</b></article>
      </div>
    </section>
  `;
}

function renderProjectionFlowGrid(pred, filter, options = {}) {
  const scorePick = projectionScorePick(pred, options.scorePick);
  const totalPick = pred?.totalGoalsPick || options.totalPick || "-";
  const cards = [
    ["概率底盘", `主胜 ${pred?.homeProb || "-"} ｜ 平 ${pred?.drawProb || "-"} ｜ 客胜 ${pred?.awayProb || "-"} ｜ xG ${pred?.xg || "-"}`, pred?.poisson ? `泊松比分簇：${pred.poisson}` : ""],
    ["盘口偏差", pred?.marketGap || options.marketGap, "赔率预期与比赛脚本是否同向"],
    ["比赛脚本", pred?.script || options.script, "优先看第一球、半场状态和节奏转移"],
    ["赛事权重", pred?.groupSituation || pred?.pathMotive || filter?.favoriteIntent, "积分、出线收益、赛程动机和必要性"],
    ["对位/近况", pred?.recentAnalysis || pred?.styleMatchup || filter?.underdogResistance, "球队状态、风格对位和真实场景"],
    ["让球闸门", pred?.handicapGate || filter?.lineMovement || `让球选择：${handicapPick(pred) || options.handicapPick || "-"}`, "单选与让球盘分开判断"],
    ["总进球/比分", `总进球 ${totalPick}；比分 ${scorePick}`, pred?.scoreElimination || filter?.scoreElimination || "只保留最顺的两个比分峰值"],
    ["风险排除", pred?.noiseFilter || filter?.excludedNoise || filter?.keyFailureRisk, filter?.eventRisk || "用于降级或跳过，不覆盖核心脚本"],
  ].filter(([, value]) => Boolean(value));
  return `
    <section class="match-page-section projection-flow">
      <span>推演链路</span>
      <div class="projection-flow-grid">
        ${cards
          .map(
            ([label, value, note], index) => `
              <article>
                <small>${String(index + 1).padStart(2, "0")} · ${label}</small>
                <p>${compactProjectionValue(value)}</p>
                ${note ? `<em>${compactProjectionValue(note)}</em>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderWorldCupFullProjection(match, pred, filter, odds) {
  if (!pred) {
    return `
      <section class="match-page-section">
        <span>模型状态</span>
        <p>这场还没有赛前锁版记录。</p>
      </section>
    `;
  }
  return `
    ${renderProjectionDecisionDeck(match, pred, filter)}
    ${renderProjectionFlowGrid(pred, filter)}
    ${renderLeagueProfilePanel(match, pred)}
    ${renderDecisionGatePanel(match.no, pred)}
    ${renderSpRadarPanel(match.no, "detail")}
    ${renderModelTriadPanel(match.no, pred)}
    ${renderMarketConsistencyPanel(match.no, pred)}
    ${renderOddsMathPanel(match.no, pred)}
    ${renderTotalGoalsDistribution(match.no, pred)}
    ${renderModelInputChecklist(match.no, pred)}
    ${
      odds
        ? `
          <section class="match-page-section">
            <span>赔率面</span>
            <p>胜 ${odds.normal?.win || "-"} ｜ 平 ${odds.normal?.draw || "-"} ｜ 负 ${odds.normal?.lose || "-"} ｜ 让球 ${odds.handicap || "0"}</p>
          </section>
        `
        : ""
    }
    ${renderUniversalModelPanel(pred)}
    ${renderD1CaseBasePanel(pred, match)}
    ${renderSimilarCasePanel(pred, match)}
    ${renderFinalDecisionGatePanel(pred)}
  `;
}

function renderMatchDetail(no) {
  const content = document.querySelector("#match-detail-body");
  const match = matches.find((item) => item.no === no);
  if (!content || !match) return;
  const pred = latestPredictionFor(no);
  const finished = Boolean(parseScore(officialScoreForMatch(match)));
  const odds = oddsMatch(no);
  const hLabel = pred ? handicapLabel(pred) : handicapLine(no) ? `${match.home}${handicapLine(no)}` : "";
  const filter = pred ? advancedFilter(pred) : null;
  const backLabel =
    matchDetailReturnTarget === "review"
      ? "← 复盘验票台"
      : matchDetailReturnTarget === "locks"
        ? "← 赛事推演锁版"
      : matchDetailReturnTarget === "model-stats"
        ? "← 统计和回测"
      : matchDetailReturnTarget === "knockout"
        ? "← 淘汰赛签表"
        : "← 比赛流";
  content.innerHTML = `
    <div class="match-page-toolbar">
      <button type="button" data-detail-back>${backLabel}</button>
      <span>${match.no} · ${formatDate(ticaiDate(match))} · ${match.group}组</span>
    </div>
    <section class="match-page-hero">
      <div>
        <p class="eyebrow">Match Detail</p>
        <h2>${match.home} vs ${match.away}</h2>
        <p>${pred?.keyJudgement || pred?.marketGap || "这场还没有模型锁版，先保留赛程和盘口入口。"}</p>
      </div>
      <div class="match-page-summary">
        <span>${ticaiIssue(match)}</span>
        <div class="summary-grid">
          <div><small>单选</small><b>${pred ? pred.pick : finished ? "已完赛" : "待锁版"}</b></div>
          <div><small>让球</small><b>${pred ? handicapPick(pred) || "暂无" : hLabel || "暂无"}</b></div>
          <div><small>总进球</small><b>${pred?.totalGoalsPick || "暂无"}</b></div>
          <div><small>比分预测</small><b>${pred ? `${pred.mainScore} / ${pred.counterScore}` : "待推演"}</b></div>
        </div>
      </div>
    </section>
    <div class="match-mode-switch" role="tablist" aria-label="单场详情模式">
      <button type="button" class="active" data-match-mode="quick">快速判断</button>
      <button type="button" data-match-mode="full">完整推演</button>
    </div>
    <div class="match-mode-panel active" data-match-mode-panel="quick">
      ${renderQuickMatchMode(match, pred, filter, finished, hLabel)}
    </div>
    <div class="match-mode-panel" data-match-mode-panel="full" hidden>
      ${renderWorldCupFullProjection(match, pred, filter, odds)}
    </div>
    <div class="match-page-actions">
      <button type="button" data-detail-model="${match.no}">锁版室</button>
      <button type="button" class="secondary" data-detail-review="${match.no}">复盘验票台</button>
    </div>
  `;
  activateTab("match-detail");
  if (pred) refreshD1CaseBasePanel(pred, match);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMatchPage(no, returnTarget = "today") {
  matchDetailReturnTarget = returnTarget;
  if (window.location.hash !== `#match-${no}`) {
    window.location.hash = `match-${no}`;
  }
  renderMatchDetail(no);
}

function oddsPairList(label, odds = {}) {
  odds = odds || {};
  const rows = [
    ["胜", odds.win],
    ["平", odds.draw],
    ["负", odds.lose],
  ].filter(([, value]) => value);
  if (!rows.length) return "";
  return `
    <section class="match-page-section">
      <span>${label}</span>
      <div class="sporttery-detail-odds">
        ${rows.map(([name, value]) => `<article><small>${name}</small><strong>${value}</strong></article>`).join("")}
      </div>
    </section>
  `;
}

function sportteryDetailRow(item = {}) {
  const result = resultForSportteryItem(item);
  const liveScore = liveScoreForSportteryItem(item);
  const itemFinalScore = sportteryResultIsFinished(item) ? normalizeResultScore(item.score) : "";
  const resultFinalScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  const usableItemScore = sportteryScoreIsUsable(item) ? normalizeResultScore(item.score) : "";
  const usableResultScore = sportteryScoreIsUsable(result) ? normalizeResultScore(result?.score) : "";
  const resultScore = itemFinalScore || resultFinalScore || usableResultScore || usableItemScore || (liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "");
  const liveScoreText = normalizeResultScore(liveScore?.score);
  const score = resultScore || liveScoreText;
  const linkedMatch = matchFromOddsItem(item) || matchFromResultItem(item);
  const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
  const hasStarted = Number.isFinite(kickoffAt) && Date.now() >= kickoffAt;
  const pendingResult = hasStarted && isPastResultWindow(kickoffAt);
  const liveStatus = liveScoreStatusText(liveScore);
  return {
    ...item,
    linkedNo: linkedMatch?.no || "",
    displayDate: item.ticaiDate || item.matchDate || oddsData.lotterNo || dashboardToday(),
    displayHome: linkedMatch?.home || item.home,
    displayAway: linkedMatch?.away || item.away,
    displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
    score,
    liveScore: liveScoreText,
    liveStatus,
    liveHalfScore: liveScore?.halfScore || result?.halfScore || item.halfScore || "",
    liveSource: liveScore?.source || "",
    result,
    status: resultScore
      ? (itemFinalScore || resultFinalScore ? "已完赛" : "比分待确认")
      : pendingResult
        ? "待回填"
        : (liveScoreText || hasStarted) ? liveStatus || "进行中" : item.statusName || "待赛",
  };
}

function sportteryOddsLeader(odds = {}, labels = [["胜", "win"], ["平", "draw"], ["负", "lose"]]) {
  return labels
    .map(([label, key]) => ({ label, odd: numberOdd(odds?.[key]) }))
    .filter((item) => item.odd)
    .sort((a, b) => a.odd - b.odd)[0] || null;
}

function sportteryResearchSnapshot(item, modelPred) {
  const score = normalizeResultScore(item.score);
  if (modelPred) {
    const modelName = modelDisplayName(modelPred, item, modelPred.competitionModel || modelPred.competitionType || item?.league);
    const actualTotal = parseScore(score)?.total;
    const resolved = resolvedPredictionDecision(modelPred, { handicapLine: item?.handicap || reviewHandicapLine(modelPred) });
    const riskNotes = [
      resolved?.resolution,
      modelPred.decisionConflict,
      modelPred.keyFailureRisk,
      modelPred.eventRisk,
      modelPred.dataQuality,
    ].filter(Boolean);
    return {
      statusLabel: score ? "赛后复盘" : `${modelName}锁版`,
      action: modelPred.advice || "已锁版",
      directionPick: resolved?.pick || modelPred.pick || "-",
      handicapPick: resolved?.handicapPick || handicapPick(modelPred) || "-",
      totalPick: modelPred.totalGoalsPick || "-",
      scorePick: [modelPred.mainScore, modelPred.counterScore].filter(Boolean).join(" / ") || "-",
      riskNotes,
      score,
      actualDirection: direction(score),
      actualHandicap: handicapDirection(score, reviewHandicapLine(modelPred)),
      actualTotal,
      modelPred,
    };
  }
  const normalLeader = sportteryOddsLeader(item.normal);
  const handicapLeader = sportteryOddsLeader(item.handicapOdds, [["让胜", "win"], ["让平", "draw"], ["让负", "lose"]]);
  const totalLow = lowestOddOption(item.totalGoalsOdds || [], "goals");
  const scoreLow = (item.scoreOdds || [])
    .slice(0, 4)
    .map((odd) => String(odd.score || "").replace(":", "-"))
    .filter(Boolean);
  const hasEnough = Boolean(normalLeader || handicapLeader || totalLow || scoreLow.length);
  const actualDirection = direction(score);
  const actualHandicap = handicapDirection(score, item.handicap || "0");
  const actualTotal = parseScore(score)?.total;
  const riskNotes = [];
  if (normalLeader && handicapLeader && !handicapLeader.label.includes(normalLeader.label)) riskNotes.push("胜平负和让球方向不完全一致，需二次过滤");
  if (normalLeader?.odd && normalLeader.odd >= 2.45) riskNotes.push("主方向赔率偏高，单选信号不够硬");
  if (!item.normal) riskNotes.push("缺少胜平负盘口，只能参考让球和比分层");
  if (!item.scoreOdds?.length) riskNotes.push("缺少比分赔率，比分推演暂不完整");

  return {
    statusLabel: score ? "赛后复盘" : "待锁版",
    action: score ? "进入核验" : hasEnough ? "待推演" : "待锁版",
    directionPick: normalLeader ? `${normalLeader.label} ${normalLeader.odd.toFixed(2)}` : "-",
    handicapPick: handicapLeader ? `${handicapLeader.label} ${handicapLeader.odd.toFixed(2)}` : "-",
    totalPick: totalLow ? `${totalLow}球低位` : "-",
    scorePick: scoreLow.length ? scoreLow.join(" / ") : "-",
    riskNotes,
    score,
    actualDirection,
    actualHandicap,
    actualTotal,
  };
}

function sportteryV4Filter(modelPred, research) {
  if (!modelPred) return null;
  return {
    type: modelPred.matchType || modelPred.type || "常规局",
    grade: modelPred.confidence || confidenceGrade(modelPred) || "-",
    advice: modelPred.advice || research?.action || "复核",
    scorePool: [modelPred.mainScore, modelPred.counterScore].filter(Boolean).join(" / ") || research?.scorePick || "-",
    favoriteIntent: modelPred.favoriteIntent || modelPred.groupSituation || "按世界杯V4经验链判断，但联赛/杯赛保留各自版本号；赛事规则层分别解释动机。",
    underdogResistance: modelPred.underdogResistance || modelPred.recentAnalysis || "按弱队低位防守、转换和受让保护判断。",
    institutionFear: modelPred.institutionFear || modelPred.institutionLine || modelPred.marketGap || "等待机构视角补充。",
    excludedNoise: modelPred.excludedNoise || modelPred.noiseFilter || "排除名气、排名和单一赔率低位带来的噪音。",
    lineMovement: modelPred.lineMovement || modelPred.marketGap || "-",
    eventRisk: modelPred.eventRisk || modelPred.keyFailureRisk || "-",
    scoreElimination: modelPred.scoreElimination || "保留模型主比分和反比分，排除与盘口结构冲突的高热比分。",
    keyFailureRisk: modelPred.keyFailureRisk || modelPred.decisionConflict || "-",
    stateTransfer:
      modelPred.stateTransfer ||
      modelPred.knockoutStateTransfer ||
      modelPred.timeStateTransfer ||
      modelPred.halftimeDecision ||
      "赛前需明确90分钟目标、0-0到60分钟后的先变阵方、领先后是否继续追第二球，以及弱队落后后压出还是继续保守。",
    failureMode:
      modelPred.failureMode ||
      modelPred.likelyMissMode ||
      modelPred.keyFailureRisk ||
      "锁版前必须说明最可能错在方向、让球还是总进球，并据此降级或保留反剧本。",
  };
}

function probabilityNumber(value) {
  return parseProbRange(value) || 0;
}

function qualityLevel(value = "") {
  const text = String(value || "").toUpperCase();
  if (text.includes("HIGH") || text.includes("完整")) return "HIGH";
  if (text.includes("LOW") || text.includes("缺") || text.includes("不足")) return "LOW";
  return "MEDIUM";
}

function normalizedFinalAction(pred) {
  return window.WC_LOCK_ENGINE?.finalAction(pred?.advice || confidenceAdvice(confidenceGrade(pred))) || "谨慎";
}

function simpleConsistencyScore(pred = {}) {
  let score = 3;
  if (pred.decisionConflict) score -= 1;
  if (pred.crossMarketConsistency && !/冲突|不一致/.test(pred.crossMarketConsistency)) score += 1;
  if (pred.handicapGate && pred.pick && pred.handicapPick && String(pred.handicapGate).includes(pred.handicapPick)) score += 1;
  return Math.max(1, Math.min(5, score));
}

function matchResultFromScore(match = {}) {
  const score = parseScore(officialScoreForMatch(match));
  if (!score) return null;
  return {
    matchId: String(match.matchId || match.no || ""),
    fullTimeHomeGoals: score.home,
    fullTimeAwayGoals: score.away,
    result1x2: score.home > score.away ? "HOME" : score.home === score.away ? "DRAW" : "AWAY",
    totalGoals: score.total,
    reviewedAt: new Date().toISOString(),
  };
}

function competitionBucketForCase(pred = {}, match = {}) {
  const candidates = [
    match.league,
    match.competition,
    pred.competition,
    pred.competitionModel,
    match.group,
  ].filter(Boolean);
  const normalize = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
      return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(text);
    }
    if (/世界杯/.test(text)) return "世界杯";
    if (/瑞超|Allsvenskan|Sweden/i.test(text)) return "瑞超";
    if (/芬超/.test(text)) return "芬超";
    return text;
  };
  const normalized = candidates.map(normalize).filter(Boolean);
  const generic = new Set(["竞彩", "体彩", "未分类赛事"]);
  const specificNonWorldCup = normalized.find((item) => item !== "世界杯" && !generic.has(item));
  if (specificNonWorldCup) return specificNonWorldCup;
  const worldCup = normalized.find((item) => item === "世界杯");
  if (worldCup) return worldCup;
  const specific = normalized.find((item) => !generic.has(item));
  if (specific) return specific;
  const text = candidates.join(" ");
  if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
    return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(text);
  }
  return text || "未分类赛事";
}

function lockFromPrediction(pred, match = {}) {
  if (!pred || !match || !window.WC_LOCK_ENGINE) return null;
  const gate = autoDecisionGate(match.no, pred);
  const odds = oddsMatch(match);
  const normal = odds?.normal || {};
  const market = odds ? impliedMarket(oddsMarketEntries(odds, "had")) : { entries: [] };
  const marketMap = new Map((market.entries || []).map((item) => [item.code, item.probability]));
  const modelHomeProb = probabilityNumber(pred.homeProb);
  const modelDrawProb = probabilityNumber(pred.drawProb);
  const modelAwayProb = probabilityNumber(pred.awayProb);
  const confidenceScore = gate.score || 0;
  const result = matchResultFromScore(match);
  const lock = window.WC_LOCK_ENGINE.buildLockedPrediction(match, {
    lockId: `${match.no || match.matchId}-${predictionModelVersion(pred)}-${pred.date || match.date}`,
    matchId: String(match.matchId || match.no || ""),
    matchCode: match.no || pred.no || "",
    league: competitionBucketForCase(pred, match),
    kickoffTime: match.matchDate || match.date || pred.date || "",
    lockedAt: pred.lockedAt || `${pred.date || match.date || data.currentDate}T00:00:00+08:00`,
    lockType: "FINAL_LOCK",
    modelHomeProb,
    modelDrawProb,
    modelAwayProb,
    recommendation: pred.pick || "",
    pick: pred.pick || "",
    finalGrade: confidenceGrade(pred),
    finalAction: normalizedFinalAction(pred),
    confidenceScore,
    riskScore: Math.max(0, 100 - confidenceScore),
    consistencyScore: simpleConsistencyScore(pred),
    sportteryHomeSp: normal.win,
    sportteryDrawSp: normal.draw,
    sportteryAwaySp: normal.lose,
    sportteryHomeProb: marketMap.get("H"),
    sportteryDrawProb: marketMap.get("D"),
    sportteryAwayProb: marketMap.get("A"),
    valueHomeGap: marketMap.has("H") ? modelHomeProb - marketMap.get("H") : undefined,
    valueDrawGap: marketMap.has("D") ? modelDrawProb - marketMap.get("D") : undefined,
    valueAwayGap: marketMap.has("A") ? modelAwayProb - marketMap.get("A") : undefined,
    asianHandicap: Number(String(reviewHandicapLine(pred) || "0").replace("+", "")),
    euroHomeOdds: normal.win,
    euroDrawOdds: normal.draw,
    euroAwayOdds: normal.lose,
    euroHomeProb: marketMap.get("H"),
    euroDrawProb: marketMap.get("D"),
    euroAwayProb: marketMap.get("A"),
    dataQuality: qualityLevel(pred.dataQuality),
    reasoningSummary: pred.finalDecisionAction || pred.keyJudgement || pred.marketGap || pred.script || "",
    downgradeReasons: [pred.decisionConflict, pred.keyFailureRisk, pred.eventRisk].filter(Boolean),
    resultStatus: result ? "PENDING" : "PENDING",
  });
  lock.modelVersion = predictionModelVersion(pred) || lock.modelVersion;
  return lock;
}

function reviewedLockCase(pred, match) {
  const lock = lockFromPrediction(pred, match);
  const result = matchResultFromScore(match);
  if (!lock || !result || !window.WC_REVIEW_ENGINE) return { lock, result, review: null, caseItem: null };
  const review = window.WC_REVIEW_ENGINE.evaluateLockedPrediction(lock, result);
  lock.resultStatus = review.hitStatus;
  const caseItem = window.WC_REVIEW_ENGINE.generateCaseFromLock(lock, result, review);
  return { lock, result, review, caseItem };
}

let runtimeCaseBaseCache = null;

function collectReviewedCaseItems() {
  const cases = [];
  const seen = new Set();
  const addCase = (caseItem) => {
    if (!caseItem?.sourceLockId || seen.has(caseItem.sourceLockId)) return;
    seen.add(caseItem.sourceLockId);
    cases.push(caseItem);
  };
  groupedPredictions().forEach(({ match, predictions }) => {
    predictions.forEach((pred) => {
      const { caseItem } = reviewedLockCase(pred, match);
      addCase(caseItem);
    });
  });
  (data.sportteryPredictions || []).forEach((pred) => {
    const item = findSportteryItemForPrediction(pred);
    const detail = item ? sportteryDetailRow(item) : null;
    const match = {
      no: pred.no,
      matchId: pred.matchId || detail?.matchId || pred.no,
      date: pred.date || pred.matchDate,
      matchDate: pred.matchDate || pred.date,
      competition: pred.competition || pred.competitionModel || "体彩",
      group: pred.competition || "体彩",
      home: pred.home,
      away: pred.away,
      score: normalizeResultScore(detail?.score || pred.score),
    };
    const { caseItem } = reviewedLockCase(pred, match);
    addCase(caseItem);
  });
  return cases;
}

function refreshRuntimeCaseBase() {
  const generated = collectReviewedCaseItems();
  if (window.WC_CASE_BASE?.appendCases) {
    window.WC_CASE_BASE.appendCases(generated);
  }
  runtimeCaseBaseCache = window.WC_CASE_BASE?.getAllCases ? window.WC_CASE_BASE.getAllCases().slice() : generated;
  return runtimeCaseBaseCache;
}

function runtimeCaseBase() {
  if (runtimeCaseBaseCache) return runtimeCaseBaseCache;
  return refreshRuntimeCaseBase();
}

let externalHistoricalSamplesLoading = null;
let leagueProfilesLoading = null;
const EXTERNAL_HISTORICAL_SAMPLE_SCRIPTS = [
  "./data/externalHistoricalSamples.js?v=202607032000",
  "./data/externalHistoricalSamplesBig5England.js?v=202607032000",
  "./data/externalHistoricalSamplesBig5Spain.js?v=202607032000",
  "./data/externalHistoricalSamplesBig5Germany.js?v=202607032000",
  "./data/externalHistoricalSamplesBig5Italy.js?v=202607032000",
  "./data/externalHistoricalSamplesBig5France.js?v=202607032000",
];

function ensureExternalHistoricalSamplesLoaded(callback) {
  if (window.WC_EXTERNAL_HISTORICAL_SAMPLES_READY && Array.isArray(window.WC_EXTERNAL_HISTORICAL_SAMPLES)) {
    if (typeof callback === "function") callback();
    return Promise.resolve(true);
  }
  if (!externalHistoricalSamplesLoading) {
    const loadScript = (src) => new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    externalHistoricalSamplesLoading = EXTERNAL_HISTORICAL_SAMPLE_SCRIPTS
      .reduce((promise, src) => promise.then((ok) => (ok ? loadScript(src) : false)), Promise.resolve(true))
      .then((loaded) => {
        window.WC_EXTERNAL_HISTORICAL_SAMPLES_READY = Boolean(loaded && Array.isArray(window.WC_EXTERNAL_HISTORICAL_SAMPLES));
        return window.WC_EXTERNAL_HISTORICAL_SAMPLES_READY;
      });
  }
  return externalHistoricalSamplesLoading.then((loaded) => {
    if (loaded && typeof callback === "function") callback();
    return loaded;
  });
}

function ensureLeagueProfilesLoaded(callback) {
  if (Array.isArray(window.WC_LEAGUE_PROFILES?.profiles)) {
    if (typeof callback === "function") callback();
    return Promise.resolve(true);
  }
  if (!leagueProfilesLoading) {
    leagueProfilesLoading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "./data/leagueProfiles.js?v=202607031810";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return leagueProfilesLoading.then((loaded) => {
    if (loaded && typeof callback === "function") callback();
    return loaded;
  });
}

function leagueProfileCandidates(match = {}, pred = {}) {
  return [
    match.league,
    match.displayGroup,
    match.group,
    match.competition,
    pred.competitionModel,
    pred.competition,
    pred.competitionType,
    pred.eventWeighting,
  ].filter(Boolean);
}

function normalizeLeagueProfileLabel(value) {
  if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
    return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(value);
  }
  return String(value || "").trim();
}

function leagueProfileForMatch(match = {}, pred = {}) {
  const profiles = Array.isArray(window.WC_LEAGUE_PROFILES?.profiles) ? window.WC_LEAGUE_PROFILES.profiles : [];
  if (!profiles.length) return null;
  const byLeague = new Map(profiles.map((profile) => [normalizeLeagueProfileLabel(profile.league), profile]));
  for (const candidate of leagueProfileCandidates(match, pred)) {
    const normalized = normalizeLeagueProfileLabel(candidate);
    if (byLeague.has(normalized)) return byLeague.get(normalized);
  }
  return null;
}

function renderLeagueProfilePanel(match, pred) {
  const ready = Array.isArray(window.WC_LEAGUE_PROFILES?.profiles);
  if (!ready) {
    ensureLeagueProfilesLoaded(() => {
      const hash = window.location.hash || "";
      const currentWorldCup = hash.match(/^#match-(.+)$/);
      const currentSporttery = hash.match(/^#sporttery-match-(.+)$/);
      if (currentWorldCup) renderMatchDetail(currentWorldCup[1]);
      if (currentSporttery) renderSportteryMatchDetail(decodeURIComponent(currentSporttery[1]));
    });
    return `
      <section class="match-page-section similar-case-panel league-profile-panel">
        <span>联赛画像</span>
        <p class="similar-case-summary-text">正在读取联赛画像，模型会先匹配赛事环境再进入 V4 推演。</p>
      </section>
    `;
  }
  const profile = leagueProfileForMatch(match, pred);
  if (!profile) return "";
  const pct = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
  const distText = (rows = [], empty = "等待样本") =>
    rows.length ? rows.map((item) => `${item.label} ${item.count}场/${pct(item.rate)}`).join(" · ") : empty;
  const sourceText = (profile.sourceCounts || []).map((item) => `${item.label} ${item.count}`).join(" / ") || "external-history";
  const seasonText = (profile.seasons || []).slice(0, 4).join(" / ") || "近两年";
  return `
    <section class="match-page-section similar-case-panel league-profile-panel">
      <span>联赛画像</span>
      <div class="similar-case-summary">
        <article><small>匹配联赛</small><strong>${profile.league}</strong></article>
        <article><small>赛果画像</small><strong>${profile.resultSampleQuality || profile.sampleQuality}</strong></article>
        <article><small>可用样本</small><strong>${profile.usableSampleCount} / ${profile.sampleCount}</strong></article>
        <article><small>盘口画像</small><strong>${profile.marketSampleQuality || "DISPLAY"} · ${profile.withOddsCount || 0}场</strong></article>
        <article><small>主 / 平 / 客</small><strong>${pct(profile.homeWinRate)} / ${pct(profile.drawRate)} / ${pct(profile.awayWinRate)}</strong></article>
        <article><small>均球 / BTTS</small><strong>${Number(profile.avgGoals || 0).toFixed(2)} / ${pct(profile.bttsRate)}</strong></article>
      </div>
      <p class="similar-case-summary-text">${displayModelText(profile.modelHint || profile.sampleQualityLabel || "联赛画像已匹配。")}</p>
      <div class="similar-case-distribution">
        <article><small>常见比分</small><strong>${distText(profile.commonScores)}</strong></article>
        <article><small>总进球分布</small><strong>${distText(profile.totalGoalDistribution)}</strong></article>
        <article><small>画像标签</small><strong>${(profile.styleTags || []).join(" / ") || "等待标签"}</strong></article>
      </div>
      <div class="similar-case-practical">
        <article><small>样本年份</small><strong>${seasonText}</strong></article>
        <article><small>样本来源</small><strong>${sourceText}</strong></article>
        <article><small>模型用法</small><strong>${profile.marketSampleQualityLabel || profile.sampleQualityLabel || "只展示，不修正"}</strong></article>
      </div>
    </section>
  `;
}

function caseBaseStatus(pred, match) {
  const { lock, result, review, caseItem } = reviewedLockCase(pred, match);
  return {
    lock,
    review,
    caseItem,
    generated: Boolean(caseItem),
    caseId: caseItem?.caseId || "-",
    reviewText: review?.reviewText || (result ? "等待验票" : "赛果未回填"),
    hitStatus: review?.hitStatus || "PENDING",
  };
}

function d1CasePanelId(pred, match) {
  return `d1-case-${String(match?.matchId || match?.no || pred?.no || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function renderD1Rate(hitRateValue, count) {
  const countText = Number(count || 0);
  if (!countText) return "等待样本";
  return `${(Number(hitRateValue || 0) * 100).toFixed(1)}% · ${countText}场`;
}

function renderD1CaseBaseContent(result) {
  const stats = result?.stats || {};
  const failureReasons = stats.failureReasons || [];
  const advice = result?.downgradeAdvice || {};
  const warningFlags = result?.warningFlags || [];
  return `
    <div class="similar-case-summary d1-case-summary">
      <article><small>相似历史样本数</small><strong>${Number(result?.sampleCount || stats.sampleCount || 0)}场</strong></article>
      <article><small>同联赛同盘口命中率</small><strong>${renderD1Rate(stats.sameLeagueHandicapHitRate, stats.sameLeagueHandicapCount)}</strong></article>
      <article><small>同模型版本命中率</small><strong>${renderD1Rate(stats.sameModelVersionHitRate, stats.sameModelVersionCount)}</strong></article>
      <article><small>是否建议降级</small><strong>${advice.level || (advice.downgrade ? "降级" : "维持")}</strong></article>
    </div>
    <div class="similar-case-practical">
      <article><small>常见失败原因</small><strong>${
        failureReasons.length
          ? failureReasons.map((item) => `${item.label} ${item.count}次`).join(" / ")
          : "暂无失败样本"
      }</strong></article>
      <article><small>样本使用规则</small><strong>${stats.samplePolicyLabel || "只展示不修正"}：${stats.samplePolicyNote || "等待 D1 样本补齐"}</strong></article>
      <article><small>降级说明</small><strong>${advice.reason || "暂无触发降级条件"}</strong></article>
      <article><small>风险提示</small><strong>${warningFlags.length ? warningFlags.join(" / ") : "暂无 D1 风险提示"}</strong></article>
    </div>
    <p class="similar-case-summary-text">${result?.summaryText || "D1 Case Base 已接入，等待样本扩充。"}</p>
  `;
}

function renderD1CaseBasePanel(pred, match) {
  if (!pred || !match) return "";
  return `
    <section class="match-page-section similar-case-panel d1-case-panel" id="${d1CasePanelId(pred, match)}" data-d1-case-panel>
      <span>D1 Case Base 诊断</span>
      <div class="similar-case-summary">
        <article><small>相似历史样本数</small><strong>读取中</strong></article>
        <article><small>同联赛同盘口命中率</small><strong>读取中</strong></article>
        <article><small>同模型版本命中率</small><strong>读取中</strong></article>
        <article><small>是否建议降级</small><strong>读取中</strong></article>
      </div>
      <p class="similar-case-summary-text">正在从 D1 Case Base 读取相似案例。</p>
    </section>
  `;
}

async function refreshD1CaseBasePanel(pred, match) {
  const panel = document.querySelector(`#${d1CasePanelId(pred, match)}`);
  if (!panel || !pred || !match) return;
  const lock = lockFromPrediction(pred, match);
  if (!lock || !window.WC_CLOUD_STORE?.similarCases) {
    panel.innerHTML = `<span>D1 Case Base 诊断</span><p class="similar-case-summary-text">D1 接口暂不可用，本页只显示本地相似样本。</p>`;
    return;
  }
  const result = await window.WC_CLOUD_STORE.similarCases({
    ...lock,
    threshold: 55,
    sampleLimit: 80,
    topLimit: 6,
    modelVersion: predictionModelVersion(pred),
  });
  if (!result?.ok) {
    panel.innerHTML = `<span>D1 Case Base 诊断</span><p class="similar-case-summary-text">D1 暂未返回可用 Case Base：${result?.data?.error || result?.error || "等待云端同步"}</p>`;
    return;
  }
  panel.innerHTML = `<span>D1 Case Base 诊断</span>${renderD1CaseBaseContent(result)}`;
}

async function writePredictionLockToD1(pred, match, button) {
  if (!pred || !match || !window.WC_CLOUD_STORE?.createLock) return;
  const lock = lockFromPrediction(pred, match);
  if (!lock) return;
  const originalText = button?.textContent || "同步D1锁版";
  if (button) {
    button.disabled = true;
    button.textContent = "写入中...";
  }
  try {
    const created = await window.WC_CLOUD_STORE.createLock(lock);
    const duplicate = created?.status === 409 || /already exists/i.test(created?.data?.error || "");
    if (!created?.ok && !duplicate) {
      if (button) button.textContent = "写入失败";
      return;
    }
    const result = matchResultFromScore(match);
    if (!result) {
      if (button) button.textContent = duplicate ? "D1已存在，等待赛果" : "已写入，等待赛果";
      await refreshD1CaseBasePanel(pred, match);
      return;
    }
    if (window.WC_CLOUD_STORE.upsertResult) {
      await window.WC_CLOUD_STORE.upsertResult(result);
    }
    if (window.WC_CLOUD_STORE.runReview) {
      await window.WC_CLOUD_STORE.runReview(lock.lockId);
    }
    const caseResult = window.WC_CLOUD_STORE.generateCase
      ? await window.WC_CLOUD_STORE.generateCase(lock.lockId)
      : null;
    if (button) button.textContent = caseResult?.ok || caseResult?.duplicated ? "已生成Case" : "已写入D1";
    await refreshD1CaseBasePanel(pred, match);
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 2200);
    }
  }
}

function writeWorldCupLockToD1(no, button) {
  const match = matches.find((item) => item.no === no);
  const pred = latestPredictionFor(no);
  return writePredictionLockToD1(pred, match, button);
}

function writeSportteryLockToD1(key, button) {
  const base = findSportteryItemByKey(key);
  if (!base) return null;
  const item = sportteryDetailRow(base);
  const pred = sportteryPredictionForItem(item) || (item.linkedNo ? latestPredictionFor(item.linkedNo) : null);
  return writePredictionLockToD1(pred, item, button);
}

function renderSimilarCasePanel(pred, match) {
  if (!pred || !match || !window.WC_SIMILAR_CASE_ENGINE) return "";
  const lock = lockFromPrediction(pred, match);
  if (!lock) return "";
  const externalReady = Array.isArray(window.WC_EXTERNAL_HISTORICAL_SAMPLES);
  if (!externalReady) {
    ensureExternalHistoricalSamplesLoaded(() => {
      const hash = window.location.hash || "";
      const currentWorldCup = hash.match(/^#match-(.+)$/);
      const currentSporttery = hash.match(/^#sporttery-match-(.+)$/);
      if (currentWorldCup) renderMatchDetail(currentWorldCup[1]);
      if (currentSporttery) renderSportteryMatchDetail(decodeURIComponent(currentSporttery[1]));
    });
  }
  const result = window.WC_SIMILAR_CASE_ENGINE.findSimilarCases(lock, runtimeCaseBase());
  const stats = result.stats || {};
  const pct = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
  const distText = (rows = [], empty = "等待样本") =>
    rows.length
      ? rows.map((item) => `${item.label} ${item.count}场/${pct(item.rate)}`).join(" · ")
      : empty;
  const handicapText = distText(stats.handicapDistribution || [], "等待比分拆分");
  const scoreText = distText(stats.commonScores || [], "等待比分拆分");
  const totalText = distText(stats.totalGoalDistribution || [], "等待样本");
  const topRateLabel = (rows = []) => rows.length ? rows[0].label : "";
  const topTwoRateLabels = (rows = []) => rows.slice(0, 2).map((item) => item.label).filter(Boolean).join(" / ");
  const practicalFields = () => {
    const sampleCount = Number(result.sampleCount || stats.sampleCount || 0);
    const lockedCount = Number(stats.lockedSampleCount || 0);
    const homeRate = Number(stats.homeWinRate || 0);
    const drawRate = Number(stats.drawRate || 0);
    const awayRate = Number(stats.awayWinRate || 0);
    const avgGoals = Number(stats.avgGoals || 0);
    const totalHint = topTwoRateLabels(stats.totalGoalDistribution || []);
    const scoreHint = topTwoRateLabels(stats.commonScores || []);
    const handicapHint = topRateLabel(stats.handicapDistribution || []);
    const directionText = homeRate >= 0.72
      ? "强支持主胜底盘"
      : homeRate + drawRate >= 0.72
        ? "支持主队不败底盘"
        : awayRate >= 0.5
          ? "客胜历史占优，需复核盘口方向"
          : drawRate >= 0.3
            ? "平局权重偏高"
            : "仅作盘口参照";
    const goalText = avgGoals >= 2.8
      ? "进球区间偏开放"
      : avgGoals <= 2.2
        ? "进球区间偏收紧"
        : "进球区间常规";
    const valueLevel = sampleCount >= 30 && lockedCount >= 10
      ? "强"
      : sampleCount >= 15
        ? "中"
        : sampleCount >= 8
          ? "弱"
          : "观察";
    const warnings = [];
    if (sampleCount < 10) warnings.push("匹配样本不足，只作观察");
    if (lockedCount < 30) warnings.push("锁版样本不足，不改模型置信");
    if (handicapHint && lockedCount < 10) warnings.push("让球结论降权");
    if (drawRate >= 0.3) warnings.push("需防平局分支");
    const v3Advice = [
      `胜平负参考：${directionText}`,
      `总进球参考：${totalHint || goalText}`,
      `比分脚本参考：${scoreHint || "等待比分样本"}`,
      `让球参考：${handicapHint || "等待让球样本"}，仍以当前让球线和比赛脚本为准`,
    ].join("；");
    return [
      ["样本结论", `${directionText}，${goalText}`],
      ["可用等级", `${valueLevel} · ${sampleCount}场匹配 / ${lockedCount}场锁版`],
      ["反向提醒", warnings.join("；") || "暂无强反向提醒，仍需结合当前阵容和战意"],
      ["V3参考建议", v3Advice],
    ];
  };
  const oddsText = (item) =>
    [item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp]
      .map((value) => Number(value) ? Number(value).toFixed(2) : "-")
      .join(" / ");
  const marketLowText = (item) => {
    const rows = [
      ["主胜", item.sportteryHomeSp],
      ["平", item.sportteryDrawSp],
      ["客胜", item.sportteryAwaySp],
    ].filter(([, value]) => Number(value));
    if (!rows.length) return item.recommendation || "-";
    const [label, value] = rows.sort((a, b) => Number(a[1]) - Number(b[1]))[0];
    return `${label} ${Number(value).toFixed(2)}`;
  };
  const resultText = (item) => {
    const score = item.score || ([item.actualHomeGoals, item.actualAwayGoals].every((value) => Number.isFinite(Number(value))) ? `${item.actualHomeGoals}-${item.actualAwayGoals}` : "");
    const direction = item.actualResult === "HOME" ? "主胜" : item.actualResult === "AWAY" ? "客胜" : item.actualResult === "DRAW" ? "平" : "-";
    return score ? `${score} · ${direction} · ${item.actualGoals ?? "-"}球` : `${direction} · ${item.actualGoals ?? "-"}球`;
  };
  const handicapLineText = (item) => Number.isFinite(Number(item.asianHandicap)) ? `主队 ${Number(item.asianHandicap) > 0 ? "+" : ""}${item.asianHandicap}` : "-";
  const totalLineText = (item) => Number(item.over25Odds) || Number(item.under25Odds)
    ? `大2.5 ${Number(item.over25Odds) ? Number(item.over25Odds).toFixed(2) : "-"} / 小2.5 ${Number(item.under25Odds) ? Number(item.under25Odds).toFixed(2) : "-"}`
    : "-";
  const hasAnyOddsSample = result.topCases.some((item) =>
    [item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp, item.euroHomeOdds, item.euroDrawOdds, item.euroAwayOdds].some((value) => Number(value))
  );
  const casePanelTitle = hasAnyOddsSample ? "相似盘口历史样本" : "联赛历史分布样本";
  const caseUsageText = hasAnyOddsSample ? "盘口形态 + 赛果分布" : "赛果、比分和总进球分布";
  const caseSummaryText = hasAnyOddsSample
    ? "这里只记录历史相似盘口当时怎么开、低位落在哪里、最后打成什么比分；不按命中或失败评价当前模型。"
    : "这些外部样本目前以赛果为主，用来校验联赛胜平负、比分和总进球分布，不直接推断盘口低位。";
  const referenceHeader = hasAnyOddsSample ? "相似度" : "参考类型";
  const referenceText = (item) => {
    if (item.distributionOnly || !hasAnyOddsSample) return "同赛事分布";
    return item.similarityScore;
  };
  const rows = result.topCases
    .map(
      (item) => `
        <tr>
          <td>${referenceText(item)}</td>
          <td>${item.homeTeam} vs ${item.awayTeam}</td>
          <td>${item.league}</td>
          <td>${oddsText(item)}</td>
          <td>${handicapLineText(item)}</td>
          <td>${marketLowText(item)}</td>
          <td>${totalLineText(item)}</td>
          <td>${resultText(item)}</td>
        </tr>
      `
    )
    .join("") || `<tr><td colspan="8" class="empty-cell">${casePanelTitle}不足，先作为观察项。</td></tr>`;
  return `
    <section class="match-page-section similar-case-panel">
      <span>${casePanelTitle}</span>
      <div class="similar-case-summary">
        <article><small>样本范围</small><strong>${stats.competition || "同赛事"}</strong></article>
        <article><small>使用方式</small><strong>${caseUsageText}</strong></article>
        <article><small>匹配样本</small><strong>${result.sampleCount}</strong></article>
        <article><small>锁版 / 外部</small><strong>${stats.lockedSampleCount || 0} / ${stats.externalSampleCount || 0}</strong></article>
        <article><small>主 / 平 / 客</small><strong>${pct(stats.homeWinRate)} / ${pct(stats.drawRate)} / ${pct(stats.awayWinRate)}</strong></article>
        <article><small>平均进球</small><strong>${Number(stats.avgGoals || 0).toFixed(2)}</strong></article>
      </div>
      <p class="similar-case-summary-text">${caseSummaryText}</p>
      <div class="similar-case-distribution">
        <article><small>总进球分布</small><strong>${totalText}</strong></article>
        <article><small>常见比分</small><strong>${scoreText}</strong></article>
        <article><small>让球赛果分布</small><strong>${handicapText}</strong></article>
      </div>
      <div class="similar-case-practical">
        ${practicalFields().map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("")}
      </div>
      <div class="review-record-wrap compact similar-case-wrap">
        <table class="review-record-table similar-case-table">
          <thead>
            <tr>
              <th>${referenceHeader}</th>
              <th>比赛</th>
              <th>联赛</th>
              <th>当时胜/平/负SP</th>
              <th>当时让球</th>
              <th>市场低位</th>
              <th>大小球</th>
              <th>最终结果</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSportteryEvidenceGate(item, modelPred, research) {
  const leagueProfile = leagueProfileForMatch(item, modelPred);
  const checks = [
    ["锁版结果", Boolean(modelPred?.pick && modelPred?.totalGoalsPick && (modelPred?.mainScore || modelPred?.counterScore))],
    ["体彩当前盘", Boolean(item?.normal || item?.handicapOdds)],
    ["让球盘口", Boolean(item?.handicap || modelPred?.handicapPick || modelPred?.handicap)],
    ["比分赔率", Boolean(item?.scoreOdds?.length || modelPred?.mainScore)],
    ["总进球赔率", Boolean(item?.totalGoalsOdds?.length || modelPred?.totalGoalsPick)],
    ["比赛脚本", Boolean(modelPred?.script)],
    ["半场触发", Boolean(modelPred?.halftimeDecision || modelPred?.halftimeTrigger)],
    ["状态转移", Boolean(modelPred?.stateTransfer || modelPred?.knockoutStateTransfer || modelPred?.timeStateTransfer)],
    ["最终闸门", Boolean(modelPred?.finalDecisionAction || modelPred?.decisionConflict)],
    ["赛果画像", Boolean(leagueProfile?.usableSampleCount >= 30)],
    ["盘口样本", Boolean(leagueProfile?.withOddsCount >= 30)],
  ];
  const ready = checks.filter(([, ok]) => ok).length;
  const score = Math.round((ready / checks.length) * 100);
  const level = score >= 86 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : "D";
  const tone = level === "A" ? "hot" : level === "B" ? "warm" : level === "C" ? "watch" : "cold";
  const action =
    level === "A"
      ? "证据完整，可正常复核"
      : level === "B"
        ? "证据较完整，按联赛模型复核"
        : level === "C"
          ? "证据部分缺失，降低数据可信度"
          : "证据不足，只保留盘口预筛";
  const notes = [
    `模型版本 ${modelPred ? predictionVersionLabel(modelPred) : "未锁版"}`,
    `盘口状态 ${item?.normal || item?.handicapOdds ? "已接入" : "等待数据"}`,
    `建议动作 ${research?.action || "-"}`,
    checks.filter(([, ok]) => !ok).slice(0, 3).map(([label]) => `${label}缺失`).join(" / ") || "核心字段完整",
  ];
  return `
    <section class="match-page-section decision-gate-panel ${tone}">
      <span>证据质量</span>
      <div class="decision-gate-head">
        <strong>${level}</strong>
        <em>${score}</em>
        <b>${action}</b>
      </div>
      <div class="decision-gate-bar"><i style="width:${score}%"></i></div>
      <div class="decision-gate-notes">
        ${notes.map((note) => `<span>${note}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderSportteryV4FullMode(item, modelPred, research, totalGoals, scoreOdds, sourceStamp) {
  if (!modelPred) {
    return `
      <section class="match-page-section sporttery-model-panel">
        <span>模型状态</span>
        <h3>待推演 / 待锁版</h3>
        <p>这场比赛已经可以进入详情页，但还没有写入真实模型锁版记录。当前只展示体彩盘口、联赛画像和数据支持；正式推演完成后，这里会替换为模型真实推演链和锁版结论。</p>
      </section>
      ${renderSportteryEvidenceGate(item, modelPred, research)}
      ${renderLeagueProfilePanel(item, modelPred)}
      ${renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp)}
    `;
  }
  const filter = sportteryV4Filter(modelPred, research);
  return `
    ${renderProjectionDecisionDeck(item, modelPred, filter, {
      gate: false,
      issue: item.issue || item.no || "-",
      competition: item.league || modelPred.competitionModel || modelPred.competitionType || "体彩赛事",
      totalPick: research.totalPick,
      scorePick: research.scorePick,
      handicapPick: research.handicapPick,
      directionPick: research.directionPick,
    })}
    ${renderProjectionFlowGrid(modelPred, filter, {
      totalPick: research.totalPick,
      scorePick: research.scorePick,
      handicapPick: research.handicapPick,
      marketGap: research.marketNote,
      script: research.script,
    })}
    ${renderSportteryEvidenceGate(item, modelPred, research)}
    ${renderLeagueProfilePanel(item, modelPred)}
    ${renderUniversalModelPanel(modelPred)}
    ${renderD1CaseBasePanel(modelPred, item)}
    ${renderSimilarCasePanel(modelPred, item)}
    ${renderFinalDecisionGatePanel(modelPred)}
  `;
}

function renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp) {
  return `
    <details class="match-page-section sporttery-data-panel" open>
      <summary>数据支撑</summary>
      <div class="match-page-columns">
        ${oddsPairList("胜平负", item.normal)}
        ${oddsPairList(`让球胜平负（${item.handicap || "0"}）`, item.handicapOdds)}
      </div>
      <div class="sporttery-data-stack">
        <section>
          <span>总进球赔率</span>
          <div class="sporttery-detail-odds compact">
            ${totalGoals.length ? totalGoals.map((odd) => `<article><small>${odd.goals}球</small><strong>${odd.odds}</strong></article>`).join("") : "<p>暂无总进球数据。</p>"}
          </div>
        </section>
        <section>
          <span>比分低赔候选</span>
          <div class="sporttery-detail-odds compact">
            ${scoreOdds.length ? scoreOdds.slice(0, 8).map((odd) => `<article><small>${odd.score}</small><strong>${odd.odds}</strong></article>`).join("") : "<p>暂无比分赔率。</p>"}
          </div>
        </section>
      </div>
    </details>
    <section class="match-page-section">
      <span>数据说明</span>
      <p>盘口来自体彩官方接口；实时比分来自 APIfootball；赛后仍以体彩官方赛果回填作为复盘口径。最近体彩快照：${sourceStamp || "等待刷新"}。</p>
    </section>
  `;
}

function renderFootballDataLayerPanel(item, modelPred) {
  const context = modelPred?.objectiveDataLayer || footballDataContextForSportteryItem(item);
  if (!context || (!context.stage && !context.stateSummary && !context.regularScore && !context.halfScore)) return "";
  const homeState = context.homeState || {};
  const awayState = context.awayState || {};
  const sourceStamp = formatCapturedAt(context.importedAt || footballDataContext.importedAt);
  return `
    <section class="match-page-section sporttery-data-panel">
      <span>客观数据层</span>
      <div class="match-page-columns">
        <article>
          <small>赛事阶段</small>
          <strong>${context.stage || "-"}${context.group ? ` · ${context.group}` : ""}</strong>
          <p>90分钟 ${context.regularScore || "-"} · 半场 ${context.halfScore || "-"}${context.scoreDuration ? ` · ${context.scoreDuration}` : ""}</p>
        </article>
        <article>
          <small>${item.displayHome || item.home}</small>
          <strong>${Number.isFinite(Number(homeState.rank)) ? `第${homeState.rank}` : "-"} · ${homeState.points ?? "-"}分</strong>
          <p>进${homeState.goalsFor ?? "-"} 失${homeState.goalsAgainst ?? "-"} 净胜${homeState.goalDifference ?? "-"} ${homeState.form ? `· ${homeState.form}` : ""}</p>
        </article>
        <article>
          <small>${item.displayAway || item.away}</small>
          <strong>${Number.isFinite(Number(awayState.rank)) ? `第${awayState.rank}` : "-"} · ${awayState.points ?? "-"}分</strong>
          <p>进${awayState.goalsFor ?? "-"} 失${awayState.goalsAgainst ?? "-"} 净胜${awayState.goalDifference ?? "-"} ${awayState.form ? `· ${awayState.form}` : ""}</p>
        </article>
      </div>
      <p>${displayModelText(context.stateSummary || "football-data 已接入，等待匹配到赛程和球队状态。")}</p>
      <small>来源 football-data.org · ${sourceStamp || "等待同步"} · 赛果口径使用90分钟 regularTime</small>
    </section>
  `;
}

function renderSportteryMatchDetail(key) {
  const content = document.querySelector("#match-detail-body");
  if (!sportteryPoolItemCache.size) cacheSportteryPoolItems(sportteryPoolItems());
  const base = findSportteryItemByKey(key);
  if (!content) return;
  if (!base) {
    const lookupKey = sportteryLookupKeyFromHash(key);
    content.innerHTML = `
      <div class="match-page-toolbar">
        <button type="button" data-detail-back>← 赛事池</button>
        <span>体彩详情</span>
      </div>
      <section class="match-page-section sporttery-model-panel">
        <span>模型状态</span>
        <h3>待推演 / 待锁版</h3>
        <p>这场比赛已进入详情页，但当前快照没有找到完整原始行。后续数据刷新或模型锁版写入后，会在这里展示盘口、联赛画像和真实推演记录。</p>
        <p>当前识别键：${lookupKey || "-"}</p>
      </section>
      <div class="match-page-actions">
        <button type="button" class="secondary" data-detail-back>返回赛事池</button>
      </div>
    `;
    activateTab("match-detail");
    document.body.classList.add("sporttery-detail-mode");
    return;
  }
  const item = sportteryDetailRow(base);
  const modelPred = sportteryPredictionForItem(item) || (item.linkedNo ? latestPredictionFor(item.linkedNo) : null);
  const research = sportteryResearchSnapshot(item, modelPred);
  const backLabel =
    matchDetailReturnTarget === "review"
      ? "← 复盘验票台"
      : matchDetailReturnTarget === "locks"
        ? "← 赛事推演锁版"
      : matchDetailReturnTarget === "model-stats"
        ? "← 统计和回测"
        : "← 赛事池";
  const scoreText = item.score || (item.status === "进行中" ? "LIVE" : "vs");
  const totalGoals = item.totalGoalsOdds || [];
  const scoreOdds = item.scoreOdds || [];
  const sourceStamp = formatCapturedAt(oddsData.importedAt || resultsData.importedAt);
  const modelName = modelPred ? modelDisplayName(modelPred, item, modelPred.competitionModel || modelPred.competitionType || item.league) : "";
  content.innerHTML = `
    <div class="match-page-toolbar">
      <button type="button" data-detail-back>${backLabel}</button>
      <span>${item.issue || item.no || "体彩"} · ${formatDate(item.displayDate)} · ${item.displayGroup}</span>
    </div>
    <section class="match-page-hero sporttery-detail-hero">
      <div>
        <p class="eyebrow">${modelName || "Sporttery Research"}</p>
        <h2>${item.displayHome} vs ${item.displayAway}</h2>
        <p>${modelPred?.keyJudgement || `${item.league || "体彩赛事"} · ${item.kickoffTime || "--:--"} 开赛 · 让球 ${item.handicap || "0"} · ${research.action}`}</p>
      </div>
      <div class="match-page-summary">
        <span>${research.statusLabel}</span>
        <div class="summary-grid">
          <div><small>体彩期号</small><b>${item.issue || item.no || "-"}</b></div>
          <div><small>当前比分</small><b>${scoreText}</b></div>
          <div><small>单选</small><b>${modelPred?.pick || research.directionPick}</b></div>
          <div><small>预测</small><b>${research.scorePick}</b></div>
        </div>
      </div>
    </section>
    <div class="match-mode-switch" role="tablist" aria-label="体彩单场详情模式">
      <button type="button" class="active" data-match-mode="quick">快速判断</button>
      <button type="button" data-match-mode="full">完整推演</button>
    </div>
    <div class="match-mode-panel active" data-match-mode-panel="quick">
      <section class="quick-decision-board sporttery-quick-board">
        <article class="quick-main-card">
          <span>${modelPred ? "锁版结论" : "模型状态"}</span>
          <strong>${modelPred ? research.directionPick : "待锁版"}</strong>
          <p>${modelPred ? `让球 ${research.handicapPick} · 总进球 ${research.totalPick} · 比分 ${research.scorePick}` : `盘口预筛 ${research.directionPick} · 让球 ${research.handicapPick}`}</p>
        </article>
        <article>
          <span>比赛状态</span>
          <strong>${item.status || "待赛"}</strong>
          <p>${item.liveScore ? `实时比分 ${item.liveScore}，${item.liveStatus || "进行中"}` : `当前比分 ${scoreText}`}</p>
        </article>
        <article>
          <span>建议动作</span>
          <strong>${research.action}</strong>
          <p>${modelPred?.advice || "等待模型真实推演后写入锁版记录"}</p>
        </article>
        <article>
          <span>模型版本</span>
          <strong>${modelPred ? predictionVersionLabel(modelPred) : "未锁版"}</strong>
          <p>${modelName || `${item.league || "该赛事"}待锁版，不计入正式模型版本`}</p>
        </article>
      </section>
      <section class="match-page-section sporttery-research-panel">
        <span>${modelPred ? `${modelName}快速判断` : research.score ? "复盘验票" : "待推演"}</span>
        <p>${
          research.score
            ? `实际比分 ${research.score}，赛果 ${research.actualDirection || "-"}，让球结果 ${research.actualHandicap || "-"}，总进球 ${research.actualTotal ?? "-"}。`
            : modelPred
              ? displayModelText(modelPred.finalDecisionAction || modelPred.marketGap || modelPred.script)
              : "这场比赛还没有真实模型推演记录。当前只显示盘口预筛信息，完成推演并锁版后会展示完整模型链路和最终结论。"
        }</p>
      </section>
      <section class="match-page-section sporttery-risk-panel">
        <span>判断风险</span>
        <div class="sporttery-risk-list">
          ${
            research.riskNotes.length
              ? research.riskNotes.map((note) => `<em>${note}</em>`).join("")
              : "<em>盘口结构暂未出现明显冲突，仍需结合临场阵容和赛程动机。</em>"
          }
        </div>
      </section>
      ${renderFootballDataLayerPanel(item, modelPred)}
      ${renderLeagueProfilePanel(item, modelPred)}
      ${renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp)}
    </div>
    <div class="match-mode-panel" data-match-mode-panel="full" hidden>
      ${renderSportteryV4FullMode(item, modelPred, research, totalGoals, scoreOdds, sourceStamp)}
    </div>
    <div class="match-page-actions">
      ${item.linkedNo ? `<button type="button" data-detail-model="${item.linkedNo}">世界杯模型页</button>` : ""}
      ${modelPred && !item.linkedNo ? `<button type="button" data-detail-global-stats>统计和回测</button>` : ""}
      <button type="button" class="secondary" data-detail-back>${backLabel.replace("← ", "返回")}</button>
    </div>
  `;
  activateTab("match-detail");
  document.body.classList.add("sporttery-detail-mode");
  document.querySelectorAll(".home-topbar nav button").forEach((button) => button.classList.remove("active"));
  document.querySelector(".home-topbar [data-sporttery-pool]")?.classList.add("active");
  if (modelPred) refreshD1CaseBasePanel(modelPred, item);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSportteryMatchPage(key, returnTarget = "sporttery") {
  matchDetailReturnTarget = returnTarget;
  const lookupKey = sportteryLookupKeyFromHash(key);
  const hashKey = encodeURIComponent(lookupKey);
  if (window.location.hash !== `#sporttery-match-${hashKey}`) {
    window.location.hash = `sporttery-match-${hashKey}`;
  }
  renderSportteryMatchDetail(lookupKey);
}

function closeMatchPage() {
  if (window.location.hash.startsWith("#match-") || window.location.hash.startsWith("#sporttery-match-")) {
    const hash = matchDetailReturnTarget === "review" ? "#worldcup-review" : matchDetailReturnTarget === "model-stats" ? "#model-stats" : matchDetailReturnTarget === "locks" ? "#locks" : matchDetailReturnTarget === "odds-map" ? "#odds-map" : matchDetailReturnTarget === "sporttery" ? "#sporttery" : matchDetailReturnTarget === "knockout" ? "#worldcup-knockout" : "#worldcup";
    history.pushState("", document.title, `${window.location.pathname}${window.location.search}${hash}`);
  }
  activateTab(matchDetailReturnTarget === "review" ? "review" : matchDetailReturnTarget === "model-stats" ? "model-stats" : matchDetailReturnTarget === "locks" ? "site-locks" : matchDetailReturnTarget === "odds-map" ? "odds-map" : matchDetailReturnTarget === "sporttery" ? "sporttery-pool" : matchDetailReturnTarget === "knockout" ? "knockout" : "today");
}

function handleRouteFromHash() {
  if (!window.location.hash) {
    showHome();
    return;
  }
  const match = window.location.hash.match(/^#match-(.+)$/);
  if (match) {
    showDashboard();
    renderMatchDetail(match[1]);
    return;
  }
  const sportteryMatch = window.location.hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) {
    showDashboard();
    renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
    return;
  }
  if (window.location.hash === "#worldcup") {
    activateTab("path");
  }
  if (window.location.hash === "#worldcup-knockout") {
    activateTab("knockout");
  }
  if (window.location.hash === "#worldcup-review") {
    activateTab("review");
  }
  if (window.location.hash === "#sporttery") {
    activateTab("sporttery-pool");
  }
  if (window.location.hash === "#locks") {
    activateTab("site-locks");
  }
  if (window.location.hash === "#model-intro") {
    activateTab("model-intro");
  }
  if (window.location.hash === "#model-stats") {
    activateTab("model-stats");
  }
  if (window.location.hash === "#odds-map") {
    activateTab("odds-map");
  }
  if (window.location.hash === "#about") {
    activateTab("about-site");
  }
}

function renderSchedule() {
  const filtered = getFilteredMatches();
  document.querySelector("#schedule-list").innerHTML = renderGoalTrendTable(filtered, {
    dateFormatter: (match) => formatDate(ticaiDate(match)),
    issueFormatter: ticaiIssue,
    scoreFormatter: officialScoreForMatch,
  });
  var schFinished = filtered.filter(function(m){ return parseScore(officialScoreForMatch(m)); });
  if (schFinished.length > 0) {
    var goalData = { labels: [], values: [] };
    schFinished.slice().sort(function(a,b){ return a.date.localeCompare(b.date); }).forEach(function(m){
      var p = parseScore(officialScoreForMatch(m));
      if (p) { goalData.labels.push(formatDate(m.date).slice(-5)); goalData.values.push(p.total); }
    });
    renderGoalTrendChart(goalData, "已完成场次进球走势");
  }
  document.querySelector("#schedule-2022-list").innerHTML = renderGoalTrendTable(data.worldCup2022Matches || [], {
    dateFormatter: (match) => formatDate(match.date),
  });
}

function renderGoalTrendTable(sourceMatches, options = {}) {
  const buckets = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
  const rows = sourceMatches
    .map((match) => {
      const scoreText = options.scoreFormatter ? options.scoreFormatter(match) : match.score;
      const parsed = parseScore(scoreText);
      const activeBucket = parsed ? goalBucket(parsed.total) : "";
      const issue = options.issueFormatter ? options.issueFormatter(match) : match.no;
      const date = options.dateFormatter ? options.dateFormatter(match) : formatDate(match.date);
      const bucketCells = buckets
        .map((bucket) => `<td class="bucket-cell ${bucket === activeBucket ? "active-bucket" : ""}">${bucket === activeBucket ? bucket : ""}</td>`)
        .join("");
      return `
        <tr class="${parsed ? "is-finished" : "is-upcoming"}">
          <td>${date}</td>
          <td class="mono">${issue}</td>
          <td class="home-cell">${match.home}</td>
          <td class="score-cell">${scoreText || ""}</td>
          <td class="away-cell">${match.away}</td>
          ${bucketCells}
          <td>${parsed ? parsed.total : ""}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="trend-wrap">
      <table class="trend-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>场次</th>
            <th>主队</th>
            <th>比分</th>
            <th>客队</th>
            ${buckets.map((bucket) => `<th>${bucket}</th>`).join("")}
            <th>总进球</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderStats() {
  const finished = matches.filter((m) => parseScore(officialScoreForMatch(m)));
  const tournamentTotal = data.tournamentTotalMatches || matches.length;
  const buckets = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
  const bucketCounts = Object.fromEntries(buckets.map((bucket) => [bucket, 0]));
  const scoreCounts = new Map();
  let totalGoals = 0;
  let draws = 0;

  finished.forEach((match) => {
    const scoreText = officialScoreForMatch(match);
    const parsed = parseScore(scoreText);
    totalGoals += parsed.total;
    bucketCounts[goalBucket(parsed.total)] += 1;
    const shape = scoreShape(scoreText);
    scoreCounts.set(shape, (scoreCounts.get(shape) || 0) + 1);
    if (parsed.home === parsed.away) draws += 1;
  });

  const drawRate = finished.length ? ((draws / finished.length) * 100).toFixed(1) : "0.0";
  document.querySelector("#sample-size").textContent = `${finished.length} 场 · 场均 ${
    finished.length ? (totalGoals / finished.length).toFixed(2) : "0.00"
  } 球`;
  const currentDraws = document.querySelector("#current-draws");
  if (currentDraws) currentDraws.textContent = `当前平局 ${draws}/${finished.length} · ${drawRate}%`;
  document.querySelector("#current-draws-2").textContent = `当前平局 ${draws}/${finished.length} · ${drawRate}%`;
  const drawRows = [
    { label: "2026当前", draws, matches: finished.length || 0, rate: drawRate, current: true },
    ...data.historicalDrawRates.map((item) => ({
      label: `${item.year}`,
      draws: item.draws,
      matches: item.matches,
      rate: ((item.draws / item.matches) * 100).toFixed(1),
      current: false,
    })),
  ];
  document.querySelector("#draw-rates").innerHTML = `
    <table class="draw-rate-table">
      <thead>
        <tr><th>年份</th><th>平局</th><th>总场次</th><th>平局率</th></tr>
      </thead>
      <tbody>
        ${drawRows
          .map(
            (item) => `
              <tr class="${item.current ? "current-row" : ""}">
                <td>${item.label}</td>
                <td>${item.draws}</td>
                <td>${item.matches}</td>
                <td>${item.rate}%</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  const historicalScoreRows = [...data.historicalScoreFrequencies
    .reduce((acc, item) => {
      const shape = scoreShape(item.score);
      if (!acc.has(shape)) {
        acc.set(shape, {
          score: shape,
          label: scoreShapeLabel(shape),
          counts: { 2014: 0, 2018: 0, 2022: 0 },
        });
      }
      const row = acc.get(shape);
      [2014, 2018, 2022].forEach((year) => {
        row.counts[year] += item.counts[year] || 0;
      });
      return acc;
    }, new Map())
    .values()];

  document.querySelector("#historical-score-table").innerHTML = `
    <div class="hist-head">
      <span>比分</span>
      <span>2026当前</span>
      <span>2022</span>
      <span>2018</span>
      <span>2014</span>
    </div>
    ${historicalScoreRows
      .map((item) => ({
        ...item,
        currentCount: scoreCounts.get(item.score) || 0,
        historicalTotal: (item.counts[2014] || 0) + (item.counts[2018] || 0) + (item.counts[2022] || 0),
      }))
      .sort((a, b) => b.currentCount - a.currentCount || b.historicalTotal - a.historicalTotal)
      .map((item) => {
        const currentCount = item.currentCount;
        const currentPct = tournamentTotal ? ((currentCount / tournamentTotal) * 100).toFixed(1) : "0.0";
        const cells = [2022, 2018, 2014]
          .map((year) => {
            const count = item.counts[year] || 0;
            const pct = ((count / 64) * 100).toFixed(1);
            return `<span>${count}次 · ${pct}%</span>`;
          })
          .join("");
        return `
          <div class="hist-row">
            <strong>${item.label}</strong>
            <span>${currentCount}次 · ${currentPct}%</span>
            ${cells}
          </div>
        `;
      })
      .join("")}
  `;

  const maxBucket = Math.max(...Object.values(bucketCounts), 1);
  const goalBars = document.querySelector("#goal-bars");
  if (goalBars) {
    goalBars.innerHTML = buckets
      .map((bucket) => {
        const count = bucketCounts[bucket];
        const pct = finished.length ? ((count / finished.length) * 100).toFixed(1) : "0.0";
        return `
          <div class="bar-row">
            <span>${bucket}</span>
            <div class="bar-track"><i style="width:${(count / maxBucket) * 100}%"></i></div>
            <b>${count}</b>
            <em>${pct}%</em>
          </div>
        `;
      })
      .join("");
  }
  renderGoalDistributionChart(bucketCounts, finished.length);
  renderDrawRateChart(drawRows);
  renderScoreFreqChart(scoreCounts, finished.length);

  const scoreRows = [...scoreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  document.querySelector("#score-table").innerHTML =
    scoreRows.length === 0
      ? "<p class='empty'>暂无赛果</p>"
      : scoreRows
          .map(([score, count]) => {
            const pct = ((count / finished.length) * 100).toFixed(1);
            return `<div><strong>${scoreShapeLabel(score)}</strong><span>${count} 次</span><em>${pct}%</em></div>`;
          })
          .join("");
}

const teamStrengthSeeds = {
  巴西: 94,
  法国: 93,
  阿根廷: 92,
  英格兰: 90,
  西班牙: 89,
  葡萄牙: 88,
  德国: 87,
  荷兰: 86,
  比利时: 84,
  哥伦比亚: 82,
  乌拉圭: 81,
  克罗地亚: 80,
  瑞士: 78,
  美国: 77,
  墨西哥: 77,
  摩洛哥: 76,
  塞内加尔: 74,
  日本: 73,
  挪威: 72,
  瑞典: 72,
  土耳其: 71,
  澳大利亚: 69,
  韩国: 69,
  奥地利: 68,
  科特迪瓦: 68,
  厄瓜多尔: 68,
  苏格兰: 67,
  加纳: 66,
  伊朗: 66,
  塞尔维亚: 66,
  捷克: 65,
  埃及: 65,
  突尼斯: 64,
  波黑: 63,
  加拿大: 63,
  巴拉圭: 63,
  南非: 62,
  沙特: 61,
  阿尔及利亚: 61,
  新西兰: 58,
  巴拿马: 57,
  民主刚果: 57,
  乌兹别克斯坦: 56,
  卡塔尔: 55,
  伊拉克: 55,
  约旦: 54,
  佛得角: 53,
  海地: 52,
  库拉索: 50,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pct(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function teamHash(name) {
  return [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function isWorldCupGroupStageMatch(match = {}) {
  return /^[A-L]$/.test(String(match.group || ""));
}

function worldCupGroupStageMatches() {
  return matches.filter(isWorldCupGroupStageMatch);
}

function buildTeamTable() {
  const teamMap = new Map();
  worldCupGroupStageMatches().forEach((match) => {
    [match.home, match.away].forEach((team) => {
      if (!teamMap.has(team)) {
        teamMap.set(team, {
          name: team,
          group: match.group,
          played: 0,
          points: 0,
          gf: 0,
          ga: 0,
        });
      }
    });
    const parsed = parseScore(officialScoreForMatch(match));
    if (!parsed) return;
    const home = teamMap.get(match.home);
    const away = teamMap.get(match.away);
    home.played += 1;
    away.played += 1;
    home.gf += parsed.home;
    home.ga += parsed.away;
    away.gf += parsed.away;
    away.ga += parsed.home;
    if (parsed.home > parsed.away) {
      home.points += 3;
    } else if (parsed.home < parsed.away) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  });

  return [...teamMap.values()].map((team) => {
    const strength = teamStrengthSeeds[team.name] || 56 + (teamHash(team.name) % 16);
    const gd = team.gf - team.ga;
    const remaining = 3 - team.played;
    const momentum = team.points * 7 + gd * 3 + team.gf * 0.8 + remaining * 1.8;
    const power = clamp(strength + momentum, 34, 116);
    const groupAdvance = clamp(18 + (power - 48) * 1.1 + team.points * 6 + gd * 2.2, 6, 96);
    const r32 = clamp(groupAdvance * (0.52 + strength / 220), 4, 86);
    const r16 = clamp(r32 * (0.42 + strength / 250), 2, 72);
    const qf = clamp(r16 * (0.4 + strength / 260), 1, 58);
    const sf = clamp(qf * (0.38 + strength / 280), 0.5, 43);
    const final = clamp(sf * (0.36 + strength / 300), 0.2, 31);
    const title = clamp(final * (0.34 + strength / 320), 0.1, 22);
    return {
      ...team,
      strength,
      gd,
      remaining,
      power,
      groupAdvance,
      r32,
      r16,
      qf,
      sf,
      final,
      title,
    };
  });
}

function pathStage(team) {
  if (team.title >= 10) return "冠军候选";
  if (team.final >= 10) return "决赛圈";
  if (team.sf >= 10) return "四强线";
  if (team.qf >= 12) return "八强线";
  if (team.r16 >= 18) return "淘汰赛线";
  return "小组突围线";
}

function renderPathBars(team) {
  const stages = [
    ["出线", team.groupAdvance],
    ["32强胜", team.r32],
    ["16强", team.r16],
    ["8强", team.qf],
    ["4强", team.sf],
    ["决赛", team.final],
    ["冠军", team.title],
  ];
  return stages
    .map(([label, value]) => `
      <span class="path-mini-stage">
        <i style="height:${Math.max(value, 3)}%"></i>
        <em>${label}</em>
        <b>${pct(value)}</b>
      </span>
    `)
    .join("");
}

function renderPath() {
  const board = document.querySelector("#path-board");
  if (!board) return;
  if (!worldCupStaticDataLoaded && !matches.length) {
    board.innerHTML = dataLoadingMarkup(
      "正在同步世界杯数据",
      "正在读取小组积分、最佳第三线和晋级路径模拟数据。"
    );
    return;
  }
  const teams = buildTeamTable();
  const groupStageMatches = worldCupGroupStageMatches();
  const groupRows = [...teams.reduce((acc, team) => {
    if (!acc.has(team.group)) acc.set(team.group, []);
    acc.get(team.group).push(team);
    return acc;
  }, new Map()).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => [
      group,
      items
        .slice()
        .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)),
    ]);

  const thirdTeams = groupRows
    .map(([group, items]) => ({ ...items[2], group }))
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  const bestThirdNames = new Set(thirdTeams.slice(0, 8).map((team) => `${team.group}-${team.name}`));
  const groupCount = new Set(teams.map((team) => team.group)).size;
  const alreadyPlayed = groupStageMatches.filter((match) => parseScore(officialScoreForMatch(match))).length;
  const finishedGoals = groupStageMatches
    .filter((match) => parseScore(officialScoreForMatch(match)))
    .reduce((sum, match) => sum + parseScore(officialScoreForMatch(match)).total, 0);
  const averageGoals = alreadyPlayed ? (finishedGoals / alreadyPlayed).toFixed(2) : "0.00";
  const pathLeaders = teams
    .slice()
    .sort((a, b) => b.title - a.title || b.final - a.final)
    .slice(0, 8);
  const knockoutBubble = teams
    .slice()
    .sort((a, b) => b.groupAdvance - a.groupAdvance)
    .slice(22, 32);

  const zoneLabel = (rank, team) => {
    if (rank <= 2) return { text: "直接出线", className: "direct" };
    if (rank === 3 && bestThirdNames.has(`${team.group}-${team.name}`)) return { text: "最佳第三", className: "third" };
    if (rank === 3) return { text: "第三待定", className: "watch" };
    return { text: "追分区", className: "chase" };
  };

  const formDots = (team) => {
    const results = groupStageMatches
      .filter((match) => (match.home === team.name || match.away === team.name) && parseScore(officialScoreForMatch(match)))
      .map((match) => {
        const parsed = parseScore(officialScoreForMatch(match));
        const homeSide = match.home === team.name;
        const goalsFor = homeSide ? parsed.home : parsed.away;
        const goalsAgainst = homeSide ? parsed.away : parsed.home;
        if (goalsFor > goalsAgainst) return "W";
        if (goalsFor < goalsAgainst) return "L";
        return "D";
      });
    return results.length
      ? results.map((item) => `<i class="${item.toLowerCase()}">${item}</i>`).join("")
      : "<span>待赛</span>";
  };

  board.innerHTML = `
    <div class="standings-summary">
      <article><span>参赛球队</span><strong>${teams.length}</strong><em>${groupCount} 个小组</em></article>
      <article><span>已完赛</span><strong>${alreadyPlayed}</strong><em>小组赛进程</em></article>
      <article><span>当前场均</span><strong>${averageGoals}</strong><em>总进球 ${finishedGoals}</em></article>
      <article><span>最佳第三线</span><strong>${thirdTeams[7]?.points ?? 0}分</strong><em>第 8 名第三</em></article>
    </div>

    <section class="standings-board">
      <div class="stat-title-line">
        <h3>小组积分榜</h3>
        <span class="mini-pill">积分 / 净胜球 / 进球数排序</span>
      </div>
      <div class="standings-grid">
        ${groupRows
          .map(([group, items]) => `
            <section class="standing-group">
              <div class="standing-group-head">
                <strong>${group}组</strong>
                <span>${items.reduce((sum, team) => sum + team.played, 0) / 2}/6 场</span>
              </div>
              <div class="standing-table">
                <div class="standing-row standing-row-head">
                  <span>排名</span><span>球队</span><span>赛</span><span>胜</span><span>平</span><span>负</span><span>进/失</span><span>净</span><span>分</span><span>走势</span>
                </div>
                ${items
                  .map((team, index) => {
                    const rank = index + 1;
                    const zone = zoneLabel(rank, team);
                    const wins = groupStageMatches.filter((match) => {
                      const parsed = parseScore(officialScoreForMatch(match));
                      if (!parsed) return false;
                      return (match.home === team.name && parsed.home > parsed.away) || (match.away === team.name && parsed.away > parsed.home);
                    }).length;
                    const draws = groupStageMatches.filter((match) => {
                      const parsed = parseScore(officialScoreForMatch(match));
                      return parsed && (match.home === team.name || match.away === team.name) && parsed.home === parsed.away;
                    }).length;
                    const losses = team.played - wins - draws;
                    return `
                      <article class="standing-row ${zone.className}">
                        <span class="standing-rank">${rank}</span>
                        <span class="standing-team"><strong>${team.name}</strong><em>${zone.text}</em></span>
                        <span>${team.played}</span>
                        <span>${wins}</span>
                        <span>${draws}</span>
                        <span>${losses}</span>
                        <span>${team.gf}/${team.ga}</span>
                        <span>${team.gd >= 0 ? "+" : ""}${team.gd}</span>
                        <span class="standing-points">${team.points}</span>
                        <span class="form-dots">${formDots(team)}</span>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `)
          .join("")}
      </div>
    </section>

    <section class="third-race">
      <div class="stat-title-line">
        <h3>最佳第三竞争线</h3>
        <span class="mini-pill">12 进 8</span>
      </div>
      <div class="third-race-grid">
        ${thirdTeams
          .map((team, index) => `
            <article class="third-chip ${index < 8 ? "alive" : "outside"}">
              <span>${index + 1}</span>
              <strong>${team.group}组 ${team.name}</strong>
              <em>${team.points}分 ｜ 净胜${team.gd >= 0 ? "+" : ""}${team.gd}</em>
            </article>
          `)
          .join("")}
      </div>
    </section>

    <section class="path-simulation">
      <div class="stat-title-line">
        <h3>晋级路径模拟</h3>
        <span class="mini-pill">积分 + 强度种子 + 剩余赛程</span>
      </div>
      <div class="path-simulation-grid">
        ${pathLeaders
          .map((team) => `
            <article>
              <span>${team.group}组 ${pathStage(team)}</span>
              <strong>${team.name}</strong>
              <div class="path-stage-bars">${renderPathBars(team)}</div>
            </article>
          `)
          .join("")}
      </div>
      <div class="path-bubble-line">
        <b>32 强边缘线</b>
        ${knockoutBubble
          .map((team) => `<span>${team.group}组 ${team.name} ${pct(team.groupAdvance, 0)}</span>`)
          .join("")}
      </div>
    </section>
  `;
}

const knockoutRoundPlan = [
  { key: "r32", title: "32强赛", note: "16 场", nos: rangeNos(73, 88) },
  { key: "r16", title: "16强赛", note: "8 场", nos: rangeNos(89, 96) },
  { key: "qf", title: "8强赛", note: "4 场", nos: rangeNos(97, 100) },
  { key: "sf", title: "半决赛", note: "2 场", nos: rangeNos(101, 102) },
  { key: "final", title: "决赛", note: "1 场", nos: ["104"] },
];

const knockoutSourceMap = {
  "089": ["073", "076"],
  "090": ["075", "078"],
  "091": ["074", "077"],
  "092": ["079", "080"],
  "093": ["081", "082"],
  "094": ["083", "084"],
  "095": ["085", "086"],
  "096": ["087", "088"],
};

function rangeNos(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(3, "0"));
}

function knockoutMatchByNo(no) {
  const targetNo = normalizedIssueNo(no);
  const staticMatch = matches.find((match) => normalizedIssueNo(match.no) === targetNo);
  if (staticMatch) return staticMatch;
  const sportteryMatch = findOddsRow([...(resultsData.results || []), ...(oddsData.matches || [])], targetNo);
  if (!sportteryMatch || !/世界杯/.test(String(sportteryMatch.league || sportteryMatch.competition || ""))) return null;
  const score = normalizeResultScore(sportteryMatch.score);
  return {
    no: targetNo,
    date: sportteryMatch.matchDate || sportteryMatch.ticaiDate || sportteryMatch.date || "",
    group: "32强",
    home: sportteryMatch.home || "",
    away: sportteryMatch.away || "",
    score,
    matchId: sportteryMatch.matchId || "",
    issue: sportteryMatch.issue || "",
    ticaiDate: sportteryMatch.ticaiDate || "",
    matchDate: sportteryMatch.matchDate || "",
    halfScore: sportteryMatch.halfScore || "",
    winner: sportteryMatch.winner || "",
    winnerSide: sportteryMatch.winnerSide || "",
    penaltyScore: sportteryMatch.penaltyScore || "",
    scoreDuration: sportteryMatch.scoreDuration || "",
  };
}

function knockoutWinner(match) {
  const scoreText = match ? officialScoreForMatch(match) : "";
  const parsed = parseScore(scoreText);
  const odds = match ? oddsMatch(match) : null;
  const liveScore = match ? liveScoreForSportteryItem({ ...match, ...odds }) : null;
  const explicitWinner = match?.winner || liveScore?.winnerZh || "";
  if (!parsed) return explicitWinner;
  if (parsed.home > parsed.away) return match.home;
  if (parsed.home < parsed.away) return match.away;
  if (explicitWinner) return explicitWinner;
  const winnerSide = match?.winnerSide || liveScore?.winnerSide || "";
  if (/HOME/i.test(winnerSide)) return match.home;
  if (/AWAY/i.test(winnerSide)) return match.away;
  return "";
}

function previousKnockoutSources(roundIndex, matchIndex) {
  if (roundIndex <= 0) return [];
  const current = knockoutRoundPlan[roundIndex]?.nos?.[matchIndex];
  if (current && knockoutSourceMap[current]) return knockoutSourceMap[current];
  const previous = knockoutRoundPlan[roundIndex - 1];
  return [previous.nos[matchIndex * 2], previous.nos[matchIndex * 2 + 1]].filter(Boolean);
}

function knockoutParticipant(match, side, sources, sourceIndex) {
  if (match?.[side]) return match[side];
  const sourceNo = sources[sourceIndex];
  const sourceWinner = knockoutWinner(knockoutMatchByNo(sourceNo));
  return sourceWinner || (sourceNo ? `${sourceNo}胜者` : "待定");
}

function knockoutSlot(round, roundIndex, no, matchIndex) {
  const match = knockoutMatchByNo(no);
  const sources = previousKnockoutSources(roundIndex, matchIndex);
  const home = knockoutParticipant(match, "home", sources, 0);
  const away = knockoutParticipant(match, "away", sources, 1);
  const scoreText = match ? officialScoreForMatch(match) : "";
  const parsed = parseScore(scoreText);
  const winner = knockoutWinner(match);
  const liveScore = match ? liveScoreForSportteryItem({ ...match, ...oddsMatch(match) }) : null;
  const penaltyScore = match?.penaltyScore || liveScore?.penaltyScore || "";
  const duration = match?.scoreDuration || liveScore?.scoreDuration || "";
  const status = parsed
    ? (winner
        ? (penaltyScore || /PENALTY/i.test(duration) ? `点球胜者 ${winner}` : `已产生胜者 ${winner}`)
        : "加时/点球待补")
    : match ? "待赛" : "待定";
  const date = match?.date ? formatDate(match.date) : "时间待定";
  return {
    no,
    roundKey: round.key,
    roundTitle: round.title,
    match,
    home,
    away,
    score: scoreText || "",
    winner,
    status,
    date,
    penaltyScore,
    scoreDuration: duration,
    sources,
  };
}

function renderKnockoutTeam(name, winner) {
  const isPlaceholder = !name || name === "待定";
  const flag = !isPlaceholder && teamFlags[name] ? `<em>${teamFlags[name]}</em>` : "";
  return `
    <span class="knockout-team ${winner && winner === name ? "winner" : ""} ${isPlaceholder ? "pending" : ""}">
      ${flag}<b>${name || "待定"}</b>
    </span>
  `;
}

function renderKnockoutCard(slot, index) {
  const actionable = Boolean(slot.match);
  const sourceText = slot.sources.length ? slot.sources.map((item) => `${item}胜者`).join(" / ") : "";
  return `
    <article class="knockout-card ${slot.winner ? "finished" : ""} ${actionable ? "actionable" : "pending"}"
      ${actionable ? `data-knockout-match="${slot.no}"` : ""}
      style="--slot-index:${index}">
      <div class="knockout-card-meta">
        <span>${slot.no}</span>
        <em>${slot.date}</em>
      </div>
      <div class="knockout-card-body">
        ${renderKnockoutTeam(slot.home, slot.winner)}
        <strong>${slot.score || "vs"}</strong>
        ${renderKnockoutTeam(slot.away, slot.winner)}
      </div>
      <div class="knockout-card-foot">
        <span>${slot.status}</span>
        ${slot.penaltyScore ? `<em>点球 ${slot.penaltyScore}</em>` : sourceText ? `<em>${sourceText}</em>` : `<em>${slot.match?.group || slot.roundTitle}</em>`}
      </div>
    </article>
  `;
}

function renderKnockout() {
  const board = document.querySelector("#knockout-board");
  if (!board) return;
  const rounds = knockoutRoundPlan.map((round, roundIndex) => ({
    ...round,
    slots: round.nos.map((no, matchIndex) => knockoutSlot(round, roundIndex, no, matchIndex)),
  }));
  const allSlots = rounds.flatMap((round) => round.slots);
  const finished = allSlots.filter((slot) => slot.winner).length;
  const scheduled = allSlots.filter((slot) => slot.match).length;
  const champion = rounds.at(-1)?.slots[0]?.winner || "待定";
  const nextSlot =
    allSlots.find((slot) => slot.match && !parseScore(officialScoreForMatch(slot.match))) ||
    allSlots.find((slot) => !slot.match);

  board.innerHTML = `
    <section class="knockout-hero-card">
      <div>
        <p class="eyebrow">Road To Final</p>
        <h3>世界杯淘汰赛路径</h3>
        <p>根据已回填赛果自动推进胜者；未产生的对阵、时间和胜者统一以待定展示。</p>
      </div>
      <div class="knockout-hero-stats">
        <article><span>已产生胜者</span><strong>${finished}</strong><em>${scheduled} 场已挂入签表</em></article>
        <article><span>下一节点</span><strong>${nextSlot?.no || "待定"}</strong><em>${nextSlot?.date || "时间待定"}</em></article>
        <article><span>冠军</span><strong>${champion}</strong><em>决赛胜者自动更新</em></article>
      </div>
    </section>
    <section class="knockout-bracket-shell" aria-label="世界杯淘汰赛签表">
      <div class="knockout-bracket">
        ${rounds
          .map((round, roundIndex) => `
            <section class="knockout-round ${round.key}">
              <div class="knockout-round-head">
                <strong>${round.title}</strong>
                <span>${round.note}</span>
              </div>
              <div class="knockout-round-list">
                ${round.slots.map((slot, index) => renderKnockoutCard(slot, roundIndex * 20 + index)).join("")}
              </div>
            </section>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderModel() {
  const versionPill = document.querySelector("#model-current-version");
  if (versionPill) versionPill.textContent = `当前 ${data.currentModelVersion || "V4"}`;
  document.querySelector("#model-list").innerHTML = groupedWorldCupPredictions()
    .map(({ match, predictions }) => {
      const actualScore = match ? officialScoreForMatch(match) : "";
      const actual = actualScore || "未完赛";
      const actualDirection = direction(actualScore);
      const versionBlocks = predictions
        .slice()
        .sort((a, b) => predictionVersionRank(a) - predictionVersionRank(b))
        .map((pred) => {
          const hLabel = handicapLabel(pred);
          const hPick = handicapPick(pred);
          const filter = advancedFilter(pred);
          const hit = actualDirection ? (actualDirection === pred.pick ? "方向中" : "方向未中") : "待验证";
          return `
            <section class="model-version">
              <div class="version-head">
                <strong>${predictionVersionLabel(pred)}</strong>
                <span>${hit}</span>
              </div>
              <div class="model-filter-strip">
                <span>类型 ${filter.type}</span>
                <span>置信 ${filter.grade}</span>
                <span>${filter.advice}</span>
                <span>候选池 ${filter.scorePool}</span>
              </div>
              <div class="prob-grid">
                <span>主胜 ${pred.homeProb}</span>
                <span>平 ${pred.drawProb}</span>
                <span>客胜 ${pred.awayProb}</span>
                <span>xG ${pred.xg}</span>
              </div>
              <p><b>泊松比分簇：</b>${pred.poisson}</p>
              ${pred.groupSituation ? `<p class="model-reason"><b>小组形势：</b>${displayModelText(pred.groupSituation)}</p>` : ""}
              ${pred.recentAnalysis ? `<p class="model-reason"><b>近况与推演思路：</b>${displayModelText(pred.recentAnalysis)}</p>` : ""}
              ${pred.institutionLine ? `<p class="model-reason"><b>机构视角：</b>${displayModelText(pred.institutionLine)}</p>` : ""}
              ${pred.noiseFilter ? `<p class="model-reason"><b>排除因素：</b>${displayModelText(pred.noiseFilter)}</p>` : ""}
              ${pred.keyJudgement ? `<p class="model-reason"><b>关键判断：</b>${displayModelText(pred.keyJudgement)}</p>` : ""}
              <p><b>盘口偏差：</b>${displayModelText(pred.marketGap)}</p>
              <p><b>比赛脚本：</b>${displayModelText(pred.script)}</p>
              ${renderSpRadarPanel(pred.no, "card")}
              <details class="model-filter-detail">
                <summary>八层筛选结果</summary>
                <div>
                  <span><b>比赛类型：</b>${filter.type}</span>
                  <span><b>强队意图：</b>${filter.favoriteIntent}</span>
                  <span><b>弱队抵抗：</b>${filter.underdogResistance}</span>
                  <span><b>总进球前置：</b>${pred.totalGoalsPick || "暂无"}</span>
                  <span><b>两个比分峰值：</b>${pred.mainScore} / ${pred.counterScore}</span>
                  <span><b>机构最怕：</b>${filter.institutionFear}</span>
                  <span><b>排噪状态：</b>${filter.excludedNoise}</span>
                  <span><b>复盘新增：</b>赛后验证比赛类型是否命中</span>
                </div>
              </details>
              ${pred.changeNote ? `<p><b>变化原因：</b>${displayModelText(pred.changeNote)}</p>` : ""}
              <div class="pick-row">
                <strong>单选 ${pred.pick}</strong>
                <span>让球 ${hLabel || "暂无盘口"} ${hPick || "暂无"}</span>
                <span>总进球 ${pred.totalGoalsPick || "暂无"}</span>
                <span>比分预测 ${pred.mainScore} / ${pred.counterScore}</span>
              </div>
              <small>${pred.type} · ${displayModelText(pred.handicap)}</small>
            </section>
          `;
        })
        .join("");
      return `
        <article class="model-card" id="model-card-${match.no}">
          <div class="model-top">
            <div>
              <span class="match-no">${match.no}</span>
              <h3>${match.home} vs ${match.away}</h3>
            </div>
            <span class="result-pill">实际 ${actual}</span>
          </div>
          <div class="model-version-grid">${versionBlocks}</div>
        </article>
      `;
    })
    .join("");
}

function renderSiteLocks() {
  const target = document.querySelector("#site-locks-list");
  if (!target) return;
  const rows = modelAuditRows()
    .slice()
    .sort((a, b) => {
      const dateCompare = String(b.match.date || "").localeCompare(String(a.match.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.match.no || 0) - Number(a.match.no || 0);
    });
  target.innerHTML = rows.length
    ? rows
        .map(({ match, pred, competition, review }) => {
          const keyAttr = match.sportteryKey
            ? `data-lock-sporttery="${match.sportteryKey}"`
            : `data-lock-worldcup="${match.no}"`;
          const caseStatus = caseBaseStatus(pred, match);
          const lock = caseStatus.lock;
          return `
            <article class="site-lock-card" ${keyAttr}>
              <div class="site-lock-head">
                <div>
                  <span>${dash(competition)} · ${dash(pred.issue || match.no)}</span>
                  <h3>${match.home} vs ${match.away}</h3>
                </div>
                <b>${predictionVersionLabel(pred)}</b>
              </div>
              <div class="site-lock-meta">
                <span>${formatDate(pred.date || match.date)}</span>
                <span>${pred.matchType || "待分类"}</span>
                <span>${confidenceGrade(pred)}</span>
                <span>${pred.advice || confidenceAdvice(confidenceGrade(pred))}</span>
                <span>lockedAt ${dash(lock?.lockedAt)}</span>
                <span>${dash(lock?.lockType)}</span>
                <span>finalGrade ${dash(lock?.finalGrade)}</span>
                <span>finalAction ${dash(lock?.finalAction)}</span>
                <span>resultStatus ${dash(caseStatus.hitStatus)}</span>
                <span>Case ${caseStatus.generated ? "已生成" : "未生成"}</span>
              </div>
              <div class="site-lock-picks">
                <strong>胜平负 ${dash(pred.pick)}</strong>
                <span>让球 ${dash(review.hPick)}</span>
                <span>总进球 ${dash(pred.totalGoalsPick)}</span>
                <span>比分 ${dash(pred.mainScore)} / ${dash(pred.counterScore)}</span>
              </div>
              <p>${displayModelText(pred.keyJudgement || pred.marketGap || pred.script || "已锁版，等待复盘。")}</p>
            </article>
          `;
        })
        .join("")
    : !cloudBootstrapAttempted
      ? dataLoadingMarkup("正在同步锁版记录", "正在读取 Cloudflare D1 的 FINAL_LOCK 和 PRE_LOCK 记录。")
    : "<p class='empty'>暂无赛事推演锁版记录</p>";
}

function renderOdds() {
  const target = document.querySelector("#odds-board");
  if (!target) return;
  const dayMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const baseDate = oddsData.lotterNo || dashboardToday();
  const baseDay = new Date(`${baseDate}T00:00:00+08:00`).getDay();

  const issueDate = (issue = "") => {
    const issueDay = dayMap[issue.slice(0, 1)];
    if (issueDay === undefined) return baseDate;
    let diff = issueDay - baseDay;
    if (diff < -3) diff += 7;
    if (diff > 3) diff -= 7;
    return addDays(baseDate, diff);
  };

  const formatShortDate = (date) => {
    const [, month, day] = date.split("-");
    return `${month}-${day}`;
  };

  const formatWeekDate = (date) => {
    const d = new Date(`${date}T00:00:00+08:00`);
    return `${weekNames[d.getDay()]} ${formatShortDate(date)}`;
  };

  const localName = (item, side) => {
    const match = matches.find((m) => m.no === item.no);
    return match?.[side] || item[side] || "";
  };

  const oddsButton = (item, playType, label, value, active = true) => {
    const key = `${item.no}-${playType}-${label}`;
    const selected = oddsSelections.has(key);
    return `
    <button
      type="button"
      class="jczq-odd ${active ? "single" : "disabled"} ${selected ? "selected" : ""}"
      ${active ? "" : "disabled"}
      data-bet-key="${key}"
      data-no="${item.no}"
      data-issue="${item.issue}"
      data-play="${playType}"
      data-pick="${label}"
      data-odds="${value || ""}"
      data-home="${localName(item, "home")}"
      data-away="${localName(item, "away")}"
    >
      <b>${label}</b>
      <em>${value || "-"}</em>
    </button>
  `;
  };

  const oddsRow = (item, odds, handicap, moreLabel, playType, sideAction = "more") => `
    <div class="jczq-betrow">
      <span class="jczq-bubble ${handicap === "0" ? "" : handicap?.startsWith("+") ? "green" : "hot"}">${handicap || "0"}</span>
      ${oddsButton(item, playType, "胜", odds?.win, Boolean(odds))}
      ${oddsButton(item, playType, "平", odds?.draw, Boolean(odds))}
      ${oddsButton(item, playType, "负", odds?.lose, Boolean(odds))}
      <button type="button" class="jczq-more" ${sideAction === "index" ? `data-index="${item.no}"` : `data-more="${item.no}"`}>
        ${moreLabel}
        ${extraSelectionCount(item.no) ? `<i>${extraSelectionCount(item.no)}</i>` : ""}
      </button>
    </div>
  `;

  const allWorldCupOdds = (oddsData.matches || [])
    .filter((item) => item.league === "世界杯")
    .map((item) => ({ ...item, oddsDate: issueDate(item.issue) }))
    .sort((a, b) => a.oddsDate.localeCompare(b.oddsDate) || Number(a.no) - Number(b.no));

  const showEnded = Boolean(document.querySelector("#show-ended-odds")?.checked);
  const activeWorldCupOdds = allWorldCupOdds.filter((item) => item.oddsDate >= baseDate);
  const worldCupOdds = showEnded || !activeWorldCupOdds.length ? allWorldCupOdds : activeWorldCupOdds;
  const grouped = worldCupOdds.reduce((acc, item) => {
    if (!acc.has(item.oddsDate)) acc.set(item.oddsDate, []);
    acc.get(item.oddsDate).push(item);
    return acc;
  }, new Map());

  target.innerHTML = grouped.size
    ? [...grouped.entries()]
        .map(([date, items]) => `
          <section class="jczq-day ${collapsedOddsDates.has(date) ? "collapsed" : ""}">
            <button type="button" class="jczq-daybar" data-date-toggle="${date}">
              <span>${formatWeekDate(date)}　共${items.length}场</span>
              <span>${collapsedOddsDates.has(date) ? "▾" : "▴"}</span>
            </button>
            <div class="jczq-list">
              ${collapsedOddsDates.has(date) ? "" : items
                  .map((item) => {
                    const home = localName(item, "home");
                    const away = localName(item, "away");
                    const handicap = item.handicap || "0";
                    return `
                      <article class="jczq-match">
                        <div class="jczq-left">
                          <span class="jczq-issue">${item.issue}</span>
                          <span class="jczq-league">世界杯</span>
                          <span class="jczq-time">22:00</span>
                          <button type="button" class="jczq-attitude" data-note="${item.no}">▤ 态度</button>
                        </div>
                        <div class="jczq-main">
                          <button type="button" class="jczq-teams" data-history="${item.no}">
                            <strong>${home}</strong>
                            <span>VS</span>
                            <strong>${away}</strong>
                            <i>›</i>
                          </button>
                          ${oddsRow(item, item.normal, "0", "指数", "胜平负", "index")}
                          ${oddsRow(item, item.handicapOdds, handicap, "更多玩法", `让球${handicap}`)}
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
            </div>
          </section>
        `)
        .join("")
    : "<p class='empty'>暂无体彩开盘数据</p>";

  renderOddsSlip();
}

function renderOddsSlip() {
  const slip = document.querySelector("#odds-slip");
  if (!slip) return;
  const selections = [...oddsSelections.values()];
  const selectedMatchCount = new Set(selections.map((item) => item.no)).size;
  slip.innerHTML = selections.length
    ? `
      <strong>已选 ${selectedMatchCount} 场</strong>
      <span>${selections.map((item) => `${item.issue} ${item.play}${item.pick}@${item.odds}`).join(" ｜ ")}</span>
      <button type="button" id="confirm-odds-slip">确定</button>
      <button type="button" id="clear-odds-slip">清空</button>
    `
    : `
      <strong>已选 0 场</strong>
      <span>点选赔率后生成临时方案</span>
    `;
}

function extraSelectionCount(no) {
  return [...oddsSelections.values()].filter((item) => item.no === no && ["比分", "总进球"].includes(item.play)).length;
}

function findOddsItem(no) {
  return (oddsData.matches || []).find((item) => item.no === no);
}

function showJczqSheet(title, bodyHtml) {
  const overlay = document.querySelector("#jczq-overlay");
  const titleNode = document.querySelector("#jczq-sheet-title");
  const body = document.querySelector("#jczq-sheet-body");
  if (!overlay || !titleNode || !body) return;
  titleNode.textContent = title;
  body.innerHTML = bodyHtml;
  overlay.hidden = false;
}

function closeJczqSheet() {
  const overlay = document.querySelector("#jczq-overlay");
  if (overlay) overlay.hidden = true;
}

function renderMoreSheet(no) {
  const item = findOddsItem(no);
  if (!item) return;
  activeSheetMatchNo = no;
  const match = matches.find((m) => m.no === no);
  const home = match?.home || item.home;
  const away = match?.away || item.away;
  const handicap = item.handicap || "0";
  const scoreOptions = (item.scoreOdds || []).map((odd) => ({ label: odd.score, odds: odd.odds }));
  const goalOptions = (item.totalGoalsOdds || []).map((odd) => ({ label: `${odd.goals}球`, odds: odd.odds }));
  showJczqSheet(`${item.issue} ${home} vs ${away}`, `
    <div class="jczq-sheet-tabs">
      <span>胜平负</span>
      <span>让球${handicap}</span>
      <span>比分</span>
      <span>总进球</span>
    </div>
    <div class="jczq-sheet-section">
      <h4>胜平负</h4>
      <div class="jczq-sheet-grid three">
        ${["胜", "平", "负"].map((pick) => oddsSheetButton(item, "胜平负", pick, item.normal?.[pick === "胜" ? "win" : pick === "平" ? "draw" : "lose"])).join("")}
      </div>
    </div>
    <div class="jczq-sheet-section">
      <h4>让球胜平负 ${handicap}</h4>
      <div class="jczq-sheet-grid three">
        ${["胜", "平", "负"].map((pick) => oddsSheetButton(item, `让球${handicap}`, pick, item.handicapOdds?.[pick === "胜" ? "win" : pick === "平" ? "draw" : "lose"])).join("")}
      </div>
    </div>
    <div class="jczq-sheet-section">
      <h4>比分</h4>
      <div class="jczq-sheet-grid score">
        ${scoreOptions.map((odd) => oddsSheetButton(item, "比分", odd.label, odd.odds)).join("")}
      </div>
    </div>
    <div class="jczq-sheet-section">
      <h4>总进球</h4>
      <div class="jczq-sheet-grid four">
        ${goalOptions.map((odd) => oddsSheetButton(item, "总进球", odd.label, odd.odds)).join("")}
      </div>
    </div>
  `);
}

function oddsSheetButton(item, playType, label, odds) {
  const key = `${item.no}-${playType}-${label}`;
  const selected = oddsSelections.has(key);
  return `
    <button
      type="button"
      class="jczq-sheet-option ${selected ? "selected" : ""}"
      ${odds ? "" : "disabled"}
      data-bet-key="${key}"
      data-no="${item.no}"
      data-issue="${item.issue}"
      data-play="${playType}"
      data-pick="${label}"
      data-odds="${odds || ""}"
    >
      <b>${label}</b>
      <em>${odds || "-"}</em>
    </button>
  `;
}

function totalGoalsOptions(pick) {
  if (!pick) return [];
  return String(pick)
    .replace(/球/g, "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
}

function totalGoalsHit(pick, score) {
  const parsed = parseScore(score);
  if (!parsed || !pick) return null;
  const actual = parsed.total >= 7 ? "7+" : String(parsed.total);
  return totalGoalsOptions(pick).includes(actual);
}

function scoreTotal(score) {
  return parseScore(score)?.total ?? null;
}

function scoreTotals(pred) {
  return [scoreTotal(pred?.mainScore), scoreTotal(pred?.counterScore)].filter((item) => item !== null);
}

function matchTypeByTotal(total) {
  if (total === null || total === undefined) return "";
  if (total <= 1) return "闷局";
  if (total <= 3) return "常规局";
  if (total === 4) return "开放局";
  return "打花局";
}

function modelMatchType(pred) {
  if (pred.matchType) return pred.matchType;
  const totals = scoreTotals(pred);
  const maxScoreTotal = totals.length ? Math.max(...totals) : 0;
  const goals = totalGoalsOptions(pred.totalGoalsPick).map((item) => (item === "7+" ? 7 : Number(item))).filter((item) => !Number.isNaN(item));
  const maxGoalPick = goals.length ? Math.max(...goals) : 0;
  const top = Math.max(maxScoreTotal, maxGoalPick);
  return matchTypeByTotal(top || null) || "待判";
}

function actualMatchType(score) {
  const parsed = parseScore(score);
  return parsed ? matchTypeByTotal(parsed.total) : "";
}

function matchTypeHit(pred, score) {
  const actual = actualMatchType(score);
  if (!actual) return null;
  return modelMatchType(pred) === actual;
}

function confidenceGrade(pred) {
  return pred.confidence || "未评级";
}

function confidenceAdvice(grade) {
  return {
    A: "主打",
    "A-": "主打观察",
    B: "可选",
    "B-": "可选观察",
    "C+": "谨慎+",
    C: "谨慎",
    D: "证据不足",
  }[grade] || "旧模型不计入";
}

function confidenceTone(grade) {
  if (["A", "A-"].includes(grade)) return "hot";
  if (["B", "B-"].includes(grade)) return "warm";
  if (["C+", "C"].includes(grade)) return "watch";
  return "cold";
}

function lockedField(value) {
  return value ? displayModelText(value) : "待赛前锁定";
}

function scorePoolForType(type) {
  return {
    闷局: "0-0 / 1-0 / 0-1 / 1-1",
    常规局: "1-0 / 2-0 / 2-1 / 1-1",
    开放局: "3-1 / 2-2 / 3-0 / 1-2",
    打花局: "4-0 / 4-1 / 5-1 / 3-0",
  }[type] || "等待筛选";
}

function advancedFilter(pred) {
  const type = modelMatchType(pred);
  const grade = confidenceGrade(pred);
  const totals = scoreTotals(pred);
  const maxScoreTotal = totals.length ? Math.max(...totals) : 0;
  const favoritePush =
    maxScoreTotal >= 4 || /继续|净胜球|第二球|第三球|打花|穿/.test(`${pred.groupSituation || ""}${pred.script || ""}${pred.keyJudgement || ""}`);
  const underdogReal =
    /低位|拖|守|韧性|防守|一球小胜|只赢/.test(`${pred.script || ""}${pred.marketGap || ""}${pred.noiseFilter || ""}`) &&
    !/打穿|崩|持续性差|体能下降/.test(`${pred.noiseFilter || ""}${pred.keyJudgement || ""}`);
  const institutionFear =
    /让负|不穿|平局|防平|一球|低比分/.test(`${pred.handicap || ""}${pred.marketGap || ""}${pred.institutionLine || ""}`)
      ? "防不穿/防平"
      : /让胜|穿|深盘|打花|净胜球/.test(`${pred.handicap || ""}${pred.marketGap || ""}${pred.institutionLine || ""}`)
        ? "防穿盘/打花"
        : "方向保护";
  const excludedNoise = pred.noiseFilter ? "已排噪" : "待补排噪";
  return {
    type,
    grade,
    advice: confidenceAdvice(grade),
    scorePool: scorePoolForType(type),
    favoriteIntent: favoritePush ? "有追第二/第三球条件" : "胜向优先，追深需谨慎",
    underdogResistance: underdogReal ? "抵抗偏真实" : "抵抗需防结果假象",
    institutionFear,
    excludedNoise,
    lineMovement: lockedField(pred.lineMovement),
    eventRisk: lockedField(pred.eventRisk),
    scoreElimination: lockedField(pred.scoreElimination),
    keyFailureRisk: lockedField(pred.keyFailureRisk),
  };
}

function predictionReviewData(pred, match) {
  const scoreText = match ? officialScoreForMatch(match) : "";
  const actualDirection = direction(scoreText);
  const actualHandicapDirection = handicapDirection(scoreText, reviewHandicapLine(pred));
  const hPick = handicapPick(pred);
  return {
    pred,
    actualDirection,
    actualHandicapDirection,
    hPick,
    directionHit: actualDirection ? pred.pick === actualDirection : null,
    handicapHit: actualHandicapDirection ? hPick === actualHandicapDirection : null,
    totalGoalsHit: totalGoalsHit(pred.totalGoalsPick, scoreText),
    mainHit: scoreText ? pred.mainScore === scoreText : null,
    counterHit: scoreText ? pred.counterScore === scoreText : null,
    scoreHit: scoreText ? pred.mainScore === scoreText || pred.counterScore === scoreText : null,
    matchType: modelMatchType(pred),
    actualMatchType: actualMatchType(scoreText),
    matchTypeHit: matchTypeHit(pred, scoreText),
    confidence: confidenceGrade(pred),
    advice: confidenceAdvice(confidenceGrade(pred)),
  };
}

function predictedGoalAverage(pred) {
  const totals = scoreTotals(pred);
  if (!totals.length) return null;
  return totals.reduce((sum, item) => sum + item, 0) / totals.length;
}

function reviewAttribution(pred, match, review = predictionReviewData(pred, match)) {
  if (!review.actualDirection) {
    return {
      type: "待赛果",
      severity: "pending",
      note: "比赛未结束，暂不归因。",
    };
  }
  const reasons = [];
  const parsed = parseScore(match ? officialScoreForMatch(match) : "");
  const gate = autoDecisionGate(match?.no, pred);
  const consistency = marketConsistency(match?.no, pred);
  const expectedGoals = predictedGoalAverage(pred);

  if (review.directionHit && review.handicapHit && review.totalGoalsHit) {
    reasons.push("核心方向命中");
  } else {
    if (!review.directionHit) reasons.push("方向错");
    if (review.directionHit && !review.handicapHit) reasons.push("赢球幅度错");
    if (!review.totalGoalsHit) reasons.push("进球区间错");
  }
  if (!review.scoreHit) reasons.push("比分峰值偏移");
  if ((consistency.score || 0) < 46 && (!review.directionHit || !review.handicapHit)) reasons.push("盘口冲突未降级");
  if (gate.score < 55 && (!review.directionHit || !review.handicapHit || !review.totalGoalsHit)) reasons.push("证据不足，复盘需降权");
  if (Number.isFinite(expectedGoals) && parsed && Math.abs(parsed.total - expectedGoals) >= 2) reasons.push("比赛节奏偏离");
  if (modelEvidenceScore(match?.no, pred).score < 65 && reasons.some((item) => item.includes("错"))) reasons.push("信息证据不足");

  const unique = [...new Set(reasons)];
  const missCount = [review.directionHit, review.handicapHit, review.totalGoalsHit, review.scoreHit].filter((item) => item === false).length;
  return {
    type: unique[0] || "待归因",
    severity: missCount >= 3 ? "high" : missCount >= 1 ? "mid" : "good",
    note: unique.slice(1, 4).join(" / ") || (missCount ? "需要人工复核比赛进程。" : "本场逻辑可进入正样本。"),
  };
}

function calibrationStats(rows, selector) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = selector(row);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { label: key, total: 0, directionHits: 0, handicapTotal: 0, handicapHits: 0, totalGoalsHits: 0 });
    }
    const item = groups.get(key);
    item.total += 1;
    if (row.directionHit) item.directionHits += 1;
    if (row.actualHandicapDirection) {
      item.handicapTotal += 1;
      if (row.handicapHit) item.handicapHits += 1;
    }
    if (row.totalGoalsHit) item.totalGoalsHits += 1;
  });
  return [...groups.values()].sort((a, b) => b.total - a.total || b.directionHits - a.directionHits);
}

function renderCalibrationPanel(verifiedRows) {
  const confidenceRows = calibrationStats(verifiedRows, (row) => row.confidence || "未评级");
  const typeRows = calibrationStats(verifiedRows, (row) => row.matchType || "待判");
  const gateRows = calibrationStats(verifiedRows, (row) => autoDecisionGate(row.match?.no, row.pred).level);
  const renderGroup = (title, rows) => `
    <article>
      <strong>${title}</strong>
      ${rows
        .slice(0, 5)
        .map(
          (item) => `
            <div>
              <span>${item.label}</span>
              <b>${item.directionHits}/${item.total}</b>
              <em>${hitRate(item.directionHits, item.total)}</em>
            </div>
          `
        )
        .join("") || "<p>等待样本</p>"}
    </article>
  `;
  return `
    <div class="calibration-panel">
      <div class="stat-title-line">
        <h3>模型校准统计</h3>
        <span class="mini-pill">按置信 / 类型 / 证据等级分组</span>
      </div>
      <div class="calibration-grid">
        ${renderGroup("置信等级", confidenceRows)}
        ${renderGroup("比赛类型", typeRows)}
        ${renderGroup("证据等级", gateRows)}
      </div>
    </div>
  `;
}

function hitCell(hit) {
  return `<span class="${hit === null ? "empty-mark" : hit ? "good" : "bad"}">${hit === null ? "-" : hit ? "中" : "未中"}</span>`;
}

function dash(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

function hitRate(hits, total) {
  if (!total) return "0.0%";
  return `${((hits / total) * 100).toFixed(1)}%`;
}

function versionPickCell(pred, match) {
  if (!pred) {
    return `
      <td class="pick-cell">-</td>
      <td>${hitCell(null)}</td>
      <td class="pick-cell">-</td>
      <td>${hitCell(null)}</td>
      <td class="pick-cell">-</td>
      <td>${hitCell(null)}</td>
      <td class="pick-cell">-</td>
      <td>${hitCell(null)}</td>
    `;
  }
  const review = predictionReviewData(pred, match);
  return `
    <td class="pick-cell">${dash(pred.pick)}</td>
    <td>${hitCell(review.directionHit)}</td>
    <td class="pick-cell">${dash(review.hPick)}</td>
    <td>${hitCell(review.handicapHit)}</td>
    <td class="pick-cell">${dash(pred.totalGoalsPick)}</td>
    <td>${hitCell(review.totalGoalsHit)}</td>
    <td class="pick-cell">${dash(pred.mainScore)} / ${dash(pred.counterScore)}</td>
    <td>${hitCell(review.scoreHit)}</td>
  `;
}

function renderReview() {
  const groupedRows = groupedWorldCupPredictions()
    .slice()
    .sort((a, b) => a.match.date.localeCompare(b.match.date) || Number(a.match.no) - Number(b.match.no))
    .map(({ match, predictions }) => {
      const sorted = predictions.slice().sort((a, b) => predictionVersionRank(a) - predictionVersionRank(b));
      const referencePred = sorted[0] || predictions[0];
      const review = predictionReviewData(referencePred, match);
      return { match, pred: referencePred, review };
    });

  const reviewDates = [...new Set(groupedRows.map(({ match }) => match.date))];
  if (activeReviewDate !== "all" && !reviewDates.includes(activeReviewDate)) {
    activeReviewDate = "all";
  }
  const visibleRows =
    activeReviewDate === "all" ? groupedRows : groupedRows.filter(({ match }) => match.date === activeReviewDate);
  const rows = visibleRows.map(({ match, pred, review }) => ({
    ...review,
    pred,
    match,
  }));

  const verifiedRows = rows.filter((row) => row.actualDirection);
  const handicapVerifiedRows = rows.filter((row) => row.actualHandicapDirection);
  const directionHits = verifiedRows.filter((row) => row.directionHit).length;
  const handicapHits = handicapVerifiedRows.filter((row) => row.handicapHit).length;
  const totalGoalsHits = verifiedRows.filter((row) => row.totalGoalsHit).length;
  const scoreCoveredRows = verifiedRows.filter((row) => row.scoreHit).length;
  const matchTypeHits = verifiedRows.filter((row) => row.matchTypeHit).length;
  const adviceRows = verifiedRows.filter((row) => ["A", "A-", "B", "B-"].includes(row.confidence));
  const adviceDirectionHits = adviceRows.filter((row) => row.directionHit).length;
  const gateRows = rows.map((row) => ({ ...row, gate: autoDecisionGate(row.match.no, row.pred) }));
  const mainGateRows = gateRows.filter((row) => row.gate.level === "A");
  const attributionRows = verifiedRows.map((row) => ({ ...row, attribution: reviewAttribution(row.pred, row.match, row) }));
  const missAttributions = attributionRows.filter((row) => row.attribution.severity !== "good");
  const attributionSummary = calibrationStats(attributionRows, (row) => row.attribution.type).slice(0, 4);
  const versionStats = ["V1", "V2", "V3", "V4"]
    .map((version) => {
      const subset = verifiedRows.filter((row) => predictionModelVersion(row.pred) === version);
      if (!subset.length) return null;
      const handicapSubset = subset.filter((row) => row.actualHandicapDirection);
      return {
        version,
        total: subset.length,
        directionHits: subset.filter((row) => row.directionHit).length,
        handicapTotal: handicapSubset.length,
        handicapHits: handicapSubset.filter((row) => row.handicapHit).length,
        totalGoalsHits: subset.filter((row) => row.totalGoalsHit).length,
        scoreHits: subset.filter((row) => row.scoreHit).length,
      };
    })
    .filter(Boolean);
  const reviewRateSummary = [
    `方向 ${directionHits}/${verifiedRows.length || 0}（${hitRate(directionHits, verifiedRows.length)}）`,
    `让球 ${handicapHits}/${handicapVerifiedRows.length || 0}（${hitRate(handicapHits, handicapVerifiedRows.length)}）`,
    `总进球 ${totalGoalsHits}/${verifiedRows.length || 0}（${hitRate(totalGoalsHits, verifiedRows.length)}）`,
    `比分覆盖 ${scoreCoveredRows}/${verifiedRows.length || 0}（${hitRate(scoreCoveredRows, verifiedRows.length)}）`,
    `类型 ${matchTypeHits}/${verifiedRows.length || 0}（${hitRate(matchTypeHits, verifiedRows.length)}）`,
    `A/B方向 ${adviceDirectionHits}/${adviceRows.length || 0}（${hitRate(adviceDirectionHits, adviceRows.length)}）`,
  ];

  document.querySelector("#review-cards").innerHTML = `
    <div class="review-summary-grid">
      <article class="review-metric"><span>已验证版本</span><strong>${verifiedRows.length}</strong><em>已有实际比分</em></article>
      <article class="review-metric"><span>方向命中</span><strong>${directionHits}/${verifiedRows.length || 0}</strong><em>${hitRate(directionHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>让球命中</span><strong>${handicapHits}/${handicapVerifiedRows.length || 0}</strong><em>${hitRate(handicapHits, handicapVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>总进球</span><strong>${totalGoalsHits}/${verifiedRows.length || 0}</strong><em>${hitRate(totalGoalsHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>比分覆盖</span><strong>${scoreCoveredRows}/${verifiedRows.length || 0}</strong><em>${hitRate(scoreCoveredRows, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>类型命中</span><strong>${matchTypeHits}/${verifiedRows.length || 0}</strong><em>${hitRate(matchTypeHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>A/B方向</span><strong>${adviceDirectionHits}/${adviceRows.length || 0}</strong><em>${hitRate(adviceDirectionHits, adviceRows.length)}</em></article>
      <article class="review-metric"><span>A级证据</span><strong>${mainGateRows.length}</strong><em>证据完整，不代表自动主推</em></article>
      <article class="review-metric"><span>错因样本</span><strong>${missAttributions.length}</strong><em>待优化记录</em></article>
    </div>
    <div class="review-version-strip">
      ${versionStats
        .map(
          (item) => `
            <article>
              <strong>${item.version}</strong>
              <span>方向 ${item.directionHits}/${item.total}（${hitRate(item.directionHits, item.total)}）</span>
              <span>让球 ${item.handicapHits}/${item.handicapTotal || 0}（${hitRate(item.handicapHits, item.handicapTotal)}）</span>
              <span>总进球 ${item.totalGoalsHits}/${item.total}（${hitRate(item.totalGoalsHits, item.total)}）</span>
              <span>比分 ${item.scoreHits}/${item.total}（${hitRate(item.scoreHits, item.total)}）</span>
            </article>
          `
        )
        .join("")}
      <article class="current-version-note">
        <strong>${data.currentModelVersion || "V4"}</strong>
        <span>当前启用版本。之后新锁版归入 ${data.currentModelVersion || "V4"}，旧结果不回填改判。</span>
      </article>
    </div>
    <div class="attribution-strip">
      ${attributionSummary
        .map(
          (item) => `
            <article>
              <span>${item.label}</span>
              <strong>${item.total}</strong>
              <em>方向 ${hitRate(item.directionHits, item.total)}</em>
            </article>
          `
        )
        .join("") || "<article><span>错因归因</span><strong>0</strong><em>等待赛果</em></article>"}
    </div>
    ${renderCalibrationPanel(verifiedRows)}
  `;

  const dateOptions = [
    `<option value="all"${activeReviewDate === "all" ? " selected" : ""}>全部日期</option>`,
    ...reviewDates.map(
      (date) => `<option value="${date}"${activeReviewDate === date ? " selected" : ""}>${formatDate(date)}</option>`
    ),
  ].join("");
  const dateScopeLabel =
    activeReviewDate === "all" ? "全部锁版记录" : `${formatDate(activeReviewDate)} 锁版记录`;
  const ticketRows = visibleRows
    .map(({ match, pred, review }) => {
      const caseStatus = caseBaseStatus(pred, match);
      const scoreText = officialScoreForMatch(match);
      const tags = [
        ...(caseStatus.caseItem?.failureTags || []),
        ...(caseStatus.caseItem?.successTags || []),
      ];
      return `
        <tr data-review-no="${match.no}">
          <td>${dash(pred.date)}</td>
          <td><span class="version-badge">${predictionModelVersion(pred)}</span></td>
          <td>${match.no}</td>
          <td class="match-name-cell">${reviewMatchButton(match)}</td>
          <td class="actual-cell">${dash(scoreText)}</td>
          <td><b>${dash(pred.pick)}</b>${hitCell(review.directionHit)}</td>
          <td><b>${dash(review.hPick)}</b>${hitCell(review.handicapHit)}</td>
          <td><b>${dash(pred.totalGoalsPick)}</b>${hitCell(review.totalGoalsHit)}</td>
          <td><b>${dash(pred.mainScore)} / ${dash(pred.counterScore)}</b>${hitCell(review.scoreHit)}</td>
          <td>${dash(caseStatus.hitStatus)}</td>
          <td>${caseStatus.generated ? "已进入" : "未进入"}</td>
          <td class="text-cell">${dash(caseStatus.caseId)}${tags.length ? `<em>${tags.join(" / ")}</em>` : ""}</td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="12" class="empty-cell">当前日期暂无可复盘记录</td></tr>`;

  const diagnosticRows = visibleRows
    .map(({ match, pred, review }) => {
      const scoreText = officialScoreForMatch(match);
      const filter = advancedFilter(pred);
      const gate = autoDecisionGate(match.no, pred);
      const attribution = reviewAttribution(pred, match, review);
      const upgradeNotes = [
        `盘口变化：${filter.lineMovement}`,
        `事件风险：${filter.eventRisk}`,
        `比分淘汰：${filter.scoreElimination}`,
        `错层风险：${filter.keyFailureRisk}`,
      ].join(" ｜ ");
      return `
        <tr data-review-no="${match.no}">
          <td>${dash(pred.date)}</td>
          <td><span class="version-badge">${predictionModelVersion(pred)}</span></td>
          <td>${match.no}</td>
          <td class="match-name-cell">${reviewMatchButton(match)}</td>
          <td class="actual-cell">${dash(scoreText)}</td>
          <td><b>${dash(review.matchType)}</b>${hitCell(review.matchTypeHit)}</td>
          <td>${dash(review.actualMatchType)}</td>
          <td>${dash(review.confidence)}</td>
          <td><span class="gate-badge ${gate.tone}">${gate.level} ${gate.score}</span></td>
          <td><span class="attribution-badge ${attribution.severity}">${attribution.type}</span><em>${attribution.note}</em></td>
          <td>${filter.institutionFear}</td>
          <td>${filter.underdogResistance}</td>
          <td class="text-cell">${upgradeNotes}</td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="13" class="empty-cell">当前日期暂无模型诊断记录</td></tr>`;

  const ticketTable = `
    <div class="review-record-wrap compact">
      <table class="review-record-table ticket-table">
        <thead>
          <tr>
            <th>记录日期</th>
            <th>模型</th>
            <th>场次</th>
            <th>比赛</th>
            <th>实际比分</th>
            <th>胜平负</th>
            <th>让球</th>
            <th>总进球</th>
            <th>比分预测</th>
            <th>验票结果</th>
            <th>Case Base</th>
            <th>caseId / 标签</th>
          </tr>
        </thead>
        <tbody>${ticketRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="12">
              <strong>命中概率：</strong>${reviewRateSummary.map((item) => `<span>${item}</span>`).join("")}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  const diagnosticTable = `
    <div class="review-record-wrap compact">
      <table class="review-record-table diagnostic-table">
        <thead>
          <tr>
            <th>记录日期</th>
            <th>模型</th>
            <th>场次</th>
            <th>比赛</th>
            <th>实际比分</th>
            <th>预测类型</th>
            <th>实际类型</th>
            <th>置信</th>
            <th>证据等级</th>
            <th>错因归因</th>
            <th>机构最怕</th>
            <th>弱队抵抗</th>
            <th>补短板记录</th>
          </tr>
        </thead>
        <tbody>${diagnosticRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="13">
              <strong>模型诊断：</strong>
              <span>比赛类型命中 ${matchTypeHits}/${verifiedRows.length || 0}（${hitRate(matchTypeHits, verifiedRows.length)}）</span>
              <span>A/B 级仅统计未来赛前明确评级的场次</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  document.querySelector("#review-table").innerHTML = `
    <div class="review-subnav">
      <button type="button" class="${activeReviewView === "ticket" ? "active" : ""}" data-review-view="ticket">预测验票</button>
      <button type="button" class="${activeReviewView === "diagnostic" ? "active" : ""}" data-review-view="diagnostic">模型诊断</button>
    </div>
    <div class="review-filterbar">
      <div>
        <span>按日期复盘</span>
        <strong>${dateScopeLabel}</strong>
        <em>${visibleRows.length}/${groupedRows.length} 场</em>
      </div>
      <select data-review-date aria-label="选择复盘日期">${dateOptions}</select>
    </div>
    ${activeReviewView === "ticket" ? ticketTable : diagnosticTable}
  `;
}

function modelAuditRows() {
  const worldCupRows = groupedPredictions()
    .slice()
    .sort((a, b) => a.match.date.localeCompare(b.match.date) || Number(a.match.no) - Number(b.match.no))
    .map(({ match, predictions }) => {
      const sorted = predictions.slice().sort((a, b) => predictionVersionRank(a) - predictionVersionRank(b));
      const pred = sorted[0] || predictions[0];
      const review = predictionReviewData(pred, match);
      return {
        match,
        pred,
        review,
        competition: modelDisplayName(pred, match, match.competition || match.league || "世界杯"),
        playType: pred.playType || "竞彩足球",
      };
    });
  const sportteryRows = (data.sportteryPredictions || []).map((pred) => {
    const item = findSportteryItemForPrediction(pred);
    if (hasOfficialWorldCupLock(pred, item)) return null;
    const actualScore = item ? verifiedSportteryScore(item) : "";
    const match = {
      no: pred.no,
      date: pred.date || pred.matchDate,
      matchDate: pred.matchDate || pred.date,
      competition: pred.competition || item?.league || "体彩",
      league: item?.league || pred.competition || "体彩",
      group: pred.competition || item?.league || "体彩",
      home: pred.home,
      away: pred.away,
      score: actualScore,
      sportteryKey: pred.sportteryKey || (item ? sportteryItemKey(item) : ""),
      matchId: pred.matchId || item?.matchId || "",
    };
    return {
      match,
      pred,
      review: predictionReviewData(pred, match),
      competition: modelDisplayName(pred, match, pred.competitionModel || pred.competition || "体彩联赛"),
      playType: pred.playType || "竞彩足球",
    };
  }).filter(Boolean);
  return [...worldCupRows, ...sportteryRows].sort((a, b) => {
    const dateCompare = String(a.match.date || "").localeCompare(String(b.match.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(a.match.no || 0) - Number(b.match.no || 0);
  });
}

function renderGlobalStats() {
  const cards = document.querySelector("#global-stats-cards");
  const table = document.querySelector("#global-stats-table");
  const leagueFilter = document.querySelector("#global-stats-league-filter");
  if (!cards || !table) return;

  const allRows = modelAuditRows();
  const dates = [...new Set(allRows.map(({ match }) => match.date))];
  const leagues = [...new Set(allRows.map((row) => row.competition).filter(Boolean))];
  if (activeGlobalStatsDate !== "all" && !dates.includes(activeGlobalStatsDate)) {
    activeGlobalStatsDate = "all";
  }
  if (activeGlobalStatsLeague !== "all" && !leagues.includes(activeGlobalStatsLeague)) {
    activeGlobalStatsLeague = "all";
  }
  const visibleRows =
    allRows.filter(({ match, competition }) => {
      const dateOk = activeGlobalStatsDate === "all" || match.date === activeGlobalStatsDate;
      const leagueOk = activeGlobalStatsLeague === "all" || competition === activeGlobalStatsLeague;
      return dateOk && leagueOk;
    });
  const rows = visibleRows.map((row) => ({ ...row, ...row.review }));

  const verifiedRows = rows.filter((row) => row.actualDirection);
  const handicapVerifiedRows = rows.filter((row) => row.actualHandicapDirection);
  const directionHits = verifiedRows.filter((row) => row.directionHit).length;
  const handicapHits = handicapVerifiedRows.filter((row) => row.handicapHit).length;
  const totalGoalsHits = verifiedRows.filter((row) => row.totalGoalsHit).length;
  const scoreHits = verifiedRows.filter((row) => row.scoreHit).length;
  const adviceRows = verifiedRows.filter((row) => ["A", "A-", "B", "B-"].includes(row.confidence));
  const adviceHits = adviceRows.filter((row) => row.directionHit).length;
  const gateRows = rows.map((row) => ({ ...row, gate: autoDecisionGate(row.match.no, row.pred) }));
  const mainGateRows = gateRows.filter((row) => row.gate.level === "A");
  const attributionRows = verifiedRows.map((row) => ({ ...row, attribution: reviewAttribution(row.pred, row.match, row) }));
  const missAttributions = attributionRows.filter((row) => row.attribution.severity !== "good");
  const competitions = new Set(allRows.map((row) => row.competition));
  const versionStats = ["V1", "V2", "V3", "V4"]
    .map((version) => {
      const subset = verifiedRows.filter((row) => predictionModelVersion(row.pred) === version);
      if (!subset.length) return null;
      return {
        version,
        total: subset.length,
        directionHits: subset.filter((row) => row.directionHit).length,
        totalGoalsHits: subset.filter((row) => row.totalGoalsHit).length,
        scoreHits: subset.filter((row) => row.scoreHit).length,
      };
    })
    .filter(Boolean);

  cards.innerHTML = `
    <div class="review-summary-grid">
      <article class="review-metric"><span>已锁版场次</span><strong>${allRows.length}</strong><em>${competitions.size} 个赛事类型</em></article>
      <article class="review-metric"><span>已验证</span><strong>${verifiedRows.length}</strong><em>已有实际比分</em></article>
      <article class="review-metric"><span>方向命中</span><strong>${directionHits}/${verifiedRows.length || 0}</strong><em>${hitRate(directionHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>让球命中</span><strong>${handicapHits}/${handicapVerifiedRows.length || 0}</strong><em>${hitRate(handicapHits, handicapVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>总进球</span><strong>${totalGoalsHits}/${verifiedRows.length || 0}</strong><em>${hitRate(totalGoalsHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>比分覆盖</span><strong>${scoreHits}/${verifiedRows.length || 0}</strong><em>${hitRate(scoreHits, verifiedRows.length)}</em></article>
      <article class="review-metric"><span>A/B方向</span><strong>${adviceHits}/${adviceRows.length || 0}</strong><em>${hitRate(adviceHits, adviceRows.length)}</em></article>
      <article class="review-metric"><span>A级证据</span><strong>${mainGateRows.length}</strong><em>证据完整，不代表自动主推</em></article>
      <article class="review-metric"><span>错因样本</span><strong>${missAttributions.length}</strong><em>用于迭代模型</em></article>
    </div>
    <div class="review-version-strip">
      ${versionStats
        .map(
          (item) => `
            <article>
              <strong>${item.version}</strong>
              <span>方向 ${item.directionHits}/${item.total}（${hitRate(item.directionHits, item.total)}）</span>
              <span>总进球 ${item.totalGoalsHits}/${item.total}（${hitRate(item.totalGoalsHits, item.total)}）</span>
              <span>比分 ${item.scoreHits}/${item.total}（${hitRate(item.scoreHits, item.total)}）</span>
            </article>
          `
        )
        .join("")}
      <article class="current-version-note">
        <strong>全体彩口径</strong>
        <span>世界杯专题和联赛模型锁版统一进入本表，但保留各自赛事模型归属。</span>
      </article>
    </div>
    ${renderCalibrationPanel(verifiedRows)}
  `;

  const dateOptions = [
    `<option value="all"${activeGlobalStatsDate === "all" ? " selected" : ""}>全部日期</option>`,
    ...dates.map(
      (date) => `<option value="${date}"${activeGlobalStatsDate === date ? " selected" : ""}>${formatDate(date)}</option>`
    ),
  ].join("");
  const dateScopeLabel =
    activeGlobalStatsDate === "all" ? "全部体彩模型记录" : `${formatDate(activeGlobalStatsDate)} 模型记录`;
  if (leagueFilter) {
    const leagueOptions = [
      `<option value="all"${activeGlobalStatsLeague === "all" ? " selected" : ""}>全部联赛 / 专题</option>`,
      ...leagues.map(
        (league) => `<option value="${league}"${activeGlobalStatsLeague === league ? " selected" : ""}>${league}</option>`
      ),
    ].join("");
    leagueFilter.innerHTML = `
      <div class="review-filterbar global-stats-filterbar league-filterbar combined-stats-filterbar">
        <section>
          <div>
            <span>按联赛回测</span>
            <strong>${activeGlobalStatsLeague === "all" ? "全部联赛 / 专题" : activeGlobalStatsLeague}</strong>
            <em>${visibleRows.length}/${allRows.length} 场</em>
          </div>
          <select data-global-stats-league aria-label="选择联赛或专题">${leagueOptions}</select>
        </section>
        <section>
          <div>
            <span>按日期复盘</span>
            <strong>${dateScopeLabel}</strong>
            <em>${visibleRows.length}/${allRows.length} 场</em>
          </div>
          <select data-global-stats-date aria-label="选择统计日期">${dateOptions}</select>
        </section>
      </div>
    `;
  }
  const tableRows = visibleRows
    .map(({ match, pred, review, competition, playType }) => {
      const attribution = reviewAttribution(pred, match, review);
      const confidence = confidenceGrade(pred);
      const scoreText = officialScoreForMatch(match);
      return `
        <tr>
          <td>${dash(competition)}</td>
          <td>${dash(playType)}</td>
          <td>${dash(pred.date || match.date)}</td>
          <td><span class="version-badge">${predictionModelVersion(pred)}</span></td>
          <td>${match.no}</td>
          <td class="text-cell match-name-cell">${reviewMatchButton(match)}</td>
          <td class="actual-cell">${dash(scoreText)}</td>
          <td><span class="gate-badge ${confidenceTone(confidence)}">${dash(confidence)}</span></td>
          <td><b>${dash(pred.pick)}</b>${hitCell(review.directionHit)}</td>
          <td><b>${dash(review.hPick)}</b>${hitCell(review.handicapHit)}</td>
          <td><b>${dash(pred.totalGoalsPick)}</b>${hitCell(review.totalGoalsHit)}</td>
          <td><b>${dash(pred.mainScore)} / ${dash(pred.counterScore)}</b>${hitCell(review.scoreHit)}</td>
          <td><span class="attribution-badge ${attribution.severity}">${attribution.type}</span></td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="13" class="empty-cell">当前范围暂无模型推演记录</td></tr>`;
  const tableSummary = `${activeGlobalStatsLeague === "all" ? "全部联赛 / 专题" : activeGlobalStatsLeague} · ${dateScopeLabel} · ${visibleRows.length}/${allRows.length} 场`;

  table.innerHTML = `
    <div class="global-stats-table-toolbar">
      <div>
        <span>回测明细表</span>
        <strong>${tableSummary}</strong>
      </div>
      <button type="button" data-global-stats-maximize aria-label="最大化查看回测明细表">
        <span>最大化查看</span>
      </button>
    </div>
    <div class="review-record-wrap compact global-stats-wrap">
      <table class="review-record-table global-stats-record-table">
        <thead>
          <tr>
            <th>赛事</th>
            <th>玩法</th>
            <th>锁版日期</th>
            <th>版本</th>
            <th>场次</th>
            <th>比赛</th>
            <th>实际比分</th>
            <th>置信等级</th>
            <th>胜平负</th>
            <th>让球</th>
            <th>总进球</th>
            <th>比分预测</th>
            <th>错因</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function openGlobalStatsModal() {
  const sourceTable = document.querySelector("#global-stats-table .global-stats-record-table");
  if (!sourceTable) return;
  document.querySelector(".global-stats-modal")?.remove();
  const summary =
    document.querySelector("#global-stats-table .global-stats-table-toolbar strong")?.textContent ||
    "全部体彩模型记录";
  const modal = document.createElement("div");
  modal.className = "global-stats-modal";
  modal.innerHTML = `
    <div class="global-stats-dialog" role="dialog" aria-modal="true" aria-label="回测明细最大化表格">
      <header>
        <div>
          <span>模型回测明细</span>
          <strong>${summary}</strong>
          <em>横向滚动查看更多列，纵向滚动查看更多比赛。</em>
        </div>
        <button type="button" data-global-stats-close aria-label="关闭最大化表格">×</button>
      </header>
      <div class="global-stats-dialog-body"></div>
    </div>
  `;
  const tableClone = sourceTable.cloneNode(true);
  tableClone.classList.add("global-stats-record-table-expanded");
  modal.querySelector(".global-stats-dialog-body")?.appendChild(tableClone);
  document.body.appendChild(modal);
}

function spNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const playOptionMeta = {
  had: [
    ["H", "h", "主胜"],
    ["D", "d", "平局"],
    ["A", "a", "客胜"],
  ],
  hhad: [
    ["H", "h", "让胜"],
    ["D", "d", "让平"],
    ["A", "a", "让负"],
  ],
  ttg: [
    ["0", "s0", "0球"],
    ["1", "s1", "1球"],
    ["2", "s2", "2球"],
    ["3", "s3", "3球"],
    ["4", "s4", "4球"],
    ["5", "s5", "5球"],
    ["6", "s6", "6球"],
    ["7", "s7", "7+球"],
  ],
};

function snapshotWeights(snapshot, playType) {
  const options = playOptionMeta[playType] || [];
  const rows = options
    .map(([code, field, label]) => {
      const sp = spNumber(snapshot?.[field]);
      if (!sp) return null;
      return { code, label, sp, rawWeight: 1 / sp };
    })
    .filter(Boolean);
  const total = rows.reduce((sum, item) => sum + item.rawWeight, 0);
  if (!total) return [];
  return rows.map((item) => ({ ...item, weight: item.rawWeight / total }));
}

function analyzePlayHistory(match, playType) {
  const snapshots = (match.history?.[playType] || [])
    .filter((item) => `${item.updateDate || ""} ${item.updateTime || ""}`.trim())
    .sort((a, b) => `${a.updateDate} ${a.updateTime}`.localeCompare(`${b.updateDate} ${b.updateTime}`));
  if (snapshots.length < 2) {
    return {
      playType,
      available: false,
      label: { had: "胜平负", hhad: "让球", ttg: "总进球" }[playType],
      reason: "快照不足",
    };
  }
  const start = snapshots[0];
  const end = snapshots.at(-1);
  const startWeights = new Map(snapshotWeights(start, playType).map((item) => [item.code, item]));
  const endWeights = snapshotWeights(end, playType);
  const options = endWeights
    .map((item) => {
      const opening = startWeights.get(item.code);
      if (!opening) return null;
      const spDeltaPct = (item.sp - opening.sp) / opening.sp;
      const weightDelta = item.weight - opening.weight;
      return {
        ...item,
        openingSp: opening.sp,
        spDeltaPct,
        weightDelta,
        trend: weightDelta >= 0.015 ? "strengthening" : weightDelta <= -0.015 ? "weakening" : "stable",
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.weightDelta) - Math.abs(a.weightDelta));
  const strongest = options.find((item) => item.trend === "strengthening") || options[0];
  const volatility = options[0] ? Math.abs(options[0].spDeltaPct) : 0;
  return {
    playType,
    available: options.length > 0,
    label: { had: "胜平负", hhad: "让球", ttg: "总进球" }[playType],
    startTime: `${start.updateDate} ${start.updateTime}`,
    endTime: `${end.updateDate} ${end.updateTime}`,
    strongest,
    options,
    volatility,
    level: volatility >= 0.08 ? "高" : volatility >= 0.03 ? "中" : "低",
  };
}

function oddsMapRows() {
  return (spHistoryData.matches || []).map((match) => {
    const analyses = ["had", "hhad", "ttg"].map((playType) => analyzePlayHistory(match, playType));
    const available = analyses.filter((item) => item.available);
    const strongest = available
      .flatMap((item) => item.options.map((option) => ({ ...option, market: item.label, playType: item.playType })))
      .sort((a, b) => Math.abs(b.weightDelta) - Math.abs(a.weightDelta))[0];
    const riskFlags = [];
    const hadTop = available.find((item) => item.playType === "had")?.strongest;
    const hhadTop = available.find((item) => item.playType === "hhad")?.strongest;
    const ttgTop = available.find((item) => item.playType === "ttg")?.strongest;
    if (hadTop?.code === "H" && hhadTop?.code === "A") riskFlags.push("主胜热但让负增强");
    if (hadTop?.code === "A" && hhadTop?.code === "H") riskFlags.push("客胜热但让胜增强");
    if (ttgTop && ["0", "1", "2"].includes(ttgTop.code)) riskFlags.push("低进球权重抬升");
    if (ttgTop && ["4", "5", "6", "7"].includes(ttgTop.code)) riskFlags.push("大球权重抬升");
    const volatility = Math.max(...available.map((item) => item.volatility), 0);
    return {
      ...match,
      analyses,
      strongest,
      riskFlags,
      volatility,
      pressureLevel: volatility >= 0.08 ? "强异动" : volatility >= 0.03 ? "中异动" : "轻微",
    };
  });
}

function deltaText(value, precision = 1) {
  if (!Number.isFinite(value)) return "-";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(precision)}%`;
}

function renderPlayTrend(item) {
  if (!item.available) return `<span class="trend-chip muted">${item.label} ${item.reason}</span>`;
  const top = item.strongest;
  const tone = top.trend === "strengthening" ? "hot" : top.trend === "weakening" ? "cold" : "flat";
  return `
    <span class="trend-chip ${tone}">
      ${item.label} · ${top.label}
      <b>${deltaText(top.weightDelta)}</b>
    </span>
  `;
}

function pickToMarketCode(pick) {
  if (pick === "胜") return "H";
  if (pick === "平") return "D";
  if (pick === "负") return "A";
  if (pick === "让胜") return "H";
  if (pick === "让平") return "D";
  if (pick === "让负") return "A";
  return "";
}

function totalPickBand(pick) {
  if (/0|1|2/.test(pick || "") && !/4|5|6|7/.test(pick || "")) return "low";
  if (/4|5|6|7/.test(pick || "")) return "high";
  return "mid";
}

function numberOdd(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

function parseProbRange(value) {
  const numbers = String(value || "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((item) => Number.isFinite(item));
  if (!numbers?.length) return null;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length / 100;
}

function modelProbabilities(pred) {
  return {
    H: parseProbRange(pred?.homeProb),
    D: parseProbRange(pred?.drawProb),
    A: parseProbRange(pred?.awayProb),
  };
}

function impliedMarket(entries) {
  const valid = entries
    .map((item) => ({ ...item, odd: numberOdd(item.odd) }))
    .filter((item) => item.odd);
  const rawSum = valid.reduce((sum, item) => sum + 1 / item.odd, 0);
  if (!valid.length || !rawSum) return { entries: [], returnRate: 0, overround: 0 };
  return {
    returnRate: 1 / rawSum,
    overround: rawSum - 1,
    entries: valid.map((item) => {
      const probability = (1 / item.odd) / rawSum;
      return {
        ...item,
        probability,
        fairOdd: 1 / probability,
      };
    }),
  };
}

function oddsMarketEntries(odds, marketType = "had") {
  if (marketType === "ttg") {
    return (odds?.totalGoalsOdds || []).map((item) => ({
      code: item.goals,
      label: `${item.goals}球`,
      odd: item.odds,
    }));
  }
  const source = marketType === "hhad" ? odds?.handicapOdds : odds?.normal;
  return [
    { code: "H", label: marketType === "hhad" ? "让胜" : "胜", odd: source?.win },
    { code: "D", label: marketType === "hhad" ? "让平" : "平", odd: source?.draw },
    { code: "A", label: marketType === "hhad" ? "让负" : "负", odd: source?.lose },
  ];
}

function probabilityPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function oddsMathForMatch(no, pred) {
  const odds = oddsMatch(no);
  if (!odds) return null;
  const normal = impliedMarket(oddsMarketEntries(odds, "had"));
  const handicap = impliedMarket(oddsMarketEntries(odds, "hhad"));
  const totalGoals = impliedMarket(oddsMarketEntries(odds, "ttg"));
  const model = modelProbabilities(pred);
  const pickCode = pickToMarketCode(pred?.pick);
  const selected = normal.entries.find((item) => item.code === pickCode);
  const modelProb = model[pickCode];
  const probGap = Number.isFinite(modelProb) && selected ? modelProb - selected.probability : null;
  const valueIndex = selected && Number.isFinite(modelProb) ? ((modelProb * selected.odd - 1) / (selected.odd - 1)) * 100 : null;
  const kelly = selected && Number.isFinite(modelProb) && typeof SportteryMath !== "undefined" ? {
    kellyIndex: SportteryMath.kellyIndex(selected.odd, modelProb),
    ev: SportteryMath.expectedValue(selected.odd, modelProb),
    kellyFraction: SportteryMath.kellyFraction(selected.odd, modelProb),
  } : null;
  const spread = normal.entries.length
    ? Math.max(...normal.entries.map((item) => item.probability)) - Math.min(...normal.entries.map((item) => item.probability))
    : null;
  const marketDerived = normal.entries.length >= 3 && typeof SportteryMath !== "undefined"
    ? SportteryMath.deriveOdds(normal.entries.map((e) => e.odd))
    : null;
  const valueCompare = selected && Number.isFinite(modelProb) && typeof SportteryMath !== "undefined"
    ? SportteryMath.compareValue(
        normal.entries.map((e) => e.odd),
        [model.H || 0, model.D || 0, model.A || 0],
        normal.entries.map((e) => e.label)
      )
    : null;
  return { odds, normal, handicap, totalGoals, selected, modelProb, probGap, valueIndex, spread, kelly, marketDerived, valueCompare };
}

function totalGoalsPickSet(pick = "") {
  return new Set(String(pick).match(/\d/g) || []);
}

function renderOddsMathPanel(no, pred) {
  const math = oddsMathForMatch(no, pred);
  if (!math?.normal.entries.length) return "";
  const mainRows = math.normal.entries
    .map(
      (item) => `
        <article>
          <span>${item.label}</span>
          <strong>${probabilityPercent(item.probability)}</strong>
          <em>SP ${item.odd} / 公允 ${item.fairOdd.toFixed(2)}</em>
          ${math.valueCompare ? (function(){
            const v = math.valueCompare.find(c => c.label === item.label);
            if (!v) return "";
            return `<b class="${v.isStrongValue ? "value-strong" : v.isValue ? "value-weak" : "value-none"}">${v.isValue ? "价值" : "无价值"} ${v.kellyIndex.toFixed(3)}</b>`;
          })() : ""}
        </article>
      `
    )
    .join("");
  const valueLine = math.kelly && typeof SportteryMath !== "undefined"
    ? `<div class="odds-math-value">
        <span>凯利指数 <strong>${math.kelly.kellyIndex.toFixed(3)}</strong>
        ${math.kelly.kellyIndex > 1 ? "✓" : "✗"}</span>
        <span>期望值 <strong>${SportteryMath.pct(math.kelly.ev)}</strong></span>
        <span>凯利比例 <strong>${math.kelly.kellyFraction <= 0 ? "不投注" : (math.kelly.kellyFraction * 100).toFixed(1) + "%"}</strong></span>
        ${math.kelly.kellyIndex > 1.05 ? '<span class="value-badge-strong">强价值信号</span>' : math.kelly.kellyIndex > 1 ? '<span class="value-badge-weak">弱价值信号</span>' : '<span class="value-badge-none">无明显价值</span>'}
      </div>`
    : "";
  return `
    <section class="match-page-section odds-math-panel">
      <span>赔率数学</span>
      <div class="odds-math-head">
        <strong>${probabilityPercent(math.normal.returnRate)}</strong>
        <em>胜平负返还率</em>
        <b>概率缺口 ${Number.isFinite(math.probGap) ? deltaText(math.probGap, 1) : "-"}</b>
        <b>凯利分数 ${Number.isFinite(math.valueIndex) ? `${math.valueIndex.toFixed(1)}%` : "-"}</b>
      </div>
      <div class="odds-math-grid">${mainRows}</div>
      ${valueLine}
      <p>这里把 SP 转成去水后的隐含概率，再和模型概率对照，只作为研究指标，不作为决策建议。</p>
    </section>
  `;
}

function renderTotalGoalsDistribution(no, pred) {
  const math = oddsMathForMatch(no, pred);
  if (!math?.totalGoals.entries.length) return "";
  const selected = totalGoalsPickSet(pred?.totalGoalsPick);
  const rows = math.totalGoals.entries
    .map((item) => {
      const active = selected.has(String(item.code).replace("+", ""));
      return `
        <div class="goal-prob-row ${active ? "active" : ""}">
          <span>${item.label}</span>
          <div><i style="width:${Math.max(item.probability * 100, 2).toFixed(1)}%"></i></div>
          <strong>${probabilityPercent(item.probability)}</strong>
        </div>
      `;
    })
    .join("");
  return `
    <section class="match-page-section goal-distribution-panel">
      <span>总进球分布</span>
      <div class="goal-prob-list">${rows}</div>
    </section>
  `;
}

function hasModelAnalysis(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/待人工补充|等待.*补|未接入|缺少|待接入|样本不足|自动 V4 仅根据体彩开盘结构生成/.test(text);
}

function hasHistoricalSample(no, pred) {
  const match = matches.find((item) => item.no === no);
  const worldCupSample = Boolean(match && ((data.historicalDrawRates || []).length || (data.historicalScoreFrequencies || []).length));
  const leagueProfileReady = Boolean(match && leagueProfileForMatch(match, pred)?.usableSampleCount >= 30);
  return Boolean(
    pred?.historicalSample ||
      pred?.sampleCompare ||
      pred?.historicalSampleCompare ||
      pred?.leagueSampleCompare ||
      pred?.scoreSampleCompare ||
      pred?.totalGoalsSampleCompare ||
      leagueProfileReady ||
      worldCupSample
  );
}

function modelEvidenceChecks(no, pred) {
  const row = spRadarForMatch(no);
  const match = matches.find((item) => item.no === no);
  const teamStateText = pred?.teamState || pred?.teamForm || pred?.recentAnalysis;
  const styleText = pred?.styleMatchup || pred?.tacticalMatchup || pred?.recentAnalysis || pred?.script;
  const halfFullText = pred?.halfFullScenario || pred?.halftimeDecision || pred?.halftimeTrigger || pred?.timeTriggerDecision;
  return [
    ["体彩开盘", Boolean(oddsMatch(no)), "实时赛事池 / SP 当前值"],
    ["SP 历史", Boolean(row?.strongest), "开盘到最新变化"],
    ["历史样本", hasHistoricalSample(no, pred), "历届/联赛样本、比分频率、总进球和同类盘口"],
    ["统一流程", Boolean(pred?.decisionProcess || pred?.competitionModel || pred?.eventWeighting || pred?.competitionType), "复用世界杯V4经验链，保留赛事自身版本"],
    ["赛事规则", Boolean(pred?.competitionRules || pred?.competitionModel || pred?.eventWeighting || pred?.competitionType), "世界杯 / 联赛 / 杯赛规则差异"],
    ["赛事动机", Boolean(pred?.groupSituation || pred?.pathMotive || pred?.scheduleMotive), "出线、争冠、欧战、保级或轮换压力"],
    ["球队状态", hasModelAnalysis(teamStateText), "近3-5场、伤停、体能、主客状态"],
    ["风格对位", hasModelAnalysis(styleText), "控球、高压、低位、转换、定位球等 matchup"],
    ["四剧本", Boolean(pred?.scriptSet || pred?.scenarioSet || pred?.fourScripts), "压制、开放、冷门、僵局分支"],
    ["半全场触发", hasModelAnalysis(halfFullText), "半场状态、0-0 / 60 分钟变化"],
    ["状态转移", Boolean(pred?.stateTransfer || pred?.knockoutStateTransfer || pred?.timeStateTransfer), "90分钟目标、第一球后行为和失败方式"],
    ["数据质量", Boolean(pred?.dataQuality || pred?.dataQualityGate), "证据不足时降级"],
    ["机构视角", Boolean(pred?.institutionLine), "自建盘口 vs 体彩盘口"],
    ["赛果回填", Boolean(parseScore(match ? officialScoreForMatch(match) : "")), "赛后复盘使用"],
    ["阵容伤停", Boolean(pred?.recentAnalysis || pred?.keyJudgement || pred?.changeNote) && /伤|缺阵|停赛|复出|回归|伤愈|伤病|缺席/.test([pred.recentAnalysis, pred.keyJudgement, pred.script, pred.noiseFilter, pred.changeNote].filter(Boolean).join(' ')), "阵容/伤停信息（来自推演文本扫描）"],
  ];
}

function modelEvidenceScore(no, pred) {
  const checks = modelEvidenceChecks(no, pred);
  const readyCount = checks.filter(([, ok]) => ok).length;
  return {
    checks,
    readyCount,
    total: checks.length,
    score: Math.round((readyCount / checks.length) * 100),
  };
}

function textSignalScore(text, keywords, base = 62) {
  const hits = keywords.filter((word) => String(text || "").includes(word)).length;
  return clamp(base + hits * 7, 45, 92);
}

function renderModelTriadPanel(no, pred) {
  if (!pred) return "";
  const consistency = marketConsistency(no, pred);
  const motivation = textSignalScore(pred.groupSituation, ["出线", "净胜", "必须", "抢", "压力", "机会"], pred.groupSituation ? 68 : 48);
  const scene = textSignalScore(pred.recentAnalysis || pred.script, ["压迫", "反击", "边路", "定位球", "节奏", "空间"], pred.recentAnalysis ? 70 : 52);
  const market = consistency.score || 50;
  const average = Math.round((motivation + scene + market) / 3);
  const items = [
    ["动机分", motivation, "积分、出线收益和比赛必要性"],
    ["对位分", scene, "近况、风格和真实比赛场景"],
    ["盘口分", market, "SP 漂移与模型锁版是否同向"],
  ];
  return `
    <section class="match-page-section triad-panel">
      <span>三维评分</span>
      <div class="triad-score">
        <strong>${average}</strong>
        <em>${average >= 76 ? "证据较完整" : average >= 62 ? "需要交叉验证" : "谨慎观察"}</em>
      </div>
      <div class="triad-grid">
        ${items
          .map(
            ([label, value, note]) => `
              <article>
                <div><b style="width:${value}%"></b></div>
                <strong>${label} ${value}</strong>
                <p>${note}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function autoDecisionGate(no, pred) {
  if (!pred) {
    return {
      score: 0,
      level: "待推演",
      tone: "muted",
      notes: ["还没有赛前锁版记录"],
      action: "先补模型输出",
    };
  }
  const row = spRadarForMatch(no);
  const hasCurrentOdds = Boolean(oddsMatch(no));
  const weightedChecks = [
    ["锁版结果", Boolean(pred.pick && pred.totalGoalsPick && (pred.mainScore || pred.score1)), 25],
    ["体彩当前盘", hasCurrentOdds, 20],
    ["盘口偏差", Boolean(pred.marketGap), 15],
    ["历史样本", hasHistoricalSample(no, pred), 10],
    ["比赛脚本", hasModelAnalysis(pred.script), 12],
    ["球队状态", hasModelAnalysis(pred.teamState || pred.teamForm || pred.recentAnalysis), 10],
    ["风格对位", hasModelAnalysis(pred.styleMatchup || pred.tacticalMatchup), 10],
    ["半全场", hasModelAnalysis(pred.halfFullScenario || pred.halftimeDecision || pred.halftimeTrigger || pred.timeTriggerDecision), 10],
    ["状态转移", Boolean(pred.stateTransfer || pred.knockoutStateTransfer || pred.timeStateTransfer), 10],
    ["赛事动机", Boolean(pred.groupSituation || pred.pathMotive || pred.scheduleMotive), 10],
    ["机构视角", Boolean(pred.institutionLine), 9],
  ];
  const earned = weightedChecks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  const totalWeight = weightedChecks.reduce((sum, [, , weight]) => sum + weight, 0);
  const score = Math.round((earned / totalWeight) * 100);
  const modelGrade = confidenceGrade(pred);
  const marketStatus = row?.strongest ? "盘口动态有效" : hasCurrentOdds ? "当前盘口有效，SP历史未命中" : "当前盘口缺失";
  const missingNotes = weightedChecks
    .filter(([, ok]) => !ok)
    .map(([label]) => `${label}缺失`)
    .slice(0, 3);
  const level = score >= 86 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : "D";
  const crossConflict = score < 72 && ["A", "A-"].includes(modelGrade);
  const effectiveLevel = crossConflict ? (level === "C" ? "C~" : level) : level;
  return {
    score,
    level: effectiveLevel,
    tone: effectiveLevel === "A" ? "hot" : effectiveLevel.startsWith("B") ? "warm" : effectiveLevel === "C~" || effectiveLevel.startsWith("C") ? "watch" : "cold",
    notes: [
      `模型置信 ${modelGrade}`,
      marketStatus,
      crossConflict ? "闸门与置信等级不一致：在场证据偏少，建议调低预期" : "",
      missingNotes.length ? missingNotes.join(" / ") : "核心字段完整",
    ],
    action:
      effectiveLevel === "A"
        ? "证据完整，可正常复核"
        : effectiveLevel.startsWith("B")
          ? "证据较完整，缺失项不扣比赛判断"
          : effectiveLevel === "C~" || effectiveLevel.startsWith("C")
            ? "证据部分缺失，只降低数据可信度"
            : "证据不足，不等于比赛风险",
  };
}

function renderDecisionGatePanel(no, pred) {
  const gate = autoDecisionGate(no, pred);
  return `
    <section class="match-page-section decision-gate-panel ${gate.tone}">
      <span>证据质量</span>
      <div class="decision-gate-head">
        <strong>${gate.level}</strong>
        <em>${gate.score}</em>
        <b>${gate.action}</b>
      </div>
      <div class="decision-gate-bar"><i style="width:${gate.score}%"></i></div>
      <div class="decision-gate-notes">
        ${gate.notes.map((item) => `<span>${item}</span>`).join("")}
      </div>
    </section>
  `;
}

function finalDecisionGateItems(pred) {
  if (!pred) return [];
  const resolved = resolvedPredictionDecision(pred);
  return [
    ["统一流程", pred.decisionProcess || pred.modelDecisionProcess],
    ["赛事规则", pred.competitionRules || pred.eventWeighting || pred.competitionWeight || pred.weightProfile],
    ["90分钟目标", pred.ninetyMinuteObjective || pred.matchObjective || pred.pathMotive],
    ["状态转移", pred.stateTransfer || pred.knockoutStateTransfer || pred.timeStateTransfer],
    ["半场触发", pred.halftimeDecision || pred.halftimeTrigger || pred.timeTriggerDecision],
    ["让球卡盘", pred.handicapGate || pred.letBallGate || pred.handicapDecisionGate],
    ["跨市场", pred.crossMarketConsistency || pred.marketConsistencyGate],
    ["数据质量", pred.dataQuality || pred.dataQualityGate],
    ["决策冲突", resolved?.resolution || pred.decisionConflict || pred.conflictResolution || pred.decisionGateConflict],
    ["最终动作", resolved?.hasConflict ? `按主比分优先收口：胜平负 ${resolved.pick || "-"}；让球 ${resolved.handicapPick || "-"}。` : pred.finalDecisionAction || pred.decisionAction || pred.valueFilterAction],
  ].filter(([, value]) => Boolean(value));
}

function renderFinalDecisionGatePanel(pred) {
  const items = finalDecisionGateItems(pred);
  if (!items.length) return "";
  const action = finalDecisionActionText(pred) || "等待最终动作锁定";
  const supportingItems = items.filter(([label]) => label !== "最终动作");
  return `
    <section class="match-page-section final-decision-gate">
      <div class="final-decision-head">
        <span>最终决策闸门</span>
        <strong>${displayModelText(action)}</strong>
        <em>所有数据、盘口、比赛脚本和风险项在这里收口，只作为赛前决策过滤依据。</em>
      </div>
      ${
        supportingItems.length
          ? `<div class="final-decision-grid">
        ${supportingItems
          .map(
            ([label, value]) => `
              <article>
                <small>${label}</small>
                <p>${displayModelText(value)}</p>
              </article>
            `
          )
          .join("")}
      </div>`
          : ""
      }
    </section>
  `;
}

function finalDecisionActionText(pred) {
  const resolved = resolvedPredictionDecision(pred);
  if (resolved?.hasConflict) {
    return `${resolved.resolution} 最终动作：胜平负 ${resolved.pick || "-"}；让球 ${resolved.handicapPick || "-"}。`;
  }
  return pred?.finalDecisionAction || pred?.decisionAction || pred?.valueFilterAction || "";
}

function normalizeScriptSet(scriptSet, fallbackText) {
  if (!scriptSet) {
    if (fallbackText) {
      const parts = fallbackText.split(/[。；；]/).filter(Boolean);
      if (parts.length >= 2) {
        return [
          { label: "主剧本", text: parts[0].trim() },
          { label: "变化分支", text: parts.slice(1).join("；").trim() },
        ];
      }
      return [{ label: "剧本", text: fallbackText }];
    }
    return [];
  }
  if (Array.isArray(scriptSet)) {
    return scriptSet
      .map((item) => {
        if (typeof item === "string") return { label: "剧本", text: item };
        return {
          label: item.label || item.name || item.type || "剧本",
          probability: item.probability || item.weight || item.chance || "",
          score: item.score || item.scores || "",
          text: item.text || item.script || item.trigger || item.detail || "",
        };
      })
      .filter((item) => item.text || item.score || item.probability);
  }
  return Object.entries(scriptSet)
    .map(([key, value]) => {
      const labels = {
        dominance: "强势压制",
        open: "开放对攻",
        upset: "冷门反转",
        stalemate: "僵局消耗",
      };
      if (typeof value === "string") return { label: labels[key] || key, text: value };
      return {
        label: value.label || labels[key] || key,
        probability: value.probability || value.weight || value.chance || "",
        score: value.score || value.scores || "",
        text: value.text || value.script || value.trigger || value.detail || "",
      };
    })
    .filter((item) => item.text || item.score || item.probability);
}

function renderUniversalModelPanel(pred) {
  if (!pred) return "";
  const modelTemplate = pred.competitionModel || pred.eventModel || pred.competitionType || "通用赛前模板";
  const modelName = modelDisplayName(pred, {}, modelTemplate);
  const motiveItems = [
    ["统一流程", pred.decisionProcess || pred.modelDecisionProcess],
    ["赛事规则", pred.competitionRules || pred.eventWeighting || pred.competitionWeight],
    ["路径动机", pred.pathMotive || pred.pathAdvantage || pred.strategicMotive],
    ["球队状态", pred.teamState || pred.teamForm || pred.recentAnalysis],
    ["风格对位", pred.styleMatchup || pred.tacticalMatchup],
    ["历史样本", pred.historicalSample || pred.sampleCompare || pred.historicalSampleCompare || pred.leagueSampleCompare || pred.scoreSampleCompare || pred.totalGoalsSampleCompare],
    ["90分钟目标", pred.ninetyMinuteObjective || pred.matchObjective],
    ["状态转移", pred.stateTransfer || pred.knockoutStateTransfer || pred.timeStateTransfer],
    ["半全场", pred.halfFullScenario || pred.halftimeDecision || pred.halftimeTrigger],
    ["赛程动机", pred.scheduleMotive || pred.schedulePressure || pred.rotationRisk],
    ["失败方式", pred.failureMode || pred.likelyMissMode || pred.keyFailureRisk],
    ["复盘错因", pred.reviewErrorType || pred.errorType || pred.learningTag],
  ].filter(([, value]) => Boolean(value));
  const scripts = normalizeScriptSet(pred.scriptSet || pred.scenarioSet || pred.fourScripts, pred.script);
  if (!modelTemplate && !motiveItems.length && !scripts.length) return "";
  return `
    <section class="match-page-section universal-model-panel">
      <div class="universal-model-head">
        <span>V4 通用模型</span>
        <strong>${modelName}</strong>
        <em>世界杯使用当前版本；其它联赛从各自 V1 起步，差异放在赛事规则、动机和赛程约束层处理。</em>
      </div>
      ${
        motiveItems.length
          ? `<div class="universal-model-grid">${motiveItems
              .map(
                ([label, value]) => `
                  <article>
                    <small>${label}</small>
                    <p>${displayModelText(value)}</p>
                  </article>
                `
              )
              .join("")}</div>`
          : ""
      }
      ${
        scripts.length
          ? `<div class="script-set-block">
              <span>脚本分布</span>
              <div class="script-set-grid">${scripts
              .map(
                (item) => `
                  <article>
                    <strong>${item.label}</strong>
                    <em>${[item.probability, item.score].filter(Boolean).join(" · ")}</em>
                    <p>${displayModelText(item.text)}</p>
                  </article>
                `
              )
              .join("")}</div>
            </div>`
          : ""
      }
    </section>
  `;
}

function spRadarForMatch(matchOrNo) {
  const match = typeof matchOrNo === "object" ? matchOrNo : matches.find((item) => item.no === matchOrNo);
  const rows = oddsMapRows();
  if (match) {
    return (
      rows.find(
        (row) =>
          sameSportteryIdentity(row.matchId, match.matchId) ||
          sameSportteryIdentity(row.sportteryKey, match.sportteryKey) ||
          sameSportteryIdentity(row.cloudMatchId, match.cloudMatchId) ||
          (row.no && match.no && normalizedIssueNo(row.no) === normalizedIssueNo(match.no))
      ) ||
      rows.find(
        (row) =>
          row.ticaiDate === match.date &&
          looseTeamMatch(match.home, row.home) &&
          looseTeamMatch(match.away, row.away)
      ) ||
      rows.find(
        (row) =>
          row.matchDate === match.date &&
          looseTeamMatch(match.home, row.home) &&
          looseTeamMatch(match.away, row.away)
      ) ||
      rows.find((row) => looseTeamMatch(match.home, row.home) && looseTeamMatch(match.away, row.away))
    );
  }
  return rows.find((row) =>
    row.no === matchOrNo ||
    normalizedIssueNo(row.no) === normalizedIssueNo(matchOrNo) ||
    sameSportteryIdentity(row.matchId, matchOrNo) ||
    sameSportteryIdentity(row.sportteryKey, matchOrNo) ||
    sameSportteryIdentity(row.cloudMatchId, matchOrNo)
  );
}

function marketConsistency(no, pred) {
  const row = spRadarForMatch(no);
  if (!row?.strongest || !pred) {
    if (pred) return lockedMarketFallback(pred);
    return {
      score: 0,
      label: "等待数据",
      detail: "SP 历史或模型锁版不足，暂不计算一致性。",
      chips: ["待补 SP"],
    };
  }
  const had = row.analyses.find((item) => item.playType === "had")?.strongest;
  const hhad = row.analyses.find((item) => item.playType === "hhad")?.strongest;
  const ttg = row.analyses.find((item) => item.playType === "ttg")?.strongest;
  let score = 58;
  const chips = [];
  if (had?.trend === "strengthening" && had.code === pickToMarketCode(pred.pick)) {
    score += 16;
    chips.push("胜平负同向");
  } else if (had?.trend === "strengthening") {
    score -= 10;
    chips.push("胜平负反向");
  }
  if (hhad?.trend === "strengthening" && hhad.code === pickToMarketCode(handicapPick(pred))) {
    score += 14;
    chips.push("让球同向");
  } else if (hhad?.trend === "strengthening") {
    score -= 12;
    chips.push("让球冲突");
  }
  const totalBand = totalPickBand(pred.totalGoalsPick);
  const ttgLow = ttg && ["0", "1", "2"].includes(ttg.code);
  const ttgHigh = ttg && ["4", "5", "6", "7"].includes(ttg.code);
  if ((totalBand === "low" && ttgLow) || (totalBand === "high" && ttgHigh)) {
    score += 12;
    chips.push("进球同向");
  } else if ((totalBand === "low" && ttgHigh) || (totalBand === "high" && ttgLow)) {
    score -= 12;
    chips.push("进球冲突");
  }
  score -= row.riskFlags.length * 7;
  score = clamp(score, 0, 100);
  return {
    score,
    label: score >= 78 ? "高度一致" : score >= 62 ? "基本一致" : score >= 46 ? "存在分歧" : "强冲突",
    detail: row.riskFlags.length ? row.riskFlags.join(" / ") : spRadarModelHint(row),
    chips: chips.length ? chips : [row.pressureLevel],
  };
}

function lockedMarketFallback(pred) {
  const grade = confidenceGrade(pred);
  const baseScore = { A: 72, "A-": 68, B: 62, "B-": 58, "C+": 55, C: 52, D: 44 }[grade] || 54;
  const hasLine = Boolean(pred.lineMovement || pred.institutionLine || pred.marketGap);
  const riskCount = [pred.eventRisk, pred.keyFailureRisk].filter(Boolean).length;
  const score = clamp(baseScore + (hasLine ? 6 : 0) - riskCount * 3, 38, 70);
  const details = [
    pred.lineMovement,
    pred.eventRisk ? `事件风险：${pred.eventRisk}` : "",
    pred.keyFailureRisk ? `错层风险：${pred.keyFailureRisk}` : "",
  ].filter(Boolean);
  return {
    score,
    label: "锁版风险复核",
    detail: details.join(" / ") || "实时 SP 已下架，改用赛前锁版盘口与风险字段复核。",
    chips: [
      hasLine ? "锁版盘口" : "无 SP 快照",
      pred.eventRisk ? "事件风险" : "",
      pred.keyFailureRisk ? "错层风险" : "",
    ].filter(Boolean),
  };
}

function renderMarketConsistencyPanel(no, pred) {
  const consistency = marketConsistency(no, pred);
  return `
    <section class="match-page-section consistency-panel">
      <span>跨市场一致性评分</span>
      <div class="consistency-head">
        <strong>${consistency.score || "--"}</strong>
        <em>${consistency.label}</em>
      </div>
      <div class="sp-radar-flags">${consistency.chips.map((item) => `<span>${item}</span>`).join("")}</div>
      <p>${consistency.detail}</p>
    </section>
  `;
}

function renderModelInputChecklist(no, pred) {
  const evidence = modelEvidenceScore(no, pred);
  return `
    <section class="match-page-section input-checklist">
      <span>模型输入完整度</span>
      <div class="input-scoreline">
        <strong>${evidence.score}%</strong>
        <div><i style="width:${evidence.score}%"></i></div>
        <em>${evidence.readyCount}/${evidence.total} 类证据已接入</em>
      </div>
      <div class="input-check-grid">
        ${evidence.checks
          .map(
            ([label, ok, note]) => `
              <article class="${ok ? "ready" : "pending"}">
                <b>${ok ? "已接入" : "待接入"}</b>
                <strong>${label}</strong>
                <em>${note}</em>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function spRadarModelHint(row) {
  if (!row?.strongest) return "SP 历史快照不足，模型暂不采用盘口漂移校验。";
  const flags = row.riskFlags || [];
  if (flags.some((item) => item.includes("让负") || item.includes("低进球"))) {
    return "模型应降低追深盘和大比分权重，优先复核不穿盘、小比分或平局分支。";
  }
  if (flags.some((item) => item.includes("让胜") || item.includes("大球"))) {
    return "模型可提高强队推进、穿盘或开放局权重，但仍需和战术脚本交叉验证。";
  }
  return row.pressureLevel === "强异动"
    ? "盘口温度出现强变化，模型需要复核原锁版结论是否仍有市场支撑。"
    : "盘口变化暂未形成明显反向信号，可作为原模型判断的温度参考。";
}

function renderSpRadarPanel(no, variant = "card") {
  const row = spRadarForMatch(no);
  if (!row?.strongest) return "";
  const trends = row.analyses.map(renderPlayTrend).join("");
  const flags = row.riskFlags.length
    ? row.riskFlags.map((item) => `<span>${item}</span>`).join("")
    : `<span>${row.pressureLevel}</span>`;
  return `
    <section class="sp-radar-model ${variant}">
      <div>
        <span>SP 雷达校验</span>
        <strong>${row.strongest.market} · ${row.strongest.label} ${deltaText(row.strongest.weightDelta)}</strong>
      </div>
      <div class="sp-radar-trends">${trends}</div>
      <div class="sp-radar-flags">${flags}</div>
      <p>${spRadarModelHint(row)}</p>
    </section>
  `;
}

function oddsMapRowKey(row = {}) {
  return sportteryItemKey(row) || `odds-${row.no || row.issue || ""}-${row.ticaiDate || row.matchDate || ""}`;
}

function findOddsMapRowByKey(key = "") {
  const decoded = decodeURIComponent(key || "");
  return oddsMapRows().find((row) => oddsMapRowKey(row) === decoded);
}

function oddsMapScoreForRow(row = {}) {
  const result = resultForSportteryItem(row);
  const resultScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  if (resultScore) return { scoreText: resultScore, score: parseScore(resultScore), source: "体彩赛果", item: result };

  const liveScore = liveScoreForSportteryItem(row);
  const liveScoreText = liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "";
  if (liveScoreText) return { scoreText: liveScoreText, score: parseScore(liveScoreText), source: "实时完赛", item: liveScore };

  const match = matchFromOddsItem(row) || matchFromResultItem(row) || matches.find((item) => item.no === row.no);
  const matchScore = normalizeResultScore(match?.score);
  if (matchScore) return { scoreText: matchScore, score: parseScore(matchScore), source: "本地赛果", item: match };

  return null;
}

function oddsMapPredictionForRow(row = {}) {
  return sportteryPredictionForItem(row) || latestPredictionFor(row.no);
}

function splitOddsMapRows(rows) {
  const backtestRows = [];
  const preRows = [];
  rows.forEach((row) => {
    const scoreData = oddsMapScoreForRow(row);
    if (scoreData?.score) {
      backtestRows.push(row);
    } else {
      preRows.push(row);
    }
  });
  return { preRows, backtestRows };
}

function oddsMapRowReview(row = {}) {
  const scoreData = oddsMapScoreForRow(row);
  const pred = oddsMapPredictionForRow(row);
  if (!scoreData?.score) return { row, pred, scoreData: null };

  const scoreText = scoreData.scoreText;
  const actualDirection = direction(scoreText);
  const handicap = row.handicap || reviewHandicapLine(pred);
  const actualHandicap = handicapDirection(scoreText, handicap);
  const goalPickText = `${pred?.totalGoalsPick || ""} ${pred?.goals || ""}`;
  const scorePickText = `${pred?.mainScore || ""} ${pred?.counterScore || ""}`;
  const total = scoreData.score.total;
  const directionHit = pred?.pick ? pred.pick.includes(actualDirection) : null;
  const handicapHit = pred?.hPick && actualHandicap ? pred.hPick.includes(actualHandicap) : null;
  const totalGoalsHit = goalPickText ? goalPickText.includes(`${total}球`) || goalPickText.includes(`${total}`) : null;
  const scoreHit = scorePickText ? scorePickText.includes(scoreText) : null;
  const driftHits = [];
  if (row.riskFlags.includes("低进球权重抬升")) driftHits.push(total <= 2 ? "低进球命中" : "低进球偏离");
  if (row.riskFlags.includes("大球权重抬升")) driftHits.push(total >= 4 ? "大球命中" : "大球偏离");
  if (actualHandicap && row.riskFlags.some((flag) => flag.includes(actualHandicap))) driftHits.push("让球冲突命中");
  return {
    row,
    pred,
    scoreData,
    actualDirection,
    actualHandicap,
    handicap,
    directionHit,
    handicapHit,
    totalGoalsHit,
    scoreHit,
    driftHits,
  };
}

function boolText(value) {
  if (value === true) return "命中";
  if (value === false) return "未中";
  return "未锁";
}

function boolTone(value) {
  if (value === true) return "hit";
  if (value === false) return "miss";
  return "pending";
}

function spBacktestRows(rows) {
  const verified = rows
    .map((row) => {
      const review = oddsMapRowReview(row);
      if (!review.scoreData?.score) return null;
      return { row, score: review.scoreData.score, review };
    })
    .filter(Boolean);
  const lowGoalRows = verified.filter(({ row }) => row.riskFlags.includes("低进球权重抬升"));
  const highGoalRows = verified.filter(({ row }) => row.riskFlags.includes("大球权重抬升"));
  const conflictRows = verified.filter(({ row }) => row.riskFlags.some((flag) => /让负|让胜/.test(flag)));
  const strongRows = verified.filter(({ row }) => row.pressureLevel === "强异动");
  const lowGoalHits = lowGoalRows.filter(({ score }) => score.total <= 2).length;
  const highGoalHits = highGoalRows.filter(({ score }) => score.total >= 4).length;
  const conflictHits = conflictRows.filter(({ row, review }) => row.riskFlags.some((flag) => review.actualHandicap && flag.includes(review.actualHandicap))).length;
  return [
    ["低进球权重抬升", lowGoalHits, lowGoalRows.length, "验证小比分是否被提前识别"],
    ["大球权重抬升", highGoalHits, highGoalRows.length, "验证开放局和打花局温度"],
    ["让球冲突信号", conflictHits, conflictRows.length, "验证不穿盘/穿盘预警"],
    ["强异动样本", strongRows.length, verified.length, "记录需要优先复核的场次"],
  ];
}

function renderSpBacktest(rows) {
  const container = document.querySelector("#odds-backtest");
  if (!container) return;
  const stats = spBacktestRows(rows);
  container.innerHTML = `
    <div class="stat-title-line">
      <h3>SP 漂移回测</h3>
      <span class="mini-pill">开盘到最新 / 赛果对照</span>
    </div>
    <div class="sp-backtest-grid">
      ${stats
        .map(
          ([label, hit, total, note]) => `
            <article>
              <span>${label}</span>
              <strong>${hit}/${total || 0}</strong>
              <em>${total ? hitRate(hit, total) : "等待样本"}</em>
              <p>${note}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOddsPreTable(rows) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${row.issue || row.no}</td>
          <td>${row.league}</td>
          <td class="text-cell">${row.home} vs ${row.away}</td>
          <td>${formatDate(row.ticaiDate)}</td>
          <td>${row.handicap}</td>
          <td>${row.analyses.map(renderPlayTrend).join("")}</td>
          <td><strong>${row.pressureLevel}</strong></td>
          ${(() => {
            const metrics = oddsMapResearchMetrics(row);
            return `
              <td><span class="market-metric ${metrics.tone}">${metrics.spreadText}</span></td>
              <td><span class="market-metric ${metrics.tone}">${metrics.gapText} / ${metrics.valueText}</span></td>
            `;
          })()}
          <td>${row.riskFlags.length ? row.riskFlags.join(" / ") : "结构正常"}</td>
        </tr>
      `
    )
    .join("") || `<tr><td colspan="10" class="empty-cell">暂无赛前 SP 历史，先运行体彩实时抓取。</td></tr>`;

  return `
    <div class="review-record-wrap compact odds-map-wrap">
      <table class="review-record-table odds-map-record-table">
        <thead>
          <tr>
            <th>场次</th>
            <th>赛事</th>
            <th>对阵</th>
            <th>日期</th>
            <th>让球</th>
            <th>市场变化</th>
            <th>强度</th>
            <th>离散度</th>
            <th>模型缺口 / 凯利</th>
            <th>提示</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderOddsBacktestTable(rows) {
  const tableRows = rows
    .map((row) => {
      const review = oddsMapRowReview(row);
      const key = encodeURIComponent(oddsMapRowKey(row));
      const predText = review.pred
        ? `${dash(review.pred.pick)} / ${dash(review.pred.hPick)} / ${dash(review.pred.totalGoalsPick)}`
        : "未锁版";
      const driftText = row.riskFlags.length ? row.riskFlags.join(" / ") : row.pressureLevel;
      const modelText = [
        `胜平负${boolText(review.directionHit)}`,
        `让球${boolText(review.handicapHit)}`,
        `进球${boolText(review.totalGoalsHit)}`,
      ].join(" · ");
      return `
        <tr>
          <td>${row.issue || row.no}</td>
          <td class="text-cell">${row.home} vs ${row.away}</td>
          <td><strong>${review.scoreData?.scoreText || "-"}</strong><em class="odds-score-source">${review.scoreData?.source || ""}</em></td>
          <td>${predText}</td>
          <td>${driftText}</td>
          <td>${modelText}</td>
          <td>${review.driftHits.length ? review.driftHits.join(" / ") : "记录为样本"}</td>
          <td><button type="button" class="odds-backtest-detail-btn" data-odds-backtest-detail="${key}">查看</button></td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="8" class="empty-cell">暂无可回测赛果。</td></tr>`;

  return `
    <div class="review-record-wrap compact odds-map-wrap">
      <table class="review-record-table odds-map-record-table odds-backtest-record-table">
        <thead>
          <tr>
            <th>场次</th>
            <th>对阵</th>
            <th>比分</th>
            <th>锁版</th>
            <th>漂移信号</th>
            <th>模型校验</th>
            <th>提示</th>
            <th>单场</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function openOddsBacktestModal(encodedKey = "") {
  const row = findOddsMapRowByKey(encodedKey);
  if (!row) return;
  const review = oddsMapRowReview(row);
  const metrics = oddsMapResearchMetrics(row);
  const pred = review.pred;
  const key = oddsMapRowKey(row);
  document.querySelector(".odds-backtest-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "odds-backtest-modal";
  modal.innerHTML = `
    <div class="odds-backtest-dialog" role="dialog" aria-modal="true" aria-label="${row.home} vs ${row.away} 回测详情">
      <header>
        <div>
          <span>${row.issue || row.no} · ${row.league || "世界杯"}</span>
          <strong>${row.home} vs ${row.away}</strong>
          <em>${formatDate(row.ticaiDate)} · 让球 ${row.handicap || review.handicap || "-"}</em>
        </div>
        <button type="button" aria-label="关闭" data-odds-backtest-close>×</button>
      </header>
      <section class="odds-backtest-dialog-grid">
        <article>
          <span>赛果</span>
          <strong>${review.scoreData?.scoreText || "-"}</strong>
          <em>${review.scoreData?.source || "未命中赛果"}</em>
        </article>
        <article>
          <span>锁版结论</span>
          <strong>${pred ? `${dash(pred.pick)} / ${dash(pred.hPick)}` : "未锁版"}</strong>
          <em>${pred ? dash(pred.totalGoalsPick) : "未写入锁版"}</em>
        </article>
        <article>
          <span>市场漂移</span>
          <strong>${row.strongest ? `${row.strongest.market} ${row.strongest.label}` : "-"}</strong>
          <em>${row.strongest ? `${deltaText(row.strongest.weightDelta)} · SP ${row.strongest.openingSp} → ${row.strongest.sp}` : "快照不足"}</em>
        </article>
        <article>
          <span>概率缺口</span>
          <strong>${metrics.gapText}</strong>
          <em>离散度 ${metrics.spreadText} · 凯利 ${metrics.valueText}</em>
        </article>
      </section>
      <section class="odds-backtest-status-grid">
        <span class="${boolTone(review.directionHit)}">胜平负：${boolText(review.directionHit)}</span>
        <span class="${boolTone(review.handicapHit)}">让球：${boolText(review.handicapHit)}</span>
        <span class="${boolTone(review.totalGoalsHit)}">进球：${boolText(review.totalGoalsHit)}</span>
        <span class="${boolTone(review.scoreHit)}">比分：${boolText(review.scoreHit)}</span>
      </section>
      <section class="odds-backtest-notes">
        <p><b>漂移提示：</b>${row.riskFlags.length ? row.riskFlags.join(" / ") : row.pressureLevel}</p>
        <p><b>回测结论：</b>${review.driftHits.length ? review.driftHits.join(" / ") : "本场作为盘口漂移样本保留，后续扩大样本后再统计稳定性。"}</p>
      </section>
      <footer>
        <button type="button" class="secondary" data-odds-backtest-close>关闭</button>
        <button type="button" data-odds-open-detail="${key}">进入单场详情</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
}

function oddsMapResearchMetrics(row) {
  const pred = oddsMapPredictionForRow(row);
  const math = oddsMathForMatch(row.no, pred);
  if (!math?.normal.entries.length) {
    return {
      spreadText: "-",
      gapText: pred ? "待赔率" : "待锁版",
      valueText: "-",
      tone: "muted",
    };
  }
  const gap = math.probGap;
  const value = math.valueIndex;
  return {
    spreadText: probabilityPercent(math.spread, 1),
    gapText: Number.isFinite(gap) ? deltaText(gap, 1) : pred ? "未匹配" : "待锁版",
    valueText: Number.isFinite(value) ? `${value.toFixed(1)}%` : "-",
    tone: Number.isFinite(gap) && gap > 0.03 ? "hot" : Number.isFinite(gap) && gap < -0.03 ? "cold" : "flat",
  };
}

function renderOddsMap() {
  const cards = document.querySelector("#odds-map-cards");
  const table = document.querySelector("#odds-map-table");
  if (!cards || !table) return;

  const rows = oddsMapRows();
  const { preRows, backtestRows } = splitOddsMapRows(rows);
  document.querySelectorAll("[data-odds-map-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.oddsMapView === activeOddsMapView);
  });
  const panel = document.querySelector("#odds-map");
  panel?.classList.toggle("odds-map-backtest-view", activeOddsMapView === "backtest");
  panel?.classList.toggle("odds-map-pre-view", activeOddsMapView !== "backtest");
  renderSpBacktest(backtestRows);
  const liveCount = document.querySelector("#odds-map-live-count");
  const updated = document.querySelector("#odds-map-updated");
  if (liveCount) liveCount.textContent = `${preRows.length} 赛前 / ${backtestRows.length} 回测`;
  if (updated) updated.textContent = formatCapturedAt(spHistoryData.importedAt) || "等待 SP 历史";

  if (activeOddsMapView === "backtest") {
    cards.innerHTML = `
      <div class="odds-radar-summary">
        <article><span>回测样本</span><strong>${backtestRows.length}</strong><em>已有赛果场次</em></article>
        <article><span>已锁版</span><strong>${backtestRows.filter((row) => oddsMapPredictionForRow(row)).length}</strong><em>可校验模型结论</em></article>
        <article><span>漂移命中</span><strong>${backtestRows.filter((row) => oddsMapRowReview(row).driftHits.length).length}</strong><em>SP 信号对上赛果</em></article>
        <article><span>强异动</span><strong>${backtestRows.filter((row) => row.pressureLevel === "强异动").length}</strong><em>优先复盘样本</em></article>
      </div>
    `;
    table.innerHTML = renderOddsBacktestTable(backtestRows);
    return;
  }

  const hotRows = preRows
    .filter((row) => row.strongest)
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 4);
  const highCount = preRows.filter((row) => row.pressureLevel === "强异动").length;
  const conflictCount = preRows.filter((row) => row.riskFlags.length).length;
  const hadHomeHot = preRows.filter((row) =>
    row.analyses.some((item) => item.playType === "had" && item.strongest?.code === "H" && item.strongest?.trend === "strengthening")
  ).length;

  cards.innerHTML = `
    <div class="odds-radar-summary">
      <article><span>赛前监控</span><strong>${preRows.length}</strong><em>未完场开盘场次</em></article>
      <article><span>强异动</span><strong>${highCount}</strong><em>SP 变化超过 8%</em></article>
      <article><span>冲突信号</span><strong>${conflictCount}</strong><em>胜平负 / 让球不一致</em></article>
      <article><span>主胜升温</span><strong>${hadHomeHot}</strong><em>胜平负主胜权重抬升</em></article>
    </div>
    <div class="odds-spotlight-grid">
      ${
        hotRows.length
          ? hotRows
              .map(
                (row) => `
                  <article class="odds-spotlight-card">
                    <span>${row.issue || row.no} · ${row.league}</span>
                    <strong>${row.home} vs ${row.away}</strong>
                    <p>${row.strongest.market} 的 ${row.strongest.label} 权重变化 ${deltaText(row.strongest.weightDelta)}，SP ${row.strongest.openingSp} → ${row.strongest.sp}。${(() => {
                      const metrics = oddsMapResearchMetrics(row);
                      return ` 概率缺口 ${metrics.gapText}，离散度 ${metrics.spreadText}。`;
                    })()}</p>
                    <em>${row.riskFlags[0] || row.pressureLevel}</em>
                  </article>
                `
              )
              .join("")
          : "<p class='empty'>暂无可用 SP 历史快照</p>"
      }
    </div>
  `;

  table.innerHTML = renderOddsPreTable(preRows);
}

function renderAll() {
  applyResultBackfill();
  renderHome();
  renderSignals();
  renderSportteryPool();
  renderSiteLocks();
  renderGlobalStats();
  renderOddsMap();
  renderToday();
  renderSchedule();
  renderPath();
  renderKnockout();
  renderStats();
  renderOdds();
  renderModel();
  renderReview();
}

function renderInitialHomeOnly() {
  applyResultBackfill();
  renderHome();
  renderSignals();
}

function runWhenPageIdle(task, timeout = 2200) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout });
    return;
  }
  setTimeout(task, Math.min(timeout, 1200));
}

function currentRouteNeedsWorldCupStaticData() {
  const hash = window.location.hash || "";
  return !hash || hash === "#model-stats" || hash === "#worldcup" || hash === "#worldcup-knockout" || hash === "#worldcup-review" || /^#match-/.test(hash);
}

function currentRouteNeedsCloudBootstrap() {
  const hash = window.location.hash || "";
  return hash === "#sporttery" || hash === "#locks" || hash === "#model-stats" || hash === "#odds-map" || /^#sporttery-match-/.test(hash);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activateTab(tab.dataset.tab);
  });
});

homeEnters.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#worldcup") {
      window.location.hash = "worldcup";
      return;
    }
    showDashboard();
    activateTab("path");
  });
});

siteHome?.addEventListener("click", () => {
  if (window.location.hash) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
  showHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

sportteryPoolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#sporttery") {
      window.location.hash = "sporttery";
      return;
    }
    activateTab("sporttery-pool");
  });
});

siteLocksButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#locks") {
      window.location.hash = "locks";
      return;
    }
    activateTab("site-locks");
  });
});

modelIntroButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#model-intro") {
      window.location.hash = "model-intro";
      return;
    }
    activateTab("model-intro");
  });
});

modelStatsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#model-stats") {
      window.location.hash = "model-stats";
      return;
    }
    activateTab("model-stats");
  });
});

oddsMapButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#odds-map") {
      window.location.hash = "odds-map";
      return;
    }
    activateTab("odds-map");
  });
});

aboutSiteButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#about") {
      window.location.hash = "about";
      return;
    }
    activateTab("about-site");
  });
});

document.addEventListener(
  "click",
  (event) => {
    const sportteryCard = event.target.closest("[data-sporttery-match-key], [data-home-sporttery-key]");
    if (!sportteryCard) return;
    const key = sportteryCard.dataset.sportteryMatchKey || sportteryCard.dataset.homeSportteryKey;
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    openSportteryMatchPage(key);
  },
  true
);

document.querySelector(".home-screen")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-home-match-no], [data-home-sporttery-key]");
  if (!card) return;
  if (card.dataset.homeSportteryKey) {
    openSportteryMatchPage(card.dataset.homeSportteryKey);
    return;
  }
  openMatchPage(card.dataset.homeMatchNo);
});

document.querySelector("#sporttery-pool")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-pool-view]");
  if (viewButton) {
    activeSportteryPoolView = viewButton.dataset.poolView || "open";
    renderSportteryPool();
    return;
  }
  const card = event.target.closest("[data-sporttery-match-key]");
  if (!card) return;
  openSportteryMatchPage(card.dataset.sportteryMatchKey);
});

document.querySelector("#knockout")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-knockout-match]");
  if (!card) return;
  openMatchPage(card.dataset.knockoutMatch, "knockout");
});

document.querySelector("#odds-map")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-odds-map-view]");
  if (viewButton) {
    activeOddsMapView = viewButton.dataset.oddsMapView || "pre";
    renderOddsMap();
    return;
  }
  const detailButton = event.target.closest("[data-odds-backtest-detail]");
  if (detailButton) {
    openOddsBacktestModal(detailButton.dataset.oddsBacktestDetail);
  }
});

document.body.addEventListener("click", (event) => {
  const globalStatsModal = event.target.closest(".global-stats-modal");
  const globalStatsClose = event.target.closest("[data-global-stats-close]");
  const globalStatsBackdrop = event.target.classList?.contains("global-stats-modal") ? event.target : null;
  if (globalStatsClose || globalStatsBackdrop) {
    document.querySelector(".global-stats-modal")?.remove();
    return;
  }
  if (globalStatsModal) {
    const sportteryButton = event.target.closest("[data-review-open-sporttery]");
    if (sportteryButton) {
      document.querySelector(".global-stats-modal")?.remove();
      openSportteryMatchPage(sportteryButton.dataset.reviewOpenSporttery, "model-stats");
      return;
    }
    const matchButton = event.target.closest("[data-review-open-match]");
    if (matchButton) {
      document.querySelector(".global-stats-modal")?.remove();
      openMatchPage(matchButton.dataset.reviewOpenMatch, "model-stats");
      return;
    }
  }
  const closeButton = event.target.closest("[data-odds-backtest-close]");
  const modalBackdrop = event.target.classList?.contains("odds-backtest-modal") ? event.target : null;
  if (closeButton || modalBackdrop) {
    document.querySelector(".odds-backtest-modal")?.remove();
    return;
  }
  const detailButton = event.target.closest("[data-odds-open-detail]");
  if (detailButton) {
    document.querySelector(".odds-backtest-modal")?.remove();
    openSportteryMatchPage(detailButton.dataset.oddsOpenDetail, "odds-map");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelector(".odds-backtest-modal")?.remove();
    document.querySelector(".global-stats-modal")?.remove();
  }
});

document.querySelector("#site-locks")?.addEventListener("click", (event) => {
  const sportteryCard = event.target.closest("[data-lock-sporttery]");
  if (sportteryCard) {
    openSportteryMatchPage(sportteryCard.dataset.lockSporttery, "locks");
    return;
  }
  const worldCupCard = event.target.closest("[data-lock-worldcup]");
  if (worldCupCard) {
    openMatchPage(worldCupCard.dataset.lockWorldcup, "locks");
  }
});

document.querySelector("#review-table")?.addEventListener("click", (event) => {
  const sportteryButton = event.target.closest("[data-review-open-sporttery]");
  if (sportteryButton) {
    openSportteryMatchPage(sportteryButton.dataset.reviewOpenSporttery, "review");
    return;
  }
  const matchButton = event.target.closest("[data-review-open-match]");
  if (matchButton) {
    openMatchPage(matchButton.dataset.reviewOpenMatch, "review");
    return;
  }
  const button = event.target.closest("[data-review-view]");
  if (!button) return;
  activeReviewView = button.dataset.reviewView;
  renderReview();
});

document.querySelector("#review-table")?.addEventListener("change", (event) => {
  const select = event.target.closest("[data-review-date]");
  if (!select) return;
  activeReviewDate = select.value;
  renderReview();
});

document.querySelector("#global-stats-table")?.addEventListener("change", (event) => {
  const select = event.target.closest("[data-global-stats-date]");
  if (!select) return;
  activeGlobalStatsDate = select.value;
  renderGlobalStats();
});

document.querySelector("#global-stats-league-filter")?.addEventListener("change", (event) => {
  const leagueSelect = event.target.closest("[data-global-stats-league]");
  const dateSelect = event.target.closest("[data-global-stats-date]");
  if (leagueSelect) {
    activeGlobalStatsLeague = leagueSelect.value;
  } else if (dateSelect) {
    activeGlobalStatsDate = dateSelect.value;
  } else {
    return;
  }
  renderGlobalStats();
});

document.querySelector("#global-stats-table")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-global-stats-maximize]")) {
    openGlobalStatsModal();
    return;
  }
  const sportteryButton = event.target.closest("[data-review-open-sporttery]");
  if (sportteryButton) {
    openSportteryMatchPage(sportteryButton.dataset.reviewOpenSporttery, "model-stats");
    return;
  }
  const matchButton = event.target.closest("[data-review-open-match]");
  if (!matchButton) return;
  openMatchPage(matchButton.dataset.reviewOpenMatch, "model-stats");
});

document.querySelector("#today-grid")?.addEventListener("click", (event) => {
  const sportteryCard = event.target.closest("[data-sporttery-match-key]");
  if (sportteryCard) {
    openSportteryMatchPage(sportteryCard.dataset.sportteryMatchKey);
    return;
  }
  const card = event.target.closest("[data-match-no]");
  if (!card) return;
  openMatchPage(card.dataset.matchNo);
});

document.querySelector(".signal-strip")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-signal-page]");
  if (!card) return;
  openSignalPage(card.dataset.signalPage);
});

document.querySelector(".signal-strip")?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const card = event.target.closest("[data-signal-page]");
  if (!card) return;
  event.preventDefault();
  openSignalPage(card.dataset.signalPage);
});

document.querySelector("#signal-detail")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-signal-back]")) {
    activateTab("path");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const card = event.target.closest("[data-match-no]");
  if (!card) return;
  openMatchPage(card.dataset.matchNo);
});

document.querySelector("#match-detail")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-detail-back]")) {
    closeMatchPage();
    return;
  }
  const mode = event.target.closest("[data-match-mode]");
  if (mode) {
    const root = mode.closest("#match-detail");
    root?.querySelectorAll("[data-match-mode]").forEach((button) => button.classList.toggle("active", button === mode));
    root?.querySelectorAll("[data-match-mode-panel]").forEach((panel) => {
      const active = panel.dataset.matchModePanel === mode.dataset.matchMode;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    if (mode.dataset.matchMode === "full") {
      sendAnalyticsEvent("click_event", { target: "full_projection" });
    }
    return;
  }
  const model = event.target.closest("[data-detail-model]");
  if (model) {
    openModelForMatch(model.dataset.detailModel);
    return;
  }
  const review = event.target.closest("[data-detail-review]");
  if (review) {
    openReviewForMatch(review.dataset.detailReview);
    return;
  }
  if (event.target.closest("[data-detail-global-stats]")) {
    activateTab("model-stats");
  }
});

searchInput?.addEventListener("input", renderSchedule);
statusFilter?.addEventListener("change", renderSchedule);
resetButton?.addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "all";
  renderSchedule();
});

document.querySelector(".schedule-subtabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-view]");
  if (!button) return;
  document.querySelectorAll("[data-schedule-view]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  const view = button.dataset.scheduleView;
  document.querySelector("#schedule-list").hidden = view !== "current";
  document.querySelector("#schedule-2022-list").hidden = view !== "wc2022";
});

document.querySelector("#odds")?.addEventListener("click", (event) => {
  const option = event.target.closest(".jczq-odd, .jczq-sheet-option");
  if (option && !option.disabled) {
    const { betKey, no, issue, play, pick, odds } = option.dataset;
    if (oddsSelections.has(betKey)) {
      oddsSelections.delete(betKey);
    } else {
      oddsSelections.set(betKey, { no, issue, play, pick, odds });
    }
    renderOdds();
    if (!document.querySelector("#jczq-overlay")?.hidden && activeSheetMatchNo) renderMoreSheet(activeSheetMatchNo);
    return;
  }

  const dateToggle = event.target.closest("[data-date-toggle]");
  if (dateToggle) {
    const date = dateToggle.dataset.dateToggle;
    if (collapsedOddsDates.has(date)) collapsedOddsDates.delete(date);
    else collapsedOddsDates.add(date);
    renderOdds();
    return;
  }

  const more = event.target.closest("[data-more]");
  if (more) {
    renderMoreSheet(more.dataset.more);
    return;
  }

  const index = event.target.closest("[data-index]");
  if (index) {
    const item = findOddsItem(index.dataset.index);
    const match = matches.find((m) => m.no === index.dataset.index);
    showJczqSheet("指数", `
      <p class="jczq-sheet-note">${item?.issue || ""} ${match?.home || item?.home} vs ${match?.away || item?.away}</p>
      <div class="jczq-ticket-list">
        ${(item?.scoreOdds || []).slice(0, 8).map((odd) => `<span>比分 ${odd.score} @ ${odd.odds}</span>`).join("")}
        ${(item?.totalGoalsOdds || []).slice(0, 8).map((odd) => `<span>总进球 ${odd.goals}球 @ ${odd.odds}</span>`).join("")}
      </div>
    `);
    return;
  }

  const action = event.target.closest("[data-jczq-action]")?.dataset.jczqAction;
  if (action === "close-sheet") {
    closeJczqSheet();
    return;
  }
  if (action === "filter") {
    showJczqSheet("筛选比赛", `
      <div class="jczq-filter-grid">
        <button type="button" class="selected">世界杯</button>
        <button type="button">单关</button>
        <button type="button">未开赛</button>
        <button type="button">有让球</button>
      </div>
      <p class="jczq-sheet-note">本地看板目前只接入世界杯竞彩数据，筛选按钮按原站样式保留。</p>
    `);
    return;
  }
  if (action === "menu") {
    showJczqSheet("快捷入口", `
      <div class="jczq-menu-list">
        <button type="button">我的方案</button>
        <button type="button">开奖结果</button>
        <button type="button">投注记录</button>
        <button type="button">玩法规则</button>
      </div>
    `);
    return;
  }
  if (action === "app") {
    showJczqSheet("澳客APP", `<p class="jczq-sheet-note">原站这里会尝试唤起澳客APP；本地看板不跳外部应用。</p>`);
    return;
  }
  if (action === "back") {
    document.querySelector('[data-tab="today"]')?.click();
    return;
  }

  const history = event.target.closest("[data-history]");
  if (history) {
    const item = findOddsItem(history.dataset.history);
    const match = matches.find((m) => m.no === history.dataset.history);
    showJczqSheet("比赛详情", `
      <p class="jczq-sheet-note">${item?.issue || ""} ${match?.home || item?.home} vs ${match?.away || item?.away}</p>
      <p class="jczq-sheet-note">原站会进入历史交锋、近期战绩和指数页；这里先保留为本地详情入口。</p>
    `);
    return;
  }

  const note = event.target.closest("[data-note]");
  if (note) {
    const item = findOddsItem(note.dataset.note);
    showJczqSheet("专家态度", `
      <p class="jczq-sheet-note">${item?.issue || ""} 态度入口。原站会打开推荐/专栏内容，本地不抓取付费或登录内容。</p>
    `);
    return;
  }

  if (event.target.closest("#confirm-odds-slip")) {
    const selections = [...oddsSelections.values()];
    showJczqSheet("方案确认", `
      <p class="jczq-sheet-note">已选择 ${selections.length} 项：</p>
      <div class="jczq-ticket-list">
        ${selections.map((item) => `<span>${item.issue} ${item.play}${item.pick} @ ${item.odds}</span>`).join("")}
      </div>
    `);
    return;
  }

  if (event.target.closest("#clear-odds-slip")) {
    oddsSelections.clear();
    renderOdds();
    if (!document.querySelector("#jczq-overlay")?.hidden && activeSheetMatchNo) renderMoreSheet(activeSheetMatchNo);
  }
});

document.querySelector("#show-ended-odds")?.addEventListener("change", renderOdds);

function analyticsSessionId() {
  try {
    const key = "fde_analytics_session";
    const current = sessionStorage.getItem(key);
    if (current) return current;
    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return "";
  }
}

function analyticsPagePath() {
  return `${window.location.pathname || "/"}${window.location.hash || "#home"}`;
}

function sendAnalyticsEvent(eventType = "page_view", payload = {}) {
  const body = JSON.stringify({
    eventType,
    pagePath: analyticsPagePath(),
    pageTitle: document.title || "",
    sessionId: analyticsSessionId(),
    referrer: document.referrer || "",
    route: window.location.hash || "#home",
    ...payload,
  });
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
  } catch {}
  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

window.addEventListener("hashchange", () => {
  handleRouteFromHash();
  if (currentRouteNeedsWorldCupStaticData()) {
    loadWorldCupStaticDataFallback({ rerender: true });
  }
  if (currentRouteNeedsCloudBootstrap()) {
    loadCloudBootstrapData({ rerender: true });
  }
  sendAnalyticsEvent("page_view");
});

restoreCloudBootstrapCache();
const initialHash = window.location.hash;
if (initialHash) {
  renderCurrentRouteSurfaces();
} else {
  renderInitialHomeOnly();
}
document.body.classList.remove("page-loading"); document.body.classList.add("page-loaded");
handleRouteFromHash();
sendAnalyticsEvent("page_view");
if (!initialHash) {
  runWhenPageIdle(renderAll, 1800);
}
if (currentRouteNeedsCloudBootstrap()) {
  loadCloudBootstrapData({ rerender: true }).then((changed) => {
    if (changed) refreshLiveFootballScoresData({ rerender: true });
    scheduleSportterySpHistoryRefresh();
  });
} else {
  runWhenPageIdle(refreshSportteryCloudData, 500);
}
if (currentRouteNeedsWorldCupStaticData()) {
  loadWorldCupStaticDataFallback({ rerender: true });
}
runWhenPageIdle(() => loadCloudCaseBaseData({ rerender: Boolean(initialHash) }), initialHash ? 2200 : 3600);
runWhenPageIdle(() => {
  if (!currentRouteNeedsWorldCupStaticData()) {
    loadWorldCupStaticDataFallback({ rerender: Boolean(window.location.hash) });
  }
}, initialHash ? 4200 : 2600);
setInterval(refreshSportteryCloudData, 5 * 60 * 1000);

/* ── 返回顶部 ── */
(function(){
  var btn = document.getElementById("back-to-top");
  if (!btn) return;
  var ticking = false;
  window.addEventListener("scroll", function(){
    if (!ticking) {
      requestAnimationFrame(function(){
        btn.classList.toggle("visible", window.scrollY > 400);
        ticking = false;
      });
      ticking = true;
    }
  });
  btn.addEventListener("click", function(){
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

/* ── 滚动浮现观察器 ── */
(function(){
  if (!window.IntersectionObserver) return;
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach(function(el){ observer.observe(el); });

  /* ── 也观察 panel 内新出现的 .reveal ── */
  var panelObserver = new MutationObserver(function(){
    document.querySelectorAll(".reveal:not(._obs)").forEach(function(el){
      el.classList.add("_obs");
      observer.observe(el);
    });
  });
  panelObserver.observe(document.body, { childList: true, subtree: true });
})();

/* ── 渲染完成后为关键模块添加滚动浮现 ── */
(function addRevealAfterRender(){
  var timer = setInterval(function(){
    if (!document.body.classList.contains("page-loaded")) return;
    clearInterval(timer);
    /* 给动态渲染的卡片/区块加上 .reveal */
    document.querySelectorAll(
      ".home-section-head, " +
      ".home-products article, " +
      ".home-research-grid article, " +
      ".about-mission-card, " +
      ".about-flow article, " +
      ".about-split section, " +
      ".about-section-band, " +
      ".about-note, " +
      ".about-disclaimer, " +
      ".model-version-timeline article, " +
      ".model-contract-grid section, " +
      ".model-evidence-grid article, " +
      ".model-intro-hero, " +
      ".model-stats-hero, " +
      ".site-lock-card, " +
      ".odds-map-hero, " +
      ".odds-radar-summary article, " +
      ".odds-spotlight-card, " +
      ".sp-backtest-grid article, " +
      ".insight-card, " +
      ".stats-overview .stat-box, " +
      ".review-record-table tr, " +
      ".odds-map-record-table tr, " +
      ".global-stats-record-table tr, " +
      ".home-upcoming-grid > button, " +
      ".home-countdown-card"
    ).forEach(function(el){
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });
  }, 100);
})();
