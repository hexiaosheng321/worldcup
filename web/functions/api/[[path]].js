const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: jsonHeaders,
  });
}

async function readJson(request) {
  if (request.method === "GET") return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }
  return env.DB;
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function n(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sideFromResult(home, away) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function evaluateLock(lock, result) {
  if (!lock || !result) return { hitStatus: "VOID", reviewText: "缺少锁版或赛果。" };
  if (lock.final_action === "跳过") return { hitStatus: "VOID", reviewText: "跳过场次，不计胜负。" };
  let hitStatus = "LOSE";
  if (lock.recommendation_side === result.result_1x2) hitStatus = "WIN";
  if (lock.recommendation_side === "DOUBLE") {
    const text = String(lock.recommendation || "");
    const coversHome = /主|胜|HOME/.test(text);
    const coversDraw = /平|DRAW/.test(text);
    const coversAway = /客|负|AWAY/.test(text);
    if (
      (result.result_1x2 === "HOME" && coversHome) ||
      (result.result_1x2 === "DRAW" && coversDraw) ||
      (result.result_1x2 === "AWAY" && coversAway)
    ) {
      hitStatus = "WIN";
    }
  }
  if (lock.recommendation_side === "OVER" || lock.recommendation_side === "UNDER") hitStatus = "VOID";
  return {
    hitStatus,
    reviewText: hitStatus === "WIN" ? "赛前推荐命中。" : hitStatus === "LOSE" ? "赛前推荐未命中。" : "该推荐不计胜负。",
  };
}

function caseTags(lock, result, review) {
  const failureTags = [];
  const successTags = [];
  if (review.hitStatus === "LOSE" && lock.final_grade === "A") failureTags.push("A级推荐失败");
  if (review.hitStatus === "LOSE" && Number(lock.risk_score) >= 65) failureTags.push("高风险推荐失败");
  if (review.hitStatus === "LOSE" && result.result_1x2 === "DRAW" && lock.recommendation_side !== "DRAW") failureTags.push("平局漏防");
  if (review.hitStatus === "LOSE" && lock.data_quality === "LOW") failureTags.push("数据质量低导致失败");
  if (review.hitStatus === "WIN" && Number(lock.consistency_score) >= 4) successTags.push("欧亚一致命中");
  if (review.hitStatus === "WIN" && Number(lock.risk_score) <= 30) successTags.push("低风险命中");
  if (review.hitStatus === "WIN" && lock.final_grade === "A") successTags.push("A级推荐命中");
  return { failureTags, successTags };
}

function rowToCase(row) {
  return {
    caseId: row.case_id,
    sourceLockId: row.source_lock_id,
    matchId: row.match_id,
    league: row.league,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffTime: row.kickoff_time,
    modelVersion: row.model_version,
    modelHomeProb: row.model_home_prob,
    modelDrawProb: row.model_draw_prob,
    modelAwayProb: row.model_away_prob,
    recommendation: row.recommendation,
    recommendationSide: row.recommendation_side,
    finalGrade: row.final_grade,
    finalAction: row.final_action,
    confidenceScore: row.confidence_score,
    riskScore: row.risk_score,
    consistencyScore: row.consistency_score,
    sportteryHomeSp: row.sporttery_home_sp,
    sportteryDrawSp: row.sporttery_draw_sp,
    sportteryAwaySp: row.sporttery_away_sp,
    sportteryHomeProb: row.sporttery_home_prob,
    sportteryDrawProb: row.sporttery_draw_prob,
    sportteryAwayProb: row.sporttery_away_prob,
    valueHomeGap: row.value_home_gap,
    valueDrawGap: row.value_draw_gap,
    valueAwayGap: row.value_away_gap,
    asianHandicap: row.asian_handicap,
    asianHomeWater: row.asian_home_water,
    asianAwayWater: row.asian_away_water,
    euroHomeOdds: row.euro_home_odds,
    euroDrawOdds: row.euro_draw_odds,
    euroAwayOdds: row.euro_away_odds,
    euroHomeProb: row.euro_home_prob,
    euroDrawProb: row.euro_draw_prob,
    euroAwayProb: row.euro_away_prob,
    dataQuality: row.data_quality,
    actualResult: row.actual_result,
    actualGoals: row.actual_goals,
    hitStatus: row.hit_status,
    failureTags: parseArray(row.failure_tags_json),
    successTags: parseArray(row.success_tags_json),
    createdAt: row.created_at,
  };
}

function parseArray(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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

function has(...values) {
  return values.every((value) => Number.isFinite(Number(value)));
}

function addPart(parts, key, score) {
  if (!Number.isFinite(score)) return;
  parts.push({ score: Math.max(0, Math.min(100, score)), weight: weights[key] || 0 });
}

function similarity(current, sample) {
  const parts = [];
  addPart(parts, "league", current.league === sample.league ? 100 : 40);
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

function stats(rows, current) {
  const sameRecommendation = rows.filter((item) => item.recommendationSide === current.recommendationSide);
  const sameGrade = rows.filter((item) => item.finalGrade === current.finalGrade);
  return {
    sampleCount: rows.length,
    homeWinRate: rate(rows, (item) => item.actualResult === "HOME"),
    drawRate: rate(rows, (item) => item.actualResult === "DRAW"),
    awayWinRate: rate(rows, (item) => item.actualResult === "AWAY"),
    avgGoals: avg(rows, (item) => Number(item.actualGoals)),
    over25Rate: rate(rows, (item) => Number(item.actualGoals) > 2.5),
    under25Rate: rate(rows, (item) => Number(item.actualGoals) <= 2.5),
    sameRecommendationCount: sameRecommendation.length,
    sameRecommendationHitRate: rate(sameRecommendation, (item) => item.hitStatus === "WIN"),
    sameGradeCount: sameGrade.length,
    sameGradeHitRate: rate(sameGrade, (item) => item.hitStatus === "WIN"),
    avgRiskScore: avg(rows, (item) => Number(item.riskScore)),
    avgConsistencyScore: avg(rows, (item) => Number(item.consistencyScore)),
    upsetRate: rate(rows, (item) => ["C", "D"].includes(item.finalGrade) && item.hitStatus === "WIN"),
  };
}

function confidenceAdjustment(s) {
  if (!s || s.sampleCount < 10) return 0;
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
  if (!s || s.sampleCount < 5) flags.push("相似样本不足");
  if (s?.sampleCount >= 10 && s.sameRecommendationHitRate < 0.45) flags.push("当前推荐历史命中率偏低");
  if (s?.drawRate >= 0.34) flags.push("历史平局率偏高，建议防平");
  if (s?.upsetRate >= 0.3) flags.push("历史冷门率偏高");
  if (topCases.filter((item) => item.hitStatus === "LOSE").length > topCases.filter((item) => item.hitStatus === "WIN").length) flags.push("高相似案例失败较多");
  return flags;
}

async function listCases(db) {
  const { results } = await db.prepare("SELECT * FROM case_base ORDER BY created_at DESC LIMIT 500").all();
  return results.map(rowToCase);
}

async function createCaseForLock(db, lockId) {
  const lock = await db.prepare("SELECT * FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
  if (!lock) return { ok: false, status: 404, error: "lock not found" };
  if (lock.lock_type !== "FINAL_LOCK") return { ok: false, status: 400, error: "only FINAL_LOCK can enter Case Base" };
  const result = await db.prepare("SELECT * FROM match_results WHERE match_id = ?").bind(lock.match_id).first();
  if (!result) return { ok: false, status: 400, error: "result not found" };
  const existing = await db.prepare("SELECT case_id FROM case_base WHERE source_lock_id = ?").bind(lock.lock_id).first();
  if (existing) return { ok: true, caseId: existing.case_id, duplicated: true };
  const review = evaluateLock(lock, result);
  const tags = caseTags(lock, result, review);
  const caseId = `case-${lock.lock_id}`;
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
    caseId, lock.lock_id, lock.match_id, lock.league, lock.home_team, lock.away_team, lock.kickoff_time,
    lock.model_home_prob, lock.model_draw_prob, lock.model_away_prob, lock.recommendation, lock.recommendation_side,
    lock.final_grade, lock.final_action, lock.confidence_score, lock.risk_score, lock.consistency_score,
    lock.sporttery_home_sp, lock.sporttery_draw_sp, lock.sporttery_away_sp, lock.sporttery_home_prob, lock.sporttery_draw_prob, lock.sporttery_away_prob,
    lock.value_home_gap, lock.value_draw_gap, lock.value_away_gap, lock.asian_handicap, lock.asian_home_water, lock.asian_away_water,
    lock.euro_home_odds, lock.euro_draw_odds, lock.euro_away_odds, lock.euro_home_prob, lock.euro_draw_prob, lock.euro_away_prob,
    lock.data_quality, result.result_1x2, result.total_goals, review.hitStatus,
    JSON.stringify(tags.failureTags), JSON.stringify(tags.successTags), JSON.stringify({ reviewText: review.reviewText }), new Date().toISOString()
  ).run();
  await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(review.hitStatus, lock.lock_id).run();
  return { ok: true, caseId, review };
}

const sportteryApis = {
  calculator: "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c",
  results: "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1",
};

const sportteryHeaders = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

function sportteryProxyUrl(env, targetUrl) {
  const proxy = (env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY || "").trim();
  if (!proxy) return targetUrl;
  if (proxy.includes("{url}")) return proxy.replace("{url}", encodeURIComponent(targetUrl));
  return `${proxy}${targetUrl}`;
}

async function fetchSportteryJson(env, targetUrl) {
  const response = await fetch(sportteryProxyUrl(env, targetUrl), { headers: sportteryHeaders });
  if (!response.ok) throw new Error(`Sporttery API ${response.status}`);
  const raw = await response.json();
  if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API returned an error");
  return raw;
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

async function autoReviewMatch(db, matchId) {
  const locks = await db.prepare("SELECT lock_id, lock_type FROM locked_predictions WHERE match_id = ?").bind(matchId).all();
  let reviewed = 0;
  let cases = 0;
  for (const lock of locks.results || []) {
    const created = await createCaseForLock(db, lock.lock_id);
    if (created.ok || created.error === "only FINAL_LOCK can enter Case Base") reviewed += 1;
    if (created.caseId && !created.duplicated) cases += 1;
  }
  return { reviewed, cases };
}

async function syncSportteryToD1(db, env) {
  const capturedAt = new Date().toISOString();
  const [calculatorRaw, resultsRaw] = await Promise.all([
    fetchSportteryJson(env, sportteryApis.calculator),
    fetchSportteryJson(env, sportteryApis.results),
  ]);
  const days = calculatorRaw?.value?.matchInfoList || [];
  const matches = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeSportteryMatch(match, day.businessDate))
  );
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

  const resultDays = resultsRaw?.value?.matchInfoList || [];
  const resultRows = resultDays.flatMap((day) =>
    (day.subMatchList || []).map((match) => normalizeSportteryResult(match, day.matchDate || day.businessDate))
  );
  let resultCount = 0;
  let reviewed = 0;
  let cases = 0;
  for (const result of resultRows) {
    const parsed = parseSportteryScore(result.fullScoreRaw || "");
    if (!parsed) continue;
    const matchId = sportteryDbMatchId(result);
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
    resultCount += 1;
  }
  await db.prepare(`
    INSERT INTO sync_logs (sync_id, source, status, message, payload_json, created_at)
    VALUES (?, 'sporttery-pages-api', 'OK', 'sync completed', ?, ?)
  `).bind(
    `sync-${Date.now()}-${crypto.randomUUID()}`,
    JSON.stringify({ matchCount: matches.length, resultCount, reviewed, cases }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, matchCount: matches.length, resultCount, reviewed, cases };
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
    if (path === "sync/sporttery" && request.method === "POST") {
      return json(await syncSportteryToD1(db, env));
    }

    if (path === "bootstrap" && request.method === "GET") {
      const [matches, locks, results, cases] = await Promise.all([
        db.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT 200").all(),
        db.prepare("SELECT * FROM locked_predictions ORDER BY locked_at DESC LIMIT 200").all(),
        db.prepare("SELECT * FROM match_results ORDER BY reviewed_at DESC LIMIT 200").all(),
        listCases(db),
      ]);
      return json({ ok: true, matches: matches.results, locks: locks.results, results: results.results, cases });
    }

    if (path === "matches" && request.method === "GET") {
      const { results } = await db.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT 300").all();
      return json({ ok: true, matches: results });
    }

    if (path === "matches" && request.method === "POST") {
      const body = await readJson(request);
      const matchId = String(body.matchId || body.match_id || id("match"));
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
      return json({ ok: true, locks: results });
    }

    if (path === "locks/preferred" && request.method === "GET") {
      const matchId = url.searchParams.get("matchId");
      if (!matchId) return json({ ok: false, error: "matchId required" }, 400);
      const lock = await db.prepare(`
        SELECT * FROM locked_predictions
        WHERE match_id = ?
        ORDER BY CASE WHEN lock_type = 'FINAL_LOCK' THEN 0 ELSE 1 END, locked_at DESC
        LIMIT 1
      `).bind(matchId).first();
      return json({ ok: true, lock });
    }

    if (path === "locks" && request.method === "POST") {
      const body = await readJson(request);
      const lockId = body.lockId || body.lock_id || `${body.matchId || body.match_id}-${body.lockType || "FINAL_LOCK"}-${Date.now()}`;
      const exists = await db.prepare("SELECT lock_id FROM locked_predictions WHERE lock_id = ?").bind(lockId).first();
      if (exists) return json({ ok: false, error: "lockId already exists; locked records cannot be overwritten" }, 409);
      await db.prepare(`
        INSERT INTO locked_predictions (
          lock_id, match_id, match_code, home_team, away_team, league, kickoff_time, locked_at, lock_type, model_version,
          model_home_prob, model_draw_prob, model_away_prob, recommendation, recommendation_side, final_grade, final_action,
          confidence_score, risk_score, consistency_score, sporttery_home_sp, sporttery_draw_sp, sporttery_away_sp,
          sporttery_home_prob, sporttery_draw_prob, sporttery_away_prob, value_home_gap, value_draw_gap, value_away_gap,
          asian_handicap, asian_home_water, asian_away_water, euro_home_odds, euro_draw_odds, euro_away_odds,
          euro_home_prob, euro_draw_prob, euro_away_prob, data_quality, reasoning_summary, downgrade_reasons_json, result_status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'V4', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `).bind(
        lockId, body.matchId || body.match_id, body.matchCode || body.match_code || "", body.homeTeam || body.home_team || "", body.awayTeam || body.away_team || "",
        body.league || "世界杯", body.kickoffTime || body.kickoff_time || "", body.lockedAt || body.locked_at || new Date().toISOString(), body.lockType || body.lock_type || "FINAL_LOCK",
        n(body.modelHomeProb ?? body.model_home_prob, 0), n(body.modelDrawProb ?? body.model_draw_prob, 0), n(body.modelAwayProb ?? body.model_away_prob, 0),
        body.recommendation || "", body.recommendationSide || body.recommendation_side || "SKIP", body.finalGrade || body.final_grade || "D", body.finalAction || body.final_action || "谨慎",
        n(body.confidenceScore ?? body.confidence_score, 0), n(body.riskScore ?? body.risk_score, 0), n(body.consistencyScore ?? body.consistency_score, null),
        n(body.sportteryHomeSp ?? body.sporttery_home_sp, null), n(body.sportteryDrawSp ?? body.sporttery_draw_sp, null), n(body.sportteryAwaySp ?? body.sporttery_away_sp, null),
        n(body.sportteryHomeProb ?? body.sporttery_home_prob, null), n(body.sportteryDrawProb ?? body.sporttery_draw_prob, null), n(body.sportteryAwayProb ?? body.sporttery_away_prob, null),
        n(body.valueHomeGap ?? body.value_home_gap, null), n(body.valueDrawGap ?? body.value_draw_gap, null), n(body.valueAwayGap ?? body.value_away_gap, null),
        n(body.asianHandicap ?? body.asian_handicap, null), n(body.asianHomeWater ?? body.asian_home_water, null), n(body.asianAwayWater ?? body.asian_away_water, null),
        n(body.euroHomeOdds ?? body.euro_home_odds, null), n(body.euroDrawOdds ?? body.euro_draw_odds, null), n(body.euroAwayOdds ?? body.euro_away_odds, null),
        n(body.euroHomeProb ?? body.euro_home_prob, null), n(body.euroDrawProb ?? body.euro_draw_prob, null), n(body.euroAwayProb ?? body.euro_away_prob, null),
        body.dataQuality || body.data_quality || "MEDIUM", body.reasoningSummary || body.reasoning_summary || "", JSON.stringify(body.downgradeReasons || body.downgrade_reasons || []), JSON.stringify(body)
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
      return json({ ok: true, matchId, result1x2, totalGoals: total });
    }

    if (path === "cases" && request.method === "GET") {
      return json({ ok: true, cases: await listCases(db) });
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

    if (path === "similar-cases" && request.method === "POST") {
      const current = await readJson(request);
      const cases = await listCases(db);
      const pool = cases
        .filter((item) => item.modelVersion === "V4")
        .filter((item) => String(item.matchId) !== String(current.matchId))
        .filter((item) => ["HIGH", "MEDIUM"].includes(item.dataQuality || "MEDIUM"))
        .map((item) => ({ ...item, similarityScore: similarity(current, item) }))
        .filter((item) => item.similarityScore >= (current.threshold ?? 65))
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, current.sampleLimit || 50);
      const topCases = pool.slice(0, current.topLimit || 5);
      const s = stats(pool, current);
      const adjustment = confidenceAdjustment(s);
      const warningFlags = warnings(s, topCases);
      return json({
        ok: true,
        sampleCount: pool.length,
        topCases,
        stats: s,
        confidenceAdjustment: adjustment,
        warningFlags,
        summaryText: pool.length < 5
          ? `当前仅匹配到 ${pool.length} 场相似案例，样本量不足，只作为参考，不参与置信度修正。`
          : `匹配到 ${pool.length} 场相似案例，当前推荐在历史相似样本中的命中率为 ${(s.sameRecommendationHitRate * 100).toFixed(1)}%。`,
      });
    }

    return json({ ok: false, error: "not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
