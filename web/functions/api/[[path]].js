import { AUTO_DECISION_CUTOFF, BJT_OFFSET_MS, SALE_CLOSE_TIME, addMinutes, bjtAt, bjtParts, caseTags, enrichLockRow, evaluateLock, firstLockText, firstNumber, hasFinalApproval, id, isBlankValue, isDefaultNumber, isWorldCupLeague, isoFromMs, javascript, json, jsonHeaders, lockPayloadShape, lockSummaryFromShape, n, parseArray, parseObject, pickSideText, readJson, requireDb, rowToCase, sha256Hex, sideFromResult } from "./lib/utils.js";

async function edgeCached(request, { ttl, keepSearchParams = [] }, buildResponse) {
  if (request.method !== "GET" || typeof caches === "undefined" || !caches.default) {
    return buildResponse();
  }
  const cacheUrl = new URL(request.url);
  const allowed = new Set(keepSearchParams);
  [...cacheUrl.searchParams.keys()].forEach((key) => {
    if (!allowed.has(key)) cacheUrl.searchParams.delete(key);
  });
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("x-edge-cache", "HIT");
    return new Response(cached.body, { status: cached.status, headers });
  }
  const response = await buildResponse();
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
  headers.set("x-edge-cache", "MISS");
  const cacheable = new Response(response.body, { status: response.status, headers });
  try {
    await caches.default.put(cacheKey, cacheable.clone());
  } catch (error) {
    console.warn("edge microcache write failed", error);
  }
  return cacheable;
}

async function ensureAnalyticsSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      page_path TEXT NOT NULL,
      page_title TEXT,
      session_id TEXT,
      visitor_hash TEXT,
      referrer TEXT,
      country TEXT,
      user_agent TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_page ON analytics_events(page_path, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type, created_at)").run();
}

function canonicalAnalyticsPagePath(value = "/") {
  const pagePath = String(value || "/").slice(0, 240);
  const hashMatch = pagePath.match(/#sporttery-match-(?:id-)?(?:sporttery-)?([A-Za-z0-9_-]+)/);
  if (hashMatch) return `/sporttery-match/${hashMatch[1]}`;
  const pathMatch = pagePath.match(/^\/sporttery-match\/(?:id-)?(?:sporttery-)?([A-Za-z0-9_-]+)\/?$/);
  if (pathMatch) return `/sporttery-match/${pathMatch[1]}`;
  const legacyPathMatch = pagePath.match(/^\/sporttery-match-(?:id-)?(?:sporttery-)?([A-Za-z0-9_-]+)\/?$/);
  if (legacyPathMatch) return `/sporttery-match/${legacyPathMatch[1]}`;
  return pagePath;
}

const analyticsCanonicalPagePathSql = `
  CASE
    WHEN instr(page_path, '#sporttery-match-id-') > 0
      THEN '/sporttery-match/' || substr(page_path, instr(page_path, '#sporttery-match-id-') + length('#sporttery-match-id-'))
    WHEN instr(page_path, '#sporttery-match-sporttery-') > 0
      THEN '/sporttery-match/' || substr(page_path, instr(page_path, '#sporttery-match-sporttery-') + length('#sporttery-match-sporttery-'))
    WHEN instr(page_path, '#sporttery-match-') > 0
      THEN '/sporttery-match/' || substr(page_path, instr(page_path, '#sporttery-match-') + length('#sporttery-match-'))
    WHEN page_path LIKE '/sporttery-match/id-%'
      THEN '/sporttery-match/' || substr(page_path, length('/sporttery-match/id-') + 1)
    WHEN page_path LIKE '/sporttery-match/sporttery-%'
      THEN '/sporttery-match/' || substr(page_path, length('/sporttery-match/sporttery-') + 1)
    WHEN page_path LIKE '/sporttery-match-id-%'
      THEN '/sporttery-match/' || substr(page_path, length('/sporttery-match-id-') + 1)
    WHEN page_path LIKE '/sporttery-match-sporttery-%'
      THEN '/sporttery-match/' || substr(page_path, length('/sporttery-match-sporttery-') + 1)
    WHEN page_path LIKE '/sporttery-match-%'
      THEN '/sporttery-match/' || substr(page_path, length('/sporttery-match-') + 1)
    ELSE page_path
  END
`;

async function trackAnalyticsEvent(db, request) {
  const body = await readJson(request);
  const eventType = String(body.eventType || body.event_type || "page_view").slice(0, 40);
  const pagePath = canonicalAnalyticsPagePath(body.pagePath || body.page_path || "/");
  const pageTitle = String(body.pageTitle || body.page_title || "").slice(0, 160);
  const sessionId = String(body.sessionId || body.session_id || "").slice(0, 80);
  const referrer = String(body.referrer || request.headers.get("referer") || "").slice(0, 240);
  const country = String(request.headers.get("cf-ipcountry") || "").slice(0, 8);
  const userAgent = String(request.headers.get("user-agent") || "").slice(0, 220);
  const ip = request.headers.get("cf-connecting-ip") || "";
  const visitorHash = await sha256Hex(`${ip}|${userAgent}`);
  const payload = {
    route: body.route ? canonicalAnalyticsPagePath(body.route) : "",
    target: body.target || "",
    source: "site",
  };
  await ensureAnalyticsSchema(db);
  const eventId = id("evt");
  await db.prepare(`
    INSERT INTO analytics_events (
      event_id, event_type, page_path, page_title, session_id, visitor_hash, referrer, country, user_agent, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId,
    eventType,
    pagePath,
    pageTitle,
    sessionId,
    visitorHash,
    referrer,
    country,
    userAgent,
    JSON.stringify(payload)
  ).run();
  return { ok: true, eventId };
}

async function analyticsSummary(db, request, env) {
  const token = String(env.ANALYTICS_ADMIN_TOKEN || "").trim();
  const requestToken = String(request.headers.get("x-admin-token") || new URL(request.url).searchParams.get("token") || "").trim();
  if (!token || requestToken !== token) {
    return {
      ok: false,
      status: 403,
      error: "analytics summary is private",
      reason: !token ? "server token is not configured" : !requestToken ? "request token is missing" : "request token does not match",
      hint: "Use /api/analytics/summary?token=YOUR_ANALYTICS_ADMIN_TOKEN",
    };
  }
  await ensureAnalyticsSchema(db);
  const since = new URL(request.url).searchParams.get("since") || "-7 days";
  const total = await db.prepare(`
    SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
  `).bind(since).first();
  const pages = await db.prepare(`
    SELECT ${analyticsCanonicalPagePathSql} AS pagePath, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY ${analyticsCanonicalPagePathSql}
    ORDER BY views DESC
    LIMIT 30
  `).bind(since).all();
  const events = await db.prepare(`
    SELECT event_type AS eventType, COUNT(*) AS count
    FROM analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY event_type
    ORDER BY count DESC
  `).bind(since).all();
  const countries = await db.prepare(`
    SELECT country, COUNT(*) AS views
    FROM analytics_events
    WHERE created_at >= datetime('now', ?) AND country != ''
    GROUP BY country
    ORDER BY views DESC
    LIMIT 20
  `).bind(since).all();
  return {
    ok: true,
    since,
    total,
    pages: pages.results || [],
    events: events.results || [],
    countries: countries.results || [],
  };
}

function xmlEscape(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function sportterySitemap(db) {
  const rows = await db.prepare(`
    SELECT match_id AS matchId, MAX(locked_at) AS lastmod
    FROM locked_predictions
    WHERE lock_type IN ('FINAL_LOCK', 'PRE_LOCK')
    GROUP BY match_id
    ORDER BY lastmod DESC
    LIMIT 500
  `).all();
  const seenMatchIds = new Set();
  const urls = (rows.results || [])
    .map((row) => {
      const matchId = String(row.matchId || "").replace(/^sporttery-/, "").replace(/^id-/, "").trim();
      if (!matchId || seenMatchIds.has(matchId)) return "";
      seenMatchIds.add(matchId);
      const lastmod = String(row.lastmod || "").slice(0, 10);
      return `  <url>\n    <loc>${xmlEscape(`https://ticai-model.com/sporttery-match/${encodeURIComponent(matchId)}`)}</loc>${lastmod ? `\n    <lastmod>${xmlEscape(lastmod)}</lastmod>` : ""}\n  </url>`;
    })
    .filter(Boolean);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://ticai-model.com/</loc>\n  </url>${urls.length ? `\n${urls.join("\n")}` : ""}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300",
    },
  });
}


const weights = {
  league: 0.1,
  modelProb: 0.22,
  sportterySp: 0.15,
  valueGap: 0.15,
  asianHandicap: 0.13,
  waterLevel: 0.08,
  euroProb: 0.08,
  consistency: 0.05,
  risk: 0.03,
  grade: 0.01,
};

const gradeRank = { A: 4, B: 3, C: 2, D: 1 };
const competitionRules = [
  ["世界杯", /世界杯|World Cup/i],
  ["芬超", /芬超|Finland|Veikkausliiga/i],
  ["瑞超", /瑞典超|瑞超|Allsvenskan|Sweden/i],
  ["挪超", /挪超|Eliteserien|Norway/i],
  ["日职", /日职|J1|J联赛|Japan/i],
  ["韩职", /韩职|K联赛|K League/i],
  ["欧冠", /欧冠|Champions League/i],
  ["欧联", /欧联|Europa League/i],
  ["英超", /英超|Premier League/i],
  ["巴西甲", /巴西甲|巴甲|Brasileir[aã]o|Brazil(?:ian)?\s+(?:S[eé]rie|Serie)\s+A/i],
  ["西甲", /西甲|La Liga/i],
  ["意甲", /意甲|Serie A/i],
  ["德甲", /德甲|Bundesliga/i],
  ["法甲", /法甲|Ligue 1/i],
];

export function normalizeCompetition(value = "") {
  const text = String(value || "").trim();
  const found = competitionRules.find(([, pattern]) => pattern.test(text));
  if (found) return found[0];
  return text || "未分类赛事";
}

function has(...values) {
  return values.every((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
}

function addPart(parts, key, score) {
  if (!Number.isFinite(score)) return;
  parts.push({ score: Math.max(0, Math.min(100, score)), weight: weights[key] || 0 });
}

function similarity(current, sample) {
  const parts = [];
  addPart(parts, "league", normalizeCompetition(current.league) === normalizeCompetition(sample.league) ? 100 : 0);
  if (has(current.modelHomeProb, current.modelDrawProb, current.modelAwayProb, sample.modelHomeProb, sample.modelDrawProb, sample.modelAwayProb)) {
    addPart(parts, "modelProb", 100 - (Math.abs(current.modelHomeProb - sample.modelHomeProb) + Math.abs(current.modelDrawProb - sample.modelDrawProb) + Math.abs(current.modelAwayProb - sample.modelAwayProb)) * 100);
  }
  if (has(current.sportteryHomeSp, current.sportteryDrawSp, current.sportteryAwaySp, sample.sportteryHomeSp, sample.sportteryDrawSp, sample.sportteryAwaySp)) {
    addPart(parts, "sportterySp", 100 - (Math.abs(current.sportteryHomeSp - sample.sportteryHomeSp) + Math.abs(current.sportteryDrawSp - sample.sportteryDrawSp) + Math.abs(current.sportteryAwaySp - sample.sportteryAwaySp)) * 20);
  }
  if (has(current.valueHomeGap, current.valueDrawGap, current.valueAwayGap, sample.valueHomeGap, sample.valueDrawGap, sample.valueAwayGap)) {
    addPart(parts, "valueGap", 100 - (Math.abs(current.valueHomeGap - sample.valueHomeGap) + Math.abs(current.valueDrawGap - sample.valueDrawGap) + Math.abs(current.valueAwayGap - sample.valueAwayGap)) * 100);
  }
  if (has(current.asianHandicap, sample.asianHandicap)) addPart(parts, "asianHandicap", 100 - Math.abs(current.asianHandicap - sample.asianHandicap) * 40);
  if (has(current.asianHomeWater, current.asianAwayWater, sample.asianHomeWater, sample.asianAwayWater)) addPart(parts, "waterLevel", 100 - (Math.abs(current.asianHomeWater - sample.asianHomeWater) + Math.abs(current.asianAwayWater - sample.asianAwayWater)) * 50);
  if (has(current.euroHomeProb, current.euroDrawProb, current.euroAwayProb, sample.euroHomeProb, sample.euroDrawProb, sample.euroAwayProb)) {
    addPart(parts, "euroProb", 100 - (Math.abs(current.euroHomeProb - sample.euroHomeProb) + Math.abs(current.euroDrawProb - sample.euroDrawProb) + Math.abs(current.euroAwayProb - sample.euroAwayProb)) * 100);
  }
  if (has(current.consistencyScore, sample.consistencyScore)) addPart(parts, "consistency", 100 - Math.abs(current.consistencyScore - sample.consistencyScore) * 10);
  if (has(current.riskScore, sample.riskScore)) addPart(parts, "risk", 100 - Math.abs(current.riskScore - sample.riskScore));
  if (current.finalGrade && sample.finalGrade) {
    const diff = Math.abs((gradeRank[current.finalGrade] || 1) - (gradeRank[sample.finalGrade] || 1));
    addPart(parts, "grade", diff === 0 ? 100 : diff === 1 ? 70 : diff === 2 ? 40 : 20);
  }
  const totalWeight = parts.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(parts.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function rate(rows, predicate) {
  if (!rows.length) return 0;
  return rows.filter(predicate).length / rows.length;
}

function avg(rows, getter) {
  const values = rows.map(getter).filter((item) => Number.isFinite(item));
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function countBy(rows, getter, limit = 5) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getter(row);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, rate: rows.length ? count / rows.length : 0 }));
}

function scoreLabel(row) {
  const home = Number(row.actualHomeGoals);
  const away = Number(row.actualAwayGoals);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "";
  return `${home}-${away}`;
}

function handicapResult(row) {
  if (row.asianHandicap === null || row.asianHandicap === undefined || row.asianHandicap === "") return "";
  const home = Number(row.actualHomeGoals);
  const away = Number(row.actualAwayGoals);
  const line = Number(row.asianHandicap);
  if (![home, away, line].every(Number.isFinite)) return "";
  const adjusted = home + line - away;
  if (adjusted > 0) return "让胜";
  if (adjusted === 0) return "让平";
  return "让负";
}

function sameHandicapLine(row, current) {
  const left = Number(row.asianHandicap);
  const right = Number(current.asianHandicap);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.25;
}

function failureReasonRows(rows) {
  const loseRows = rows.filter((item) => item.hitStatus === "LOSE");
  const tagged = loseRows.flatMap((item) => item.failureTags || []);
  if (tagged.length) {
    return countBy(tagged.map((label) => ({ label })), (item) => item.label, 5);
  }
  return loseRows.length ? [{ label: "未记录失败标签", count: loseRows.length, rate: 1 }] : [];
}

function samplePolicy(count) {
  if (count >= 30) return { level: "FULL", label: "可参与置信修正", note: "同赛事样本达到 30 场，允许进入最终置信修正。" };
  if (count >= 10) return { level: "RISK_ONLY", label: "仅做风险提示", note: "同赛事样本 10-29 场，只提示风险，不改最终置信。" };
  return { level: "DISPLAY_ONLY", label: "只展示不修正", note: "同赛事样本不足 10 场，只展示，不参与最终判断。" };
}

function stats(rows, current) {
  const sameRecommendation = rows.filter((item) => item.recommendationSide === current.recommendationSide);
  const sameGrade = rows.filter((item) => item.finalGrade === current.finalGrade);
  const sameModelVersion = current.modelVersion
    ? rows.filter((item) => String(item.modelVersion || "").toUpperCase() === String(current.modelVersion || "").toUpperCase())
    : [];
  const sameLeagueHandicap = rows.filter((item) => sameHandicapLine(item, current));
  const policy = samplePolicy(rows.length);
  return {
    sampleCount: rows.length,
    competition: normalizeCompetition(current.league),
    modelVersion: current.modelVersion || "",
    samplePolicy: policy.level,
    samplePolicyLabel: policy.label,
    samplePolicyNote: policy.note,
    homeWinRate: rate(rows, (item) => item.actualResult === "HOME"),
    drawRate: rate(rows, (item) => item.actualResult === "DRAW"),
    awayWinRate: rate(rows, (item) => item.actualResult === "AWAY"),
    avgGoals: avg(rows, (item) => Number(item.actualGoals)),
    totalGoalDistribution: countBy(rows, (item) => `${Number(item.actualGoals)}球`),
    commonScores: countBy(rows, scoreLabel),
    handicapDistribution: countBy(rows, handicapResult),
    over25Rate: rate(rows, (item) => Number(item.actualGoals) > 2.5),
    under25Rate: rate(rows, (item) => Number(item.actualGoals) <= 2.5),
    sameRecommendationCount: sameRecommendation.length,
    sameRecommendationHitRate: rate(sameRecommendation, (item) => item.hitStatus === "WIN"),
    sameGradeCount: sameGrade.length,
    sameGradeHitRate: rate(sameGrade, (item) => item.hitStatus === "WIN"),
    sameLeagueHandicapCount: sameLeagueHandicap.length,
    sameLeagueHandicapHitRate: rate(sameLeagueHandicap, (item) => item.hitStatus === "WIN"),
    sameModelVersionCount: sameModelVersion.length,
    sameModelVersionHitRate: rate(sameModelVersion, (item) => item.hitStatus === "WIN"),
    failureReasons: failureReasonRows(rows),
    avgRiskScore: avg(rows, (item) => Number(item.riskScore)),
    avgConsistencyScore: avg(rows, (item) => Number(item.consistencyScore)),
    upsetRate: rate(rows, (item) => ["C", "D"].includes(item.finalGrade) && item.hitStatus === "WIN"),
  };
}

function confidenceAdjustment(s) {
  if (!s || s.sampleCount < 30) return 0;
  let value = 0;
  if (s.sameRecommendationHitRate >= 0.58) value += 3;
  if (s.sampleCount >= 30 && s.sameRecommendationHitRate >= 0.62) value += 5;
  if (s.sameRecommendationHitRate < 0.45) value -= 5;
  if (s.drawRate >= 0.34) value -= 2;
  if (s.upsetRate >= 0.3) value -= 3;
  return value;
}

function warnings(s, topCases) {
  const flags = [];
  if (!s || s.sampleCount < 10) flags.push("同赛事样本不足，不参与修正");
  if (s?.sampleCount >= 10 && s.sampleCount < 30) flags.push("样本只做风险提示，不改置信");
  if (s?.sampleCount >= 10 && s.sameRecommendationHitRate < 0.45) flags.push("当前推荐历史命中率偏低");
  if (s?.sameLeagueHandicapCount >= 8 && s.sameLeagueHandicapHitRate < 0.45) flags.push("同联赛同盘口命中率偏低");
  if (s?.sameModelVersionCount >= 8 && s.sameModelVersionHitRate < 0.45) flags.push("同模型版本命中率偏低");
  if (s?.drawRate >= 0.34) flags.push("历史平局率偏高，建议防平");
  if (s?.upsetRate >= 0.3) flags.push("历史冷门率偏高");
  if (topCases.filter((item) => item.hitStatus === "LOSE").length > topCases.filter((item) => item.hitStatus === "WIN").length) flags.push("高相似案例失败较多");
  return flags;
}

function downgradeAdvice(s, warningFlags) {
  if (!s || s.sampleCount < 10) return { downgrade: true, level: "观察", reason: "相似样本不足，只展示不修正置信。" };
  if (s.sameLeagueHandicapCount >= 8 && s.sameLeagueHandicapHitRate < 0.45) return { downgrade: true, level: "降级", reason: "同联赛同盘口历史命中率偏低。" };
  if (s.sameModelVersionCount >= 8 && s.sameModelVersionHitRate < 0.45) return { downgrade: true, level: "降级", reason: "同模型版本历史命中率偏低。" };
  if ((warningFlags || []).length >= 2) return { downgrade: true, level: "谨慎", reason: warningFlags.slice(0, 2).join("；") };
  return { downgrade: false, level: "维持", reason: s.samplePolicyNote || "暂无触发降级条件。" };
}

async function listCases(db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 500), 1), 500);
  const league = String(options.league || "").trim();
  const statement = league
    ? db.prepare("SELECT * FROM case_base WHERE league = ? AND data_quality IN ('HIGH', 'MEDIUM') ORDER BY created_at DESC LIMIT ?").bind(league, limit)
    : db.prepare("SELECT * FROM case_base ORDER BY created_at DESC LIMIT ?").bind(limit);
  const { results } = await statement.all();
  return results.map(rowToCase);
}

function rowToExternalSample(row) {
  return {
    caseId: row.sample_id,
    matchId: row.sample_id,
    sampleType: "external-history",
    modelVersion: "EXTERNAL_HISTORY",
    source: row.source,
    sourceUrl: row.source_url,
    league: row.league,
    season: row.season,
    kickoffTime: row.kickoff_time,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    sportteryHomeSp: row.sporttery_home_sp,
    sportteryDrawSp: row.sporttery_draw_sp,
    sportteryAwaySp: row.sporttery_away_sp,
    euroHomeOdds: row.euro_home_odds,
    euroDrawOdds: row.euro_draw_odds,
    euroAwayOdds: row.euro_away_odds,
    euroHomeProb: row.euro_home_prob,
    euroDrawProb: row.euro_draw_prob,
    euroAwayProb: row.euro_away_prob,
    over25Odds: row.over25_odds,
    under25Odds: row.under25_odds,
    asianHandicap: row.asian_handicap,
    asianHomeWater: row.asian_home_water,
    asianAwayWater: row.asian_away_water,
    dataQuality: row.data_quality,
    actualResult: row.actual_result,
    actualHomeGoals: row.actual_home_goals,
    actualAwayGoals: row.actual_away_goals,
    actualGoals: row.actual_goals,
    score: row.score,
  };
}

function canonicalHistoricalTeam(value = "") {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const aliases = [
    ["gwangju", /光州|gwangju/], ["ulsan", /蔚山|ulsan/], ["daejeon", /大田|daejeon/],
    ["bucheon", /富川|bucheon/], ["gangwon", /江原|gangwon/], ["jeonbuk", /全北|jeonbuk/],
    ["pohang", /浦项|pohang/], ["gimcheon", /金泉|gimcheon/], ["seoul", /首尔|seoul/],
    ["jeju", /济州|jeju/], ["daegu", /大邱|daegu/], ["suwon", /水原|suwon/],
  ];
  return aliases.find(([, pattern]) => pattern.test(text))?.[0] || text.replace(/\b(fc|football club|citizen|motors|hyundai|1995)\b/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function historicalFixtureKey(sample = {}) {
  const date = String(sample.kickoffTime || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || String(sample.season || "");
  return [normalizeCompetition(sample.league), date, canonicalHistoricalTeam(sample.homeTeam), canonicalHistoricalTeam(sample.awayTeam)].join("|");
}

function dedupeHistoricalSamples(samples = []) {
  const groups = new Map();
  samples.forEach((sample) => {
    const key = historicalFixtureKey(sample);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  });
  const quality = (sample) => ({ HIGH: 3, MEDIUM: 2, LOW: 1 }[String(sample.dataQuality || "MEDIUM").toUpperCase()] || 2);
  const completeness = (sample) => [sample.sportteryHomeSp, sample.sportteryDrawSp, sample.sportteryAwaySp, sample.asianHandicap, sample.over25Odds, sample.under25Odds].filter((value) => value !== null && value !== undefined && value !== "").length;
  return [...groups.values()].map((rows) => {
    const ranked = [...rows].sort((a, b) => quality(b) - quality(a) || completeness(b) - completeness(a) || Number(b.similarityScore || 0) - Number(a.similarityScore || 0));
    const merged = { ...ranked[0] };
    ranked.slice(1).forEach((row) => Object.entries(row).forEach(([key, value]) => {
      if ((merged[key] === null || merged[key] === undefined || merged[key] === "") && value !== null && value !== undefined && value !== "") merged[key] = value;
    }));
    merged.duplicateSources = [...new Set(rows.map((row) => row.source).filter(Boolean))];
    return merged;
  });
}

async function historicalSimilarSamples(db, current) {
  if (!has(current.euroHomeProb, current.euroDrawProb, current.euroAwayProb) && has(current.euroHomeOdds, current.euroDrawOdds, current.euroAwayOdds)) {
    const raw = [1 / Number(current.euroHomeOdds), 1 / Number(current.euroDrawOdds), 1 / Number(current.euroAwayOdds)];
    const total = raw.reduce((sum, value) => sum + value, 0);
    current = {
      ...current,
      euroHomeProb: raw[0] / total,
      euroDrawProb: raw[1] / total,
      euroAwayProb: raw[2] / total,
    };
  }
  const league = normalizeCompetition(current.league);
  const candidateLimit = Math.min(Math.max(Number(current.candidateLimit || 300), 50), 500);
  const threshold = Number(current.threshold ?? 65);
  const bindings = [league];
  const filters = ["league = ?", "data_quality IN ('HIGH', 'MEDIUM')"];
  const preferProjectPrimarySources = new Set(["美职", "巴西甲", "欧联"]).has(league);
  if (preferProjectPrimarySources) {
    filters.push("(source = '500.com' OR LOWER(source) LIKE 'okooo%' OR source = 'completed-match-auto')");
  }
  if (has(current.euroHomeOdds, current.euroDrawOdds, current.euroAwayOdds)) {
    filters.push("euro_home_odds BETWEEN ? AND ?", "euro_draw_odds BETWEEN ? AND ?", "euro_away_odds BETWEEN ? AND ?");
    bindings.push(
      Number(current.euroHomeOdds) - 1.25, Number(current.euroHomeOdds) + 1.25,
      Number(current.euroDrawOdds) - 1.25, Number(current.euroDrawOdds) + 1.25,
      Number(current.euroAwayOdds) - 1.25, Number(current.euroAwayOdds) + 1.25,
    );
  }
  if (Number.isFinite(Number(current.asianHandicap))) {
    filters.push("asian_handicap BETWEEN ? AND ?");
    bindings.push(Number(current.asianHandicap) - 0.75, Number(current.asianHandicap) + 0.75);
  }
  bindings.push(candidateLimit);
  const query = `SELECT * FROM external_historical_samples WHERE ${filters.join(" AND ")} ORDER BY kickoff_time DESC LIMIT ?`;
  const { results } = await db.prepare(query).bind(...bindings).all();
  const mapped = (results || []).map(rowToExternalSample);
  const hasCurrentMarket = has(current.euroHomeOdds, current.euroDrawOdds, current.euroAwayOdds) || has(current.sportteryHomeSp, current.sportteryDrawSp, current.sportteryAwaySp);
  const strictPool = dedupeHistoricalSamples(mapped
    .map((item) => ({ ...item, similarityScore: similarity(current, item), distributionOnly: !hasCurrentMarket }))
    .filter((item) => item.distributionOnly || item.similarityScore >= threshold)
  )
    .sort((a, b) => Number(a.distributionOnly) - Number(b.distributionOnly) || b.similarityScore - a.similarityScore);
  const sampleLimit = Math.min(Math.max(Number(current.sampleLimit || 50), 10), 100);
  let fallbackPool = [];
  if (strictPool.length < 10) {
    const broad = await db.prepare(`
      SELECT * FROM external_historical_samples
      WHERE league = ? AND data_quality IN ('HIGH', 'MEDIUM')
      ${preferProjectPrimarySources ? "AND (source = '500.com' OR LOWER(source) LIKE 'okooo%' OR source = 'completed-match-auto')" : ""}
      ORDER BY kickoff_time DESC LIMIT ?
    `).bind(league, candidateLimit).all();
    const strictKeys = new Set(strictPool.map(historicalFixtureKey));
    fallbackPool = dedupeHistoricalSamples((broad.results || [])
      .map(rowToExternalSample)
      .filter((item) => !strictKeys.has(historicalFixtureKey(item)))
      .map((item) => ({ ...item, similarityScore: similarity(current, item), distributionOnly: true }))
    ).sort((a, b) => b.similarityScore - a.similarityScore);
  }
  const pool = [...strictPool, ...fallbackPool]
    .sort((a, b) => Number(a.distributionOnly) - Number(b.distributionOnly) || b.similarityScore - a.similarityScore)
    .slice(0, sampleLimit);
  const topCases = pool.slice(0, Math.min(Math.max(Number(current.topLimit || 5), 1), 20));
  const summary = stats(pool, current);
  summary.lockedSampleCount = 0;
  summary.externalSampleCount = pool.length;
  summary.strictSampleCount = Math.min(pool.length, strictPool.length);
  summary.distributionSampleCount = Math.max(0, pool.length - summary.strictSampleCount);
  summary.samplePolicyLabel = pool.length >= 30 ? "参与分布校验" : summary.samplePolicyLabel;
  summary.samplePolicyNote = fallbackPool.length
    ? `严格相似盘口 ${strictPool.length} 场；不足部分已用同联赛历史分布样本补充。补充样本只校验赛果、比分和总进球，不修正模型置信。`
    : pool.length >= 30
      ? "外部历史样本参与盘口、赛果、比分和总进球分布校验，不修正模型命中率。"
      : summary.samplePolicyNote;
  return {
    ok: true,
    sampleCount: pool.length,
    topCases,
    stats: summary,
    confidenceAdjustment: 0,
    warningFlags: pool.length < 10
      ? ["同赛事外部样本不足"]
      : fallbackPool.length ? ["严格相似盘口不足，已补同联赛分布样本"] : [],
    summaryText: summary.samplePolicyNote,
  };
}

async function listRollingCompletedSamples(db, limit = 500) {
  const safeLimit = Math.min(Math.max(Number(limit || 500), 1), 1000);
  const { results } = await db.prepare(`
    SELECT * FROM external_historical_samples
    WHERE source = 'completed-match-auto'
    ORDER BY kickoff_time DESC
    LIMIT ?
  `).bind(safeLimit).all();
  return (results || []).map(rowToExternalSample);
}

async function ensureModelUpgradeSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS model_upgrade_notes (
      note_id TEXT PRIMARY KEY,
      source_case_id TEXT NOT NULL UNIQUE,
      source_lock_id TEXT NOT NULL,
      match_id TEXT NOT NULL,
      model_version TEXT NOT NULL DEFAULT 'V4',
      league TEXT,
      trigger_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'LOW',
      status TEXT NOT NULL DEFAULT 'OPEN',
      title TEXT NOT NULL,
      diagnosis_json TEXT,
      recommendation_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      adopted_at TEXT
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_model_upgrade_notes_model_status ON model_upgrade_notes(model_version, status, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_model_upgrade_notes_match ON model_upgrade_notes(match_id, created_at)").run();
}

async function ensureShadowAuditSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS shadow_model_audits (
      audit_id TEXT PRIMARY KEY,
      source_lock_id TEXT NOT NULL UNIQUE,
      match_id TEXT NOT NULL,
      league TEXT,
      model_version TEXT,
      model_revision TEXT,
      audit_status TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_shadow_model_audits_match ON shadow_model_audits(match_id, updated_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_shadow_model_audits_revision ON shadow_model_audits(model_revision, audit_status, updated_at)").run();
}

function firstText(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function scoreText(home, away) {
  if (!Number.isFinite(Number(home)) || !Number.isFinite(Number(away))) return "";
  return `${Number(home)}-${Number(away)}`;
}

function scorePicksFromPayload(payload = {}) {
  const normalize = (items) => [...new Set((items.flatMap((item) => Array.isArray(item) ? item : [item])
    .map((item) => String(item || ""))
    .join(" / ")
    .match(/\b\d+\s*[-:]\s*\d+\b/g) || [])
    .map((item) => item.replace(/\s+/g, "").replace(":", "-")))];
  const explicit = normalize([
    payload.predictedScores,
    payload.twoScores,
    payload.scorePick,
    payload.mainScore,
    payload.counterScore,
  ]);
  if (explicit.length) return explicit.slice(0, 2);
  return normalize([
    payload.score,
    payload.scorePrediction,
    payload.predictedScore,
    payload.finalScore,
    payload.finalDecisionAction,
    payload.reasoningSummary,
  ]).slice(0, 2);
}

function totalGoalPickFromPayload(payload = {}) {
  const text = firstText(payload.totalGoalsPick, payload.totalGoalPick, payload.totalGoals, payload.totalGoal, payload.goalRange);
  const picks = [...new Set((String(text).match(/\d+/g) || []).map(Number).filter(Number.isFinite))];
  return { text: String(text || ""), picks };
}

function handicapPickFromPayload(payload = {}) {
  const text = firstText(payload.handicapPick, payload.handicapResult, payload.letBallPick, payload.letBallResult, payload.handicapFinal);
  if (/让胜/.test(text)) return "让胜";
  if (/让平/.test(text)) return "让平";
  if (/让负/.test(text)) return "让负";
  return "";
}

function actualHandicapResult(lock, result) {
  const home = Number(result.full_time_home_goals);
  const away = Number(result.full_time_away_goals);
  const line = Number(lock.asian_handicap);
  if (![home, away, line].every(Number.isFinite)) return "";
  const adjusted = home + line - away;
  if (adjusted > 0) return "让胜";
  if (adjusted === 0) return "让平";
  return "让负";
}

export function caseDiagnosticPayload(lock, result, review, tags, oddsHistory = []) {
  const lockPayload = parseObject(lock.payload_json);
  const predictionPayload = parseObject(lockPayload.sportteryPrediction);
  const diagnosticSource = { ...lockPayload, ...predictionPayload };
  const resultPayload = parseObject(result.payload_json);
  const actualScore = scoreText(result.full_time_home_goals, result.full_time_away_goals);
  const scorePicks = scorePicksFromPayload(diagnosticSource);
  const totalGoalPick = totalGoalPickFromPayload(diagnosticSource);
  const handicapPick = handicapPickFromPayload(diagnosticSource);
  const actualHandicap = actualHandicapResult(lock, result);
  const unifiedRunEvidence = parseObject(diagnosticSource.unifiedRunEvidence);
  const jointDecision = parseObject(unifiedRunEvidence.jointDecision);
  const independentHandicapRisk = parseObject(jointDecision.independentHandicapRisk);
  const conditionalHandicapChallenger = parseObject(unifiedRunEvidence.conditionalHandicapChallenger);
  const scoreSelection = parseObject(unifiedRunEvidence.scoreSelection);
  const modelLessons = parseObject(unifiedRunEvidence.modelLessons);
  const backtestContract = parseObject(unifiedRunEvidence.backtestContract);
  const independentHandicapPick = firstText(jointDecision.independentHandicapLeader, independentHandicapRisk.pick);
  const conditionalHandicapPick = firstText(conditionalHandicapChallenger.pick);
  const handicapTrackHit = (pick) => pick && actualHandicap ? pick === actualHandicap : null;
  const totalGoalsHit = totalGoalPick.picks.length ? totalGoalPick.picks.includes(Number(result.total_goals)) : null;
  const scoreCovered = scorePicks.length ? scorePicks.includes(actualScore) : null;
  const handicapHit = handicapTrackHit(handicapPick);
  const independentHandicapLeaderSingleHit = handicapTrackHit(independentHandicapPick);
  const conditionalHandicapChallengerSingleHit = handicapTrackHit(conditionalHandicapPick);
  const directionHit = review.modelAudit?.directionHit ?? null;
  const formalWinDrawLoseHandicapJointHit = typeof directionHit === "boolean" && typeof handicapHit === "boolean"
    ? directionHit && handicapHit
    : null;
  const componentAudit = {
    winDrawLoseSingleHit: directionHit,
    formalHandicapSingleHit: handicapHit,
    totalGoalsDoubleHit: totalGoalsHit,
    scoreDoubleHit: scoreCovered,
  };
  const failedComponents = Object.entries(componentAudit).filter(([, hit]) => hit === false).map(([key]) => key);
  const auditedComponents = Object.values(componentAudit).filter((hit) => typeof hit === "boolean").length;
  const modelAuditStatus = failedComponents.length ? "FAIL" : auditedComponents === 4 ? "PASS" : "PARTIAL";
  const failureLabels = {
    winDrawLoseSingleHit: "胜平负单选失败",
    formalHandicapSingleHit: "正式让球单选失败",
    totalGoalsDoubleHit: "总进球双选失败",
    scoreDoubleHit: "比分双选失败",
  };
  const seasonLearning = parseObject(unifiedRunEvidence.seasonLearning);
  const crossLeagueNormalization = parseObject(unifiedRunEvidence.crossLeagueNormalization);
  const evidenceDirectionConflict = parseObject(unifiedRunEvidence.evidenceDirectionConflict);
  const evidenceDrivenRiskChallenger = parseObject(unifiedRunEvidence.evidenceDrivenRiskChallenger);
  const competitionStage = parseObject(unifiedRunEvidence.competitionStage);
  const twoLegLeadControl = parseObject(unifiedRunEvidence.twoLegLeadControl);
  const independentRiskScenario = parseObject(diagnosticSource.independentRiskScenario || unifiedRunEvidence.riskScenario);
  const finalDecision = parseObject(diagnosticSource.finalDecision);
  const scoreSelectionPolicy = firstText(diagnosticSource.scoreSelectionPolicy, finalDecision.scoreSelectionPolicy, scoreSelection.selectionPolicy);
  const officialScoreCoverageProbability = Number(diagnosticSource.officialScoreCoverageProbability ?? scoreSelection.officialCoverageProbability);
  const modelRevision = firstText(diagnosticSource.modelRevision, unifiedRunEvidence.modelRevision, modelLessons.version, lock.model_version);
  const oddsMovement = oddsHistory.map((snapshot) => ({
    capturedAt: snapshot.captured_at,
    source: snapshot.source,
    homeSp: snapshot.sporttery_home_sp,
    drawSp: snapshot.sporttery_draw_sp,
    awaySp: snapshot.sporttery_away_sp,
    handicap: snapshot.handicap,
  }));
  const failureMode = failedComponents.length
    ? failedComponents.map((key) => failureLabels[key]).join(" + ")
    : modelAuditStatus === "PASS"
      ? "四组件全部命中"
      : "组件数据不完整";
  return {
    reviewText: review.reviewText,
    betOutcome: review.betOutcome || review.hitStatus,
    learningEligibility: review.hitStatus === "VOID" ? "SHADOW_AUDIT" : "OFFICIAL_RECOMMENDATION",
    probabilityMetrics: review.probabilityMetrics || null,
    modelAudit: {
      status: modelAuditStatus,
      auditedComponents,
      failedComponents,
      ...componentAudit,
      handicapSingleHit: handicapHit,
      independentHandicapLeaderSingleHit,
      conditionalHandicapChallengerSingleHit,
      formalWinDrawLoseHandicapJointHit,
    },
    failureMode,
    actualHomeGoals: result.full_time_home_goals,
    actualAwayGoals: result.full_time_away_goals,
    actualScore,
    halfTimeScore: firstText(resultPayload.halfScore, resultPayload.half_time_score, resultPayload.halfTimeScore),
    actualResult: result.result_1x2,
    actualGoals: result.total_goals,
    match: {
      matchId: lock.match_id,
      homeTeam: lock.home_team,
      awayTeam: lock.away_team,
      kickoffTime: lock.kickoff_time,
    },
    leagueType: lock.league,
    season: String(seasonLearning.season || lock.kickoff_time || "").match(/(?:20\d{2}|\d{4})/)?.[0] || "unknown",
    modelRevision,
    backtestContract: Object.keys(backtestContract).length ? backtestContract : null,
    seasonLearning,
    crossLeagueNormalization: Object.keys(crossLeagueNormalization).length ? crossLeagueNormalization : null,
    evidenceDirectionConflict: Object.keys(evidenceDirectionConflict).length ? evidenceDirectionConflict : null,
    evidenceDrivenRiskChallenger: Object.keys(evidenceDrivenRiskChallenger).length ? evidenceDrivenRiskChallenger : null,
    competitionStageAudit: Object.keys(competitionStage).length ? competitionStage : null,
    twoLegLeadControl: Object.keys(twoLegLeadControl).length ? twoLegLeadControl : null,
    lockedOdds: {
      homeSp: lock.sporttery_home_sp,
      drawSp: lock.sporttery_draw_sp,
      awaySp: lock.sporttery_away_sp,
    },
    oddsMovement,
    handicap: lock.asian_handicap,
    judgementBasis: firstText(
      lock.reasoning_summary,
      diagnosticSource.reasoningSummary,
      diagnosticSource.finalDecisionAction,
      diagnosticSource.keyJudgement
    ),
    actualHandicapResult: actualHandicap,
    predictedHandicapResult: handicapPick,
    handicapHit,
    formalHandicapSingleHit: handicapHit,
    independentHandicapLeader: independentHandicapPick,
    independentHandicapLeaderSingleHit,
    conditionalHandicapChallenger: conditionalHandicapPick,
    conditionalHandicapChallengerSingleHit,
    formalWinDrawLoseHandicapJointHit,
    handicapTrackAudit: {
      actual: actualHandicap,
      formal: { pick: handicapPick, hit: handicapHit },
      independent: { pick: independentHandicapPick, hit: independentHandicapLeaderSingleHit },
      conditionalChallenger: { pick: conditionalHandicapPick, hit: conditionalHandicapChallengerSingleHit },
      formalWinDrawLoseHandicapJointHit,
    },
    predictedTotalGoals: totalGoalPick.text,
    totalGoalsHit,
    predictedScores: scorePicks,
    scoreCovered,
    scoreSelectionPolicy,
    officialScoreCoverageProbability: Number.isFinite(officialScoreCoverageProbability) ? officialScoreCoverageProbability : null,
    independentRiskScenario: independentRiskScenario.score ? independentRiskScenario : null,
    matchType: firstText(diagnosticSource.matchType, diagnosticSource.gameType, diagnosticSource.predictedMatchType),
    matchTypeHit: null,
    diagnosisSummary: modelAuditStatus === "PASS"
      ? review.hitStatus === "VOID"
        ? "跳过场四组件影子验票通过，只进入校准统计，不计正式命中率。"
        : "四个预测组件全部命中，保留为正式正样本。"
      : `${failureMode}；无论是否跳过，都必须进入联赛与赛季校准复盘。`,
  };
}

export function upgradeNoteFromCase(lock, result, review, caseId, diagnosticPayload) {
  const auditFailed = diagnosticPayload.modelAudit?.status === "FAIL";
  const auditIncomplete = diagnosticPayload.modelAudit?.status === "PARTIAL";
  const auditPassed = diagnosticPayload.modelAudit?.status === "PASS";
  const isOfficialLose = review.hitStatus === "LOSE";
  const isHighGradeLose = isOfficialLose && ["A", "B"].includes(String(lock.final_grade || "").toUpperCase());
  const triggerType = auditFailed ? "MODEL_FAILURE" : auditIncomplete ? "DATA_QUALITY_OBSERVATION" : review.hitStatus === "VOID" ? "SHADOW_OBSERVATION" : "CASE_OBSERVATION";
  const severity = isHighGradeLose ? "HIGH" : auditFailed ? "MEDIUM" : "LOW";
  const title = auditFailed
    ? `${lock.model_version || "V4"} ${diagnosticPayload.failureMode}`
    : auditIncomplete
      ? `${lock.model_version || "V4"} 组件验票不完整`
    : review.hitStatus === "VOID"
      ? `${lock.model_version || "V4"} 跳过场影子验票`
      : `${lock.model_version || "V4"} 四组件命中样本沉淀`;
  const recommendations = [];
  const formalHandicapFailed = (diagnosticPayload.modelAudit?.formalHandicapSingleHit ?? diagnosticPayload.modelAudit?.handicapSingleHit) === false;
  if (diagnosticPayload.modelAudit?.winDrawLoseSingleHit === false) recommendations.push("复查最终胜平负方向、反向脚本投票权和球队xG分配。");
  if (diagnosticPayload.evidenceDirectionConflict?.materialConflict) recommendations.push("复查市场、首球方和两回合追分暴露的二对一冲突，确认是否存在两项独立量化反证。");
  if (diagnosticPayload.crossLeagueNormalization?.complete === false) recommendations.push("补齐跨联赛强度、对手质量、比赛类型与时效因子后再计算xG。");
  if (diagnosticPayload.twoLegLeadControl?.applied && diagnosticPayload.totalGoalsHit === false) recommendations.push("复查两回合领先方后续进球衰减，分开校准胜负方向与三球以上幅度。");
  if (formalHandicapFailed) recommendations.push("复查正式让球的完整净胜球分布，不得由单个正式比分决定让球单选。");
  if (formalHandicapFailed && diagnosticPayload.independentHandicapLeaderSingleHit === true) recommendations.push("独立让球边际命中而正式让球失败，将该差异纳入让球Challenger影子验票。");
  if (formalHandicapFailed && diagnosticPayload.conditionalHandicapChallengerSingleHit === true) recommendations.push("主方向条件让球命中而正式让球失败，复查联合净胜球质量排序。");
  if (diagnosticPayload.totalGoalsHit === false) recommendations.push("复查总进球区间和半场触发脚本。");
  if (diagnosticPayload.scoreCovered === false) recommendations.push("复核两个正式比分的联合概率排序、双方进球分配和联赛赛季校准；独立风险剧本单独验票，不强占正式比分名额。");
  if (auditFailed && !recommendations.length) recommendations.push("复查相似案例、盘口偏差和风险排除层，确认是否需要降级规则。");
  if (auditIncomplete) recommendations.push("补齐缺失的玩法输出或赛果字段后重新验票，不得沉淀为正样本。");
  if (auditPassed && review.hitStatus === "VOID") recommendations.push("保留为联赛与赛季影子校准样本，不计正式推荐命中率。");
  if (auditPassed && review.hitStatus !== "VOID") recommendations.push("保留为同模型版本四组件正样本，用于相似案例分布校验。");
  const shouldUpgradeModel = auditFailed && (isHighGradeLose || recommendations.length >= 2);
  const failedModules = [...new Set((diagnosticPayload.modelAudit?.failedComponents || []).map((key) => ({
    winDrawLoseSingleHit: "WIN_DRAW_LOSE",
    formalHandicapSingleHit: "HANDICAP",
    handicapSingleHit: "HANDICAP",
    totalGoalsDoubleHit: "TOTAL_GOALS",
    scoreDoubleHit: "EXACT_SCORE",
  }[key])).filter(Boolean))];
  const primaryMetricsByModule = {
    WIN_DRAW_LOSE: "winDrawLoseSingleHit",
    HANDICAP: "formalHandicapSingleHit",
    TOTAL_GOALS: "totalGoalsDoubleHit",
    EXACT_SCORE: "scoreDoubleHit",
  };
  const challengerPromotion = {
    status: shouldUpgradeModel ? "SHADOW_PENDING" : "OBSERVATION_ONLY",
    sourceModelRevision: diagnosticPayload.modelRevision || lock.model_version || "V4",
    modules: failedModules,
    minimumSettledSamples: 30,
    targetSettledSamples: 50,
    primaryMetrics: failedModules.map((module) => primaryMetricsByModule[module]).filter(Boolean),
    guardrailMetrics: ["formalWinDrawLoseHandicapJointHit", "brierScore", "logLoss", "calibrationBin"],
    automaticPromotion: false,
    promotionPolicy: "同联赛、同赛季、同模型版本累计30至50场影子样本；目标命中率提高，胜平负+让球联合命中不降，Brier Score与Log Loss不退化后才可人工采纳。",
  };
  return {
    noteId: `upgrade-${caseId}`,
    sourceCaseId: caseId,
    sourceLockId: lock.lock_id,
    matchId: lock.match_id,
    modelVersion: lock.model_version || "V4",
    league: lock.league,
    triggerType,
    severity,
    status: shouldUpgradeModel ? "SHADOW_PENDING" : auditFailed || auditIncomplete ? "OPEN" : "OBSERVED",
    title,
    diagnosis: {
      homeTeam: lock.home_team,
      awayTeam: lock.away_team,
      hitStatus: review.hitStatus,
      finalGrade: lock.final_grade,
      finalAction: lock.final_action,
      ...diagnosticPayload,
    },
    recommendation: {
      nextActions: recommendations,
      shouldUpgradeModel,
      challengerPromotion,
    },
  };
}

async function createModelUpgradeNoteForCase(db, lock, result, review, caseId, diagnosticPayload) {
  await ensureModelUpgradeSchema(db);
  const note = upgradeNoteFromCase(lock, result, review, caseId, diagnosticPayload);
  await db.prepare(`
    INSERT INTO model_upgrade_notes (
      note_id, source_case_id, source_lock_id, match_id, model_version, league, trigger_type,
      severity, status, title, diagnosis_json, recommendation_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(note_id) DO UPDATE SET
      diagnosis_json=excluded.diagnosis_json,
      recommendation_json=excluded.recommendation_json,
      trigger_type=excluded.trigger_type,
      severity=excluded.severity,
      status=excluded.status,
      title=excluded.title
  `).bind(
    note.noteId,
    note.sourceCaseId,
    note.sourceLockId,
    note.matchId,
    note.modelVersion,
    note.league,
    note.triggerType,
    note.severity,
    note.status,
    note.title,
    JSON.stringify(note.diagnosis),
    JSON.stringify(note.recommendation),
    new Date().toISOString()
  ).run();
  return note;
}

function rowToShadowAudit(row) {
  const payload = parseObject(row.payload_json);
  return {
    auditId: row.audit_id,
    sourceLockId: row.source_lock_id,
    matchId: row.match_id,
    league: row.league,
    modelVersion: row.model_version,
    modelRevision: row.model_revision,
    auditStatus: row.audit_status,
    ...payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createShadowAuditForLock(db, lockId) {
  const lock = await db.prepare("SELECT * FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
  if (!lock) return { ok: false, status: 404, error: "lock not found" };
  if (lock.lock_type !== "PRE_LOCK") return { ok: false, status: 400, error: "only PRE_LOCK can enter Shadow Audit" };
  const preferred = await db.prepare(`
    SELECT lock_id FROM locked_predictions
    WHERE match_id = ?
    ORDER BY ${PREFERRED_LOCK_ORDER_SQL}
    LIMIT 1
  `).bind(lock.match_id).first();
  if (preferred?.lock_id !== lock.lock_id) {
    return { ok: false, status: 409, error: "only the latest preferred PRE_LOCK can enter Shadow Audit" };
  }
  const result = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(lock.match_id).first();
  if (!result) return { ok: false, status: 400, error: "result not found" };
  const evaluated = evaluateLock(lock, result);
  const review = {
    ...evaluated,
    hitStatus: "VOID",
    betOutcome: "VOID",
    reviewText: "PRE_LOCK不计正式投注胜负；四组件与Challenger分轨继续影子验票。",
  };
  const tags = caseTags(lock, result, review);
  const { results: oddsHistory } = await db.prepare(`
    SELECT captured_at, source, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp, handicap
    FROM odds_snapshots
    WHERE match_id = ?
      AND sporttery_home_sp > 1 AND sporttery_draw_sp > 1 AND sporttery_away_sp > 1
    ORDER BY captured_at ASC
    LIMIT 200
  `).bind(lock.match_id).all();
  const diagnosticPayload = caseDiagnosticPayload(lock, result, review, tags, oddsHistory || []);
  const auditId = `shadow-${lock.lock_id}`;
  await ensureShadowAuditSchema(db);
  await db.prepare(`
    INSERT INTO shadow_model_audits (
      audit_id, source_lock_id, match_id, league, model_version, model_revision,
      audit_status, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(source_lock_id) DO UPDATE SET
      model_revision=excluded.model_revision,
      audit_status=excluded.audit_status,
      payload_json=excluded.payload_json,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    auditId,
    lock.lock_id,
    lock.match_id,
    lock.league,
    lock.model_version,
    diagnosticPayload.modelRevision || lock.model_version,
    diagnosticPayload.modelAudit?.status || "PARTIAL",
    JSON.stringify(diagnosticPayload)
  ).run();
  const resultStatus = `SHADOW_${diagnosticPayload.modelAudit?.status || "PARTIAL"}`;
  await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(resultStatus, lock.lock_id).run();
  const upgradeNote = await createModelUpgradeNoteForCase(db, lock, result, review, auditId, diagnosticPayload);
  return { ok: true, auditId, review, diagnosticPayload, upgradeNote };
}

function rowToUpgradeNote(row) {
  return {
    noteId: row.note_id,
    sourceCaseId: row.source_case_id,
    sourceLockId: row.source_lock_id,
    matchId: row.match_id,
    modelVersion: row.model_version,
    league: row.league,
    triggerType: row.trigger_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    diagnosis: parseObject(row.diagnosis_json),
    recommendation: parseObject(row.recommendation_json),
    createdAt: row.created_at,
    adoptedAt: row.adopted_at,
  };
}

async function listModelUpgradeNotes(db, params) {
  await ensureModelUpgradeSchema(db);
  const modelVersion = params.get("modelVersion") || "";
  const status = params.get("status") || "";
  let stmt = db.prepare("SELECT * FROM model_upgrade_notes ORDER BY created_at DESC LIMIT 300");
  if (modelVersion && status) {
    stmt = db.prepare("SELECT * FROM model_upgrade_notes WHERE model_version = ? AND status = ? ORDER BY created_at DESC LIMIT 300").bind(modelVersion, status);
  } else if (modelVersion) {
    stmt = db.prepare("SELECT * FROM model_upgrade_notes WHERE model_version = ? ORDER BY created_at DESC LIMIT 300").bind(modelVersion);
  } else if (status) {
    stmt = db.prepare("SELECT * FROM model_upgrade_notes WHERE status = ? ORDER BY created_at DESC LIMIT 300").bind(status);
  }
  const { results } = await stmt.all();
  return (results || []).map(rowToUpgradeNote);
}

export const PREFERRED_LOCK_ORDER_SQL = "locked_at DESC, lock_id DESC";

async function createCaseForLock(db, lockId) {
  const lock = await db.prepare("SELECT * FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
  if (!lock) return { ok: false, status: 404, error: "lock not found" };
  if (lock.lock_type !== "FINAL_LOCK") return { ok: false, status: 400, error: "only FINAL_LOCK can enter Case Base" };
  const preferred = await db.prepare(`
    SELECT lock_id FROM locked_predictions
    WHERE match_id = ?
    ORDER BY ${PREFERRED_LOCK_ORDER_SQL}
    LIMIT 1
  `).bind(lock.match_id).first();
  if (preferred?.lock_id !== lock.lock_id) {
    return { ok: false, status: 409, error: "only a latest preferred FINAL_LOCK can enter Case Base" };
  }
  const result = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(lock.match_id).first();
  if (!result) return { ok: false, status: 400, error: "result not found" };
  const review = evaluateLock(lock, result);
  const tags = caseTags(lock, result, review);
  const caseId = `case-${lock.lock_id}`;
  const { results: oddsHistory } = await db.prepare(`
    SELECT captured_at, source, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp, handicap
    FROM odds_snapshots
    WHERE match_id = ?
      AND sporttery_home_sp > 1 AND sporttery_draw_sp > 1 AND sporttery_away_sp > 1
    ORDER BY captured_at ASC
    LIMIT 200
  `).bind(lock.match_id).all();
  const diagnosticPayload = caseDiagnosticPayload(lock, result, review, tags, oddsHistory || []);
  const existing = await db.prepare("SELECT case_id FROM case_base WHERE source_lock_id = ?").bind(lock.lock_id).first();
  if (existing) {
    await db.prepare(`
      UPDATE case_base
      SET actual_result = ?, actual_goals = ?, hit_status = ?, failure_tags_json = ?, success_tags_json = ?, payload_json = ?
      WHERE source_lock_id = ?
    `).bind(
      result.result_1x2,
      result.total_goals,
      review.hitStatus,
      JSON.stringify(tags.failureTags),
      JSON.stringify(tags.successTags),
      JSON.stringify(diagnosticPayload),
      lock.lock_id
    ).run();
    await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(review.hitStatus, lock.lock_id).run();
    const upgradeNote = await createModelUpgradeNoteForCase(db, lock, result, review, existing.case_id, diagnosticPayload);
    return { ok: true, caseId: existing.case_id, duplicated: true, refreshed: true, review, upgradeNote };
  }
  await db.prepare(`
    INSERT INTO case_base (
      case_id, source_lock_id, match_id, league, home_team, away_team, kickoff_time, model_version,
      model_home_prob, model_draw_prob, model_away_prob, recommendation, recommendation_side,
      final_grade, final_action, confidence_score, risk_score, consistency_score,
      sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp, sporttery_home_prob, sporttery_draw_prob, sporttery_away_prob,
      value_home_gap, value_draw_gap, value_away_gap, asian_handicap, asian_home_water, asian_away_water,
      euro_home_odds, euro_draw_odds, euro_away_odds, euro_home_prob, euro_draw_prob, euro_away_prob,
      data_quality, actual_result, actual_goals, hit_status, failure_tags_json, success_tags_json, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    caseId, lock.lock_id, lock.match_id, lock.league, lock.home_team, lock.away_team, lock.kickoff_time, lock.model_version || "V1",
    lock.model_home_prob, lock.model_draw_prob, lock.model_away_prob, lock.recommendation, lock.recommendation_side,
    lock.final_grade, lock.final_action, lock.confidence_score, lock.risk_score, lock.consistency_score,
    lock.sporttery_home_sp, lock.sporttery_draw_sp, lock.sporttery_away_sp, lock.sporttery_home_prob, lock.sporttery_draw_prob, lock.sporttery_away_prob,
    lock.value_home_gap, lock.value_draw_gap, lock.value_away_gap, lock.asian_handicap, lock.asian_home_water, lock.asian_away_water,
    lock.euro_home_odds, lock.euro_draw_odds, lock.euro_away_odds, lock.euro_home_prob, lock.euro_draw_prob, lock.euro_away_prob,
    lock.data_quality, result.result_1x2, result.total_goals, review.hitStatus,
    JSON.stringify(tags.failureTags),
    JSON.stringify(tags.successTags),
    JSON.stringify(diagnosticPayload),
    new Date().toISOString()
  ).run();
  await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(review.hitStatus, lock.lock_id).run();
  const upgradeNote = await createModelUpgradeNoteForCase(db, lock, result, review, caseId, diagnosticPayload);
  return { ok: true, caseId, review, upgradeNote };
}

async function upsertCompletedMatchHistoricalSample(db, matchId) {
  const row = await db.prepare(`
    SELECT
      m.match_id, m.league, m.home_team, m.away_team, m.kickoff_time, m.payload_json AS match_payload_json,
      r.full_time_home_goals, r.full_time_away_goals, r.result_1x2, r.total_goals,
      r.reviewed_at, r.payload_json AS result_payload_json,
      o.source AS odds_source, o.captured_at AS odds_captured_at,
      o.sporttery_home_sp, o.sporttery_draw_sp, o.sporttery_away_sp,
      o.handicap, o.payload_json AS odds_payload_json
    FROM matches m
    JOIN match_results r ON r.match_id = m.match_id
    LEFT JOIN odds_snapshots o ON o.snapshot_id = (
      SELECT snapshot_id FROM odds_snapshots
      WHERE match_id = m.match_id
        AND sporttery_home_sp > 1 AND sporttery_draw_sp > 1 AND sporttery_away_sp > 1
      ORDER BY captured_at DESC
      LIMIT 1
    )
    WHERE m.match_id = ?
  `).bind(matchId).first();
  if (!row) return { ok: false, stored: false, reason: "match-or-result-not-found" };
  if (![row.sporttery_home_sp, row.sporttery_draw_sp, row.sporttery_away_sp].every((value) => Number(value) > 1)) {
    return { ok: true, stored: false, reason: "complete-1x2-not-found" };
  }
  const odds = [Number(row.sporttery_home_sp), Number(row.sporttery_draw_sp), Number(row.sporttery_away_sp)];
  const rawProbabilities = odds.map((value) => 1 / value);
  const probabilityTotal = rawProbabilities.reduce((sum, value) => sum + value, 0);
  const probabilities = rawProbabilities.map((value) => Number((value / probabilityTotal).toFixed(4)));
  const matchPayload = parseObject(row.match_payload_json);
  const resultPayload = parseObject(row.result_payload_json);
  const oddsPayload = parseObject(row.odds_payload_json);
  const league = normalizeCompetition(row.league);
  const season = String(row.kickoff_time || "").match(/\b(20\d{2})\b/)?.[1] || "";
  const source = "completed-match-auto";
  const sampleId = `completed-${row.match_id}`;
  const sourceUrl = String(resultPayload.sourceUrl || matchPayload.sourceUrl || "");
  const score = `${row.full_time_home_goals}-${row.full_time_away_goals}`;
  await db.prepare(`
    INSERT INTO external_historical_samples (
      sample_id, source, source_url, source_captured_at, league, season, kickoff_time, home_team, away_team,
      sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
      euro_home_odds, euro_draw_odds, euro_away_odds,
      euro_home_prob, euro_draw_prob, euro_away_prob,
      asian_handicap, data_quality, actual_result, actual_home_goals, actual_away_goals, actual_goals,
      score, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MEDIUM', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sample_id) DO UPDATE SET
      source_url=excluded.source_url, source_captured_at=excluded.source_captured_at,
      league=excluded.league, season=excluded.season, kickoff_time=excluded.kickoff_time,
      home_team=excluded.home_team, away_team=excluded.away_team,
      sporttery_home_sp=excluded.sporttery_home_sp, sporttery_draw_sp=excluded.sporttery_draw_sp, sporttery_away_sp=excluded.sporttery_away_sp,
      euro_home_odds=excluded.euro_home_odds, euro_draw_odds=excluded.euro_draw_odds, euro_away_odds=excluded.euro_away_odds,
      euro_home_prob=excluded.euro_home_prob, euro_draw_prob=excluded.euro_draw_prob, euro_away_prob=excluded.euro_away_prob,
      asian_handicap=excluded.asian_handicap, data_quality=excluded.data_quality,
      actual_result=excluded.actual_result, actual_home_goals=excluded.actual_home_goals,
      actual_away_goals=excluded.actual_away_goals, actual_goals=excluded.actual_goals,
      score=excluded.score, payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `).bind(
    sampleId, source, sourceUrl, row.odds_captured_at || row.reviewed_at, league, season,
    row.kickoff_time, row.home_team, row.away_team,
    odds[0], odds[1], odds[2], odds[0], odds[1], odds[2],
    probabilities[0], probabilities[1], probabilities[2],
    row.handicap, row.result_1x2, row.full_time_home_goals, row.full_time_away_goals, row.total_goals,
    score,
    JSON.stringify({
      sampleRole: "rolling-completed-match",
      resultSource: resultPayload.resultSource || "",
      oddsSource: row.odds_source || "",
      oddsCapturedAt: row.odds_captured_at || "",
      orderId: matchPayload.orderId || oddsPayload.orderId || "",
    }),
    new Date().toISOString(),
  ).run();
  return { ok: true, stored: true, sampleId };
}

async function ensureMatchForStoredResult(db, matchId) {
  const existing = await db.prepare("SELECT match_id FROM matches WHERE match_id = ?").bind(matchId).first();
  if (existing) return { ok: true, created: false };
  const result = await db.prepare("SELECT payload_json FROM match_results WHERE match_id = ?").bind(matchId).first();
  if (!result) return { ok: false, created: false, reason: "result-not-found" };
  const payload = parseObject(result.payload_json);
  const home = String(payload.home || payload.homeTeam || "").trim();
  const away = String(payload.away || payload.awayTeam || "").trim();
  if (!home || !away) return { ok: false, created: false, reason: "teams-not-found" };
  const kickoff = `${payload.matchDate || payload.ticaiDate || payload.date || ""} ${payload.kickoffTime || ""}`.trim();
  await db.prepare(`
    INSERT OR IGNORE INTO matches (
      match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'FINISHED', ?, ?)
  `).bind(
    matchId,
    payload.issue || payload.no || "",
    normalizeCompetition(payload.league || "竞彩"),
    home,
    away,
    kickoff,
    JSON.stringify({ ...payload, cloudMatchId: matchId, seededFromResult: true }),
    new Date().toISOString(),
  ).run();
  return { ok: true, created: true };
}

const sportteryApis = {
  calculator: "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c",
  results: "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1",
  resultPage: (pageNo) =>
    `https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=${pageNo}`,
  fixedBonus: (matchId) =>
    `https://webapi.sporttery.cn/gateway/uniform/football/getFixedBonusV1.qry?clientCode=3001&matchId=${encodeURIComponent(matchId)}`,
};

const sportteryHeaders = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

const okoooJczqUrl = "https://m.okooo.com/jczq/";
const okoooLiveCenterUrl = "https://www.okooo.com/livecenter/football/";
const fiveHundredJczqUrl = "https://trade.500.com/jczq/";
const okoooHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

const apiFootballEndpoint = "https://apiv3.apifootball.com/";
const footballDataEndpoint = "https://api.football-data.org/v4/matches";
const footballDataCompetitionEndpoint = (code, season = "") =>
  `https://api.football-data.org/v4/competitions/${code}/matches${season ? `?season=${season}` : ""}`;
const footballDataStandingsEndpoint = (code, season = "") =>
  `https://api.football-data.org/v4/competitions/${code}/standings${season ? `?season=${season}` : ""}`;
const theSportsDbEndpoint = "https://www.thesportsdb.com/api/v1/json";
const apiFootballTeamZh = {
  Argentina: "阿根廷",
  Australia: "澳大利亚",
  Belgium: "比利时",
  "Bosnia and Herzegovina": "波黑",
  "Bosnia-Herzegovina": "波黑",
  Bosnia: "波黑",
  Brazil: "巴西",
  "Cape Verde": "佛得角",
  "Cabo Verde": "佛得角",
  Canada: "加拿大",
  Colombia: "哥伦比亚",
  Croatia: "克罗地亚",
  Denmark: "丹麦",
  Ecuador: "厄瓜多尔",
  Egypt: "埃及",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Haiti: "海地",
  Iran: "伊朗",
  Italy: "意大利",
  "Ivory Coast": "科特迪瓦",
  "Cote d'Ivoire": "科特迪瓦",
  "Côte d'Ivoire": "科特迪瓦",
  Japan: "日本",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷兰",
  Norway: "挪威",
  Paraguay: "巴拉圭",
  Portugal: "葡萄牙",
  Qatar: "卡塔尔",
  Scotland: "苏格兰",
  Sirius: "天狼星",
  "IK Sirius": "天狼星",
  Anyang: "安养FC",
  "FC Anyang": "安养FC",
  "Gwangju FC": "光州FC",
  "Gimcheon Sangmu": "金泉尚武",
  "Ulsan HD": "蔚山现代",
  "Ulsan Hyundai": "蔚山现代",
  "Incheon United": "仁川联",
  "Jeju United": "济州联",
  "FC Seoul": "首尔FC",
  "Pohang Steelers": "浦项制铁",
  "Daejeon Citizen": "大田市民",
  "Daejeon Hana Citizen": "大田市民",
  "Bucheon FC": "富川FC",
  "Bucheon FC 1995": "富川FC",
  "Jeonbuk Motors": "全北现代",
  "Jeonbuk Hyundai Motors": "全北现代",
  "Gangwon FC": "江原FC",
  "AC Oulu": "AC奥卢",
  "HJK Helsinki": "赫尔辛基",
  "IFK Mariehamn": "玛丽港",
  "TPS Turku": "TPS",
  Fredrikstad: "腓特烈斯塔",
  Lillestrom: "利勒斯特罗姆",
  "Lillestrom SK": "利勒斯特罗姆",
  Aalesund: "奥勒松",
  Molde: "莫尔德",
  Tromso: "特罗姆瑟",
  Valerenga: "瓦勒伦加",
  "KFUM Oslo": "KFUM奥斯陆",
  "Bodo/Glimt": "博德闪耀",
  "Bodø/Glimt": "博德闪耀",
  Brann: "布兰",
  Start: "斯达",
  Rosenborg: "罗森博格",
  Kristiansund: "克里斯蒂安松",
  Sandefjord: "桑纳菲尤尔",
  HamKam: "汉坎",
  Sarpsborg: "萨普斯堡",
  Viking: "维京",
  AIK: "索尔纳",
  "IFK Goteborg": "哥德堡",
  "IFK Göteborg": "哥德堡",
  Hammarby: "哈马比",
  Kalmar: "卡尔马",
  Elfsborg: "埃尔夫斯堡",
  Brommapojkarna: "布鲁马波卡纳",
  Orgryte: "厄尔格里特",
  "Örgryte": "厄尔格里特",
  Hacken: "赫根",
  "BK Hacken": "赫根",
  "BK Häcken": "赫根",
  Lahti: "拉赫蒂",
  "FC Lahti": "拉赫蒂",
  Gnistan: "赫尔火花",
  "IF Gnistan": "赫尔火花",
  Halmstad: "哈尔姆斯",
  "Halmstads BK": "哈尔姆斯",
  Vasteras: "韦斯特罗",
  "Vasteras SK": "韦斯特罗",
  "Vasteras SK FK": "韦斯特罗",
  "Västerås SK": "韦斯特罗",
  "Västerås SK FK": "韦斯特罗",
  Degerfors: "代格福什",
  "Degerfors IF": "代格福什",
  Malmo: "马尔默",
  "Malmo FF": "马尔默",
  Malmö: "马尔默",
  "Malmö FF": "马尔默",
  Spain: "西班牙",
  Sweden: "瑞典",
  Switzerland: "瑞士",
  Tunisia: "突尼斯",
  Uruguay: "乌拉圭",
  USA: "美国",
  "United States": "美国",
  Mjallby: "米亚尔比",
  Mjällby: "米亚尔比",
  "Mjallby AIF": "米亚尔比",
  "Mjällby AIF": "米亚尔比",
};

function sportteryProxyUrl(env, targetUrl) {
  let proxy = (env.REQUEST_UPSTREAM_PROXY || env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY || "").trim();
  if (!proxy) return targetUrl;
  if (!/^https?:\/\//i.test(proxy)) proxy = `https://${proxy}`;
  if (proxy.includes("114.55.11.209:8787")) {
    const base = "http://114.55.11.209:8787";
    const target = new URL(targetUrl);
    if (target.pathname.includes("getMatchCalculatorV1")) return `${base}/sporttery/calculator.json`;
    if (target.pathname.includes("getMatchDataPageListV1")) {
      const pageNo = target.searchParams.get("pageNo") || "1";
      return `${base}/sporttery/results-page-${pageNo}.json`;
    }
  }
  if (proxy.includes("{url}")) return proxy.replace("{url}", encodeURIComponent(targetUrl));
  if (/[?&]url=$/.test(proxy)) return `${proxy}${encodeURIComponent(targetUrl)}`;
  const delimiter = proxy.includes("?") ? "&" : "?";
  return `${proxy}${delimiter}url=${encodeURIComponent(targetUrl)}`;
}

function sportteryCacheUrl(targetUrl) {
  const base = "http://114.55.11.209:8787";
  const target = new URL(targetUrl);
  if (target.pathname.includes("getMatchCalculatorV1")) return `${base}/sporttery/calculator.json`;
  if (target.pathname.includes("getMatchDataPageListV1")) {
    const pageNo = target.searchParams.get("pageNo") || "1";
    return `${base}/sporttery/results-page-${pageNo}.json`;
  }
  return `${base}/proxy?url=${encodeURIComponent(targetUrl)}`;
}

function sportteryProxyDiagnostics(env, targetUrl) {
  const source = env.REQUEST_UPSTREAM_PROXY
    ? "request"
    : env.SPORTTERY_UPSTREAM_PROXY
      ? "cloudflare"
      : env.UPSTREAM_PROXY
        ? "upstream"
        : "direct";
  const resolved = sportteryProxyUrl(env, targetUrl);
  let host = "";
  let protocol = "";
  let path = "";
  try {
    const url = new URL(resolved);
    host = url.host;
    protocol = url.protocol;
    path = url.pathname;
  } catch {}
  return { source, host, protocol, path, targetHost: new URL(targetUrl).host };
}

async function fetchSportteryJson(env, targetUrl) {
  const primary = sportteryProxyUrl(env, targetUrl);
  const urls = [primary];
  const fallback = sportteryCacheUrl(targetUrl);
  if (fallback !== primary) urls.push(fallback);
  let lastError = null;
  for (const requestUrl of urls) {
    try {
      const response = await fetch(requestUrl, { headers: sportteryHeaders });
      const text = await response.text();
      if (!response.ok) throw new Error(`Sporttery API ${response.status}: ${text.slice(0, 240)}`);
      const raw = JSON.parse(text);
      if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API returned an error");
      return raw;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Sporttery API fetch failed");
}

async function fetchSportteryResultPages(env, maxPages = 5) {
  const pages = [];
  const seen = new Set();
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const raw = await fetchSportteryJson(env, sportteryApis.resultPage(pageNo));
    const days = raw?.value?.matchInfoList || [];
    const pageKeys = days.flatMap((day) =>
      (day.subMatchList || []).map((match) => `${day.matchDate || day.businessDate || ""}-${match.matchId || match.matchNumStr || match.matchNum || ""}`)
    );
    const freshKeys = pageKeys.filter((key) => !seen.has(key));
    if (!pageKeys.length || !freshKeys.length) break;
    pageKeys.forEach((key) => seen.add(key));
    pages.push(raw);
    if (pageKeys.length < 80) break;
  }
  return pages;
}

function compactSportteryNo(matchNumStr = "", matchNum = "") {
  const text = String(matchNumStr || matchNum || "");
  const found = text.match(/(\d{3})$/);
  return found ? found[1] : text.slice(-3).padStart(3, "0");
}

function normalizeSportteryHandicap(goalLine = "") {
  const raw = String(goalLine || "0").trim();
  if (!raw) return "0";
  const numeric = Number(raw.replace("+", ""));
  if (Number.isNaN(numeric)) return raw;
  if (numeric > 0) return `+${numeric}`;
  return String(numeric);
}

function toSportteryOdd(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function sportteryMarketOdds(market) {
  if (!market || !market.h) return null;
  return { win: toSportteryOdd(market.h), draw: toSportteryOdd(market.d), lose: toSportteryOdd(market.a) };
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
      if (key === "s-1sh" || key === "s1sh") return [{ score: "胜其它", odds: toSportteryOdd(value), bucket: "胜" }];
      if (key === "s-1sd" || key === "s1sd") return [{ score: "平其它", odds: toSportteryOdd(value), bucket: "平" }];
      if (key === "s-1sa" || key === "s1sa") return [{ score: "负其它", odds: toSportteryOdd(value), bucket: "负" }];
      const found = key.match(/^s(\d{2})s(\d{2})$/);
      if (!found) return [];
      const home = Number(found[1]);
      const away = Number(found[2]);
      return [{ score: `${home}:${away}`, odds: toSportteryOdd(value), bucket: sportteryScoreBucket(home, away) }];
    })
    .sort((a, b) => Number(a.odds) - Number(b.odds))
    .slice(0, 12);
}

function sportteryTotalGoalsOdds(ttg = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = ttg[`s${index}`];
    if (!value) return null;
    return { goals: index === 7 ? "7+" : String(index), odds: toSportteryOdd(value) };
  }).filter(Boolean);
}

function sportteryLatestUpdate(match) {
  return [match.had, match.hhad, match.crs, match.ttg, match.hafu]
    .map((market) => `${market?.updateDate || ""} ${market?.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function sportteryKey(item) {
  return String(item.matchId || item.orderId || `${item.ticaiDate || item.matchDate}-${item.issue || item.no}-${item.home}-${item.away}`);
}

function sportteryDbMatchId(item) {
  return `sporttery-${sportteryKey(item)}`;
}

function normalizeTeamName(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameTeam(left = "", right = "") {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function liveTeamNames(name = "") {
  const text = String(name || "");
  return [text, apiFootballTeamZh[text]].filter(Boolean);
}

function liveTeamMatches(sportteryName = "", liveName = "") {
  return liveTeamNames(liveName).some((candidate) => sameTeam(sportteryName, candidate));
}

function apiFootballKey(env) {
  return (env.APIFOOTBALL_API_KEY || env.REQUEST_APIFOOTBALL_API_KEY || "").trim();
}

function footballDataKey(env) {
  return (env.FOOTBALL_DATA_API_KEY || env.REQUEST_FOOTBALL_DATA_API_KEY || "").trim();
}

function theSportsDbKey(env) {
  return (env.THESPORTSDB_API_KEY || env.REQUEST_THESPORTSDB_API_KEY || "3").trim();
}

function scorePartValue(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function footballDataScoreParts(score = {}) {
  const regular = score.regularTime || {};
  const full = score.fullTime || {};
  const half = score.halfTime || {};
  const regularHome = scorePartValue(regular.home);
  const regularAway = scorePartValue(regular.away);
  const fullHome = scorePartValue(full.home);
  const fullAway = scorePartValue(full.away);
  const usesRegularTime = Number.isFinite(regularHome) && Number.isFinite(regularAway);
  return {
    home: usesRegularTime ? regularHome : fullHome,
    away: usesRegularTime ? regularAway : fullAway,
    halfHome: scorePartValue(half.home),
    halfAway: scorePartValue(half.away),
    duration: score.duration || "",
    scoreMode: usesRegularTime ? "regularTime" : "fullTime",
    winner: score.winner || "",
  };
}

function dashScoreText(home, away) {
  if (!Number.isFinite(Number(home)) || !Number.isFinite(Number(away))) return "";
  return `${Number(home)}-${Number(away)}`;
}

function beijingDateTimeFromUtc(value = "") {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return { date: "", time: "" };
  const shifted = new Date(timestamp + BJT_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: shifted.toISOString().slice(11, 16),
  };
}

function penaltyScoreText(home, away) {
  return dashScoreText(home, away);
}

function sideFromPenalty(home, away) {
  const h = scorePartValue(home);
  const a = scorePartValue(away);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return "";
  return h > a ? "HOME_TEAM" : "AWAY_TEAM";
}

function winnerFromSide(side = "", home = "", away = "") {
  if (/HOME/i.test(side)) return home;
  if (/AWAY/i.test(side)) return away;
  return "";
}

async function upstreamErrorMessage(response, label) {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = "";
  }
  const compact = String(detail || "").replace(/\s+/g, " ").trim().slice(0, 220);
  return `${label} ${response.status}${compact ? ` ${compact}` : ""}`;
}

async function fetchApiFootballDay(env, date) {
  const key = apiFootballKey(env);
  if (!key) return [];
  const url = new URL(apiFootballEndpoint);
  url.searchParams.set("action", "get_events");
  url.searchParams.set("from", date);
  url.searchParams.set("to", date);
  url.searchParams.set("timezone", "Asia/Shanghai");
  url.searchParams.set("APIkey", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`APIfootball ${response.status}`);
  const raw = await response.json();
  if (raw?.error) throw new Error(raw.message || raw.error);
  if (!Array.isArray(raw)) return [];
  return raw.map((match) => ({
    source: "APIfootball",
    externalId: String(match.match_id || ""),
    date: match.match_date || "",
    time: match.match_time || "",
    league: match.league_name || match.country_name || "Football",
    home: match.match_hometeam_name || "",
    away: match.match_awayteam_name || "",
    homeZh: apiFootballTeamZh[match.match_hometeam_name] || "",
    awayZh: apiFootballTeamZh[match.match_awayteam_name] || "",
    score: dashScoreText(match.match_hometeam_score, match.match_awayteam_score),
    halfScore: dashScoreText(match.match_hometeam_halftime_score, match.match_awayteam_halftime_score),
    penaltyScore: penaltyScoreText(match.match_hometeam_penalty_score, match.match_awayteam_penalty_score),
    winnerSide: sideFromPenalty(match.match_hometeam_penalty_score, match.match_awayteam_penalty_score),
    winnerZh: winnerFromSide(sideFromPenalty(match.match_hometeam_penalty_score, match.match_awayteam_penalty_score), apiFootballTeamZh[match.match_hometeam_name] || match.match_hometeam_name || "", apiFootballTeamZh[match.match_awayteam_name] || match.match_awayteam_name || ""),
    status: match.match_status || "",
    scoreDuration: /after/i.test(String(match.match_status || "")) ? "EXTRA_TIME" : /pen/i.test(String(match.match_status || "")) ? "PENALTY_SHOOTOUT" : "REGULAR",
    scoreMode: "fullTime",
    isFinished: /finished|after/i.test(String(match.match_status || "")),
    live: String(match.match_live || "") === "1",
  }));
}

async function fetchFootballDataDay(env, date) {
  const key = footballDataKey(env);
  if (!key) return [];
  const url = new URL(footballDataEndpoint);
  url.searchParams.set("dateFrom", date);
  url.searchParams.set("dateTo", date);
  const response = await fetch(url, {
    headers: { "X-Auth-Token": key },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(await upstreamErrorMessage(response, "football-data"));
  const raw = await response.json();
  const rows = Array.isArray(raw?.matches) ? raw.matches : [];
  return rows.map((match) => {
    const home = match.homeTeam?.name || match.homeTeam?.shortName || "";
    const away = match.awayTeam?.name || match.awayTeam?.shortName || "";
    const score = footballDataScoreParts(match.score || {});
    const kickoff = beijingDateTimeFromUtc(match.utcDate);
    return {
      source: "football-data.org",
      externalId: String(match.id || ""),
      date: kickoff.date,
      time: kickoff.time,
      league: match.competition?.name || "Football",
      home,
      away,
      homeZh: apiFootballTeamZh[home] || "",
      awayZh: apiFootballTeamZh[away] || "",
      score: dashScoreText(score.home, score.away),
      halfScore: dashScoreText(score.halfHome, score.halfAway),
      winnerSide: score.winner,
      winnerZh: winnerFromSide(score.winner, apiFootballTeamZh[home] || home, apiFootballTeamZh[away] || away),
      status: match.status || "",
      isFinished: match.status === "FINISHED",
      live: ["IN_PLAY", "PAUSED"].includes(match.status),
      scoreDuration: score.duration,
      scoreMode: score.scoreMode,
    };
  });
}

async function fetchFootballDataCompetition(env, code, season = "") {
  const key = footballDataKey(env);
  if (!key) return [];
  const response = await fetch(footballDataCompetitionEndpoint(code, season), {
    headers: { "X-Auth-Token": key },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(await upstreamErrorMessage(response, `football-data ${code}`));
  const raw = await response.json();
  const rows = Array.isArray(raw?.matches) ? raw.matches : [];
  return rows.map((match) => {
    const home = match.homeTeam?.name || match.homeTeam?.shortName || "";
    const away = match.awayTeam?.name || match.awayTeam?.shortName || "";
    const score = footballDataScoreParts(match.score || {});
    const kickoff = beijingDateTimeFromUtc(match.utcDate);
    return {
      source: "football-data.org",
      externalId: String(match.id || ""),
      date: kickoff.date,
      time: kickoff.time,
      league: match.competition?.name || "Football",
      home,
      away,
      homeZh: apiFootballTeamZh[home] || "",
      awayZh: apiFootballTeamZh[away] || "",
      score: dashScoreText(score.home, score.away),
      halfScore: dashScoreText(score.halfHome, score.halfAway),
      winnerSide: score.winner,
      winnerZh: winnerFromSide(score.winner, apiFootballTeamZh[home] || home, apiFootballTeamZh[away] || away),
      status: match.status || "",
      isFinished: match.status === "FINISHED",
      live: ["IN_PLAY", "PAUSED"].includes(match.status),
      scoreDuration: score.duration,
      scoreMode: score.scoreMode,
      stage: match.stage || "",
      group: match.group || "",
      matchday: match.matchday || "",
    };
  });
}

async function fetchFootballDataStandings(env, code, season = "") {
  const key = footballDataKey(env);
  if (!key) return [];
  const response = await fetch(footballDataStandingsEndpoint(code, season), {
    headers: { "X-Auth-Token": key },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(await upstreamErrorMessage(response, `football-data standings ${code}`));
  const raw = await response.json();
  const standings = Array.isArray(raw?.standings) ? raw.standings : [];
  return standings.flatMap((standing) =>
    (standing.table || []).map((row, index) => ({
      source: "football-data.org",
      competition: raw.competition?.code || code,
      type: standing.type || "",
      group: standing.group || "",
      rank: row.position || index + 1,
      team: row.team?.name || row.team?.shortName || "",
      played: row.playedGames || 0,
      won: row.won || 0,
      draw: row.draw || 0,
      lost: row.lost || 0,
      points: row.points || 0,
      goalsFor: row.goalsFor || 0,
      goalsAgainst: row.goalsAgainst || 0,
      goalDifference: row.goalDifference || 0,
      form: row.form || "",
    }))
  );
}

function sportteryMatchDates(sportteryMatches = []) {
  return [...new Set(
    sportteryMatches.flatMap((match) => [match.matchDate, match.ticaiDate]).filter(Boolean)
  )].sort();
}

function activeSportteryDates(sportteryMatches = [], limit = 6) {
  return sportteryMatchDates(sportteryMatches).slice(-limit);
}

async function fetchFootballDataMatches(env, sportteryMatches = []) {
  const dates = activeSportteryDates(sportteryMatches);
  if (!dates.length) return { matches: [], errors: [] };
  if (!footballDataKey(env)) {
    return { matches: [], errors: [{ source: "football-data.org", date: "config", message: "FOOTBALL_DATA_API_KEY missing; football-data fallback skipped" }] };
  }
  const needsWorldCup = sportteryMatches.some((match) => /世界杯|World Cup/i.test(String(match.league || "")));
  const settled = await Promise.allSettled([
    ...(needsWorldCup ? [fetchFootballDataCompetition(env, "WC")] : []),
    ...dates.map((date) => fetchFootballDataDay(env, date)),
  ]);
  return {
    matches: settled.flatMap((item) => item.status === "fulfilled" ? item.value : []),
    errors: settled
      .map((item, index) => item.status === "rejected" ? {
        source: "football-data.org",
        date: needsWorldCup && index === 0 ? "WC" : dates[needsWorldCup ? index - 1 : index],
        message: item.reason?.message || "unknown",
      } : null)
      .filter(Boolean),
  };
}

async function fetchTheSportsDbDay(env, date) {
  const key = theSportsDbKey(env);
  if (!key) return [];
  const url = new URL(`${theSportsDbEndpoint}/${encodeURIComponent(key)}/eventsday.php`);
  url.searchParams.set("d", date);
  url.searchParams.set("s", "Soccer");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`TheSportsDB ${response.status}`);
  const raw = await response.json();
  const rows = Array.isArray(raw?.events) ? raw.events : [];
  return rows.map((match) => ({
    source: "TheSportsDB",
    externalId: String(match.idEvent || ""),
    date: match.dateEvent || String(match.strTimestamp || "").slice(0, 10),
    time: String(match.strTime || match.strTimestamp || "").slice(11, 16),
    league: match.strLeague || "Football",
    home: match.strHomeTeam || "",
    away: match.strAwayTeam || "",
    homeZh: apiFootballTeamZh[match.strHomeTeam] || "",
    awayZh: apiFootballTeamZh[match.strAwayTeam] || "",
    score: dashScoreText(match.intHomeScore, match.intAwayScore),
    halfScore: "",
    winnerSide: "",
    winnerZh: "",
    status: match.strStatus || match.strProgress || "",
    isFinished: Boolean(parseDashScore(`${match.intHomeScore ?? ""}-${match.intAwayScore ?? ""}`)) &&
      /finish|ft|after|ended/i.test(String(match.strStatus || match.strProgress || "finished")),
    live: /live|in play|^\d+/.test(String(match.strStatus || match.strProgress || "")),
  }));
}

async function fetchFallbackSource(label, dates, fetchDay, missingMessage = "") {
  if (missingMessage) {
    return { matches: [], errors: [{ source: label, date: "config", message: missingMessage }] };
  }
  const settled = await Promise.allSettled(dates.map((date) => fetchDay(date)));
  return {
    matches: settled.flatMap((item) => item.status === "fulfilled" ? item.value : []),
    errors: settled
      .map((item, index) => item.status === "rejected" ? { source: label, date: dates[index], message: item.reason?.message || "unknown" } : null)
      .filter(Boolean),
  };
}

async function fetchApiFootballMatches(env, sportteryMatches = []) {
  const dates = activeSportteryDates(sportteryMatches);
  if (!dates.length) return { matches: [], errors: [] };
  if (!apiFootballKey(env)) {
    return { matches: [], errors: [{ date: "config", message: "APIFOOTBALL_API_KEY missing; live fallback skipped" }] };
  }
  const settled = await Promise.allSettled(dates.map((date) => fetchApiFootballDay(env, date)));
  return {
    matches: settled.flatMap((item) => item.status === "fulfilled" ? item.value : []),
    errors: settled
      .map((item, index) => item.status === "rejected" ? { date: dates[index], message: item.reason?.message || "unknown" } : null)
      .filter(Boolean),
  };
}

async function fetchLiveFallbackMatches(env, sportteryMatches = []) {
  const dates = activeSportteryDates(sportteryMatches);
  if (!dates.length) return { matches: [], errors: [] };

  let okoooLive = { matches: [], errors: [] };
  try {
    okoooLive = { matches: await fetchOkoooJczqLiveScores(env), errors: [] };
  } catch (error) {
    okoooLive = { matches: [], errors: [{ source: "OKOOO-live", date: "current", message: error.message || "OKOOO live score fetch failed" }] };
  }
  const sources = [
    okoooLive,
    await fetchFootballDataMatches(env, sportteryMatches),
    await fetchApiFootballMatches(env, sportteryMatches),
    await fetchFallbackSource(
      "TheSportsDB",
      dates,
      (date) => fetchTheSportsDbDay(env, date),
      theSportsDbKey(env) ? "" : "THESPORTSDB_API_KEY missing; TheSportsDB fallback skipped"
    ),
  ];

  return {
    matches: sources.flatMap((source) => source.matches),
    errors: sources.flatMap((source) => source.errors),
  };
}

function liveRowDedupeKey(row = {}) {
  const teams = [row.homeZh || row.home, row.awayZh || row.away].map(normalizeTeamName).join("-");
  if (row.date && teams.replace("-", "")) return `${row.date}:${teams}`;
  if (row.source && row.externalId) return `${row.source}:${row.externalId}`;
  return `${row.date || ""}:${teams}:${row.score || ""}`;
}

function liveRowPriority(row = {}) {
  if (row.source === "OKOOO-live") return 5;
  if (row.source === "football-data.org" && (row.stage || row.scoreDuration || row.winnerSide)) return 4;
  if (row.source === "football-data.org") return 3;
  if (row.source === "APIfootball") return 2;
  if (row.source === "TheSportsDB") return 1;
  return 0;
}

function dedupeLiveRows(rows = []) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = liveRowDedupeKey(row);
    const existing = byKey.get(key);
    if (!existing || liveRowPriority(row) > liveRowPriority(existing)) {
      byKey.set(key, row);
    }
  });
  return [...byKey.values()];
}

function standingForTeam(teamName = "", standings = []) {
  return standings.find((row) => row.type === "TOTAL" && liveTeamMatches(teamName, row.team)) ||
    standings.find((row) => liveTeamMatches(teamName, row.team)) ||
    null;
}

function matchesForTeamBefore(teamName = "", beforeDate = "", matches = []) {
  return matches
    .filter((row) =>
      row.isFinished &&
      row.date &&
      (!beforeDate || row.date <= beforeDate) &&
      (liveTeamMatches(teamName, row.home) || liveTeamMatches(teamName, row.away))
    )
    .sort((a, b) => `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`))
    .slice(0, 5);
}

function teamStateFromContext(teamName = "", beforeDate = "", context = {}) {
  const standing = standingForTeam(teamName, context.standings || []);
  const recent = matchesForTeamBefore(teamName, beforeDate, context.matches || []);
  return {
    team: teamName,
    rank: standing?.rank || null,
    points: standing?.points ?? null,
    played: standing?.played ?? null,
    goalsFor: standing?.goalsFor ?? null,
    goalsAgainst: standing?.goalsAgainst ?? null,
    goalDifference: standing?.goalDifference ?? null,
    form: standing?.form || "",
    recentMatches: recent.map((row) => ({
      date: row.date,
      home: row.home,
      away: row.away,
      score: row.score,
      halfScore: row.halfScore,
      stage: row.stage || "",
      duration: row.scoreDuration || "",
    })),
  };
}

function compactTeamStateText(label, state = {}) {
  const table = Number.isFinite(Number(state.rank))
    ? `第${state.rank}，${state.points ?? "-"}分，进${state.goalsFor ?? "-"}失${state.goalsAgainst ?? "-"}，净胜${state.goalDifference ?? "-"}`
    : "暂无积分榜";
  const form = state.form ? `，近况 ${state.form}` : "";
  const recent = state.recentMatches?.length
    ? `；近${state.recentMatches.length}场 ${state.recentMatches.map((row) => `${row.home}-${row.away} ${row.score}`).join(" / ")}`
    : "";
  return `${label}${table}${form}${recent}`;
}

function footballDataContextForMatch(match = {}, context = {}) {
  const sourceMatch = (context.matches || []).find((row) =>
    liveDateMatchesSporttery(match, row) &&
    liveTeamMatches(match.home, row.home) &&
    liveTeamMatches(match.away, row.away)
  ) || null;
  const beforeDate = match.matchDate || match.ticaiDate || sourceMatch?.date || "";
  const homeState = teamStateFromContext(match.home, beforeDate, context);
  const awayState = teamStateFromContext(match.away, beforeDate, context);
  return {
    source: "football-data.org",
    competitionCode: context.competitionCode || "",
    season: context.season || "",
    stage: sourceMatch?.stage || "",
    group: sourceMatch?.group || "",
    matchday: sourceMatch?.matchday || "",
    status: sourceMatch?.status || "",
    regularScore: sourceMatch?.score || "",
    halfScore: sourceMatch?.halfScore || "",
    scoreDuration: sourceMatch?.scoreDuration || "",
    homeState,
    awayState,
    stateSummary: `${compactTeamStateText(match.home || "主队", homeState)}；${compactTeamStateText(match.away || "客队", awayState)}`,
    matchedExternalId: sourceMatch?.externalId || "",
    importedAt: context.importedAt || "",
  };
}

async function fetchFootballDataContext(env, sportteryMatches = []) {
  if (!footballDataKey(env)) {
    return {
      source: "football-data.org",
      importedAt: new Date().toISOString(),
      competitionCode: "",
      season: "",
      matches: [],
      standings: [],
      errors: [{ source: "football-data.org", date: "config", message: "FOOTBALL_DATA_API_KEY missing; context skipped" }],
    };
  }
  const needsWorldCup = sportteryMatches.some((match) => /世界杯|World Cup/i.test(String(match.league || "")));
  const competitionCode = needsWorldCup ? "WC" : "";
  const season = needsWorldCup ? "2026" : "";
  if (!competitionCode) {
    return { source: "football-data.org", importedAt: new Date().toISOString(), competitionCode, season, matches: [], standings: [], errors: [] };
  }
  const settled = await Promise.allSettled([
    fetchFootballDataCompetition(env, competitionCode, season),
    fetchFootballDataStandings(env, competitionCode, season),
  ]);
  return {
    source: "football-data.org",
    importedAt: new Date().toISOString(),
    competitionCode,
    season,
    matches: settled[0].status === "fulfilled" ? settled[0].value : [],
    standings: settled[1].status === "fulfilled" ? settled[1].value : [],
    errors: settled
      .map((item, index) => item.status === "rejected" ? {
        source: "football-data.org",
        date: index === 0 ? `${competitionCode}-${season}-matches` : `${competitionCode}-${season}-standings`,
        message: item.reason?.message || "unknown",
      } : null)
      .filter(Boolean),
  };
}

function parseDashScore(score = "") {
  if (!String(score).includes("-")) return null;
  const [home, away] = String(score).split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function dateDistanceDays(left = "", right = "") {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return Infinity;
  return Math.abs(leftMs - rightMs) / 86400000;
}

function liveDateMatchesSporttery(match, row) {
  if (!row.date) return true;
  return [match.matchDate, match.ticaiDate]
    .filter(Boolean)
    .some((date) => dateDistanceDays(date, row.date) <= 1);
}

function liveFallbackRowHasUsableScore(row = {}) {
  if (!liveFallbackRowUsesRegularTime(row)) return false;
  if (row.isFinished) return Boolean(parseDashScore(row.score));
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.minute || ""}`;
  return Boolean(row.live && parseDashScore(row.score)) ||
    Boolean(parseDashScore(row.score) && /^\s*(\d+(\+\d+)?'?|half|半场|中场|paused|in[_\s-]?play|live)/i.test(status));
}

function liveFallbackRowHasAuthoritativeStatus(row = {}) {
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.minute || ""}`;
  return /\bpostpon(?:ed|ement)?\b|\bcancel(?:led|ed)?\b|\babandon(?:ed)?\b|\bsuspend(?:ed)?\b|延期|推迟|取消|腰斩|中止/i.test(status);
}

function liveFallbackRowIsDisplayable(row = {}) {
  return liveFallbackRowHasUsableScore(row) || liveFallbackRowHasAuthoritativeStatus(row);
}

function liveFallbackRowUsesRegularTime(row = {}) {
  const source = String(row.source || "");
  const status = `${row.status || ""} ${row.statusName || ""} ${row.statusLabel || ""} ${row.scoreDuration || ""}`;
  if (/football-data\.org/i.test(source)) return row.scoreMode !== "fullTime" || !/extra|after|penalt|shootout|aet/i.test(status);
  return !/extra|after|penalt|shootout|aet|加时|点球/i.test(status);
}

function liveResultForSportteryMatch(match, liveRows = []) {
  return liveRows.find(
    (row) =>
      row.isFinished &&
      liveFallbackRowUsesRegularTime(row) &&
      (
        (row.source === "OKOOO-live" && String(row.externalId || "").replace(/^sporttery-/, "") === String(match.matchId || match.sportteryKey || "").replace(/^sporttery-/, "")) ||
        (liveDateMatchesSporttery(match, row) && liveTeamMatches(match.home, row.home) && liveTeamMatches(match.away, row.away))
      ) &&
      parseDashScore(row.score)
  );
}

function normalizeSportteryMatch(match, businessDate) {
  const item = {
    orderId: String(match.matchNum || ""),
    issue: match.matchNumStr || "",
    no: compactSportteryNo(match.matchNumStr, match.matchNum),
    ticaiDate: businessDate || match.businessDate || match.matchDate || "",
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
  };
  item.sportteryKey = sportteryKey(item);
  return item;
}

function parseSportteryScore(score = "") {
  if (!score.includes(":")) return null;
  const [home, away] = score.split(":").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function normalizeSportteryResult(match, businessDate) {
  const parsed = parseSportteryScore(match.sectionsNo999 || "");
  const item = {
    orderId: String(match.matchNum || ""),
    issue: match.matchNumStr || "",
    no: compactSportteryNo(match.matchNumStr, match.matchNum),
    ticaiDate: businessDate || match.businessDate || match.matchDate || "",
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
    score: parsed?.text || "",
    result: parsed ? (parsed.home > parsed.away ? "胜" : parsed.home < parsed.away ? "负" : "平") : "",
  };
  item.sportteryKey = sportteryKey(item);
  return item;
}

function oddNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function lowestOdd(rows) {
  return rows
    .filter((item) => oddNumber(item.odd))
    .sort((a, b) => oddNumber(a.odd) - oddNumber(b.odd))[0] || null;
}

function impliedProb(odd) {
  const number = oddNumber(odd);
  return number ? 1 / number : null;
}

function normalizedMarketProbabilities(odds = {}) {
  const raw = {
    home: impliedProb(odds.win),
    draw: impliedProb(odds.draw),
    away: impliedProb(odds.lose),
  };
  const total = Object.values(raw).reduce((sum, value) => sum + (value || 0), 0);
  if (!total) return { home: 0, draw: 0, away: 0 };
  return {
    home: raw.home ? raw.home / total : 0,
    draw: raw.draw ? raw.draw / total : 0,
    away: raw.away ? raw.away / total : 0,
  };
}

function pickNormal(odds = {}) {
  return lowestOdd([
    { label: "胜", side: "HOME", odd: odds.win },
    { label: "平", side: "DRAW", odd: odds.draw },
    { label: "负", side: "AWAY", odd: odds.lose },
  ]);
}

function pickHandicap(odds = {}) {
  return lowestOdd([
    { label: "让胜", odd: odds.win },
    { label: "让平", odd: odds.draw },
    { label: "让负", odd: odds.lose },
  ]);
}

function topScoreTexts(scores = []) {
  return scores
    .filter((item) => item.score && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => String(item.score).replace(":", "-"));
}

function parsePredictionScore(score = "") {
  const normalized = String(score || "").trim().replace(":", "-");
  if (!normalized.includes("-")) return null;
  const [home, away] = normalized.split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

function scoreDirection(score = "") {
  const parsed = parsePredictionScore(score);
  if (!parsed) return "";
  if (parsed.home > parsed.away) return "胜";
  if (parsed.home < parsed.away) return "负";
  return "平";
}

function handicapDirectionFromScore(score = "", handicap = "") {
  const parsed = parsePredictionScore(score);
  const line = Number(handicap);
  if (!parsed || !Number.isFinite(line)) return "";
  const adjustedHome = parsed.home + line;
  if (adjustedHome > parsed.away) return "让胜";
  if (adjustedHome < parsed.away) return "让负";
  return "让平";
}

function topGoalText(goals = []) {
  const rows = goals
    .filter((item) => item.goals && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => `${item.goals}球`);
  return rows.length ? rows.join("/") : "2球/3球";
}

function autoPhaseForMatch(match, nowMs = Date.now()) {
  const ticaiDate = match.ticaiDate || match.matchDate || bjtParts(new Date(nowMs)).date;
  const kickoffAt = bjtAt(match.matchDate || ticaiDate, match.kickoffTime || "23:59");
  const decisionCutoffAt = bjtAt(ticaiDate, AUTO_DECISION_CUTOFF);
  const saleClosedAt = bjtAt(ticaiDate, SALE_CLOSE_TIME);
  const kickoffFinalAt = addMinutes(kickoffAt, -60);
  const finalLockAt = Math.min(
    Number.isFinite(kickoffFinalAt) ? kickoffFinalAt : decisionCutoffAt,
    decisionCutoffAt
  );
  if (Number.isFinite(kickoffAt) && nowMs >= kickoffAt) return { phase: "MATCH_STARTED", ticaiDate, kickoffAt, finalLockAt, saleClosedAt };
  if (nowMs >= saleClosedAt) return { phase: "SALE_CLOSED", ticaiDate, kickoffAt, finalLockAt, saleClosedAt };
  if (nowMs >= bjtAt(ticaiDate, "20:00")) return { phase: "RISK_WATCH", ticaiDate, kickoffAt, finalLockAt, saleClosedAt };
  if (nowMs >= finalLockAt) return { phase: "FINAL_LOCK", ticaiDate, kickoffAt, finalLockAt, saleClosedAt };
  return { phase: "DRAFT_AUTO", ticaiDate, kickoffAt, finalLockAt, saleClosedAt };
}

function lockTypeForPhase(phase) {
  return phase === "FINAL_LOCK" || phase === "RISK_WATCH" || phase === "SALE_CLOSED" ? "FINAL_LOCK" : "PRE_LOCK";
}

function actionForPhase(phase, hasEnoughData) {
  if (!hasEnoughData) return "跳过";
  if (phase === "SALE_CLOSED" || phase === "RISK_WATCH") return "谨慎";
  return "可选";
}

function buildAutoSportteryPrediction(match, phaseInfo, capturedAt) {
  const normal = pickNormal(match.normal || {});
  const handicap = pickHandicap(match.handicapOdds || {});
  const probs = normalizedMarketProbabilities(match.normal || {});
  const scores = topScoreTexts(match.scoreOdds || []);
  const mainScore = scores[0] || "1-1";
  const counterScore = scores[1] || (normal?.label === "平" ? "0-0" : "1-1");
  const primaryPick = scoreDirection(mainScore) || normal?.label || "";
  const primaryHandicap = handicapDirectionFromScore(mainScore, match.handicap || "0") || handicap?.label || "";
  const totalGoalsPick = topGoalText(match.totalGoalsOdds || []);
  const objective = match.footballDataContext || {};
  const hasObjectiveState = Boolean(objective.homeState?.played || objective.awayState?.played || objective.stage);
  const canRecommend = !["RISK_WATCH", "SALE_CLOSED"].includes(phaseInfo.phase);
  const hasEnoughData = canRecommend && Boolean(normal && handicap && match.scoreOdds?.length && match.totalGoalsOdds?.length);
  const finalAction = actionForPhase(phaseInfo.phase, hasEnoughData);
  const confidence = hasEnoughData && normal?.odd <= 1.7 && hasObjectiveState ? "B+" : hasEnoughData && normal?.odd <= 1.7 ? "B" : hasEnoughData ? "C+" : "D";
  const advice =
    finalAction === "跳过"
      ? "数据不足不推"
      : phaseInfo.phase === "FINAL_LOCK"
        ? "自动最终锁版"
      : phaseInfo.phase === "DRAFT_AUTO"
        ? "自动初推演"
      : "风险观察";
  const conflictNotes = [];
  if (normal?.label && primaryPick && normal.label !== primaryPick) {
    conflictNotes.push(`胜平负低位${normal.label}与主比分${mainScore}不一致，按主比分改为${primaryPick}`);
  }
  if (handicap?.label && primaryHandicap && handicap.label !== primaryHandicap) {
    conflictNotes.push(`让球低位${handicap.label}与主比分${mainScore}不一致，按主比分改为${primaryHandicap}`);
  }
  const marketGap = conflictNotes.length
    ? `决策冲突闸门：${conflictNotes.join("；")}；反比分${counterScore}只作为风险分支。`
    : normal && handicap && !handicap.label.includes(normal.label)
    ? "胜平负低位与让球低位不完全一致，自动降级为风险观察方向。"
    : "胜平负低位、让球保护与比分低赔暂未出现强冲突。";
  const stageText = objective.stage ? `football-data 阶段 ${objective.stage}${objective.group ? ` / ${objective.group}` : ""}` : "football-data 阶段待补";
  const teamStateText = objective.stateSummary || "football-data 球队状态待补；自动层仍以体彩盘口结构为主。";
  const halfFullText = objective.halfScore || objective.regularScore
    ? `football-data 口径：半场 ${objective.halfScore || "-"}，90分钟 ${objective.regularScore || "-"}，duration=${objective.scoreDuration || "-"}。`
    : "未完赛或无比分时不使用加时/点球比分；赛果回填只认 90 分钟 regularTime。";
  const prediction = {
    sportteryKey: sportteryKey(match),
    matchId: match.matchId || "",
    no: match.no || "",
    issue: match.issue || match.no || "",
    date: match.ticaiDate || "",
    ticaiDate: match.ticaiDate || "",
    matchDate: match.matchDate || match.ticaiDate || "",
    kickoffTime: match.kickoffTime || "",
    competition: match.league || "竞彩",
    playType: "竞彩足球",
    home: match.home || "",
    away: match.away || "",
    type: `${match.league || "体彩"}自动云端推演`,
    modelVersion: "V4",
    confidence,
    advice,
    matchType: normal?.odd <= 1.55 ? "常规局" : "谨慎局",
    competitionModel: `${match.league || "体彩"} 云端自动 V4`,
    homeProb: `${Math.round(probs.home * 100)}%`,
    drawProb: `${Math.round(probs.draw * 100)}%`,
    awayProb: `${Math.round(probs.away * 100)}%`,
    xg: "云端自动盘口结构估计",
    poisson: [mainScore, counterScore].join(" / "),
    groupSituation: `${stageText}；体彩销售日 ${match.ticaiDate || "-"}，最终锁版截止 ${AUTO_DECISION_CUTOFF}，停售 ${SALE_CLOSE_TIME}。`,
    recentAnalysis: `${teamStateText} 自动推演已接入体彩当日赛程、胜平负、让球、比分低赔和总进球低赔；阵容伤停和人工深层战术信息未作为自动层硬输入。`,
    teamState: teamStateText,
    teamForm: teamStateText,
    competitionStage: objective.stage || "",
    objectiveDataLayer: objective,
    halftimeDecision: halfFullText,
    stateTransfer: `按 ${objective.stage || match.league || "赛事"} 阶段处理，半全场与60分钟分支复盘使用 football-data halfTime / regularTime。`,
    institutionLine: `胜平负低位 ${normal ? `${normal.label}${normal.odd}` : "-"}；让球低位 ${handicap ? `${handicap.label}${handicap.odd}` : "-"}。`,
    noiseFilter: "自动层排除单纯名气和排名叙事，低置信或数据缺口场次只保留为观察/跳过。",
    keyJudgement: hasEnoughData ? marketGap : "盘口字段不完整，自动层不强行给出正式推荐。",
    marketGap,
    script: `主脚本按主比分 ${mainScore} 收口，反脚本保留 ${counterScore}。`,
    dataQuality: hasEnoughData && hasObjectiveState ? "HIGH" : hasEnoughData ? "MEDIUM" : "LOW",
    decisionConflict: marketGap,
    conflictResolution: conflictNotes.length ? marketGap : "",
    finalDecisionAction: `${advice}：胜平负 ${primaryPick || "-"}；让球 ${primaryHandicap || "-"}；总进球 ${totalGoalsPick}；比分 ${mainScore} / ${counterScore}。`,
    pick: hasEnoughData ? primaryPick : "",
    handicapPick: hasEnoughData ? primaryHandicap : "",
    totalGoalsPick,
    mainScore,
    counterScore,
    handicap: `${match.home || "主队"}${match.handicap || "0"}：${handicap?.label || "待定"}`,
    autoGenerated: true,
    autoStatus: phaseInfo.phase,
    generatedAt: capturedAt,
    finalLockDeadline: isoFromMs(phaseInfo.finalLockAt),
    saleCloseAt: isoFromMs(phaseInfo.saleClosedAt),
  };
  const lockType = lockTypeForPhase(phaseInfo.phase);
  return {
    prediction,
    lock: {
      lockId: `auto-${sportteryDbMatchId(match)}-${match.ticaiDate || "sales"}-${lockType}`,
      lockType,
      recommendation: prediction.pick,
      recommendationSide: hasEnoughData ? normal?.side || "SKIP" : "SKIP",
      finalGrade: confidence.slice(0, 1),
      finalAction,
      confidenceScore: confidence === "B+" ? 78 : confidence === "B" ? 72 : confidence === "C+" ? 58 : 20,
      riskScore: confidence === "B+" ? 24 : confidence === "B" ? 28 : confidence === "C+" ? 42 : 80,
      consistencyScore: marketGap.includes("不完全一致") ? 2 : hasObjectiveState ? 4 : 3,
      sportteryHomeProb: probs.home,
      sportteryDrawProb: probs.draw,
      sportteryAwayProb: probs.away,
      valueHomeGap: 0,
      valueDrawGap: 0,
      valueAwayGap: 0,
      dataQuality: prediction.dataQuality,
      reasoningSummary: prediction.finalDecisionAction,
      payload: {
        autoGenerated: true,
        autoStatus: phaseInfo.phase,
        sportteryPrediction: prediction,
      },
    },
  };
}

async function createAutoLocks(db, matches, capturedAt) {
  const nowMs = Date.now();
  const today = bjtParts(new Date(nowMs)).date;
  let created = 0;
  let skipped = 0;
  const statuses = {};
  for (const match of matches) {
    if ((match.ticaiDate || "") !== today) continue;
    const phaseInfo = autoPhaseForMatch(match, nowMs);
    statuses[phaseInfo.phase] = (statuses[phaseInfo.phase] || 0) + 1;
    if (phaseInfo.phase === "MATCH_STARTED") {
      skipped += 1;
      continue;
    }
    const { prediction, lock } = buildAutoSportteryPrediction(match, phaseInfo, capturedAt);
    const matchId = sportteryDbMatchId(match);
    const existingFinal = await db.prepare(`
      SELECT lock_id FROM locked_predictions
      WHERE match_id = ? AND lock_type = 'FINAL_LOCK'
      ORDER BY locked_at DESC LIMIT 1
    `).bind(matchId).first();
    if (existingFinal) {
      skipped += 1;
      continue;
    }
    const existingSame = await db.prepare("SELECT lock_id FROM locked_predictions WHERE lock_id = ?").bind(lock.lockId).first();
    if (existingSame) {
      skipped += 1;
      continue;
    }
    await db.prepare(`
      INSERT INTO locked_predictions (
        lock_id, match_id, match_code, home_team, away_team, league, kickoff_time, locked_at, lock_type, model_version,
        model_home_prob, model_draw_prob, model_away_prob, recommendation, recommendation_side, final_grade, final_action,
        confidence_score, risk_score, consistency_score, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
        sporttery_home_prob, sporttery_draw_prob, sporttery_away_prob, value_home_gap, value_draw_gap, value_away_gap,
        asian_handicap, euro_home_odds, euro_draw_odds, euro_away_odds, euro_home_prob, euro_draw_prob, euro_away_prob,
        data_quality, reasoning_summary, downgrade_reasons_json, result_status, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'V4', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).bind(
      lock.lockId,
      matchId,
      match.issue || match.no || "",
      match.home || "",
      match.away || "",
      match.league || "竞彩",
      `${match.matchDate || match.ticaiDate || ""} ${match.kickoffTime || ""}`.trim(),
      capturedAt,
      lock.lockType,
      lock.sportteryHomeProb,
      lock.sportteryDrawProb,
      lock.sportteryAwayProb,
      lock.recommendation,
      lock.recommendationSide,
      lock.finalGrade,
      lock.finalAction,
      lock.confidenceScore,
      lock.riskScore,
      lock.consistencyScore,
      n(match.normal?.win, null),
      n(match.normal?.draw, null),
      n(match.normal?.lose, null),
      lock.sportteryHomeProb,
      lock.sportteryDrawProb,
      lock.sportteryAwayProb,
      lock.valueHomeGap,
      lock.valueDrawGap,
      lock.valueAwayGap,
      n(String(match.handicap || "0").replace("+", ""), null),
      n(match.normal?.win, null),
      n(match.normal?.draw, null),
      n(match.normal?.lose, null),
      lock.sportteryHomeProb,
      lock.sportteryDrawProb,
      lock.sportteryAwayProb,
      lock.dataQuality,
      lock.reasoningSummary,
      JSON.stringify([prediction.decisionConflict].filter(Boolean)),
      JSON.stringify(lock.payload)
    ).run();
    created += 1;
  }
  return { created, skipped, statuses };
}

async function autoReviewMatch(db, matchId) {
  const matchRecord = await ensureMatchForStoredResult(db, matchId);
  const historicalSample = await upsertCompletedMatchHistoricalSample(db, matchId);
  const locks = await db.prepare("SELECT lock_id, lock_type FROM locked_predictions WHERE match_id = ?").bind(matchId).all();
  let reviewed = 0;
  let cases = 0;
  let shadowAudits = 0;
  for (const lock of locks.results || []) {
    if (lock.lock_type === "PRE_LOCK") {
      const shadow = await createShadowAuditForLock(db, lock.lock_id);
      if (shadow.ok) {
        reviewed += 1;
        shadowAudits += 1;
      }
      continue;
    }
    const created = await createCaseForLock(db, lock.lock_id);
    if (created.ok) reviewed += 1;
    if (created.caseId && !created.duplicated) cases += 1;
  }
  return { reviewed, cases, shadowAudits, historicalSample, matchRecord };
}

async function reconcileCompletedSamples(db, limit = 4) {
  const safeLimit = Math.min(Math.max(Number(limit || 4), 1), 8);
  const seeded = await db.prepare(`
    INSERT OR IGNORE INTO matches (
      match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at
    )
    SELECT
      mr.match_id,
      COALESCE(json_extract(mr.payload_json, '$.issue'), json_extract(mr.payload_json, '$.no'), ''),
      COALESCE(json_extract(mr.payload_json, '$.league'), '竞彩'),
      COALESCE(json_extract(mr.payload_json, '$.home'), json_extract(mr.payload_json, '$.homeTeam')),
      COALESCE(json_extract(mr.payload_json, '$.away'), json_extract(mr.payload_json, '$.awayTeam')),
      TRIM(COALESCE(json_extract(mr.payload_json, '$.matchDate'), json_extract(mr.payload_json, '$.ticaiDate'), json_extract(mr.payload_json, '$.date'), '') || ' ' || COALESCE(json_extract(mr.payload_json, '$.kickoffTime'), '')),
      'FINISHED',
      mr.payload_json,
      COALESCE(mr.updated_at, CURRENT_TIMESTAMP)
    FROM match_results mr
    LEFT JOIN matches m ON m.match_id = mr.match_id
    WHERE m.match_id IS NULL
      AND COALESCE(json_extract(mr.payload_json, '$.home'), json_extract(mr.payload_json, '$.homeTeam'), '') <> ''
      AND COALESCE(json_extract(mr.payload_json, '$.away'), json_extract(mr.payload_json, '$.awayTeam'), '') <> ''
    LIMIT 500
  `).run();
  const rows = await db.prepare(`
    SELECT DISTINCT mr.match_id
    FROM match_results mr
    WHERE (
      EXISTS (
        SELECT 1 FROM odds_snapshots os
        WHERE os.match_id = mr.match_id
          AND os.sporttery_home_sp > 1 AND os.sporttery_draw_sp > 1 AND os.sporttery_away_sp > 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM external_historical_samples e
        WHERE e.sample_id = 'completed-' || mr.match_id
      )
    ) OR EXISTS (
      SELECT 1 FROM locked_predictions lp
      LEFT JOIN case_base cb ON cb.source_lock_id = lp.lock_id
      WHERE lp.match_id = mr.match_id
        AND lp.lock_type = 'FINAL_LOCK'
        AND (
          cb.case_id IS NULL
          OR json_extract(cb.payload_json, '$.match.matchId') IS NULL
          OR json_extract(cb.payload_json, '$.leagueType') IS NULL
          OR json_extract(cb.payload_json, '$.lockedOdds.homeSp') IS NULL
          OR json_extract(cb.payload_json, '$.oddsMovement') IS NULL
          OR json_extract(cb.payload_json, '$.judgementBasis') IS NULL
          OR json_extract(cb.payload_json, '$.actualScore') IS NULL
        )
    )
    ORDER BY mr.reviewed_at ASC
    LIMIT ?
  `).bind(safeLimit).all();
  let reviewed = 0;
  let cases = 0;
  let historicalSamples = 0;
  const skipped = [];
  for (const row of rows.results || []) {
    const result = await autoReviewMatch(db, row.match_id);
    reviewed += result.reviewed;
    cases += result.cases;
    if (result.historicalSample?.stored) historicalSamples += 1;
    else skipped.push({ matchId: row.match_id, reason: result.historicalSample?.reason || "unknown" });
  }
  return {
    ok: true,
    seededMatches: Number(seeded?.meta?.changes || seeded?.changes || 0),
    scanned: rows.results?.length || 0,
    reviewed,
    cases,
    historicalSamples,
    skipped,
    batchLimit: safeLimit,
  };
}

function sportteryResultRowsFromPages(resultPages = []) {
  const resultSeen = new Set();
  return resultPages.flatMap((raw) => {
    const resultDays = raw?.value?.matchInfoList || [];
    return resultDays.flatMap((day) =>
      (day.subMatchList || []).flatMap((match) => {
        const item = normalizeSportteryResult(match, day.matchDate || day.businessDate);
        const key = sportteryDbMatchId(item);
        if (resultSeen.has(key)) return [];
        resultSeen.add(key);
        return [item];
      })
    );
  });
}

async function syncOfficialSportteryResultsToD1(db, env, { maxPages = 5 } = {}) {
  const capturedAt = new Date().toISOString();
  const resultPages = await fetchSportteryResultPages(env, maxPages);
  const resultRows = sportteryResultRowsFromPages(resultPages);
  let resultCount = 0;
  let reviewed = 0;
  let cases = 0;
  const officialOverrides = [];
  for (const result of resultRows) {
    const parsed = parseSportteryScore(result.fullScoreRaw || "");
    if (!parsed) continue;
    const matchId = sportteryDbMatchId(result);
    const existing = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(matchId).first();
    if (existing) {
      const existingPayload = parseObject(existing.payload_json);
      const existingScore = `${existing.full_time_home_goals}-${existing.full_time_away_goals}`;
      if (String(existingPayload.resultSource || "").startsWith("live-fallback") && existingScore !== parsed.text) {
        officialOverrides.push({
          matchId,
          issue: result.issue || result.no || "",
          home: result.home,
          away: result.away,
          liveFallbackScore: existingScore,
          officialScore: parsed.text,
        });
      }
    }
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      parsed.home,
      parsed.away,
      sideFromResult(parsed.home, parsed.away),
      parsed.home + parsed.away,
      capturedAt,
      JSON.stringify({ ...result, cloudMatchId: matchId, resultSource: "sporttery-official" }),
      capturedAt
    ).run();
    const review = await autoReviewMatch(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    resultCount += 1;
  }
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'sporttery-official-results', 'OK', 'sporttery official results sync completed', ?, ?)
  `).bind(
    `sporttery-results-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({ pages: resultPages.length, scannedResults: resultRows.length, resultCount, reviewed, cases, officialOverrides }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, pages: resultPages.length, scannedResults: resultRows.length, results: resultCount, reviewed, cases, officialOverrides };
}

async function syncSportteryToD1(db, env, supplied = null) {
  const capturedAt = new Date().toISOString();
  const [calculatorRaw, resultPages] = supplied
    ? [supplied.calculatorRaw, supplied.resultPages || []]
    : await Promise.all([
        fetchSportteryJson(env, sportteryApis.calculator),
        fetchSportteryResultPages(env),
      ]);
  const days = calculatorRaw?.value?.matchInfoList || [];
  const rawMatches = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeSportteryMatch(match, day.businessDate))
  );
  const footballContext = await fetchFootballDataContext(env, rawMatches);
  const matches = rawMatches.map((match) => ({
    ...match,
    footballDataContext: footballDataContextForMatch(match, footballContext),
  }));
  for (const match of matches) {
    const matchId = sportteryDbMatchId(match);
    await db.prepare(`
      INSERT INTO matches (match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        match_code=excluded.match_code, league=excluded.league, home_team=excluded.home_team, away_team=excluded.away_team,
        kickoff_time=excluded.kickoff_time, status=excluded.status, payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      match.issue || match.no || "",
      match.league || "竞彩",
      match.home || "",
      match.away || "",
      `${match.matchDate || match.ticaiDate || ""} ${match.kickoffTime || ""}`.trim(),
      "SCHEDULED",
      JSON.stringify({ ...match, cloudMatchId: matchId }),
      capturedAt
    ).run();
    await db.prepare(`
      INSERT INTO odds_snapshots (snapshot_id, match_id, source, captured_at, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp, handicap, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `odds-${matchId}-${capturedAt}`,
      matchId,
      "sporttery",
      capturedAt,
      n(match.normal?.win, null),
      n(match.normal?.draw, null),
      n(match.normal?.lose, null),
      n(String(match.handicap || "0").replace("+", ""), null),
      JSON.stringify(match)
    ).run();
  }
  const autoLocks = { created: 0, skipped: 0, disabled: true, reason: "automatic predictions are disabled; use manual locks only" };

  const resultSeen = new Set();
  const currentMatchIds = new Set(matches.map((match) => sportteryDbMatchId(match)));
  const currentDates = new Set(matches.flatMap((match) => [match.ticaiDate, match.matchDate]).filter(Boolean));
  const resultRows = resultPages.flatMap((raw) => {
    const resultDays = raw?.value?.matchInfoList || [];
    return resultDays.flatMap((day) =>
      (day.subMatchList || []).flatMap((match) => {
        const item = normalizeSportteryResult(match, day.matchDate || day.businessDate);
        const key = sportteryDbMatchId(item);
        if (resultSeen.has(key)) return [];
        resultSeen.add(key);
        if (
          !currentMatchIds.has(key) &&
          !currentDates.has(item.ticaiDate) &&
          !currentDates.has(item.matchDate)
        ) {
          return [];
        }
        return [item];
      })
    );
  });
  let resultCount = 0;
  let liveFallbackCount = 0;
  let reviewed = 0;
  let cases = 0;
  const officialMatchIds = new Set();
  const officialOverrides = [];
  for (const result of resultRows) {
    const parsed = parseSportteryScore(result.fullScoreRaw || "");
    if (!parsed) continue;
    const matchId = sportteryDbMatchId(result);
    officialMatchIds.add(matchId);
    const existing = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(matchId).first();
    if (existing) {
      const existingPayload = parseObject(existing.payload_json);
      const existingScore = `${existing.full_time_home_goals}-${existing.full_time_away_goals}`;
      if (String(existingPayload.resultSource || "").startsWith("live-fallback") && existingScore !== parsed.text) {
        officialOverrides.push({
          matchId,
          issue: result.issue || result.no || "",
          home: result.home,
          away: result.away,
          liveFallbackScore: existingScore,
          officialScore: parsed.text,
        });
      }
    }
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      parsed.home,
      parsed.away,
      sideFromResult(parsed.home, parsed.away),
      parsed.home + parsed.away,
      capturedAt,
      JSON.stringify({ ...result, cloudMatchId: matchId, resultSource: "sporttery-official" }),
      capturedAt
    ).run();
    const review = await autoReviewMatch(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    resultCount += 1;
  }

  let liveRows = { matches: [], errors: [] };
  try {
    liveRows = await fetchLiveFallbackMatches(env, matches);
  } catch (error) {
    liveRows = { matches: [], errors: [{ date: "all", message: error.message || "live fallback failed" }] };
  }
  for (const match of matches) {
    const matchId = sportteryDbMatchId(match);
    if (officialMatchIds.has(matchId)) continue;
    const live = liveResultForSportteryMatch(match, liveRows.matches);
    if (!live) continue;
    const parsed = parseDashScore(live.score);
    if (!parsed) continue;
    const existing = await db.prepare("SELECT payload_json FROM match_results WHERE match_id = ?").bind(matchId).first();
    const existingPayload = parseObject(existing?.payload_json);
    if (existing && !String(existingPayload.resultSource || "").startsWith("live-fallback")) continue;
    const result = {
      ...match,
      statusCode: "live-finished",
      statusName: "已完赛",
      halfScore: live.halfScore || "",
      fullScoreRaw: `${parsed.home}:${parsed.away}`,
      score: parsed.text,
      result: parsed.home > parsed.away ? "胜" : parsed.home < parsed.away ? "负" : "平",
      winner: live.winnerZh || "",
      winnerSide: live.winnerSide || "",
      penaltyScore: live.penaltyScore || "",
      scoreDuration: live.scoreDuration || "",
      liveSource: live.source,
      liveExternalId: live.externalId,
      resultSource: `live-fallback-${String(live.source || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"}`,
      officialComparison: "pending",
    };
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      parsed.home,
      parsed.away,
      sideFromResult(parsed.home, parsed.away),
      parsed.home + parsed.away,
      capturedAt,
      JSON.stringify({ ...result, cloudMatchId: matchId }),
      capturedAt
    ).run();
    const review = await autoReviewMatch(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    liveFallbackCount += 1;
  }
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'sporttery-pages-api', 'OK', 'sync completed', ?, ?)
  `).bind(
    `sync-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({
      matchCount: matches.length,
      resultCount,
      liveFallbackCount,
      reviewed,
      cases,
      autoLocks,
      resultPages: resultPages.length,
      liveFallbackErrors: liveRows.errors,
      footballDataContextErrors: footballContext.errors,
      officialOverrides,
    }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, matchCount: matches.length, resultCount, liveFallbackCount, reviewed, cases, autoLocks, officialOverrides, footballDataContextErrors: footballContext.errors };
}

function d1RowToSportteryMatch(row) {
  const payload = parseObject(row.payload_json);
  const kickoff = String(row.kickoff_time || "");
  const [kickoffDate, kickoffTime = ""] = kickoff.split(/\s+/);
  return {
    ...payload,
    matchId: payload.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
    issue: payload.issue || row.match_code || "",
    no: payload.no || compactSportteryNo(row.match_code || ""),
    ticaiDate: payload.ticaiDate || kickoffDate || "",
    matchDate: payload.matchDate || kickoffDate || "",
    kickoffTime: payload.kickoffTime || kickoffTime.slice(0, 5),
    league: payload.league || row.league || "",
    home: payload.home || row.home_team || "",
    away: payload.away || row.away_team || "",
    cloudMatchId: row.match_id,
  };
}

export function lockRowToSportteryMatch(row = {}) {
  const payload = parseObject(row.payload_json);
  const prediction = parseObject(payload.sportteryPrediction);
  const kickoffText = firstText(
    row.kickoff_time,
    payload.kickoffTime,
    [prediction.matchDate || prediction.ticaiDate, prediction.kickoffTime].filter(Boolean).join(" ")
  );
  const [kickoffDate = "", kickoffTime = ""] = String(kickoffText || "").trim().split(/\s+/);
  const compactMatchId = String(row.match_id || payload.matchId || prediction.matchId || "").replace(/^sporttery-/, "");
  return {
    ...prediction,
    matchId: compactMatchId,
    issue: prediction.issue || payload.matchCode || row.match_code || "",
    no: prediction.no || compactSportteryNo(payload.matchCode || row.match_code || ""),
    ticaiDate: prediction.ticaiDate || prediction.matchDate || kickoffDate,
    matchDate: prediction.matchDate || kickoffDate,
    kickoffTime: prediction.kickoffTime || kickoffTime.slice(0, 5),
    league: prediction.competition || payload.league || row.league || "",
    home: prediction.home || payload.homeTeam || row.home_team || "",
    away: prediction.away || payload.awayTeam || row.away_team || "",
    cloudMatchId: String(row.match_id || payload.matchId || (compactMatchId ? `sporttery-${compactMatchId}` : "")),
    liveTargetSource: "locked_predictions",
  };
}

export function mergeLiveTargetMatches(matchRows = [], lockRows = []) {
  const byId = new Map();
  const add = (match = {}) => {
    const compactId = String(match.cloudMatchId || match.matchId || "").replace(/^sporttery-/, "");
    if (!compactId || !match.home || !match.away) return;
    const existing = byId.get(compactId);
    if (!existing) {
      byId.set(compactId, { ...match, matchId: compactId, cloudMatchId: `sporttery-${compactId}` });
      return;
    }
    const merged = { ...existing };
    for (const [key, value] of Object.entries(match)) {
      if ((merged[key] === undefined || merged[key] === null || merged[key] === "") && value !== undefined && value !== null && value !== "") {
        merged[key] = value;
      }
    }
    byId.set(compactId, merged);
  };
  matchRows.map(d1RowToSportteryMatch).forEach((match) => add({ ...match, liveTargetSource: "matches" }));
  lockRows.map(lockRowToSportteryMatch).forEach(add);
  return [...byId.values()];
}

function liveTargetWithinWindow(match = {}, now = Date.now(), pastDays = 2, futureDays = 2) {
  const kickoffAt = bjtAt(match.matchDate || match.ticaiDate, match.kickoffTime || "00:00");
  if (!Number.isFinite(kickoffAt)) return true;
  return kickoffAt >= now - pastDays * 86400000 && kickoffAt <= now + futureDays * 86400000;
}

async function d1LiveTargetMatches(db, { pastDays = 2, futureDays = 2, matchLimit = 300, lockLimit = 500 } = {}) {
  const [matchRows, lockRows] = await Promise.all([
    db.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT ?").bind(matchLimit).all(),
    db.prepare(`
      SELECT * FROM locked_predictions
      WHERE kickoff_time IS NOT NULL AND kickoff_time != ''
      ORDER BY locked_at DESC
      LIMIT ?
    `).bind(lockLimit).all(),
  ]);
  const now = Date.now();
  return mergeLiveTargetMatches(matchRows.results || [], lockRows.results || [])
    .filter((match) => liveTargetWithinWindow(match, now, pastDays, futureDays));
}

async function insertMissingLiveTargetMatch(db, match = {}, capturedAt = new Date().toISOString()) {
  const compactId = String(match.cloudMatchId || match.matchId || "").replace(/^sporttery-/, "");
  if (!compactId || !match.home || !match.away) return false;
  const cloudMatchId = `sporttery-${compactId}`;
  const payload = { ...match, matchId: compactId, cloudMatchId, sourcePriority: match.sourcePriority || "locked-prediction-parent" };
  delete payload.liveTargetSource;
  const result = await db.prepare(`
    INSERT INTO matches (match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO NOTHING
  `).bind(
    cloudMatchId,
    match.issue || match.no || "",
    match.league || "竞彩",
    match.home,
    match.away,
    `${match.matchDate || match.ticaiDate || ""} ${match.kickoffTime || ""}`.trim(),
    match.statusCode || "LOCKED_PREDICTION",
    JSON.stringify(payload),
    capturedAt
  ).run();
  return Number(result.meta?.changes || 0) > 0;
}

function decodeTextBody(bytes) {
  for (const encoding of ["gbk", "gb18030", "utf-8"]) {
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {}
  }
  return new TextDecoder().decode(bytes);
}

function extractAssignedObject(source = "", marker = "") {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf("{", markerIndex);
  if (start < 0) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

function scoreFromOkoooResult(value = "") {
  const found = String(value || "").match(/^Score(\d)(\d)$/);
  if (!found) return null;
  const home = Number(found[1]);
  const away = Number(found[2]);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function parseOkoooJczqResults(html = "") {
  const objectText = extractAssignedObject(html, "var oddsData");
  if (!objectText) throw new Error("OKOOO oddsData not found");
  const oddsData = JSON.parse(objectText);
  return Object.entries(oddsData).map(([orderId, item]) => {
    const result = item?.Result || {};
    const parsed = scoreFromOkoooResult(result.SportteryScore);
    return {
      orderId,
      score: parsed?.text || "",
      homeGoals: parsed?.home,
      awayGoals: parsed?.away,
      result,
      boundary: item?.Boundary || {},
      hasResult: Boolean(parsed),
      rawScoreCode: result.SportteryScore || "",
    };
  });
}

function parseOkoooJczqLiveScores(html = "") {
  const objectText = extractAssignedObject(html, "var oddsData");
  if (!objectText) throw new Error("OKOOO oddsData not found for live scores");
  const oddsData = JSON.parse(objectText);
  const rows = [];
  const blockPattern = /<div id="match_(\d+)"[\s\S]*?(?=<div id="match_\d+"|<div class="listtop-new|$)/gi;
  let matched;
  while ((matched = blockPattern.exec(html))) {
    const orderId = matched[1];
    const block = matched[0];
    const capture = (pattern) => okoooPlainText(block.match(pattern)?.[1] || "");
    const home = capture(/class="ctrl_homename"[^>]*>([\s\S]*?)<\/em>/i);
    const away = capture(/class="ctrl_awayname"[^>]*>([\s\S]*?)<\/em>/i);
    const scoreText = capture(/class="[^\"]*zVS[^\"]*"[^>]*>([\s\S]*?)<\/span>/i).replace(":", "-");
    const score = parseDashScore(scoreText);
    if (!home || !away || !score) continue;
    const result = oddsData[orderId]?.Result || {};
    const isFinished = Boolean(scoreFromOkoooResult(result.SportteryScore));
    rows.push({
      source: "OKOOO-live",
      externalId: orderId,
      orderId,
      date: "",
      time: "",
      league: capture(/class="liansai"[^>]*>([\s\S]*?)<\/a>/i) || "竞彩",
      home,
      away,
      homeZh: home,
      awayZh: away,
      score: score.text,
      halfScore: "",
      status: isFinished ? "FINISHED" : "LIVE",
      statusName: isFinished ? "已完赛" : "进行中",
      isFinished,
      live: !isFinished,
      scoreDuration: "REGULAR",
      scoreMode: isFinished ? "fullTime" : "liveRegularTime",
    });
  }
  return rows;
}

export function parseOkoooLiveCenterScores(text = "") {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>[\s\S]*?<td[^>]*class="show_score"[^>]*val="(\d+)"[\s\S]*?<\/tr>/gi;
  let matched;
  while ((matched = rowPattern.exec(text))) {
    const block = matched[0];
    const capture = (pattern) => okoooPlainText(block.match(pattern)?.[1] || "");
    const externalId = matched[1];
    const home = capture(/class="ctrl_homename[^\"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const away = capture(/class="ctrl_awayname[^\"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const homeScoreText = capture(/class="[^\"]*ctrl_homescore[^\"]*"[^>]*>([\s\S]*?)<\/b>/i);
    const awayScoreText = capture(/class="[^\"]*ctrl_awayscore[^\"]*"[^>]*>([\s\S]*?)<\/b>/i);
    const homeScore = homeScoreText === "" ? NaN : Number(homeScoreText);
    const awayScore = awayScoreText === "" ? NaN : Number(awayScoreText);
    const status = capture(/class="ctrl_time"[^>]*>([\s\S]*?)<\/span>/i);
    const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
    const unavailable = liveFallbackRowHasAuthoritativeStatus({ status });
    if (!home || !away || (!hasScore && !unavailable)) continue;
    const isFinished = /完|finish|after|ft/i.test(status);
    const live = !isFinished && /\d|半|中|live|in.?play/i.test(status);
    if (!isFinished && !live && !unavailable) continue;
    rows.push({
      source: "OKOOO-live",
      externalId,
      date: "",
      time: "",
      league: capture(/class="match_league"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || "足球",
      home,
      away,
      homeZh: home,
      awayZh: away,
      score: hasScore ? `${homeScore}-${awayScore}` : "",
      halfScore: capture(/<span class="font_(?:red|blue)">\s*(\d+\s*-\s*\d+)\s*<\/span>/i).replace(/\s/g, ""),
      status: isFinished ? "FINISHED" : status || "LIVE",
      statusName: isFinished ? "已完赛" : status || "进行中",
      statusLabel: isFinished ? "已完赛" : status || "进行中",
      minute: status,
      isFinished,
      live,
      unavailable,
      scoreDuration: "REGULAR",
      scoreMode: isFinished ? "fullTime" : live ? "liveRegularTime" : "",
    });
  }
  return rows;
}

async function fetchOkoooJczqLiveScores(env) {
  const response = await fetch(env.OKOOO_LIVE_CENTER_URL || okoooLiveCenterUrl, { headers: okoooHeaders });
  const text = decodeTextBody(await response.arrayBuffer());
  if (!response.ok) throw new Error(`OKOOO live ${response.status}: ${text.slice(0, 200)}`);
  const rows = parseOkoooLiveCenterScores(text);
  if (!rows.length) throw new Error("OKOOO live center returned no scored live/finished/status rows");
  return rows;
}

async function fetchOkoooJczqResults(env) {
  const response = await fetch(env.OKOOO_JCZQ_URL || okoooJczqUrl, { headers: okoooHeaders });
  const text = decodeTextBody(await response.arrayBuffer());
  if (!response.ok) throw new Error(`OKOOO ${response.status}: ${text.slice(0, 200)}`);
  return parseOkoooJczqResults(text);
}
async function debugOkoooJczq(env) {
  const response = await fetch(env.OKOOO_JCZQ_URL || okoooJczqUrl, { headers: okoooHeaders });
  const text = decodeTextBody(await response.arrayBuffer());

  const objectText = extractAssignedObject(text, "var oddsData");
  if (!objectText) {
    return {
      ok: false,
      error: "oddsData not found",
      htmlStart: text.slice(0, 1200),
      htmlIncludesOddsData: text.includes("oddsData"),
      htmlIncludesMatch: text.includes("match"),
      htmlIncludesJczq: text.includes("jczq"),
    };
  }

  const oddsData = JSON.parse(objectText);
  const samples = Object.entries(oddsData).slice(0, 5).map(([orderId, item]) => ({
    orderId,
    topKeys: Object.keys(item || {}),
    sample: item,
  }));

  return {
    ok: true,
    count: Object.keys(oddsData).length,
    liveScoreCount: parseOkoooJczqLiveScores(text).length,
    liveScoreSamples: parseOkoooJczqLiveScores(text).slice(0, 12),
    samples,
  };
}
function oddText(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function normalizeOkoooHandicap(value = "") {
  const text = String(value || "0").trim();
  if (!text) return "0";
  const num = Number(text.replace("+", ""));
  if (!Number.isFinite(num)) return text;
  if (num > 0) return `+${num}`;
  return String(num);
}

function normalizeOkoooIssue(orderId = "") {
  const no = String(orderId || "").slice(-3).padStart(3, "0");
  return { no, issue: no };
}

const okoooScoreOptionMap = {
  30: "1:0", 31: "2:0", 32: "2:1", 33: "3:0", 34: "3:1", 35: "3:2",
  36: "4:0", 37: "4:1", 38: "4:2", 39: "5:0", 40: "5:1", 41: "5:2", 42: "胜其它",
  43: "0:0", 44: "1:1", 45: "2:2", 46: "3:3", 47: "平其它",
  48: "0:1", 49: "0:2", 50: "1:2", 51: "0:3", 52: "1:3", 53: "2:3",
  54: "0:4", 55: "1:4", 56: "2:4", 57: "0:5", 58: "1:5", 59: "2:5", 60: "负其它",
};

function okoooScoreOdds(scoreMarket = {}) {
  return Object.entries(scoreMarket)
    .map(([key, value]) => {
      const score = okoooScoreOptionMap[key];
      if (!score || !oddText(value)) return null;
      const matched = score.match(/^(\d+):(\d+)$/);
      const bucket = matched ? sportteryScoreBucket(Number(matched[1]), Number(matched[2])) : score[0];
      return { score, odds: oddText(value), bucket };
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.odds) - Number(right.odds))
    .slice(0, 12);
}

function okoooTotalGoalsOdds(totalGoalsMarket = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = totalGoalsMarket[String(index).padStart(2, "0")];
    return oddText(value) ? { goals: index === 7 ? "7+" : String(index), odds: oddText(value) } : null;
  }).filter(Boolean);
}

function parseOkoooDate(value = "") {
  const text = String(value || "");
  const found = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!found) return "";
  return `${found[1]}-${found[2].padStart(2, "0")}-${found[3].padStart(2, "0")}`;
}

function parseOkoooTime(value = "") {
  const text = String(value || "");
  const found = text.match(/(\d{1,2}):(\d{2})/);
  if (!found) return "";
  return `${found[1].padStart(2, "0")}:${found[2]}`;
}

function okoooPlainText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function okoooCalendarDate(monthDay = "") {
  const found = String(monthDay).match(/(\d{1,2})-(\d{1,2})/);
  if (!found) return "";
  const now = new Date(Date.now() + BJT_OFFSET_MS);
  const month = Number(found[1]);
  let year = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (currentMonth === 1 && month === 12) year -= 1;
  if (currentMonth === 12 && month === 1) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${found[2].padStart(2, "0")}`;
}

function parseOkoooJczqMatches(html = "") {
  const objectText = extractAssignedObject(html, "var oddsData");
  if (!objectText) throw new Error("OKOOO oddsData not found");

  const oddsData = JSON.parse(objectText);
  const capturedAt = new Date().toISOString();

  const dayMarkers = [];
  const dayPattern = /listtop-new[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  let dayMatch;
  while ((dayMatch = dayPattern.exec(html))) {
    const date = okoooCalendarDate(okoooPlainText(dayMatch[1]).match(/\d{1,2}-\d{1,2}/)?.[0] || "");
    if (date) dayMarkers.push({ index: dayMatch.index, date });
  }

  return Object.entries(oddsData).flatMap(([orderId, item]) => {
    const result = item?.Result || {};

    const hasFinished =
      Boolean(result.SportteryScore) ||
      Boolean(result.HomeScore) ||
      Boolean(result.AwayScore);

    if (hasFinished) return [];

    const boundary = item?.Boundary || {};
    const odds = item?.OddsList || item?.Odds || item?.odds || {};
    const marker = `<div id="match_${orderId}"`;
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) return [];
    const previousMatch = html.lastIndexOf("jsMatchItem", markerIndex);
    const nextMatch = html.indexOf("jsMatchItem", markerIndex + marker.length);
    const block = html.slice(Math.max(0, previousMatch - 300), nextMatch > markerIndex ? nextMatch : markerIndex + 5000);
    const latestDay = dayMarkers.filter((entry) => entry.index < markerIndex).at(-1)?.date || "";

    const capture = (pattern) => okoooPlainText(block.match(pattern)?.[1] || "");
    const home = capture(/class="ctrl_homename"[^>]*>([\s\S]*?)<\/em>/i);
    const away = capture(/class="ctrl_awayname"[^>]*>([\s\S]*?)<\/em>/i);
    const league = capture(/class="liansai"[^>]*>([\s\S]*?)<\/a>/i) || "竞彩";
    // OKOOO's list `timetxt` is the local Sporttery sale-close clock, not a
    // reliable fixture kickoff clock. Keep it for sales context only; the
    // official Sporttery calculator supplies matchDate + kickoffTime below.
    const salesCloseTime = capture(/class="timetxt"[^>]*>([\s\S]*?)<\/time>/i) || "";
    const matchId = block.match(/matchid="(\d+)"/i)?.[1] || block.match(/MatchID=(\d+)/i)?.[1] || `okooo-${orderId}`;
    const issueText = capture(/class="xuhao"[^>]*>([\s\S]*?)<\/p>/i);
    const no = String(orderId).slice(-3).padStart(3, "0");
    const issue = issueText || no;

    if (!home || !away) return [];
    const normal = odds.SportteryNWDL || null;
    const handicapOdds = odds.SportteryWDL || null;

    const match = {
      orderId: String(orderId),
      issue,
      no,
      ticaiDate: latestDay,
      matchDate: "",
      kickoffTime: "",
      salesCloseTime,
      league,
      matchId,
      home,
      away,
      venue: "",
      statusCode: "Selling",
      score: "",
      handicap: normalizeOkoooHandicap(
        boundary.SportteryWDL ||
        boundary.Handicap ||
        boundary.GoalLine ||
        item.Handicap ||
        item.GoalLine ||
        "0"
      ),
      normal: normal ? {
        // OKOOO option ids follow the page buttons: 16=胜, 15=平, 14=负.
        // Do not infer direction from the numeric order; that reverses every market.
        win: oddText(normal["16"] || normal.HomeWin || normal.Win || normal.H || normal.h),
        draw: oddText(normal["15"] || normal.Draw || normal.D || normal.d),
        lose: oddText(normal["14"] || normal.AwayWin || normal.Lose || normal.A || normal.a),
      } : null,
      handicapOdds: handicapOdds ? {
        // Handicap buttons use 13=让胜, 11=让平, 10=让负.
        win: oddText(handicapOdds["13"] || handicapOdds.HomeWin || handicapOdds.Win || handicapOdds.H || handicapOdds.h),
        draw: oddText(handicapOdds["11"] || handicapOdds.Draw || handicapOdds.D || handicapOdds.d),
        lose: oddText(handicapOdds["10"] || handicapOdds.AwayWin || handicapOdds.Lose || handicapOdds.A || handicapOdds.a),
      } : null,
      scoreOdds: okoooScoreOdds(odds.SportteryScore || {}),
      totalGoalsOdds: okoooTotalGoalsOdds(odds.SportteryTotalGoals || {}),
      updatedAt: capturedAt,
      sportteryKey: matchId,
      source: "okooo-jczq",
    };

    return [match];
  });
}

async function fetchOkoooJczqMatches(env) {
  const response = await fetch(env.OKOOO_JCZQ_URL || okoooJczqUrl, { headers: okoooHeaders });
  const text = decodeTextBody(await response.arrayBuffer());
  if (!response.ok) throw new Error(`OKOOO ${response.status}: ${text.slice(0, 200)}`);
  return parseOkoooJczqMatches(text);
}

function parseFiveHundredKickoffs(html = "") {
  const rows = new Map();
  const pattern = /<tr\b[^>]*class="[^"]*bet-tb-tr[^"]*"[^>]*>/gi;
  for (const tag of html.match(pattern) || []) {
    const attr = (name) => tag.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] || "";
    const orderId = attr("data-processname");
    const matchDate = attr("data-matchdate");
    const kickoffTime = attr("data-matchtime").slice(0, 5);
    const salesCloseAt = attr("data-buyendtime");
    if (!orderId || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !/^\d{2}:\d{2}$/.test(kickoffTime)) continue;
    rows.set(orderId, { matchDate, kickoffTime, salesCloseAt, fixtureId: attr("data-fixtureid") });
  }
  return rows;
}

async function fetchFiveHundredKickoffs(env) {
  const response = await fetch(env.FIVE_HUNDRED_JCZQ_URL || fiveHundredJczqUrl, {
    headers: { accept: "text/html", "user-agent": okoooHeaders["user-agent"] },
    signal: AbortSignal.timeout(12000),
  });
  const text = decodeTextBody(await response.arrayBuffer());
  if (!response.ok) throw new Error(`500.com ${response.status}: ${text.slice(0, 160)}`);
  return parseFiveHundredKickoffs(text);
}
async function syncOkoooMatchesToD1(db, env, suppliedCalculatorRaw = null) {
  const capturedAt = new Date().toISOString();
  const okoooMatches = await fetchOkoooJczqMatches(env);
  let fiveHundredByOrderId = new Map();
  try {
    fiveHundredByOrderId = await fetchFiveHundredKickoffs(env);
  } catch {
    fiveHundredByOrderId = new Map();
  }
  let calculatorRaw = suppliedCalculatorRaw;
  if (!calculatorRaw) {
    try {
      calculatorRaw = await fetchSportteryJson(env, sportteryApis.calculator);
    } catch {
      calculatorRaw = null;
    }
  }
  const officialByOrderId = new Map(
    (calculatorRaw?.value?.matchInfoList || []).flatMap((day) =>
      (day.subMatchList || []).map((match) => {
        const normalized = normalizeSportteryMatch(match, day.businessDate);
        return [normalized.orderId, normalized];
      })
    )
  );
  const matches = okoooMatches.map((match) => {
    const official = officialByOrderId.get(match.orderId);
    const fiveHundred = fiveHundredByOrderId.get(match.orderId);
    return {
      ...match,
      matchDate: official?.matchDate || fiveHundred?.matchDate || "",
      kickoffTime: official?.kickoffTime || fiveHundred?.kickoffTime || "",
      kickoffSource: official ? "sporttery-official" : fiveHundred ? "500-jczq-matchtime" : "pending-official-schedule",
      fiveHundredFixtureId: fiveHundred?.fixtureId || "",
      salesCloseAt: fiveHundred?.salesCloseAt || match.salesCloseTime || "",
      officialMatchId: official?.matchId || "",
    };
  });

  let matchCount = 0;

  for (const match of matches) {
    const matchId = sportteryDbMatchId(match);
    const existing = await db.prepare("SELECT kickoff_time, payload_json FROM matches WHERE match_id = ?").bind(matchId).first();
    const existingPayload = parseObject(existing?.payload_json);
    if (!match.kickoffTime) {
      if (existingPayload.kickoffTime) {
        match.matchDate = existingPayload.matchDate || String(existing.kickoff_time || "").slice(0, 10) || match.ticaiDate;
        match.kickoffTime = existingPayload.kickoffTime;
        match.kickoffSource = existingPayload.kickoffSource || "existing-reliable-schedule";
      }
    }
    if (!match.competitionStage && existingPayload.competitionStage) {
      match.competitionStage = existingPayload.competitionStage;
      match.competitionStageSource = existingPayload.competitionStageSource || "existing-verified-stage";
    }

    await db.prepare(`
      INSERT INTO matches (match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        match_code=excluded.match_code,
        league=excluded.league,
        home_team=excluded.home_team,
        away_team=excluded.away_team,
        kickoff_time=excluded.kickoff_time,
        status=excluded.status,
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at
    `).bind(
      matchId,
      match.issue || match.no || "",
      match.league || "竞彩",
      match.home || "",
      match.away || "",
      `${match.matchDate || match.ticaiDate || ""} ${match.kickoffTime || ""}`.trim(),
      "SCHEDULED",
      JSON.stringify({ ...match, cloudMatchId: matchId }),
      capturedAt
    ).run();

    await db.prepare(`
      INSERT INTO odds_snapshots (
        snapshot_id, match_id, source, captured_at,
        sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
        handicap, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `odds-${matchId}-${capturedAt}`,
      matchId,
      "okooo-jczq",
      capturedAt,
      n(match.normal?.win, null),
      n(match.normal?.draw, null),
      n(match.normal?.lose, null),
      n(String(match.handicap || "0").replace("+", ""), null),
      JSON.stringify(match)
    ).run();

    matchCount += 1;
  }

  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'okooo-jczq-live', 'OK', 'okooo live matches sync completed', ?, ?)
  `).bind(
    `okooo-live-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({ matchCount }),
    capturedAt
  ).run();

  return {
    ok: true,
    capturedAt,
    matchCount,
  };
}
async function syncOkoooResultsToD1(db, env) {
  const capturedAt = new Date().toISOString();
  const rows = await db.prepare(`
    SELECT * FROM matches
    ORDER BY updated_at DESC
    LIMIT 300
  `).all();
  const byOrderId = new Map();
  for (const match of (rows.results || []).map(d1RowToSportteryMatch)) {
    const orderId = String(match.orderId || "").trim();
    if (orderId && !byOrderId.has(orderId)) byOrderId.set(orderId, match);
  }

  const sourceRows = await fetchOkoooJczqResults(env);
  let resultCount = 0;
  let reviewed = 0;
  let cases = 0;
  const skipped = [];
  const written = [];
  for (const source of sourceRows) {
    if (!source.hasResult) {
      skipped.push({ orderId: source.orderId, reason: "result-null" });
      continue;
    }
    const match = byOrderId.get(source.orderId);
    if (!match) {
      skipped.push({ orderId: source.orderId, score: source.score, reason: "match-not-found" });
      continue;
    }
    const matchId = match.cloudMatchId || sportteryDbMatchId(match);
    const existing = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(matchId).first();
    const existingPayload = parseObject(existing?.payload_json);
    if (existing && String(existingPayload.resultSource || "") === "sporttery-official") {
      skipped.push({ orderId: source.orderId, matchId, score: source.score, reason: "official-existing" });
      continue;
    }
    const payload = {
      ...match,
      statusCode: "okooo-finished",
      statusName: "已完赛",
      fullScoreRaw: `${source.homeGoals}:${source.awayGoals}`,
      score: source.score,
      result: source.homeGoals > source.awayGoals ? "胜" : source.homeGoals < source.awayGoals ? "负" : "平",
      okoooOrderId: source.orderId,
      okoooResult: source.result,
      okoooBoundary: source.boundary,
      resultSource: "okooo-jczq",
      officialComparison: "pending",
    };
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      source.homeGoals,
      source.awayGoals,
      sideFromResult(source.homeGoals, source.awayGoals),
      source.homeGoals + source.awayGoals,
      capturedAt,
      JSON.stringify({ ...payload, cloudMatchId: matchId }),
      capturedAt
    ).run();
    const review = await autoReviewMatch(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    resultCount += 1;
    written.push({ orderId: source.orderId, matchId, issue: match.issue || match.no || "", home: match.home, away: match.away, score: source.score });
  }
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'okooo-jczq-results', 'OK', 'okooo jczq results sync completed', ?, ?)
  `).bind(
    `okooo-results-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({ scanned: sourceRows.length, resultCount, reviewed, cases, written, skipped: skipped.slice(0, 80) }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, scanned: sourceRows.length, results: resultCount, reviewed, cases, written, skipped };
}

async function syncSnapshotMatchesToD1(db, request) {
  const capturedAt = new Date().toISOString();
  const body = await readJson(request);
  const matches = Array.isArray(body.matches) ? body.matches.slice(0, 500) : [];
  let inserted = 0;
  let existing = 0;
  let skipped = 0;
  for (const match of matches) {
    if (!match?.home || !match?.away || !(match.matchId || match.orderId)) {
      skipped += 1;
      continue;
    }
    const matchId = sportteryDbMatchId(match);
    const result = await db.prepare(`
      INSERT INTO matches (match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO NOTHING
    `).bind(
      matchId,
      match.issue || match.no || "",
      match.league || "竞彩",
      match.home,
      match.away,
      `${match.matchDate || match.ticaiDate || ""} ${match.kickoffTime || ""}`.trim(),
      match.statusCode || "SNAPSHOT",
      JSON.stringify({ ...match, cloudMatchId: matchId, sourcePriority: match.sourcePriority || "snapshot-fallback" }),
      capturedAt
    ).run();
    if (Number(result.meta?.changes || 0) > 0) inserted += 1;
    else existing += 1;
  }
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'sporttery-snapshot-seed', 'OK', 'snapshot match seed completed', ?, ?)
  `).bind(
    `sporttery-snapshot-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({ received: matches.length, inserted, existing, skipped }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, received: matches.length, inserted, existing, skipped };
}

async function syncLiveFallbackToD1(db, env) {
  const capturedAt = new Date().toISOString();
  const matches = await d1LiveTargetMatches(db, { pastDays: 14, futureDays: 2 });
  let lockParentsInserted = 0;
  for (const match of matches.filter((item) => item.liveTargetSource === "locked_predictions")) {
    if (await insertMissingLiveTargetMatch(db, match, capturedAt)) lockParentsInserted += 1;
  }

  let liveRows = { matches: [], errors: [] };
  try {
    liveRows = await fetchLiveFallbackMatches(env, matches);
  } catch (error) {
    liveRows = { matches: [], errors: [{ date: "all", message: error.message || "live fallback failed" }] };
  }

  const sourceSummary = liveFallbackSourceSummary(matches, liveRows.matches);
  let liveFallbackCount = 0;
  let kickoffUpdated = 0;
  let reviewed = 0;
  let cases = 0;
  const liveFallbackCandidates = [];
  for (const match of matches) {
    const matchId = match.cloudMatchId || sportteryDbMatchId(match);
    const scheduleRow = liveRows.matches.find((row) =>
      row.time &&
      liveDateMatchesSporttery(match, row) &&
      liveTeamMatches(match.home, row.home) &&
      liveTeamMatches(match.away, row.away)
    );
    if (!match.kickoffTime && scheduleRow) {
      match.matchDate = scheduleRow.date || match.matchDate || match.ticaiDate;
      match.kickoffTime = String(scheduleRow.time || "").slice(0, 5);
      match.kickoffSource = `live-schedule-${String(scheduleRow.source || "external").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      await db.prepare(`
        UPDATE matches
        SET kickoff_time = ?, payload_json = ?, updated_at = ?
        WHERE match_id = ?
      `).bind(
        `${match.matchDate} ${match.kickoffTime}`,
        JSON.stringify(match),
        capturedAt,
        matchId
      ).run();
      kickoffUpdated += 1;
    }
    const live = liveResultForSportteryMatch(match, liveRows.matches);
    if (!live) {
      const nearLive = liveRows.matches.find((row) =>
        liveDateMatchesSporttery(match, row) &&
        liveTeamMatches(match.home, row.home) &&
        liveTeamMatches(match.away, row.away)
      );
      if (nearLive) {
        liveFallbackCandidates.push({
          matchId,
          issue: match.issue || match.no || "",
          home: match.home,
          away: match.away,
          skipped: "not-finished-or-not-regular",
          live: {
            source: nearLive.source,
            date: nearLive.date,
            home: nearLive.homeZh || nearLive.home,
            away: nearLive.awayZh || nearLive.away,
            score: nearLive.score,
            status: nearLive.status,
            isFinished: nearLive.isFinished,
            scoreDuration: nearLive.scoreDuration,
            scoreMode: nearLive.scoreMode,
          },
        });
      }
      continue;
    }
    const parsed = parseDashScore(live.score);
    if (!parsed) {
      liveFallbackCandidates.push({ matchId, issue: match.issue || match.no || "", home: match.home, away: match.away, skipped: "bad-score", score: live.score || "" });
      continue;
    }
    const existing = await db.prepare("SELECT payload_json FROM match_results WHERE match_id = ?").bind(matchId).first();
    const existingPayload = parseObject(existing?.payload_json);
    if (existing && !String(existingPayload.resultSource || "").startsWith("live-fallback")) {
      liveFallbackCandidates.push({
        matchId,
        issue: match.issue || match.no || "",
        home: match.home,
        away: match.away,
        skipped: "official-existing",
        existingSource: existingPayload.resultSource || "",
        score: `${parsed.home}-${parsed.away}`,
      });
      continue;
    }
    liveFallbackCandidates.push({
      matchId,
      issue: match.issue || match.no || "",
      home: match.home,
      away: match.away,
      skipped: "",
      liveSource: live.source,
      score: `${parsed.home}-${parsed.away}`,
      status: live.status || "",
    });
    const result = {
      ...match,
      statusCode: "live-finished",
      statusName: "已完赛",
      halfScore: live.halfScore || "",
      fullScoreRaw: `${parsed.home}:${parsed.away}`,
      score: parsed.text,
      result: parsed.home > parsed.away ? "胜" : parsed.home < parsed.away ? "负" : "平",
      winner: live.winnerZh || "",
      winnerSide: live.winnerSide || "",
      penaltyScore: live.penaltyScore || "",
      scoreDuration: live.scoreDuration || "",
      liveSource: live.source,
      liveExternalId: live.externalId,
      scoreMode: live.scoreMode || "",
      resultSource: `live-fallback-${String(live.source || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"}`,
      officialComparison: "pending",
    };
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).bind(
      matchId,
      parsed.home,
      parsed.away,
      sideFromResult(parsed.home, parsed.away),
      parsed.home + parsed.away,
      capturedAt,
      JSON.stringify({ ...result, cloudMatchId: matchId }),
      capturedAt
    ).run();
    const review = await autoReviewMatch(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    liveFallbackCount += 1;
  }

  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'live-fallback-api', 'OK', 'live fallback sync completed', ?, ?)
  `).bind(
    `live-sync-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({
      matchCount: matches.length,
      liveFallbackCount,
      lockParentsInserted,
      kickoffUpdated,
      reviewed,
      cases,
      liveFallbackErrors: liveRows.errors,
      liveFallbackSources: [...new Set(liveRows.matches.map((match) => match.source).filter(Boolean))],
      liveFallbackCandidates: liveFallbackCandidates.slice(0, 30),
      sourceSummary,
    }),
    capturedAt
  ).run();

  return { ok: true, capturedAt, matchCount: matches.length, liveFallbackCount, lockParentsInserted, kickoffUpdated, reviewed, cases, liveFallbackErrors: liveRows.errors, liveFallbackCandidates: liveFallbackCandidates.slice(0, 30), sourceSummary };
}

function liveFallbackSourceSummary(sportteryMatches = [], liveRows = []) {
  const matchedRows = liveRows.filter((row) =>
    liveFallbackRowIsDisplayable(row) &&
    sportteryMatches.some((match) =>
      liveDateMatchesSporttery(match, row) &&
      liveTeamMatches(match.home, row.home) &&
      liveTeamMatches(match.away, row.away)
    )
  );
  const nonRegularRows = liveRows.filter((row) => parseDashScore(row.score) && !liveFallbackRowUsesRegularTime(row));
  const bySource = {};
  for (const row of liveRows) {
    const source = row.source || "unknown";
    bySource[source] ||= { raw: 0, usableRegular: 0, matched: 0, nonRegularExcluded: 0 };
    bySource[source].raw += 1;
    if (liveFallbackRowIsDisplayable(row)) bySource[source].usableRegular += 1;
    if (matchedRows.includes(row)) bySource[source].matched += 1;
    if (nonRegularRows.includes(row)) bySource[source].nonRegularExcluded += 1;
  }
  return {
    rawCount: liveRows.length,
    usableRegularCount: liveRows.filter(liveFallbackRowIsDisplayable).length,
    matchedCount: matchedRows.length,
    dedupedMatchedCount: dedupeLiveRows(matchedRows).length,
    nonRegularExcludedCount: nonRegularRows.length,
    sources: bySource,
  };
}

async function liveScoreHealth(db, env) {
  const capturedAt = new Date().toISOString();
  const sportteryMatches = await d1LiveTargetMatches(db);
  let liveRows = { matches: [], errors: [] };
  try {
    liveRows = await fetchLiveFallbackMatches(env, sportteryMatches);
  } catch (error) {
    liveRows = { matches: [], errors: [{ source: "all", date: "all", message: error.message || "live health failed" }] };
  }
  const matchedRows = liveRows.matches.filter((row) =>
    liveFallbackRowIsDisplayable(row) &&
    sportteryMatches.some((match) =>
      liveDateMatchesSporttery(match, row) &&
      liveTeamMatches(match.home, row.home) &&
      liveTeamMatches(match.away, row.away)
    )
  );
  const resultRows = await db.prepare(`
    SELECT mr.*, m.match_code, m.league, m.home_team, m.away_team, m.kickoff_time
    FROM match_results mr
    LEFT JOIN matches m ON m.match_id = mr.match_id
    ORDER BY mr.updated_at DESC
    LIMIT 20
  `).all();
  const logs = await db.prepare(`
    SELECT source, status, message, payload_json, created_at
    FROM sync_logs
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
  return {
    ok: true,
    capturedAt,
    dbBound: true,
    configuredSources: {
      footballData: Boolean(footballDataKey(env)),
      apiFootball: Boolean(apiFootballKey(env)),
      theSportsDb: Boolean(theSportsDbKey(env)),
    },
    d1Window: {
      matchCount: sportteryMatches.length,
      matchTableCount: sportteryMatches.filter((match) => match.liveTargetSource === "matches").length,
      lockedPredictionOnlyCount: sportteryMatches.filter((match) => match.liveTargetSource === "locked_predictions").length,
      dates: sportteryMatchDates(sportteryMatches),
    },
    liveFallback: {
      ...liveFallbackSourceSummary(sportteryMatches, liveRows.matches),
      errors: liveRows.errors,
      matchedSamples: dedupeLiveRows(matchedRows).slice(0, 12).map((row) => ({
        source: row.source || "",
        date: row.date || "",
        time: row.time || "",
        league: row.league || "",
        home: row.homeZh || row.home || "",
        away: row.awayZh || row.away || "",
        score: row.score || "",
        status: row.status || "",
        scoreDuration: row.scoreDuration || "",
        scoreMode: row.scoreMode || "",
      })),
    },
    recentResults: (resultRows.results || []).map((row) => {
      const payload = parseObject(row.payload_json);
      return {
        matchId: row.match_id,
        issue: payload.issue || row.match_code || "",
        league: payload.league || row.league || "",
        home: payload.home || row.home_team || "",
        away: payload.away || row.away_team || "",
        kickoffTime: payload.matchDate && payload.kickoffTime ? `${payload.matchDate} ${payload.kickoffTime}` : row.kickoff_time || "",
        score: `${row.full_time_home_goals}-${row.full_time_away_goals}`,
        resultSource: payload.resultSource || "",
        scoreMode: payload.scoreMode || "",
        scoreDuration: payload.scoreDuration || "",
        officialComparison: payload.officialComparison || "",
        updatedAt: row.updated_at,
      };
    }),
    recentLogs: (logs.results || []).map((row) => ({
      source: row.source,
      status: row.status,
      message: row.message,
      createdAt: row.created_at,
      payload: parseObject(row.payload_json),
    })),
  };
}

async function listAutoPredictions(db, limit = 300) {
  const rows = await db.prepare(`
    SELECT * FROM locked_predictions
    WHERE payload_json LIKE '%"autoGenerated":true%'
    ORDER BY locked_at DESC
    LIMIT ?
  `).bind(limit).all();
  return (rows.results || []).map((row) => {
    const payload = parseObject(row.payload_json);
    const prediction = payload.sportteryPrediction || {};
    return {
      ...prediction,
      lockId: row.lock_id,
      lockType: row.lock_type,
      lockedAt: row.locked_at,
      resultStatus: row.result_status,
      autoStatus: prediction.autoStatus || payload.autoStatus || row.lock_type,
    };
  });
}

async function d1OddsScript(db) {
  const rows = await db.prepare("SELECT * FROM matches ORDER BY kickoff_time ASC LIMIT 300").all();
  const updatedTimes = (rows.results || [])
    .map((row) => row.updated_at)
    .filter(Boolean)
    .sort();
  const latestUpdatedAt = updatedTimes.at(-1) || new Date().toISOString();
  const matches = (rows.results || [])
    .map((row) => {
      const payload = parseObject(row.payload_json, null);
      if (payload?.home && payload?.away) return payload;
      const kickoff = String(row.kickoff_time || "");
      return {
        orderId: row.match_id || "",
        issue: row.match_code || "",
        no: compactSportteryNo(row.match_code, row.match_id),
        ticaiDate: kickoff.slice(0, 10),
        matchDate: kickoff.slice(0, 10),
        kickoffTime: kickoff.slice(11, 16),
        league: row.league || "竞彩",
        matchId: String(row.match_id || "").replace(/^sporttery-/, ""),
        home: row.home_team || "",
        away: row.away_team || "",
        score: "",
      };
    })
    .filter((item) => item.home && item.away);
  const data = {
    source: "Cloudflare D1 + 中国体育彩票官方接口",
    apiEndpoint: "/api/live-sporttery-data.js",
    importedAt: latestUpdatedAt,
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: matches.length,
    lastUpdateTime: latestUpdatedAt,
    matchDates: [...new Set(matches.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    matches,
  };
  return javascript(`window.LIVE_SPORTTERY_ODDS=${JSON.stringify(data)};\n`);
}

async function d1ResultsScript(db) {
  const [resultRows, matchRows] = await Promise.all([
    db.prepare("SELECT * FROM match_results ORDER BY reviewed_at DESC LIMIT 300").all(),
    db.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT 300").all(),
  ]);
  const matchPayloadById = new Map((matchRows.results || []).map((row) => [row.match_id, parseObject(row.payload_json)]));
  const results = (resultRows.results || [])
    .map((row) => {
      const payload = parseObject(row.payload_json);
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
        result: score.includes("-") ? (Number(score.split("-")[0]) > Number(score.split("-")[1]) ? "胜" : Number(score.split("-")[0]) < Number(score.split("-")[1]) ? "负" : "平") : "",
      };
    })
    .filter((item) => item.home && item.away && item.score);
  const data = {
    source: "Cloudflare D1 + 中国体育彩票官方赛果接口",
    apiEndpoint: "/api/live-sporttery-results.js",
    importedAt: resultRows.results?.[0]?.reviewed_at || new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: results.length,
    matchDates: [...new Set(results.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    results,
  };
  return javascript(`window.LIVE_SPORTTERY_RESULTS=${JSON.stringify(data)};\n`);
}

async function d1LiveFootballScoresScript(db, env) {
  const sportteryMatches = await d1LiveTargetMatches(db);
  let liveRows = { matches: [], errors: [] };
  try {
    liveRows = await fetchLiveFallbackMatches(env, sportteryMatches);
  } catch (error) {
    liveRows = { matches: [], errors: [{ date: "all", message: error.message || "live score fetch failed" }] };
  }
  const matchedRows = liveRows.matches.filter((row) =>
    liveFallbackRowIsDisplayable(row) &&
    sportteryMatches.some((match) => liveDateMatchesSporttery(match, row) &&
      liveTeamMatches(match.home, row.home) &&
      liveTeamMatches(match.away, row.away))
  );
  const dedupedRows = dedupeLiveRows(matchedRows);
  const data = {
    source: "Cloudflare Pages live football fallback",
    apiEndpoint: "/api/live-football-scores.js",
    importedAt: new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    scope: "current_window_live_and_finished_regular_time",
    totalCount: dedupedRows.length,
    errors: liveRows.errors,
    matches: dedupedRows,
  };
  return javascript(`window.LIVE_FOOTBALL_SCORES=${JSON.stringify(data)};\n`);
}

function latestSportteryHistoryStamp(list = []) {
  return list
    .map((item) => `${item.updateDate || ""} ${item.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function normalizeSportterySpHistory(match, history = {}) {
  const oddsHistory = history.oddsHistory || {};
  return {
    orderId: match.orderId || "",
    issue: match.issue || match.no || "",
    no: match.no || compactSportteryNo(match.issue, match.matchId),
    ticaiDate: match.ticaiDate || match.matchDate || "",
    matchDate: match.matchDate || match.ticaiDate || "",
    kickoffTime: match.kickoffTime || "",
    league: match.league || "竞彩",
    matchId: String(match.matchId || "").replace(/^sporttery-/, ""),
    home: match.home || "",
    away: match.away || "",
    handicap: String(oddsHistory.hhadList?.at(-1)?.goalLine || match.handicap || "0"),
    updatedAt: latestSportteryHistoryStamp([
      ...(oddsHistory.hadList || []),
      ...(oddsHistory.hhadList || []),
      ...(oddsHistory.ttgList || []),
      ...(oddsHistory.crsList || []),
    ]),
    history: {
      had: oddsHistory.hadList || [],
      hhad: oddsHistory.hhadList || [],
      ttg: oddsHistory.ttgList || [],
      crs: oddsHistory.crsList || [],
      hafu: oddsHistory.hafuList || [],
    },
  };
}

function sportterySnapshotStamp(value = "") {
  const parsed = Date.parse(value);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const text = date.toISOString().replace("T", " ").slice(0, 19);
  return {
    text,
    date: text.slice(0, 10),
    time: text.slice(11, 19),
  };
}

async function d1SportterySpHistoryScript(db, env, raw = false) {
  const rows = await db.prepare(`
    SELECT
      s.match_id, s.captured_at, s.payload_json AS snapshot_payload,
      m.match_code, m.league, m.home_team, m.away_team, m.kickoff_time, m.payload_json AS match_payload
    FROM odds_snapshots s
    LEFT JOIN matches m ON m.match_id = s.match_id
    ORDER BY s.captured_at DESC
    LIMIT 1200
  `).all();
  const snapshotRows = [...(rows.results || [])].sort((a, b) =>
    String(a.captured_at || "").localeCompare(String(b.captured_at || ""))
  );
  const byMatch = new Map();
  for (const row of snapshotRows) {
    const payload = parseObject(row.snapshot_payload, {});
    const matchPayload = parseObject(row.match_payload, {});
    const canonicalHome = matchPayload.home || row.home_team || "";
    const canonicalAway = matchPayload.away || row.away_team || "";
    if (
      payload.home && payload.away && canonicalHome && canonicalAway
      && (!sameTeam(payload.home, canonicalHome) || !sameTeam(payload.away, canonicalAway))
    ) continue;
    const base = payload.home && payload.away ? payload : matchPayload;
    const matchId = String(base.matchId || row.match_id || "").replace(/^sporttery-/, "");
    if (!matchId) continue;
    if (!byMatch.has(row.match_id)) {
      byMatch.set(row.match_id, {
        orderId: base.orderId || row.match_id || "",
        issue: base.issue || row.match_code || "",
        no: base.no || compactSportteryNo(row.match_code, row.match_id),
        ticaiDate: base.ticaiDate || base.matchDate || String(row.kickoff_time || "").slice(0, 10),
        matchDate: base.matchDate || base.ticaiDate || String(row.kickoff_time || "").slice(0, 10),
        kickoffTime: base.kickoffTime || String(row.kickoff_time || "").slice(11, 16),
        league: base.league || row.league || "竞彩",
        matchId,
        home: base.home || row.home_team || "",
        away: base.away || row.away_team || "",
        handicap: String(matchPayload.handicap || base.handicap || "0"),
        updatedAt: "",
        history: { had: [], hhad: [], ttg: [], crs: [], hafu: [] },
      });
    }
    const item = byMatch.get(row.match_id);
    if (matchPayload.handicap !== undefined && matchPayload.handicap !== null && matchPayload.handicap !== "") {
      item.handicap = String(matchPayload.handicap);
    }
    const stamp = sportterySnapshotStamp(row.captured_at);
    item.updatedAt = stamp.text || item.updatedAt;
    const normal = payload.normal || {};
    if (normal.win || normal.draw || normal.lose) {
      item.history.had.push({ updateDate: stamp.date, updateTime: stamp.time, h: normal.win, d: normal.draw, a: normal.lose });
    }
    const handicapOdds = payload.handicapOdds || {};
    if (handicapOdds.win || handicapOdds.draw || handicapOdds.lose) {
      item.history.hhad.push({
        updateDate: stamp.date,
        updateTime: stamp.time,
        goalLine: String(payload.handicap || matchPayload.handicap || item.handicap || "0"),
        h: handicapOdds.win,
        d: handicapOdds.draw,
        a: handicapOdds.lose,
      });
    }
    const totalGoals = Array.isArray(payload.totalGoalsOdds) ? payload.totalGoalsOdds : [];
    if (totalGoals.length) {
      const row = { updateDate: stamp.date, updateTime: stamp.time };
      totalGoals.forEach((odd) => {
        const key = String(odd.goals || "").replace("+", "");
        if (/^[0-7]$/.test(key)) row[`s${key}`] = odd.odds;
      });
      item.history.ttg.push(row);
    }
  }
  const histories = [...byMatch.values()].filter((item) =>
    item.home && item.away && (item.history.had.length || item.history.hhad.length || item.history.ttg.length)
  );
  const data = {
    source: "Cloudflare D1 odds_snapshots",
    apiEndpoint: "/api/live-sporttery-sp-history.js",
    importedAt: new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: histories.length,
    errors: [],
    matches: histories,
  };
  if (raw) return data;
  return javascript(`window.LIVE_SPORTTERY_SP_HISTORY = ${JSON.stringify(data, null, 2)};
`);
}

async function d1FootballDataContextScript(db, env) {
  const rows = await db.prepare(`
    SELECT * FROM matches
    WHERE league LIKE '%世界杯%' OR league LIKE '%竞彩%'
    ORDER BY kickoff_time DESC
    LIMIT 300
  `).all();
  const sportteryMatches = (rows.results || []).map(d1RowToSportteryMatch);
  const context = await fetchFootballDataContext(env, sportteryMatches);
  const matchContexts = sportteryMatches.map((match) => ({
    sportteryKey: sportteryKey(match),
    matchId: match.matchId || "",
    issue: match.issue || match.no || "",
    ticaiDate: match.ticaiDate || "",
    matchDate: match.matchDate || "",
    kickoffTime: match.kickoffTime || "",
    league: match.league || "",
    home: match.home || "",
    away: match.away || "",
    context: footballDataContextForMatch(match, context),
  }));
  const data = {
    source: "football-data.org",
    importedAt: context.importedAt,
    competitionCode: context.competitionCode,
    season: context.season,
    totalMatches: context.matches.length,
    totalStandings: context.standings.length,
    errors: context.errors,
    standings: context.standings,
    matches: matchContexts,
  };
  return javascript(`window.FOOTBALL_DATA_CONTEXT=${JSON.stringify(data)};\n`);
}

function enrichPredictionFromUnifiedRun(prediction = {}, runOutput = {}) {
  const featureSet = parseObject(runOutput.featureSet);
  const research = parseObject(featureSet.research);
  const items = Array.isArray(research.items) ? research.items : [];
  const researchText = (key) => String(items.find((item) => item.key === key)?.summary || "").trim();
  const decision = parseObject(runOutput.finalDecision);
  const modelLessons = parseObject(runOutput.modelLessons);
  const existingUnifiedEvidence = parseObject(prediction.unifiedRunEvidence);
  const scenarios = Array.isArray(runOutput.scenarioSet) ? runOutput.scenarioSet : [];
  const riskScenario = parseObject(runOutput.riskScenario);
  const movement = parseObject(featureSet.oddsMovement);
  const handicapEvidence = parseObject(featureSet.handicap);
  const probabilities = parseObject(featureSet.probabilities);
  const scoreA = decision.scores?.[0] || scenarios[0]?.score || prediction.mainScore || "-";
  const scoreB = decision.scores?.[1] || scenarios[1]?.score || prediction.counterScore || "-";
  const riskScore = riskScenario.score || decision.riskScenario || "-";
  const odds = Array.isArray(featureSet.market?.odds) ? featureSet.market.odds : [];
  const movementText = movement.complete
    ? `SP历史共${movement.snapshots || 0}个快照；开盘 ${movement.first?.h || "-"} / ${movement.first?.d || "-"} / ${movement.first?.a || "-"}，最新 ${movement.latest?.h || "-"} / ${movement.latest?.d || "-"} / ${movement.latest?.a || "-"}，变化幅度 ${movement.movementMagnitude ?? "-"}。${researchText("marketNews")}`
    : researchText("marketNews");
  const teamText = [researchText("teamState"), researchText("injuries"), researchText("expectedLineups")].filter(Boolean).join(" ");
  const styleText = researchText("styleMatchup");
  const motivationText = researchText("motivation");
  const weatherText = researchText("weatherVenue");
  const marketText = odds.length === 3
    ? `当前胜平负SP ${odds.join(" / ")}；去水模型概率主胜 ${((Number(probabilities.HOME) || 0) * 100).toFixed(1)}%、平 ${((Number(probabilities.DRAW) || 0) * 100).toFixed(1)}%、客胜 ${((Number(probabilities.AWAY) || 0) * 100).toFixed(1)}%。`
    : "当前胜平负SP已由统一模型复核。";
  const scenarioText = `正式比分按校准后联合概率覆盖选择 ${scoreA} / ${scoreB}；独立风险剧本为 ${riskScore}。结合球队状态、风格对位、盘口低位和赛事动机，第一球与半场前后的节奏决定比赛是否打开。`;
  const handicapProbabilities = parseObject(handicapEvidence.probabilities);
  const jointDecision = parseObject(featureSet.jointDecision);
  const independentHandicapRisk = parseObject(jointDecision.independentHandicapRisk);
  const handicapText = `让球独立概率：让胜 ${((Number(handicapProbabilities["让胜"]) || 0) * 100).toFixed(1)}%、让平 ${((Number(handicapProbabilities["让平"]) || 0) * 100).toFixed(1)}%、让负 ${((Number(handicapProbabilities["让负"]) || 0) * 100).toFixed(1)}%；独立边际第一项 ${independentHandicapRisk.pick || "-"} 作风险审计。正式让球 ${decision.handicapPick || prediction.handicapPick || "-"} 必须与胜平负 ${decision.winDrawLose || prediction.pick || "-"} 及至少一个正式比分 ${scoreA} / ${scoreB} 同时成立。`;
  const finalText = `胜平负 ${decision.winDrawLose || prediction.pick || "-"}；让球 ${decision.handicapPick || prediction.handicapPick || "-"}；总进球 ${decision.totalGoalsPick || prediction.totalGoalsPick || "-"}；比分 ${scoreA} / ${scoreB}；类型 ${decision.matchType || prediction.matchType || "-"}；建议 ${decision.confidence ?? prediction.confidenceScore ?? "-"}% / ${decision.advice || prediction.advice || "-"}。`;
  return {
    ...prediction,
    modelRevision: firstText(prediction.modelRevision, modelLessons.version, runOutput.modelVersion),
    decisionProcess: "统一赛前机制：SP复核、赛事规则与动机、球队状态、风格对位、体彩开盘偏差、赔率动态、比赛发展、半场/60分钟触发、冲突闸门、比分总进球、让球闸门、失败方式、价值过滤、最终锁版。",
    competitionRules: prediction.competitionRules || motivationText,
    teamState: prediction.teamState || teamText,
    recentAnalysis: prediction.recentAnalysis || teamText,
    styleMatchup: prediction.styleMatchup || styleText,
    institutionLine: prediction.institutionLine || marketText,
    marketGap: prediction.marketGap || marketText,
    lineMovement: prediction.lineMovement || movementText,
    oddsMovement: prediction.oddsMovement || movementText,
    script: prediction.script || scenarioText,
    halftimeDecision: prediction.halftimeDecision || `半场或60分钟仍未出现预期第一球时，重新检查独立风险剧本${riskScore}；正式比分${scoreA} / ${scoreB}不承担固定主反方向。`,
    stateTransfer: prediction.stateTransfer || scenarioText,
    decisionConflict: prediction.decisionConflict || `正式组合已执行逻辑兼容门禁：主方向${decision.winDrawLose || prediction.pick || "-"}，让球${decision.handicapPick || prediction.handicapPick || "-"}；独立边际第一项${independentHandicapRisk.pick || "-"}只作冲突审计。`,
    crossMarketConsistency: prediction.crossMarketConsistency || handicapText,
    scoreElimination: prediction.scoreElimination || `保留联合概率最高的 ${scoreA} / ${scoreB} 两个正式比分，允许同方向；独立风险剧本 ${riskScore} 不占正式名额；总进球校验 ${decision.totalGoalsPick || prediction.totalGoalsPick || "-"}。`,
    totalGoalsValidation: prediction.totalGoalsValidation || `比分分支与总进球 ${decision.totalGoalsPick || prediction.totalGoalsPick || "-"}交叉校验。`,
    handicapGate: prediction.handicapGate || handicapText,
    keyFailureRisk: prediction.keyFailureRisk || `最大失败方式是比赛偏离正式高概率覆盖 ${scoreA} / ${scoreB}，转入独立风险剧本 ${riskScore} 或分布尾部。`,
    eventRisk: prediction.eventRisk || weatherText || "早球、定位球、红牌或临场阵容变化可能改变比赛节奏。",
    valueFilter: prediction.valueFilter || `置信 ${decision.confidence ?? prediction.confidenceScore ?? "-"}%：${decision.advice || prediction.advice || "谨慎"}；不因单一低赔自动放大结论。`,
    noiseFilter: prediction.noiseFilter || "排除名气、单一低赔和单一比分噪声，只保留通过十步证据链的方向。",
    finalDecisionAction: prediction.finalDecisionAction || finalText,
    scriptSet: prediction.scriptSet || [
      ...scenarios.map((item, index) => ({ label: index ? "正式比分二" : "正式比分一", probability: item.probability, score: item.score, text: "联合概率覆盖路径" })),
      ...(riskScenario.score ? [{ label: "独立风险", probability: riskScenario.probability, score: riskScenario.score, text: "不占正式比分名额" }] : []),
    ],
    dataQuality: prediction.dataQuality || `HIGH：十步平均分 ${runOutput.tenStepResult?.averageScore ?? 100}，全部硬门槛通过。`,
    unifiedRunEvidence: {
      ...existingUnifiedEvidence,
      contractVersion: runOutput.contractVersion,
      modelRevision: firstText(prediction.modelRevision, modelLessons.version, runOutput.modelVersion),
      modelLessons: Object.keys(modelLessons).length ? modelLessons : null,
      tenStepResult: runOutput.tenStepResult,
      gateResult: runOutput.gateResult,
      researchItems: items,
      seasonLearning: featureSet.seasonLearning || null,
      scoreSelection: featureSet.score || null,
      crossLeagueNormalization: featureSet.crossLeagueNormalization || null,
      evidenceDirectionConflict: featureSet.evidenceDirectionConflict || null,
      evidenceDrivenRiskChallenger: featureSet.evidenceDrivenRiskChallenger || null,
      conditionalHandicapChallenger: featureSet.conditionalHandicapChallenger || null,
      jointDecision: featureSet.jointDecision || null,
      backtestContract: runOutput.backtestContract || null,
      competitionStage: featureSet.competitionStage || null,
      twoLegLeadControl: featureSet.tieContext?.leadControl || null,
      riskScenario: riskScenario.score ? riskScenario : null,
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");

  if (request.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });
  if (path === "health") return json({ ok: true, dbBound: Boolean(env.DB), version: "V4" });

  let db;
  try {
    db = requireDb(env);
  } catch (error) {
    return json({ ok: false, error: error.message }, 503);
  }

  try {
    if (path === "sitemap.xml" && request.method === "GET") {
      return edgeCached(request, { ttl: 300 }, () => sportterySitemap(db));
    }

    if (path === "live-sporttery-data.js" && request.method === "GET") {
      return edgeCached(request, { ttl: 20 }, () => d1OddsScript(db));
    }

    if (path === "live-sporttery-results.js" && request.method === "GET") {
      return edgeCached(request, { ttl: 20 }, () => d1ResultsScript(db));
    }

    if (path === "live-football-scores.js" && request.method === "GET") {
      return edgeCached(request, { ttl: 8 }, () => d1LiveFootballScoresScript(db, env));
    }

    if (path === "live-score-health" && request.method === "GET") {
      return json(await liveScoreHealth(db, env));
    }

    if (path === "live-sporttery-sp-history.js" && request.method === "GET") {
      return d1SportterySpHistoryScript(db, env);
    }

    if (path === "football-data-context.js" && request.method === "GET") {
      return d1FootballDataContextScript(db, env);
    }

    if (path === "analytics/track" && request.method === "POST") {
      return json(await trackAnalyticsEvent(db, request));
    }

    if (path === "analytics/summary" && request.method === "GET") {
      const summary = await analyticsSummary(db, request, env);
      return json(summary, summary.status || 200);
    }

    if (path === "sync/sporttery-proxy-diagnostics" && request.method === "GET") {
      const requestProxy = request.headers.get("x-sporttery-upstream-proxy") || "";
      const diagnosticEnv = {
        ...env,
        REQUEST_UPSTREAM_PROXY: requestProxy,
      };
      async function probe(targetUrl) {
        const url = sportteryProxyUrl(diagnosticEnv, targetUrl);
        const response = await fetch(url, { headers: sportteryHeaders });
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type") || "",
          bodyPrefix: text.slice(0, 160),
        };
      }
      return json({
        ok: true,
        calculator: sportteryProxyDiagnostics(diagnosticEnv, sportteryApis.calculator),
        results: sportteryProxyDiagnostics(diagnosticEnv, sportteryApis.resultPage(1)),
        calculatorProbe: await probe(sportteryApis.calculator),
        resultsProbe: await probe(sportteryApis.resultPage(1)),
      });
    }

    if (path === "sync/sporttery" && request.method === "POST") {
      const requestProxy = request.headers.get("x-sporttery-upstream-proxy") || "";
      const requestApiFootballKey = request.headers.get("x-apifootball-api-key") || "";
      const requestFootballDataKey = request.headers.get("x-football-data-api-key") || "";
      const requestTheSportsDbKey = request.headers.get("x-thesportsdb-api-key") || "";
      return json(await syncSportteryToD1(db, {
        ...env,
        REQUEST_UPSTREAM_PROXY: requestProxy,
        REQUEST_APIFOOTBALL_API_KEY: requestApiFootballKey,
        REQUEST_FOOTBALL_DATA_API_KEY: requestFootballDataKey,
        REQUEST_THESPORTSDB_API_KEY: requestTheSportsDbKey,
      }));
    }

    if (path === "sync/sporttery-cache" && request.method === "POST") {
      const requestApiFootballKey = request.headers.get("x-apifootball-api-key") || "";
      const requestFootballDataKey = request.headers.get("x-football-data-api-key") || "";
      const requestTheSportsDbKey = request.headers.get("x-thesportsdb-api-key") || "";
      const body = await request.json();
      return json(await syncSportteryToD1(db, {
        ...env,
        REQUEST_APIFOOTBALL_API_KEY: requestApiFootballKey,
        REQUEST_FOOTBALL_DATA_API_KEY: requestFootballDataKey,
        REQUEST_THESPORTSDB_API_KEY: requestTheSportsDbKey,
      }, {
        calculatorRaw: body.calculatorRaw || body.calculator,
        resultPages: body.resultPages || [],
      }));
    }

    if (path === "sync/sporttery-results" && request.method === "POST") {
      const maxPages = Math.min(Math.max(Number(url.searchParams.get("pages") || 5), 1), 10);
      return json(await syncOfficialSportteryResultsToD1(db, env, { maxPages }));
    }
    if (path === "sync/sporttery-snapshot" && request.method === "POST") {
      return json(await syncSnapshotMatchesToD1(db, request));
    }
    if (path === "debug/okooo-jczq" && request.method === "GET") {
  return json(await debugOkoooJczq(env));
}
if (path === "sync/okooo-live" && request.method === "POST") {
  const body = await readJson(request);
  return json(await syncOkoooMatchesToD1(db, env, body.calculatorRaw || body.calculator || null));
}
    if (path === "sync/okooo-results" && request.method === "POST") {
      return json(await syncOkoooResultsToD1(db, env));
    }
    if (path === "sync/reconcile-completed-samples" && request.method === "POST") {
      return json(await reconcileCompletedSamples(db, url.searchParams.get("limit")));
    }

    if (path === "sync/live-results" && request.method === "POST") {
      const requestApiFootballKey = request.headers.get("x-apifootball-api-key") || "";
      const requestFootballDataKey = request.headers.get("x-football-data-api-key") || "";
      const requestTheSportsDbKey = request.headers.get("x-thesportsdb-api-key") || "";
      return json(await syncLiveFallbackToD1(db, {
        ...env,
        REQUEST_APIFOOTBALL_API_KEY: requestApiFootballKey,
        REQUEST_FOOTBALL_DATA_API_KEY: requestFootballDataKey,
        REQUEST_THESPORTSDB_API_KEY: requestTheSportsDbKey,
      }));
    }

    if (path === "auto-predictions" && request.method === "GET") {
      return json({ ok: true, disabled: true, predictions: [] });
    }

    if (path === "bootstrap" && request.method === "GET") {
      return edgeCached(request, { ttl: 20, keepSearchParams: ["includeCases", "scope"] }, async () => {
      const includeCases = url.searchParams.get("includeCases") === "1";
      const initialScope = url.searchParams.get("scope") !== "full";
      const matchLimit = initialScope ? 30 : 200;
      const lockLimit = initialScope ? 20 : 200;
      const resultLimit = initialScope ? 30 : 200;
      const [matches, locks, recentResults, cases, spHistoryData] = await Promise.all([
        db.prepare(`SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT ${matchLimit}`).all(),
        db.prepare(`
          SELECT * FROM locked_predictions
          WHERE lock_id IN (
            SELECT lock_id FROM (
              SELECT
                lock_id,
                ROW_NUMBER() OVER (
                  PARTITION BY match_id
                  ORDER BY ${PREFERRED_LOCK_ORDER_SQL}
                ) AS row_no
              FROM locked_predictions
            )
            WHERE row_no = 1
          )
          ORDER BY locked_at DESC
          LIMIT ${lockLimit}
        `).all(),
        db.prepare(`SELECT * FROM match_results ORDER BY reviewed_at DESC LIMIT ${resultLimit}`).all(),
        includeCases ? listCases(db) : Promise.resolve([]),
        d1SportterySpHistoryScript(db, env, true),
      ]);
      const resultsById = new Map((recentResults.results || []).map((row) => [row.match_id, row]));
      const matchIds = [
        ...(matches.results || []).map((row) => row.match_id),
        ...(locks.results || []).map((row) => row.match_id),
      ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      if (matchIds.length) {
        for (let offset = 0; offset < matchIds.length; offset += 80) {
          const chunk = matchIds.slice(offset, offset + 80);
          const placeholders = chunk.map(() => "?").join(",");
          const linkedResults = await db.prepare(`SELECT * FROM match_results WHERE match_id IN (${placeholders})`).bind(...chunk).all();
          (linkedResults.results || []).forEach((row) => resultsById.set(row.match_id, row));
        }
      }
      const results = [...resultsById.values()].sort((a, b) => String(b.reviewed_at || "").localeCompare(String(a.reviewed_at || "")));
      
      return json({ ok: true, matches: matches.results, locks: (locks.results || []).map(enrichLockRow), results, cases, autoPredictions: [], spHistory: spHistoryData });
      });
    }

    if (path === "matches" && request.method === "GET") {
      const { results } = await db.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT 300").all();
      return json({ ok: true, matches: results });
    }

    if (path === "matches" && request.method === "POST") {
      const body = await readJson(request);
      const matchId = String(body.cloudMatchId || body.match_id || body.matchId || id("match"));
      await db.prepare(`
        INSERT INTO matches (match_id, match_code, league, home_team, away_team, kickoff_time, status, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(match_id) DO UPDATE SET
          match_code=excluded.match_code, league=excluded.league, home_team=excluded.home_team, away_team=excluded.away_team,
          kickoff_time=excluded.kickoff_time, status=excluded.status, payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP
      `).bind(matchId, body.matchCode || body.match_code || "", body.league || "世界杯", body.homeTeam || body.home_team || "", body.awayTeam || body.away_team || "", body.kickoffTime || body.kickoff_time || "", body.status || "SCHEDULED", JSON.stringify(body)).run();
      return json({ ok: true, matchId });
    }

    if (path === "locks" && request.method === "GET") {
      const matchId = url.searchParams.get("matchId");
      const stmt = matchId
        ? db.prepare("SELECT * FROM locked_predictions WHERE match_id = ? ORDER BY locked_at DESC").bind(matchId)
        : db.prepare("SELECT * FROM locked_predictions ORDER BY locked_at DESC LIMIT 300");
      const { results } = await stmt.all();
      return json({ ok: true, locks: (results || []).map(enrichLockRow) });
    }

    if (path === "locks/preferred" && request.method === "GET") {
      const matchId = url.searchParams.get("matchId");
      if (!matchId) return json({ ok: false, error: "matchId required" }, 400);
      const lock = await db.prepare(`
        SELECT * FROM locked_predictions
        WHERE match_id = ?
        ORDER BY ${PREFERRED_LOCK_ORDER_SQL}
        LIMIT 1
      `).bind(matchId).first();
      return json({ ok: true, lock: lock ? enrichLockRow(lock) : null });
    }

    if (path === "model-runs" && request.method === "GET") {
      const matchId = url.searchParams.get("matchId");
      const stmt = matchId
        ? db.prepare("SELECT * FROM model_runs WHERE match_id = ? ORDER BY created_at DESC LIMIT 100").bind(matchId)
        : db.prepare("SELECT * FROM model_runs ORDER BY created_at DESC LIMIT 100");
      const { results } = await stmt.all();
      return json({ ok: true, runs: results || [] });
    }

    if (path === "model-runs" && request.method === "POST") {
      const body = await readJson(request);
      const matchId = String(body.matchId || body.match_id || "");
      if (!matchId) return json({ ok: false, error: "matchId required" }, 400);
      const runType = String(body.runType || body.run_type || "PRE_LOCK").toUpperCase();
      const output = body.output || body.output_json || {};
      if (runType === "FINAL_LOCK" && (
        output.contractVersion !== "UNIFIED_PREDICTION_V4" ||
        output.lockType !== "FINAL_LOCK" ||
        output.gateResult?.passed !== true ||
        output.tenStepResult?.passed !== true ||
        !Array.isArray(output.tenStepResult?.steps) ||
        output.tenStepResult.steps.length !== 10
      )) {
        return json({ ok: false, error: "FINAL_LOCK model run must pass the complete UNIFIED_PREDICTION_V4 ten-step contract" }, 400);
      }
      const runId = body.runId || body.run_id || `model-run-${crypto.randomUUID()}`;
      await db.prepare(`
        INSERT INTO model_runs (run_id, match_id, model_version, run_type, input_json, output_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        runId,
        matchId,
        body.modelVersion || body.model_version || "V4-UNIFIED",
        runType,
        JSON.stringify(body.input || body.input_json || {}),
        JSON.stringify(output),
        body.createdAt || body.created_at || new Date().toISOString(),
      ).run();
      return json({ ok: true, runId });
    }

    if (path === "locks" && request.method === "POST") {
      const body = await readJson(request);
      const submittedMatchId = String(body.matchId || body.match_id || "").trim();
      if (!submittedMatchId) return json({ ok: false, error: "matchId required" }, 400);
      const lockId = body.lockId || body.lock_id || `${submittedMatchId}-${body.lockType || "FINAL_LOCK"}-${Date.now()}`;
      const lockType = body.lockType || body.lock_type || "FINAL_LOCK";
      const league = body.league || "世界杯";
      if (lockType === "FINAL_LOCK") {
        const prediction = body.sportteryPrediction || body.prediction || body.payload?.sportteryPrediction || {};
        const modelRunId = String(body.modelRunId || body.model_run_id || prediction.modelRunId || "");
        if (!modelRunId) return json({ ok: false, error: "FINAL_LOCK requires modelRunId" }, 400);
        const modelRun = await db.prepare("SELECT * FROM model_runs WHERE run_id = ?").bind(modelRunId).first();
        if (!modelRun) return json({ ok: false, error: "linked model run not found" }, 400);
        const runOutput = parseObject(modelRun.output_json);
        const compactId = (value) => String(value || "").replace(/^sporttery-/, "");
        if (compactId(modelRun.match_id) !== compactId(body.matchId || body.match_id)) {
          return json({ ok: false, error: "model run match does not match lock match" }, 400);
        }
        if (modelRun.run_type !== "FINAL_LOCK" || runOutput.contractVersion !== "UNIFIED_PREDICTION_V4" || runOutput.gateResult?.passed !== true || runOutput.tenStepResult?.passed !== true) {
          return json({ ok: false, error: "linked model run did not pass the complete ten-step FINAL_LOCK contract" }, 400);
        }
        body.sportteryPrediction = enrichPredictionFromUnifiedRun(prediction, runOutput);
        const handicapPick = handicapPickFromPayload(prediction);
        const handicapEvidence = parseObject(runOutput.featureSet?.handicap);
        const scoreEvidence = parseObject(runOutput.featureSet?.score);
        const totalsEvidence = parseObject(runOutput.featureSet?.totals);
        const jointEvidence = parseObject(runOutput.featureSet?.jointDecision);
        const dataQualityEvidence = parseObject(runOutput.featureSet?.dataQuality);
        const handicapDecisionAudit = parseObject(jointEvidence.handicapDecisionAudit);
        const handicapProbabilities = parseObject(handicapEvidence.probabilities);
        const rankedHandicap = ["让胜", "让平", "让负"].map((label) => [label, Number(handicapProbabilities[label])]).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1]);
        if (!handicapPick || rankedHandicap.length !== 3 || !Array.isArray(handicapEvidence.components) || handicapEvidence.components.length < 2) {
          return json({ ok: false, error: "FINAL_LOCK requires independent handicap probabilities from score grid and handicap market" }, 400);
        }
        const compatibleFormalResolution = jointEvidence.role === "FORMAL_DIRECTION_SCORE_COMPATIBLE_PAIR"
          && jointEvidence.formalPairOfficialScoreSupported === true
          && handicapDecisionAudit.resolved === true
          && Number(handicapDecisionAudit.probabilityGap || 0) <= 0.1;
        if (rankedHandicap[0][0] !== handicapPick && !compatibleFormalResolution) {
          return json({ ok: false, error: `handicapPick ${handicapPick} conflicts with independent handicap probability leader ${rankedHandicap[0][0]} without a score-supported compatible formal resolution` }, 400);
        }
        if (!Array.isArray(scoreEvidence.components) || scoreEvidence.components.length < 2 || scoreEvidence.marketComplete !== true) {
          return json({ ok: false, error: "FINAL_LOCK requires independent score probabilities from score model and score market" }, 400);
        }
        if (!Array.isArray(totalsEvidence.components) || totalsEvidence.components.length < 2 || totalsEvidence.marketComplete !== true) {
          return json({ ok: false, error: "FINAL_LOCK requires independent total-goals probabilities from score distribution and total-goals market" }, 400);
        }
        if (!jointEvidence.selected || jointEvidence.selected.direction !== runOutput.finalDecision?.recommendationSide || jointEvidence.selected.handicapPick !== handicapPick || !(Number(jointEvidence.selected.scoreProbability) > 0) || jointEvidence.formalPairOfficialScoreSupported !== true) {
          return json({ ok: false, error: "FINAL_LOCK requires a jointly compatible direction and handicap pair supported by at least one official score branch" }, 400);
        }
        if (runOutput.gateResult?.gates?.fundamentalData !== true || dataQualityEvidence.minimumRecentMatchesPerTeam !== 5 || dataQualityEvidence.temporalIntegrity !== true) {
          return json({ ok: false, error: "FINAL_LOCK requires complete non-market fundamentals, five recent matches per team, and pre-lock temporal integrity" }, 400);
        }
        if (runOutput.gateResult?.gates?.oppositeWinPathChecked !== true || runOutput.gateResult?.gates?.secondScenarioInProbability !== true) {
          return json({ ok: false, error: "FINAL_LOCK requires a true opposite-result path and the second scenario inside final direction probabilities" }, 400);
        }
        if (runOutput.gateResult?.gates?.twoLegContextComplete !== true) {
          return json({ ok: false, error: "FINAL_LOCK for a two-leg tie requires structured 90-minute, goal-difference, and aggregate-advancement context" }, 400);
        }
      }
      const payloadShape = lockPayloadShape(body);
      const payloadSummary = lockSummaryFromShape(payloadShape);
      if (lockType === "FINAL_LOCK" && !isWorldCupLeague(league) && !hasFinalApproval(body)) {
        return json({
          ok: false,
          error: "league model must be completed as PRE_LOCK before FINAL_LOCK",
          hint: "For non-World-Cup leagues, write PRE_LOCK first. Add finalApproval=true only after external lineup/injury verification or explicit final review.",
        }, 400);
      }
      const exists = await db.prepare("SELECT lock_id FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
      if (exists) return json({ ok: false, error: "lockId already exists; locked records cannot be overwritten" }, 409);
      await insertMissingLiveTargetMatch(db, lockRowToSportteryMatch({
        match_id: submittedMatchId,
        match_code: body.matchCode || body.match_code || "",
        home_team: body.homeTeam || body.home_team || "",
        away_team: body.awayTeam || body.away_team || "",
        league,
        kickoff_time: body.kickoffTime || body.kickoff_time || "",
        payload_json: JSON.stringify(body),
      }), body.lockedAt || body.locked_at || new Date().toISOString());
      await db.prepare(`
        INSERT INTO locked_predictions (
          lock_id, match_id, match_code, home_team, away_team, league, kickoff_time, locked_at, lock_type, model_version,
          model_home_prob, model_draw_prob, model_away_prob, recommendation, recommendation_side, final_grade, final_action,
          confidence_score, risk_score, consistency_score, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
          sporttery_home_prob, sporttery_draw_prob, sporttery_away_prob, value_home_gap, value_draw_gap, value_away_gap,
          asian_handicap, asian_home_water, asian_away_water, euro_home_odds, euro_draw_odds, euro_away_odds,
          euro_home_prob, euro_draw_prob, euro_away_prob, data_quality, reasoning_summary, downgrade_reasons_json, result_status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `).bind(
        lockId, body.matchId || body.match_id, body.matchCode || body.match_code || "", body.homeTeam || body.home_team || "", body.awayTeam || body.away_team || "",
        league, body.kickoffTime || body.kickoff_time || "", body.lockedAt || body.locked_at || new Date().toISOString(), lockType, body.modelVersion || body.model_version || "V1",
        n(body.modelHomeProb ?? body.model_home_prob ?? payloadSummary.modelHomeProb, 0), n(body.modelDrawProb ?? body.model_draw_prob ?? payloadSummary.modelDrawProb, 0), n(body.modelAwayProb ?? body.model_away_prob ?? payloadSummary.modelAwayProb, 0),
        body.recommendation || payloadSummary.recommendation || "", body.recommendationSide || body.recommendation_side || payloadSummary.recommendationSide || "SKIP", body.finalGrade || body.final_grade || payloadSummary.finalGrade || "D", body.finalAction || body.final_action || payloadSummary.finalAction || "谨慎",
        n(body.confidenceScore ?? body.confidence_score ?? payloadSummary.confidenceScore, 0), n(body.riskScore ?? body.risk_score ?? payloadSummary.riskScore, 0), n(body.consistencyScore ?? body.consistency_score ?? payloadSummary.consistencyScore, null),
        n(body.sportteryHomeSp ?? body.sporttery_home_sp, null), n(body.sportteryDrawSp ?? body.sporttery_draw_sp, null), n(body.sportteryAwaySp ?? body.sporttery_away_sp, null),
        n(body.sportteryHomeProb ?? body.sporttery_home_prob, null), n(body.sportteryDrawProb ?? body.sporttery_draw_prob, null), n(body.sportteryAwayProb ?? body.sporttery_away_prob, null),
        n(body.valueHomeGap ?? body.value_home_gap, null), n(body.valueDrawGap ?? body.value_draw_gap, null), n(body.valueAwayGap ?? body.value_away_gap, null),
        n(body.asianHandicap ?? body.asian_handicap, null), n(body.asianHomeWater ?? body.asian_home_water, null), n(body.asianAwayWater ?? body.asian_away_water, null),
        n(body.euroHomeOdds ?? body.euro_home_odds, null), n(body.euroDrawOdds ?? body.euro_draw_odds, null), n(body.euroAwayOdds ?? body.euro_away_odds, null),
        n(body.euroHomeProb ?? body.euro_home_prob, null), n(body.euroDrawProb ?? body.euro_draw_prob, null), n(body.euroAwayProb ?? body.euro_away_prob, null),
        body.dataQuality || body.data_quality || payloadSummary.dataQuality || "MEDIUM", body.reasoningSummary || body.reasoning_summary || payloadSummary.reasoningSummary || "", JSON.stringify(body.downgradeReasons || body.downgrade_reasons || []), JSON.stringify(body)
      ).run();
      return json({ ok: true, lockId });
    }

    if (path === "results" && request.method === "POST") {
      const body = await readJson(request);
      const matchId = String(body.matchId || body.match_id || "");
      const home = Number(body.fullTimeHomeGoals ?? body.full_time_home_goals);
      const away = Number(body.fullTimeAwayGoals ?? body.full_time_away_goals);
      if (!matchId || !Number.isFinite(home) || !Number.isFinite(away)) return json({ ok: false, error: "matchId and full-time goals required" }, 400);
      const total = home + away;
      const result1x2 = body.result1x2 || body.result_1x2 || sideFromResult(home, away);
      await db.prepare(`
        INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(match_id) DO UPDATE SET
          full_time_home_goals=excluded.full_time_home_goals, full_time_away_goals=excluded.full_time_away_goals,
          result_1x2=excluded.result_1x2, total_goals=excluded.total_goals, reviewed_at=excluded.reviewed_at,
          payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP
      `).bind(matchId, home, away, result1x2, total, body.reviewedAt || body.reviewed_at || new Date().toISOString(), JSON.stringify(body)).run();
      const autoReview = await autoReviewMatch(db, matchId);
      return json({ ok: true, matchId, result1x2, totalGoals: total, autoReview });
    }

    if (path === "cases" && request.method === "GET") {
      return json({ ok: true, cases: await listCases(db) });
    }

    if (path === "shadow-audits" && request.method === "GET") {
      await ensureShadowAuditSchema(db);
      const matchId = url.searchParams.get("matchId") || "";
      const stmt = matchId
        ? db.prepare("SELECT * FROM shadow_model_audits WHERE match_id = ? ORDER BY updated_at DESC LIMIT 100").bind(matchId)
        : db.prepare("SELECT * FROM shadow_model_audits ORDER BY updated_at DESC LIMIT 300");
      const { results } = await stmt.all();
      return json({ ok: true, audits: (results || []).map(rowToShadowAudit) });
    }

    if (path === "shadow-audits/generate" && request.method === "POST") {
      const body = await readJson(request);
      const lockId = body.lockId || body.lock_id;
      if (!lockId) return json({ ok: false, error: "lockId required" }, 400);
      const created = await createShadowAuditForLock(db, lockId);
      return json(created, created.status || (created.ok ? 200 : 400));
    }

    if (path === "cases/generate" && request.method === "POST") {
      const body = await readJson(request);
      const lockId = body.lockId || body.lock_id;
      if (!lockId) return json({ ok: false, error: "lockId required" }, 400);
      const created = await createCaseForLock(db, lockId);
      return json(created, created.status || (created.ok ? 200 : 400));
    }

    if (path === "review/run" && request.method === "POST") {
      const body = await readJson(request);
      const lockId = body.lockId || body.lock_id;
      const lock = await db.prepare("SELECT * FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
      if (!lock) return json({ ok: false, error: "lock not found" }, 404);
      const result = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(lock.match_id).first();
      if (!result) return json({ ok: false, error: "result not found" }, 400);
      const review = evaluateLock(lock, result);
      await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(review.hitStatus, lockId).run();
      return json({ ok: true, review });
    }

    if (path === "model-upgrade-notes" && request.method === "GET") {
      return json({ ok: true, notes: await listModelUpgradeNotes(db, url.searchParams) });
    }

    if (path === "model-upgrade-notes" && request.method === "POST") {
      await ensureModelUpgradeSchema(db);
      const body = await readJson(request);
      const noteId = body.noteId || body.note_id || `upgrade-note-${crypto.randomUUID()}`;
      const sourceCaseId = body.sourceCaseId || body.source_case_id || "";
      const sourceLockId = body.sourceLockId || body.source_lock_id || "";
      const matchId = body.matchId || body.match_id || "";
      if (!sourceCaseId || !sourceLockId || !matchId) {
        return json({ ok: false, error: "sourceCaseId, sourceLockId and matchId required" }, 400);
      }
      await db.prepare(`
        INSERT INTO model_upgrade_notes (
          note_id, source_case_id, source_lock_id, match_id, model_version, league, trigger_type,
          severity, status, title, diagnosis_json, recommendation_json, created_at, adopted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_case_id) DO UPDATE SET
          trigger_type=excluded.trigger_type, severity=excluded.severity, status=excluded.status,
          title=excluded.title, diagnosis_json=excluded.diagnosis_json, recommendation_json=excluded.recommendation_json,
          adopted_at=excluded.adopted_at
      `).bind(
        noteId,
        sourceCaseId,
        sourceLockId,
        matchId,
        body.modelVersion || body.model_version || "V4",
        body.league || "",
        body.triggerType || body.trigger_type || "MANUAL_REVIEW",
        body.severity || "MEDIUM",
        body.status || "OPEN",
        body.title || "人工复盘升级建议",
        JSON.stringify(body.diagnosis || {}),
        JSON.stringify(body.recommendation || {}),
        body.createdAt || body.created_at || new Date().toISOString(),
        body.adoptedAt || body.adopted_at || null
      ).run();
      return json({ ok: true, noteId });
    }

    if (path === "similar-cases" && request.method === "POST") {
      const current = await readJson(request);
      const cases = await listCases(db, { league: normalizeCompetition(current.league), limit: 500 });
      const pool = cases
        .filter((item) => String(item.matchId) !== String(current.matchId))
        .filter((item) => normalizeCompetition(item.league) === normalizeCompetition(current.league))
        .filter((item) => ["A", "B", "HIGH", "MEDIUM"].includes(String(item.dataQuality || "MEDIUM").toUpperCase()))
        .map((item) => ({ ...item, similarityScore: similarity(current, item) }))
        .filter((item) => item.similarityScore >= (current.threshold ?? 65))
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, current.sampleLimit || 50);
      const topCases = pool.slice(0, current.topLimit || 5);
      const s = stats(pool, current);
      const adjustment = confidenceAdjustment(s);
      const warningFlags = warnings(s, topCases);
      const advice = downgradeAdvice(s, warningFlags);
      return json({
        ok: true,
        sampleCount: pool.length,
        topCases,
        stats: s,
        confidenceAdjustment: adjustment,
        warningFlags,
        downgradeAdvice: advice,
        summaryText: pool.length < 10
          ? `当前仅在【${s.competition}】匹配到 ${pool.length} 场相似案例，样本量不足，只展示，不参与置信度修正。`
          : pool.length < 30
            ? `【${s.competition}】同赛事匹配到 ${pool.length} 场，当前推荐历史命中率为 ${(s.sameRecommendationHitRate * 100).toFixed(1)}%，同模型版本 ${(s.sameModelVersionHitRate * 100).toFixed(1)}%，样本只做风险提示。`
            : `【${s.competition}】同赛事匹配到 ${pool.length} 场，当前推荐历史命中率为 ${(s.sameRecommendationHitRate * 100).toFixed(1)}%，同联赛同盘口 ${(s.sameLeagueHandicapHitRate * 100).toFixed(1)}%。`,
      });
    }

    if (path === "historical-samples/similar" && request.method === "POST") {
      const current = await readJson(request);
      if (!current.league) return json({ ok: false, error: "league required" }, 400);
      return json(await historicalSimilarSamples(db, current));
    }
    if (path === "historical-samples/rolling" && request.method === "GET") {
      return json({ ok: true, samples: await listRollingCompletedSamples(db, url.searchParams.get("limit")) });
    }

    return json({ ok: false, error: "not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
