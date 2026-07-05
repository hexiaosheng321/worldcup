import fs from "node:fs/promises";
import path from "node:path";
import {
  buildTeamState,
  loadExternalSamples,
  loadSportterySpHistory,
  summarizeOddsMovement,
} from "./league-v1-context.mjs";

const ODDS_FILE = path.resolve("web/live-sporttery-data.js");
const MANUAL_FILE = path.resolve("web/data.js");
const OUTPUT = path.resolve("web/auto-sporttery-predictions.js");
const EXTERNAL_SAMPLES_FILE = path.resolve("web/data/externalHistoricalSamples.js");
const SP_HISTORY_FILE = path.resolve("web/live-sporttery-sp-history.js");
const LEAGUE_V1_DECISION_STEPS =
  "联赛V1必须以世界杯V4推演链为基础：1内部概率底盘；2赛事规则/动机；3球队状态；4风格对位；5机构线与体彩盘口偏差；6赔率动态防守层；7常规比赛脚本；8半场/60分钟触发脚本；9决策冲突闸门；10比分与总进球校验；11让球独立闸门；12失败方式识别；13价值过滤；14人工确认后锁版。自动生成只能作为PRE_LOCK草稿。2026-07-04后新增硬门槛：球队状态未补齐、赔率动态未比较、冲突闸门仅靠1-1低赔、让球未按两个比分映射、总进球未结合联赛画像时，一律不得FINAL_LOCK。";
const LEAGUE_V1_HARD_GATES = [
  "球队状态门槛：必须补双方排名/近3-5场/主客场/伤停轮换/进攻路径/防守风险；模板状态不能FINAL",
  "赔率动态门槛：必须比较开盘、最新、临场或SP历史至少两个状态；缺失时降级到C+或以下",
  "冲突闸门：单个1-1最低比分不能推翻胜平负低位，至少需要球队状态、联赛画像、赔率动态、让球映射、相似样本两层支持",
  "让球映射门槛：两个候选比分必须逐个换算让胜/让平/让负；受让保护不等于自动让胜",
  "总进球门槛：不能从低比分模板直接导出小球，必须结合联赛画像和双方近期BTTS/大球形态",
];

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
  if (/瑞超|瑞典超|Allsvenskan|Sweden/i.test(text)) {
    return {
      tempo: "瑞典超处于夏季联赛节奏，主场、人造草皮、转换速度和定位球权重偏高；强队低赔仍要单独检查让球穿盘能力。",
      style: "优先补当前排名、主客场差异、边路推进、定位球、人工草适应和60分钟后换人强度。",
      risk: "最容易错在主胜低位与让球不穿之间：热门队能赢但可能被1球差、1-1或2-1卡住。",
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
  return `${league}从联赛V1开始，但必须以世界杯V4推演链为基础；差异只放在赛事规则、联赛节奏、球队样本和赛程动机层：联赛要核查积分排名、争冠/欧战/保级、赛程密度、主客场和轮换，杯赛要核查90分钟目标、加时/点球接受度和回合制规则。`;
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

function handicapResultForScore(score = "", handicap = "") {
  const matched = String(score || "").match(/(\d+)\D+(\d+)/);
  const line = Number(String(handicap || "").replace(/[^\d+-]/g, ""));
  if (!matched || !Number.isFinite(line)) return "待判";
  const home = Number(matched[1]);
  const away = Number(matched[2]);
  const adjusted = home + line - away;
  if (adjusted > 0) return "让胜";
  if (adjusted === 0) return "让平";
  return "让负";
}

function handicapMappingGate(item, scoreA, scoreB) {
  return `让球映射硬门槛：${item.home || "主队"}${item.handicap || "0"}下，${scoreA || "-"}=${handicapResultForScore(scoreA, item.handicap)}，${scoreB || "-"}=${handicapResultForScore(scoreB, item.handicap)}。最终让球必须从比分映射、球队状态、赔率动态三层共同确认，不能把受让保护直接写成让胜。`;
}

function decisionConflictGate(normalPick, handicapPick, scoreA, scoreB) {
  return `冲突闸门硬门槛：胜平负低位${normalPick ? `${normalPick.label}${normalPick.odd}` : "-"}、让球低位${handicapPick ? `${handicapPick.label}${handicapPick.odd}` : "-"}、比分低赔${scoreA}/${scoreB}必须互相解释。单个1-1或低比分不能推翻胜平负低位；至少需要球队状态、联赛画像、赔率动态、让球映射、相似样本中两层支持，才允许改选平局或冷门。`;
}

function oddsMovementGate() {
  return "赔率动态硬门槛：当前自动草稿只读取一次赛事池快照，未比较开盘/最新/临场/SP历史，不能用于FINAL_LOCK；人工锁版前必须补lineMovement，若动态缺失则置信降到C+或以下。";
}

function teamStateGate(item) {
  return `球队状态硬门槛：${item.home || "主队"}与${item.away || "客队"}必须补排名、近3-5场进失球、主客场、伤停轮换、赛程压力、各自进攻路径和防守风险。未补齐时只能PRE_LOCK或跳过。`;
}

function stateTransferFor(item, normalPick, handicapPick, totalGoals) {
  const profile = leagueProfile(item.league);
  const conflict = marketConflict(normalPick, handicapPick);
  return `${profile.tempo} 0-0到60分钟时先看低位方是否必须主动变阵；领先1球后再问是否继续追第二球。${conflict} 总进球低位为${totalGoals || "待判"}，先作为状态转移约束，不直接当最终比分。`;
}

function teamStateTemplate(item) {
  return `待人工补充：${teamStateGate(item)} 模型草稿不能把盘口低位当作球队状态。`;
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
const externalSamples = await loadExternalSamples(EXTERNAL_SAMPLES_FILE);
const spHistory = await loadSportterySpHistory(SP_HISTORY_FILE);

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
    const teamContext = buildTeamState(externalSamples, item);
    const oddsContext = summarizeOddsMovement(spHistory, item);
    const teamState = teamContext.hasState
      ? `外部样本状态层已补齐：${teamContext.summary}`
      : `${teamStateTemplate(item)} 当前外部样本匹配不足：${teamContext.summary}`;
    const lineMovement = oddsContext.text;
    const contextQuality = [
      teamContext.hasState ? "球队状态=外部样本可用" : "球队状态=样本不足",
      oddsContext.hasMovement ? "赔率动态=两态可比" : `赔率动态=${oddsContext.snapshotCount || 0}态`,
    ].join("；");
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
      type: `${league}V1模型草稿`,
      modelVersion: "V1",
      confidence,
      advice: adviceFor(confidence),
      matchType,
      competitionModel: `${league} V1 联赛模型草稿（以世界杯V4推演链为基础）`,
      homeProb: normal?.label === "胜" ? "盘口低位" : "待回测",
      drawProb: normal?.label === "平" ? "盘口低位" : "待回测",
      awayProb: normal?.label === "负" ? "盘口低位" : "待回测",
      xg: "待接入",
      poisson: scores.length ? scores.join(" / ") : "待接入",
      decisionProcess: LEAGUE_V1_DECISION_STEPS,
      competitionRules: competitionRuleTemplate(item),
      groupSituation: `${competitionRuleTemplate(item)} 模型草稿先记录盘口、比分低赔、总进球结构和联赛节奏，球队状态和规则动机补足后只能进入PRE_LOCK；人工确认后才允许FINAL_LOCK。`,
      teamState,
      styleMatchup: styleMatchupTemplate(item),
      recentAnalysis: `联赛V1状态层：${teamState} 联赛节奏提示：${profile.tempo}`,
      institutionLine: `胜平负低位 ${normal ? `${normal.label}${normal.odd}` : "-"}；让球低位 ${handicap ? `${handicap.label}${handicap.odd}` : "-"}。`,
      lineMovement,
      noiseFilter: "自动锁版不做名气追热，低置信场次只作观察样本。",
      keyJudgement: `联赛V1模型草稿先检查世界杯V4推演链是否完整：球队状态、风格对位、赛事规则、盘口、赔率动态、常规脚本、触发脚本、冲突闸门、比分/总进球、让球闸门、失败方式、价值过滤缺一项都不能进入FINAL_LOCK。硬门槛：${LEAGUE_V1_HARD_GATES.join("；")}`,
      marketGap: `联赛V1暂以体彩盘口结构作为市场温度，不替代完整V4链路推演。${conflict}`,
      script: "比赛脚本等待该联赛样本、球队状态、风格对位、阵容和半全场走势补足后继续细化。",
      scriptSet: scenarioSetFor(normal, handicap, scoreA, scoreB),
      halfFullScenario: halfFullScenarioFor(item, normal, handicap, scoreA, scoreB),
      halftimeDecision: halfFullScenarioFor(item, normal, handicap, scoreA, scoreB),
      stateTransfer,
      failureMode: profile.risk,
      dataQuality: `联赛V1数据质量：${contextQuality}；阵容伤停仍需人工确认。样本不足时只展示，不上调置信。`,
      decisionConflict: `${conflict} ${decisionConflictGate(normal, handicap, scoreA, scoreB)}`,
      handicapGate: handicapMappingGate(item, scoreA, scoreB),
      valueFilter: `价值过滤硬门槛：${contextQuality}；球队状态、赔率动态、冲突闸门、让球映射、总进球画像任一未补齐时，不允许升主打；自动草稿只能观察或PRE_LOCK。`,
      finalDecisionAction: `联赛V1模型草稿：按世界杯V4推演链先给临时方向，胜平负倾向${normal?.label || "-"}；让球倾向${handicap?.label || "-"}；总进球倾向${totalGoals}；比分候选${scoreA} / ${scoreB}。${contextQuality}；未同时满足状态层、赔率动态两态比较、阵容伤停和人工确认前只能作为PRE_LOCK草稿，不得当作FINAL_LOCK。`,
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
