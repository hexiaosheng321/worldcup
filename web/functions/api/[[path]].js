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

function javascript(source, status = 200) {
  return new Response(source, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
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
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {
    payload = {};
  }
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
    actualHomeGoals: payload.actualHomeGoals,
    actualAwayGoals: payload.actualAwayGoals,
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

function parseObject(text, fallback = {}) {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
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
const competitionRules = [
  ["世界杯", /世界杯|World Cup/i],
  ["芬超", /芬超|Finland|Veikkausliiga/i],
  ["日职", /日职|J1|J联赛|Japan/i],
  ["韩职", /韩职|K联赛|K League/i],
  ["欧冠", /欧冠|Champions League/i],
  ["欧联", /欧联|Europa League/i],
  ["英超", /英超|Premier League/i],
  ["西甲", /西甲|La Liga/i],
  ["意甲", /意甲|Serie A/i],
  ["德甲", /德甲|Bundesliga/i],
  ["法甲", /法甲|Ligue 1/i],
];

function normalizeCompetition(value = "") {
  const text = String(value || "").trim();
  const found = competitionRules.find(([, pattern]) => pattern.test(text));
  if (found) return found[0];
  return text || "未分类赛事";
}

function has(...values) {
  return values.every((value) => Number.isFinite(Number(value)));
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
  const home = Number(row.actualHomeGoals);
  const away = Number(row.actualAwayGoals);
  const line = Number(row.asianHandicap);
  if (![home, away, line].every(Number.isFinite)) return "";
  const adjusted = home + line - away;
  if (adjusted > 0) return "让胜";
  if (adjusted === 0) return "让平";
  return "让负";
}

function samplePolicy(count) {
  if (count >= 30) return { level: "FULL", label: "可参与置信修正", note: "同赛事样本达到 30 场，允许进入最终置信修正。" };
  if (count >= 10) return { level: "RISK_ONLY", label: "仅做风险提示", note: "同赛事样本 10-29 场，只提示风险，不改最终置信。" };
  return { level: "DISPLAY_ONLY", label: "只展示不修正", note: "同赛事样本不足 10 场，只展示，不参与最终判断。" };
}

function stats(rows, current) {
  const sameRecommendation = rows.filter((item) => item.recommendationSide === current.recommendationSide);
  const sameGrade = rows.filter((item) => item.finalGrade === current.finalGrade);
  const policy = samplePolicy(rows.length);
  return {
    sampleCount: rows.length,
    competition: normalizeCompetition(current.league),
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
    JSON.stringify(tags.failureTags),
    JSON.stringify(tags.successTags),
    JSON.stringify({
      reviewText: review.reviewText,
      actualHomeGoals: result.full_time_home_goals,
      actualAwayGoals: result.full_time_away_goals,
    }),
    new Date().toISOString()
  ).run();
  await db.prepare("UPDATE locked_predictions SET result_status = ? WHERE lock_id = ?").bind(review.hitStatus, lock.lock_id).run();
  return { ok: true, caseId, review };
}

const sportteryApis = {
  calculator: "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c",
  results: "https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=1",
  resultPage: (pageNo) =>
    `https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry?method=result&pageSize=80&pageNo=${pageNo}`,
};

const sportteryHeaders = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

const apiFootballEndpoint = "https://apiv3.apifootball.com/";
const apiFootballTeamZh = {
  Argentina: "阿根廷",
  Australia: "澳大利亚",
  Belgium: "比利时",
  Brazil: "巴西",
  Canada: "加拿大",
  Croatia: "克罗地亚",
  Denmark: "丹麦",
  Ecuador: "厄瓜多尔",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Haiti: "海地",
  Iran: "伊朗",
  Italy: "意大利",
  Japan: "日本",
  Mexico: "墨西哥",
  Morocco: "摩洛哥",
  Netherlands: "荷兰",
  Norway: "挪威",
  Paraguay: "巴拉圭",
  Portugal: "葡萄牙",
  Qatar: "卡塔尔",
  Scotland: "苏格兰",
  Spain: "西班牙",
  Sweden: "瑞典",
  Switzerland: "瑞士",
  Tunisia: "突尼斯",
  Uruguay: "乌拉圭",
  USA: "美国",
  "United States": "美国",
};

function sportteryProxyUrl(env, targetUrl) {
  const proxy = (env.SPORTTERY_UPSTREAM_PROXY || env.UPSTREAM_PROXY || env.REQUEST_UPSTREAM_PROXY || "").trim();
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

async function fetchApiFootballDay(env, date) {
  const key = apiFootballKey(env);
  if (!key) return [];
  const url = new URL(apiFootballEndpoint);
  url.searchParams.set("action", "get_events");
  url.searchParams.set("from", date);
  url.searchParams.set("to", date);
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
    score: `${match.match_hometeam_score ?? ""}-${match.match_awayteam_score ?? ""}`,
    halfScore: `${match.match_hometeam_halftime_score ?? ""}-${match.match_awayteam_halftime_score ?? ""}`,
    status: match.match_status || "",
    isFinished: /finished|after/i.test(String(match.match_status || "")),
    live: String(match.match_live || "") === "1",
  }));
}

async function fetchApiFootballMatches(env, sportteryMatches = []) {
  const dates = [...new Set(
    sportteryMatches
      .map((match) => match.matchDate || match.ticaiDate)
      .filter(Boolean)
  )];
  if (!apiFootballKey(env) || !dates.length) return { matches: [], errors: [] };
  const settled = await Promise.allSettled(dates.slice(0, 4).map((date) => fetchApiFootballDay(env, date)));
  return {
    matches: settled.flatMap((item) => item.status === "fulfilled" ? item.value : []),
    errors: settled
      .map((item, index) => item.status === "rejected" ? { date: dates[index], message: item.reason?.message || "unknown" } : null)
      .filter(Boolean),
  };
}

function parseDashScore(score = "") {
  if (!String(score).includes("-")) return null;
  const [home, away] = String(score).split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, text: `${home}-${away}` };
}

function liveResultForSportteryMatch(match, liveRows = []) {
  return liveRows.find(
    (row) =>
      row.isFinished &&
      row.date === match.matchDate &&
      liveTeamMatches(match.home, row.home) &&
      liveTeamMatches(match.away, row.away) &&
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
  const [calculatorRaw, resultPages] = await Promise.all([
    fetchSportteryJson(env, sportteryApis.calculator),
    fetchSportteryResultPages(env),
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
      if (existingPayload.resultSource === "live-fallback-apifootball" && existingScore !== parsed.text) {
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
    liveRows = await fetchApiFootballMatches(env, matches);
  } catch (error) {
    liveRows = { matches: [], errors: [{ date: "all", message: error.message || "APIfootball fallback failed" }] };
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
    if (existing && existingPayload.resultSource !== "live-fallback-apifootball") continue;
    const result = {
      ...match,
      statusCode: "live-finished",
      statusName: "已完赛",
      halfScore: live.halfScore || "",
      fullScoreRaw: `${parsed.home}:${parsed.away}`,
      score: parsed.text,
      result: parsed.home > parsed.away ? "胜" : parsed.home < parsed.away ? "负" : "平",
      liveSource: live.source,
      liveExternalId: live.externalId,
      resultSource: "live-fallback-apifootball",
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
      resultPages: resultPages.length,
      liveFallbackErrors: liveRows.errors,
      officialOverrides,
    }),
    capturedAt
  ).run();
  return { ok: true, capturedAt, matchCount: matches.length, resultCount, liveFallbackCount, reviewed, cases, officialOverrides };
}

async function d1OddsScript(db) {
  const rows = await db.prepare("SELECT * FROM matches ORDER BY kickoff_time ASC LIMIT 300").all();
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
    importedAt: rows.results?.[0]?.updated_at || new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: matches.length,
    lastUpdateTime: rows.results?.[0]?.updated_at || "",
    matchDates: [...new Set(matches.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    matches,
  };
  return javascript(`window.LIVE_SPORTTERY_ODDS = ${JSON.stringify(data, null, 2)};\n`);
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
  return javascript(`window.LIVE_SPORTTERY_RESULTS = ${JSON.stringify(data, null, 2)};\n`);
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
    if (path === "live-sporttery-data.js" && request.method === "GET") {
      return d1OddsScript(db);
    }

    if (path === "live-sporttery-results.js" && request.method === "GET") {
      return d1ResultsScript(db);
    }

    if (path === "sync/sporttery" && request.method === "POST") {
      const requestProxy = request.headers.get("x-sporttery-upstream-proxy") || "";
      const requestApiFootballKey = request.headers.get("x-apifootball-api-key") || "";
      return json(await syncSportteryToD1(db, {
        ...env,
        REQUEST_UPSTREAM_PROXY: requestProxy,
        REQUEST_APIFOOTBALL_API_KEY: requestApiFootballKey,
      }));
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
        .filter((item) => normalizeCompetition(item.league) === normalizeCompetition(current.league))
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
        summaryText: pool.length < 10
          ? `当前仅在【${s.competition}】匹配到 ${pool.length} 场相似案例，样本量不足，只展示，不参与置信度修正。`
          : pool.length < 30
            ? `【${s.competition}】同赛事匹配到 ${pool.length} 场，当前推荐历史命中率为 ${(s.sameRecommendationHitRate * 100).toFixed(1)}%，样本只做风险提示，不调整最终置信。`
            : `【${s.competition}】同赛事匹配到 ${pool.length} 场，当前推荐历史命中率为 ${(s.sameRecommendationHitRate * 100).toFixed(1)}%。`,
      });
    }

    return json({ ok: false, error: "not found", path }, 404);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
