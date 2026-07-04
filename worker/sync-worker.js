const CALCULATOR_API = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c";
const RESULTS_API =
  "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1";
const DEFAULT_PAGES_API_BASE = "https://worldcup-dashboard-4hr.pages.dev";

const SPORTTERY_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function proxyUrl(env, targetUrl) {
  const proxy = (env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY || "").trim();
  if (!proxy) return targetUrl;
  if (proxy.includes("{url}")) return proxy.replace("{url}", encodeURIComponent(targetUrl));
  return `${proxy}${targetUrl}`;
}

async function fetchSportteryJson(env, targetUrl) {
  const response = await fetch(proxyUrl(env, targetUrl), { headers: SPORTTERY_HEADERS });
  if (!response.ok) throw new Error(`Sporttery API ${response.status}`);
  const raw = await response.json();
  if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API returned an error");
  return raw;
}

function toOdd(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function compactNo(matchNumStr = "", matchNum = "") {
  const text = String(matchNumStr || matchNum || "");
  const found = text.match(/(\d{3})$/);
  return found ? found[1] : text.slice(-3).padStart(3, "0");
}

function normalizeHandicap(goalLine = "") {
  const raw = String(goalLine || "0").trim();
  if (!raw) return "0";
  const numeric = Number(raw.replace("+", ""));
  if (Number.isNaN(numeric)) return raw;
  if (numeric > 0) return `+${numeric}`;
  return String(numeric);
}

function marketOdds(market) {
  if (!market || !market.h) return null;
  return {
    win: toOdd(market.h),
    draw: toOdd(market.d),
    lose: toOdd(market.a),
  };
}

function scoreBucket(home, away) {
  if (home > away) return "胜";
  if (home < away) return "负";
  return "平";
}

function scoreOdds(crs = {}) {
  return Object.entries(crs)
    .flatMap(([key, value]) => {
      if (!value || key.endsWith("f")) return [];
      if (key === "s-1sh" || key === "s1sh") return [{ score: "胜其它", odds: toOdd(value), bucket: "胜" }];
      if (key === "s-1sd" || key === "s1sd") return [{ score: "平其它", odds: toOdd(value), bucket: "平" }];
      if (key === "s-1sa" || key === "s1sa") return [{ score: "负其它", odds: toOdd(value), bucket: "负" }];
      const found = key.match(/^s(\d{2})s(\d{2})$/);
      if (!found) return [];
      const home = Number(found[1]);
      const away = Number(found[2]);
      return [{ score: `${home}:${away}`, odds: toOdd(value), bucket: scoreBucket(home, away) }];
    })
    .sort((a, b) => Number(a.odds) - Number(b.odds))
    .slice(0, 12);
}

function totalGoalsOdds(ttg = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = ttg[`s${index}`];
    if (!value) return null;
    return { goals: index === 7 ? "7+" : String(index), odds: toOdd(value) };
  }).filter(Boolean);
}

function latestMarketUpdate(match) {
  return [match.had, match.hhad, match.crs, match.ttg, match.hafu]
    .map((market) => `${market?.updateDate || ""} ${market?.updateTime || ""}`.trim())
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function normalizeMatch(match, businessDate) {
  const item = {
    orderId: String(match.matchNum || ""),
    issue: match.matchNumStr || "",
    no: compactNo(match.matchNumStr, match.matchNum),
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
    handicap: normalizeHandicap(match.hhad?.goalLine),
    normal: marketOdds(match.had),
    handicapOdds: marketOdds(match.hhad),
    scoreOdds: scoreOdds(match.crs || {}),
    totalGoalsOdds: totalGoalsOdds(match.ttg || {}),
    updatedAt: latestMarketUpdate(match),
  };
  item.sportteryKey = sportteryKey(item);
  return item;
}

function normalizeCalculatorPayload(raw, capturedAt) {
  const days = raw?.value?.matchInfoList || [];
  const matches = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeMatch(match, day.businessDate))
  );
  return {
    source: "中国体育彩票官方接口",
    apiEndpoint: CALCULATOR_API,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    lotterNo: days[0]?.businessDate || "",
    totalCount: raw?.value?.totalCount || matches.length,
    lastUpdateTime: raw?.value?.lastUpdateTime || "",
    matchDates: days.map((day) => day.businessDate).filter(Boolean),
    matches,
  };
}

function parseScore(score = "") {
  if (!score.includes(":")) return null;
  const [home, away] = score.split(":").map(Number);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function directionFromGoals(home, away) {
  if (home > away) return "胜";
  if (home < away) return "负";
  return "平";
}

function result1x2(home, away) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function normalizeResult(match, businessDate) {
  const parsed = parseScore(match.sectionsNo999 || "");
  const item = {
    orderId: String(match.matchNum || ""),
    issue: match.matchNumStr || "",
    no: compactNo(match.matchNumStr, match.matchNum),
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
    result: parsed ? directionFromGoals(parsed.home, parsed.away) : "",
  };
  item.sportteryKey = sportteryKey(item);
  return item;
}

function normalizeResultsPayload(raw, capturedAt) {
  const days = raw?.value?.matchInfoList || [];
  const results = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeResult(match, day.matchDate || day.businessDate))
  );
  return {
    source: "中国体育彩票官方赛果接口",
    apiEndpoint: RESULTS_API,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: results.length,
    matchDates: days.map((day) => day.matchDate || day.businessDate).filter(Boolean),
    results,
  };
}

function sportteryKey(item) {
  return String(item.matchId || item.orderId || `${item.ticaiDate || item.matchDate}-${item.issue || item.no}-${item.home}-${item.away}`);
}

function dbMatchId(item) {
  return `sporttery-${sportteryKey(item)}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function handicapNumber(value) {
  return numberOrNull(String(value || "0").replace("+", ""));
}

async function insertLog(db, source, status, message, payload = {}) {
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(`sync-${Date.now()}-${crypto.randomUUID()}`, source, status, message, JSON.stringify(payload), new Date().toISOString()).run();
}

async function upsertMatches(db, payload, capturedAt) {
  let count = 0;
  for (const match of payload.matches) {
    const matchId = dbMatchId(match);
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

    if (match.normal || match.handicapOdds || match.scoreOdds?.length || match.totalGoalsOdds?.length) {
      await db.prepare(`
        INSERT INTO odds_snapshots (
          snapshot_id, match_id, source, captured_at, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
          handicap, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `odds-${matchId}-${capturedAt}`,
        matchId,
        "sporttery",
        capturedAt,
        numberOrNull(match.normal?.win),
        numberOrNull(match.normal?.draw),
        numberOrNull(match.normal?.lose),
        handicapNumber(match.handicap),
        JSON.stringify(match)
      ).run();
    }
    count += 1;
  }
  return count;
}

async function evaluateAndCreateCases(db, matchId) {
  const result = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(matchId).first();
  if (!result) return { reviewed: 0, cases: 0 };
  const locks = await db.prepare("SELECT * FROM locked_predictions WHERE match_id = ?").bind(matchId).all();
  let reviewed = 0;
  let cases = 0;
  for (const lock of locks.results || []) {
    if (lock.final_action === "跳过") {
      await db.prepare("UPDATE locked_predictions SET result_status = 'VOID' WHERE lock_id = ?").bind(lock.lock_id).run();
      reviewed += 1;
      continue;
    }
    const hitStatus = lock.recommendation_side === result.result_1x2 ? "WIN" : "LOSE";
    await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(hitStatus, lock.lock_id).run();
    reviewed += 1;
    if (lock.lock_type !== "FINAL_LOCK") continue;
    const existing = await db.prepare("SELECT case_id FROM case_base WHERE source_lock_id = ?").bind(lock.lock_id).first();
    if (existing) continue;
    const failureTags = hitStatus === "LOSE" ? ["赛前推荐未命中"] : [];
    const successTags = hitStatus === "WIN" ? ["赛前推荐命中"] : [];
    await db.prepare(`
      INSERT INTO case_base (
        case_id, source_lock_id, match_id, league, home_team, away_team, kickoff_time, model_version,
        model_home_prob, model_draw_prob, model_away_prob, recommendation, recommendation_side,
        final_grade, final_action, confidence_score, risk_score, consistency_score,
        sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp, sporttery_home_prob, sporttery_draw_prob, sporttery_away_prob,
        value_home_gap, value_draw_gap, value_away_gap, asian_handicap, asian_home_water, asian_away_water,
        euro_home_odds, euro_draw_odds, euro_away_odds, euro_home_prob, euro_draw_prob, euro_away_prob,
        data_quality, actual_result, actual_goals, hit_status, failure_tags_json, success_tags_json, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'V4', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `case-${lock.lock_id}`,
      lock.lock_id,
      lock.match_id,
      lock.league,
      lock.home_team,
      lock.away_team,
      lock.kickoff_time,
      lock.model_home_prob,
      lock.model_draw_prob,
      lock.model_away_prob,
      lock.recommendation,
      lock.recommendation_side,
      lock.final_grade,
      lock.final_action,
      lock.confidence_score,
      lock.risk_score,
      lock.consistency_score,
      lock.sporttery_home_sp,
      lock.sporttery_draw_sp,
      lock.sporttery_away_sp,
      lock.sporttery_home_prob,
      lock.sporttery_draw_prob,
      lock.sporttery_away_prob,
      lock.value_home_gap,
      lock.value_draw_gap,
      lock.value_away_gap,
      lock.asian_handicap,
      lock.asian_home_water,
      lock.asian_away_water,
      lock.euro_home_odds,
      lock.euro_draw_odds,
      lock.euro_away_odds,
      lock.euro_home_prob,
      lock.euro_draw_prob,
      lock.euro_away_prob,
      lock.data_quality,
      result.result_1x2,
      result.total_goals,
      hitStatus,
      JSON.stringify(failureTags),
      JSON.stringify(successTags),
      JSON.stringify({
        generatedBy: "worldcup-sync-worker",
        actualHomeGoals: result.full_time_home_goals,
        actualAwayGoals: result.full_time_away_goals,
      }),
      new Date().toISOString()
    ).run();
    cases += 1;
  }
  return { reviewed, cases };
}

async function upsertResults(db, payload, capturedAt) {
  let count = 0;
  let reviewed = 0;
  let cases = 0;
  for (const result of payload.results) {
    const parsed = parseScore(result.fullScoreRaw || result.score?.replace("-", ":") || "");
    if (!parsed) continue;
    const matchId = dbMatchId(result);
    await db.prepare(`
      INSERT INTO match_results (match_id, full_time_home_goals, full_time_away_goals, result_1x2, total_goals, reviewed_at, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        full_time_home_goals=excluded.full_time_home_goals,
        full_time_away_goals=excluded.full_time_away_goals,
        result_1x2=excluded.result_1x2,
        total_goals=excluded.total_goals,
        reviewed_at=excluded.reviewed_at,
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at
    `).bind(
      matchId,
      parsed.home,
      parsed.away,
      result1x2(parsed.home, parsed.away),
      parsed.home + parsed.away,
      capturedAt,
      JSON.stringify({ ...result, cloudMatchId: matchId }),
      capturedAt
    ).run();
    const review = await evaluateAndCreateCases(db, matchId);
    reviewed += review.reviewed;
    cases += review.cases;
    count += 1;
  }
  return { count, reviewed, cases };
}

async function syncAll(env) {
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  const capturedAt = new Date().toISOString();
  const [calculatorRaw, resultsRaw] = await Promise.all([
    fetchSportteryJson(env, CALCULATOR_API),
    fetchSportteryJson(env, RESULTS_API),
  ]);
  const calculator = normalizeCalculatorPayload(calculatorRaw, capturedAt);
  const results = normalizeResultsPayload(resultsRaw, capturedAt);
  const matchCount = await upsertMatches(env.DB, calculator, capturedAt);
  const resultStats = await upsertResults(env.DB, results, capturedAt);
  await insertLog(env.DB, "sporttery", "OK", "sync completed", {
    capturedAt,
    matchCount,
    resultCount: resultStats.count,
    reviewed: resultStats.reviewed,
    cases: resultStats.cases,
  });
  return { ok: true, capturedAt, matchCount, resultCount: resultStats.count, reviewed: resultStats.reviewed, cases: resultStats.cases };
}

function pagesApiBase(env) {
  return String(env.PAGES_API_BASE || DEFAULT_PAGES_API_BASE).replace(/\/+$/, "");
}

async function postPagesApi(env, path) {
  const url = `${pagesApiBase(env)}${path}`;
  const headers = {};
  if (env.APIFOOTBALL_API_KEY) headers["x-apifootball-api-key"] = env.APIFOOTBALL_API_KEY;
  if (env.FOOTBALL_DATA_API_KEY) headers["x-football-data-api-key"] = env.FOOTBALL_DATA_API_KEY;
  if (env.THESPORTSDB_API_KEY) headers["x-thesportsdb-api-key"] = env.THESPORTSDB_API_KEY;
  if (env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY) headers["x-sporttery-upstream-proxy"] = env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY;
  const response = await fetch(url, { method: "POST", headers });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(`${path} ${response.status}: ${payload.error || payload.message || text.slice(0, 160)}`);
  }
  return payload;
}

async function syncViaPagesApi(env) {
  const capturedAt = new Date().toISOString();
  const steps = [];
  let sportteryPayload = null;
  try {
    sportteryPayload = await postPagesApi(env, "/api/sync/sporttery");
    steps.push({ step: "sporttery", ok: true, payload: sportteryPayload });
  } catch (error) {
    steps.push({ step: "sporttery", ok: false, error: error.message });
  }

  let fallbackPayload = null;
  try {
    fallbackPayload = await postPagesApi(env, "/api/sync/live-results");
    steps.push({ step: "live-results", ok: true, payload: fallbackPayload });
  } catch (error) {
    steps.push({ step: "live-results", ok: false, error: error.message });
  }

  const ok = steps.some((step) => step.ok);
  const payload = {
    ok,
    capturedAt,
    pagesApiBase: pagesApiBase(env),
    steps,
    sporttery: sportteryPayload,
    liveFallback: fallbackPayload,
  };
  if (env.DB) {
    await insertLog(env.DB, "pages-api-cron", ok ? "OK" : "ERROR", ok ? "pages sync completed" : "pages sync failed", payload);
  }
  if (!ok) throw new Error(steps.map((step) => `${step.step}: ${step.error}`).join("; "));
  return payload;
}

async function runAutomatedSync(env) {
  if (env.PREFER_LOCAL_SYNC === "1") return syncAll(env);
  try {
    return await syncViaPagesApi(env);
  } catch (error) {
    if (env.DB) await insertLog(env.DB, "pages-api-cron", "WARN", "falling back to local sporttery sync", { error: error.message });
    return syncAll(env);
  }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runAutomatedSync(env).catch((error) =>
        env.DB
          ? insertLog(env.DB, "sporttery", "ERROR", error.message, { stack: error.stack })
          : Promise.resolve()
      )
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, dbBound: Boolean(env.DB), worker: "worldcup-sync-worker" });
    if (url.pathname === "/sync" && request.method === "POST") {
      try {
        return json(await runAutomatedSync(env));
      } catch (error) {
        if (env.DB) await insertLog(env.DB, "sporttery", "ERROR", error.message, { stack: error.stack });
        return json({ ok: false, error: error.message }, 500);
      }
    }
    return json({ ok: false, error: "not found" }, 404);
  },
};
