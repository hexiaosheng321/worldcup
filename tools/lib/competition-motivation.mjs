const EMPTY_SIDE = {
  team: "",
  rank: null,
  points: null,
  played: null,
  goalDifference: null,
  pointsToTitle: null,
  pointsToEurope: null,
  pointsToQualification: null,
  pointsToSafety: null,
  pointsToRelegation: null,
  target: "",
  zone: "",
  mustWin: null,
  drawAcceptable: null,
  lossTolerable: null,
};

function text(value = "") {
  return String(value ?? "").trim();
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  return null;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && text(value) !== "");
}

function canonicalType(value = "", stage = "") {
  const raw = `${text(value)} ${text(stage)}`.toUpperCase();
  if (/LEAGUE|联赛|韩职|瑞超|瑞典超|挪超|芬超|英超|西甲|意甲|德甲|法甲|MLS|J[1２]|K\s*LEAGUE|ALLSVENSKAN|ELITESERIEN|VEIKKAUSLIIGA/.test(raw) && !/CUP|杯赛|淘汰|QUALIF|资格/.test(raw)) return "LEAGUE";
  if (/QUALIF|资格|预选/.test(raw)) return "KNOCKOUT_QUALIFYING";
  if (/GROUP|小组/.test(raw)) return "GROUP_STAGE";
  if (/KNOCKOUT|淘汰|PLAYOFF|附加赛|ROUND[_\s-]*OF|FINAL|决赛|半决赛|八强|十六强/.test(raw)) return "KNOCKOUT";
  if (/CUP|杯赛|杯/.test(raw)) return "CUP";
  return "UNKNOWN";
}

function sideStanding(raw = {}, fallbackTeam = "") {
  const source = raw || {};
  return {
    ...EMPTY_SIDE,
    team: text(firstValue(source.team, source.name, fallbackTeam)),
    rank: number(firstValue(source.rank, source.position)),
    points: number(source.points),
    played: number(firstValue(source.played, source.playedGames)),
    goalDifference: number(firstValue(source.goalDifference, source.goalDiff)),
    pointsToTitle: number(source.pointsToTitle),
    pointsToEurope: number(source.pointsToEurope),
    pointsToQualification: number(source.pointsToQualification),
    pointsToSafety: number(source.pointsToSafety),
    pointsToRelegation: number(source.pointsToRelegation),
    target: text(firstValue(source.target, source.objective, source.targetStatus)),
    zone: text(source.zone),
    mustWin: booleanOrNull(source.mustWin),
    drawAcceptable: booleanOrNull(source.drawAcceptable),
    lossTolerable: booleanOrNull(source.lossTolerable),
  };
}

function formatStanding(side = {}) {
  const parts = [];
  if (side.team) parts.push(side.team);
  if (side.rank !== null) parts.push(`第${side.rank}名`);
  if (side.points !== null) parts.push(`${side.points}分`);
  if (side.played !== null) parts.push(`${side.played}场`);
  if (side.goalDifference !== null) parts.push(`净胜${side.goalDifference}`);
  return parts.join("，") || "积分榜信息缺失";
}

function resultToleranceFromExplicit(side = {}) {
  const target = side.target.toUpperCase();
  if (side.mustWin === true || /MUST[_\s-]*WIN|必须赢|必须取胜|必须拿下/.test(target)) return "MUST_WIN";
  if (side.lossTolerable === true || /LOSS[_\s-]*TOLERABLE|输球可接受|输球无碍/.test(target)) return "LOSS_TOLERABLE";
  if (side.drawAcceptable === true || /DRAW[_\s-]*ACCEPTABLE|平局可接受|接受平局/.test(target)) return "DRAW_ACCEPTABLE";
  return "UNKNOWN";
}

function motivationLevel(tolerance = "UNKNOWN") {
  if (tolerance === "MUST_WIN") return "HIGH";
  if (tolerance === "DRAW_ACCEPTABLE") return "MEDIUM";
  if (tolerance === "LOSS_TOLERABLE") return "LOW";
  return "UNKNOWN";
}

function toleranceText(value = "UNKNOWN") {
  return {
    MUST_WIN: "90分钟内必须赢球",
    DRAW_ACCEPTABLE: "平局可接受",
    LOSS_TOLERABLE: "输球仍可能不影响目标",
    DRAW_LEADS_TO_EXTRA_TIME: "90分钟平局进入加时/继续比较，不等于直接晋级",
    DRAW_NOT_ENOUGH: "平局不足以完成晋级目标",
    UNKNOWN: "结果容忍度未核验",
  }[value] || "结果容忍度未核验";
}

function knockoutObjectives({ home, away, tie, settlement }) {
  const isSecondLeg = tie.isTwoLeg === true && tie.legNumber === 2;
  const aggregateHome = number(tie.aggregateHomeBeforeMatch);
  const aggregateAway = number(tie.aggregateAwayBeforeMatch);
  if (!isSecondLeg || aggregateHome === null || aggregateAway === null) {
    const homeExplicit = resultToleranceFromExplicit(home);
    const awayExplicit = resultToleranceFromExplicit(away);
    return {
      home: { tolerance: homeExplicit, level: motivationLevel(homeExplicit), rationale: homeExplicit === "UNKNOWN" ? "未核验到两回合当前总比分，不能断言哪一方必须赢。" : "已提供明确的结果目标，按核验事实保留。" },
      away: { tolerance: awayExplicit, level: motivationLevel(awayExplicit), rationale: awayExplicit === "UNKNOWN" ? "未核验到两回合当前总比分，不能断言哪一方必须赢。" : "已提供明确的结果目标，按核验事实保留。" },
      strongerSide: homeExplicit !== "UNKNOWN" && awayExplicit === "UNKNOWN" ? "HOME" : awayExplicit !== "UNKNOWN" && homeExplicit === "UNKNOWN" ? "AWAY" : "UNKNOWN",
      aggregate: null,
    };
  }
  if (aggregateHome < aggregateAway) {
    const margin = aggregateAway - aggregateHome;
    return {
      home: { tolerance: "MUST_WIN", level: "HIGH", rationale: `总比分${aggregateHome}-${aggregateAway}落后，主队90分钟平局不足以晋级。` },
      away: { tolerance: margin >= 2 ? "LOSS_TOLERABLE" : "DRAW_ACCEPTABLE", level: margin >= 2 ? "LOW" : "MEDIUM", rationale: `总比分${aggregateHome}-${aggregateAway}领先，客队${margin >= 2 ? "即使小负仍可能保有晋级余地" : "打平即可晋级"}。` },
      strongerSide: "HOME",
      aggregate: { home: aggregateHome, away: aggregateAway },
    };
  }
  if (aggregateHome > aggregateAway) {
    const margin = aggregateHome - aggregateAway;
    return {
      home: { tolerance: margin >= 2 ? "LOSS_TOLERABLE" : "DRAW_ACCEPTABLE", level: margin >= 2 ? "LOW" : "MEDIUM", rationale: `总比分${aggregateHome}-${aggregateAway}领先，主队${margin >= 2 ? "即使小负仍可能保有晋级余地" : "打平即可晋级"}。` },
      away: { tolerance: "MUST_WIN", level: "HIGH", rationale: `总比分${aggregateHome}-${aggregateAway}落后，客队90分钟平局不足以晋级。` },
      strongerSide: "AWAY",
      aggregate: { home: aggregateHome, away: aggregateAway },
    };
  }
  const drawResult = settlement === "NINETY_MINUTE_ONLY" ? "DRAW_NOT_ENOUGH" : "DRAW_LEADS_TO_EXTRA_TIME";
  return {
    home: { tolerance: drawResult, level: "HIGH", rationale: "两回合总比分打平，90分钟平局不能直接完成晋级，双方都更需要争取胜利。" },
    away: { tolerance: drawResult, level: "HIGH", rationale: "两回合总比分打平，90分钟平局不能直接完成晋级，双方都更需要争取胜利。" },
    strongerSide: "BALANCED",
    aggregate: { home: aggregateHome, away: aggregateAway },
  };
}

function leagueObjectives(home, away) {
  const homeExplicit = resultToleranceFromExplicit(home);
  const awayExplicit = resultToleranceFromExplicit(away);
  const homeLevel = motivationLevel(homeExplicit);
  const awayLevel = motivationLevel(awayExplicit);
  const strongerSide = homeLevel === "HIGH" && awayLevel !== "HIGH"
    ? "HOME"
    : awayLevel === "HIGH" && homeLevel !== "HIGH"
      ? "AWAY"
      : homeLevel !== "UNKNOWN" && awayLevel === "UNKNOWN"
        ? "HOME"
        : awayLevel !== "UNKNOWN" && homeLevel === "UNKNOWN"
          ? "AWAY"
          : "BALANCED";
  const rationale = (side, tolerance) => tolerance === "UNKNOWN"
    ? `${formatStanding(side)}；本场胜/平/负对积分分别为+3/+1/+0，但未核验争冠、欧战或保级目标，不能把“必须赢”当作事实。`
    : `${formatStanding(side)}；已核验目标为${toleranceText(tolerance)}。`;
  return {
    home: { tolerance: homeExplicit, level: homeLevel, rationale: rationale(home, homeExplicit) },
    away: { tolerance: awayExplicit, level: awayLevel, rationale: rationale(away, awayExplicit) },
    strongerSide,
    aggregate: null,
  };
}

export function buildCompetitionMotivationContext(input = {}) {
  const match = input.match || {};
  const research = input.research || {};
  const raw = input.competitionContext || research.competitionContext || research.match?.competitionContext || {};
  const tie = input.tieContext || research.tieContext || raw.tieContext || {};
  const football = input.footballDataContext || match.footballDataContext || research.match?.footballDataContext || {};
  const stage = text(firstValue(raw.stage, raw.competitionStage, research.competitionStage?.stage, research.competitionStage, match.competitionStage, match.stage, match.round, football.stage));
  const type = canonicalType(firstValue(raw.type, raw.competitionType, match.competitionType, match.competition, match.league), stage);
  const season = text(firstValue(raw.season, match.season, research.match?.season, football.season, String(match.matchDate || match.kickoffTime || "").slice(0, 4)));
  const round = text(firstValue(raw.round, raw.matchday, match.round, match.matchday, football.matchday));
  const settlement = text(firstValue(raw.settlement, raw.resultSettlement, match.settlement, tie.settlement)).toUpperCase() || (type === "LEAGUE" ? "NINETY_MINUTE_ONLY" : "UNKNOWN");
  const standings = raw.standings || research.standings || football.standings || {};
  const homeRaw = standings.home || standings[match.home] || raw.homeStanding || research.homeStanding || football.homeState || {};
  const awayRaw = standings.away || standings[match.away] || raw.awayStanding || research.awayStanding || football.awayState || {};
  const home = sideStanding(homeRaw, match.home);
  const away = sideStanding(awayRaw, match.away);
  const objectives = type === "LEAGUE" ? leagueObjectives(home, away) : knockoutObjectives({ home, away, tie, settlement });
  const missingEvidence = [];
  if (!type || type === "UNKNOWN") missingEvidence.push("competitionType");
  if (!season) missingEvidence.push("season");
  if (!round) missingEvidence.push("roundOrMatchday");
  if (type === "LEAGUE" && (home.rank === null || home.points === null || away.rank === null || away.points === null)) missingEvidence.push("standings.homeAway");
  if ((type === "KNOCKOUT" || type === "KNOCKOUT_QUALIFYING") && tie.isTwoLeg === true && tie.legNumber === 2 && !objectives.aggregate) missingEvidence.push("aggregateBeforeMatch");
  const evidenceLevel = missingEvidence.length === 0 ? "VERIFIED" : missingEvidence.length <= 2 ? "PARTIAL" : "UNKNOWN";
  const typeText = { LEAGUE: "联赛", CUP: "杯赛", GROUP_STAGE: "小组赛", KNOCKOUT: "淘汰赛", KNOCKOUT_QUALIFYING: "资格赛淘汰赛", UNKNOWN: "赛事类型待核验" }[type] || type;
  const stageText = stage || "轮次待核验";
  const settlementText = settlement === "NINETY_MINUTE_ONLY" ? "体彩胜平负只按90分钟结算" : settlement === "EXTRA_TIME_AND_PENALTIES" ? "晋级可进入加时/点球，但须与90分钟玩法分开" : "90分钟结算规则待核验";
  const summary = `赛事：${season || "赛季待核验"}${match.league ? ` ${match.league}` : ""}，${typeText}，${stageText}${round ? `，第${round}轮/比赛日` : ""}；${settlementText}。${type === "LEAGUE" ? `积分事实：${formatStanding(home)}；${formatStanding(away)}。本场积分变化为胜+3、平+1、负+0。` : objectives.aggregate ? `晋级事实：当前总比分${objectives.aggregate.home}-${objectives.aggregate.away}。` : "晋级事实：当前总比分或回合规则未完整核验。"} 动机判断：主队${toleranceText(objectives.home.tolerance)}（${objectives.home.rationale}）；客队${toleranceText(objectives.away.tolerance)}（${objectives.away.rationale}）；相对更强动机方：${objectives.strongerSide === "HOME" ? "主队" : objectives.strongerSide === "AWAY" ? "客队" : objectives.strongerSide === "BALANCED" ? "双方接近" : "暂不能判断"}。`;
  return {
    version: "COMPETITION_MOTIVATION_CONTEXT_V1",
    evidenceLevel,
    competition: { type, typeText, season, league: text(match.league), stage, round, settlement, settlementText },
    standings: { home, away },
    pointsImpact: type === "LEAGUE" ? { win: 3, draw: 1, loss: 0 } : null,
    tieContext: { isTwoLeg: tie.isTwoLeg === true, legNumber: number(tie.legNumber), aggregateBeforeMatch: objectives.aggregate },
    motivation: objectives,
    missingEvidence,
    summary,
    policy: "FACTS_FIRST_NO_UNVERIFIED_MUST_WIN_CLAIM",
  };
}

export function competitionMotivationSummary(input = {}) {
  return buildCompetitionMotivationContext(input).summary;
}
