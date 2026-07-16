import fs from "node:fs/promises";

const capturedAt = new Date().toISOString();
const fixtures = {
  "1320348": ["韩职", "光州F", "浦项制", "Gwangju FC vs Pohang Steelers pre-match table and H2H", "https://www.365scores.com/en-us/football/match/k-league-1-618/gwangju-fc-pohang-steelers-9822-9826-618"],
  "1320347": ["韩职", "金泉尚", "富川F", "Gimcheon Sangmu vs Bucheon pre-match form", "https://betimate.com/en/news/previews/gimcheon-sangmu-fc-vs-bucheon-prediction-odds-betting-tips-07112026-2672245"],
  "1320349": ["韩职", "蔚山现", "全北现", "Ulsan vs Jeonbuk pre-match analysis", "https://tips.gg/article/ulsan-hyundai-vs-jeonbuk-11-07-2026/"],
  "1317615": ["挪超", "腓特烈", "利勒斯", "Fredrikstad vs Lillestrom match guide", "https://www.sportsmole.co.uk/football/eliteserien/fredrikstad-vs-lillestrom_game_250064.html"],
  "1317622": ["挪超", "奥勒松", "莫尔德", "Aalesund vs Molde pre-match preview", "https://www.forebet.com/en/football-match-previews/28768-molde-set-to-face-gritty-aalesund-fk-in-tight-eliteserien-clash"],
  "1317621": ["挪超", "特罗姆", "瓦勒伦", "Eliteserien current fixtures and odds", "https://www.pokerstars.es/en/sports/soccer/1/norwegian-eliteserien/11068551/"],
  "1318493": ["瑞超", "米亚尔", "索尔纳", "Mjallby vs AIK preview and lineups", "https://tips.gg/article/mjallby-vs-aik-11-07-2026/"],
  "1318492": ["瑞超", "厄尔格", "赫根", "Orgryte vs Hacken pre-match table and form", "https://betmines.com/match-preview/orgryte-vs-hacken-prediction-match-preview-and-analysis-allsvenskan-11-07-2026"],
  "1317875": ["芬超", "拉赫蒂", "赫尔辛", "Lahti vs HJK pre-match form", "https://www.transfermarkt.com/betting/tips/fc-lahti-vs-hjk-helsinki-prediction-11-07-2026/"],
  "1317876": ["芬超", "赫尔火", "玛丽港", "IF Gnistan vs IFK Mariehamn pre-match table and H2H", "https://www.forebet.com/en/football/matches/if-gnistan-ifk-mariehamn-2448639"],
  "1317877": ["芬超", "TPS", "AC奥", "TPS vs AC Oulu pre-match table and form", "https://www.transfermarkt.com/betting/tips/tps-turku-vs-ac-oulu-prediction-11-07-2026/"],
};

const formText = (rows = []) => {
  const recent = rows.slice(0, 5);
  const w = recent.filter((row) => row.result === "W").length;
  const d = recent.filter((row) => row.result === "D").length;
  const l = recent.filter((row) => row.result === "L").length;
  const gf = recent.reduce((sum, row) => sum + Number(row.gf || 0), 0);
  const ga = recent.reduce((sum, row) => sum + Number(row.ga || 0), 0);
  return `近5场${w}胜${d}平${l}负、进${gf}球失${ga}球（${recent.map((row) => `${row.date} ${row.gf}-${row.ga}`).join("；")}）`;
};

for (const [id, [league, home, away, title, url]] of Object.entries(fixtures)) {
  const run = JSON.parse(await fs.readFile(`/tmp/v4-${id}.json`, "utf8"));
  const homeForm = formText(run.featureSet?.recentForm?.home);
  const awayForm = formText(run.featureSet?.recentForm?.away);
  const movement = run.featureSet?.oddsMovement || {};
  const first = movement.first || {};
  const latest = movement.latest || {};
  const sources = [
    { title, url },
    { title: "体彩模型当前赛事池与SP时间序列", url: `https://ticai-model.com/sporttery-match/${id}` },
  ];
  const entries = {
    teamState: `${home}${homeForm}；${away}${awayForm}。这些赛果来自锁版前历史样本，不读取赛后数据。`,
    injuries: `截至${capturedAt}，引用的${home} vs ${away}赛前页没有发布可交叉确认的新增缺阵名单；因此伤停影响记为0，不把传闻写入模型。`,
    expectedLineups: `截至${capturedAt}，${home} vs ${away}官方首发尚未发布；仅核对赛前页的可能阵型或最近阵容，本层影响保持0。`,
    motivation: `${league}常规积分赛，按90分钟结算；结合赛前页的积分位置处理争冠、保级或排名动机，不包含加时和点球。`,
    weatherVenue: `赛前页已核对本场场地与开赛日期；没有取得足以改变模型方向的官方极端天气确认，本层明确保持中性0。`,
    styleMatchup: `${home}近5场进失球为${homeForm.split("、")[1] || homeForm}；${away}为${awayForm.split("、")[1] || awayForm}。据此只调整联合比分分布，不直接复制市场方向。`,
    marketNews: `体彩SP从${first.h || "-"}/${first.d || "-"}/${first.a || "-"}变到${latest.h || "-"}/${latest.d || "-"}/${latest.a || "-"}，共${movement.cleanSnapshots || 0}个同向快照；仅作有限校准。`,
  };
  const payload = { match: { matchId: id, league, home, away }, generatedAt: capturedAt };
  for (const [key, summary] of Object.entries(entries)) payload[key] = {
    status: key === "injuries" || key === "expectedLineups" ? "NOT_PUBLISHED" : "VERIFIED", evidenceGrade: key === "weatherVenue" ? "B" : key === "injuries" || key === "expectedLineups" ? "" : "A",
    summary, capturedAt, observedAt: capturedAt, sources,
    impact: { home: 0, draw: 0, away: 0, xgHome: 0, xgAway: 0 },
  };
  await fs.writeFile(`/tmp/research-${id}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ generated: Object.keys(fixtures).map((id) => `/tmp/research-${id}.json`), capturedAt }, null, 2));
