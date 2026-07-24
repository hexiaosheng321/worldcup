function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(score = {}) {
  const home = number(score.home);
  const away = number(score.away);
  if (home === null || away === null) return "UNKNOWN";
  return home > away ? "HOME" : home < away ? "AWAY" : "DRAW";
}

function directionText(value = "UNKNOWN") {
  return { HOME: "主队", AWAY: "客队", DRAW: "平局", UNKNOWN: "未知" }[value] || "未知";
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function styleText(style = {}) {
  return Array.isArray(style.labels) && style.labels.length ? style.labels.join("、") : "攻防中性";
}

function developmentPath(scoreRows = [], probabilities = {}) {
  const rows = scoreRows.slice(0, 3).map((row) => ({ score: row.score, probability: Number(row.probability || 0), direction: direction(row) }));
  const directionRows = ["HOME", "DRAW", "AWAY"].map((label) => ({ label, probability: Number(probabilities[label] || 0) })).sort((a, b) => b.probability - a.probability);
  return { rows, directions: directionRows };
}

export function buildMatchDevelopmentEvidence(input = {}) {
  const xg = input.xg || {};
  const homeXg = number(xg.home);
  const awayXg = number(xg.away);
  const totalXg = homeXg !== null && awayXg !== null ? homeXg + awayXg : null;
  const teamForm = input.teamForm || {};
  const styleMatchup = input.styleMatchup || {};
  const openingMarket = input.openingMarket || {};
  const probabilities = input.probabilities || {};
  const path = developmentPath(Array.isArray(input.scoreRows) ? input.scoreRows : [], probabilities);
  const missingEvidence = [];
  if (totalXg === null) missingEvidence.push("xg");
  if (!path.rows.length) missingEvidence.push("joint-score-distribution");
  if (!teamForm.home || !teamForm.away) missingEvidence.push("recent-form");
  if (!openingMarket.opening) missingEvidence.push("opening-market");

  const homeStyle = styleText(teamForm.home?.style);
  const awayStyle = styleText(teamForm.away?.style);
  const homeAttackVsAwayDefense = homeStyle.includes("进攻倾向") && awayStyle.includes("防守稳固");
  const awayAttackVsHomeDefense = awayStyle.includes("进攻倾向") && homeStyle.includes("防守稳固");
  const pace = totalXg === null ? "UNKNOWN" : totalXg >= 3 ? "OPEN" : totalXg <= 2 ? "LOW_EVENT" : "MIXED";
  const tacticalInference = homeAttackVsAwayDefense
    ? "主队近期进攻倾向对客队近期防守稳固，比赛更可能先由主队控球和压制发起，但不等于已核验4231或高位压迫。"
    : awayAttackVsHomeDefense
      ? "客队近期进攻倾向对主队近期防守稳固，客队反击或转换效率是主要变量，但不等于已核验具体阵型。"
      : pace === "OPEN"
        ? "双方近期数据共同指向开放型节奏，攻防转换和第二落点可能增加进球方差。"
        : pace === "LOW_EVENT"
          ? "双方近期数据共同指向低事件节奏，前段试探和阵地消耗的概率更高。"
          : "当前数据未形成单一风格压制，不能把比赛写成固定的强攻或防反脚本。";

  const topPath = path.rows[0]
    ? `联合比分最高路径为${path.rows[0].score}（${percent(path.rows[0].probability)}），方向为${directionText(path.rows[0].direction)}；第二路径为${path.rows[1] ? `${path.rows[1].score}（${percent(path.rows[1].probability)}）` : "暂无"}。`
    : "联合比分分布缺失，不能给出主脚本。";
  const marketPath = openingMarket.interpretation?.text || "开盘/最新价格层不足，不能把市场变化写入比赛脚本。";
  const firstHalfExpected = totalXg === null ? null : Number((totalXg * 0.45).toFixed(2));
  const halfTime = firstHalfExpected === null
    ? "半场节奏无法从当前数据估计。"
    : firstHalfExpected <= 0.8
      ? `半场更偏低事件：模型估计前45分钟期望进球约${firstHalfExpected.toFixed(2)}，若半场仍为0-0，不应自动解释为某队崩盘。`
      : homeXg > awayXg * 1.25
        ? `半场主队占优路径更强：主/客预期进球${homeXg.toFixed(2)}/${awayXg.toFixed(2)}；若主队早段未进球，60分钟前需要重新评估其压制是否转化为高质量机会。`
        : awayXg > homeXg * 1.25
          ? `半场客队威胁路径更强：主/客预期进球${homeXg.toFixed(2)}/${awayXg.toFixed(2)}；若客队早段未进球，60分钟前需要观察其转换机会是否持续。`
          : `半场双方机会接近：主/客预期进球${homeXg.toFixed(2)}/${awayXg.toFixed(2)}，不能预设某队必然强攻。`;
  const triggers = [];
  if (firstHalfExpected !== null && firstHalfExpected <= 0.8) triggers.push("若半场0-0：优先保持低事件脚本，只有出现射门/定位球/牌面等新证据才上调后段进球预期。");
  if (firstHalfExpected !== null && firstHalfExpected > 0.8) triggers.push("若半场0-0：60分钟是节奏转折检查点，需确认双方是否增加前场人数，而不是直接假定强攻。");
  if (openingMarket.interpretation?.state === "PRICE_REPRICED") triggers.push("若60分钟前盘口继续向新方向修正：记录为市场再定价信号，需与场上机会质量同时验证，不能单独追价。");
  if (pace === "OPEN") triggers.push("若先出现进球：开放型样本下领先方身后空间和落后方转换风险增加，比分尾部需保留。");
  if (!triggers.length) triggers.push("目前没有足够的半场/60分钟条件证据，保持观察，不生成固定触发剧本。");
  const formationFact = styleMatchup.home?.formation && styleMatchup.away?.formation
    ? `已核验阵型：主队${styleMatchup.home.formation} 对 客队${styleMatchup.away.formation}。`
    : "阵型、教练更换和高位压迫未由可靠字段核验，不编造4231、442或大巴。";
  const summary = `比赛发展：${tacticalInference}${formationFact}${topPath}${marketPath} ${halfTime} 60分钟触发：${triggers.join(" ")}`;
  return {
    version: "MATCH_DEVELOPMENT_EVIDENCE_V1",
    pace,
    xg: { home: homeXg, away: awayXg, total: totalXg, firstHalfExpectedGoals: firstHalfExpected },
    path,
    tacticalInference,
    formationFact,
    marketPath,
    halfTime,
    triggers,
    missingEvidence,
    evidenceLevel: missingEvidence.length === 0 ? "VERIFIED" : missingEvidence.length <= 2 ? "PARTIAL" : "LIMITED",
    summary,
    policy: "DATA_CONDITIONED_DEVELOPMENT_NO_TEMPLATE_OR_UNVERIFIED_FORMATION_CLAIM",
  };
}
