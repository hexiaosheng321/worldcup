const RESEARCH_KEYS = [
  "teamState",
  "injuries",
  "expectedLineups",
  "motivation",
  "weatherVenue",
  "styleMatchup",
  "marketNews",
];

const resultLabels = ["HOME", "DRAW", "AWAY"];
const resultText = { HOME: "胜", DRAW: "平", AWAY: "负" };

const LEAGUE_LEARNING_PROFILES = {
  "韩职": {
    version: "KLEAGUE_2026-07-12_R1", reviewSampleCount: 3,
    xg: { home: -0.04, away: -0.04 }, confidencePenalty: 2,
    scoreWeight: (row) => row.home + row.away === 0 ? 1.18 : row.home + row.away <= 1 ? 1.08 : 1,
    rules: ["低节奏时必须保留0球与0-0路径", "胜负优势不得自动放大为多球差"],
  },
  "瑞超": {
    version: "ALLSVENSKAN_2026-07-14_R2", reviewSampleCount: 6,
    xg: { home: 0, away: -0.03 }, confidencePenalty: 3,
    scoreWeight: (row, signals) => {
      const base = row.home === row.away ? 0.98 : Math.abs(row.home - row.away) === 1 ? 1.04 : 1;
      if (!signals.strongHomeFavourite || !signals.weakAwayAttack) return base;
      const cleanSheet = row.away === 0 ? 1.12 : 1;
      const multiGoalHomeWin = row.home - row.away >= 2 ? 1.1 : 1;
      return base * cleanSheet * multiGoalHomeWin;
    },
    rules: [
      "胜平负与净胜球分层建模",
      "-1让胜必须由净胜两球及以上概率支持",
      "主客队进球、零封概率与攻防方差必须分别估计",
      "主胜SP不高于1.25且客队预期进球不高于0.90时，2-0/3-0零封路径和两球以上胜差必须升权",
      "强队半场领先两球时，状态转移必须提高3-0/3-1扩展路径，不能只保留1-1风险分支",
    ],
  },
  "挪超": {
    version: "ELITESERIEN_2026-07-12_R1", reviewSampleCount: 5,
    xg: { home: 0.07, away: -0.03 }, confidencePenalty: 3,
    scoreWeight: (row) => row.home > row.away ? 1.04 : row.home < row.away ? 0.97 : 1.01,
    rules: ["客场强队必须接受主场攻防方差修正", "主胜不得直接映射为-1让胜", "领先后降速和客队反击必须进入第二路径"],
  },
};

function leagueLearningProfile(league = "") {
  const raw = String(league || "").trim();
  const normalized = /^(?:瑞典超|瑞超|Allsvenskan)$/i.test(raw)
    ? "瑞超"
    : /^(?:韩职|K联赛|K League)$/i.test(raw)
      ? "韩职"
      : /^(?:挪超|Eliteserien)$/i.test(raw)
        ? "挪超"
        : raw;
  return LEAGUE_LEARNING_PROFILES[normalized] || {
    version: "GENERIC_2026_V1", reviewSampleCount: 0, xg: { home: 0, away: 0 }, confidencePenalty: 0,
    scoreWeight: () => 1,
    rules: ["使用全局联合分布和通用十步闸门"],
  };
}

function seasonLabel(sample = {}) {
  return String(sample.season || sample.sourceSeason || "").trim();
}

function rate(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : 0;
}

function average(rows, getter) {
  return rows.length ? rows.reduce((sum, row) => sum + getter(row), 0) / rows.length : 0;
}

function seasonLearningContext(samples = [], match = {}, beforeDate = "") {
  const completed = samples
    .map((sample) => ({ sample, score: sampleScore(sample), date: dateKey(sample.kickoffTime || sample.matchDate) }))
    .filter((row) => row.score && (!beforeDate || !row.date || row.date < beforeDate))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const recentSeasonLabels = completed.slice(0, 30).map((row) => seasonLabel(row.sample)).filter(Boolean);
  const inferredSeason = recentSeasonLabels.length
    ? [...new Set(recentSeasonLabels)].sort((left, right) => recentSeasonLabels.filter((value) => value === right).length - recentSeasonLabels.filter((value) => value === left).length)[0]
    : String(beforeDate || match.kickoffTime || match.matchDate || "").slice(0, 4);
  const season = String(match.season || inferredSeason || "unknown");
  let seasonRows = completed.filter((row) => seasonLabel(row.sample) === season);
  if (!seasonRows.length && /^20\d{2}$/.test(season)) {
    seasonRows = completed.filter((row) => String(row.date).startsWith(season));
  }
  const recentRows = seasonRows.slice(0, 30);
  const stats = (rows) => ({
    sampleCount: rows.length,
    homeWinRate: round(rate(rows, (row) => row.score.home > row.score.away)),
    drawRate: round(rate(rows, (row) => row.score.home === row.score.away)),
    awayWinRate: round(rate(rows, (row) => row.score.home < row.score.away)),
    averageGoals: round(average(rows, (row) => row.score.home + row.score.away), 3),
    bttsRate: round(rate(rows, (row) => row.score.home > 0 && row.score.away > 0)),
  });
  const seasonStats = stats(seasonRows);
  const recentStats = stats(recentRows);
  const recentScoreWeights = new Map();
  recentRows.forEach((row, index) => {
    const key = `${row.score.home}-${row.score.away}`;
    const recencyWeight = 1 + (recentRows.length - index - 1) / Math.max(1, recentRows.length) * 0.25;
    recentScoreWeights.set(key, (recentScoreWeights.get(key) || 0) + recencyWeight);
  });
  const recentScoreWeightTotal = [...recentScoreWeights.values()].reduce((sum, value) => sum + value, 0) || 1;
  const scoreCalibrationEligible = seasonRows.length >= 30 && recentRows.length >= 15;
  const deltas = {
    homeWinRate: round(recentStats.homeWinRate - seasonStats.homeWinRate),
    drawRate: round(recentStats.drawRate - seasonStats.drawRate),
    averageGoals: round(recentStats.averageGoals - seasonStats.averageGoals, 3),
    bttsRate: round(recentStats.bttsRate - seasonStats.bttsRate),
  };
  const narrative = [];
  if (seasonRows.length < 10) narrative.push("当前赛季样本不足，只记录不校准");
  if (deltas.drawRate >= 0.08) narrative.push("近期平局率高于赛季基线");
  if (deltas.drawRate <= -0.08) narrative.push("近期平局率低于赛季基线");
  if (deltas.averageGoals >= 0.25) narrative.push("近期进球环境升温");
  if (deltas.averageGoals <= -0.25) narrative.push("近期进球环境收紧");
  if (deltas.homeWinRate >= 0.08) narrative.push("近期主场优势增强");
  if (deltas.homeWinRate <= -0.08) narrative.push("近期主场优势减弱");
  if (!narrative.length) narrative.push("近期联赛分布与赛季基线接近");
  return {
    league: match.league || "通用",
    season,
    mode: scoreCalibrationEligible ? "BOUNDED_SCORE_CALIBRATION" : "CHALLENGER_SHADOW",
    appliedToChampion: scoreCalibrationEligible,
    appliedScope: scoreCalibrationEligible ? "SCORE_DISTRIBUTION_ONLY" : "NONE",
    seasonStats,
    recentWindow: { size: 30, ...recentStats },
    deltas,
    narrative,
    scoreCalibration: {
      eligible: scoreCalibrationEligible,
      weight: scoreCalibrationEligible ? 0.12 : 0,
      sampleCount: recentRows.length,
      probabilities: Object.fromEntries([...recentScoreWeights.entries()].map(([score, value]) => [score, round(value / recentScoreWeightTotal)])),
    },
    eligibleForCalibrationReview: scoreCalibrationEligible,
    promotionPolicy: "当前赛季至少30场后仅以12%上限校准比分分布；胜平负、让球和总进球仍须通过样本外不退化验证后才能扩大权重",
  };
}

export function handicapDecisionAudit(rankedHandicap = [], selectedHandicap = "") {
  const leader = rankedHandicap[0] || { label: "", probability: 0 };
  const selected = rankedHandicap.find((item) => item.label === selectedHandicap) || { probability: 0 };
  const probabilityGap = round(Number(leader.probability || 0) - Number(selected.probability || 0));
  return {
    independentLeader: leader.label || "",
    selected: selectedHandicap,
    probabilityGap,
    materialConflict: Boolean(selectedHandicap && leader.label && selectedHandicap !== leader.label && probabilityGap > 0.1),
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validOdd(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 1 ? parsed : null;
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function normalizeProbabilities(values) {
  const safe = values.map((value) => Math.max(0, Number(value) || 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  return total > 0 ? safe.map((value) => value / total) : [1 / safe.length, 1 / safe.length, 1 / safe.length];
}

function noVig(odds) {
  const values = odds.map(validOdd);
  if (values.some((value) => value === null)) return null;
  const raw = values.map((value) => 1 / value);
  const probabilities = normalizeProbabilities(raw);
  return {
    odds: values,
    probabilities,
    overround: round(raw.reduce((sum, value) => sum + value, 0)),
    returnRate: round(1 / raw.reduce((sum, value) => sum + value, 0)),
  };
}

function dateKey(value = "") {
  return String(value || "").slice(0, 10);
}

function teamKey(value = "") {
  const raw = String(value || "").trim();
  const aliases = [
    [/^(?:挪威|Norway)$/i, "norway"], [/^(?:英格兰|England)$/i, "england"],
    [/^(?:阿根廷|Argentina)$/i, "argentina"], [/^(?:瑞士|Switzerland)$/i, "switzerland"],
    [/腓特烈(?:斯塔)?/i, "fredrikstad"], [/利勒斯(?:特罗姆)?/i, "lillestrom"],
    [/特罗姆(?:瑟)?/i, "tromso"], [/瓦勒伦(?:加)?/i, "valerenga"], [/奥勒松/i, "aalesund"], [/莫尔德/i, "molde"],
    [/萨普斯|Sarpsborg(?:\s*08)?/i, "sarpsborg"], [/KFU|KFUM(?:\s*Oslo|奥斯陆)?/i, "kfum"],
    [/博德闪|Bod[oø](?:\/Glimt)?/i, "bodoglimt"], [/罗森博|Rosenborg/i, "rosenborg"],
    [/克里斯|Kristiansund/i, "kristiansund"], [/桑纳菲|Sandefjord/i, "sandefjord"],
    [/^(?:杰尔|吉奥里|Gy[oő]r)$/i, "gyor"], [/^(?:维京人|维京古尔|维京古|V[ií]kingur(?: Reykjav[ií]k)?)$/i, "vikingur-reykjavik"],
    [/^(?:新圣徒|The New Saints|TNS)$/i, "the-new-saints"], [/^(?:沙巴巴|沙巴巴库|萨巴赫|Sabah(?: Baku)?)$/i, "sabah-baku"],
    [/韦斯特|V[aä]ster[aå]s/i, "vasteras"], [/代格福|Degerfors/i, "degerfors"],
    [/米亚尔(?:比)?/i, "mjallby"], [/(?:AIK)?索尔纳/i, "aik"], [/厄尔格|奥尔格里特/i, "orgryte"], [/赫根/i, "hacken"],
    [/拉赫蒂|Lahti/i, "lahti"], [/HIFK|Helsinki IFK/i, "hifk"], [/赫尔火|赫尔辛基火花|IF Gnistan/i, "gnistan"], [/赫尔辛(?:基)?|HJK(?: Helsinki)?/i, "hjk"], [/玛丽港|Mariehamn/i, "mariehamn"],
    [/AC\s*奥(?:卢)?|AC\s*Oulu/i, "acoulu"], [/TPS|Turku\s*PS/i, "tps"],
  ];
  const matched = aliases.find(([pattern]) => pattern.test(raw));
  if (matched) return matched[1];
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameTeam(left, right) {
  const a = teamKey(left);
  const b = teamKey(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function sampleScore(sample) {
  const home = number(sample.actualHomeGoals);
  const away = number(sample.actualAwayGoals);
  if (home !== null && away !== null) return { home, away };
  const matched = String(sample.score || "").match(/(\d+)\D+(\d+)/);
  return matched ? { home: Number(matched[1]), away: Number(matched[2]) } : null;
}

function formNormalization(sample = {}, targetLeague = "", beforeDate = "") {
  const sourceLeague = String(sample.league || sample.competition || "").trim();
  const crossLeague = Boolean(sourceLeague && targetLeague && sourceLeague !== targetLeague);
  const leagueStrength = number(sample.leagueStrengthFactor ?? sample.leagueStrength);
  const opponentQuality = number(sample.opponentQualityFactor ?? sample.opponentStrengthFactor ?? sample.opponentQuality);
  const matchType = String(sample.matchType || sample.competitionType || "").toUpperCase();
  const friendly = sample.isFriendly === true || /FRIENDLY|友谊/.test(matchType);
  const complete = !crossLeague || (
    leagueStrength !== null
    && opponentQuality !== null
    && Boolean(matchType)
  );
  const ageDays = daysBetween(dateKey(sample.kickoffTime || sample.matchDate), beforeDate);
  const recencyWeight = Number.isFinite(ageDays) ? clamp(1 - ageDays / 240, 0.55, 1) : 0.7;
  const matchTypeWeight = friendly ? 0.45 : 1;
  const strengthFactor = complete && crossLeague
    ? clamp(leagueStrength, 0.65, 1.35) * clamp(opponentQuality, 0.75, 1.25)
    : 1;
  return {
    sourceLeague,
    crossLeague,
    complete,
    friendly,
    matchType: matchType || (crossLeague ? "" : "SAME_LEAGUE"),
    leagueStrengthFactor: complete ? round(crossLeague ? clamp(leagueStrength, 0.65, 1.35) : 1) : null,
    opponentQualityFactor: complete ? round(crossLeague ? clamp(opponentQuality, 0.75, 1.25) : 1) : null,
    strengthFactor: round(strengthFactor),
    recencyWeight: round(recencyWeight),
    sampleWeight: round(recencyWeight * matchTypeWeight),
  };
}

function recentTeamForm(samples, team, beforeDate, targetLeague, limit = 8) {
  const seen = new Set();
  const candidates = samples
    .filter((sample) => !beforeDate || dateKey(sample.kickoffTime || sample.matchDate) < beforeDate)
    .filter((sample) => sameTeam(team, sample.homeTeam) || sameTeam(team, sample.awayTeam))
    .map((sample) => ({ sample, score: sampleScore(sample), normalization: formNormalization(sample, targetLeague, beforeDate) }))
    .filter((item) => item.score)
    .sort((a, b) => String(b.sample.kickoffTime || b.sample.matchDate || "").localeCompare(String(a.sample.kickoffTime || a.sample.matchDate || "")))
    .filter(({ sample, score }) => {
      const key = [dateKey(sample.kickoffTime || sample.matchDate), teamKey(sample.homeTeam), teamKey(sample.awayTeam), score.home, score.away].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const rows = candidates
    .filter(({ normalization }) => normalization.complete)
    .slice(0, limit)
    .map(({ sample, score, normalization }) => {
      const isHome = sameTeam(team, sample.homeTeam);
      const rawGf = isHome ? score.home : score.away;
      const rawGa = isHome ? score.away : score.home;
      const gf = rawGf * normalization.strengthFactor;
      const ga = rawGa / normalization.strengthFactor;
      return {
        date: dateKey(sample.kickoffTime || sample.matchDate),
        gf: round(gf, 3),
        ga: round(ga, 3),
        rawGf,
        rawGa,
        result: rawGf > rawGa ? "W" : rawGf < rawGa ? "L" : "D",
        venue: isHome ? "HOME" : "AWAY",
        weight: normalization.sampleWeight,
        normalization,
      };
    });
  const crossLeagueCandidates = candidates.filter(({ normalization }) => normalization.crossLeague).length;
  const excludedCrossLeague = candidates.filter(({ normalization }) => normalization.crossLeague && !normalization.complete).length;
  const sameLeagueCandidates = candidates.length - crossLeagueCandidates;
  const crossLeagueNormalizationRequired = sameLeagueCandidates < 5 && crossLeagueCandidates > 0;
  return {
    rows,
    audit: {
      targetLeague,
      candidateCount: candidates.length,
      sameLeagueCandidates,
      crossLeagueCandidates,
      normalizedCrossLeague: crossLeagueCandidates - excludedCrossLeague,
      excludedCrossLeague,
      required: crossLeagueNormalizationRequired,
      complete: !crossLeagueNormalizationRequired || excludedCrossLeague === 0,
      policy: "LEAGUE_STRENGTH_X_OPPONENT_QUALITY_X_MATCH_TYPE_X_RECENCY",
    },
  };
}

function formProbabilities(homeRows, awayRows) {
  if (homeRows.length < 3 || awayRows.length < 3) return null;
  const points = (rows) => {
    const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 1), 0) || 1;
    return rows.reduce((sum, row) => sum + (row.result === "W" ? 3 : row.result === "D" ? 1 : 0) * Number(row.weight || 1), 0) / (totalWeight * 3);
  };
  const homeStrength = points(homeRows);
  const awayStrength = points(awayRows);
  const draw = Math.max(0.2, 0.31 - Math.abs(homeStrength - awayStrength) * 0.15);
  const remaining = 1 - draw;
  const home = remaining * (0.5 + (homeStrength - awayStrength) * 0.45);
  return normalizeProbabilities([home, draw, remaining - home]);
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function poisson(lambda, goals) {
  return Math.exp(-lambda) * (lambda ** goals) / factorial(goals);
}

function expectedGoals(samples, homeTeam, awayTeam, beforeDate, teamFormSamples = samples, targetLeague = "") {
  const homeForm = recentTeamForm(teamFormSamples, homeTeam, beforeDate, targetLeague, 8);
  const awayForm = recentTeamForm(teamFormSamples, awayTeam, beforeDate, targetLeague, 8);
  const homeRows = homeForm.rows;
  const awayRows = awayForm.rows;
  const average = (rows, key, fallback) => {
    if (!rows.length) return fallback;
    const totalWeight = rows.reduce((sum, row) => sum + Number(row.weight || 1), 0) || 1;
    return rows.reduce((sum, row) => sum + row[key] * Number(row.weight || 1), 0) / totalWeight;
  };
  const homeVenueRows = homeRows.filter((row) => row.venue === "HOME");
  const awayVenueRows = awayRows.filter((row) => row.venue === "AWAY");
  const homeBasis = homeVenueRows.length >= 3 ? homeVenueRows : homeRows;
  const awayBasis = awayVenueRows.length >= 3 ? awayVenueRows : awayRows;
  const leagueScores = samples.map(sampleScore).filter(Boolean);
  const leagueAverageGoals = leagueScores.length
    ? leagueScores.reduce((sum, score) => sum + score.home + score.away, 0) / leagueScores.length
    : 2.6;
  const leagueOpennessFactor = Math.max(0.82, Math.min(1.22, leagueAverageGoals / 2.6));
  const variance = (rows, key) => {
    if (rows.length < 2) return 0;
    const mean = average(rows, key, 0);
    return rows.reduce((sum, row) => sum + (row[key] - mean) ** 2, 0) / rows.length;
  };
  const homeAttack = average(homeBasis, "gf", 1.35);
  const homeDefence = average(homeBasis, "ga", 1.2);
  const awayAttack = average(awayBasis, "gf", 1.15);
  const awayDefence = average(awayBasis, "ga", 1.35);
  return {
    home: Math.min(3.8, Math.max(0.3, ((homeAttack + awayDefence) / 2) * leagueOpennessFactor)),
    away: Math.min(3.8, Math.max(0.3, ((awayAttack + homeDefence) / 2) * leagueOpennessFactor)),
    homeRows,
    awayRows,
    venueProfile: {
      homeSampleCount: homeVenueRows.length,
      awaySampleCount: awayVenueRows.length,
      homeAttackVariance: round(variance(homeBasis, "gf"), 3),
      homeDefenceVariance: round(variance(homeBasis, "ga"), 3),
      awayAttackVariance: round(variance(awayBasis, "gf"), 3),
      awayDefenceVariance: round(variance(awayBasis, "ga"), 3),
    },
    leagueProfile: {
      sampleCount: leagueScores.length,
      averageGoals: round(leagueAverageGoals, 3),
      opennessFactor: round(leagueOpennessFactor, 3),
    },
    crossLeagueNormalization: {
      home: homeForm.audit,
      away: awayForm.audit,
      complete: homeForm.audit.complete && awayForm.audit.complete,
    },
  };
}

function scoreGrid(xg) {
  const rows = [];
  for (let home = 0; home <= 6; home += 1) {
    for (let away = 0; away <= 6; away += 1) {
      rows.push({ home, away, score: `${home}-${away}`, probability: poisson(xg.home, home) * poisson(xg.away, away) });
    }
  }
  return rows.sort((a, b) => b.probability - a.probability);
}

function leagueLearningSignals(league, market, xg) {
  const homeWinOdd = validOdd(market.normal?.win);
  return {
    strongHomeFavourite: leagueLearningProfile(league).version.startsWith("ALLSVENSKAN_") && homeWinOdd !== null && homeWinOdd <= 1.25,
    weakAwayAttack: Number(xg.away) <= 0.9,
    homeWinOdd,
    awayExpectedGoals: round(xg.away, 2),
  };
}

function applyLeagueScoreLearning(rows, profile, signals) {
  const weighted = rows.map((row) => ({ ...row, probability: row.probability * profile.scoreWeight(row, signals) }));
  const total = weighted.reduce((sum, row) => sum + row.probability, 0) || 1;
  return weighted.map((row) => ({ ...row, probability: row.probability / total })).sort((a, b) => b.probability - a.probability);
}

function normalizedMap(entries = []) {
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  return new Map(entries.map(([key, value]) => [key, total > 0 ? Math.max(0, Number(value) || 0) / total : 0]));
}

function scoreMarketDistribution(rows = []) {
  const entries = rows.map((row) => [String(row.score || "").replace(":", "-"), validOdd(row.odds)]).filter(([score, odds]) => /^\d+-\d+$/.test(score) && odds);
  return normalizedMap(entries.map(([score, odds]) => [score, 1 / odds]));
}

function historicalScoreDistribution(samples, currentMarket) {
  const currentOdds = [currentMarket.normal?.win, currentMarket.normal?.draw, currentMarket.normal?.lose].map(number);
  const weighted = new Map();
  let sampleCount = 0;
  for (const sample of samples) {
    const score = sampleScore(sample);
    const sampleOdds = [sample.euroHomeOdds ?? sample.sportteryHomeSp, sample.euroDrawOdds ?? sample.sportteryDrawSp, sample.euroAwayOdds ?? sample.sportteryAwaySp].map(number);
    if (!score || sampleOdds.some((value) => value === null) || currentOdds.some((value) => value === null)) continue;
    const distance = sampleOdds.reduce((sum, value, index) => sum + Math.abs(value - currentOdds[index]), 0);
    if (distance > 4.5) continue;
    const key = `${score.home}-${score.away}`;
    weighted.set(key, (weighted.get(key) || 0) + 1 / (1 + distance));
    sampleCount += 1;
  }
  return { sampleCount, probabilities: normalizedMap([...weighted.entries()]) };
}

function blendScoreDistribution(scoreRows, marketRows, historical, seasonLearning = {}) {
  const base = normalizedMap(scoreRows.map((row) => [row.score, row.probability]));
  const market = scoreMarketDistribution(marketRows);
  const season = normalizedMap(Object.entries(seasonLearning.scoreCalibration?.probabilities || {}));
  const parts = [
    { label: "fundamental-score-grid", weight: 0.7, probabilities: base },
    historical.sampleCount >= 10 ? { label: "historical-similar", weight: 0.2, probabilities: historical.probabilities } : null,
    market.size ? { label: "sporttery-score-calibration", weight: 0.1, probabilities: market } : null,
    seasonLearning.scoreCalibration?.eligible && season.size
      ? { label: "league-season-score-calibration", weight: seasonLearning.scoreCalibration.weight, probabilities: season }
      : null,
  ].filter(Boolean);
  const keys = new Set(parts.flatMap((part) => [...part.probabilities.keys()]));
  const weightTotal = parts.reduce((sum, part) => sum + part.weight, 0);
  const rows = [...keys].map((score) => {
    const matched = score.match(/^(\d+)-(\d+)$/);
    return { score, home: Number(matched?.[1]), away: Number(matched?.[2]), probability: parts.reduce((sum, part) => sum + (part.probabilities.get(score) || 0) * part.weight, 0) / weightTotal };
  }).filter((row) => Number.isFinite(row.home) && Number.isFinite(row.away)).sort((a, b) => b.probability - a.probability);
  return { rows, parts: parts.map((part) => ({ label: part.label, weight: part.weight })), marketComplete: market.size >= 8, historicalSampleCount: historical.sampleCount };
}

function totalMarketDistribution(rows = []) {
  const entries = rows.map((row) => [String(row.goals ?? ""), validOdd(row.odds)]).filter(([goals, odds]) => /^(?:[0-6]|7\+)$/.test(goals) && odds);
  return normalizedMap(entries.map(([goals, odds]) => [goals, 1 / odds]));
}

function totalGoalModel(scoreRows, marketRows) {
  const fromScores = new Map();
  scoreRows.forEach((row) => { const key = row.home + row.away >= 7 ? "7+" : String(row.home + row.away); fromScores.set(key, (fromScores.get(key) || 0) + row.probability); });
  const scoreProbabilities = normalizedMap([...fromScores.entries()]);
  const marketProbabilities = totalMarketDistribution(marketRows);
  const parts = [{ label: "joint-score-model", weight: 0.85, probabilities: scoreProbabilities }, marketProbabilities.size ? { label: "sporttery-total-calibration", weight: 0.15, probabilities: marketProbabilities } : null].filter(Boolean);
  const weightTotal = parts.reduce((sum, part) => sum + part.weight, 0);
  const keys = new Set(parts.flatMap((part) => [...part.probabilities.keys()]));
  const probabilities = normalizedMap([...keys].map((key) => [key, parts.reduce((sum, part) => sum + (part.probabilities.get(key) || 0) * part.weight, 0) / weightTotal]));
  const ranked = [...probabilities.entries()].sort((a, b) => b[1] - a[1]);
  return { probabilities, pick: ranked.slice(0, 2).map(([goals]) => `${goals}球`).join("/"), components: parts.map((part) => ({ label: part.label, weight: part.weight })), marketComplete: marketProbabilities.size >= 8 };
}

function resultFromScores(rows) {
  return normalizeProbabilities([
    rows.filter((row) => row.home > row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home === row.away).reduce((sum, row) => sum + row.probability, 0),
    rows.filter((row) => row.home < row.away).reduce((sum, row) => sum + row.probability, 0),
  ]);
}

export function selectOfficialScores(rows = []) {
  const seen = new Set();
  return [...rows]
    .filter((row) => row && Number(row.probability) > 0 && row.score)
    .sort((left, right) => Number(right.probability) - Number(left.probability))
    .filter((row) => {
      if (seen.has(row.score)) return false;
      seen.add(row.score);
      return true;
    })
    .slice(0, 2);
}

function twoLegContextAudit(context = {}, motivationSummary = "") {
  const raw = context.tieContext || {};
  const required = /次回合|两回合|总比分/.test(String(motivationSummary || ""));
  const legNumber = number(raw.legNumber);
  const aggregateHome = number(raw.aggregateHomeBeforeMatch);
  const aggregateAway = number(raw.aggregateAwayBeforeMatch);
  const complete = !required || (raw.isTwoLeg === true && legNumber === 2 && aggregateHome !== null && aggregateAway !== null);
  const leader = aggregateHome === null || aggregateAway === null ? "LEVEL" : aggregateHome > aggregateAway ? "HOME" : aggregateHome < aggregateAway ? "AWAY" : "LEVEL";
  const ninetyMinuteAdjustment = leader === "HOME" ? [-0.05, 0.04, 0.01] : leader === "AWAY" ? [0.01, 0.04, -0.05] : [0, 0, 0];
  return {
    required,
    complete,
    isTwoLeg: raw.isTwoLeg === true,
    legNumber,
    aggregateBeforeMatch: aggregateHome === null || aggregateAway === null ? null : { home: aggregateHome, away: aggregateAway },
    aggregateLeader: leader,
    ninetyMinuteAdjustment,
    objectives: {
      home: leader === "AWAY" ? "TRAILING_MUST_CHASE" : leader === "HOME" ? "LEADING_CAN_CONTROL" : "LEVEL_TIE",
      away: leader === "HOME" ? "TRAILING_MUST_CHASE" : leader === "AWAY" ? "LEADING_CAN_CONTROL" : "LEVEL_TIE",
    },
  };
}

function canonicalCompetitionStage(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/FINAL|决赛/.test(raw) && !/SEMI|半决赛/.test(raw)) return "FINAL";
  if (/SEMI|半决赛|4强/.test(raw)) return "SEMI_FINAL";
  if (/QUARTER|1\/4|八强|8强/.test(raw)) return "QUARTER_FINAL";
  if (/ROUND[_\s-]*OF[_\s-]*32|32强/.test(raw)) return "ROUND_OF_32";
  if (/ROUND[_\s-]*OF[_\s-]*16|16强/.test(raw)) return "ROUND_OF_16";
  if (/QUALIF|资格|预选/.test(raw)) return "QUALIFYING";
  if (/GROUP|小组/.test(raw)) return "GROUP_STAGE";
  return raw.replace(/\s+/g, "_");
}

function competitionStageAudit(context = {}, tieAudit = {}) {
  const matchStage = String(context.match?.competitionStage || context.match?.stage || context.match?.round || "").trim();
  const researchStageValue = context.research?.competitionStage;
  const researchStage = String(
    typeof researchStageValue === "object"
      ? researchStageValue.researchLabel || researchStageValue.label || researchStageValue.stage || ""
      : researchStageValue || context.research?.match?.competitionStage || context.research?.match?.stage || "",
  ).trim();
  const required = Boolean(matchStage || tieAudit.required || tieAudit.isTwoLeg);
  const matchCanonical = canonicalCompetitionStage(matchStage);
  const researchCanonical = canonicalCompetitionStage(researchStage);
  const labelsComplete = !required || Boolean(matchCanonical && researchCanonical);
  const consistent = labelsComplete && (!matchCanonical || !researchCanonical || matchCanonical === researchCanonical);
  return {
    required,
    complete: consistent,
    matchStage,
    researchStage,
    matchCanonical,
    researchCanonical,
    consistent,
    policy: "SPORTTERY_STAGE_X_RESEARCH_STAGE_X_TIE_CONTEXT",
  };
}

function twoLegLeadControlAudit(tieAudit = {}, research = {}, rawXg = {}) {
  const leader = tieAudit.aggregateLeader;
  const rawTie = research.tieContext || {};
  const explicitSignals = [
    rawTie.leaderNeedsGoalDifference,
    rawTie.trailingSideSustainedThreat,
    rawTie.trailingSideCollapseRisk,
  ].filter((value) => value === true).length;
  const leaderXgKey = leader === "HOME" ? "xgHome" : leader === "AWAY" ? "xgAway" : "";
  const quantitativeSignals = leaderXgKey
    ? RESEARCH_KEYS.filter((key) => {
      const entry = research[key] || {};
      return entry.status === "VERIFIED" && Number(entry.impact?.[leaderXgKey] || 0) >= 0.12;
    }).length
    : 0;
  const expansionEvidenceCount = explicitSignals + quantitativeSignals;
  const applied = tieAudit.isTwoLeg && leader !== "LEVEL" && expansionEvidenceCount === 0;
  const factor = applied ? 0.88 : 1;
  const before = { home: Number(rawXg.home || 0), away: Number(rawXg.away || 0) };
  const after = {
    home: leader === "HOME" ? Math.max(0.2, before.home * factor) : before.home,
    away: leader === "AWAY" ? Math.max(0.2, before.away * factor) : before.away,
  };
  return {
    applied,
    aggregateLeader: leader,
    factor,
    expansionEvidenceCount,
    before: { home: round(before.home, 2), away: round(before.away, 2) },
    after: { home: round(after.home, 2), away: round(after.away, 2) },
    policy: "DECAY_AGGREGATE_LEADER_FOLLOW_UP_GOALS_UNLESS_EXPANSION_EVIDENCE",
  };
}

function directionFromStyleEvidence(research = {}) {
  const style = research.styleMatchup || {};
  const explicit = String(style.firstGoalSide || style.firstGoalLeader || "").toUpperCase();
  if (["HOME", "DRAW", "AWAY"].includes(explicit)) return explicit;
  const home = Number(style.impact?.home || 0);
  const away = Number(style.impact?.away || 0);
  if (Math.abs(home - away) < 0.02) return "";
  return home > away ? "HOME" : "AWAY";
}

function evidenceDirectionConflictAudit({ marketBaseline, tieAudit, research, selectedDirection, auditedResearch }) {
  const marketDirection = marketBaseline
    ? resultLabels[marketBaseline.probabilities.indexOf(Math.max(...marketBaseline.probabilities))]
    : "";
  const styleDirection = directionFromStyleEvidence(research);
  const tieExposureDirection = tieAudit.aggregateLeader === "AWAY"
    ? "AWAY"
    : tieAudit.aggregateLeader === "HOME"
      ? "HOME"
      : "";
  const votes = [
    marketDirection ? { source: "LOCK_MARKET", direction: marketDirection } : null,
    styleDirection ? { source: "STYLE_FIRST_GOAL", direction: styleDirection } : null,
    tieExposureDirection ? { source: "TIE_CHASE_EXPOSURE", direction: tieExposureDirection } : null,
  ].filter(Boolean);
  const counts = Object.fromEntries(resultLabels.map((label) => [label, votes.filter((vote) => vote.direction === label).length]));
  const consensusDirection = resultLabels.slice().sort((left, right) => counts[right] - counts[left])[0];
  const consensusCount = counts[consensusDirection] || 0;
  const materialConflict = consensusCount >= 2 && consensusDirection !== selectedDirection;
  const selectedKey = String(selectedDirection || "").toLowerCase();
  const consensusKey = String(consensusDirection || "").toLowerCase();
  const quantitativeSupport = (auditedResearch?.items || []).filter((item) => item.complete
    && Number(item.impact?.[selectedKey] || 0) - Number(item.impact?.[consensusKey] || 0) >= 0.02);
  return {
    votes,
    counts,
    consensusDirection: consensusCount >= 2 ? consensusDirection : "",
    consensusCount,
    selectedDirection,
    materialConflict,
    quantitativeSupportForSelected: quantitativeSupport.map((item) => item.key),
    quantitativeSupportCount: quantitativeSupport.length,
    resolved: !materialConflict || quantitativeSupport.length >= 2,
    championAction: materialConflict && quantitativeSupport.length < 2 ? "BLOCK_FINAL_LOCK" : "ALLOW",
    challengerRiskWeight: consensusCount >= 2 ? 0.35 : 0.2,
    policy: "TWO_OF_MARKET_FIRST_GOAL_TIE_EXPOSURE_REQUIRE_TWO_QUANTITATIVE_OVERRIDES",
  };
}

function advancementDistribution(scoreRows, tieAudit) {
  if (!tieAudit.isTwoLeg || !tieAudit.aggregateBeforeMatch) return null;
  const totals = { HOME_ADVANCES: 0, EXTRA_TIME: 0, AWAY_ADVANCES: 0 };
  for (const row of scoreRows) {
    const home = tieAudit.aggregateBeforeMatch.home + row.home;
    const away = tieAudit.aggregateBeforeMatch.away + row.away;
    const key = home > away ? "HOME_ADVANCES" : home < away ? "AWAY_ADVANCES" : "EXTRA_TIME";
    totals[key] += Number(row.probability || 0);
  }
  const normalized = normalizeProbabilities(Object.values(totals));
  return Object.fromEntries(Object.keys(totals).map((key, index) => [key, round(normalized[index])]));
}

function researchAudit(research = {}, asOf = new Date().toISOString()) {
  const weights = { teamState: 0.2, injuries: 0.18, expectedLineups: 0.17, motivation: 0.12, weatherVenue: 0.05, styleMatchup: 0.18, marketNews: 0.1 };
  const freshnessHours = { teamState: 168, injuries: 24, expectedLineups: 24, motivation: 72, weatherVenue: 48, styleMatchup: 168, marketNews: 6 };
  const adjustment = { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 };
  const items = RESEARCH_KEYS.map((key) => {
    const entry = research[key] || {};
    const sources = Array.isArray(entry.sources) ? entry.sources.filter((source) => source?.url && source?.title) : [];
    const observedAt = entry.observedAt || "";
    const capturedFresh = entry.capturedAt && Date.now() - Date.parse(entry.capturedAt) <= 72 * 60 * 60 * 1000;
    const observedFresh = observedAt && Date.now() - Date.parse(observedAt) <= (freshnessHours[key] || 72) * 60 * 60 * 1000;
    const impact = entry.impact || {};
    const numericImpact = ["home", "draw", "away", "xgHome", "xgAway"].every((field) => Number.isFinite(Number(impact[field])));
    const evidenceGrade = String(entry.evidenceGrade || "").toUpperCase();
    const beforeLock = (!entry.capturedAt || Date.parse(entry.capturedAt) <= Date.parse(asOf)) && (!observedAt || Date.parse(observedAt) <= Date.parse(asOf));
    const verified = entry.status === "VERIFIED" && String(entry.summary || "").trim().length >= 20 && sources.length > 0 && capturedFresh && observedFresh && beforeLock && numericImpact && ["A", "B", "C"].includes(evidenceGrade);
    const nonDecisiveUnavailable = ["injuries", "expectedLineups"].includes(key)
      && entry.status === "NOT_PUBLISHED"
      && String(entry.summary || "").trim().length >= 20
      && sources.length > 0 && capturedFresh && observedFresh && beforeLock && numericImpact
      && ["home", "draw", "away", "xgHome", "xgAway"].every((field) => Number(impact[field]) === 0);
    const complete = verified || nonDecisiveUnavailable;
    if (complete) {
      const weight = weights[key] || 0;
      for (const field of Object.keys(adjustment)) adjustment[field] += Number(impact[field]) * weight;
    }
    return { key, complete, verified, nonDecisiveUnavailable, status: entry.status || "MISSING", summary: entry.summary || "", sources, capturedAt: entry.capturedAt || "", observedAt, freshnessHours: freshnessHours[key] || 72, capturedFresh: Boolean(capturedFresh), observedFresh: Boolean(observedFresh), beforeLock: Boolean(beforeLock), evidenceGrade, impact: numericImpact ? Object.fromEntries(Object.keys(adjustment).map((field) => [field, round(Number(impact[field]))])) : null };
  });
  const capped = Object.fromEntries(Object.entries(adjustment).map(([key, value]) => [key, round(Math.max(key.startsWith("xg") ? -0.5 : -0.12, Math.min(key.startsWith("xg") ? 0.5 : 0.12, value)))]));
  return { complete: items.every((item) => item.complete), items, missing: items.filter((item) => !item.complete).map((item) => item.key), adjustment: capped };
}

function oddsMovementAudit(history = {}) {
  const had = Array.isArray(history.had) ? history.had : [];
  const snapshots = had.filter((row) => [row.h, row.d, row.a].every((value) => validOdd(value)));
  const latest = snapshots.at(-1) || null;
  const distance = (left, right) => Math.abs(Number(left) - Number(right));
  const cleanSnapshots = latest ? snapshots.filter((row) => {
    const aligned = distance(row.h, latest.h) + distance(row.a, latest.a);
    const reversed = distance(row.h, latest.a) + distance(row.a, latest.h);
    return aligned <= reversed;
  }) : [];
  const first = cleanSnapshots[0] || null;
  const movementMagnitude = first && latest
    ? round(Math.abs(Number(first.h) - Number(latest.h)) + Math.abs(Number(first.d) - Number(latest.d)) + Math.abs(Number(first.a) - Number(latest.a)), 3)
    : 0;
  return {
    complete: cleanSnapshots.length >= 2,
    snapshots: snapshots.length,
    cleanSnapshots: cleanSnapshots.length,
    rejectedOrientationSnapshots: snapshots.length - cleanSnapshots.length,
    first,
    latest,
    movementMagnitude,
    marketState: movementMagnitude >= 0.05 ? "MOVED" : "STABLE",
  };
}

function scoreResult(row) {
  return row.home > row.away ? "HOME" : row.home < row.away ? "AWAY" : "DRAW";
}

function daysBetween(left, right) {
  const a = Date.parse(String(left || "").slice(0, 10));
  const b = Date.parse(String(right || "").slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86400000 : Infinity;
}

function handicapResult(score, handicap) {
  const line = number(String(handicap ?? "0").replace("+", "")) ?? 0;
  const adjusted = score.home + line - score.away;
  return adjusted > 0 ? "让胜" : adjusted < 0 ? "让负" : "让平";
}

const handicapLabels = ["让胜", "让平", "让负"];

function handicapProbabilitiesFromScores(rows, handicap) {
  const totals = Object.fromEntries(handicapLabels.map((label) => [label, 0]));
  for (const row of rows) totals[handicapResult(row, handicap)] += Number(row.probability || 0);
  return normalizeProbabilities(handicapLabels.map((label) => totals[label]));
}

function historicalHandicapDistribution(samples, currentMarket, handicap) {
  const currentOdds = [currentMarket.normal?.win, currentMarket.normal?.draw, currentMarket.normal?.lose].map(number);
  const rows = samples.map((sample) => {
    const score = sampleScore(sample);
    const sampleOdds = [sample.euroHomeOdds ?? sample.sportteryHomeSp, sample.euroDrawOdds ?? sample.sportteryDrawSp, sample.euroAwayOdds ?? sample.sportteryAwaySp].map(number);
    if (!score || sampleOdds.some((value) => value === null) || currentOdds.some((value) => value === null)) return null;
    const oddsDistance = sampleOdds.reduce((sum, value, index) => sum + Math.abs(value - currentOdds[index]), 0);
    const lineDistance = Number.isFinite(Number(sample.asianHandicap)) ? Math.abs(Number(sample.asianHandicap) - Number(handicap || 0)) : 0.75;
    if (oddsDistance > 4.5 || lineDistance > 1) return null;
    return { result: handicapResult(score, handicap), weight: 1 / (1 + oddsDistance + lineDistance * 1.5) };
  }).filter(Boolean).sort((a, b) => b.weight - a.weight).slice(0, 80);
  if (rows.length < 10) return { complete: false, sampleCount: rows.length, probabilities: null };
  const totals = Object.fromEntries(handicapLabels.map((label) => [label, 0]));
  rows.forEach((row) => { totals[row.result] += row.weight; });
  return { complete: true, sampleCount: rows.length, probabilities: normalizeProbabilities(handicapLabels.map((label) => totals[label])) };
}

function jointDirectionHandicapDecision(scoreRows, directionProbabilities, handicapProbabilities, handicap) {
  const scoreTotal = scoreRows.reduce((sum, row) => sum + Number(row.probability || 0), 0) || 1;
  const joint = new Map();
  for (const row of scoreRows) {
    const key = `${scoreResult(row)}|${handicapResult(row, handicap)}`;
    joint.set(key, (joint.get(key) || 0) + Number(row.probability || 0) / scoreTotal);
  }
  const candidates = [];
  resultLabels.forEach((direction, directionIndex) => handicapLabels.forEach((handicapLabel, handicapIndex) => {
    const key = `${direction}|${handicapLabel}`;
    const scoreProbability = joint.get(key) || 0;
    if (scoreProbability <= 0) return;
    const marginalProduct = directionProbabilities[directionIndex] * handicapProbabilities[handicapIndex];
    candidates.push({ direction, handicapPick: handicapLabel, scoreProbability, marginalProduct, score: scoreProbability * 0.65 + marginalProduct * 0.35 });
  }));
  candidates.sort((a, b) => b.score - a.score);
  return { selected: candidates[0] || null, candidates };
}

function totalGoalsPick(rows) {
  const totals = new Map();
  for (const row of rows) totals.set(row.home + row.away, (totals.get(row.home + row.away) || 0) + row.probability);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([goals]) => `${goals >= 7 ? "7+" : goals}球`).join("/");
}

function matchType(rows) {
  const probabilityTotal = rows.reduce((sum, row) => sum + Number(row.probability || 0), 0) || 1;
  const average = rows.reduce((sum, row) => sum + (row.home + row.away) * row.probability, 0) / probabilityTotal;
  return average < 1.9 ? "闷局" : average < 2.9 ? "常规局" : average < 3.8 ? "开放局" : "打花局";
}

export function researchTemplate(match = {}) {
  const evidenceItems = Object.fromEntries(RESEARCH_KEYS.map((key) => [key, { status: "MISSING", evidenceGrade: "", summary: "", capturedAt: "", observedAt: "", sources: [], impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 } }]));
  return {
    match: { matchId: match.matchId || "", league: match.league || "", home: match.home || "", away: match.away || "", kickoffTime: match.kickoffTime || "", competitionStage: match.competitionStage || match.stage || match.round || "" },
    competitionStage: "",
    tieContext: { isTwoLeg: false, legNumber: null, aggregateHomeBeforeMatch: null, aggregateAwayBeforeMatch: null, leaderNeedsGoalDifference: false, trailingSideSustainedThreat: false, trailingSideCollapseRisk: false },
    generatedAt: new Date().toISOString(),
    ...evidenceItems,
    teamState: { ...evidenceItems.teamState, recentMatches: [] },
    styleMatchup: { ...evidenceItems.styleMatchup, firstGoalSide: "" },
  };
}

export function runUnifiedPrediction(context = {}, options = {}) {
  const match = context.match || {};
  const market = context.market || {};
  const allSamples = Array.isArray(context.samples) ? context.samples : [];
  const samples = allSamples.filter((sample) => sample.league === match.league);
  const beforeDate = dateKey(match.matchDate || match.ticaiDate || match.kickoffTime);
  const seasonLearning = seasonLearningContext(samples, match, beforeDate);
  const marketBaseline = noVig([market.normal?.win, market.normal?.draw, market.normal?.lose]);
  const asOf = context.asOf || new Date().toISOString();
  const research = researchAudit(context.research, asOf);
  const motivationSummary = context.research?.motivation?.summary || "";
  const tieAudit = twoLegContextAudit(context, motivationSummary);
  const stageAudit = competitionStageAudit(context, tieAudit);
  const leagueLearning = leagueLearningProfile(match.league);
  const verifiedRecentMatches = Array.isArray(context.research?.teamState?.recentMatches)
    ? context.research.teamState.recentMatches
    : [];
  const baseXg = expectedGoals(samples, match.home, match.away, beforeDate, [...allSamples, ...verifiedRecentMatches], match.league);
  const preControlXg = {
    home: Math.max(0.2, baseXg.home + research.adjustment.xgHome + leagueLearning.xg.home),
    away: Math.max(0.2, baseXg.away + research.adjustment.xgAway + leagueLearning.xg.away),
  };
  const leadControl = twoLegLeadControlAudit(tieAudit, { ...(context.research || {}), tieContext: context.tieContext || context.research?.tieContext || {} }, preControlXg);
  const xg = {
    ...baseXg,
    home: leadControl.after.home,
    away: leadControl.after.away,
  };
  const learningSignals = leagueLearningSignals(match.league, market, xg);
  const poissonScores = applyLeagueScoreLearning(scoreGrid(xg), leagueLearning, learningSignals);
  const formBaseline = formProbabilities(xg.homeRows, xg.awayRows);
  const historicalScores = historicalScoreDistribution(samples, market);
  const scoreModel = blendScoreDistribution(poissonScores, market.scoreOdds || [], historicalScores, seasonLearning);
  const scores = scoreModel.rows;
  // V4 stable contract: all four markets share one joint score distribution.
  // Sporttery prices calibrate at a bounded weight and never replace missing fundamentals.
  const scoreProbabilities = resultFromScores(scores);
  const baselineParts = [
    { label: "joint-score-model", weight: 0.85, values: scoreProbabilities },
    marketBaseline ? { label: "sporttery-wdl-calibration", weight: 0.15, values: marketBaseline.probabilities } : null,
  ].filter(Boolean);
  const weightTotal = baselineParts.reduce((sum, part) => sum + part.weight, 0);
  const baselineProbabilities = normalizeProbabilities(resultLabels.map((_, index) => baselineParts.reduce((sum, part) => sum + part.values[index] * part.weight, 0) / weightTotal));
  const preScenarioProbabilities = normalizeProbabilities(baselineProbabilities.map((value, index) => value + [research.adjustment.home, research.adjustment.draw, research.adjustment.away][index] * 0.25 + tieAudit.ninetyMinuteAdjustment[index]));
  // The two official exact-score picks maximize cumulative coverage from the
  // calibrated joint distribution. They may share the same W/D/L direction.
  const topScores = selectOfficialScores(scores);
  const scenarioDirectionProbabilities = resultFromScores(topScores);
  const probabilities = normalizeProbabilities(preScenarioProbabilities.map((value, index) => value * 0.8 + scenarioDirectionProbabilities[index] * 0.2));
  const rankedResults = resultLabels.map((label, index) => ({ label, text: resultText[label], probability: probabilities[index] })).sort((a, b) => b.probability - a.probability);
  const totalModel = totalGoalModel(scores, market.totalGoalsOdds || []);
  const movement = oddsMovementAudit(context.oddsHistory);
  const sampleGate = samples.length >= 10;
  const oddsGate = Boolean(marketBaseline);
  const scoreGate = topScores.length === 2 && topScores.every((row) => row.probability > 0);
  let handicapMapped = topScores.map((row) => ({ score: row.score, result: handicapResult(row, match.handicap) }));
  const handicapScoreProbabilities = handicapProbabilitiesFromScores(scores, match.handicap);
  const handicapMarket = noVig([market.handicapOdds?.win, market.handicapOdds?.draw, market.handicapOdds?.lose]);
  const handicapHistory = historicalHandicapDistribution(samples, market, match.handicap);
  const handicapParts = [
    { label: "joint-score-model", weight: 0.75, probabilities: handicapScoreProbabilities },
    handicapHistory.complete ? { label: "historical-similar", weight: 0.15, probabilities: handicapHistory.probabilities } : null,
    handicapMarket ? { label: "sporttery-handicap-calibration", weight: 0.1, probabilities: handicapMarket.probabilities } : null,
  ].filter(Boolean);
  const handicapWeightTotal = handicapParts.reduce((sum, part) => sum + part.weight, 0);
  const handicapProbabilities = normalizeProbabilities(handicapLabels.map((_, index) => handicapParts.reduce((sum, part) => sum + part.probabilities[index] * part.weight, 0) / handicapWeightTotal));
  const rankedHandicap = handicapLabels.map((label, index) => ({ label, probability: handicapProbabilities[index] })).sort((a, b) => b.probability - a.probability);
  const jointDecision = jointDirectionHandicapDecision(scores, probabilities, handicapProbabilities, match.handicap);
  const independentDirectionLeader = rankedResults[0].label;
  const independentHandicapLeader = rankedHandicap[0]?.label || "待判";
  const independentPair = jointDecision.candidates.find((item) => item.direction === independentDirectionLeader && item.handicapPick === independentHandicapLeader) || { direction: independentDirectionLeader, handicapPick: independentHandicapLeader, scoreProbability: 0, marginalProduct: 0, score: 0 };
  // Compatibility alone never changes a pick. When independent leaders conflict,
  // the shared score model acts as an evidence arbiter and ranks all supported
  // pairs by joint score mass plus the two independent marginal probabilities.
  const conditionalDirectionCandidates = jointDecision.candidates
    .filter((item) => item.direction === independentDirectionLeader)
    .sort((left, right) => right.score - left.score);
  const resolvedPair = independentPair.scoreProbability > 0 ? independentPair : conditionalDirectionCandidates[0];
  const selectedDirection = resolvedPair?.direction || independentDirectionLeader;
  const handicapPick = resolvedPair?.handicapPick || independentHandicapLeader;
  const evidenceDirectionConflict = evidenceDirectionConflictAudit({
    marketBaseline,
    tieAudit,
    research: context.research || {},
    selectedDirection,
    auditedResearch: research,
  });
  const handicapDecision = handicapDecisionAudit(rankedHandicap, handicapPick);
  const jointCompatibility = Boolean(resolvedPair && resolvedPair.scoreProbability > 0);
  const jointResolutionApplied = selectedDirection !== independentDirectionLeader || handicapPick !== independentHandicapLeader;
  const selectedTotalKeys = String(totalModel.pick || "").match(/(?:[0-6]|7\+)/g) || [];
  const coversSelectedTotal = (row) => selectedTotalKeys.includes(row.home + row.away >= 7 ? "7+" : String(row.home + row.away));
  handicapMapped = topScores.map((row) => ({ score: row.score, result: handicapResult(row, match.handicap) }));
  const scenarioTotalsCovered = topScores.some(coversSelectedTotal);
  const scenarioHandicapCovered = handicapMapped.some((row) => row.result === handicapPick);
  const scoreCoverageOptimized = topScores.length === 2
    && topScores.every((row, index) => row.score === scores[index]?.score)
    && topScores[0].score !== topScores[1].score;
  const handicapIndependent = Boolean(handicapMarket && handicapParts.length >= 2 && rankedHandicap[0]?.probability > 0);
  const conflict = rankedResults[0].probability - rankedResults[1].probability < 0.06;
  const marketRanked = marketBaseline
    ? resultLabels.map((label, index) => ({ label, probability: marketBaseline.probabilities[index] })).sort((a, b) => b.probability - a.probability)
    : [];
  const drawEvidenceCount = research.items.filter((item) => item.complete && Number(item.impact?.draw || 0) - Number(item.impact?.[marketRanked[0]?.label?.toLowerCase()] || 0) >= 0.02).length;
  const drawOverrideNeeded = rankedResults[0].label === "DRAW" && marketRanked[0]?.label !== "DRAW" && marketRanked[0]?.probability - (marketBaseline?.probabilities[1] || 0) >= 0.12;
  const drawOverrideJustified = !drawOverrideNeeded || drawEvidenceCount >= 2;
  const counterScriptDiverges = topScores.length === 2 && scoreResult(topScores[0]) !== scoreResult(topScores[1]);
  const oppositeWinPathChecked = !["HOME", "AWAY"].includes(selectedDirection)
    || Boolean(scores.find((row) => scoreResult(row) === (selectedDirection === "HOME" ? "AWAY" : "HOME")));
  const secondScenarioInProbability = Boolean(topScores[1])
    && scenarioDirectionProbabilities[resultLabels.indexOf(scoreResult(topScores[1]))] > 0;
  const selectedDirectionProbability = probabilities[resultLabels.indexOf(selectedDirection)] || 0;
  const selectedOppositeDirection = selectedDirection === "HOME" ? "AWAY" : selectedDirection === "AWAY" ? "HOME" : null;
  const selectedOppositeProbability = selectedOppositeDirection ? probabilities[resultLabels.indexOf(selectedOppositeDirection)] : 0;
  const selectedOppositeScore = selectedOppositeDirection && selectedOppositeProbability >= 0.12
    ? scores.find((row) => scoreResult(row) === selectedOppositeDirection && !topScores.some((official) => official.score === row.score))
    : null;
  const riskScore = selectedOppositeScore
    || scores.find((row) => scoreResult(row) !== selectedDirection && !topScores.some((official) => official.score === row.score))
    || scores.find((row) => !topScores.some((official) => official.score === row.score));
  const riskDirection = scoreResult(riskScore);
  const riskDirectionProbability = probabilities[resultLabels.indexOf(riskDirection)] || 0;
  const riskScoreProbability = Number(riskScore?.probability || 0);
  const riskScenarioAvailable = Boolean(riskScore && riskScoreProbability > 0);
  const riskPathRisk = riskScenarioAvailable && riskDirection !== selectedDirection
    ? Math.min(12, Math.round(riskDirectionProbability * 12 + riskScoreProbability * 35))
    : 0;
  // Legacy names remain in the contract for old consumers, but now describe
  // the independent risk scenario rather than the second official score.
  const counterDirectionProbability = riskDirectionProbability;
  const counterScoreProbability = riskScoreProbability;
  const counterPathRisk = riskPathRisk;
  const newestHomeForm = xg.homeRows[0]?.date || "";
  const newestAwayForm = xg.awayRows[0]?.date || "";
  // These leagues pause across the 2026 World Cup window. Keep the normal
  // 21-day gate outside the documented restart period, and only allow complete
  // pre-match research to bridge the scheduled break. This never treats an old
  // season as current form and expires after the restart window.
  const worldCupRestartBridge = ["挪超", "巴西甲", "美职"].includes(match.league)
    && beforeDate >= "2026-07-11"
    && beforeDate <= "2026-07-24"
    && research.complete;
  const formFreshnessDays = worldCupRestartBridge ? 60 : 21;
  const recentFormFresh = daysBetween(newestHomeForm, beforeDate) <= formFreshnessDays && daysBetween(newestAwayForm, beforeDate) <= formFreshnessDays;
  const crossLeagueStrengthNormalized = xg.crossLeagueNormalization.complete;
  const fundamentalDataComplete = xg.homeRows.length >= 5 && xg.awayRows.length >= 5 && Boolean(formBaseline) && recentFormFresh && crossLeagueStrengthNormalized;
  const evidenceCompleteness = RESEARCH_KEYS.filter((key) => research.items.find((item) => item.key === key)?.complete).length / RESEARCH_KEYS.length;
  const unavailableNonDecisiveCount = research.items.filter((item) => item.nonDecisiveUnavailable).length;
  const sourceCapturedAt = Date.parse(context.sourceCapturedAt || "");
  const kickoffAt = Date.parse(match.kickoffTime || `${beforeDate}T23:59:59+08:00`);
  const temporalIntegrity = !Number.isFinite(sourceCapturedAt) || !Number.isFinite(kickoffAt) || sourceCapturedAt <= kickoffAt;
  const dataQualityScore = Math.round(
    (fundamentalDataComplete ? 35 : Math.min(25, (xg.homeRows.length + xg.awayRows.length) * 2.5))
    + Math.min(25, samples.length / 2)
    + evidenceCompleteness * 25 - unavailableNonDecisiveCount * 4
    + (movement.complete ? 10 : 0)
    + (temporalIntegrity ? 5 : 0)
  );
  const normalOddsComplete = Boolean(marketBaseline);
  const handicapOddsComplete = Boolean(handicapMarket);
  const scoreMarketComplete = scoreModel.marketComplete;
  const totalsMarketComplete = totalModel.marketComplete;
  const scoreIndependent = scoreModel.parts.length >= 2;
  const totalsIndependent = totalModel.components.length >= 2;
  const stepScores = [
    { id: 1, key: "spReview", title: "当前胜平负 SP 复核", score: normalOddsComplete ? 100 : 0, passed: normalOddsComplete },
    { id: 2, key: "rulesMotivation", title: "赛事规则/动机", score: research.items.find((item) => item.key === "motivation")?.complete && tieAudit.complete && stageAudit.complete ? 100 : 0, passed: Boolean(research.items.find((item) => item.key === "motivation")?.complete) && tieAudit.complete && stageAudit.complete },
    { id: 3, key: "teamState", title: "球队状态", score: fundamentalDataComplete ? 100 : Math.round(Math.min(90, (xg.homeRows.length + xg.awayRows.length) * 9)), passed: fundamentalDataComplete && ["teamState", "injuries", "expectedLineups"].every((key) => research.items.find((item) => item.key === key)?.complete) },
    { id: 4, key: "styleMatchup", title: "风格对位", score: research.items.find((item) => item.key === "styleMatchup")?.complete ? 100 : 0, passed: Boolean(research.items.find((item) => item.key === "styleMatchup")?.complete) },
    { id: 5, key: "marketSamples", title: "盘口和样本", score: Math.round((normalOddsComplete ? 40 : 0) + Math.min(40, samples.length / 2) + (recentFormFresh ? 20 : 0)), passed: normalOddsComplete && samples.length >= 30 && recentFormFresh },
    { id: 6, key: "stateTransfer", title: "状态转移", score: movement.complete && research.items.find((item) => item.key === "marketNews")?.complete ? 100 : 0, passed: movement.complete && Boolean(research.items.find((item) => item.key === "marketNews")?.complete) },
    { id: 7, key: "scoreTotals", title: "比分/总进球独立闸门", score: [scoreGate, scoreIndependent, totalsIndependent, scoreCoverageOptimized, scenarioTotalsCovered].filter(Boolean).length * 20, passed: scoreGate && scoreMarketComplete && totalsMarketComplete && scoreIndependent && totalsIndependent && scoreCoverageOptimized && scenarioTotalsCovered },
    { id: 8, key: "handicapGate", title: "让球独立闸门", score: handicapIndependent ? 100 : 0, passed: handicapIndependent },
    { id: 9, key: "failureValue", title: "失败方式和值过滤", score: research.complete && drawOverrideJustified && evidenceDirectionConflict.resolved ? 100 : 0, passed: research.complete && drawOverrideJustified && evidenceDirectionConflict.resolved },
  ].map((step) => ({ ...step, score: round(step.score, 0) }));
  const tenStepPassed = stepScores.every((step) => step.passed);
  stepScores.push({ id: 10, key: "finalLock", title: "最终锁版", score: tenStepPassed ? 100 : 0, passed: tenStepPassed });
  const gates = {
    completeOdds: oddsGate,
    fundamentalData: fundamentalDataComplete,
    crossLeagueStrengthNormalized,
    temporalIntegrity,
    historicalSamples: sampleGate,
    oddsMovement: movement.complete,
    preMatchResearch: research.complete,
    scoreValidation: scoreGate,
    scoreIndependent,
    totalsIndependent,
    decisionConflictResolved: !conflict || research.complete,
    evidenceDirectionConflictResolved: evidenceDirectionConflict.resolved,
    handicapIndependent,
    handicapDecisionConflictResolved: !handicapDecision.materialConflict,
    jointCompatibility,
    scenarioTotalsCovered,
    scenarioHandicapCovered,
    scoreCoverageOptimized,
    riskScenarioAvailable,
    oppositeWinPathChecked,
    secondScenarioInProbability,
    twoLegContextComplete: tieAudit.complete,
    competitionStageConsistent: stageAudit.complete,
    drawOverrideJustified,
    recentFormFresh,
    tenStepMechanism: tenStepPassed,
  };
  const allGatesPass = Object.values(gates).every(Boolean);
  const requestedFinal = String(options.lockType || "PRE_LOCK").toUpperCase() === "FINAL_LOCK";
  const lockType = requestedFinal && allGatesPass ? "FINAL_LOCK" : "PRE_LOCK";
  const selectedHandicapProbability = handicapProbabilities[handicapLabels.indexOf(handicapPick)] || 0;
  const selectedTotalProbability = Math.max(...selectedTotalKeys.map((key) => Number(totalModel.probabilities.get(key) || 0)), 0);
  const selectedScenarioProbability = topScores.reduce((sum, row) => sum + Number(row.probability || 0), 0);
  const marketConfidenceBase = selectedDirectionProbability * 65 + selectedHandicapProbability * 20 + selectedTotalProbability * 10 + selectedScenarioProbability * 5;
  const confidence = Math.round(Math.max(0, Math.min(100, marketConfidenceBase - riskPathRisk - leagueLearning.confidencePenalty - (conflict ? 8 : 0) + (research.complete ? 5 : -10) + (movement.complete ? 3 : -5))));
  const advice = !allGatesPass ? "观察" : confidence >= 62 ? "主打" : confidence >= 55 ? "可选" : confidence >= 48 ? "谨慎" : "跳过";
  return {
    contractVersion: "UNIFIED_PREDICTION_V4",
    generatedAt: new Date().toISOString(),
    match,
    requestedLockType: requestedFinal ? "FINAL_LOCK" : "PRE_LOCK",
    lockType,
    modelVersion: match.league === "世界杯" ? "V4-UNIFIED" : "V1-UNIFIED",
    featureSet: {
      market: marketBaseline,
      baselineParts: baselineParts.map((part) => ({ label: part.label, weight: part.weight, probabilities: part.values.map((value) => round(value)) })),
      probabilities: Object.fromEntries(resultLabels.map((label, index) => [label, round(probabilities[index])])),
      baselineProbabilities: Object.fromEntries(resultLabels.map((label, index) => [label, round(baselineProbabilities[index])])),
      xg: { home: round(xg.home, 2), away: round(xg.away, 2) },
      venueProfile: xg.venueProfile,
      leagueProfile: xg.leagueProfile,
      crossLeagueNormalization: xg.crossLeagueNormalization,
      leagueLearning: { version: leagueLearning.version, reviewSampleCount: leagueLearning.reviewSampleCount, xgAdjustment: leagueLearning.xg, confidencePenalty: leagueLearning.confidencePenalty, appliedSignals: learningSignals, rules: leagueLearning.rules },
      seasonLearning,
      recentForm: { home: xg.homeRows, away: xg.awayRows, verifiedEvidenceRows: verifiedRecentMatches.length, lookupMode: "SAME_LEAGUE_MARKET_PLUS_CROSS_LEAGUE_TEAM_FORM" },
      recentFormFresh,
      fundamentalDataComplete,
      dataQuality: { score: dataQualityScore, grade: dataQualityScore >= 85 ? "A" : dataQualityScore >= 70 ? "B" : dataQualityScore >= 55 ? "C" : "D", temporalIntegrity, evidenceCompleteness: round(evidenceCompleteness), unavailableNonDecisiveCount, minimumRecentMatchesPerTeam: 5 },
      sampleCount: samples.length,
      oddsMovement: movement,
      research,
      tieContext: { ...tieAudit, leadControl, advancementProbabilities: advancementDistribution(scores, tieAudit), resultScopes: ["NINETY_MINUTE_WDL", "MATCH_GOAL_DIFFERENCE", "TIE_ADVANCEMENT"] },
      competitionStage: stageAudit,
      handicap: {
        line: number(String(match.handicap ?? "0").replace("+", "")) ?? 0,
        probabilities: Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapProbabilities[index])])),
        scoreGridProbabilities: Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapScoreProbabilities[index])])),
        marketProbabilities: handicapMarket ? Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapMarket.probabilities[index])])) : null,
        historicalProbabilities: handicapHistory.probabilities ? Object.fromEntries(handicapLabels.map((label, index) => [label, round(handicapHistory.probabilities[index])])) : null,
        historicalSampleCount: handicapHistory.sampleCount,
        components: handicapParts.map((part) => ({ label: part.label, weight: part.weight })),
      },
      score: {
        components: scoreModel.parts,
        historicalSampleCount: scoreModel.historicalSampleCount,
        marketComplete: scoreModel.marketComplete,
        selectionVersion: "SCORE_COVERAGE_2026_R1",
        selectionPolicy: "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY",
        officialCoverageProbability: round(selectedScenarioProbability),
        topCandidates: scores.slice(0, 8).map((row) => ({ score: row.score, probability: round(row.probability), direction: scoreResult(row) })),
      },
      totals: { probabilities: Object.fromEntries(totalModel.probabilities), components: totalModel.components, marketComplete: totalModel.marketComplete },
      jointDecision: { selected: resolvedPair, candidateCount: jointDecision.candidates.length, independentDirectionLeader, independentHandicapLeader, independentPairCompatible: independentPair.scoreProbability > 0, resolutionApplied: jointResolutionApplied, directionPreserved: selectedDirection === independentDirectionLeader, handicapDecisionAudit: handicapDecision, role: "CONDITIONAL_HANDICAP_EVIDENCE_AFTER_INDEPENDENT_CONFLICT" },
      scenarioDirectionCalibration: { weight: 0.2, preScenario: Object.fromEntries(resultLabels.map((label, index) => [label, round(preScenarioProbabilities[index])])), scenarioOnly: Object.fromEntries(resultLabels.map((label, index) => [label, round(scenarioDirectionProbabilities[index])])), applied: true },
      evidenceDirectionConflict,
      evidenceDrivenRiskChallenger: {
        mode: evidenceDirectionConflict.consensusCount >= 2 ? "CHALLENGER_SHADOW_35" : "CHAMPION_BASELINE_20",
        championWeight: 0.2,
        challengerWeight: evidenceDirectionConflict.challengerRiskWeight,
        promotedToChampion: false,
        promotionPolicy: "至少30至50场影子样本且四项命中率与样本外概率损失不退化",
      },
    },
    scenarioSet: topScores.map((row, index) => ({ rank: index + 1, score: row.score, probability: round(row.probability), direction: scoreResult(row), directionProbability: round(probabilities[resultLabels.indexOf(scoreResult(row))] || 0), handicapResult: handicapMapped[index]?.result, role: index === 0 ? "PRIMARY_COVERAGE_PATH" : "SECONDARY_COVERAGE_PATH" })),
    riskScenario: riskScore ? {
      score: riskScore.score,
      probability: round(riskScoreProbability),
      direction: riskDirection,
      directionProbability: round(riskDirectionProbability),
      handicapResult: handicapResult(riskScore, match.handicap),
      role: "INDEPENDENT_RISK_PATH",
      occupiesOfficialScoreSlot: false,
    } : null,
    tenStepResult: { passed: tenStepPassed, steps: stepScores, averageScore: round(stepScores.reduce((sum, step) => sum + step.score, 0) / stepScores.length, 1) },
    gateResult: { passed: allGatesPass, gates, blockers: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name) },
    backtestContract: { probabilityFields: ["HOME", "DRAW", "AWAY"], metrics: ["winDrawLoseSingleHit", "handicapSingleHit", "totalGoalsDoubleHit", "scoreDoubleHit", "officialScoreCoverageProbability", "brierScore", "logLoss", "calibrationBin"], resultScope: "90_MINUTES", sampleVersion: context.sampleVersion || "rolling-current", caseReuse: "PREFERRED_FINAL_LOCK_ONLY", immutablePreMatchSnapshot: true, scorePolicies: ["LEGACY_MAIN_PLUS_COUNTER", "TOP_TWO_GLOBAL", "TOP_TWO_LEAGUE_SEASON_CALIBRATED"] },
    lifecycleContract: { version: "STABLE_2026_V1", states: ["DATA_PENDING", "DATA_REPAIR", "MODEL_READY", "CONSISTENCY_CHECK", "FINAL_LOCK", "RESULT_SETTLED", "BASE_CASE"], currentState: lockType === "FINAL_LOCK" ? "FINAL_LOCK" : fundamentalDataComplete && research.complete ? "CONSISTENCY_CHECK" : "DATA_REPAIR", champion: "UNIFIED_PREDICTION_V4", challengerPolicy: "league score priors, bounded current-season score calibration, and evidence-driven 35% risk-path shadow; promote only when four hit-rate components and out-of-sample probability losses do not regress" },
    modelLessons: {
      version: "LESSONS_2026-07-16_REVIEW_GATES_R6",
      rules: [
        "让球不穿不得自动推翻胜平负方向",
        "最终方向按全部场景概率汇总，不按单一主比分决定",
        "两个正式比分必须选择联赛与赛季校准后联合概率最高的两个落点，允许同一赛果方向",
        "风险剧本必须独立记录，不得强占第二个正式比分名额",
        "当前赛季至少30场后才允许以有上限权重校准比分分布，小样本只记录不校准",
        "明显市场热门改选平局至少需要两项独立量化证据",
        "状态、阵容和市场消息必须按各自新鲜度验收",
        "PRE_LOCK不计正式模型命中率",
        "体彩赔率只做有上限的校准，不得替代缺失的基本面",
        "胜平负、让球、总进球和比分必须共享同一联合比分分布",
        "每队至少五场新鲜赛前比赛数据，缺失时进入DATA_REPAIR",
        "伤停和预计首发必须先搜索；未发布时只允许记录NOT_PUBLISHED、中性0并降低数据质量，不得虚构",
        "只有preferred FINAL_LOCK赛后结算才能生成并复用Base Case",
        "两个正式比分共同进入方向概率；独立风险剧本只进入风险诊断和置信扣分",
        "联赛强弱差必须结合主队主场、客队客场的攻防均值与方差，并用联赛开放度校正xG",
        "四个市场必须共享联合比分分布并在锁版前交叉验证",
        "方向概率与净胜球概率必须分层，胜平负不得直接映射让球",
        "主队和客队的预期进球、零封和方差必须分别建模",
        "置信等级必须按联赛和市场回测校准，不得仅按通过闸门数量决定",
        "第二正式比分必须是第二概率落点，不得固定为1-1或固定反向赛果",
        "主选主胜或客胜时必须在独立风险剧本中显式检查相反胜负的可验证路径，不能永远只用平局充当风险",
        "第二比分按20%场景权重回灌胜平负概率并同步影响最终方向与置信等级",
        "两回合赛事必须结构化计算90分钟胜平负、本场净胜球差和总比分晋级状态，缺失时不得进入FINAL_LOCK",
        "跳过场不计正式投注命中率，但必须继续验票胜平负、让球、总进球和比分组件，禁止VOID被记为命中正样本",
        "联赛先验进入比分分布；当前赛季满30场后只允许12%有上限比分校准，扩大权重仍须四项命中率和样本外概率损失不退化",
        "最终让球若偏离独立概率第一项超过10个百分点，必须阻断FINAL_LOCK而不是由联合兼容强行覆盖",
        "跨联赛近期状态进入xG前必须按联赛强度、对手质量、正式或友谊赛和样本时效归一化，缺失结构化因子时不得使用",
        "市场方向、风格层首球方和两回合追分暴露至少两项支持反向路径时，必须由两项独立量化证据解释，否则阻断FINAL_LOCK",
        "两回合领先方缺少继续扩大比分证据时，对其后续进球xG执行12%衰减，胜负方向与三球以上幅度分开判断",
        "赛事阶段、赛制识别和两回合状态必须一致，不一致时不得进入FINAL_LOCK",
        "证据支持的独立风险路径先以35% Challenger影子权重回测，30至50场验证前不得直接改写Champion",
      ],
      leagueSpecific: { league: match.league || "通用", version: leagueLearning.version, reviewSampleCount: leagueLearning.reviewSampleCount, rules: leagueLearning.rules },
      seasonSpecific: seasonLearning,
      evidenceDirectionConflict,
      crossLeagueNormalization: xg.crossLeagueNormalization,
      competitionStage: stageAudit,
      twoLegLeadControl: leadControl,
      drawOverrideNeeded,
      drawEvidenceCount,
      counterScriptDiverges,
      counterPathRisk,
      counterDirectionProbability: round(counterDirectionProbability),
      counterScoreProbability: round(counterScoreProbability),
      scoreCoverageOptimized,
      officialScoreDirectionsDiverge: counterScriptDiverges,
      riskPathRisk,
      riskDirectionProbability: round(riskDirectionProbability),
      riskScoreProbability: round(riskScoreProbability),
    },
    finalDecision: {
      winDrawLose: resultText[selectedDirection],
      recommendationSide: selectedDirection,
      handicapPick,
      totalGoalsPick: totalModel.pick,
      scores: topScores.map((row) => row.score),
      scoreSelectionPolicy: "TOP_TWO_LEAGUE_SEASON_CALIBRATED_JOINT_PROBABILITY",
      riskScenario: riskScore?.score || "",
      matchType: matchType(topScores),
      confidence,
      confidenceComponents: { direction: round(selectedDirectionProbability), handicap: round(selectedHandicapProbability), totalGoals: round(selectedTotalProbability), scorePaths: round(selectedScenarioProbability) },
      confidenceAdjustments: { riskPathRisk: -riskPathRisk, counterPathRisk: -counterPathRisk, leagueLearning: -leagueLearning.confidencePenalty },
      advice,
      conflict,
    },
  };
}

export { RESEARCH_KEYS };
