function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value = "") {
  return String(value ?? "").trim();
}

function sideLabel(side = "") {
  return side === "HOME" ? "主队" : side === "AWAY" ? "客队" : side === "DRAW" ? "平局" : "未知";
}

function resultCounts(rows = []) {
  const counts = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, btts: 0, over25: 0 };
  rows.forEach((row) => {
    const gf = n(row.gf);
    const ga = n(row.ga);
    if (gf === null || ga === null) return;
    counts.goalsFor += gf;
    counts.goalsAgainst += ga;
    if (gf > ga) counts.wins += 1;
    else if (gf === ga) counts.draws += 1;
    else counts.losses += 1;
    if (ga === 0) counts.cleanSheets += 1;
    if (gf > 0 && ga > 0) counts.btts += 1;
    if (gf + ga >= 3) counts.over25 += 1;
  });
  return counts;
}

function formText(rows = [], counts = resultCounts(rows)) {
  if (!rows.length) return "近5场样本不足";
  return `${counts.wins}胜${counts.draws}平${counts.losses}负，进${counts.goalsFor}球失${counts.goalsAgainst}球`;
}

function styleSignals(rows = [], counts = resultCounts(rows)) {
  if (!rows.length) return { labels: [], evidence: "样本不足，不能判断风格" };
  const size = rows.length;
  const gfAvg = counts.goalsFor / size;
  const gaAvg = counts.goalsAgainst / size;
  const totalAvg = (counts.goalsFor + counts.goalsAgainst) / size;
  const labels = [];
  if (gfAvg >= 1.6) labels.push("进攻倾向");
  if (gaAvg <= 1.0) labels.push("防守稳固");
  if (totalAvg >= 3.0 || counts.over25 / size >= 0.6 || counts.btts / size >= 0.6) labels.push("开放型比赛");
  if (totalAvg <= 2.0 && counts.btts / size <= 0.4) labels.push("低事件/收缩型");
  if (!labels.length) labels.push("攻防中性");
  return {
    labels,
    evidence: `样本场均进球${gfAvg.toFixed(2)}、失球${gaAvg.toFixed(2)}、总进球${totalAvg.toFixed(2)}；BTTS ${counts.btts}/${size}；大2.5 ${counts.over25}/${size}；零封 ${counts.cleanSheets}/${size}`,
  };
}

function normalizeSideState(raw = {}, fallbackRows = []) {
  const rows = Array.isArray(raw.recent) ? raw.recent.slice(0, 5) : fallbackRows.slice(0, 5);
  const counts = resultCounts(rows);
  const style = styleSignals(rows, counts);
  return {
    team: text(raw.team),
    sampleCount: rows.length,
    form: formText(rows, counts),
    counts,
    recent: rows,
    rank: n(raw.rank),
    points: n(raw.points),
    played: n(raw.played),
    style,
    homeRecord: text(raw.homeRecord),
    awayRecord: text(raw.awayRecord),
  };
}

export function buildTeamFormEvidence(input = {}) {
  const source = input.teamState || {};
  const recentForm = input.recentForm || {};
  const home = normalizeSideState(source.homeState || {}, Array.isArray(recentForm.home) ? recentForm.home : []);
  const away = normalizeSideState(source.awayState || {}, Array.isArray(recentForm.away) ? recentForm.away : []);
  const missingEvidence = [];
  if (home.sampleCount < 5) missingEvidence.push("home.recent5");
  if (away.sampleCount < 5) missingEvidence.push("away.recent5");
  if (!input.news) missingEvidence.push("news");
  if (!input.injuries) missingEvidence.push("injuries");
  const newsText = text(input.news || input.injuries);
  const summary = `主队${home.team || "主队"}近${home.sampleCount}场：${home.form}；客队${away.team || "客队"}近${away.sampleCount}场：${away.form}。${newsText ? `已核验事实：${newsText}` : "伤停、教练和临场新闻未提供，不能把传闻写入结论。"}`;
  return {
    version: "TEAM_FORM_EVIDENCE_V1",
    home,
    away,
    news: newsText || "",
    missingEvidence,
    evidenceLevel: missingEvidence.length === 0 ? "VERIFIED" : missingEvidence.length <= 2 ? "PARTIAL" : "LIMITED",
    summary,
    policy: "RECENT_FORM_BEFORE_MARKET_NARRATIVE_NO_UNVERIFIED_NEWS",
  };
}

export function buildStyleMatchupEvidence(input = {}) {
  const teamForm = input.teamForm || buildTeamFormEvidence(input);
  const explicit = input.styleMatchup || {};
  const homeFormation = text(explicit.homeFormation || explicit.home?.formation);
  const awayFormation = text(explicit.awayFormation || explicit.away?.formation);
  const tacticalFact = text(explicit.tacticalFact || explicit.coachChange || explicit.pressIntensity);
  const missingEvidence = [];
  if (!homeFormation || !awayFormation) missingEvidence.push("formation");
  if (!tacticalFact) missingEvidence.push("tacticalFact");
  const labels = [...new Set([...(teamForm.home.style.labels || []), ...(teamForm.away.style.labels || [])])];
  const matchup = labels.length ? `近期数据风格：${labels.join("、")}。` : "近期风格样本不足。";
  const explicitText = homeFormation && awayFormation
    ? `阵型：主队${homeFormation} 对 客队${awayFormation}。`
    : "阵型未由可靠来源核验，不猜测4231、442或大巴。";
  const summary = `主队${teamForm.home.style.evidence}；客队${teamForm.away.style.evidence}。${matchup}${explicitText}${tacticalFact ? `战术事实：${tacticalFact}` : "教练临场策略和高位压迫变化未核验。"}`;
  return {
    version: "STYLE_MATCHUP_EVIDENCE_V1",
    home: { style: teamForm.home.style, formation: homeFormation },
    away: { style: teamForm.away.style, formation: awayFormation },
    tacticalFact,
    missingEvidence,
    evidenceLevel: missingEvidence.length === 0 ? "VERIFIED" : missingEvidence.length <= 1 ? "PARTIAL" : "LIMITED",
    summary,
    policy: "DATA_DERIVED_STYLE_NO_FORMATION_OR_COACHING_FABRICATION",
  };
}

function noVig(odds = []) {
  const values = odds.map(n);
  if (values.some((value) => value === null || value <= 1)) return null;
  const raw = values.map((value) => 1 / value);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return {
    odds: values,
    probabilities: raw.map((value) => value / total),
    overround: total,
  };
}

function marketLeader(probabilities = []) {
  const labels = ["HOME", "DRAW", "AWAY"];
  const ranked = labels.map((label, index) => ({ label, probability: probabilities[index] || 0 })).sort((a, b) => b.probability - a.probability);
  return { ...ranked[0], margin: (ranked[0]?.probability || 0) - (ranked[1]?.probability || 0) };
}

function marketSideText(value = "") {
  return sideLabel(value);
}

function priceInterpretation(openingLeader, latestLeader, movement = []) {
  if (!openingLeader || openingLeader.label === "UNKNOWN") return { state: "INSUFFICIENT", text: "开盘价格不完整，无法解释市场方向。" };
  if (!movement.length) return { state: "OPENING_ONLY", text: `开盘价格层偏向${marketSideText(openingLeader.label)}，暂无第二时点，不能判断方向是否被修正。` };
  const leaderDelta = movement[["HOME", "DRAW", "AWAY"].indexOf(openingLeader.label)] || 0;
  const sameLeader = latestLeader?.label === openingLeader.label;
  if (sameLeader && leaderDelta >= 0.02) return { state: "CONFIRMED_PRICE_SUPPORT", text: `开盘偏向${marketSideText(openingLeader.label)}，最新去水概率仍向该方向增加，属于价格层持续支持；这不是赛果保证。` };
  if (!sameLeader && Math.abs(leaderDelta) >= 0.02) return { state: "PRICE_REPRICED", text: `开盘偏向${marketSideText(openingLeader.label)}，最新价格已转向${marketSideText(latestLeader?.label)}，说明市场定价发生明显修正。` };
  return { state: "PRICE_STABLE_OR_MIXED", text: `开盘偏向${marketSideText(openingLeader.label)}，但最新变动不足以确认持续支持或明确反转。` };
}

export function buildOpeningMarketEvidence(input = {}) {
  const market = input.market || {};
  const history = input.oddsHistory || {};
  const opening = noVig([history.had?.[0]?.h || market.normal?.win, history.had?.[0]?.d || market.normal?.draw, history.had?.[0]?.a || market.normal?.lose]);
  const latest = noVig([history.had?.at(-1)?.h || market.normal?.win, history.had?.at(-1)?.d || market.normal?.draw, history.had?.at(-1)?.a || market.normal?.lose]);
  const openingLeader = opening ? marketLeader(opening.probabilities) : { label: "UNKNOWN", probability: 0, margin: 0 };
  const latestLeader = latest ? marketLeader(latest.probabilities) : { label: "UNKNOWN", probability: 0, margin: 0 };
  const movement = opening && latest
    ? latest.probabilities.map((value, index) => Number((value - opening.probabilities[index]).toFixed(4)))
    : [];
  const modelProbabilities = input.modelProbabilities || null;
  const modelLeader = modelProbabilities ? marketLeader([modelProbabilities.HOME, modelProbabilities.DRAW, modelProbabilities.AWAY]) : null;
  const disagreement = modelLeader && openingLeader.label !== "UNKNOWN"
    ? { market: openingLeader.label, model: modelLeader.label, differs: openingLeader.label !== modelLeader.label }
    : null;
  const interpretation = priceInterpretation(openingLeader, latestLeader, movement);
  const handicapRows = Array.isArray(history.hhad)
    ? history.hhad.filter((row) => [row.h, row.d, row.a].every((value) => n(value) !== null && n(value) > 1))
    : [];
  const handicapOpening = handicapRows[0] || null;
  const handicapLatest = handicapRows.at(-1) || null;
  const handicapMovement = handicapOpening && handicapLatest
    ? {
        openingLine: handicapOpening.goalLine ?? null,
        latestLine: handicapLatest.goalLine ?? null,
        lineChanged: String(handicapOpening.goalLine ?? "") !== String(handicapLatest.goalLine ?? ""),
        opening: noVig([handicapOpening.h, handicapOpening.d, handicapOpening.a]),
        latest: noVig([handicapLatest.h, handicapLatest.d, handicapLatest.a]),
        snapshotCount: handicapRows.length,
      }
    : null;
  const missingEvidence = opening ? [] : ["opening-or-current-had"];
  const handicapText = handicapMovement
    ? `让球快照${handicapMovement.snapshotCount}个，盘口${handicapMovement.openingLine ?? "-"}→${handicapMovement.latestLine ?? "-"}${handicapMovement.lineChanged ? "，盘口线发生变化" : "，盘口线未变"}。`
    : "让球快照不足，不能判断盘口线是否变化。";
  const summary = opening
    ? `开盘去水概率：主${(opening.probabilities[0] * 100).toFixed(1)}%、平${(opening.probabilities[1] * 100).toFixed(1)}%、客${(opening.probabilities[2] * 100).toFixed(1)}%；市场开盘第一方向为${marketSideText(openingLeader.label)}，领先第二方向 ${(openingLeader.margin * 100).toFixed(1)} 个百分点。${latest ? `最新第一方向为${marketSideText(latestLeader.label)}，相对开盘变化主${(movement[0] * 100).toFixed(1)}、平${(movement[1] * 100).toFixed(1)}、客${(movement[2] * 100).toFixed(1)}个百分点。` : "暂无最新快照。"}${handicapText}${interpretation.text}这是赔率价格层的事实，不把它解释成球队事实。${disagreement?.differs ? `市场方向与模型方向不同：市场${marketSideText(disagreement.market)}，模型${marketSideText(disagreement.model)}；两者分开记录，禁止用模型结论反填操盘原因。` : "尚未发现市场与模型方向冲突，仍不据此证明赛果。"}`
    : "开盘胜平负数据不完整，不能判断体彩开盘偏向哪边。";
  return {
    version: "OPENING_MARKET_EVIDENCE_V1",
    opening,
    latest,
    openingLeader,
    latestLeader,
    movement,
    handicap: handicapMovement,
    interpretation,
    disagreement,
    missingEvidence,
    evidenceLevel: opening ? "VERIFIED" : "LIMITED",
    summary,
    bookmakerReason: opening ? "若从博彩公司定价视角复核，只能确认其把主客场、实力先验、近期信息和资金风险压缩成价格并加入利润空间；当前数据没有投注量、内部模型或新闻证据，不能把具体原因写成事实。" : "开盘数据不足，无法推断操盘方向。",
    policy: "MARKET_FIRST_NO_MODEL_BACKFILL_OF_BOOKMAKER_REASON",
  };
}
