import fs from "node:fs/promises";
import path from "node:path";

const ODDS_FILE = path.resolve("web/live-sporttery-data.js");
const MANUAL_FILE = path.resolve("web/data.js");
const OUTPUT = path.resolve("web/auto-sporttery-predictions.js");
const LEAGUE_V1_DECISION_STEPS =
  "联赛V1步骤吸收世界杯V4经验：1内部概率底盘；2赛事规则/动机；3球队状态；4风格对位；5机构线、体彩盘口和历史样本对比；6状态转移和半全场；7比分与总进球验证；8让球独立闸门；9失败方式和值过滤；10最终锁版。";

function jsonFromJs(content, varName) {
  const matched = content.match(new RegExp(`${varName}\\s*=\\s*(\\{[\\s\\S]*\\});?\\s*$`));
  if (!matched) return null;
  return JSON.parse(matched[1]);
}

function oddNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function lowest(rows) {
  return rows
    .filter((item) => oddNumber(item.odd))
    .sort((a, b) => oddNumber(a.odd) - oddNumber(b.odd))[0] || null;
}

function pickNormal(odds = {}) {
  return lowest([
    { label: "胜", odd: odds.win },
    { label: "平", odd: odds.draw },
    { label: "负", odd: odds.lose },
  ]);
}

function pickHandicap(odds = {}) {
  return lowest([
    { label: "让胜", odd: odds.win },
    { label: "让平", odd: odds.draw },
    { label: "让负", odd: odds.lose },
  ]);
}

function scoreText(value = "") {
  return String(value || "").replace(":", "-");
}

function topScores(scores = []) {
  return scores
    .filter((item) => item.score && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => scoreText(item.score));
}

function topGoals(goals = []) {
  return goals
    .filter((item) => item.goals && oddNumber(item.odds))
    .sort((a, b) => oddNumber(a.odds) - oddNumber(b.odds))
    .slice(0, 2)
    .map((item) => `${item.goals}球`);
}

function leagueProfile(league = "") {
  const text = String(league || "");
  if (/芬超|Veikkausliiga/i.test(text)) {
    return {
      tempo: "北欧联赛节奏波动较大，主客场、天气和定位球权重高；盘口低位不能直接等于稳定小球。",
      style: "优先补主客场强弱、定位球质量、天气草皮、近3-5场失球方式和下半场体能。",
      risk: "最容易错在总进球和让球幅度：早球、定位球和后段体能下滑会把2球局推成3/4球。",
    };
  }
  if (/日职|J1|J联赛|Japan/i.test(text)) {
    return {
      tempo: "日职更看重转换节奏、边路推进和轮换强度，强队未必持续压穿，让球需单独过滤。",
      style: "优先补轮换、边路推进、压迫强度、连续一周双赛和替补冲击。",
      risk: "最容易错在强队小胜与平局之间，需要检查赛程密度、轮换和临场阵容。",
    };
  }
  if (/韩职|K联赛|K League/i.test(text)) {
    return {
      tempo: "韩职身体对抗和后段冲击权重较高，低比分防守区常见，但尾段进球风险不能忽略。",
      style: "优先补身体对抗、定位球、防线高空球、下半场换人和尾段丢球习惯。",
      risk: "最容易错在0-0到60分钟后的状态变化，后段换人和定位球会改变总进球区间。",
    };
  }
  return {
    tempo: "联赛自动模型先按盘口、比分低赔和总进球结构建立预筛；未补足阵容、战意和联赛风格前不提高置信。",
    style: "优先补近3-5场真实状态、主客场差异、球队风格、伤停轮换和半全场走势。",
    risk: "最容易错在把盘口低位当成真实脚本，需等待同联赛样本和人工近况复核。",
  };
}

function competitionRuleTemplate(item) {
  const league = item.league || "联赛";
  return `${league}从联赛V1开始，但应用世界杯V4复盘经验；不同点只在赛事规则层：联赛要核查积分排名、争冠/欧战/保级、赛程密度、主客场和轮换，杯赛要核查90分钟目标、加时/点球接受度和回合制规则。`;
}

function totalGoalBand(goalTexts = []) {
  const nums = goalTexts.map((item) => Number(String(item).match(/\d+/)?.[0])).filter(Number.isFinite);
  if (!nums.length) return "待判";
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max <= 1) return "闷局";
  if (max <= 3) return "常规局";
  if (max <= 4 || min >= 3) return "开放局";
  return "打花局";
}

function marketConflict(normalPick, handicapPick) {
  if (!normalPick || !handicapPick) return "盘口字段不足，暂不判断冲突。";
  if (!handicapPick.label.includes(normalPick.label)) {
    return "胜平负低位与让球低位不同向，不能把方向直接复制到让球。";
  }
  return "胜平负与让球低位暂同向，但仍需检查比分低赔是否支持第二球。";
}

function stateTransferFor(item, normalPick, handicapPick, totalGoals) {
  const profile = leagueProfile(item.league);
  const conflict = marketConflict(normalPick, handicapPick);
  return `${profile.tempo} 0-0到60分钟时先看低位方是否必须主动变阵；领先1球后再问是否继续追第二球。${conflict} 总进球低位为${totalGoals || "待判"}，先作为状态转移约束，不直接当最终比分。`;
}

function teamStateTemplate(item) {
  return `待人工补充：${item.home || "主队"}与${item.away || "客队"}近3-5场真实状态、伤停停赛、主客场强弱、体能和赛程压力。自动预筛不能把盘口低位当作球队状态。`;
}

function styleMatchupTemplate(item) {
  const profile = leagueProfile(item.league);
  return `待人工补充：${item.home || "主队"}与${item.away || "客队"}的控球/高压/低位/转换/定位球对位。联赛优先核查：${profile.style}`;
}

function halfFullScenarioFor(item, normalPick, handicapPick, scoreA, scoreB) {
  const normal = normalPick?.label || "低位方";
  const handicap = handicapPick?.label || "让球低位";
  return `半全场预筛：半场0-0时先降低${normal}的穿盘信心，平局和受让分支升权；若${normal}半场领先，再检查下半场是否继续追第二球。当前比分低赔给出${scoreA}/${scoreB}，${handicap}用于约束让球，不直接复制胜平负方向。`;
}

function scenarioSetFor(normalPick, handicapPick, scoreA, scoreB) {
  const normal = normalPick?.label || "方向低位";
  const handicap = handicapPick?.label || "让球低位";
  return [
    { label: "盘口低位剧本", probability: "待人工校准", score: scoreA, text: `${normal}兑现盘口优势，但仍需球队状态和风格对位确认。` },
    { label: "半场僵局剧本", probability: "待人工校准", score: scoreB, text: "若半场0-0或机会质量不足，低赔方向降权，平局/受让风险上升。" },
    { label: "让球错层剧本", probability: "待人工校准", score: scoreA, text: `${handicap}提示让球层可能和胜平负方向不同步，需单独判断第二球。` },
    { label: "状态反转剧本", probability: "待人工校准", score: scoreB, text: "若弱势方先进球或下半场先变阵，总进球和方向都可能偏离盘口低位。" },
  ];
}

function sportteryKey(item = {}) {
  if (item.matchId) return `id-${item.matchId}`;
  return `issue-${item.issue || item.no || item.orderId || ""}-${item.ticaiDate || item.matchDate || ""}`;
}

function confidenceFor(item, normalPick, handicapPick) {
  if (!normalPick || !handicapPick) return "C";
  const normalOdd = oddNumber(normalPick.odd) || 9;
  const handicapOdd = oddNumber(handicapPick.odd) || 9;
  if (normalOdd <= 1.55 && handicapOdd <= 1.9) return "B";
  if (normalOdd <= 2.15 && handicapOdd <= 1.75) return "B-";
  return "C+";
}

function adviceFor(confidence) {
  if (confidence === "B") return "自动可选";
  if (confidence === "B-") return "自动谨慎";
  return "自动观察";
}

const oddsData = jsonFromJs(await fs.readFile(ODDS_FILE, "utf8"), "window\\.LIVE_SPORTTERY_ODDS") || { matches: [] };
const manualContent = await fs.readFile(MANUAL_FILE, "utf8");
const manualKeys = new Set([...manualContent.matchAll(/sportteryKey:\s*"([^"]+)"/g)].map((item) => item[1]));

const rows = (oddsData.matches || [])
  .filter((item) => item.league && item.league !== "世界杯")
  .filter((item) => !manualKeys.has(sportteryKey(item)))
  .map((item) => {
    const normal = pickNormal(item.normal);
    const handicap = pickHandicap(item.handicapOdds);
    const scores = topScores(item.scoreOdds);
    const goals = topGoals(item.totalGoalsOdds);
    const confidence = confidenceFor(item, normal, handicap);
    const league = item.league || "体彩联赛";
    const profile = leagueProfile(league);
    const scoreA = scores[0] || "1-1";
    const scoreB = scores[1] || "2-1";
    const totalGoals = goals.length ? goals.join("/") : "2/3球";
    const matchType = totalGoalBand(goals);
    const conflict = marketConflict(normal, handicap);
    const stateTransfer = stateTransferFor(item, normal, handicap, totalGoals);
    return {
      sportteryKey: sportteryKey(item),
      matchId: item.matchId || "",
      no: item.no || "",
      issue: item.issue || item.no || "",
      date: item.ticaiDate || item.matchDate || oddsData.lotterNo || "",
      matchDate: item.matchDate || item.ticaiDate || oddsData.lotterNo || "",
      kickoffTime: item.kickoffTime || "",
      competition: league,
      playType: "竞彩足球",
      home: item.home || "",
      away: item.away || "",
      type: `${league}V1自动赛前预筛`,
      modelVersion: "V1",
      confidence,
      advice: adviceFor(confidence),
      matchType,
      competitionModel: `${league} V1 联赛自动预筛（吸收世界杯V4经验）`,
      homeProb: normal?.label === "胜" ? "盘口低位" : "待回测",
      drawProb: normal?.label === "平" ? "盘口低位" : "待回测",
      awayProb: normal?.label === "负" ? "盘口低位" : "待回测",
      xg: "待接入",
      poisson: scores.length ? scores.join(" / ") : "待接入",
      decisionProcess: LEAGUE_V1_DECISION_STEPS,
      competitionRules: competitionRuleTemplate(item),
      groupSituation: `${competitionRuleTemplate(item)} 自动预筛先记录盘口、比分低赔、总进球结构和联赛节奏，球队状态和规则动机补足后再做正式锁版。`,
      teamState: teamStateTemplate(item),
      styleMatchup: styleMatchupTemplate(item),
      recentAnalysis: `联赛V1自动预筛仅根据体彩开盘结构生成，球队状态和风格对位待人工补充。联赛节奏提示：${profile.tempo}`,
      institutionLine: `胜平负低位 ${normal ? `${normal.label}${normal.odd}` : "-"}；让球低位 ${handicap ? `${handicap.label}${handicap.odd}` : "-"}。`,
      noiseFilter: "自动锁版不做名气追热，低置信场次只作观察样本。",
      keyJudgement: "联赛V1自动预筛先检查世界杯V4经验链是否完整：球队状态、风格对位、赛事规则、盘口、状态转移、比分/总进球、让球闸门缺一项都不能升主推。",
      marketGap: `联赛V1暂以体彩盘口结构作为市场温度，不替代人工深度推演。${conflict}`,
      script: "比赛脚本等待该联赛样本、球队状态、风格对位、阵容和半全场走势补足后继续细化。",
      scriptSet: scenarioSetFor(normal, handicap, scoreA, scoreB),
      halfFullScenario: halfFullScenarioFor(item, normal, handicap, scoreA, scoreB),
      halftimeDecision: halfFullScenarioFor(item, normal, handicap, scoreA, scoreB),
      stateTransfer,
      failureMode: profile.risk,
      dataQuality: "联赛V1自动预筛已接入体彩盘口；阵容、伤停、近期状态和联赛风格仍待人工补全。样本不足时只展示，不上调置信。",
      decisionConflict: conflict,
      finalDecisionAction: `联赛V1自动预筛：按吸收世界杯V4经验的流程先给临时方向，胜平负选${normal?.label || "-"}；让球选${handicap?.label || "-"}；总进球选${totalGoals}；比分预测${scoreA} / ${scoreB}。球队状态、风格、赛事规则和半全场未补足前只作观察，不当主推。`,
      pick: normal?.label || "",
      handicapPick: handicap?.label || "",
      totalGoalsPick: totalGoals,
      mainScore: scoreA,
      counterScore: scoreB,
      handicap: `${item.home || "主队"}${item.handicap || "0"}：${handicap?.label || "待定"}`,
      autoGenerated: true,
      generatedAt: new Date().toISOString(),
    };
  });

await fs.writeFile(OUTPUT, `window.AUTO_SPORTTERY_PREDICTIONS = ${JSON.stringify(rows, null, 2)};\n`, "utf8");
console.log(`wrote ${OUTPUT}: ${rows.length} auto league V1 prefilters`);
