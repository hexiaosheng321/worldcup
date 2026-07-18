// app-panels.js — 模型面板、复盘、统计、赔率表
function renderStats() {
  const finished = matches.filter((m) => parseScore(officialScoreForMatch(m)));
  const tournamentTotal = data.tournamentTotalMatches || matches.length;
  const buckets = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
  const bucketCounts = Object.fromEntries(buckets.map((bucket) => [bucket, 0]));
  const scoreCounts = new Map();
  let totalGoals = 0;
  let draws = 0;

  finished.forEach((match) => {
    const scoreText = officialScoreForMatch(match);
    const parsed = parseScore(scoreText);
    totalGoals += parsed.total;
    bucketCounts[goalBucket(parsed.total)] += 1;
    const shape = scoreShape(scoreText);
    scoreCounts.set(shape, (scoreCounts.get(shape) || 0) + 1);
    if (parsed.home === parsed.away) draws += 1;
  });

  const drawRate = finished.length ? ((draws / finished.length) * 100).toFixed(1) : "0.0";
  document.querySelector("#sample-size").textContent = `${finished.length} 场 · 场均 ${
    finished.length ? (totalGoals / finished.length).toFixed(2) : "0.00"
  } 球`;
  const currentDraws = document.querySelector("#current-draws");
  if (currentDraws) currentDraws.textContent = `当前平局 ${draws}/${finished.length} · ${drawRate}%`;
  document.querySelector("#current-draws-2").textContent = `当前平局 ${draws}/${finished.length} · ${drawRate}%`;
  const drawRows = [
    { label: "2026当前", draws, matches: finished.length || 0, rate: drawRate, current: true },
    ...data.historicalDrawRates.map((item) => ({
      label: `${item.year}`,
      draws: item.draws,
      matches: item.matches,
      rate: ((item.draws / item.matches) * 100).toFixed(1),
      current: false,
    })),
  ];
  document.querySelector("#draw-rates").innerHTML = `
    <table class="draw-rate-table">
      <thead>
        <tr><th>年份</th><th>平局</th><th>总场次</th><th>平局率</th></tr>
      </thead>
      <tbody>
        ${drawRows
          .map(
            (item) => `
              <tr class="${item.current ? "current-row" : ""}">
                <td>${item.label}</td>
                <td>${item.draws}</td>
                <td>${item.matches}</td>
                <td>${item.rate}%</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  const historicalScoreRows = [...data.historicalScoreFrequencies
    .reduce((acc, item) => {
      const shape = scoreShape(item.score);
      if (!acc.has(shape)) {
        acc.set(shape, {
          score: shape,
          label: scoreShapeLabel(shape),
          counts: { 2014: 0, 2018: 0, 2022: 0 },
        });
      }
      const row = acc.get(shape);
      [2014, 2018, 2022].forEach((year) => {
        row.counts[year] += item.counts[year] || 0;
      });
      return acc;
    }, new Map())
    .values()];

  document.querySelector("#historical-score-table").innerHTML = `
    <div class="hist-head">
      <span>比分</span>
      <span>2026当前</span>
      <span>2022</span>
      <span>2018</span>
      <span>2014</span>
    </div>
    ${historicalScoreRows
      .map((item) => ({
        ...item,
        currentCount: scoreCounts.get(item.score) || 0,
        historicalTotal: (item.counts[2014] || 0) + (item.counts[2018] || 0) + (item.counts[2022] || 0),
      }))
      .sort((a, b) => b.currentCount - a.currentCount || b.historicalTotal - a.historicalTotal)
      .map((item) => {
        const currentCount = item.currentCount;
        const currentPct = tournamentTotal ? ((currentCount / tournamentTotal) * 100).toFixed(1) : "0.0";
        const cells = [2022, 2018, 2014]
          .map((year) => {
            const count = item.counts[year] || 0;
            const pct = ((count / 64) * 100).toFixed(1);
            return `<span>${count}次 · ${pct}%</span>`;
          })
          .join("");
        return `
          <div class="hist-row">
            <strong>${item.label}</strong>
            <span>${currentCount}次 · ${currentPct}%</span>
            ${cells}
          </div>
        `;
      })
      .join("")}
  `;

  const maxBucket = Math.max(...Object.values(bucketCounts), 1);
  const goalBars = document.querySelector("#goal-bars");
  if (goalBars) {
    goalBars.innerHTML = buckets
      .map((bucket) => {
        const count = bucketCounts[bucket];
        const pct = finished.length ? ((count / finished.length) * 100).toFixed(1) : "0.0";
        return `
          <div class="bar-row">
            <span>${bucket}</span>
            <div class="bar-track"><i style="width:${(count / maxBucket) * 100}%"></i></div>
            <b>${count}</b>
            <em>${pct}%</em>
          </div>
        `;
      })
      .join("");
  }
  renderGoalDistributionChart(bucketCounts, finished.length);
  renderDrawRateChart(drawRows);
  renderScoreFreqChart(scoreCounts, finished.length);

  const scoreRows = [...scoreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  document.querySelector("#score-table").innerHTML =
    scoreRows.length === 0
      ? "<p class='empty'>暂无赛果</p>"
      : scoreRows
          .map(([score, count]) => {
            const pct = ((count / finished.length) * 100).toFixed(1);
            return `<div><strong>${scoreShapeLabel(score)}</strong><span>${count} 次</span><em>${pct}%</em></div>`;
          })
          .join("");
}

const teamStrengthSeeds = {
  巴西: 94,
  法国: 93,
  阿根廷: 92,
  英格兰: 90,
  西班牙: 89,
  葡萄牙: 88,
  德国: 87,
  荷兰: 86,
  比利时: 84,
  哥伦比亚: 82,
  乌拉圭: 81,
  克罗地亚: 80,
  瑞士: 78,
  美国: 77,
  墨西哥: 77,
  摩洛哥: 76,
  塞内加尔: 74,
  日本: 73,
  挪威: 72,
  瑞典: 72,
  土耳其: 71,
  澳大利亚: 69,
  韩国: 69,
  奥地利: 68,
  科特迪瓦: 68,
  厄瓜多尔: 68,
  苏格兰: 67,
  加纳: 66,
  伊朗: 66,
  塞尔维亚: 66,
  捷克: 65,
  埃及: 65,
  突尼斯: 64,
  波黑: 63,
  加拿大: 63,
  巴拉圭: 63,
  南非: 62,
  沙特: 61,
  阿尔及利亚: 61,
  新西兰: 58,
  巴拿马: 57,
  民主刚果: 57,
  乌兹别克斯坦: 56,
  卡塔尔: 55,
  伊拉克: 55,
  约旦: 54,
  佛得角: 53,
  海地: 52,
  库拉索: 50,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pct(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function teamHash(name) {
  return [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function isWorldCupGroupStageMatch(match = {}) {
  return /^[A-L]$/.test(String(match.group || ""));
}

function worldCupGroupStageMatches() {
  return matches.filter(isWorldCupGroupStageMatch);
}

function buildTeamTable() {
  const teamMap = new Map();
  worldCupGroupStageMatches().forEach((match) => {
    [match.home, match.away].forEach((team) => {
      if (!teamMap.has(team)) {
        teamMap.set(team, {
          name: team,
          group: match.group,
          played: 0,
          points: 0,
          gf: 0,
          ga: 0,
        });
      }
    });
    const parsed = parseScore(officialScoreForMatch(match));
    if (!parsed) return;
    const home = teamMap.get(match.home);
    const away = teamMap.get(match.away);
    home.played += 1;
    away.played += 1;
    home.gf += parsed.home;
    home.ga += parsed.away;
    away.gf += parsed.away;
    away.ga += parsed.home;
    if (parsed.home > parsed.away) {
      home.points += 3;
    } else if (parsed.home < parsed.away) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  });

  return [...teamMap.values()].map((team) => {
    const strength = teamStrengthSeeds[team.name] || 56 + (teamHash(team.name) % 16);
    const gd = team.gf - team.ga;
    const remaining = 3 - team.played;
    const momentum = team.points * 7 + gd * 3 + team.gf * 0.8 + remaining * 1.8;
    const power = clamp(strength + momentum, 34, 116);
    const groupAdvance = clamp(18 + (power - 48) * 1.1 + team.points * 6 + gd * 2.2, 6, 96);
    const r32 = clamp(groupAdvance * (0.52 + strength / 220), 4, 86);
    const r16 = clamp(r32 * (0.42 + strength / 250), 2, 72);
    const qf = clamp(r16 * (0.4 + strength / 260), 1, 58);
    const sf = clamp(qf * (0.38 + strength / 280), 0.5, 43);
    const final = clamp(sf * (0.36 + strength / 300), 0.2, 31);
    const title = clamp(final * (0.34 + strength / 320), 0.1, 22);
    return {
      ...team,
      strength,
      gd,
      remaining,
      power,
      groupAdvance,
      r32,
      r16,
      qf,
      sf,
      final,
      title,
    };
  });
}

function pathStage(team) {
  if (team.title >= 10) return "冠军候选";
  if (team.final >= 10) return "决赛圈";
  if (team.sf >= 10) return "四强线";
  if (team.qf >= 12) return "八强线";
  if (team.r16 >= 18) return "淘汰赛线";
  return "小组突围线";
}

function renderPathBars(team) {
  const stages = [
    ["出线", team.groupAdvance],
    ["32强胜", team.r32],
    ["16强", team.r16],
    ["8强", team.qf],
    ["4强", team.sf],
    ["决赛", team.final],
    ["冠军", team.title],
  ];
  return stages
    .map(([label, value]) => `
      <span class="path-mini-stage">
        <i style="height:${Math.max(value, 3)}%"></i>
        <em>${label}</em>
        <b>${pct(value)}</b>
      </span>
    `)
    .join("");
}

function renderPath() {
  const board = document.querySelector("#path-board");
  if (!board) return;
  if (!worldCupStaticDataLoaded && !matches.length) {
    board.innerHTML = dataLoadingMarkup(
      "正在同步世界杯数据",
      "正在读取小组积分、最佳第三线和晋级路径模拟数据。"
    );
    return;
  }
  const teams = buildTeamTable();
  const groupStageMatches = worldCupGroupStageMatches();
  const groupRows = [...teams.reduce((acc, team) => {
    if (!acc.has(team.group)) acc.set(team.group, []);
    acc.get(team.group).push(team);
    return acc;
  }, new Map()).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => [
      group,
      items
        .slice()
        .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)),
    ]);

  const thirdTeams = groupRows
    .map(([group, items]) => ({ ...items[2], group }))
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
  const bestThirdNames = new Set(thirdTeams.slice(0, 8).map((team) => `${team.group}-${team.name}`));
  const groupCount = new Set(teams.map((team) => team.group)).size;
  const alreadyPlayed = groupStageMatches.filter((match) => parseScore(officialScoreForMatch(match))).length;
  const finishedGoals = groupStageMatches
    .filter((match) => parseScore(officialScoreForMatch(match)))
    .reduce((sum, match) => sum + parseScore(officialScoreForMatch(match)).total, 0);
  const averageGoals = alreadyPlayed ? (finishedGoals / alreadyPlayed).toFixed(2) : "0.00";
  const signalFinished = document.querySelector("#signal-finished");
  const signalUpcoming = document.querySelector("#signal-upcoming");
  const signalPredicted = document.querySelector("#signal-predicted");
  const signalGoals = document.querySelector("#signal-goals");
  if (signalFinished) signalFinished.textContent = alreadyPlayed;
  if (signalUpcoming) signalUpcoming.textContent = Math.max(matches.length - alreadyPlayed, 0);
  if (signalPredicted) signalPredicted.textContent = uniquePredictionCount();
  if (signalGoals) signalGoals.textContent = averageGoals;
  const pathLeaders = teams
    .slice()
    .sort((a, b) => b.title - a.title || b.final - a.final)
    .slice(0, 8);
  const knockoutBubble = teams
    .slice()
    .sort((a, b) => b.groupAdvance - a.groupAdvance)
    .slice(22, 32);

  const zoneLabel = (rank, team) => {
    if (rank <= 2) return { text: "直接出线", className: "direct" };
    if (rank === 3 && bestThirdNames.has(`${team.group}-${team.name}`)) return { text: "最佳第三", className: "third" };
    if (rank === 3) return { text: "第三待定", className: "watch" };
    return { text: "追分区", className: "chase" };
  };

  const formDots = (team) => {
    const results = groupStageMatches
      .filter((match) => (match.home === team.name || match.away === team.name) && parseScore(officialScoreForMatch(match)))
      .map((match) => {
        const parsed = parseScore(officialScoreForMatch(match));
        const homeSide = match.home === team.name;
        const goalsFor = homeSide ? parsed.home : parsed.away;
        const goalsAgainst = homeSide ? parsed.away : parsed.home;
        if (goalsFor > goalsAgainst) return "W";
        if (goalsFor < goalsAgainst) return "L";
        return "D";
      });
    return results.length
      ? results.map((item) => `<i class="${item.toLowerCase()}">${item}</i>`).join("")
      : "<span>待赛</span>";
  };

  board.innerHTML = `
    <div class="standings-summary">
      <article><span>参赛球队</span><strong>${teams.length}</strong><em>${groupCount} 个小组</em></article>
      <article><span>已完赛</span><strong>${alreadyPlayed}</strong><em>小组赛进程</em></article>
      <article><span>当前场均</span><strong>${averageGoals}</strong><em>总进球 ${finishedGoals}</em></article>
      <article><span>最佳第三线</span><strong>${thirdTeams[7]?.points ?? 0}分</strong><em>第 8 名第三</em></article>
    </div>

    <section class="standings-board">
      <div class="stat-title-line">
        <h3>小组积分榜</h3>
        <span class="mini-pill">积分 / 净胜球 / 进球数排序</span>
      </div>
      <div class="standings-grid">
        ${groupRows
          .map(([group, items]) => `
            <section class="standing-group">
              <div class="standing-group-head">
                <strong>${group}组</strong>
                <span>${items.reduce((sum, team) => sum + team.played, 0) / 2}/6 场</span>
              </div>
              <div class="standing-table">
                <div class="standing-row standing-row-head">
                  <span>排名</span><span>球队</span><span>赛</span><span>胜</span><span>平</span><span>负</span><span>进/失</span><span>净</span><span>分</span><span>走势</span>
                </div>
                ${items
                  .map((team, index) => {
                    const rank = index + 1;
                    const zone = zoneLabel(rank, team);
                    const wins = groupStageMatches.filter((match) => {
                      const parsed = parseScore(officialScoreForMatch(match));
                      if (!parsed) return false;
                      return (match.home === team.name && parsed.home > parsed.away) || (match.away === team.name && parsed.away > parsed.home);
                    }).length;
                    const draws = groupStageMatches.filter((match) => {
                      const parsed = parseScore(officialScoreForMatch(match));
                      return parsed && (match.home === team.name || match.away === team.name) && parsed.home === parsed.away;
                    }).length;
                    const losses = team.played - wins - draws;
                    return `
                      <article class="standing-row ${zone.className}">
                        <span class="standing-rank">${rank}</span>
                        <span class="standing-team"><strong>${team.name}</strong><em>${zone.text}</em></span>
                        <span>${team.played}</span>
                        <span>${wins}</span>
                        <span>${draws}</span>
                        <span>${losses}</span>
                        <span>${team.gf}/${team.ga}</span>
                        <span>${team.gd >= 0 ? "+" : ""}${team.gd}</span>
                        <span class="standing-points">${team.points}</span>
                        <span class="form-dots">${formDots(team)}</span>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `)
          .join("")}
      </div>
    </section>

    <section class="third-race">
      <div class="stat-title-line">
        <h3>最佳第三竞争线</h3>
        <span class="mini-pill">12 进 8</span>
      </div>
      <div class="third-race-grid">
        ${thirdTeams
          .map((team, index) => `
            <article class="third-chip ${index < 8 ? "alive" : "outside"}">
              <span>${index + 1}</span>
              <strong>${team.group}组 ${team.name}</strong>
              <em>${team.points}分 ｜ 净胜${team.gd >= 0 ? "+" : ""}${team.gd}</em>
            </article>
          `)
          .join("")}
      </div>
    </section>

    <section class="path-simulation">
      <div class="stat-title-line">
        <h3>晋级路径模拟</h3>
        <span class="mini-pill">积分 + 强度种子 + 剩余赛程</span>
      </div>
      <div class="path-simulation-grid">
        ${pathLeaders
          .map((team) => `
            <article>
              <span>${team.group}组 ${pathStage(team)}</span>
              <strong>${team.name}</strong>
              <div class="path-stage-bars">${renderPathBars(team)}</div>
            </article>
          `)
          .join("")}
      </div>
      <div class="path-bubble-line">
        <b>32 强边缘线</b>
        ${knockoutBubble
          .map((team) => `<span>${team.group}组 ${team.name} ${pct(team.groupAdvance, 0)}</span>`)
          .join("")}
      </div>
    </section>
  `;
}

const knockoutRoundPlan = [
  { key: "r32", title: "32强赛", note: "16 场", nos: rangeNos(73, 88) },
  { key: "r16", title: "16强赛", note: "8 场", nos: rangeNos(89, 96) },
  { key: "qf", title: "8强赛", note: "4 场", nos: rangeNos(97, 100) },
  { key: "sf", title: "半决赛", note: "2 场", nos: rangeNos(101, 102) },
  { key: "final", title: "决赛", note: "1 场", nos: ["104"] },
];

function rangeNos(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index).padStart(3, "0"));
}

function knockoutMatchByNo(no) {
  const targetNo = normalizedIssueNo(no);
  const staticMatch = matches.find((match) => normalizedIssueNo(match.no) === targetNo);
  if (staticMatch) return staticMatch;
  const sportteryMatch = findOddsRow([...(resultsData.results || []), ...(oddsData.matches || [])], targetNo);
  if (!sportteryMatch || !/世界杯/.test(String(sportteryMatch.league || sportteryMatch.competition || ""))) return null;
  const score = normalizeResultScore(sportteryMatch.score);
  return {
    no: targetNo,
    date: sportteryMatch.matchDate || sportteryMatch.ticaiDate || sportteryMatch.date || "",
    group: "32强",
    home: sportteryMatch.home || "",
    away: sportteryMatch.away || "",
    score,
    matchId: sportteryMatch.matchId || "",
    issue: sportteryMatch.issue || "",
    ticaiDate: sportteryMatch.ticaiDate || "",
    matchDate: sportteryMatch.matchDate || "",
    halfScore: sportteryMatch.halfScore || "",
    winner: sportteryMatch.winner || "",
    winnerSide: sportteryMatch.winnerSide || "",
    penaltyScore: sportteryMatch.penaltyScore || "",
    scoreDuration: sportteryMatch.scoreDuration || "",
  };
}

function knockoutWinner(match) {
  const scoreText = match ? officialScoreForMatch(match) : "";
  const parsed = parseScore(scoreText);
  const odds = match ? oddsMatch(match) : null;
  const liveScore = match ? liveScoreForSportteryItem({ ...match, ...odds }) : null;
  const explicitWinner = match?.winner || liveScore?.winnerZh || "";
  if (!parsed) return explicitWinner;
  if (parsed.home > parsed.away) return match.home;
  if (parsed.home < parsed.away) return match.away;
  if (explicitWinner) return explicitWinner;
  const winnerSide = match?.winnerSide || liveScore?.winnerSide || "";
  if (/HOME/i.test(winnerSide)) return match.home;
  if (/AWAY/i.test(winnerSide)) return match.away;
  return "";
}

function previousKnockoutSources(roundIndex, matchIndex) {
  return [];
}

function knockoutParticipant(match, side, sources, sourceIndex) {
  if (match?.[side]) return match[side];
  return "待定";
}

function knockoutSlot(round, roundIndex, no, matchIndex) {
  const match = knockoutMatchByNo(no);
  const sources = previousKnockoutSources(roundIndex, matchIndex);
  const home = knockoutParticipant(match, "home", sources, 0);
  const away = knockoutParticipant(match, "away", sources, 1);
  const scoreText = match ? officialScoreForMatch(match) : "";
  const parsed = parseScore(scoreText);
  const winner = knockoutWinner(match);
  const liveScore = match ? liveScoreForSportteryItem({ ...match, ...oddsMatch(match) }) : null;
  const penaltyScore = match?.penaltyScore || liveScore?.penaltyScore || "";
  const duration = match?.scoreDuration || liveScore?.scoreDuration || "";
  const status = parsed
    ? (winner
        ? (penaltyScore || /PENALTY/i.test(duration) ? `点球胜者 ${winner}` : `已产生胜者 ${winner}`)
        : "加时/点球待补")
    : match ? "待赛" : "待定";
  const date = match?.date ? formatDate(match.date) : "时间待定";
  return {
    no,
    roundKey: round.key,
    roundTitle: round.title,
    match,
    home,
    away,
    score: scoreText || "",
    winner,
    status,
    date,
    penaltyScore,
    scoreDuration: duration,
    sources,
  };
}

function renderKnockoutTeam(name, winner) {
  const isPlaceholder = !name || name === "待定";
  const flag = !isPlaceholder && teamFlags[name] ? `<em>${teamFlags[name]}</em>` : "";
  return `
    <span class="knockout-team ${winner && winner === name ? "winner" : ""} ${isPlaceholder ? "pending" : ""}">
      ${flag}<b>${name || "待定"}</b>
    </span>
  `;
}

function renderKnockoutCard(slot, index) {
  const actionable = Boolean(slot.match);
  const sourceText = slot.sources.length ? slot.sources.map((item) => `${item}胜者`).join(" / ") : "";
  return `
    <article class="knockout-card ${slot.winner ? "finished" : ""} ${actionable ? "actionable" : "pending"}"
      ${actionable ? `data-knockout-match="${slot.no}"` : ""}
      style="--slot-index:${index}">
      <div class="knockout-card-meta">
        <span>${slot.no}</span>
        <em>${slot.date}</em>
      </div>
      <div class="knockout-card-body">
        ${renderKnockoutTeam(slot.home, slot.winner)}
        <strong>${slot.score || "vs"}</strong>
        ${renderKnockoutTeam(slot.away, slot.winner)}
      </div>
      <div class="knockout-card-foot">
        <span>${slot.status}</span>
        ${slot.penaltyScore ? `<em>点球 ${slot.penaltyScore}</em>` : sourceText ? `<em>${sourceText}</em>` : `<em>${slot.match?.group || slot.roundTitle}</em>`}
      </div>
    </article>
  `;
}

function renderKnockout() {
  const board = document.querySelector("#knockout-board");
  if (!board) return;
  const rounds = knockoutRoundPlan.map((round, roundIndex) => ({
    ...round,
    slots: round.nos.map((no, matchIndex) => knockoutSlot(round, roundIndex, no, matchIndex)),
  }));
  const allSlots = rounds.flatMap((round) => round.slots);
  const finished = allSlots.filter((slot) => slot.winner).length;
  const scheduled = allSlots.filter((slot) => slot.match).length;
  const champion = rounds.at(-1)?.slots[0]?.winner || "待定";
  const nextSlot =
    allSlots.find((slot) => slot.match && !parseScore(officialScoreForMatch(slot.match))) ||
    allSlots.find((slot) => !slot.match);

  board.innerHTML = `
    <section class="knockout-hero-card">
      <div>
        <p class="eyebrow">Road To Final</p>
        <h3>世界杯淘汰赛路径</h3>
        <p>八分之一按已确认赛程展示；后续未确认对阵统一待定，不做自动推导。</p>
      </div>
      <div class="knockout-hero-stats">
        <article><span>已产生胜者</span><strong>${finished}</strong><em>${scheduled} 场已挂入签表</em></article>
        <article><span>下一节点</span><strong>${nextSlot?.no || "待定"}</strong><em>${nextSlot?.date || "时间待定"}</em></article>
        <article><span>冠军</span><strong>${champion}</strong><em>待决赛结果确认</em></article>
      </div>
    </section>
    <section class="knockout-bracket-shell" aria-label="世界杯淘汰赛签表">
      <div class="knockout-bracket">
        ${rounds
          .map((round, roundIndex) => `
            <section class="knockout-round ${round.key}">
              <div class="knockout-round-head">
                <strong>${round.title}</strong>
                <span>${round.note}</span>
              </div>
              <div class="knockout-round-list">
                ${round.slots.map((slot, index) => renderKnockoutCard(slot, roundIndex * 20 + index)).join("")}
              </div>
            </section>
          `)
          .join("")}
      </div>
    </section>
  `;
}

function renderSiteLocks() {
  const target = document.querySelector("#site-locks-list");
  if (!target) return;
  const rows = modelAuditRows()
    .slice()
    .sort((a, b) => {
      const dateCompare = String(b.match.date || "").localeCompare(String(a.match.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.match.no || 0) - Number(a.match.no || 0);
    });
  target.innerHTML = rows.length
    ? rows
        .map(({ match, pred, competition, review }) => {
          const keyAttr = match.sportteryKey
            ? `data-lock-sporttery="${match.sportteryKey}"`
            : `data-lock-worldcup="${match.no}"`;
          const caseStatus = caseBaseStatus(pred, match);
          const lock = caseStatus.lock;
          return `
            <article class="site-lock-card" ${keyAttr} data-site-lock-no="${match.no}">
              <div class="site-lock-head">
                <div>
                  <span>${dash(competition)} · ${dash(pred.issue || match.no)}</span>
                  <h3>${match.home} vs ${match.away}</h3>
                </div>
                <b>${predictionVersionLabel(pred)}</b>
              </div>
              <div class="site-lock-meta">
                <span>${formatDate(pred.date || match.date)}</span>
                <span>${pred.matchType || "待分类"}</span>
                <span>${confidenceGrade(pred)}</span>
                <span>${pred.advice || confidenceAdvice(confidenceGrade(pred))}</span>
                <span>lockedAt ${dash(lock?.lockedAt)}</span>
                <span>${dash(lock?.lockType)}</span>
                <span>finalGrade ${dash(lock?.finalGrade)}</span>
                <span>finalAction ${dash(lock?.finalAction)}</span>
                <span>resultStatus ${dash(caseStatus.hitStatus)}</span>
                <span>Case ${caseStatus.generated ? "已生成" : "未生成"}</span>
              </div>
              <div class="site-lock-picks">
                <strong>胜平负 ${dash(pred.pick)}</strong>
                <span>让球 ${dash(review.hPick)}</span>
                <span>总进球 ${dash(pred.totalGoalsPick)}</span>
                <span>比分 ${dash(pred.mainScore)} / ${dash(pred.counterScore)}</span>
              </div>
              <p>${displayModelText(pred.keyJudgement || pred.marketGap || pred.script || "已锁版，等待复盘。")}</p>
            </article>
          `;
        })
        .join("")
    : !cloudBootstrapAttempted
      ? dataLoadingMarkup("正在同步锁版记录", "正在读取 Cloudflare D1 的 FINAL_LOCK 和 PRE_LOCK 记录。")
    : "<p class='empty'>暂无赛事推演锁版记录</p>";
}

function totalGoalsOptions(pick) {
  if (!pick) return [];
  return String(pick)
    .replace(/球/g, "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
}

function totalGoalsHit(pick, score) {
  const parsed = parseScore(score);
  if (!parsed || !pick) return null;
  const actual = parsed.total >= 7 ? "7+" : String(parsed.total);
  return totalGoalsOptions(pick).includes(actual);
}

function scoreTotal(score) {
  return parseScore(score)?.total ?? null;
}

function scoreTotals(pred) {
  return [scoreTotal(pred?.mainScore), scoreTotal(pred?.counterScore)].filter((item) => item !== null);
}

function matchTypeByTotal(total) {
  if (total === null || total === undefined) return "";
  if (total <= 1) return "闷局";
  if (total <= 3) return "常规局";
  if (total === 4) return "开放局";
  return "打花局";
}

function modelMatchType(pred) {
  if (pred.matchType) return pred.matchType;
  const totals = scoreTotals(pred);
  const maxScoreTotal = totals.length ? Math.max(...totals) : 0;
  const goals = totalGoalsOptions(pred.totalGoalsPick).map((item) => (item === "7+" ? 7 : Number(item))).filter((item) => !Number.isNaN(item));
  const maxGoalPick = goals.length ? Math.max(...goals) : 0;
  const top = Math.max(maxScoreTotal, maxGoalPick);
  return matchTypeByTotal(top || null) || "待判";
}

function actualMatchType(score) {
  const parsed = parseScore(score);
  return parsed ? matchTypeByTotal(parsed.total) : "";
}

function matchTypeHit(pred, score) {
  const actual = actualMatchType(score);
  if (!actual) return null;
  return modelMatchType(pred) === actual;
}

function confidenceGrade(pred) {
  const raw = pred?.confidence ?? pred?.confidenceScore ?? pred?.confidence_score;
  const text = String(raw ?? "").trim().toUpperCase();
  if (/^A(?:-)?$/.test(text)) return "A";
  if (/^B(?:\+|-)?$/.test(text)) return "B";
  if (/^C(?:\+|-)?$/.test(text)) return "C";
  if (text === "D") return "D";
  const score = Number.parseFloat(text.replace("%", ""));
  if (!Number.isFinite(score)) return "未评级";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "D";
}

function confidenceAdvice(grade) {
  return {
    A: "主打",
    B: "可选",
    C: "谨慎",
    D: "证据不足",
  }[grade] || "旧模型不计入";
}

function confidenceTone(grade) {
  if (grade === "A") return "hot";
  if (grade === "B") return "warm";
  if (grade === "C") return "watch";
  return "cold";
}

function lockedField(value) {
  return value ? displayModelText(value) : "待赛前锁定";
}

function scorePoolForType(type) {
  return {
    闷局: "0-0 / 1-0 / 0-1 / 1-1",
    常规局: "1-0 / 2-0 / 2-1 / 1-1",
    开放局: "3-1 / 2-2 / 3-0 / 1-2",
    打花局: "4-0 / 4-1 / 5-1 / 3-0",
  }[type] || "等待筛选";
}

function advancedFilter(pred) {
  const type = modelMatchType(pred);
  const grade = confidenceGrade(pred);
  const totals = scoreTotals(pred);
  const maxScoreTotal = totals.length ? Math.max(...totals) : 0;
  const favoritePush =
    maxScoreTotal >= 4 || /继续|净胜球|第二球|第三球|打花|穿/.test(`${pred.groupSituation || ""}${pred.script || ""}${pred.keyJudgement || ""}`);
  const underdogReal =
    /低位|拖|守|韧性|防守|一球小胜|只赢/.test(`${pred.script || ""}${pred.marketGap || ""}${pred.noiseFilter || ""}`) &&
    !/打穿|崩|持续性差|体能下降/.test(`${pred.noiseFilter || ""}${pred.keyJudgement || ""}`);
  const institutionFear =
    /让负|不穿|平局|防平|一球|低比分/.test(`${pred.handicap || ""}${pred.marketGap || ""}${pred.institutionLine || ""}`)
      ? "防不穿/防平"
      : /让胜|穿|深盘|打花|净胜球/.test(`${pred.handicap || ""}${pred.marketGap || ""}${pred.institutionLine || ""}`)
        ? "防穿盘/打花"
        : "方向保护";
  const excludedNoise = pred.noiseFilter ? "已排噪" : "待补排噪";
  return {
    type,
    grade,
    advice: confidenceAdvice(grade),
    scorePool: scorePoolForType(type),
    favoriteIntent: favoritePush ? "有追第二/第三球条件" : "胜向优先，追深需谨慎",
    underdogResistance: underdogReal ? "抵抗偏真实" : "抵抗需防结果假象",
    institutionFear,
    excludedNoise,
    lineMovement: lockedField(pred.lineMovement),
    eventRisk: lockedField(pred.eventRisk),
    scoreElimination: lockedField(pred.scoreElimination),
    keyFailureRisk: lockedField(pred.keyFailureRisk),
  };
}

function predictionReviewData(pred, match) {
  const scoreText = match ? officialScoreForMatch(match) : "";
  const actualDirection = direction(scoreText);
  const actualHandicapDirection = handicapDirection(scoreText, reviewHandicapLine(pred));
  const hPick = handicapPick(pred);
  const lifecycle = match?.reviewLifecycle || sportteryReviewLifecycle(match || {}, pred, null, scoreText);
  const unavailableSelection = (value) => ["未开售", "不开盘"].includes(String(value ?? "").trim());
  const marketAvailability = {
    winDrawLose: pred?.marketAvailability?.winDrawLose !== false && !unavailableSelection(pred?.pick),
    handicap: pred?.marketAvailability?.handicap !== false && !unavailableSelection(hPick),
    totalGoals: pred?.marketAvailability?.totalGoals !== false && !unavailableSelection(pred?.totalGoalsPick),
    scores:
      pred?.marketAvailability?.scores !== false &&
      ![pred?.mainScore, pred?.counterScore].some((value) => unavailableSelection(value)),
  };
  return {
    pred,
    lifecycle,
    marketAvailability,
    actualDirection,
    actualHandicapDirection,
    hPick,
    directionHit: actualDirection && marketAvailability.winDrawLose ? pred.pick === actualDirection : null,
    handicapHit: actualHandicapDirection && marketAvailability.handicap ? hPick === actualHandicapDirection : null,
    totalGoalsHit: marketAvailability.totalGoals ? totalGoalsHit(pred.totalGoalsPick, scoreText) : null,
    mainHit: scoreText && marketAvailability.scores ? pred.mainScore === scoreText : null,
    counterHit: scoreText && marketAvailability.scores ? pred.counterScore === scoreText : null,
    scoreHit: scoreText && marketAvailability.scores ? pred.mainScore === scoreText || pred.counterScore === scoreText : null,
    matchType: modelMatchType(pred),
    actualMatchType: actualMatchType(scoreText),
    matchTypeHit: matchTypeHit(pred, scoreText),
    confidence: confidenceGrade(pred),
    advice: confidenceAdvice(confidenceGrade(pred)),
  };
}

function predictedGoalAverage(pred) {
  const totals = scoreTotals(pred);
  if (!totals.length) return null;
  return totals.reduce((sum, item) => sum + item, 0) / totals.length;
}

function reviewAttribution(pred, match, review = predictionReviewData(pred, match)) {
  const lifecycle = review.lifecycle || match?.reviewLifecycle;
  if (!review.actualDirection && lifecycle && lifecycle.code !== "PENDING") {
    return {
      type: lifecycle.label,
      severity: lifecycle.severity,
      note: lifecycle.note,
    };
  }
  if (!review.actualDirection) {
    return {
      type: "待赛果",
      severity: "pending",
      note: "比赛未结束，暂不归因。",
    };
  }
  const reasons = [];
  const parsed = parseScore(match ? officialScoreForMatch(match) : "");
  const gate = autoDecisionGate(match?.no, pred);
  const consistency = marketConsistency(match?.no, pred);
  const expectedGoals = predictedGoalAverage(pred);

  const evaluatedCoreHits = [review.directionHit, review.handicapHit, review.totalGoalsHit].filter(
    (value) => typeof value === "boolean"
  );
  if (evaluatedCoreHits.length && evaluatedCoreHits.every(Boolean)) {
    reasons.push("核心方向命中");
  } else {
    if (review.directionHit === false) reasons.push("方向错");
    if (review.directionHit === true && review.handicapHit === false) reasons.push("赢球幅度错");
    if (review.totalGoalsHit === false) reasons.push("进球区间错");
  }
  if (review.scoreHit === false) reasons.push("比分峰值偏移");
  if ((consistency.score || 0) < 46 && (review.directionHit === false || review.handicapHit === false)) reasons.push("盘口冲突未降级");
  if (gate.score < 55 && [review.directionHit, review.handicapHit, review.totalGoalsHit].some((value) => value === false)) reasons.push("证据不足，复盘需降权");
  if (Number.isFinite(expectedGoals) && parsed && Math.abs(parsed.total - expectedGoals) >= 2) reasons.push("比赛节奏偏离");
  if (modelEvidenceScore(match?.no, pred).score < 65 && reasons.some((item) => item.includes("错"))) reasons.push("信息证据不足");

  const unique = [...new Set(reasons)];
  const missCount = [review.directionHit, review.handicapHit, review.totalGoalsHit, review.scoreHit].filter((item) => item === false).length;
  return {
    type: unique[0] || "待归因",
    severity: missCount >= 3 ? "high" : missCount >= 1 ? "mid" : "good",
    note: unique.slice(1, 4).join(" / ") || (missCount ? "需要人工复核比赛进程。" : "本场逻辑可进入正样本。"),
  };
}

function hitCell(hit) {
  return `<span class="${hit === null ? "empty-mark" : hit ? "good" : "bad"}">${hit === null ? "-" : hit ? "中" : "未中"}</span>`;
}

function reviewMarketCell(selection, hit, available = true) {
  if (!available || ["未开售", "不开盘"].includes(String(selection ?? "").trim())) {
    return `<span class="market-closed">不开盘</span>`;
  }
  return `<b>${dash(selection)}</b>${hitCell(hit)}`;
}

function dash(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

function hitRate(hits, total) {
  if (!total) return "0.0%";
  return `${((hits / total) * 100).toFixed(1)}%`;
}

function confidenceDirectionBacktests(verifiedRows) {
  return ["A", "B", "C", "D"].map((grade) => {
    const gradeRows = verifiedRows.filter((row) => row.confidence === grade);
    const hits = gradeRows.filter((row) => row.directionHit === true).length;
    return {
      grade,
      hits,
      total: gradeRows.length,
      rate: gradeRows.length ? hitRate(hits, gradeRows.length) : "暂无验证样本",
    };
  });
}

function r15BacktestRows(sourceRows = modelAuditRows()) {
  const engine = window.WC_R15_BACKTEST;
  if (!engine) return [];
  return sourceRows
    .filter(({ pred }) => engine.isR15Prediction(pred))
    .map((row) => {
      const score = officialScoreForMatch(row.match);
      const parsed = parseScore(score);
      const evaluation = engine.evaluatePrediction(row.pred, {
        score,
        direction: direction(score),
        handicap: handicapDirection(score, reviewHandicapLine(row.pred)),
        total: parsed?.total,
      });
      return { ...row, score, evaluation };
    })
    .sort((a, b) => {
      const dateCompare = engine.inferenceDate(b.pred, b.match.date).localeCompare(engine.inferenceDate(a.pred, a.match.date));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.match.no || 0) - Number(a.match.no || 0);
    });
}

function r15BacktestSummary(rows = r15BacktestRows()) {
  return window.WC_R15_BACKTEST?.summarize(rows.map((row) => row.evaluation)) || {
    totalRows: 0,
    verifiedMatches: 0,
    pendingMatches: 0,
    observationOnly: 0,
    metrics: {},
  };
}

function r15DailyReviewRows(rows = r15BacktestRows()) {
  const engine = window.WC_R15_BACKTEST;
  if (!engine?.summarizeDaily) return [];
  return engine.summarizeDaily(rows.map(({ match, pred, score, evaluation, league }) => ({
    date: pred.date || match.date,
    league,
    match,
    pred,
    score,
    evaluation,
  })));
}

const r15DailyMarketLabels = {
  winDrawLose: "胜平负",
  handicap: "让球",
  totalGoals: "总进球",
  scores: "比分",
};

function r15DailyOutcomeMeta(outcome = {}) {
  return {
    HIT: { label: "命中", tone: "hit" },
    PARTIAL: { label: "部分命中", tone: "partial" },
    MISS: { label: "未中", tone: "miss" },
    PENDING: { label: "待验票", tone: "pending" },
  }[outcome.status] || { label: "观察", tone: "observe" };
}

function r15DailyMatchItem(row = {}) {
  const outcome = row.outcome || window.WC_R15_BACKTEST?.evaluationOutcome?.(row.evaluation) || {};
  const status = r15DailyOutcomeMeta(outcome);
  const releasedMarkets = (outcome.formalMarkets || []).map((key) => {
    const market = row.evaluation?.markets?.[key] || {};
    const selection = Array.isArray(market.selection) ? market.selection.join(" / ") : market.selection;
    return `${r15DailyMarketLabels[key] || key} ${dash(selection)}`;
  });
  return `
    <article class="r15-daily-match ${status.tone}">
      <div>
        <span>${dash(row.league)} · ${dash(row.match?.no)}</span>
        ${reviewMatchButton(row.match)}
        <small>${releasedMarkets.join(" · ")}</small>
      </div>
      <aside>
        <b>${dash(row.score || "待赛果")}</b>
        <em>${status.label}</em>
        ${row.evaluation?.verified ? `<small>${outcome.hitCount}/${outcome.totalMarkets} 项正式玩法</small>` : ""}
      </aside>
    </article>
  `;
}

function openR15DailyReviewModal() {
  const dailyRows = r15DailyReviewRows();
  const totalOpened = dailyRows.reduce((sum, row) => sum + row.opened, 0);
  const totalReleased = dailyRows.reduce((sum, row) => sum + row.released, 0);
  const totalVerified = dailyRows.reduce((sum, row) => sum + row.verified, 0);
  const totalHits = dailyRows.reduce((sum, row) => sum + row.hits, 0);
  const tableRows = dailyRows.map((day) => `
    <tr>
      <td><strong>${dash(day.date)}</strong><small>${formatDate(day.date)}</small></td>
      <td><strong>${day.opened}</strong><small>场R15推演</small></td>
      <td><strong>${day.released}</strong><small>${day.opened ? `${((day.released / day.opened) * 100).toFixed(1)}% 放行` : "0.0% 放行"}</small></td>
      <td><div class="r15-daily-match-list">${day.matches.map(r15DailyMatchItem).join("") || "<span class='empty-mark'>当日无正式放行</span>"}</div></td>
      <td><strong>${day.verified}</strong><small>${day.pending} 场待验票</small></td>
      <td><strong>${day.hits}</strong><small>${day.partial} 场部分命中 · ${day.misses} 场未中</small></td>
      <td><strong>${day.verified ? `${day.hits}/${day.verified}` : "-"}</strong><small>${day.rate === null ? "等待赛果" : `${(day.rate * 100).toFixed(1)}%`}</small></td>
    </tr>
  `).join("") || `<tr><td colspan="7" class="empty-cell">尚未读取到每日R15记录</td></tr>`;

  const modal = document.createElement("div");
  modal.className = "global-stats-modal r15-daily-review-modal";
  modal.innerHTML = `
    <div class="global-stats-dialog r15-daily-review-dialog" role="dialog" aria-modal="true" aria-label="R15每日放行复盘">
      <header>
        <div>
          <span>DAILY RELEASE REVIEW</span>
          <strong>每日放行复盘</strong>
          <em>每天按北京时间锁版日汇总推演记录、正式放行比赛与赛果命中；当场全部正式放行玩法均中，才计为命中一场。</em>
        </div>
        <button type="button" data-global-stats-close aria-label="关闭每日放行复盘">×</button>
      </header>
      <div class="global-stats-dialog-body r15-daily-review-body">
        <section class="r15-daily-overview">
          <article><span>推演日期</span><strong>${dailyRows.length}</strong><em>按北京时间锁版日聚合</em></article>
          <article><span>累计推演</span><strong>${totalOpened}</strong><em>R15 / R15a 记录</em></article>
          <article><span>累计放行</span><strong>${totalReleased}</strong><em>至少一个正式玩法</em></article>
          <article><span>完成验票</span><strong>${totalVerified}</strong><em>${Math.max(0, totalReleased - totalVerified)} 场等待赛果</em></article>
          <article class="is-hit"><span>命中场次</span><strong>${totalHits}<small>/${totalVerified}</small></strong><em>${totalVerified ? hitRate(totalHits, totalVerified) : "暂无已验样本"}</em></article>
        </section>
        <section class="r15-daily-rule">
          <b>每日口径</b>
          <span>推演日 = lockedAt 北京时间</span>
          <span>推演 = 当日完成的R15记录</span>
          <span>挑出 = 至少一个 formalSelection</span>
          <span>命中 = 当场正式放行玩法全部命中</span>
          <span>部分命中单列，不计整场命中</span>
        </section>
        <section class="r15-daily-table-wrap">
          <div class="global-stats-table-toolbar r15-daily-toolbar">
            <div><span>每日放行账本</span><strong>${dailyRows.length} 个推演日 · ${totalReleased} 场正式放行 · ${totalHits}/${totalVerified || 0} 场命中</strong></div>
          </div>
          <div class="review-record-wrap compact r15-daily-scroll">
            <table class="review-record-table r15-daily-table">
              <thead><tr><th>推演日</th><th>当日推演</th><th>正式放行</th><th>放行比赛与结果</th><th>已验票</th><th>命中场次</th><th>命中率</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function renderR15BacktestEntry(sourceRows = modelAuditRows()) {
  const target = document.querySelector("#r15-backtest-entry");
  if (!target) return;
  const rows = r15BacktestRows(sourceRows);
  const summary = r15BacktestSummary(rows);
  const progress = Math.min(100, (summary.verifiedMatches / 30) * 100);
  const remaining = Math.max(0, 30 - summary.verifiedMatches);
  target.innerHTML = `
    <button type="button" class="r15-backtest-launch" data-r15-backtest-open>
      <span class="r15-launch-index">R15</span>
      <span class="r15-launch-copy">
        <b>专项回测窗口</b>
        <strong>${summary.verifiedMatches}<small>/30 场首轮样本</small></strong>
        <em>${summary.pendingMatches} 场待验票 · ${remaining ? `还差 ${remaining} 场进入首轮复盘` : "已达到首轮复盘样本线"}</em>
      </span>
      <span class="r15-launch-progress" aria-label="R15首轮样本进度 ${progress.toFixed(0)}%">
        <i style="--r15-progress:${progress}%"></i>
      </span>
      <span class="r15-launch-action">打开专项窗口 <b aria-hidden="true">↗</b></span>
    </button>
  `;
}

function r15GradeBreakdown(metric = {}) {
  const values = ["A", "B", "C", "D"]
    .map((grade) => ({ grade, ...(metric.grades?.[grade] || { hits: 0, total: 0 }) }))
    .filter((item) => item.total > 0);
  return values.length ? values.map((item) => `${item.grade}级 ${item.hits}/${item.total}`).join(" · ") : "等待正式样本";
}

function r15SelectionText(market = {}) {
  if (!market.available) return "未开售";
  if (!market.qualified) return "未放行";
  return Array.isArray(market.selection) ? market.selection.join(" / ") : market.selection;
}

function r15MarketCell(market = {}, verified = false) {
  const status = !market.available
    ? "未开售"
    : !market.qualified
      ? "不计入"
      : !verified
        ? "待验票"
        : market.hit
          ? "命中"
          : "未中";
  const tone = !market.qualified || !verified ? "pending" : market.hit ? "hit" : "miss";
  return `
    <div class="r15-market-result ${tone}">
      <b>${dash(r15SelectionText(market))}</b>
      ${market.qualified ? `<span>${dash(market.grade)}级</span>` : ""}
      <em>${status}</em>
    </div>
  `;
}

function r15SampleStatus(evaluation = {}) {
  if (!evaluation.hasFormal) return { label: "观察", tone: "observe", note: "无正式玩法" };
  if (!evaluation.verified) return { label: "待验票", tone: "pending", note: "不进入分母" };
  return { label: "已计入", tone: "counted", note: "正式样本" };
}

function openR15BacktestModal() {
  const rows = r15BacktestRows();
  const summary = r15BacktestSummary(rows);
  const dailyRows = r15DailyReviewRows(rows);
  const latestDaily = dailyRows[0] || { date: "-", opened: 0, released: 0, verified: 0, hits: 0, rate: null };
  const progress = Math.min(100, (summary.verifiedMatches / 30) * 100);
  const marketMeta = [
    ["winDrawLose", "胜平负单选", "01"],
    ["handicap", "让球单选", "02"],
    ["totalGoals", "总进球双选", "03"],
    ["scores", "比分双选", "04"],
  ];
  const metricCards = marketMeta.map(([key, label, index]) => {
    const metric = summary.metrics[key] || { hits: 0, total: 0, grades: {} };
    return `
      <article class="r15-audit-metric">
        <span>${index} / ${label}</span>
        <strong>${metric.hits}<small>/${metric.total}</small></strong>
        <b>${metric.total ? hitRate(metric.hits, metric.total) : "暂无验证样本"}</b>
        <em>${r15GradeBreakdown(metric)}</em>
      </article>
    `;
  }).join("");
  const tableRows = rows.map(({ match, pred, score, evaluation, league }) => {
    const status = r15SampleStatus(evaluation);
    const inferenceDate = window.WC_R15_BACKTEST.inferenceDate(pred, match.date);
    const matchDate = pred.date || match.date;
    const released = evaluation.hasFormal;
    return `
      <tr class="${released ? "r15-row-released" : "r15-row-observe"}">
        <td><strong>${dash(inferenceDate)}</strong>${matchDate && matchDate !== inferenceDate ? `<small>比赛 ${formatDate(matchDate)}</small>` : ""}</td>
        <td>${dash(league)}</td>
        <td><span class="version-badge">${evaluation.revision}</span><br><small>整包 ${dash(evaluation.overallGrade)}级</small></td>
        <td class="text-cell match-name-cell">${released ? '<span class="r15-release-flag">正式放行</span>' : ""}${reviewMatchButton(match)}</td>
        <td>${dash(score || "待赛果")}</td>
        <td>${r15MarketCell(evaluation.markets.winDrawLose, evaluation.verified)}</td>
        <td>${r15MarketCell(evaluation.markets.handicap, evaluation.verified)}</td>
        <td>${r15MarketCell(evaluation.markets.totalGoals, evaluation.verified)}</td>
        <td>${r15MarketCell(evaluation.markets.scores, evaluation.verified)}</td>
        <td><span class="r15-sample-status ${status.tone}">${status.label}</span><small>${status.note}</small></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="10" class="empty-cell">尚未读取到R15锁版记录</td></tr>`;

  document.querySelector(".global-stats-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "global-stats-modal r15-backtest-modal";
  modal.innerHTML = `
    <div class="global-stats-dialog r15-backtest-dialog" role="dialog" aria-modal="true" aria-label="R15专项回测">
      <header>
        <div>
          <span>R15 PERFORMANCE LEDGER</span>
          <strong>R15专项回测</strong>
          <em>只验正式放行玩法；未开售、候选结论和观察项不进入分母。</em>
        </div>
        <button type="button" data-global-stats-close aria-label="关闭R15专项回测">×</button>
      </header>
      <div class="global-stats-dialog-body r15-backtest-body">
        <section class="r15-sample-ledger">
          <div>
            <span>首轮复盘进度</span>
            <strong>${summary.verifiedMatches}<small>/30</small></strong>
            <em>目标区间 30–50 场 · 以至少一个正式玩法完成验票为一场有效样本</em>
          </div>
          <div class="r15-ledger-track"><i style="--r15-progress:${progress}%"></i></div>
          <dl>
            <div><dt>待验票</dt><dd>${summary.pendingMatches}</dd></div>
            <div><dt>观察/跳过</dt><dd>${summary.observationOnly}</dd></div>
            <div><dt>R15记录</dt><dd>${summary.totalRows}</dd></div>
          </dl>
        </section>
        <button type="button" class="r15-daily-review-launch" data-r15-daily-review-open>
          <span>DAILY / 每日放行复盘</span>
          <strong>${formatDate(latestDaily.date)} · ${latestDaily.opened} 场推演，挑出 ${latestDaily.released} 场</strong>
          <em>${latestDaily.verified ? `已验 ${latestDaily.verified} 场 · 命中 ${latestDaily.hits}/${latestDaily.verified} · ${hitRate(latestDaily.hits, latestDaily.verified)}` : `${latestDaily.released} 场等待官方赛果验票`}</em>
          <b>打开每日复盘窗口 <i aria-hidden="true">↗</i></b>
        </button>
        <section class="r15-audit-grid">${metricCards}</section>
        <section class="r15-scope-note">
          <b>统计口径</b>
          <span>官方90分钟赛果</span>
          <span>逐玩法独立分母</span>
          <span>仅 formalSelections</span>
          <span>R15a并入R15、版本单列</span>
        </section>
        <section class="r15-ledger-table-wrap">
          <div class="global-stats-table-toolbar r15-ledger-toolbar">
            <div><span>逐场审计账本</span><strong>${summary.totalRows} 场R15记录 · ${summary.verifiedMatches} 场已进入有效样本</strong></div>
          </div>
          <div class="review-record-wrap compact r15-ledger-scroll">
            <table class="review-record-table r15-backtest-table">
              <thead><tr><th>推演日</th><th>联赛</th><th>版本/整包</th><th>比赛</th><th>赛果</th><th>胜平负</th><th>让球</th><th>总进球</th><th>比分</th><th>样本状态</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function statsLeagueName(match = {}, pred = {}) {
  const text = [match.league, match.competition, match.group, pred.competition, pred.competitionModel, pred.type].filter(Boolean).join(" ");
  if (/世界杯|World Cup/i.test(text)) return "世界杯";
  if (/韩职|K联赛|K League/i.test(text)) return "韩职";
  if (/芬超|Veikkausliiga/i.test(text)) return "芬超";
  if (/瑞超|Allsvenskan/i.test(text)) return "瑞超";
  if (/日职|J联赛|J1/i.test(text)) return "日职";
  return String(match.league || match.competition || pred.competition || "其他赛事").replace(/\s*(联赛\s*)?V\d+(?:[-\w]*)?\s*模型.*$/i, "").trim() || "其他赛事";
}

function modelAuditRows() {
  const worldCupRows = groupedPredictions()
    .slice()
    .sort((a, b) => a.match.date.localeCompare(b.match.date) || Number(a.match.no) - Number(b.match.no))
    .map(({ match, predictions }) => {
      const sorted = predictions.slice().sort((a, b) => predictionVersionRank(a) - predictionVersionRank(b));
      const pred = sorted[0] || predictions[0];
      const review = predictionReviewData(pred, match);
      return {
        match,
        pred,
        review,
        league: statsLeagueName(match, pred),
        competition: modelDisplayName(pred, match, match.competition || match.league || "世界杯"),
        playType: pred.playType || "竞彩足球",
      };
    });
  const sportteryRows = (data.sportteryPredictions || []).map((pred) => {
    const item = findSportteryItemForPrediction(pred);
    if (hasOfficialWorldCupLock(pred, item)) return null;
    if (sportteryPostponedLockExpired(item || pred, pred)) return null;
    const actualScore = item ? verifiedSportteryScore(item) : "";
    const liveScore = item ? liveScoreForSportteryItem(item) : null;
    const reviewLifecycle = sportteryReviewLifecycle(item || pred, pred, liveScore, actualScore);
    const match = {
      no: pred.no,
      date: pred.date || pred.matchDate,
      matchDate: pred.matchDate || pred.date,
      competition: pred.competition || item?.league || "体彩",
      league: item?.league || pred.competition || "体彩",
      group: pred.competition || item?.league || "体彩",
      home: pred.home,
      away: pred.away,
      score: actualScore,
      sportteryKey: pred.sportteryKey || (item ? sportteryItemKey(item) : ""),
      matchId: pred.matchId || item?.matchId || "",
      currentMatchDate: item?.matchDate || "",
      currentKickoffTime: item?.kickoffTime || "",
      reviewLifecycle,
    };
    return {
      match,
      pred,
      review: predictionReviewData(pred, match),
      league: statsLeagueName(match, pred),
      competition: modelDisplayName(pred, match, pred.competitionModel || pred.competition || "体彩联赛"),
      playType: pred.playType || "竞彩足球",
    };
  }).filter(Boolean);
  return [...worldCupRows, ...sportteryRows].sort((a, b) => {
    const dateCompare = String(a.match.date || "").localeCompare(String(b.match.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(a.match.no || 0) - Number(b.match.no || 0);
  });
}

function globalStatsDateMatches(date, selection, latestDate) {
  if (selection === "all") return true;
  if (selection.startsWith("month:")) return String(date || "").startsWith(selection.slice(6));
  const dayCount = selection === "last7" ? 7 : selection === "last15" ? 15 : 0;
  if (!dayCount) return date === selection;
  const anchor = Date.parse(`${latestDate}T00:00:00+08:00`);
  const target = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(anchor) || !Number.isFinite(target)) return false;
  const ageDays = Math.floor((anchor - target) / 86400000);
  return ageDays >= 0 && ageDays < dayCount;
}

function globalStatsDateLabel(selection) {
  if (selection === "all") return "全部体彩模型记录";
  if (selection === "last7") return "近7天模型记录";
  if (selection === "last15") return "近15天模型记录";
  if (selection.startsWith("month:")) {
    const [year, month] = selection.slice(6).split("-");
    return `${year}年${Number(month)}月模型记录`;
  }
  return `${formatDate(selection)} 模型记录`;
}

function renderGlobalStats() {
  const cards = document.querySelector("#global-stats-cards");
  const table = document.querySelector("#global-stats-table");
  const leagueFilter = document.querySelector("#global-stats-league-filter");
  if (!cards || !table) return;

  const allRows = modelAuditRows();
  renderR15BacktestEntry(allRows);
  const dates = [...new Set(allRows.map(({ match }) => match.date))];
  const latestDate = dates.at(-1) || "";
  const months = [...new Set(dates.map((date) => String(date).slice(0, 7)))].filter(Boolean).sort().reverse();
  const leagues = [...new Set(allRows.map((row) => row.league).filter(Boolean))];
  const validDateSelection = activeGlobalStatsDate === "all"
    || ["last7", "last15"].includes(activeGlobalStatsDate)
    || (activeGlobalStatsDate.startsWith("month:") && months.includes(activeGlobalStatsDate.slice(6)))
    || dates.includes(activeGlobalStatsDate);
  if (!validDateSelection) {
    activeGlobalStatsDate = "last7";
  }
  if (activeGlobalStatsLeague !== "all" && !leagues.includes(activeGlobalStatsLeague)) {
    activeGlobalStatsLeague = "all";
  }
  const visibleRows =
    allRows.filter(({ match, league }) => {
      const dateOk = globalStatsDateMatches(match.date, activeGlobalStatsDate, latestDate);
      const leagueOk = activeGlobalStatsLeague === "all" || league === activeGlobalStatsLeague;
      return dateOk && leagueOk;
    });
  const rows = visibleRows.map((row) => ({ ...row, ...row.review }));

  const verifiedRows = rows.filter((row) => row.actualDirection);
  const directionVerifiedRows = rows.filter((row) => row.directionHit !== null);
  const handicapVerifiedRows = rows.filter((row) => row.handicapHit !== null);
  const totalGoalsVerifiedRows = rows.filter((row) => row.totalGoalsHit !== null);
  const scoreVerifiedRows = rows.filter((row) => row.scoreHit !== null);
  const directionHits = directionVerifiedRows.filter((row) => row.directionHit).length;
  const handicapHits = handicapVerifiedRows.filter((row) => row.handicapHit).length;
  const totalGoalsHits = totalGoalsVerifiedRows.filter((row) => row.totalGoalsHit).length;
  const scoreHits = scoreVerifiedRows.filter((row) => row.scoreHit).length;
  const adviceRows = directionVerifiedRows.filter((row) => ["A", "A-", "B", "B-"].includes(row.confidence));
  const adviceHits = adviceRows.filter((row) => row.directionHit).length;
  const confidenceBacktests = confidenceDirectionBacktests(directionVerifiedRows);
  const postponedRows = rows.filter((row) => ["POSTPONED", "RESCHEDULED"].includes(row.lifecycle?.code));
  const voidRows = rows.filter((row) => row.lifecycle?.code === "VOID");
  const gateRows = rows.map((row) => ({ ...row, gate: autoDecisionGate(row.match.no, row.pred) }));
  const mainGateRows = gateRows.filter((row) => row.gate.level === "A");
  const attributionRows = verifiedRows.map((row) => ({ ...row, attribution: reviewAttribution(row.pred, row.match, row) }));
  const missAttributions = attributionRows.filter((row) => row.attribution.severity !== "good");
  const competitions = new Set(visibleRows.map((row) => row.league));
  cards.innerHTML = `
    <div class="review-summary-grid">
      <article class="review-metric"><span>已锁版场次</span><strong>${rows.length}</strong><em>${competitions.size} 个赛事类型</em></article>
      <article class="review-metric"><span>已验证</span><strong>${verifiedRows.length}</strong><em>已有实际比分</em></article>
      <article class="review-metric"><span>方向命中</span><strong>${directionHits}/${directionVerifiedRows.length || 0}</strong><em>${hitRate(directionHits, directionVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>让球命中</span><strong>${handicapHits}/${handicapVerifiedRows.length || 0}</strong><em>${hitRate(handicapHits, handicapVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>总进球</span><strong>${totalGoalsHits}/${totalGoalsVerifiedRows.length || 0}</strong><em>${hitRate(totalGoalsHits, totalGoalsVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>比分覆盖</span><strong>${scoreHits}/${scoreVerifiedRows.length || 0}</strong><em>${hitRate(scoreHits, scoreVerifiedRows.length)}</em></article>
      <article class="review-metric"><span>A/B方向</span><strong>${adviceHits}/${adviceRows.length || 0}</strong><em>${hitRate(adviceHits, adviceRows.length)}</em></article>
      <article class="review-metric"><span>A级证据</span><strong>${mainGateRows.length}</strong><em>证据完整，不代表自动主推</em></article>
      ${confidenceBacktests.map(({ grade, hits, total, rate }) => `
        <article class="review-metric confidence-backtest-metric grade-${grade.toLowerCase()}">
          <span>${grade}级方向命中率</span>
          <strong>${hits}/${total}</strong>
          <em>${rate}</em>
        </article>
      `).join("")}
      <article class="review-metric"><span>延期追踪</span><strong>${postponedRows.length}</strong><em>暂停验票，恢复后自动回测</em></article>
      <article class="review-metric"><span>无效样本</span><strong>${voidRows.length}</strong><em>取消比赛不进入统计分母</em></article>
      <article class="review-metric"><span>错因样本</span><strong>${missAttributions.length}</strong><em>用于迭代模型</em></article>
    </div>
  `;

  const dateOptions = `
    <option value="all"${activeGlobalStatsDate === "all" ? " selected" : ""}>全部日期</option>
    <optgroup label="快捷区间">
      <option value="last7"${activeGlobalStatsDate === "last7" ? " selected" : ""}>近7天</option>
      <option value="last15"${activeGlobalStatsDate === "last15" ? " selected" : ""}>近15天</option>
    </optgroup>
    <optgroup label="按月份">
      ${months.map((month) => {
        const [year, value] = month.split("-");
        const key = `month:${month}`;
        return `<option value="${key}"${activeGlobalStatsDate === key ? " selected" : ""}>${year}年${Number(value)}月</option>`;
      }).join("")}
    </optgroup>
    <optgroup label="按单日">
      ${dates.slice().reverse().map(
        (date) => `<option value="${date}"${activeGlobalStatsDate === date ? " selected" : ""}>${formatDate(date)}</option>`
      ).join("")}
    </optgroup>`;
  const dateScopeLabel = globalStatsDateLabel(activeGlobalStatsDate);
  if (leagueFilter) {
    const leagueOptions = [
      `<option value="all"${activeGlobalStatsLeague === "all" ? " selected" : ""}>全部联赛</option>`,
      ...leagues.map(
        (league) => `<option value="${league}"${activeGlobalStatsLeague === league ? " selected" : ""}>${league}</option>`
      ),
    ].join("");
    leagueFilter.innerHTML = `
      <div class="review-filterbar global-stats-filterbar league-filterbar combined-stats-filterbar">
        <section>
          <div>
            <span>按联赛回测</span>
            <strong>${activeGlobalStatsLeague === "all" ? "全部联赛" : activeGlobalStatsLeague}</strong>
            <em>${visibleRows.length}/${allRows.length} 场</em>
          </div>
          <select data-global-stats-league aria-label="选择联赛">${leagueOptions}</select>
        </section>
        <section>
          <div>
            <span>按日期复盘</span>
            <strong>${dateScopeLabel}</strong>
            <em>${visibleRows.length}/${allRows.length} 场</em>
          </div>
          <select data-global-stats-date aria-label="选择统计日期">${dateOptions}</select>
        </section>
      </div>
    `;
  }
  const tableRows = visibleRows
    .map(({ match, pred, review, competition, playType }) => {
      const attribution = reviewAttribution(pred, match, review);
      const confidence = confidenceGrade(pred);
      const scoreText = officialScoreForMatch(match);
      const lifecycle = review.lifecycle || match.reviewLifecycle || {};
      const actualDisplay = scoreText || lifecycle.scoreLabel || "";
      return `
        <tr data-global-stats-no="${match.no}">
          <td>${dash(competition)}</td>
          <td>${dash(playType)}</td>
          <td>${dash(pred.date || match.date)}</td>
          <td><span class="version-badge">${predictionModelVersion(pred)}</span></td>
          <td>${match.no}</td>
          <td class="text-cell match-name-cell">${reviewMatchButton(match)}</td>
          <td class="actual-cell lifecycle-${String(lifecycle.code || "pending").toLowerCase()}">${dash(actualDisplay)}</td>
          <td><span class="gate-badge ${confidenceTone(confidence)}">${dash(confidence)}</span></td>
          <td>${reviewMarketCell(pred.pick, review.directionHit, review.marketAvailability?.winDrawLose)}</td>
          <td>${reviewMarketCell(review.hPick, review.handicapHit, review.marketAvailability?.handicap)}</td>
          <td>${reviewMarketCell(pred.totalGoalsPick, review.totalGoalsHit, review.marketAvailability?.totalGoals)}</td>
          <td>${reviewMarketCell(`${dash(pred.mainScore)} / ${dash(pred.counterScore)}`, review.scoreHit, review.marketAvailability?.scores)}</td>
          <td><span class="attribution-badge ${attribution.severity}">${attribution.type}</span></td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="13" class="empty-cell">当前范围暂无模型推演记录</td></tr>`;
  const tableSummary = `${activeGlobalStatsLeague === "all" ? "全部联赛" : activeGlobalStatsLeague} · ${dateScopeLabel} · ${visibleRows.length}/${allRows.length} 场`;

  table.innerHTML = `
    <div class="global-stats-table-toolbar">
      <div>
        <span>回测明细表</span>
        <strong>${tableSummary}</strong>
      </div>
      <button type="button" data-global-stats-maximize aria-label="最大化查看回测明细表">
        <span>最大化查看</span>
      </button>
    </div>
    <div class="review-record-wrap compact global-stats-wrap">
      <table class="review-record-table global-stats-record-table">
        <thead>
          <tr>
            <th>赛事</th>
            <th>玩法</th>
            <th>锁版日期</th>
            <th>版本</th>
            <th>场次</th>
            <th>比赛</th>
            <th>实际比分</th>
            <th>置信等级</th>
            <th>胜平负</th>
            <th>让球</th>
            <th>总进球</th>
            <th>比分预测</th>
            <th>错因</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function openGlobalStatsModal() {
  const sourceTable = document.querySelector("#global-stats-table .global-stats-record-table");
  if (!sourceTable) return;
  document.querySelector(".global-stats-modal")?.remove();
  const summary =
    document.querySelector("#global-stats-table .global-stats-table-toolbar strong")?.textContent ||
    "全部体彩模型记录";
  const modal = document.createElement("div");
  modal.className = "global-stats-modal";
  modal.innerHTML = `
    <div class="global-stats-dialog" role="dialog" aria-modal="true" aria-label="回测明细最大化表格">
      <header>
        <div>
          <span>模型回测明细</span>
          <strong>${summary}</strong>
          <em>横向滚动查看更多列，纵向滚动查看更多比赛。</em>
        </div>
        <button type="button" data-global-stats-close aria-label="关闭最大化表格">×</button>
      </header>
      <div class="global-stats-dialog-body"></div>
    </div>
  `;
  const tableClone = sourceTable.cloneNode(true);
  tableClone.classList.add("global-stats-record-table-expanded");
  modal.querySelector(".global-stats-dialog-body")?.appendChild(tableClone);
  document.body.appendChild(modal);
}

function spNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const playOptionMeta = {
  had: [
    ["H", "h", "主胜"],
    ["D", "d", "平局"],
    ["A", "a", "客胜"],
  ],
  hhad: [
    ["H", "h", "让胜"],
    ["D", "d", "让平"],
    ["A", "a", "让负"],
  ],
  ttg: [
    ["0", "s0", "0球"],
    ["1", "s1", "1球"],
    ["2", "s2", "2球"],
    ["3", "s3", "3球"],
    ["4", "s4", "4球"],
    ["5", "s5", "5球"],
    ["6", "s6", "6球"],
    ["7", "s7", "7+球"],
  ],
};

function snapshotWeights(snapshot, playType) {
  const options = playOptionMeta[playType] || [];
  const rows = options
    .map(([code, field, label]) => {
      const sp = spNumber(snapshot?.[field]);
      if (!sp) return null;
      return { code, label, sp, rawWeight: 1 / sp };
    })
    .filter(Boolean);
  const total = rows.reduce((sum, item) => sum + item.rawWeight, 0);
  if (!total) return [];
  return rows.map((item) => ({ ...item, weight: item.rawWeight / total }));
}

function analyzePlayHistory(match, playType) {
  const expectedHandicap = String(match.handicap ?? "").replace("+", "");
  const snapshots = (match.history?.[playType] || [])
    .filter((item) => {
      if (playType !== "hhad" || !expectedHandicap) return true;
      return String(item.goalLine ?? "").replace("+", "") === expectedHandicap;
    })
    .filter((item) => `${item.updateDate || ""} ${item.updateTime || ""}`.trim())
    .sort((a, b) => `${a.updateDate} ${a.updateTime}`.localeCompare(`${b.updateDate} ${b.updateTime}`))
    .filter((item) => snapshotWeights(item, playType).length > 0);
  if (snapshots.length < 2) {
    return {
      playType,
      available: false,
      label: { had: "胜平负", hhad: "让球", ttg: "总进球" }[playType],
      reason: "快照不足",
    };
  }
  const start = snapshots[0];
  const end = snapshots.at(-1);
  const startWeights = new Map(snapshotWeights(start, playType).map((item) => [item.code, item]));
  const endWeights = snapshotWeights(end, playType);
  const options = endWeights
    .map((item) => {
      const opening = startWeights.get(item.code);
      if (!opening) return null;
      const spDeltaPct = (item.sp - opening.sp) / opening.sp;
      const weightDelta = item.weight - opening.weight;
      return {
        ...item,
        openingSp: opening.sp,
        spDeltaPct,
        weightDelta,
        trend: weightDelta >= 0.015 ? "strengthening" : weightDelta <= -0.015 ? "weakening" : "stable",
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.weightDelta) - Math.abs(a.weightDelta));
  const strongest = options.find((item) => item.trend === "strengthening") || options[0];
  if (!strongest) {
    return {
      playType,
      available: false,
      label: { had: "胜平负", hhad: "让球", ttg: "总进球" }[playType],
      reason: "有效快照不足",
    };
  }
  const volatility = options[0] ? Math.abs(options[0].spDeltaPct) : 0;
  return {
    playType,
    available: options.length > 0,
    label: { had: "胜平负", hhad: "让球", ttg: "总进球" }[playType],
    startTime: `${start.updateDate} ${start.updateTime}`,
    endTime: `${end.updateDate} ${end.updateTime}`,
    strongest,
    options,
    volatility,
    level: volatility >= 0.08 ? "高" : volatility >= 0.03 ? "中" : "低",
  };
}

function oddsMapRows() {
  return (spHistoryData.matches || []).map((match) => {
    const analyses = ["had", "hhad", "ttg"].map((playType) => analyzePlayHistory(match, playType));
    const available = analyses.filter((item) => item.available);
    const strongest = available
      .flatMap((item) => item.options.map((option) => ({ ...option, market: item.label, playType: item.playType })))
      .sort((a, b) => Math.abs(b.weightDelta) - Math.abs(a.weightDelta))[0];
    const riskFlags = [];
    const hadTop = available.find((item) => item.playType === "had")?.strongest;
    const hhadTop = available.find((item) => item.playType === "hhad")?.strongest;
    const ttgTop = available.find((item) => item.playType === "ttg")?.strongest;
    if (hadTop?.code === "H" && hhadTop?.code === "A") riskFlags.push("主胜热但让负增强");
    if (hadTop?.code === "A" && hhadTop?.code === "H") riskFlags.push("客胜热但让胜增强");
    if (ttgTop && ["0", "1", "2"].includes(ttgTop.code)) riskFlags.push("低进球权重抬升");
    if (ttgTop && ["4", "5", "6", "7"].includes(ttgTop.code)) riskFlags.push("大球权重抬升");
    const volatility = Math.max(...available.map((item) => item.volatility), 0);
    return {
      ...match,
      analyses,
      strongest,
      riskFlags,
      volatility,
      pressureLevel: volatility >= 0.08 ? "强异动" : volatility >= 0.03 ? "中异动" : "轻微",
    };
  });
}

function deltaText(value, precision = 1) {
  if (!Number.isFinite(value)) return "-";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(precision)}%`;
}

function renderPlayTrend(item) {
  if (!item.available) return `<span class="trend-chip muted">${item.label} ${item.reason}</span>`;
  const top = item.strongest;
  const tone = top.trend === "strengthening" ? "hot" : top.trend === "weakening" ? "cold" : "flat";
  return `
    <span class="trend-chip ${tone}">
      ${item.label} · ${top.label}
      <b>${deltaText(top.weightDelta)}</b>
    </span>
  `;
}

function pickToMarketCode(pick) {
  if (pick === "胜") return "H";
  if (pick === "平") return "D";
  if (pick === "负") return "A";
  if (pick === "让胜") return "H";
  if (pick === "让平") return "D";
  if (pick === "让负") return "A";
  return "";
}

function totalPickBand(pick) {
  if (/0|1|2/.test(pick || "") && !/4|5|6|7/.test(pick || "")) return "low";
  if (/4|5|6|7/.test(pick || "")) return "high";
  return "mid";
}

function numberOdd(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1 ? number : null;
}

function parseProbRange(value) {
  const numbers = String(value || "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((item) => Number.isFinite(item));
  if (!numbers?.length) return null;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length / 100;
}

function modelProbabilities(pred) {
  return {
    H: parseProbRange(pred?.homeProb),
    D: parseProbRange(pred?.drawProb),
    A: parseProbRange(pred?.awayProb),
  };
}

function impliedMarket(entries) {
  const valid = entries
    .map((item) => ({ ...item, odd: numberOdd(item.odd) }))
    .filter((item) => item.odd);
  const rawSum = valid.reduce((sum, item) => sum + 1 / item.odd, 0);
  if (!valid.length || !rawSum) return { entries: [], returnRate: 0, overround: 0 };
  return {
    returnRate: 1 / rawSum,
    overround: rawSum - 1,
    entries: valid.map((item) => {
      const probability = (1 / item.odd) / rawSum;
      return {
        ...item,
        probability,
        fairOdd: 1 / probability,
      };
    }),
  };
}

function oddsMarketEntries(odds, marketType = "had") {
  if (marketType === "ttg") {
    return (odds?.totalGoalsOdds || []).map((item) => ({
      code: item.goals,
      label: `${item.goals}球`,
      odd: item.odds,
    }));
  }
  const source = marketType === "hhad" ? odds?.handicapOdds : odds?.normal;
  return [
    { code: "H", label: marketType === "hhad" ? "让胜" : "胜", odd: source?.win },
    { code: "D", label: marketType === "hhad" ? "让平" : "平", odd: source?.draw },
    { code: "A", label: marketType === "hhad" ? "让负" : "负", odd: source?.lose },
  ];
}

function probabilityPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function oddsMathForMatch(no, pred) {
  const odds = oddsMatch(no);
  if (!odds) return null;
  const normal = impliedMarket(oddsMarketEntries(odds, "had"));
  const handicap = impliedMarket(oddsMarketEntries(odds, "hhad"));
  const totalGoals = impliedMarket(oddsMarketEntries(odds, "ttg"));
  const model = modelProbabilities(pred);
  const pickCode = pickToMarketCode(pred?.pick);
  const selected = normal.entries.find((item) => item.code === pickCode);
  const modelProb = model[pickCode];
  const probGap = Number.isFinite(modelProb) && selected ? modelProb - selected.probability : null;
  const valueIndex = selected && Number.isFinite(modelProb) ? ((modelProb * selected.odd - 1) / (selected.odd - 1)) * 100 : null;
  const kelly = selected && Number.isFinite(modelProb) && typeof SportteryMath !== "undefined" ? {
    kellyIndex: SportteryMath.kellyIndex(selected.odd, modelProb),
    ev: SportteryMath.expectedValue(selected.odd, modelProb),
    kellyFraction: SportteryMath.kellyFraction(selected.odd, modelProb),
  } : null;
  const spread = normal.entries.length
    ? Math.max(...normal.entries.map((item) => item.probability)) - Math.min(...normal.entries.map((item) => item.probability))
    : null;
  const marketDerived = normal.entries.length >= 3 && typeof SportteryMath !== "undefined"
    ? SportteryMath.deriveOdds(normal.entries.map((e) => e.odd))
    : null;
  const valueCompare = selected && Number.isFinite(modelProb) && typeof SportteryMath !== "undefined"
    ? SportteryMath.compareValue(
        normal.entries.map((e) => e.odd),
        [model.H || 0, model.D || 0, model.A || 0],
        normal.entries.map((e) => e.label)
      )
    : null;
  return { odds, normal, handicap, totalGoals, selected, modelProb, probGap, valueIndex, spread, kelly, marketDerived, valueCompare };
}

function totalGoalsPickSet(pick = "") {
  return new Set(String(pick).match(/\d/g) || []);
}

function renderOddsMathPanel(no, pred) {
  const math = oddsMathForMatch(no, pred);
  if (!math?.normal.entries.length) return "";
  const mainRows = math.normal.entries
    .map(
      (item) => `
        <article>
          <span>${item.label}</span>
          <strong>${probabilityPercent(item.probability)}</strong>
          <em>SP ${item.odd} / 公允 ${item.fairOdd.toFixed(2)}</em>
          ${math.valueCompare ? (function(){
            const v = math.valueCompare.find(c => c.label === item.label);
            if (!v) return "";
            return `<b class="${v.isStrongValue ? "value-strong" : v.isValue ? "value-weak" : "value-none"}">${v.isValue ? "价值" : "无价值"} ${v.kellyIndex.toFixed(3)}</b>`;
          })() : ""}
        </article>
      `
    )
    .join("");
  const valueLine = math.kelly && typeof SportteryMath !== "undefined"
    ? `<div class="odds-math-value">
        <span>凯利指数 <strong>${math.kelly.kellyIndex.toFixed(3)}</strong>
        ${math.kelly.kellyIndex > 1 ? "✓" : "✗"}</span>
        <span>期望值 <strong>${SportteryMath.pct(math.kelly.ev)}</strong></span>
        <span>凯利比例 <strong>${math.kelly.kellyFraction <= 0 ? "不投注" : (math.kelly.kellyFraction * 100).toFixed(1) + "%"}</strong></span>
        ${math.kelly.kellyIndex > 1.05 ? '<span class="value-badge-strong">强价值信号</span>' : math.kelly.kellyIndex > 1 ? '<span class="value-badge-weak">弱价值信号</span>' : '<span class="value-badge-none">无明显价值</span>'}
      </div>`
    : "";
  return `
    <section class="match-page-section odds-math-panel">
      <span>赔率数学</span>
      <div class="odds-math-head">
        <strong>${probabilityPercent(math.normal.returnRate)}</strong>
        <em>胜平负返还率</em>
        <b>概率缺口 ${Number.isFinite(math.probGap) ? deltaText(math.probGap, 1) : "-"}</b>
        <b>凯利分数 ${Number.isFinite(math.valueIndex) ? `${math.valueIndex.toFixed(1)}%` : "-"}</b>
      </div>
      <div class="odds-math-grid">${mainRows}</div>
      ${valueLine}
      <p>这里把 SP 转成去水后的隐含概率，再和模型概率对照，只作为研究指标，不作为决策建议。</p>
    </section>
  `;
}

function renderTotalGoalsDistribution(no, pred) {
  const math = oddsMathForMatch(no, pred);
  if (!math?.totalGoals.entries.length) return "";
  const selected = totalGoalsPickSet(pred?.totalGoalsPick);
  const rows = math.totalGoals.entries
    .map((item) => {
      const active = selected.has(String(item.code).replace("+", ""));
      return `
        <div class="goal-prob-row ${active ? "active" : ""}">
          <span>${item.label}</span>
          <div><i style="width:${Math.max(item.probability * 100, 2).toFixed(1)}%"></i></div>
          <strong>${probabilityPercent(item.probability)}</strong>
        </div>
      `;
    })
    .join("");
  return `
    <section class="match-page-section goal-distribution-panel">
      <span>总进球分布</span>
      <div class="goal-prob-list">${rows}</div>
    </section>
  `;
}

function hasModelAnalysis(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/待人工补充|等待.*补|未接入|缺少|待接入|样本不足|自动 V4 仅根据体彩开盘结构生成/.test(text);
}

function hasHistoricalSample(no, pred) {
  const match = matches.find((item) => item.no === no);
  const worldCupSample = Boolean(match && ((data.historicalDrawRates || []).length || (data.historicalScoreFrequencies || []).length));
  const leagueProfileReady = Boolean(match && leagueProfileForMatch(match, pred)?.usableSampleCount >= 30);
  return Boolean(
    pred?.historicalSample ||
      pred?.sampleCompare ||
      pred?.historicalSampleCompare ||
      pred?.leagueSampleCompare ||
      pred?.scoreSampleCompare ||
      pred?.totalGoalsSampleCompare ||
      leagueProfileReady ||
      worldCupSample
  );
}

function modelEvidenceChecks(no, pred) {
  const row = spRadarForMatch(no);
  const match = matches.find((item) => item.no === no);
  const teamStateText = pred?.teamState || pred?.teamForm || pred?.recentAnalysis;
  const styleText = pred?.styleMatchup || pred?.tacticalMatchup || pred?.recentAnalysis || pred?.script;
  const halfFullText = pred?.halfFullScenario || pred?.halftimeDecision || pred?.halftimeTrigger || pred?.timeTriggerDecision;
  return [
    ["体彩开盘", Boolean(oddsMatch(no)), "实时赛事池 / SP 当前值"],
    ["SP 历史", Boolean(row?.strongest), "开盘到最新变化"],
    ["历史样本", hasHistoricalSample(no, pred), "历届/联赛样本、比分频率、总进球和同类盘口"],
    ["统一流程", Boolean(pred?.decisionProcess || pred?.competitionModel || pred?.eventWeighting || pred?.competitionType), "复用世界杯V4经验链，保留赛事自身版本"],
    ["赛事规则", Boolean(pred?.competitionRules || pred?.competitionModel || pred?.eventWeighting || pred?.competitionType), "世界杯 / 联赛 / 杯赛规则差异"],
    ["赛事动机", Boolean(pred?.groupSituation || pred?.pathMotive || pred?.scheduleMotive), "出线、争冠、欧战、保级或轮换压力"],
    ["球队状态", hasModelAnalysis(teamStateText), "近3-5场、伤停、体能、主客状态"],
    ["风格对位", hasModelAnalysis(styleText), "控球、高压、低位、转换、定位球等 matchup"],
    ["四剧本", Boolean(pred?.scriptSet || pred?.scenarioSet || pred?.fourScripts), "压制、开放、冷门、僵局分支"],
    ["半全场触发", hasModelAnalysis(halfFullText), "半场状态、0-0 / 60 分钟变化"],
    ["状态转移", Boolean(pred?.stateTransfer || pred?.knockoutStateTransfer || pred?.timeStateTransfer), "90分钟目标、第一球后行为和失败方式"],
    ["数据质量", Boolean(pred?.dataQuality || pred?.dataQualityGate), "证据不足时降级"],
    ["机构视角", Boolean(pred?.institutionLine), "自建盘口 vs 体彩盘口"],
    ["赛果回填", Boolean(parseScore(match ? officialScoreForMatch(match) : "")), "赛后复盘使用"],
    ["阵容伤停", Boolean(pred?.recentAnalysis || pred?.keyJudgement || pred?.changeNote) && /伤|缺阵|停赛|复出|回归|伤愈|伤病|缺席/.test([pred.recentAnalysis, pred.keyJudgement, pred.script, pred.noiseFilter, pred.changeNote].filter(Boolean).join(' ')), "阵容/伤停信息（来自推演文本扫描）"],
  ];
}

function modelEvidenceScore(no, pred) {
  const checks = modelEvidenceChecks(no, pred);
  const readyCount = checks.filter(([, ok]) => ok).length;
  return {
    checks,
    readyCount,
    total: checks.length,
    score: Math.round((readyCount / checks.length) * 100),
  };
}

function textSignalScore(text, keywords, base = 62) {
  const hits = keywords.filter((word) => String(text || "").includes(word)).length;
  return clamp(base + hits * 7, 45, 92);
}

function renderModelTriadPanel(no, pred) {
  if (!pred) return "";
  const consistency = marketConsistency(no, pred);
  const motivation = textSignalScore(pred.groupSituation, ["出线", "净胜", "必须", "抢", "压力", "机会"], pred.groupSituation ? 68 : 48);
  const scene = textSignalScore(pred.recentAnalysis || pred.script, ["压迫", "反击", "边路", "定位球", "节奏", "空间"], pred.recentAnalysis ? 70 : 52);
  const market = consistency.score || 50;
  const average = Math.round((motivation + scene + market) / 3);
  const items = [
    ["动机分", motivation, "积分、出线收益和比赛必要性"],
    ["对位分", scene, "近况、风格和真实比赛场景"],
    ["盘口分", market, "SP 漂移与模型锁版是否同向"],
  ];
  return `
    <section class="match-page-section triad-panel">
      <span>三维评分</span>
      <div class="triad-score">
        <strong>${average}</strong>
        <em>${average >= 76 ? "证据较完整" : average >= 62 ? "需要交叉验证" : "谨慎观察"}</em>
      </div>
      <div class="triad-grid">
        ${items
          .map(
            ([label, value, note]) => `
              <article>
                <div><b style="width:${value}%"></b></div>
                <strong>${label} ${value}</strong>
                <p>${note}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function autoDecisionGate(no, pred) {
  if (!pred) {
    return {
      score: 0,
      level: "待推演",
      tone: "muted",
      notes: ["还没有赛前锁版记录"],
      action: "先补模型输出",
    };
  }
  const row = spRadarForMatch(no);
  const hasCurrentOdds = Boolean(oddsMatch(no));
  const weightedChecks = [
    ["锁版结果", Boolean(pred.pick && pred.totalGoalsPick && (pred.mainScore || pred.score1)), 25],
    ["体彩当前盘", hasCurrentOdds, 20],
    ["体彩开盘偏差", Boolean(pred.marketGap), 15],
    ["历史样本", hasHistoricalSample(no, pred), 10],
    ["比赛发展推演", hasModelAnalysis(pred.script), 12],
    ["球队状态", hasModelAnalysis(pred.teamState || pred.teamForm || pred.recentAnalysis), 10],
    ["风格对位", hasModelAnalysis(pred.styleMatchup || pred.tacticalMatchup), 10],
    ["半全场", hasModelAnalysis(pred.halfFullScenario || pred.halftimeDecision || pred.halftimeTrigger || pred.timeTriggerDecision), 10],
    ["状态转移", Boolean(pred.stateTransfer || pred.knockoutStateTransfer || pred.timeStateTransfer), 10],
    ["赛事动机", Boolean(pred.groupSituation || pred.pathMotive || pred.scheduleMotive), 10],
    ["机构视角", Boolean(pred.institutionLine), 9],
  ];
  const earned = weightedChecks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  const totalWeight = weightedChecks.reduce((sum, [, , weight]) => sum + weight, 0);
  const score = Math.round((earned / totalWeight) * 100);
  const modelGrade = confidenceGrade(pred);
  const marketStatus = row?.strongest ? "盘口动态有效" : hasCurrentOdds ? "当前盘口有效，SP历史未命中" : "当前盘口缺失";
  const missingNotes = weightedChecks
    .filter(([, ok]) => !ok)
    .map(([label]) => `${label}缺失`)
    .slice(0, 3);
  const level = score >= 86 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : "D";
  const crossConflict = score < 72 && ["A", "A-"].includes(modelGrade);
  const effectiveLevel = crossConflict ? (level === "C" ? "C~" : level) : level;
  return {
    score,
    level: effectiveLevel,
    tone: effectiveLevel === "A" ? "hot" : effectiveLevel.startsWith("B") ? "warm" : effectiveLevel === "C~" || effectiveLevel.startsWith("C") ? "watch" : "cold",
    notes: [
      `模型置信 ${modelGrade}`,
      marketStatus,
      crossConflict ? "闸门与置信等级不一致：在场证据偏少，建议调低预期" : "",
      missingNotes.length ? missingNotes.join(" / ") : "核心字段完整",
    ],
    action:
      effectiveLevel === "A"
        ? "证据完整，可正常复核"
        : effectiveLevel.startsWith("B")
          ? "证据较完整，缺失项不扣比赛判断"
          : effectiveLevel === "C~" || effectiveLevel.startsWith("C")
            ? "证据部分缺失，只降低数据可信度"
            : "证据不足，不等于比赛风险",
  };
}

function renderDecisionGatePanel(no, pred) {
  const gate = autoDecisionGate(no, pred);
  return `
    <section class="match-page-section decision-gate-panel ${gate.tone}">
      <span>证据质量</span>
      <div class="decision-gate-head">
        <strong>${gate.level}</strong>
        <em>${gate.score}</em>
        <b>${gate.action}</b>
      </div>
      <div class="decision-gate-bar"><i style="width:${gate.score}%"></i></div>
      <div class="decision-gate-notes">
        ${gate.notes.map((item) => `<span>${item}</span>`).join("")}
      </div>
    </section>
  `;
}

function finalDecisionGateItems(pred) {
  if (!pred) return [];
  const resolved = resolvedPredictionDecision(pred);
  return [
    ["统一流程", pred.decisionProcess || pred.modelDecisionProcess],
    ["赛事规则", pred.competitionRules || pred.eventWeighting || pred.competitionWeight || pred.weightProfile],
    ["90分钟目标", pred.ninetyMinuteObjective || pred.matchObjective || pred.pathMotive],
    ["状态转移", pred.stateTransfer || pred.knockoutStateTransfer || pred.timeStateTransfer],
    ["半场触发", pred.halftimeDecision || pred.halftimeTrigger || pred.timeTriggerDecision],
    ["让球卡盘", pred.handicapGate || pred.letBallGate || pred.handicapDecisionGate],
    ["跨市场", pred.crossMarketConsistency || pred.marketConsistencyGate],
    ["数据质量", pred.dataQuality || pred.dataQualityGate],
    ["决策冲突", resolved?.resolution || pred.decisionConflict || pred.conflictResolution || pred.decisionGateConflict],
    ["最终动作", resolved?.hasConflict ? `按主比分优先收口：胜平负 ${resolved.pick || "-"}；让球 ${resolved.handicapPick || "-"}。` : pred.finalDecisionAction || pred.decisionAction || pred.valueFilterAction],
  ].filter(([, value]) => Boolean(value));
}

function renderFinalDecisionGatePanel(pred) {
  const items = finalDecisionGateItems(pred);
  if (!items.length) return "";
  const action = finalDecisionActionText(pred) || "等待最终动作锁定";
  const supportingItems = items.filter(([label]) => label !== "最终动作");
  return `
    <section class="match-page-section final-decision-gate">
      <div class="final-decision-head">
        <span>最终决策闸门</span>
        <strong>${displayModelText(action)}</strong>
        <em>所有数据、盘口、比赛发展和风险项在这里收口，只作为赛前决策过滤依据。</em>
      </div>
      ${
        supportingItems.length
          ? `<div class="final-decision-grid">
        ${supportingItems
          .map(
            ([label, value]) => `
              <article>
                <small>${label}</small>
                <p>${displayModelText(value)}</p>
              </article>
            `
          )
          .join("")}
      </div>`
          : ""
      }
    </section>
  `;
}

function finalDecisionActionText(pred) {
  const resolved = resolvedPredictionDecision(pred);
  if (resolved?.hasConflict) {
    return `${resolved.resolution} 最终动作：胜平负 ${resolved.pick || "-"}；让球 ${resolved.handicapPick || "-"}。`;
  }
  return pred?.finalDecisionAction || pred?.decisionAction || pred?.valueFilterAction || "";
}

function firstModelText(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) return value.length;
    return value !== undefined && value !== null && String(value).trim();
  });
}

function marketSpReviewText(pred = {}, item = null) {
  const row = item || findSportteryItemForPrediction(pred) || {};
  const odds = oddsMatch(row) || oddsMatch(pred?.no) || {};
  const normal = row.normal || odds.normal || {};
  const entries = [
    { code: "H", label: "主胜", odd: normal.win || pred.sportteryHomeSp || pred.euroHomeOdds },
    { code: "D", label: "平局", odd: normal.draw || pred.sportteryDrawSp || pred.euroDrawOdds },
    { code: "A", label: "客胜", odd: normal.lose || pred.sportteryAwaySp || pred.euroAwayOdds },
  ]
    .map((entry) => ({ ...entry, odd: numberOdd(entry.odd) }))
    .filter((entry) => entry.odd);
  if (entries.length < 3) return "";
  const market = impliedMarket(entries);
  const probabilityText = market.entries
    .map((entry) => `${entry.label} ${probabilityPercent(entry.probability, 1)}`)
    .join("、");
  const leader = market.entries.slice().sort((a, b) => b.probability - a.probability)[0];
  const spText = entries.map((entry) => entry.odd.toFixed(2)).join(" / ");
  const leanText = leader ? `盘口当前更偏向${leader.label}` : "盘口方向待复核";
  return `当前胜平负 SP 为 ${spText}，去水后的市场隐含概率约为${probabilityText}。${leanText}，但它只是市场输入，最终方向仍按锁版闸门综合处理。`;
}

function probabilityBaselineText(pred, item = null) {
  const marketText = marketSpReviewText(pred, item);
  if (marketText) return marketText;
  const probs = [
    pred.homeProb || (Number.isFinite(Number(pred.modelHomeProb)) ? `主胜 ${(Number(pred.modelHomeProb) * 100).toFixed(0)}%` : ""),
    pred.drawProb || (Number.isFinite(Number(pred.modelDrawProb)) ? `平 ${(Number(pred.modelDrawProb) * 100).toFixed(0)}%` : ""),
    pred.awayProb || (Number.isFinite(Number(pred.modelAwayProb)) ? `客胜 ${(Number(pred.modelAwayProb) * 100).toFixed(0)}%` : ""),
  ].filter(Boolean);
  const extras = [pred.xg ? `xG ${pred.xg}` : "", pred.poisson ? `泊松 ${pred.poisson}` : ""].filter(Boolean);
  if (probs.length || extras.length) return `模型基础概率：${[...probs, ...extras].join("；")}。当前胜平负 SP 暂缺，最终方向仍按锁版闸门综合处理。`;
  return "当前胜平负 SP 暂缺，不能把这一栏解释为模型概率；最终方向仍需等待盘口、球队状态和锁版闸门共同复核。";
}

function lowestOddItems(items = [], labelKey = "label", oddKey = "odds", limit = 3) {
  return (items || [])
    .map((item) => ({
      label: String(item?.[labelKey] || item?.score || item?.goals || "").replace(":", "-"),
      odd: numberOdd(item?.[oddKey] || item?.odd),
    }))
    .filter((item) => item.label && item.odd)
    .sort((a, b) => a.odd - b.odd)
    .slice(0, limit);
}

function pickLabel(value = "") {
  const text = String(value || "");
  if (text.includes("胜")) return "主胜";
  if (text.includes("平")) return "平局";
  if (text.includes("负")) return "客胜";
  return text || "-";
}

function marketOpeningReviewText(pred = {}, item = null, options = {}) {
  const row = item || findSportteryItemForPrediction(pred) || {};
  const odds = oddsMatch(row) || oddsMatch(pred?.no) || {};
  const normal = row.normal || odds.normal || {
    win: pred.sportteryHomeSp || pred.euroHomeOdds,
    draw: pred.sportteryDrawSp || pred.euroDrawOdds,
    lose: pred.sportteryAwaySp || pred.euroAwayOdds,
  };
  const handicapOdds = row.handicapOdds || odds.handicapOdds || {};
  const normalLeader = sportteryOddsLeader(normal, [["主胜", "win"], ["平局", "draw"], ["客胜", "lose"]]);
  const handicapLeader = sportteryOddsLeader(handicapOdds, [["让胜", "win"], ["让平", "draw"], ["让负", "lose"]]);
  const scoreLows = lowestOddItems(row.scoreOdds || odds.scoreOdds || [], "score", "odds", 4);
  const totalLows = lowestOddItems(row.totalGoalsOdds || odds.totalGoalsOdds || [], "goals", "odds", 3);
  if (!normalLeader && !handicapLeader && !scoreLows.length && !totalLows.length) {
    return firstModelText(pred.institutionLine, pred.marketGap, options.marketGap, unifiedStepText(pred, 5));
  }

  const resolved = resolvedPredictionDecision(pred, { handicapLine: row.handicap || reviewHandicapLine(pred) });
  const modelPick = pickLabel(resolved?.pick || pred.pick);
  const modelHandicap = resolved?.handicapPick || handicapPick(pred) || options.handicapPick || "-";
  const modelScores = projectionScorePick(pred, options.scorePick);
  const modelTotal = pred.totalGoalsPick || options.totalPick || "-";
  const actualParts = [
    normalLeader ? `胜平负最低为${normalLeader.label}${normalLeader.odd.toFixed(2)}` : "",
    handicapLeader ? `${row.handicap || odds.handicap || reviewHandicapLine(pred) || ""}让球最低为${handicapLeader.label}${handicapLeader.odd.toFixed(2)}` : "",
    scoreLows.length ? `比分低位集中在${scoreLows.map((score) => `${score.label}@${score.odd.toFixed(2)}`).join(" / ")}` : "",
    totalLows.length ? `总进球低位在${totalLows.map((goal) => `${goal.label}球@${goal.odd.toFixed(2)}`).join(" / ")}` : "",
  ].filter(Boolean);

  const modelParts = [
    `胜平负主线=${modelPick}`,
    `让球=${modelHandicap}`,
    modelScores && modelScores !== "-" ? `比分=${modelScores}` : "",
    modelTotal && modelTotal !== "-" ? `总进球=${modelTotal}` : "",
  ].filter(Boolean);

  const deviation = [];
  if (normalLeader && modelPick !== "-" && normalLeader.label !== modelPick) {
    deviation.push(`胜平负低位偏向${normalLeader.label}，模型主线偏向${modelPick}`);
  }
  if (handicapLeader && modelHandicap !== "-" && !String(modelHandicap).includes(handicapLeader.label.replace("让", ""))) {
    deviation.push(`让球低位${handicapLeader.label}，与模型让球${modelHandicap}不完全同向`);
  }
  if (!deviation.length) deviation.push("主方向与模型大体同向，偏差主要看让球、比分和总进球防区");

  const protection = [];
  const scoreText = scoreLows.map((score) => score.label).join(" ");
  const totalText = totalLows.map((goal) => goal.label).join(" ");
  if (/1-1|0-0/.test(scoreText)) protection.push("防平局和低比分拖住主方向");
  if (/0-1|1-2/.test(scoreText)) protection.push("防客队小胜");
  if (/1-0|2-1/.test(scoreText)) protection.push("防主队小胜但不打穿");
  if (handicapLeader?.label === "让胜") protection.push("让球端在防受让方保护");
  if (handicapLeader?.label === "让负") protection.push("让球端在防让球方不穿或反向打穿");
  if (handicapLeader?.label === "让平") protection.push("让球端在防一球差卡盘");
  if (/[012]/.test(totalText) && !/[4567]/.test(totalText)) protection.push("总进球端防小比分");
  if (/[4567]/.test(totalText)) protection.push("总进球端防开放局");

  return [
    `体彩实际开法：${actualParts.join("；")}。`,
    `如果我是庄家会这样开：基于球队信息、比赛发展、热度和风险防范，${modelParts.join("；")}。`,
    `偏差：${deviation.join("；")}。`,
    `这个开盘主要在防：${[...new Set(protection)].join("；") || "方向过热后的一球差、平局或比分卡盘风险"}。`,
  ].join(" ");
}

function scoreOptionsForDevelopment(pred = {}, fallback = "") {
  const scores = [
    pred.mainScore,
    pred.counterScore,
    pred.score1,
    pred.score2,
    pred.scorePick,
    fallback,
    pred.script,
    unifiedStepText(pred, 10),
  ]
    .filter(Boolean)
    .join(" ")
    .match(/\b\d+\s*[-:]\s*\d+\b/g) || [];
  return [...new Set(scores.map((score) => score.replace(/\s*:\s*/, "-").replace(/\s*-\s*/, "-")))].slice(0, 2);
}

function matchDevelopmentText(pred = {}, item = null, options = {}) {
  const row = item || findSportteryItemForPrediction(pred) || {};
  const scoreOptions = scoreOptionsForDevelopment(pred, options.scorePick);
  const firstScore = scoreOptions[0] || "待定";
  const secondScore = scoreOptions[1] || "待定";
  const rawCandidate = firstModelText(pred.script, pred.normalScript, pred.matchScript, rawUnifiedStepText(pred, 7));
  const rawClean = /结合球队踢法|比赛发展推演|客观依据/.test(String(rawCandidate || ""))
    ? ""
    : displayModelText(rawCandidate || "")
    .replace(/主脚本/g, "情况一")
    .replace(/反脚本/g, "情况二")
    .replace(/常规脚本/g, "比赛发展");
  const styleCandidate = firstModelText(pred.styleMatchup, pred.tacticalMatchup, rawUnifiedStepText(pred, 4));
  const styleSource = /待人工|待补充|待补齐/.test(String(styleCandidate || ""))
    ? firstModelText(pred.recentAnalysis, pred.teamState, styleCandidate)
    : firstModelText(styleCandidate, pred.recentAnalysis, pred.teamState);
  const styleSummary = displayModelText(styleSource || "两队踢法、攻防稳定性和主客状态决定比赛节奏。")
    .split(/[。；]/)
    .filter(Boolean)
    .slice(0, 2)
    .join("；");
  const marketSummary = (() => {
    const odds = oddsMatch(row) || oddsMatch(pred?.no) || {};
    const scoreLows = lowestOddItems(row.scoreOdds || odds.scoreOdds || [], "score", "odds", 3);
    const totalLows = lowestOddItems(row.totalGoalsOdds || odds.totalGoalsOdds || [], "goals", "odds", 2);
    return [
      scoreLows.length ? `比分低位${scoreLows.map((score) => `${score.label}@${score.odd.toFixed(2)}`).join(" / ")}` : "",
      totalLows.length ? `总进球低位${totalLows.map((goal) => `${goal.label}球@${goal.odd.toFixed(2)}`).join(" / ")}` : "",
    ].filter(Boolean).join("；") || "盘口低位用于校验哪种发展更被市场防范";
  })();
  const objectiveSummary = displayModelText(firstModelText(pred.groupSituation, pred.pathMotive, pred.competitionRules, rawUnifiedStepText(pred, 2)) || "")
    .split(/[。；]/)
    .filter(Boolean)[0] || "赛程、战意和比赛必要性作为节奏变化条件";
  const firstTrigger = rawClean
    ? rawClean.replace(/情况一[:：]?/g, "").replace(/情况二[:：]?/g, "变化情况：")
    : `${row.home || "主队"}和${row.away || "客队"}按当前强弱与盘口低位进入低回合拉扯，第一球和中场前后的节奏会决定比分是否打开。`;
  const secondTrigger = /0-0|半场|迟迟|定位球|反击|压出|失误|转换/.test(rawClean)
    ? rawClean
    : `如果前段没有早球，或弱势方通过反击、定位球、身体对抗拖住节奏，比赛会转向更保守的比分分支。`;

  return [
    `结合球队踢法、战术对位、盘口低位、总进球和客观赛程因素，优先推演两种最可能的发展。`,
    `情况一：比赛按较顺的方向发展，落点偏向 ${firstScore}。触发条件是${firstTrigger}`,
    `情况二：比赛被节奏、对抗或盘口防范点拖住，落点偏向 ${secondScore}。触发条件是${secondTrigger}`,
    `客观依据：${styleSummary}；${marketSummary}；${objectiveSummary}。`,
  ].join(" ");
}

function finalLockSummaryText(pred) {
  const finalAction = finalDecisionActionText(pred);
  const picks = [
    pred.pick ? `胜平负 ${pred.pick}` : "",
    pred.handicapPick ? `让球 ${pred.handicapPick}` : "",
    pred.totalGoalsPick ? `总进球 ${pred.totalGoalsPick}` : "",
    pred.mainScore || pred.counterScore ? `比分 ${[pred.mainScore, pred.counterScore].filter(Boolean).join(" / ")}` : "",
    pred.matchType ? `类型 ${pred.matchType}` : "",
    pred.confidence || pred.advice ? `建议 ${[pred.confidence, pred.advice].filter(Boolean).join(" / ")}` : "",
  ].filter(Boolean);
  return [finalAction, picks.join("；")].filter(Boolean).join(" ");
}

function v4StepRows(pred) {
  return [
    {
      no: "01",
      title: "当前胜平负 SP 复核",
      text: firstModelText(probabilityBaselineText(pred), pred.modelProbability, pred.probabilityBaseline),
    },
    {
      no: "02",
      title: "赛事规则与动机",
      text: firstModelText(pred.competitionRules, pred.groupSituation, pred.eventWeighting, pred.competitionWeight, unifiedStepText(pred, 2)),
    },
    {
      no: "03",
      title: "球队近期状态",
      text: firstModelText(pred.teamState, pred.recentAnalysis, pred.objectiveDataLayer, unifiedStepText(pred, 3)),
    },
    {
      no: "04",
      title: "风格与战术对位",
      text: firstModelText(pred.styleMatchup, pred.tacticalMatchup, unifiedStepText(pred, 4)),
    },
    {
      no: "05",
      title: "体彩开盘偏差",
      text: firstModelText(marketOpeningReviewText(pred), pred.institutionLine, pred.marketGap, pred.crossMarketConsistency, unifiedStepText(pred, 5)),
    },
    {
      no: "06",
      title: "赔率动态防守层",
      text: firstModelText(pred.lineMovement, pred.oddsMovement, pred.marketProtection, unifiedStepText(pred, 6)),
    },
    {
      no: "07",
      title: "比赛发展推演",
      text: matchDevelopmentText(pred),
    },
    {
      no: "08",
      title: "半场 / 60分钟触发",
      text: firstModelText(pred.halftimeDecision, pred.halfFullScenario, pred.stateTransfer, pred.knockoutStateTransfer, pred.timeStateTransfer, unifiedStepText(pred, 8)),
    },
    {
      no: "09",
      title: "决策冲突闸门",
      text: firstModelText(pred.decisionConflict, pred.crossMarketConsistency, pred.keyJudgement, unifiedStepText(pred, 9)),
    },
    {
      no: "10",
      title: "比分与总进球校验",
      text: firstModelText(pred.scoreElimination, pred.totalGoalsValidation, pred.totalGoalsPick ? `总进球 ${pred.totalGoalsPick}` : "", unifiedStepText(pred, 10)),
    },
    {
      no: "11",
      title: "让球独立闸门",
      text: firstModelText(pred.handicapGate, pred.handicapDecision, pred.handicapPick ? `让球选择 ${pred.handicapPick}` : "", unifiedStepText(pred, 11)),
    },
    {
      no: "12",
      title: "失败方式识别",
      text: firstModelText(pred.keyFailureRisk, pred.failureMode, pred.likelyMissMode, pred.eventRisk, unifiedStepText(pred, 12)),
    },
    {
      no: "13",
      title: "价值过滤",
      text: firstModelText(pred.valueFilter, pred.valueFilterAction, pred.noiseFilter, pred.finalAction || pred.advice, unifiedStepText(pred, 13)),
    },
    {
      no: "14",
      title: "锁版动作",
      text: firstModelText(finalLockSummaryText(pred), pred.finalDecisionAction, unifiedStepText(pred, 14)),
    },
  ];
}

function renderUniversalModelPanel(pred) {
  if (!pred) return "";
  const modelTemplate = pred.competitionModel || pred.eventModel || pred.competitionType || "通用赛前模板";
  const modelName = modelDisplayName(pred, {}, modelTemplate);
  const processText = pred.decisionProcess || pred.modelDecisionProcess || "V4按固定顺序执行：胜平负SP复核、赛事规则、球队状态、风格对位、机构线、状态转移、比分总进球、让球独立闸门、失败方式、价值过滤。";
  const stepRows = v4StepRows(pred);
  const phaseRows = [
    { key: "baseline", no: "01", label: "输入复核", note: "确认市场底盘、比赛动机与球队状态", steps: stepRows.slice(0, 4) },
    { key: "simulation", no: "02", label: "发展推演", note: "从盘口防守到比赛进程与时间触发", steps: stepRows.slice(4, 8) },
    { key: "gate", no: "03", label: "决策闸门", note: "主动暴露冲突、失败方式与伪价值", steps: stepRows.slice(8, 13) },
    { key: "final", no: "04", label: "锁版输出", note: "只保留通过全部闸门后的正式动作", steps: stepRows.slice(13) },
  ];
  if (!modelTemplate && !stepRows.some((item) => item.text)) return "";
  return `
    <section class="match-page-section universal-model-panel">
      <div class="universal-model-head">
        <div class="universal-model-identity">
          <span><i aria-hidden="true"></i>V4 推演链</span>
          <strong>${modelName}</strong>
          <small>赛前锁版 · 固定顺序执行</small>
        </div>
        <div class="universal-model-metrics" aria-label="推演链结构">
          <div><b>14</b><small>判断步骤</small></div>
          <div><b>04</b><small>决策阶段</small></div>
          <div class="is-lock"><b>01</b><small>锁版动作</small></div>
        </div>
        <em>${displayModelText(processText)}</em>
      </div>
      <div class="v4-process-map">${phaseRows
        .map((phase) => `
          <section class="v4-phase v4-phase-${phase.key}" aria-label="${phase.label}">
            <header class="v4-phase-head">
              <span>${phase.no}</span>
              <div>
                <small>PHASE ${phase.no}</small>
                <strong>${phase.label}</strong>
                <p>${phase.note}</p>
              </div>
            </header>
            <div class="v4-step-grid">${phase.steps
              .map((item) => {
                const ready = Boolean(item.text);
                const badge = item.no === "14" ? "LOCK" : ["09", "11", "12", "13"].includes(item.no) ? "GATE" : "";
                return `
                  <article class="${ready ? "is-ready" : "is-missing"} ${phase.key === "gate" ? "is-gate" : ""} ${item.no === "14" ? "is-final" : ""}" data-v4-step="${item.no}">
                    <div class="v4-step-title">
                      <span>${item.no}</span>
                      <strong>${item.title}</strong>
                      ${badge ? `<em>${badge}</em>` : ""}
                    </div>
                    <p>${ready ? displayModelText(item.text) : "待补齐：本场锁版 payload 没有写入这一层推演依据。"}</p>
                  </article>
                `;
              })
              .join("")}</div>
          </section>
        `)
        .join("")}</div>
    </section>
  `;
}

function spRadarForMatch(matchOrNo) {
  const match = typeof matchOrNo === "object" ? matchOrNo : matches.find((item) => item.no === matchOrNo);
  const rows = oddsMapRows();
  if (match) {
    return (
      rows.find(
        (row) =>
          sameSportteryIdentity(row.matchId, match.matchId) ||
          sameSportteryIdentity(row.sportteryKey, match.sportteryKey) ||
          sameSportteryIdentity(row.cloudMatchId, match.cloudMatchId) ||
          (row.no && match.no && normalizedIssueNo(row.no) === normalizedIssueNo(match.no))
      ) ||
      rows.find(
        (row) =>
          row.ticaiDate === match.date &&
          looseTeamMatch(match.home, row.home) &&
          looseTeamMatch(match.away, row.away)
      ) ||
      rows.find(
        (row) =>
          row.matchDate === match.date &&
          looseTeamMatch(match.home, row.home) &&
          looseTeamMatch(match.away, row.away)
      ) ||
      rows.find((row) => looseTeamMatch(match.home, row.home) && looseTeamMatch(match.away, row.away))
    );
  }
  return rows.find((row) =>
    row.no === matchOrNo ||
    normalizedIssueNo(row.no) === normalizedIssueNo(matchOrNo) ||
    sameSportteryIdentity(row.matchId, matchOrNo) ||
    sameSportteryIdentity(row.sportteryKey, matchOrNo) ||
    sameSportteryIdentity(row.cloudMatchId, matchOrNo)
  );
}

function marketConsistency(no, pred) {
  const row = spRadarForMatch(no);
  if (!row?.strongest || !pred) {
    if (pred) return lockedMarketFallback(pred);
    return {
      score: 0,
      label: "等待数据",
      detail: "SP 历史或模型锁版不足，暂不计算一致性。",
      chips: ["待补 SP"],
    };
  }
  const had = row.analyses.find((item) => item.playType === "had")?.strongest;
  const hhad = row.analyses.find((item) => item.playType === "hhad")?.strongest;
  const ttg = row.analyses.find((item) => item.playType === "ttg")?.strongest;
  let score = 58;
  const chips = [];
  if (had?.trend === "strengthening" && had.code === pickToMarketCode(pred.pick)) {
    score += 16;
    chips.push("胜平负同向");
  } else if (had?.trend === "strengthening") {
    score -= 10;
    chips.push("胜平负反向");
  }
  if (hhad?.trend === "strengthening" && hhad.code === pickToMarketCode(handicapPick(pred))) {
    score += 14;
    chips.push("让球同向");
  } else if (hhad?.trend === "strengthening") {
    score -= 12;
    chips.push("让球冲突");
  }
  const totalBand = totalPickBand(pred.totalGoalsPick);
  const ttgLow = ttg && ["0", "1", "2"].includes(ttg.code);
  const ttgHigh = ttg && ["4", "5", "6", "7"].includes(ttg.code);
  if ((totalBand === "low" && ttgLow) || (totalBand === "high" && ttgHigh)) {
    score += 12;
    chips.push("进球同向");
  } else if ((totalBand === "low" && ttgHigh) || (totalBand === "high" && ttgLow)) {
    score -= 12;
    chips.push("进球冲突");
  }
  score -= row.riskFlags.length * 7;
  score = clamp(score, 0, 100);
  return {
    score,
    label: score >= 78 ? "高度一致" : score >= 62 ? "基本一致" : score >= 46 ? "存在分歧" : "强冲突",
    detail: row.riskFlags.length ? row.riskFlags.join(" / ") : spRadarModelHint(row),
    chips: chips.length ? chips : [row.pressureLevel],
  };
}

function lockedMarketFallback(pred) {
  const grade = confidenceGrade(pred);
  const baseScore = { A: 72, "A-": 68, B: 62, "B-": 58, "C+": 55, C: 52, D: 44 }[grade] || 54;
  const hasLine = Boolean(pred.lineMovement || pred.institutionLine || pred.marketGap);
  const riskCount = [pred.eventRisk, pred.keyFailureRisk].filter(Boolean).length;
  const score = clamp(baseScore + (hasLine ? 6 : 0) - riskCount * 3, 38, 70);
  const details = [
    pred.lineMovement,
    pred.eventRisk ? `事件风险：${pred.eventRisk}` : "",
    pred.keyFailureRisk ? `错层风险：${pred.keyFailureRisk}` : "",
  ].filter(Boolean);
  return {
    score,
    label: "锁版风险复核",
    detail: details.join(" / ") || "实时 SP 已下架，改用赛前锁版盘口与风险字段复核。",
    chips: [
      hasLine ? "锁版盘口" : "无 SP 快照",
      pred.eventRisk ? "事件风险" : "",
      pred.keyFailureRisk ? "错层风险" : "",
    ].filter(Boolean),
  };
}

function renderMarketConsistencyPanel(no, pred) {
  const consistency = marketConsistency(no, pred);
  return `
    <section class="match-page-section consistency-panel">
      <span>跨市场一致性评分</span>
      <div class="consistency-head">
        <strong>${consistency.score || "--"}</strong>
        <em>${consistency.label}</em>
      </div>
      <div class="sp-radar-flags">${consistency.chips.map((item) => `<span>${item}</span>`).join("")}</div>
      <p>${consistency.detail}</p>
    </section>
  `;
}

function renderModelInputChecklist(no, pred) {
  const evidence = modelEvidenceScore(no, pred);
  return `
    <section class="match-page-section input-checklist">
      <span>模型输入完整度</span>
      <div class="input-scoreline">
        <strong>${evidence.score}%</strong>
        <div><i style="width:${evidence.score}%"></i></div>
        <em>${evidence.readyCount}/${evidence.total} 类证据已接入</em>
      </div>
      <div class="input-check-grid">
        ${evidence.checks
          .map(
            ([label, ok, note]) => `
              <article class="${ok ? "ready" : "pending"}">
                <b>${ok ? "已接入" : "待接入"}</b>
                <strong>${label}</strong>
                <em>${note}</em>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function spRadarModelHint(row) {
  if (!row?.strongest) return "SP 历史快照不足，模型暂不采用盘口漂移校验。";
  const flags = row.riskFlags || [];
  if (flags.some((item) => item.includes("让负") || item.includes("低进球"))) {
    return "模型应降低追深盘和大比分权重，优先复核不穿盘、小比分或平局分支。";
  }
  if (flags.some((item) => item.includes("让胜") || item.includes("大球"))) {
    return "模型可提高强队推进、穿盘或开放局权重，但仍需和战术脚本交叉验证。";
  }
  return row.pressureLevel === "强异动"
    ? "盘口温度出现强变化，模型需要复核原锁版结论是否仍有市场支撑。"
    : "盘口变化暂未形成明显反向信号，可作为原模型判断的温度参考。";
}

function renderSpRadarPanel(no, variant = "card") {
  const row = spRadarForMatch(no);
  if (!row?.strongest) return "";
  const trends = row.analyses.map(renderPlayTrend).join("");
  const flags = row.riskFlags.length
    ? row.riskFlags.map((item) => `<span>${item}</span>`).join("")
    : `<span>${row.pressureLevel}</span>`;
  return `
    <section class="sp-radar-model ${variant}">
      <div>
        <span>SP 雷达校验</span>
        <strong>${row.strongest.market} · ${row.strongest.label} ${deltaText(row.strongest.weightDelta)}</strong>
      </div>
      <div class="sp-radar-trends">${trends}</div>
      <div class="sp-radar-flags">${flags}</div>
      <p>${spRadarModelHint(row)}</p>
    </section>
  `;
}

function oddsMapRowKey(row = {}) {
  return sportteryItemKey(row) || `odds-${row.no || row.issue || ""}-${row.ticaiDate || row.matchDate || ""}`;
}

function findOddsMapRowByKey(key = "") {
  const decoded = decodeURIComponent(key || "");
  return oddsMapRows().find((row) => oddsMapRowKey(row) === decoded);
}

function oddsMapScoreForRow(row = {}) {
  /* 未来比赛不可能有赛果——先挡掉以免后面各种查找污染 */
  const matchDate = row.matchDate || row.ticaiDate || "";
  const today = new Date().toISOString().slice(0, 10);
  if (matchDate > today) return null;

  const result = resultForSportteryItem(row);
  const resultScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  if (resultScore) return { scoreText: resultScore, score: parseScore(resultScore), source: "体彩赛果", item: result };

  const liveScore = liveScoreForSportteryItem(row);
  const liveScoreText = liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "";
  if (liveScoreText) return { scoreText: liveScoreText, score: parseScore(liveScoreText), source: "实时完赛", item: liveScore };

  const match = matchFromOddsItem(row) || matchFromResultItem(row) || matches.find((item) => item.no === row.no && (item.ticaiDate === row.ticaiDate || item.matchDate === row.ticaiDate || item.date === row.ticaiDate));
  const matchScore = normalizeResultScore(match?.score);
  if (matchScore) return { scoreText: matchScore, score: parseScore(matchScore), source: "本地赛果", item: match };

  return null;
}

function oddsMapPredictionForRow(row = {}) {
  return sportteryPredictionForItem(row) || latestPredictionFor(row.no);
}

function splitOddsMapRows(rows) {
  const backtestRows = [];
  const preRows = [];
  rows.forEach((row) => {
    const scoreData = oddsMapScoreForRow(row);
    if (scoreData?.score) {
      backtestRows.push(row);
    } else {
      preRows.push(row);
    }
  });
  return { preRows, backtestRows };
}

function oddsMapRowReview(row = {}) {
  const scoreData = oddsMapScoreForRow(row);
  const pred = oddsMapPredictionForRow(row);
  if (!scoreData?.score) return { row, pred, scoreData: null };

  const scoreText = scoreData.scoreText;
  const actualDirection = direction(scoreText);
  const handicap = row.handicap || reviewHandicapLine(pred);
  const actualHandicap = handicapDirection(scoreText, handicap);
  const goalPickText = `${pred?.totalGoalsPick || ""} ${pred?.goals || ""}`;
  const scorePickText = `${pred?.mainScore || ""} ${pred?.counterScore || ""}`;
  const total = scoreData.score.total;
  const directionHit = pred?.pick ? pred.pick.includes(actualDirection) : null;
  const handicapHit = pred?.hPick && actualHandicap ? pred.hPick.includes(actualHandicap) : null;
  const totalGoalsHit = goalPickText ? goalPickText.includes(`${total}球`) || goalPickText.includes(`${total}`) : null;
  const scoreHit = scorePickText ? scorePickText.includes(scoreText) : null;
  const driftHits = [];
  if (row.riskFlags.includes("低进球权重抬升")) driftHits.push(total <= 2 ? "低进球命中" : "低进球偏离");
  if (row.riskFlags.includes("大球权重抬升")) driftHits.push(total >= 4 ? "大球命中" : "大球偏离");
  if (actualHandicap && row.riskFlags.some((flag) => flag.includes(actualHandicap))) driftHits.push("让球冲突命中");
  return {
    row,
    pred,
    scoreData,
    actualDirection,
    actualHandicap,
    handicap,
    directionHit,
    handicapHit,
    totalGoalsHit,
    scoreHit,
    driftHits,
  };
}

function boolText(value) {
  if (value === true) return "命中";
  if (value === false) return "未中";
  return "未锁";
}

function boolTone(value) {
  if (value === true) return "hit";
  if (value === false) return "miss";
  return "pending";
}

function spBacktestRows(rows) {
  const verified = rows
    .map((row) => {
      const review = oddsMapRowReview(row);
      if (!review.scoreData?.score) return null;
      return { row, score: review.scoreData.score, review };
    })
    .filter(Boolean);
  const lowGoalRows = verified.filter(({ row }) => row.riskFlags.includes("低进球权重抬升"));
  const highGoalRows = verified.filter(({ row }) => row.riskFlags.includes("大球权重抬升"));
  const conflictRows = verified.filter(({ row }) => row.riskFlags.some((flag) => /让负|让胜/.test(flag)));
  const strongRows = verified.filter(({ row }) => row.pressureLevel === "强异动");
  const lowGoalHits = lowGoalRows.filter(({ score }) => score.total <= 2).length;
  const highGoalHits = highGoalRows.filter(({ score }) => score.total >= 4).length;
  const conflictHits = conflictRows.filter(({ row, review }) => row.riskFlags.some((flag) => review.actualHandicap && flag.includes(review.actualHandicap))).length;
  return [
    ["低进球权重抬升", lowGoalHits, lowGoalRows.length, "验证小比分是否被提前识别"],
    ["大球权重抬升", highGoalHits, highGoalRows.length, "验证开放局和打花局温度"],
    ["让球冲突信号", conflictHits, conflictRows.length, "验证不穿盘/穿盘预警"],
    ["强异动样本", strongRows.length, verified.length, "记录需要优先复核的场次"],
  ];
}

function renderSpBacktest(rows) {
  const container = document.querySelector("#odds-backtest");
  if (!container) return;
  const stats = spBacktestRows(rows);
  container.innerHTML = `
    <div class="stat-title-line">
      <h3>SP 漂移回测</h3>
      <span class="mini-pill">开盘到最新 / 赛果对照</span>
    </div>
    <div class="sp-backtest-grid">
      ${stats
        .map(
          ([label, hit, total, note]) => `
            <article>
              <span>${label}</span>
              <strong>${hit}/${total || 0}</strong>
              <em>${total ? hitRate(hit, total) : "等待样本"}</em>
              <p>${note}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOddsPreTable(rows) {
  const tableRows = rows
    .map(
      (row) => {
        const detailKey = encodeURIComponent(sportteryItemKey(row));
        return `
        <tr>
          <td>${row.issue || row.no}</td>
          <td>${row.league}</td>
          <td class="text-cell"><button type="button" class="review-match-link odds-map-match-link" data-odds-open-detail="${detailKey}" title="进入比赛详情">${row.home} vs ${row.away}</button></td>
          <td>${formatDate(row.ticaiDate)}</td>
          <td>${row.handicap}</td>
          <td>${row.analyses.map(renderPlayTrend).join("")}</td>
          <td><strong>${row.pressureLevel}</strong></td>
          ${(() => {
            const metrics = oddsMapResearchMetrics(row);
            return `
              <td><span class="market-metric ${metrics.tone}">${metrics.spreadText}</span></td>
              <td><span class="market-metric ${metrics.tone}">${metrics.gapText} / ${metrics.valueText}</span></td>
            `;
          })()}
          <td>${row.riskFlags.length ? row.riskFlags.join(" / ") : "结构正常"}</td>
        </tr>
      `;
      }
    )
    .join("") || `<tr><td colspan="10" class="empty-cell">暂无赛前 SP 历史，先运行体彩实时抓取。</td></tr>`;

  return `
    <div class="review-record-wrap compact odds-map-wrap">
      <table class="review-record-table odds-map-record-table">
        <thead>
          <tr>
            <th>场次</th>
            <th>赛事</th>
            <th>对阵</th>
            <th>日期</th>
            <th>让球</th>
            <th>市场变化</th>
            <th>强度</th>
            <th>离散度</th>
            <th>模型缺口 / 凯利</th>
            <th>提示</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderOddsBacktestTable(rows) {
  const tableRows = rows
    .map((row) => {
      const review = oddsMapRowReview(row);
      const key = encodeURIComponent(oddsMapRowKey(row));
      const predText = review.pred
        ? `${dash(review.pred.pick)} / ${dash(review.pred.hPick)} / ${dash(review.pred.totalGoalsPick)}`
        : "未锁版";
      const driftText = row.riskFlags.length ? row.riskFlags.join(" / ") : row.pressureLevel;
      const modelText = [
        `胜平负${boolText(review.directionHit)}`,
        `让球${boolText(review.handicapHit)}`,
        `进球${boolText(review.totalGoalsHit)}`,
      ].join(" · ");
      return `
        <tr>
          <td>${row.issue || row.no}</td>
          <td class="text-cell">${row.home} vs ${row.away}</td>
          <td><strong>${review.scoreData?.scoreText || "-"}</strong><em class="odds-score-source">${review.scoreData?.source || ""}</em></td>
          <td>${predText}</td>
          <td>${driftText}</td>
          <td>${modelText}</td>
          <td>${review.driftHits.length ? review.driftHits.join(" / ") : "记录为样本"}</td>
          <td><button type="button" class="odds-backtest-detail-btn" data-odds-backtest-detail="${key}">查看</button></td>
        </tr>
      `;
    })
    .join("") || `<tr><td colspan="8" class="empty-cell">暂无可回测赛果。</td></tr>`;

  return `
    <div class="review-record-wrap compact odds-map-wrap">
      <table class="review-record-table odds-map-record-table odds-backtest-record-table">
        <thead>
          <tr>
            <th>场次</th>
            <th>对阵</th>
            <th>比分</th>
            <th>锁版</th>
            <th>漂移信号</th>
            <th>模型校验</th>
            <th>提示</th>
            <th>单场</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function openOddsBacktestModal(encodedKey = "") {
  const row = findOddsMapRowByKey(encodedKey);
  if (!row) return;
  const review = oddsMapRowReview(row);
  const metrics = oddsMapResearchMetrics(row);
  const pred = review.pred;
  const key = oddsMapRowKey(row);
  document.querySelector(".odds-backtest-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "odds-backtest-modal";
  modal.innerHTML = `
    <div class="odds-backtest-dialog" role="dialog" aria-modal="true" aria-label="${row.home} vs ${row.away} 回测详情">
      <header>
        <div>
          <span>${row.issue || row.no} · ${row.league || "世界杯"}</span>
          <strong>${row.home} vs ${row.away}</strong>
          <em>${formatDate(row.ticaiDate)} · 让球 ${row.handicap || review.handicap || "-"}</em>
        </div>
        <button type="button" aria-label="关闭" data-odds-backtest-close>×</button>
      </header>
      <section class="odds-backtest-dialog-grid">
        <article>
          <span>赛果</span>
          <strong>${review.scoreData?.scoreText || "-"}</strong>
          <em>${review.scoreData?.source || "未命中赛果"}</em>
        </article>
        <article>
          <span>锁版结论</span>
          <strong>${pred ? `${dash(pred.pick)} / ${dash(pred.hPick)}` : "未锁版"}</strong>
          <em>${pred ? dash(pred.totalGoalsPick) : "未写入锁版"}</em>
        </article>
        <article>
          <span>市场漂移</span>
          <strong>${row.strongest ? `${row.strongest.market} ${row.strongest.label}` : "-"}</strong>
          <em>${row.strongest ? `${deltaText(row.strongest.weightDelta)} · SP ${row.strongest.openingSp} → ${row.strongest.sp}` : "快照不足"}</em>
        </article>
        <article>
          <span>概率缺口</span>
          <strong>${metrics.gapText}</strong>
          <em>离散度 ${metrics.spreadText} · 凯利 ${metrics.valueText}</em>
        </article>
      </section>
      <section class="odds-backtest-status-grid">
        <span class="${boolTone(review.directionHit)}">胜平负：${boolText(review.directionHit)}</span>
        <span class="${boolTone(review.handicapHit)}">让球：${boolText(review.handicapHit)}</span>
        <span class="${boolTone(review.totalGoalsHit)}">进球：${boolText(review.totalGoalsHit)}</span>
        <span class="${boolTone(review.scoreHit)}">比分：${boolText(review.scoreHit)}</span>
      </section>
      <section class="odds-backtest-notes">
        <p><b>漂移提示：</b>${row.riskFlags.length ? row.riskFlags.join(" / ") : row.pressureLevel}</p>
        <p><b>回测结论：</b>${review.driftHits.length ? review.driftHits.join(" / ") : "本场作为盘口漂移样本保留，后续扩大样本后再统计稳定性。"}</p>
      </section>
      <footer>
        <button type="button" class="secondary" data-odds-backtest-close>关闭</button>
        <button type="button" data-odds-open-detail="${key}">进入单场详情</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
}

function oddsSignalSummaryRows(type, rows = []) {
  if (type === "strong") return rows.filter((row) => row.pressureLevel === "强异动");
  if (type === "conflict") return rows.filter((row) => row.riskFlags.length);
  if (type === "home-hot") {
    return rows.filter((row) => row.analyses.some(
      (item) => item.playType === "had" && item.strongest?.code === "H" && item.strongest?.trend === "strengthening"
    ));
  }
  return [];
}

function oddsSignalMovementText(row) {
  return row.analyses
    .filter((item) => item.available && item.strongest)
    .map((item) => {
      const top = item.strongest;
      return `<li><b>${item.label} · ${top.label}</b><span>SP ${top.openingSp} → ${top.sp}</span><em>权重 ${deltaText(top.weightDelta)} · ${top.trend === "strengthening" ? "升温" : top.trend === "weakening" ? "降温" : "稳定"}</em></li>`;
    })
    .join("");
}

function openOddsSignalSummaryModal(type = "") {
  const { preRows } = splitOddsMapRows(oddsMapRows());
  const rows = oddsSignalSummaryRows(type, preRows).sort((a, b) => b.volatility - a.volatility);
  const config = {
    strong: { title: "强异动比赛", note: "最大 SP 变化超过 8%，需要优先复核盘口方向。" },
    conflict: { title: "冲突信号比赛", note: "胜平负、让球或总进球市场出现不一致信号。" },
    "home-hot": { title: "主胜升温比赛", note: "胜平负市场中主胜去水权重相比开盘明显抬升。" },
  }[type];
  if (!config) return;
  document.querySelector(".odds-backtest-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "odds-backtest-modal odds-signal-modal";
  modal.innerHTML = `
    <div class="odds-backtest-dialog odds-signal-dialog" role="dialog" aria-modal="true" aria-label="${config.title}">
      <header>
        <div><span>SP Radar · 赛前监控</span><strong>${config.title}</strong><em>${config.note}</em></div>
        <button type="button" aria-label="关闭" data-odds-backtest-close>×</button>
      </header>
      <section class="odds-signal-list">
        ${rows.length ? rows.map((row) => {
          const key = oddsMapRowKey(row);
          return `
            <article class="odds-signal-row">
              <div class="odds-signal-row-head">
                <div><span>${row.issue || row.no} · ${row.league || "体彩赛事"}</span><strong>${row.home} vs ${row.away}</strong><em>${formatDate(row.matchDate || row.ticaiDate)} · ${row.pressureLevel}</em></div>
                <button type="button" data-odds-open-detail="${encodeURIComponent(key)}">进入详情</button>
              </div>
              <div class="odds-signal-flags">${(row.riskFlags.length ? row.riskFlags : [row.pressureLevel]).map((flag) => `<span>${flag}</span>`).join("")}</div>
              <ul>${oddsSignalMovementText(row)}</ul>
            </article>`;
        }).join("") : `<div class="odds-signal-empty">当前赛前场次没有符合该信号的比赛。</div>`}
      </section>
      <footer><button type="button" class="secondary" data-odds-backtest-close>关闭</button></footer>
    </div>`;
  document.body.appendChild(modal);
}

function oddsMapResearchMetrics(row) {
  const pred = oddsMapPredictionForRow(row);
  const math = oddsMathForMatch(row.no, pred);
  if (!math?.normal.entries.length) {
    return {
      spreadText: "-",
      gapText: pred ? "待赔率" : "待锁版",
      valueText: "-",
      tone: "muted",
    };
  }
  const gap = math.probGap;
  const value = math.valueIndex;
  return {
    spreadText: probabilityPercent(math.spread, 1),
    gapText: Number.isFinite(gap) ? deltaText(gap, 1) : pred ? "未匹配" : "待锁版",
    valueText: Number.isFinite(value) ? `${value.toFixed(1)}%` : "-",
    tone: Number.isFinite(gap) && gap > 0.03 ? "hot" : Number.isFinite(gap) && gap < -0.03 ? "cold" : "flat",
  };
}

function renderOddsMap() {
  const cards = document.querySelector("#odds-map-cards");
  const table = document.querySelector("#odds-map-table");
  if (!cards || !table) return;

  const rows = oddsMapRows();
  const { preRows, backtestRows } = splitOddsMapRows(rows);
  document.querySelectorAll("[data-odds-map-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.oddsMapView === activeOddsMapView);
  });
  const panel = document.querySelector("#odds-map");
  panel?.classList.toggle("odds-map-backtest-view", activeOddsMapView === "backtest");
  panel?.classList.toggle("odds-map-pre-view", activeOddsMapView !== "backtest");
  renderSpBacktest(backtestRows);
  const liveCount = document.querySelector("#odds-map-live-count");
  if (liveCount) liveCount.textContent = `${preRows.length} 赛前 / ${backtestRows.length} 回测`;

  if (activeOddsMapView === "backtest") {
    cards.innerHTML = `
      <div class="odds-radar-summary">
        <article><span>回测样本</span><strong>${backtestRows.length}</strong><em>已有赛果场次</em></article>
        <article><span>已锁版</span><strong>${backtestRows.filter((row) => oddsMapPredictionForRow(row)).length}</strong><em>可校验模型结论</em></article>
        <article><span>漂移命中</span><strong>${backtestRows.filter((row) => oddsMapRowReview(row).driftHits.length).length}</strong><em>SP 信号对上赛果</em></article>
        <article><span>强异动</span><strong>${backtestRows.filter((row) => row.pressureLevel === "强异动").length}</strong><em>优先复盘样本</em></article>
      </div>
    `;
    table.innerHTML = renderOddsBacktestTable(backtestRows);
    return;
  }

  const hotRows = preRows
    .filter((row) => row.strongest)
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 4);
  const highCount = preRows.filter((row) => row.pressureLevel === "强异动").length;
  const conflictCount = preRows.filter((row) => row.riskFlags.length).length;
  const hadHomeHot = preRows.filter((row) =>
    row.analyses.some((item) => item.playType === "had" && item.strongest?.code === "H" && item.strongest?.trend === "strengthening")
  ).length;

  cards.innerHTML = `
    <div class="odds-radar-summary">
      <article><span>赛前监控</span><strong>${preRows.length}</strong><em>未完场开盘场次</em></article>
      <button type="button" data-odds-signal-summary="strong"><span>强异动</span><strong>${highCount}</strong><em>SP 变化超过 8%</em><small>点击查看明细</small></button>
      <button type="button" data-odds-signal-summary="conflict"><span>冲突信号</span><strong>${conflictCount}</strong><em>胜平负 / 让球不一致</em><small>点击查看明细</small></button>
      <button type="button" data-odds-signal-summary="home-hot"><span>主胜升温</span><strong>${hadHomeHot}</strong><em>胜平负主胜权重抬升</em><small>点击查看明细</small></button>
    </div>
    <div class="odds-spotlight-grid">
      ${
        hotRows.length
          ? hotRows
              .map(
                (row) => `
                  <article class="odds-spotlight-card">
                    <span>${row.issue || row.no} · ${row.league}</span>
                    <strong>${row.home} vs ${row.away}</strong>
                    <p>${row.strongest.market} 的 ${row.strongest.label} 权重变化 ${deltaText(row.strongest.weightDelta)}，SP ${row.strongest.openingSp} → ${row.strongest.sp}。${(() => {
                      const metrics = oddsMapResearchMetrics(row);
                      return ` 概率缺口 ${metrics.gapText}，离散度 ${metrics.spreadText}。`;
                    })()}</p>
                    <em>${row.riskFlags[0] || row.pressureLevel}</em>
                  </article>
                `
              )
              .join("")
          : "<p class='empty'>暂无可用 SP 历史快照</p>"
      }
    </div>
  `;

  table.innerHTML = renderOddsPreTable(preRows);
}
