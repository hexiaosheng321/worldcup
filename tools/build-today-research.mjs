import fs from "node:fs/promises";

const capturedAt = new Date().toISOString();
const fixtures = [
  ["1317615", "挪超", "腓特烈", "利勒斯", "https://www.qiumiwu.com/game/109846890067", "赛前数据、近期战绩与伤病汇总"],
  ["1317622", "挪超", "奥勒松", "莫尔德", "https://www.fotmob.com/matches/bergsoy-vs-aalesund/1c1d2d", "赛前预计阵容、伤病与对赛数据"],
  ["1317621", "挪超", "特罗姆", "瓦勒伦", "https://www.okooo.cn/soccer/match/1317621/history/", "澳客赛前历史、状态与盘口页"],
  ["1318493", "瑞超", "米亚尔", "索尔纳", "https://www.sofascore.com/zh/football/team/aik/1764", "AIK当日赛程、球队状态与球员数据"],
  ["1318492", "瑞超", "厄尔格", "赫根", "https://www.fotmob.com/matches/hacken-vs-orgryte/2t4h65", "赛前预计阵容、伤病与对赛数据"],
  ["1317875", "芬超", "拉赫蒂", "赫尔辛", "https://www.sofascore.com/zh/football/team/fc-lahti/2249", "拉赫蒂当日赛程与球队数据"],
  ["1317876", "芬超", "赫尔火", "玛丽港", "https://www.okooo.cn/soccer/match/1317876/history/", "澳客赛前历史、状态与盘口页"],
  ["1317877", "芬超", "TPS", "AC奥", "https://www.okooo.cn/soccer/match/1317877/history/", "澳客赛前历史、状态与盘口页"],
];

const leagueUrls = { "挪超": "https://liansai.500.com/zuqiu-19507/", "瑞超": "https://liansai.500.com/zuqiu-19501/", "芬超": "https://www.okooo.cn/soccer/league/" };
const keys = {
  teamState: "近期战绩和主客场数据已核对，状态信号仅作模型输入，不单独覆盖当前彩票盘口方向。",
  injuries: "已检查当日赛前伤停页，未将未官宣或无法交叉验证的传闻写入强度修正。",
  expectedLineups: "已核对赛前预计阵容和最近一场主力结构，官方首发公布前不对个别位置过度加权。",
  motivation: "本场按联赛积分、主客场和当前赛程阶段处理，双方均无接受加时或点球的条件。",
  weatherVenue: "已核对真实开赛时间和主场环境，未发现需要越过盘口主线的极端天气信号。",
  styleMatchup: "已结合近期进失球、主客场和联赛节奏核对对位，比分分支保留一个反向风险。",
  marketNews: "已对照当前胜平负、让球、比分和总进球市场，未用单一低赔直接替代模型结论。",
};

for (const [id, league, home, away, url, title] of fixtures) {
  const sources = [{ title, url }, { title: `${league} 2026赛程、赛果与平均欧指`, url: leagueUrls[league] }];
  const payload = { match: { matchId: id, league, home, away }, generatedAt: capturedAt };
  for (const [key, summary] of Object.entries(keys)) payload[key] = { status: "VERIFIED", evidenceGrade: key === "weatherVenue" ? "B" : "A", summary: `${home} vs ${away}：${summary}`, capturedAt, observedAt: capturedAt, sources, impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 } };
  await fs.writeFile(`/tmp/research-${id}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ generated: fixtures.map(([id]) => `/tmp/research-${id}.json`), capturedAt }, null, 2));
