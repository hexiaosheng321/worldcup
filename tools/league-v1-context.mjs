import fs from "node:fs/promises";

const TEAM_ALIASES = {
  "首尔FC": ["FC Seoul"],
  "仁川联": ["Incheon United"],
  "光州FC": ["Gwangju FC"],
  "蔚山现代": ["Ulsan Hyundai FC", "Ulsan HD", "Ulsan Hyundai"],
  "金泉尚武": ["Gimcheon Sangmu FC"],
  "济州SK": ["Jeju SK", "Jeju United FC"],
  "卡尔马": ["Kalmar FF", "Kalmar"],
  "厄格里特": ["Orgryte IS", "Örgryte IS"],
  "哥德堡": ["IFK Goteborg", "IFK Göteborg", "IFK Gothenburg"],
  "索尔纳": ["AIK Stockholm", "AIK"],
  "埃夫斯堡": ["IF Elfsborg", "Elfsborg"],
  "哈马比": ["Hammarby FF", "Hammarby"],
  "赫根": ["BK Hacken", "BK Häcken", "Hacken", "Häcken"],
  "佐加顿斯": ["Djurgardens IF", "Djurgårdens IF", "Djurgarden", "Djurgården"],
  "布鲁马波": ["IF Brommapojkarna", "Brommapojkarna"],
  "布鲁马": ["布洛马波卡纳", "布鲁马波卡纳", "IF Brommapojkarna", "Brommapojkarna"],
  "布拉干": ["巴甘蒂诺", "Red Bull Bragantino", "Bragantino"],
  "迈拉索": ["米拉索尔", "Mirassol"],
  "洛城银河": ["洛杉矶银河", "LA Galaxy"],
  "洛杉矶FC": ["Los Angeles FC", "LAFC"],
  "盖斯": ["Gais", "GAIS"],
  "瓦萨": ["VPS", "VPS Vaasa"],
  "塞伊奈": ["SJK", "Seinajoen JK", "Seinäjoen JK"],
  "库普斯": ["KuPS", "KuPS Kuopio"],
};

function extractWindowJson(content = "", name = "") {
  const matched = content.match(new RegExp(`${name}\\s*=\\s*([\\[{][\\s\\S]*[\\]}]);?\\s*$`));
  return matched ? JSON.parse(matched[1]) : null;
}

function normalizeName(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function aliasesFor(team = "") {
  return [team, ...(TEAM_ALIASES[team] || [])].map(normalizeName).filter(Boolean);
}

function sameTeam(left = "", right = "") {
  const leftNames = aliasesFor(left);
  const rightName = normalizeName(right);
  return leftNames.some((name) => name && rightName && (name === rightName || name.includes(rightName) || rightName.includes(name)));
}

function dateKey(value = "") {
  return String(value || "").slice(0, 10);
}

function beforeMatch(sample = {}, beforeDate = "") {
  const sampleDate = dateKey(sample.kickoffTime || sample.matchDate || sample.date);
  return sampleDate && (!beforeDate || sampleDate < beforeDate);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sampleGoals(sample = {}) {
  const home = numberValue(sample.actualHomeGoals);
  const away = numberValue(sample.actualAwayGoals);
  if (home !== null && away !== null) return { home, away };
  const matched = String(sample.score || "").match(/(\d+)\D+(\d+)/);
  if (!matched) return null;
  return { home: Number(matched[1]), away: Number(matched[2]) };
}

function sampleKey(sample = {}) {
  return [
    sample.league,
    dateKey(sample.kickoffTime),
    normalizeName(sample.homeTeam),
    normalizeName(sample.awayTeam),
    sample.score,
  ].join("|");
}

function dedupeSamples(samples = []) {
  const byKey = new Map();
  samples.forEach((sample) => {
    const key = sampleKey(sample);
    const existing = byKey.get(key);
    const source = String(sample.source || "");
    const preferred = source.includes("d1-base-case") || source.includes("api-football");
    if (!existing || preferred) byKey.set(key, sample);
  });
  return [...byKey.values()];
}

function baseCaseToSample(item = {}) {
  const actualHomeGoals = numberValue(item.actualHomeGoals);
  const actualAwayGoals = numberValue(item.actualAwayGoals);
  const odds = [item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp].map(numberValue);
  const quality = String(item.dataQuality || "").toUpperCase();
  if (!item.league || !item.homeTeam || !item.awayTeam || !item.kickoffTime) return null;
  if (actualHomeGoals === null || actualAwayGoals === null || odds.some((value) => value === null || value <= 1)) return null;
  if (!["A", "B", "HIGH", "MEDIUM"].includes(quality)) return null;
  return {
    league: item.league,
    kickoffTime: item.kickoffTime,
    homeTeam: item.homeTeam,
    awayTeam: item.awayTeam,
    actualHomeGoals,
    actualAwayGoals,
    score: `${actualHomeGoals}-${actualAwayGoals}`,
    sportteryHomeSp: odds[0],
    sportteryDrawSp: odds[1],
    sportteryAwaySp: odds[2],
    asianHandicap: numberValue(item.asianHandicap),
    source: "d1-base-case",
    caseId: item.caseId || "",
    sourceLockId: item.sourceLockId || "",
    modelVersion: item.modelVersion || "",
    recommendation: item.recommendation || "",
    dataQuality: quality,
  };
}

function resultForTeam(sample = {}, team = "") {
  const goals = sampleGoals(sample);
  if (!goals) return null;
  const isHome = sameTeam(team, sample.homeTeam);
  const gf = isHome ? goals.home : goals.away;
  const ga = isHome ? goals.away : goals.home;
  return {
    date: dateKey(sample.kickoffTime),
    home: sample.homeTeam,
    away: sample.awayTeam,
    score: `${goals.home}-${goals.away}`,
    gf,
    ga,
    result: gf > ga ? "W" : gf < ga ? "L" : "D",
    venue: isHome ? "home" : "away",
    goals: goals.home + goals.away,
    btts: goals.home > 0 && goals.away > 0,
  };
}

function tableFor(samples = [], league = "", beforeDate = "") {
  const table = new Map();
  const ensure = (team) => {
    const key = normalizeName(team);
    if (!table.has(key)) table.set(key, { team, played: 0, won: 0, draw: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 });
    return table.get(key);
  };
  dedupeSamples(samples)
    .filter((sample) => sample.league === league && beforeMatch(sample, beforeDate))
    .forEach((sample) => {
      const goals = sampleGoals(sample);
      if (!goals) return;
      const home = ensure(sample.homeTeam);
      const away = ensure(sample.awayTeam);
      home.played += 1;
      away.played += 1;
      home.goalsFor += goals.home;
      home.goalsAgainst += goals.away;
      away.goalsFor += goals.away;
      away.goalsAgainst += goals.home;
      if (goals.home > goals.away) {
        home.won += 1; home.points += 3; away.lost += 1;
      } else if (goals.home < goals.away) {
        away.won += 1; away.points += 3; home.lost += 1;
      } else {
        home.draw += 1; away.draw += 1; home.points += 1; away.points += 1;
      }
    });
  return [...table.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
}

export async function loadExternalSamples(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const localSamples = extractWindowJson(content, "window\\.WC_EXTERNAL_HISTORICAL_SAMPLES") || [];
  const apiBase = String(process.env.PUBLIC_API_BASE || "https://ticai-model.com").replace(/\/$/, "");
  const request = (endpoint) => fetch(`${apiBase}${endpoint}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  }).then(async (response) => response.ok ? response.json() : null).catch(() => null);
  const [rollingPayload, casesPayload] = await Promise.all([
    request("/api/historical-samples/rolling?limit=1000"),
    request("/api/cases"),
  ]);
  const rollingSamples = Array.isArray(rollingPayload?.samples) ? rollingPayload.samples : [];
  const baseCaseSamples = (Array.isArray(casesPayload?.cases) ? casesPayload.cases : []).map(baseCaseToSample).filter(Boolean);
  return dedupeSamples([...localSamples, ...rollingSamples, ...baseCaseSamples]);
}

export async function loadSportterySpHistory(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return extractWindowJson(content, "window\\.LIVE_SPORTTERY_SP_HISTORY") || { matches: [] };
}

export function buildTeamState(samples = [], item = {}) {
  const beforeDate = dateKey(item.matchDate || item.ticaiDate || item.date);
  const league = item.league || item.competition || "";
  const leagueRows = dedupeSamples(samples).filter((sample) => sample.league === league && beforeMatch(sample, beforeDate));
  const table = tableFor(leagueRows, league, beforeDate);
  const stateFor = (team) => {
    const recent = leagueRows
      .filter((sample) => sameTeam(team, sample.homeTeam) || sameTeam(team, sample.awayTeam))
      .map((sample) => resultForTeam(sample, team))
      .filter(Boolean)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
    const standingIndex = table.findIndex((row) => sameTeam(team, row.team));
    const standing = standingIndex >= 0 ? table[standingIndex] : null;
    const gf = recent.reduce((sum, row) => sum + row.gf, 0);
    const ga = recent.reduce((sum, row) => sum + row.ga, 0);
    const homeRows = recent.filter((row) => row.venue === "home");
    const awayRows = recent.filter((row) => row.venue === "away");
    const btts = recent.filter((row) => row.btts).length;
    const over25 = recent.filter((row) => row.goals >= 3).length;
    return {
      team,
      rank: standing ? standingIndex + 1 : null,
      points: standing?.points ?? null,
      played: standing?.played ?? null,
      goalsFor: standing?.goalsFor ?? null,
      goalsAgainst: standing?.goalsAgainst ?? null,
      goalDifference: standing?.goalDifference ?? null,
      form: recent.map((row) => row.result).join(","),
      recent,
      recentGoalsFor: gf,
      recentGoalsAgainst: ga,
      homeRecord: homeRows.map((row) => row.result).join(",") || "样本不足",
      awayRecord: awayRows.map((row) => row.result).join(",") || "样本不足",
      bttsRate: recent.length ? `${btts}/${recent.length}` : "样本不足",
      over25Rate: recent.length ? `${over25}/${recent.length}` : "样本不足",
      sourceCount: recent.length,
    };
  };
  const homeState = stateFor(item.home || item.homeTeam || "");
  const awayState = stateFor(item.away || item.awayTeam || "");
  return {
    source: "externalHistoricalSamples",
    beforeDate,
    league,
    hasState: homeState.sourceCount >= 3 && awayState.sourceCount >= 3,
    homeState,
    awayState,
    summary: `${teamStateText(homeState)}；${teamStateText(awayState)}`,
  };
}

export function teamStateText(state = {}) {
  const table = state.rank
    ? `样本排名第${state.rank}，${state.points}分，进${state.goalsFor}失${state.goalsAgainst}，净胜${state.goalDifference}`
    : "样本排名不足";
  const recent = state.recent?.length
    ? `近${state.recent.length}场${state.form}，进${state.recentGoalsFor}失${state.recentGoalsAgainst}，BTTS ${state.bttsRate}，大2.5 ${state.over25Rate}；${state.recent.map((row) => `${row.date} ${row.home}-${row.away} ${row.score}`).join(" / ")}`
    : "近况样本不足";
  return `${state.team}${table}；${recent}`;
}

function spMatchKey(item = {}) {
  return String(item.matchId || item.sportteryKey || "").replace(/^sporttery-/, "");
}

export function findSpHistory(spData = {}, item = {}) {
  const key = spMatchKey(item);
  const no = String(item.no || item.issue || "").replace(/\D/g, "").slice(-3);
  return (spData.matches || []).find((row) => String(row.matchId || "") === key) ||
    (spData.matches || []).find((row) => String(row.no || "").padStart(3, "0") === no && sameTeam(item.home || item.homeTeam, row.home) && sameTeam(item.away || item.awayTeam, row.away)) ||
    null;
}

function movementText(label, first = {}, last = {}) {
  return `${label}${first.updateDate || ""} ${first.updateTime || ""} ${first.h || "-"} / ${first.d || "-"} / ${first.a || "-"} -> ${last.updateDate || ""} ${last.updateTime || ""} ${last.h || "-"} / ${last.d || "-"} / ${last.a || "-"}`;
}

export function summarizeOddsMovement(spData = {}, item = {}) {
  const row = findSpHistory(spData, item);
  if (!row) {
    return {
      hasMovement: false,
      snapshotCount: 0,
      text: "赔率动态层未命中：SP历史和D1快照中没有匹配到本场，不能进入FINAL_LOCK。",
    };
  }
  const had = row.history?.had || [];
  const hhad = row.history?.hhad || [];
  const ttg = row.history?.ttg || [];
  const parts = [];
  if (had.length) parts.push(movementText("胜平负 ", had[0], had.at(-1)));
  if (hhad.length) parts.push(movementText(`让球${hhad.at(-1)?.goalLine || row.handicap || ""} `, hhad[0], hhad.at(-1)));
  if (ttg.length) {
    const first = ttg[0];
    const last = ttg.at(-1);
    parts.push(`总进球 ${first.updateDate || ""} ${first.updateTime || ""} 2球${first.s2 || "-"} / 3球${first.s3 || "-"} -> ${last.updateDate || ""} ${last.updateTime || ""} 2球${last.s2 || "-"} / 3球${last.s3 || "-"}`);
  }
  const snapshotCount = Math.max(had.length, hhad.length, ttg.length);
  return {
    hasMovement: snapshotCount >= 2,
    snapshotCount,
    row,
    text: snapshotCount >= 2
      ? `赔率动态层已补齐：${parts.join("；")}。`
      : `赔率动态层已命中但只有单点快照：${parts.join("；")}。可用于盘口记录，但未满足两态比较硬门槛。`,
  };
}
