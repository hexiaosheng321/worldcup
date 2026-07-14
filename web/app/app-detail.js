// app-detail.js — 比赛详情、体彩详情、证据面板
function renderSignals() {
  const finishedNode = document.querySelector("#signal-finished");
  const upcomingNode = document.querySelector("#signal-upcoming");
  const predictedNode = document.querySelector("#signal-predicted");
  const goalsNode = document.querySelector("#signal-goals");
  if (!finishedNode && !upcomingNode && !predictedNode && !goalsNode && !document.querySelector("#hero-model-version")) return;
  const worldCupPathMatches = window.location.hash === "#worldcup" ? worldCupGroupStageMatches() : [];
  const signalMatches = worldCupPathMatches.length ? worldCupPathMatches : matches;
  const finished = signalMatches.filter((match) => parseScore(officialScoreForMatch(match)));
  const totalGoals = finished.reduce((sum, match) => sum + parseScore(officialScoreForMatch(match)).total, 0);
  if (finishedNode) finishedNode.textContent = finished.length;
  if (upcomingNode) upcomingNode.textContent = Math.max(matches.length - finished.length, 0);
  if (predictedNode) predictedNode.textContent = uniquePredictionCount();
  if (goalsNode) goalsNode.textContent = finished.length ? (totalGoals / finished.length).toFixed(2) : "0.00";
  const heroVersion = document.querySelector("#hero-model-version");
  if (heroVersion) heroVersion.textContent = `当前模型 ${data.currentModelVersion || "V4"}`;
}

function renderToday() {
  const grid = document.querySelector("#today-grid");
  if (!grid) return;
  if (!worldCupStaticDataLoaded && !matches.length) {
    const todayCount = document.querySelector("#today-count");
    const todayDate = document.querySelector("#today-date");
    const nextLabel = document.querySelector("#next-label");
    if (todayCount) todayCount.textContent = "同步中";
    if (todayDate) todayDate.textContent = "正在读取世界杯赛程";
    if (nextLabel) nextLabel.textContent = "世界杯";
    grid.innerHTML = dataLoadingMarkup(
      "正在同步世界杯赛程",
      "正在读取完整赛程、赛果和模型锁版数据。"
    );
    return;
  }
  const today = currentSportteryBusinessDate(calendarToday());
  const tomorrow = addDays(today, 1);
  const dateSet = new Set([today, tomorrow].filter(Boolean));
  let flowMatches = worldCupMatchFlowMatches(today, tomorrow);
  if (!flowMatches.length) {
    const sportteryDateMatches = (oddsData.matches || [])
      .filter((item) => itemMatchesDateSet(item, dateSet))
      .map((item) => ({
        no: item.no || compactSportteryNo(item.issue, item.matchId),
        date: item.ticaiDate || item.matchDate || today,
        matchDate: item.matchDate || item.ticaiDate || "",
        ticaiDate: item.ticaiDate || "",
        kickoffTime: item.kickoffTime || "",
        league: item.league || "",
        competition: item.competition || item.league || "",
        home: item.home,
        away: item.away,
        issue: item.issue || "",
        matchId: item.matchId || "",
        sportteryKey: sportteryItemKey(item),
        sportteryOnly: true,
      }));
    flowMatches = [
      ...matches.filter((m) => dateSet.has(m.date) || dateSet.has(ticaiDate(m)) || dateSet.has(m.matchDate)),
      ...sportteryDateMatches,
    ];
  }
  const fallbackMatches = flowMatches;
  const todayCount = document.querySelector("#today-count");
  const todayDate = document.querySelector("#today-date");
  const nextLabel = document.querySelector("#next-label");
  if (todayCount) todayCount.textContent = `${fallbackMatches.length} 场`;
  if (todayDate) todayDate.textContent = `${formatDate(today)}-${formatDate(tomorrow)} · 北京时间`;
  if (nextLabel) nextLabel.textContent = `${formatDate(today)} / ${formatDate(tomorrow)}`;
  grid.innerHTML = renderMatchLanes(fallbackMatches, { dateGetter: (match) => match.date });
  startMatchFlowTimers();
}

const signalPageCopy = {
  finished: {
    eyebrow: "Finished Matches",
    title: "已完赛场次记录",
    pill: "赛果档案",
    note: "按比赛日期整理所有已产生比分的场次，点击任意卡片可进入单场详情。",
  },
  upcoming: {
    eyebrow: "Future Schedule",
    title: "未开赛未来赛程",
    pill: "待赛列表",
    note: "这里集中展示尚未产生比分的未来场次，方便后续逐场补推演。",
  },
  predicted: {
    eyebrow: "Locked Model",
    title: "已有推演比赛",
    pill: "模型锁版",
    note: "这里集中展示已经有模型推演的比赛，点击卡片可直接进入单场详情。",
  },
};

function signalMatches(type) {
  if (type === "finished") {
    return matches.filter((match) => parseScore(officialScoreForMatch(match)));
  }
  if (type === "upcoming") {
    return matches.filter((match) => !parseScore(officialScoreForMatch(match)));
  }
  if (type === "predicted") {
    return matches.filter((match) => latestPredictionFor(match.no));
  }
  return [];
}

function openSignalPage(type) {
  const body = document.querySelector("#signal-detail-body");
  const copy = signalPageCopy[type];
  if (!body || !copy) return;
  const items = signalMatches(type).slice().sort((a, b) => {
    const dateCompare = ticaiDate(a).localeCompare(ticaiDate(b));
    if (dateCompare !== 0) return dateCompare;
    return Number(a.no) - Number(b.no);
  });
  body.innerHTML = `
    <div class="signal-page-toolbar">
      <button type="button" data-signal-back>← 积分榜</button>
      <span>${copy.pill} · ${items.length} 场</span>
    </div>
    <div class="section-head signal-page-head">
      <div>
        <p class="eyebrow">${copy.eyebrow}</p>
        <h2>${copy.title}</h2>
        <p>${copy.note}</p>
      </div>
      <span class="pill">${items.length} 场</span>
    </div>
    <div class="signal-page-list">
      ${items.length ? renderMatchLanes(items) : "<p class='empty'>暂无场次</p>"}
    </div>
  `;
  activateTab("signal-detail");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showModelNotice(message) {
  let notice = document.querySelector("#model-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "model-notice";
    notice.className = "model-notice";
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(modelNoticeTimer);
  modelNoticeTimer = setTimeout(() => notice.classList.remove("show"), 2200);
}

function activateTab(tabName) {
  const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
  const targetPanel = document.querySelector(`#${tabName}`);
  if (!targetPanel) return;
  showDashboard();
  document.body.classList.toggle("is-detail-page", tabName === "match-detail");
  if (tabName !== "match-detail") document.body.classList.remove("sporttery-detail-mode");
  document.body.classList.toggle("sporttery-mode", tabName === "sporttery-pool");
  document.body.classList.toggle("site-locks-mode", tabName === "site-locks");
  document.body.classList.toggle("model-intro-mode", tabName === "model-intro");
  document.body.classList.toggle("model-stats-mode", tabName === "model-stats");
  document.body.classList.toggle("odds-map-mode", tabName === "odds-map");
  document.body.classList.toggle("about-site-mode", tabName === "about-site");
  tabs.forEach((item) => {
    item.classList.remove("active");
    item.setAttribute("aria-selected", "false");
  });
  panels.forEach((item) => item.classList.remove("active-panel"));
  if (targetTab) {
    targetTab.classList.add("active");
    targetTab.setAttribute("aria-selected", "true");
  }
  targetPanel.classList.add("active-panel");
  window.WC_I18N?.schedule();
  requestAnimationFrame(function(){
    var items = targetPanel.querySelectorAll(".match-card, .insight-card, .bar-row, .hist-row, .score-table > div, .home-research-grid > article");
    items.forEach(function(el, i){
      if (i < 20) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = "fadeInUp 0.35s ease " + (i * 0.04) + "s both"; }
    });
  });
}

function openModelForMatch(no) {
  const siteLockCard = document.querySelector(`[data-site-lock-no="${no}"]`);
  if (siteLockCard) {
    activateTab("site-locks");
    requestAnimationFrame(() => {
      siteLockCard.scrollIntoView({ behavior: "smooth", block: "center" });
      siteLockCard.classList.add("focus-model");
      setTimeout(() => siteLockCard.classList.remove("focus-model"), 2200);
    });
    return;
  }
  activateTab("site-locks");
  showModelNotice(`第 ${no} 场等待推演`);
}

function openReviewForMatch(no) {
  activateTab("model-stats");
  renderGlobalStats();
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-global-stats-no="${no}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("focus-model");
    setTimeout(() => row.classList.remove("focus-model"), 1800);
  });
}

function reviewMatchButton(match) {
  if (match.sportteryKey) {
    return `
      <button type="button" class="review-match-link" data-review-open-sporttery="${match.sportteryKey}" title="进入体彩推演页">
        ${match.home} vs ${match.away}
      </button>
    `;
  }
  return `
    <button type="button" class="review-match-link" data-review-open-match="${match.no}" title="进入模型推演页">
      ${match.home} vs ${match.away}
    </button>
  `;
}

function renderQuickMatchMode(match, pred, filter, finished, hLabel) {
  const scoreText = officialScoreForMatch(match);
  if (!pred) {
    return `
      <section class="quick-decision-board">
        <article class="quick-main-card">
          <span>当前状态</span>
          <strong>${finished ? "已完赛" : "待锁版"}</strong>
          <p>${finished ? `赛果 ${scoreText}` : "这场还没有模型输出，先保留赛程和盘口信息。"}</p>
        </article>
        <article>
          <span>盘口</span>
          <strong>${hLabel || "暂无"}</strong>
          <p>等待模型推演后再评估证据质量。</p>
        </article>
      </section>
    `;
  }
  const gate = autoDecisionGate(match.no, pred);
  const consistency = marketConsistency(match.no, pred);
  const evidence = modelEvidenceScore(match.no, pred);
  return `
    <section class="quick-decision-board">
      <article class="quick-main-card ${gate.tone}">
        <span>证据质量</span>
        <strong>${gate.level}</strong>
        <p>${gate.action} · ${gate.notes.join(" / ")}</p>
      </article>
      <article>
        <span>最终锁版</span>
        <strong>${pred.pick} / ${handicapPick(pred) || "让球待定"}</strong>
        <p>总进球 ${pred.totalGoalsPick || "暂无"} · 比分 ${pred.mainScore} / ${pred.counterScore}</p>
      </article>
      <article>
        <span>风险状态</span>
        <strong>${consistency.label}</strong>
        <p>${consistency.detail}</p>
      </article>
      <article>
        <span>证据完整度</span>
        <strong>${evidence.score}%</strong>
        <p>${evidence.readyCount}/${evidence.total} 类证据已接入</p>
      </article>
    </section>
    <section class="match-page-section quick-reason-card">
      <span>关键判断</span>
      <p>${displayModelText(pred.keyJudgement || pred.marketGap || pred.script)}</p>
    </section>
    <section class="match-page-section quick-risk-card">
      <span>赛前风险</span>
      <div class="quick-risk-grid">
        <div><b>比赛类型</b><strong>${filter.type}</strong></div>
        <div><b>置信等级</b><strong>${filter.grade}</strong></div>
        <div><b>建议动作</b><strong>${filter.advice}</strong></div>
        <div><b>候选比分</b><strong>${filter.scorePool}</strong></div>
      </div>
    </section>
  `;
}

function compactProjectionValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return displayModelText(value);
}

function projectionScorePick(pred, fallback = "") {
  const scores = [pred?.mainScore || pred?.score1, pred?.counterScore || pred?.score2].filter(Boolean);
  return scores.length ? scores.join(" / ") : fallback || pred?.scorePick || "-";
}

function escapedRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsedStateFromModelText(text = "", team = "") {
  if (!text || !team) return null;
  const pattern = new RegExp(`${escapedRegExp(team)}样本排名第(\\d+)，(\\d+)分，进(\\d+)失(\\d+)，净胜(-?\\d+)；近(\\d+)场([^，；]+)，进(\\d+)失(\\d+)`, "i");
  const matched = String(text).match(pattern);
  if (!matched) return null;
  return {
    team,
    rank: Number(matched[1]),
    points: Number(matched[2]),
    goalsFor: Number(matched[3]),
    goalsAgainst: Number(matched[4]),
    goalDifference: Number(matched[5]),
    recentCount: Number(matched[6]),
    form: matched[7],
    recentGoalsFor: Number(matched[8]),
    recentGoalsAgainst: Number(matched[9]),
  };
}

function stateFromObjectiveLayer(context = {}, side = "home") {
  const state = side === "home" ? context.homeState : context.awayState;
  if (!state || !Number.isFinite(Number(state.rank))) return null;
  return {
    team: state.team || "",
    rank: Number(state.rank),
    points: Number(state.points),
    goalsFor: Number(state.goalsFor),
    goalsAgainst: Number(state.goalsAgainst),
    goalDifference: Number(state.goalDifference),
    form: state.form || "",
  };
}

function motivationBand(state = {}) {
  const rank = Number(state.rank);
  const points = Number(state.points);
  if (!Number.isFinite(rank)) return "动机待核";
  if (rank <= 4) return "争冠/欧战区压力";
  if (rank <= 8) return "上半区抢分";
  if (rank >= 16 || (Number.isFinite(points) && points <= 12)) return "保级/止跌压力";
  return "中游抢分";
}

function competitionWeightDetail(pred = {}, filter = {}, item = null) {
  const row = item || findSportteryItemForPrediction(pred) || {};
  const league = pred.league || pred.competition || row.league || row.competition || "体彩赛事";
  const issue = row.issue || row.no || pred.issue || pred.no || "";
  const home = row.home || pred.home || pred.homeTeam || "";
  const away = row.away || pred.away || pred.awayTeam || "";
  const kickoffDate = row.matchDate || row.ticaiDate || pred.matchDate || pred.date || "";
  const kickoffTime = row.kickoffTime || pred.kickoffTime || pred.kickoffClock || "";
  const context = pred.objectiveDataLayer || footballDataContextForSportteryItem(row);
  const stateText = [pred.teamState, pred.recentAnalysis, context?.stateSummary].filter(Boolean).join(" ");
  const homeState = stateFromObjectiveLayer(context, "home") || parsedStateFromModelText(stateText, home);
  const awayState = stateFromObjectiveLayer(context, "away") || parsedStateFromModelText(stateText, away);
  const parts = [];
  const prefix = [league, issue].filter(Boolean).join(" ");
  parts.push(`${prefix || league}：${kickoffDate || "-"} ${kickoffTime || "--:--"}，${home || "主队"}主场对${away || "客队"}。`);
  if (homeState && awayState) {
    const rankGap = homeState.rank - awayState.rank;
    const pointGap = homeState.points - awayState.points;
    const gdGap = homeState.goalDifference - awayState.goalDifference;
    parts.push(`${home}样本第${homeState.rank}、${homeState.points}分、净胜${homeState.goalDifference}；${away}样本第${awayState.rank}、${awayState.points}分、净胜${awayState.goalDifference}；积分差${pointGap >= 0 ? "+" : ""}${pointGap}，排名差${rankGap === 0 ? "0" : rankGap > 0 ? `主队低${rankGap}位` : `主队高${Math.abs(rankGap)}位`}，净胜球差${gdGap >= 0 ? "+" : ""}${gdGap}。`);
    parts.push(`动机拆分：${home}=${motivationBand(homeState)}，${away}=${motivationBand(awayState)}；${Math.abs(pointGap) <= 3 ? "积分接近，抢分权重高于名气权重" : pointGap > 0 ? "主队积分占优，需防领先后降速" : "客队积分/排名占优，受让或反击分支必须保留"}。`);
    if (homeState.form || awayState.form) parts.push(`近况压力：${home}${homeState.form ? ` ${homeState.form}` : ""}；${away}${awayState.form ? ` ${awayState.form}` : ""}。`);
  } else if (pred.competitionRules || pred.groupSituation || pred.pathMotive) {
    parts.push(firstModelText(pred.groupSituation, pred.pathMotive, pred.competitionRules));
  } else {
    parts.push(`${league}按联赛V1处理：先核查积分排名、主客场和赛程密度，再进入盘口/比分闸门。`);
  }
  if (/瑞超|韩职|芬超|联赛/i.test(league)) {
    parts.push("规则口径：常规联赛3分制，不套世界杯淘汰赛净胜球动机；阵容、伤停、赛程压力等客观信息由系统侧抓取和补齐；数据源暂缺时降低置信并保留PRE_LOCK，不把信息缺口当成锁版前置门槛。");
  } else if (/世界杯|World Cup/i.test(league)) {
    parts.push("规则口径：世界杯按90分钟体彩结算，淘汰赛平局/受让保护权重上升，领先后是否追第二球单独判断。");
  }
  if (filter?.favoriteIntent && !parts.join("").includes(filter.favoriteIntent)) parts.push(filter.favoriteIntent);
  return parts.filter(Boolean).join(" ");
}

function renderProjectionDecisionDeck(match, pred, filter, options = {}) {
  const gate = options.gate === false ? null : match?.no ? autoDecisionGate(match.no, pred) : null;
  // Pass the complete fixture identity. Using only `201` can resolve another
  // league/day's repeated Sporttery number and corrupt the handicap mapping.
  const resolved = resolvedPredictionDecision(pred, { handicapLine: match ? handicapLine(match) : "" });
  const scorePick = projectionScorePick(pred, options.scorePick);
  const totalPick = pred?.totalGoalsPick || options.totalPick || "-";
  const handicap = resolved?.handicapPick || handicapPick(pred) || options.handicapPick || "-";
  const issue = options.issue || (match ? ticaiIssue(match) : pred?.issue) || "-";
  const version = pred ? predictionVersionLabel(pred) : "待推演";
  const summary = resolved?.hasConflict
    ? `${resolved.resolution} 最终单选 ${resolved.pick || "-"}；让球 ${handicap}；总进球 ${totalPick}；比分 ${scorePick}`
    : finalDecisionActionText(pred) || `单选 ${pred?.pick || "-"}；让球 ${handicap}；总进球 ${totalPick}；比分 ${scorePick}`;
  const competition = pred
    ? modelDisplayName(pred, match, options.competition || pred?.competitionModel || pred?.competitionType || (match?.group ? `${match.group}组` : ""))
    : options.competition || (match?.group ? `${match.group}组` : "");
  const meta = [
    competition,
    gate ? `证据 ${gate.level} / ${gate.score}` : "",
    filter?.grade ? `置信 ${filter.grade}` : "",
    filter?.advice ? `动作 ${filter.advice}` : "",
  ].filter(Boolean);
  return `
    <section class="match-page-section projection-deck">
      <div class="projection-deck-head">
        <span>完整推演总览</span>
        <strong>${compactProjectionValue(summary)}</strong>
        <em>${meta.join(" · ")}</em>
      </div>
      <div class="projection-deck-grid">
        <article><small>体彩期号</small><b>${issue}</b></article>
        <article><small>模型版本</small><b>${version}</b></article>
        <article><small>单选</small><b>${resolved?.pick || pred?.pick || options.directionPick || "-"}</b></article>
        <article><small>让球</small><b>${handicap}</b></article>
        <article><small>总进球</small><b>${totalPick}</b></article>
        <article><small>比分预测</small><b>${scorePick}</b></article>
      </div>
    </section>
  `;
}

function renderWorldCupFullProjection(match, pred, filter, odds) {
  if (!pred) {
    return `
      <section class="match-page-section">
        <span>模型状态</span>
        <p>这场还没有赛前锁版记录。</p>
      </section>
    `;
  }
  return `
    ${renderProjectionDecisionDeck(match, pred, filter)}
    ${renderDecisionGatePanel(match.no, pred)}
    ${renderSpRadarPanel(match.no, "detail")}
    ${renderModelTriadPanel(match.no, pred)}
    ${renderMarketConsistencyPanel(match.no, pred)}
    ${renderOddsMathPanel(match.no, pred)}
    ${renderTotalGoalsDistribution(match.no, pred)}
    ${renderModelInputChecklist(match.no, pred)}
    ${
      odds
        ? `
          <section class="match-page-section">
            <span>赔率面</span>
            <p>胜 ${odds.normal?.win || "-"} ｜ 平 ${odds.normal?.draw || "-"} ｜ 负 ${odds.normal?.lose || "-"} ｜ 让球 ${odds.handicap || "0"}</p>
          </section>
        `
        : ""
    }
    ${renderUniversalModelPanel(pred)}
    ${renderD1CaseBasePanel(pred, match)}
    ${renderSimilarCasePanel(pred, match)}
    ${renderFinalDecisionGatePanel(pred)}
    ${renderJudgementRiskPanel(pred)}
  `;
}

function renderJudgementRiskPanel(pred = {}, fallbackNotes = []) {
  const notes = [
    pred?.decisionConflict,
    pred?.keyFailureRisk,
    pred?.eventRisk,
    pred?.dataQuality,
    ...(Array.isArray(fallbackNotes) ? fallbackNotes : []),
  ]
    .map((note) => displayModelText(note))
    .filter(Boolean)
    .filter((note, index, rows) => rows.indexOf(note) === index)
    .slice(0, 4);
  if (!notes.length) notes.push("当前没有完整风险证据，正式判断前仍需复核盘口冲突、阵容变化和最可能失败方式。");
  return `
    <section class="match-page-section sporttery-risk-panel judgement-risk-panel" data-fixed-detail-panel="judgement-risk">
      <span>判断风险</span>
      <div class="sporttery-risk-list">
        ${notes.map((note) => `<em>${note}</em>`).join("")}
      </div>
    </section>
  `;
}

function renderMatchDetail(no) {
  const content = document.querySelector("#match-detail-body");
  const match = matches.find((item) => item.no === no);
  if (!content || !match) return;
  const pred = latestPredictionFor(no);
  const finished = Boolean(parseScore(officialScoreForMatch(match)));
  const odds = oddsMatch(no);
  const hLabel = pred ? handicapLabel(pred) : handicapLine(no) ? `${match.home}${handicapLine(no)}` : "";
  const filter = pred ? advancedFilter(pred) : null;
  const backLabel =
    matchDetailReturnTarget === "review"
      ? "← 模型复盘统计"
      : matchDetailReturnTarget === "locks"
        ? "← 赛事推演锁版"
      : matchDetailReturnTarget === "model-stats"
        ? "← 统计和回测"
      : matchDetailReturnTarget === "knockout"
        ? "← 淘汰赛签表"
        : "← 积分榜";
  content.innerHTML = `
    <div class="match-page-toolbar">
      <button type="button" data-detail-back>${backLabel}</button>
      <span>${match.no} · ${formatDate(ticaiDate(match))} · ${match.group}组</span>
    </div>
    <section class="match-page-hero">
      <div>
        <p class="eyebrow">Match Detail</p>
        <h2>${match.home} vs ${match.away}</h2>
        <p>${pred?.keyJudgement || pred?.marketGap || "这场还没有模型锁版，先保留赛程和盘口入口。"}</p>
      </div>
      <div class="match-page-summary">
        <span>${ticaiIssue(match)}</span>
        <div class="summary-grid">
          <div><small>单选</small><b>${pred ? pred.pick : finished ? "已完赛" : "待锁版"}</b></div>
          <div><small>让球</small><b>${pred ? handicapPick(pred) || "暂无" : hLabel || "暂无"}</b></div>
          <div><small>总进球</small><b>${pred?.totalGoalsPick || "暂无"}</b></div>
          <div><small>比分预测</small><b>${pred ? `${pred.mainScore} / ${pred.counterScore}` : "待推演"}</b></div>
        </div>
      </div>
    </section>
    <div class="match-mode-switch" role="tablist" aria-label="单场详情模式">
      <button type="button" class="active" data-match-mode="quick">快速判断</button>
      <button type="button" data-match-mode="full">完整推演</button>
    </div>
    <div class="match-mode-panel active" data-match-mode-panel="quick">
      ${renderQuickMatchMode(match, pred, filter, finished, hLabel)}
    </div>
    <div class="match-mode-panel" data-match-mode-panel="full" hidden>
      ${renderWorldCupFullProjection(match, pred, filter, odds)}
    </div>
    <div class="match-page-actions">
      <button type="button" data-detail-model="${match.no}">赛事推演锁版</button>
      <button type="button" class="secondary" data-detail-review="${match.no}">模型复盘统计</button>
    </div>
  `;
  activateTab("match-detail");
  if (pred) refreshD1CaseBasePanel(pred, match);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMatchPage(no, returnTarget = "today") {
  matchDetailReturnTarget = returnTarget;
  if (window.location.hash !== `#match-${no}`) {
    window.location.hash = `match-${no}`;
  }
  renderMatchDetail(no);
}

function oddsPairList(label, odds = {}) {
  odds = odds || {};
  const rows = [
    ["胜", odds.win],
    ["平", odds.draw],
    ["负", odds.lose],
  ].filter(([, value]) => value);
  if (!rows.length) return "";
  return `
    <section class="match-page-section">
      <span>${label}</span>
      <div class="sporttery-detail-odds">
        ${rows.map(([name, value]) => `<article><small>${name}</small><strong>${value}</strong></article>`).join("")}
      </div>
    </section>
  `;
}

function sportteryDetailRow(item = {}) {
  const result = resultForSportteryItem(item);
  const liveScore = liveScoreForSportteryItem(item);
  const itemFinalScore = sportteryResultIsFinished(item) ? normalizeResultScore(item.score) : "";
  const resultFinalScore = sportteryResultIsFinished(result) ? normalizeResultScore(result?.score) : "";
  const usableItemScore = sportteryScoreIsUsable(item) ? normalizeResultScore(item.score) : "";
  const usableResultScore = sportteryScoreIsUsable(result) ? normalizeResultScore(result?.score) : "";
  const resultScore = itemFinalScore || resultFinalScore || usableResultScore || usableItemScore || (liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "");
  const liveScoreText = normalizeResultScore(liveScore?.score);
  const score = resultScore || liveScoreText;
  const linkedMatch = matchFromOddsItem(item) || matchFromResultItem(item);
  const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
  const hasStarted = Number.isFinite(kickoffAt) && Date.now() >= kickoffAt;
  const pendingResult = hasStarted && isPastResultWindow(kickoffAt);
  const liveStatus = liveScoreStatusText(liveScore);
  return {
    ...item,
    linkedNo: linkedMatch?.no || "",
    displayDate: item.ticaiDate || item.matchDate || oddsData.lotterNo || dashboardToday(),
    displayHome: linkedMatch?.home || item.home,
    displayAway: linkedMatch?.away || item.away,
    displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
    score,
    liveScore: liveScoreText,
    liveStatus,
    liveHalfScore: liveScore?.halfScore || result?.halfScore || item.halfScore || "",
    liveSource: liveScore?.source || "",
    result,
    status: resultScore
      ? (itemFinalScore || resultFinalScore ? "已完赛" : "比分待确认")
      : pendingResult
        ? "待回填"
        : (liveScoreText || hasStarted) ? liveStatus || "进行中" : item.statusName || "待赛",
  };
}

function sportteryOddsLeader(odds = {}, labels = [["胜", "win"], ["平", "draw"], ["负", "lose"]]) {
  return labels
    .map(([label, key]) => ({ label, odd: numberOdd(odds?.[key]) }))
    .filter((item) => item.odd)
    .sort((a, b) => a.odd - b.odd)[0] || null;
}

function sportteryResearchSnapshot(item, modelPred) {
  const score = normalizeResultScore(item.score);
  if (modelPred) {
    const modelName = modelDisplayName(modelPred, item, modelPred.competitionModel || modelPred.competitionType || item?.league);
    const actualTotal = parseScore(score)?.total;
    const resolved = resolvedPredictionDecision(modelPred, { handicapLine: item?.handicap || reviewHandicapLine(modelPred) });
    const riskNotes = [
      resolved?.resolution,
      modelPred.decisionConflict,
      modelPred.keyFailureRisk,
      modelPred.eventRisk,
      modelPred.dataQuality,
    ].filter(Boolean);
    return {
      statusLabel: score ? "赛后复盘" : `${modelName}锁版`,
      action: modelPred.advice || "已锁版",
      directionPick: resolved?.pick || modelPred.pick || "-",
      handicapPick: resolved?.handicapPick || handicapPick(modelPred) || "-",
      totalPick: modelPred.totalGoalsPick || "-",
      scorePick: [modelPred.mainScore, modelPred.counterScore].filter(Boolean).join(" / ") || modelPred.scorePick || "-",
      riskNotes,
      score,
      actualDirection: direction(score),
      actualHandicap: handicapDirection(score, reviewHandicapLine(modelPred)),
      actualTotal,
      modelPred,
    };
  }
  const normalLeader = sportteryOddsLeader(item.normal);
  const handicapLeader = sportteryOddsLeader(item.handicapOdds, [["让胜", "win"], ["让平", "draw"], ["让负", "lose"]]);
  const totalLow = lowestOddOption(item.totalGoalsOdds || [], "goals");
  const scoreLow = (item.scoreOdds || [])
    .slice(0, 4)
    .map((odd) => String(odd.score || "").replace(":", "-"))
    .filter(Boolean);
  const hasEnough = Boolean(normalLeader || handicapLeader || totalLow || scoreLow.length);
  const actualDirection = direction(score);
  const actualHandicap = handicapDirection(score, item.handicap || "0");
  const actualTotal = parseScore(score)?.total;
  const riskNotes = [];
  if (normalLeader && handicapLeader && !handicapLeader.label.includes(normalLeader.label)) riskNotes.push("胜平负和让球方向不完全一致，需二次过滤");
  if (normalLeader?.odd && normalLeader.odd >= 2.45) riskNotes.push("主方向赔率偏高，单选信号不够硬");
  if (!item.normal) riskNotes.push("缺少胜平负盘口，只能参考让球和比分层");
  if (!item.scoreOdds?.length) riskNotes.push("缺少比分赔率，比分推演暂不完整");

  return {
    statusLabel: score ? "赛后复盘" : "待锁版",
    action: score ? "进入核验" : hasEnough ? "待推演" : "待锁版",
    directionPick: normalLeader ? `${normalLeader.label} ${normalLeader.odd.toFixed(2)}` : "-",
    handicapPick: handicapLeader ? `${handicapLeader.label} ${handicapLeader.odd.toFixed(2)}` : "-",
    totalPick: totalLow ? `${totalLow}球低位` : "-",
    scorePick: scoreLow.length ? scoreLow.join(" / ") : "-",
    riskNotes,
    score,
    actualDirection,
    actualHandicap,
    actualTotal,
  };
}

function sportteryV4Filter(modelPred, research) {
  if (!modelPred) return null;
  return {
    type: modelPred.matchType || modelPred.type || "常规局",
    grade: confidenceGrade(modelPred) || "-",
    advice: modelPred.advice || research?.action || "复核",
    scorePool: [modelPred.mainScore, modelPred.counterScore].filter(Boolean).join(" / ") || research?.scorePick || "-",
    favoriteIntent: modelPred.favoriteIntent || modelPred.groupSituation || "按世界杯V4经验链判断，但联赛/杯赛保留各自版本号；赛事规则层分别解释动机。",
    underdogResistance: modelPred.underdogResistance || modelPred.recentAnalysis || "按弱队低位防守、转换和受让保护判断。",
    institutionFear: modelPred.institutionFear || modelPred.institutionLine || modelPred.marketGap || "等待机构视角补充。",
    excludedNoise: modelPred.excludedNoise || modelPred.noiseFilter || "排除名气、排名和单一赔率低位带来的噪音。",
    lineMovement: modelPred.lineMovement || modelPred.marketGap || "-",
    eventRisk: modelPred.eventRisk || modelPred.keyFailureRisk || "-",
    scoreElimination: modelPred.scoreElimination || "保留模型主比分和反比分，排除与盘口结构冲突的高热比分。",
    keyFailureRisk: modelPred.keyFailureRisk || modelPred.decisionConflict || "-",
    stateTransfer:
      modelPred.stateTransfer ||
      modelPred.knockoutStateTransfer ||
      modelPred.timeStateTransfer ||
      modelPred.halftimeDecision ||
      "赛前需明确90分钟目标、0-0到60分钟后的先变阵方、领先后是否继续追第二球，以及弱队落后后压出还是继续保守。",
    failureMode:
      modelPred.failureMode ||
      modelPred.likelyMissMode ||
      modelPred.keyFailureRisk ||
      "锁版前必须说明最可能错在方向、让球还是总进球，并据此降级或保留反剧本。",
  };
}

function probabilityNumber(value) {
  return parseProbRange(value) || 0;
}

function qualityLevel(value = "") {
  const text = String(value || "").toUpperCase();
  if (text.includes("HIGH") || text.includes("完整")) return "HIGH";
  if (text.includes("LOW") || text.includes("缺") || text.includes("不足")) return "LOW";
  return "MEDIUM";
}

function normalizedFinalAction(pred) {
  return window.WC_LOCK_ENGINE?.finalAction(pred?.advice || confidenceAdvice(confidenceGrade(pred))) || "谨慎";
}

function simpleConsistencyScore(pred = {}) {
  let score = 3;
  if (pred.decisionConflict) score -= 1;
  if (pred.crossMarketConsistency && !/冲突|不一致/.test(pred.crossMarketConsistency)) score += 1;
  if (pred.handicapGate && pred.pick && pred.handicapPick && String(pred.handicapGate).includes(pred.handicapPick)) score += 1;
  return Math.max(1, Math.min(5, score));
}

function matchResultFromScore(match = {}) {
  const score = parseScore(officialScoreForMatch(match));
  if (!score) return null;
  return {
    matchId: String(match.matchId || match.no || ""),
    fullTimeHomeGoals: score.home,
    fullTimeAwayGoals: score.away,
    result1x2: score.home > score.away ? "HOME" : score.home === score.away ? "DRAW" : "AWAY",
    totalGoals: score.total,
    reviewedAt: new Date().toISOString(),
  };
}

function competitionBucketForCase(pred = {}, match = {}) {
  const candidates = [
    match.league,
    match.competition,
    pred.competition,
    pred.competitionModel,
    match.group,
  ].filter(Boolean);
  const normalize = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
      return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(text);
    }
    if (/世界杯/.test(text)) return "世界杯";
    if (/瑞超|Allsvenskan|Sweden/i.test(text)) return "瑞超";
    if (/芬超/.test(text)) return "芬超";
    return text;
  };
  const normalized = candidates.map(normalize).filter(Boolean);
  const generic = new Set(["竞彩", "体彩", "未分类赛事"]);
  const specificNonWorldCup = normalized.find((item) => item !== "世界杯" && !generic.has(item));
  if (specificNonWorldCup) return specificNonWorldCup;
  const worldCup = normalized.find((item) => item === "世界杯");
  if (worldCup) return worldCup;
  const specific = normalized.find((item) => !generic.has(item));
  if (specific) return specific;
  const text = candidates.join(" ");
  if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
    return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(text);
  }
  return text || "未分类赛事";
}

function lockFromPrediction(pred, match = {}) {
  if (!pred || !match || !window.WC_LOCK_ENGINE) return null;
  const gate = autoDecisionGate(match.no, pred);
  const odds = oddsMatch(match);
  const normal = odds?.normal || {};
  const market = odds ? impliedMarket(oddsMarketEntries(odds, "had")) : { entries: [] };
  const marketMap = new Map((market.entries || []).map((item) => [item.code, item.probability]));
  const modelHomeProb = probabilityNumber(pred.homeProb);
  const modelDrawProb = probabilityNumber(pred.drawProb);
  const modelAwayProb = probabilityNumber(pred.awayProb);
  const confidenceScore = gate.score || 0;
  const result = matchResultFromScore(match);
  const lock = window.WC_LOCK_ENGINE.buildLockedPrediction(match, {
    lockId: `${match.no || match.matchId}-${predictionModelVersion(pred)}-${pred.date || match.date}`,
    matchId: String(match.matchId || match.no || ""),
    matchCode: match.no || pred.no || "",
    league: competitionBucketForCase(pred, match),
    kickoffTime: match.matchDate || match.date || pred.date || "",
    lockedAt: pred.lockedAt || `${pred.date || match.date || data.currentDate}T00:00:00+08:00`,
    lockType: "FINAL_LOCK",
    modelHomeProb,
    modelDrawProb,
    modelAwayProb,
    recommendation: pred.pick || "",
    pick: pred.pick || "",
    finalGrade: confidenceGrade(pred),
    finalAction: normalizedFinalAction(pred),
    confidenceScore,
    riskScore: Math.max(0, 100 - confidenceScore),
    consistencyScore: simpleConsistencyScore(pred),
    sportteryHomeSp: normal.win,
    sportteryDrawSp: normal.draw,
    sportteryAwaySp: normal.lose,
    sportteryHomeProb: marketMap.get("H"),
    sportteryDrawProb: marketMap.get("D"),
    sportteryAwayProb: marketMap.get("A"),
    valueHomeGap: marketMap.has("H") ? modelHomeProb - marketMap.get("H") : undefined,
    valueDrawGap: marketMap.has("D") ? modelDrawProb - marketMap.get("D") : undefined,
    valueAwayGap: marketMap.has("A") ? modelAwayProb - marketMap.get("A") : undefined,
    asianHandicap: Number(String(reviewHandicapLine(pred) || "0").replace("+", "")),
    euroHomeOdds: normal.win,
    euroDrawOdds: normal.draw,
    euroAwayOdds: normal.lose,
    euroHomeProb: marketMap.get("H"),
    euroDrawProb: marketMap.get("D"),
    euroAwayProb: marketMap.get("A"),
    dataQuality: qualityLevel(pred.dataQuality),
    reasoningSummary: pred.finalDecisionAction || pred.keyJudgement || pred.marketGap || pred.script || "",
    downgradeReasons: [pred.decisionConflict, pred.keyFailureRisk, pred.eventRisk].filter(Boolean),
    resultStatus: result ? "PENDING" : "PENDING",
  });
  lock.modelVersion = predictionModelVersion(pred) || lock.modelVersion;
  return lock;
}

function reviewedLockCase(pred, match) {
  const lock = lockFromPrediction(pred, match);
  const result = matchResultFromScore(match);
  if (!lock || !result || !window.WC_REVIEW_ENGINE) return { lock, result, review: null, caseItem: null };
  const review = window.WC_REVIEW_ENGINE.evaluateLockedPrediction(lock, result);
  lock.resultStatus = review.hitStatus;
  const caseItem = window.WC_REVIEW_ENGINE.generateCaseFromLock(lock, result, review);
  return { lock, result, review, caseItem };
}

let runtimeCaseBaseCache = null;

function collectReviewedCaseItems() {
  const cases = [];
  const seen = new Set();
  const addCase = (caseItem) => {
    if (!caseItem?.sourceLockId || seen.has(caseItem.sourceLockId)) return;
    seen.add(caseItem.sourceLockId);
    cases.push(caseItem);
  };
  groupedPredictions().forEach(({ match, predictions }) => {
    predictions.forEach((pred) => {
      const { caseItem } = reviewedLockCase(pred, match);
      addCase(caseItem);
    });
  });
  (data.sportteryPredictions || []).forEach((pred) => {
    const item = findSportteryItemForPrediction(pred);
    const detail = item ? sportteryDetailRow(item) : null;
    const match = {
      no: pred.no,
      matchId: pred.matchId || detail?.matchId || pred.no,
      date: pred.date || pred.matchDate,
      matchDate: pred.matchDate || pred.date,
      competition: pred.competition || pred.competitionModel || "体彩",
      group: pred.competition || "体彩",
      home: pred.home,
      away: pred.away,
      score: normalizeResultScore(detail?.score || pred.score),
    };
    const { caseItem } = reviewedLockCase(pred, match);
    addCase(caseItem);
  });
  return cases;
}

function refreshRuntimeCaseBase() {
  const generated = collectReviewedCaseItems();
  if (window.WC_CASE_BASE?.appendCases) {
    window.WC_CASE_BASE.appendCases(generated);
  }
  runtimeCaseBaseCache = window.WC_CASE_BASE?.getAllCases ? window.WC_CASE_BASE.getAllCases().slice() : generated;
  return runtimeCaseBaseCache;
}

function runtimeCaseBase() {
  if (runtimeCaseBaseCache) return runtimeCaseBaseCache;
  return refreshRuntimeCaseBase();
}

let leagueProfilesLoading = null;

async function loadFirecrawlEnrichmentData({ rerender = false } = {}) {
  let changed = false;
  try {
    await loadFreshScript("./data/firecrawlObjectiveContext.js");
    if (window.WC_FIRECRAWL_OBJECTIVE_CONTEXT?.matches?.length) changed = true;
  } catch {}
  if (changed && rerender) renderCurrentRouteSurfaces();
  return changed;
}

function ensureLeagueProfilesLoaded(callback) {
  if (Array.isArray(window.WC_LEAGUE_PROFILES?.profiles)) {
    if (typeof callback === "function") callback();
    return Promise.resolve(true);
  }
  if (!leagueProfilesLoading) {
    leagueProfilesLoading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "./data/leagueProfiles.js?v=202607141210";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return leagueProfilesLoading.then((loaded) => {
    if (loaded && typeof callback === "function") callback();
    return loaded;
  });
}

function leagueProfileCandidates(match = {}, pred = {}) {
  return [
    match.league,
    match.displayGroup,
    match.group,
    match.competition,
    pred.competitionModel,
    pred.competition,
    pred.competitionType,
    pred.eventWeighting,
  ].filter(Boolean);
}

function normalizeLeagueProfileLabel(value) {
  if (window.WC_SIMILAR_CASE_ENGINE?.normalizeCompetition) {
    return window.WC_SIMILAR_CASE_ENGINE.normalizeCompetition(value);
  }
  return String(value || "").trim();
}

function leagueProfileForMatch(match = {}, pred = {}) {
  const profiles = Array.isArray(window.WC_LEAGUE_PROFILES?.profiles) ? window.WC_LEAGUE_PROFILES.profiles : [];
  if (!profiles.length) return null;
  const byLeague = new Map(profiles.map((profile) => [normalizeLeagueProfileLabel(profile.league), profile]));
  for (const candidate of leagueProfileCandidates(match, pred)) {
    const normalized = normalizeLeagueProfileLabel(candidate);
    if (byLeague.has(normalized)) return byLeague.get(normalized);
  }
  return null;
}

function renderLeagueProfilePanel(match, pred) {
  const ready = Array.isArray(window.WC_LEAGUE_PROFILES?.profiles);
  if (!ready) {
    ensureLeagueProfilesLoaded(() => {
      const hash = window.location.hash || "";
      const currentWorldCup = hash.match(/^#match-(.+)$/);
      const currentSporttery = hash.match(/^#sporttery-match-(.+)$/);
      if (currentWorldCup) renderMatchDetail(currentWorldCup[1]);
      if (currentSporttery) renderSportteryMatchDetail(decodeURIComponent(currentSporttery[1]));
    });
    return `
      <section class="match-page-section similar-case-panel league-profile-panel">
        <span>联赛画像</span>
        <p class="similar-case-summary-text">正在读取联赛画像，模型会先匹配赛事环境再进入 V4 推演。</p>
      </section>
    `;
  }
  const profile = leagueProfileForMatch(match, pred);
  if (!profile) return "";
  const pct = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
  const distText = (rows = [], empty = "等待样本") =>
    rows.length ? rows.map((item) => `${item.label} ${item.count}场/${pct(item.rate)}`).join(" · ") : empty;
  const sourceText = (profile.sourceCounts || []).map((item) => `${item.label} ${item.count}`).join(" / ") || "external-history";
  const seasonText = (profile.seasons || []).slice(0, 4).join(" / ") || "近两年";
  return `
    <section class="match-page-section similar-case-panel league-profile-panel">
      <span>联赛画像</span>
      <div class="similar-case-summary">
        <article><small>匹配联赛</small><strong>${profile.league}</strong></article>
        <article><small>赛果画像</small><strong>${profile.resultSampleQuality || profile.sampleQuality}</strong></article>
        <article><small>可用样本</small><strong>${profile.usableSampleCount} / ${profile.sampleCount}</strong></article>
        <article><small>盘口画像</small><strong>${profile.marketSampleQuality || "DISPLAY"} · ${profile.withOddsCount || 0}场</strong></article>
        <article><small>主 / 平 / 客</small><strong>${pct(profile.homeWinRate)} / ${pct(profile.drawRate)} / ${pct(profile.awayWinRate)}</strong></article>
        <article><small>均球 / BTTS</small><strong>${Number(profile.avgGoals || 0).toFixed(2)} / ${pct(profile.bttsRate)}</strong></article>
      </div>
      <p class="similar-case-summary-text">${displayModelText(profile.modelHint || profile.sampleQualityLabel || "联赛画像已匹配。")}</p>
      <div class="similar-case-distribution">
        <article><small>常见比分</small><strong>${distText(profile.commonScores)}</strong></article>
        <article><small>总进球分布</small><strong>${distText(profile.totalGoalDistribution)}</strong></article>
        <article><small>画像标签</small><strong>${(profile.styleTags || []).join(" / ") || "等待标签"}</strong></article>
      </div>
      <div class="similar-case-practical">
        <article><small>样本年份</small><strong>${seasonText}</strong></article>
        <article><small>样本来源</small><strong>${sourceText}</strong></article>
        <article><small>模型用法</small><strong>${profile.marketSampleQualityLabel || profile.sampleQualityLabel || "只展示，不修正"}</strong></article>
      </div>
    </section>
  `;
}

function caseBaseStatus(pred, match) {
  const { lock, result, review, caseItem } = reviewedLockCase(pred, match);
  return {
    lock,
    review,
    caseItem,
    generated: Boolean(caseItem),
    caseId: caseItem?.caseId || "-",
    reviewText: review?.reviewText || (result ? "等待验票" : "赛果未回填"),
    hitStatus: review?.hitStatus || "PENDING",
  };
}

function d1CasePanelId(pred, match) {
  return `d1-case-${String(match?.matchId || match?.no || pred?.no || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function renderD1Rate(hitRateValue, count) {
  const countText = Number(count || 0);
  if (!countText) return "等待样本";
  return `${(Number(hitRateValue || 0) * 100).toFixed(1)}% · ${countText}场`;
}

function renderD1CaseBaseContent(result) {
  const stats = result?.stats || {};
  const failureReasons = stats.failureReasons || [];
  const advice = result?.downgradeAdvice || {};
  const warningFlags = result?.warningFlags || [];
  return `
    <div class="similar-case-summary d1-case-summary">
      <article><small>相似历史样本数</small><strong>${Number(result?.sampleCount || stats.sampleCount || 0)}场</strong></article>
      <article><small>同联赛同盘口命中率</small><strong>${renderD1Rate(stats.sameLeagueHandicapHitRate, stats.sameLeagueHandicapCount)}</strong></article>
      <article><small>同模型版本命中率</small><strong>${renderD1Rate(stats.sameModelVersionHitRate, stats.sameModelVersionCount)}</strong></article>
      <article><small>是否建议降级</small><strong>${advice.level || (advice.downgrade ? "降级" : "维持")}</strong></article>
    </div>
    <div class="similar-case-practical">
      <article><small>常见失败原因</small><strong>${
        failureReasons.length
          ? failureReasons.map((item) => `${item.label} ${item.count}次`).join(" / ")
          : "暂无失败样本"
      }</strong></article>
      <article><small>样本使用规则</small><strong>${stats.samplePolicyLabel || "只展示不修正"}：${stats.samplePolicyNote || "等待 D1 样本补齐"}</strong></article>
      <article><small>降级说明</small><strong>${advice.reason || "暂无触发降级条件"}</strong></article>
      <article><small>风险提示</small><strong>${warningFlags.length ? warningFlags.join(" / ") : "暂无 D1 风险提示"}</strong></article>
    </div>
    <p class="similar-case-summary-text">${result?.summaryText || "D1 Case Base 已接入，等待样本扩充。"}</p>
  `;
}

function renderD1CaseBasePanel(pred, match) {
  if (!pred || !match) return "";
  return `
    <section class="match-page-section similar-case-panel d1-case-panel" id="${d1CasePanelId(pred, match)}" data-d1-case-panel>
      <span>D1 Case Base 诊断</span>
      <div class="similar-case-summary">
        <article><small>相似历史样本数</small><strong>读取中</strong></article>
        <article><small>同联赛同盘口命中率</small><strong>读取中</strong></article>
        <article><small>同模型版本命中率</small><strong>读取中</strong></article>
        <article><small>是否建议降级</small><strong>读取中</strong></article>
      </div>
      <p class="similar-case-summary-text">正在从 D1 Case Base 读取相似案例。</p>
    </section>
  `;
}

async function refreshD1CaseBasePanel(pred, match) {
  const panel = document.querySelector(`#${d1CasePanelId(pred, match)}`);
  if (!panel || !pred || !match) return;
  const lock = lockFromPrediction(pred, match);
  if (!lock || !window.WC_CLOUD_STORE?.similarCases) {
    panel.innerHTML = `<span>D1 Case Base 诊断</span><p class="similar-case-summary-text">D1 接口暂不可用，本页只显示本地相似样本。</p>`;
    return;
  }
  const result = await window.WC_CLOUD_STORE.similarCases({
    ...lock,
    threshold: 55,
    sampleLimit: 80,
    topLimit: 6,
    modelVersion: predictionModelVersion(pred),
  });
  if (!result?.ok) {
    panel.innerHTML = `<span>D1 Case Base 诊断</span><p class="similar-case-summary-text">D1 暂未返回可用 Case Base：${result?.data?.error || result?.error || "等待云端同步"}</p>`;
    return;
  }
  panel.innerHTML = `<span>D1 Case Base 诊断</span>${renderD1CaseBaseContent(result)}`;
}

async function writePredictionLockToD1(pred, match, button) {
  if (!pred || !match || !window.WC_CLOUD_STORE?.createLock) return;
  const lock = lockFromPrediction(pred, match);
  if (!lock) return;
  const originalText = button?.textContent || "同步D1锁版";
  if (button) {
    button.disabled = true;
    button.textContent = "写入中...";
  }
  try {
    const created = await window.WC_CLOUD_STORE.createLock(lock);
    const duplicate = created?.status === 409 || /already exists/i.test(created?.data?.error || "");
    if (!created?.ok && !duplicate) {
      if (button) button.textContent = "写入失败";
      return;
    }
    const result = matchResultFromScore(match);
    if (!result) {
      if (button) button.textContent = duplicate ? "D1已存在，等待赛果" : "已写入，等待赛果";
      await refreshD1CaseBasePanel(pred, match);
      return;
    }
    if (window.WC_CLOUD_STORE.upsertResult) {
      await window.WC_CLOUD_STORE.upsertResult(result);
    }
    if (window.WC_CLOUD_STORE.runReview) {
      await window.WC_CLOUD_STORE.runReview(lock.lockId);
    }
    const caseResult = window.WC_CLOUD_STORE.generateCase
      ? await window.WC_CLOUD_STORE.generateCase(lock.lockId)
      : null;
    if (button) button.textContent = caseResult?.ok || caseResult?.duplicated ? "已生成Case" : "已写入D1";
    await refreshD1CaseBasePanel(pred, match);
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 2200);
    }
  }
}

function writeWorldCupLockToD1(no, button) {
  const match = matches.find((item) => item.no === no);
  const pred = latestPredictionFor(no);
  return writePredictionLockToD1(pred, match, button);
}

function writeSportteryLockToD1(key, button) {
  const base = findSportteryItemByKey(key);
  if (!base) return null;
  const item = sportteryDetailRow(base);
  const pred = sportteryPredictionForItem(item) || (item.linkedNo ? latestPredictionFor(item.linkedNo) : null);
  return writePredictionLockToD1(pred, item, button);
}

const historicalSimilarResultCache = new Map();
const historicalSimilarPending = new Map();

function historicalSimilarKey(lock = {}) {
  return [lock.matchId, lock.league, lock.sportteryHomeSp, lock.sportteryDrawSp, lock.sportteryAwaySp, lock.asianHandicap].join("|");
}

function requestHistoricalSimilarSamples(lock, match) {
  if (!window.WC_CLOUD_STORE?.historicalSimilarSamples) return;
  const key = historicalSimilarKey(lock);
  if (historicalSimilarResultCache.has(key) || historicalSimilarPending.has(key)) return;
  const pending = window.WC_CLOUD_STORE.historicalSimilarSamples({ ...lock, sampleLimit: 50, topLimit: 5 })
    .then((result) => {
      historicalSimilarResultCache.set(key, result?.ok ? result : { ok: false, sampleCount: 0, topCases: [], stats: {} });
      const hash = window.location.hash || "";
      const worldCup = hash.match(/^#match-(.+)$/);
      const sporttery = hash.match(/^#sporttery-match-(.+)$/);
      if (worldCup) renderMatchDetail(worldCup[1]);
      if (sporttery) renderSportteryMatchDetail(decodeURIComponent(sporttery[1]));
      return result;
    })
    .catch(() => historicalSimilarResultCache.set(key, { ok: false, sampleCount: 0, topCases: [], stats: {} }))
    .finally(() => historicalSimilarPending.delete(key));
  historicalSimilarPending.set(key, pending);
}

function renderSimilarCasePanel(pred, match) {
  if (!pred || !match || !window.WC_SIMILAR_CASE_ENGINE) return "";
  const lock = lockFromPrediction(pred, match);
  if (!lock) return "";
  const cacheKey = historicalSimilarKey(lock);
  const result = historicalSimilarResultCache.get(cacheKey);
  if (!result) {
    requestHistoricalSimilarSamples(lock, match);
    return `
      <section class="match-page-section similar-case-panel">
        <span>相似盘口历史样本</span>
        <p class="similar-case-summary-text">正在从D1按联赛和盘口区间查询，页面不再下载完整历史库。</p>
      </section>`;
  }
  const stats = result.stats || {};
  const pct = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
  const distText = (rows = [], empty = "等待样本") =>
    rows.length
      ? rows.map((item) => `${item.label} ${item.count}场/${pct(item.rate)}`).join(" · ")
      : empty;
  const handicapText = distText(stats.handicapDistribution || [], "等待比分拆分");
  const scoreText = distText(stats.commonScores || [], "等待比分拆分");
  const totalText = distText(stats.totalGoalDistribution || [], "等待样本");
  const topRateLabel = (rows = []) => rows.length ? rows[0].label : "";
  const topTwoRateLabels = (rows = []) => rows.slice(0, 2).map((item) => item.label).filter(Boolean).join(" / ");
  const practicalFields = () => {
    const sampleCount = Number(result.sampleCount || stats.sampleCount || 0);
    const lockedCount = Number(stats.lockedSampleCount || 0);
    const homeRate = Number(stats.homeWinRate || 0);
    const drawRate = Number(stats.drawRate || 0);
    const awayRate = Number(stats.awayWinRate || 0);
    const avgGoals = Number(stats.avgGoals || 0);
    const totalHint = topTwoRateLabels(stats.totalGoalDistribution || []);
    const scoreHint = topTwoRateLabels(stats.commonScores || []);
    const handicapHint = topRateLabel(stats.handicapDistribution || []);
    const directionText = homeRate >= 0.72
      ? "强支持主胜底盘"
      : homeRate + drawRate >= 0.72
        ? "支持主队不败底盘"
        : awayRate >= 0.5
          ? "客胜历史占优，需复核盘口方向"
          : drawRate >= 0.3
            ? "平局权重偏高"
            : "仅作盘口参照";
    const goalText = avgGoals >= 2.8
      ? "进球区间偏开放"
      : avgGoals <= 2.2
        ? "进球区间偏收紧"
        : "进球区间常规";
    const valueLevel = sampleCount >= 30 && lockedCount >= 10
      ? "强"
      : sampleCount >= 15
        ? "中"
        : sampleCount >= 8
          ? "弱"
          : "观察";
    const warnings = [];
    if (sampleCount < 10) warnings.push("匹配样本不足，只作观察");
    if (lockedCount < 30) warnings.push("锁版样本不足，不改模型置信");
    if (handicapHint && lockedCount < 10) warnings.push("让球结论降权");
    if (drawRate >= 0.3) warnings.push("需防平局分支");
    return [
      ["样本画像", `平均进球 ${avgGoals.toFixed(2)} · 仅用于校验正式锁版`],
      ["可用等级", `${valueLevel} · ${sampleCount}场匹配 / ${lockedCount}场锁版`],
      ["反向提醒", warnings.join("；") || "暂无强反向提醒，仍需结合当前阵容和战意"],
      ["样本分布", `总进球 ${totalHint || "暂无"} · 常见比分 ${scoreHint || "暂无"} · 让球赛果 ${handicapHint || "暂无"}`],
    ];
  };
  const oddsText = (item) =>
    [item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp]
      .map((value) => Number(value) ? Number(value).toFixed(2) : "-")
      .join(" / ");
  const marketLowText = (item) => {
    const rows = [
      ["主胜", item.sportteryHomeSp],
      ["平", item.sportteryDrawSp],
      ["客胜", item.sportteryAwaySp],
    ].filter(([, value]) => Number(value));
    if (!rows.length) return item.recommendation || "-";
    const [label, value] = rows.sort((a, b) => Number(a[1]) - Number(b[1]))[0];
    return `${label} ${Number(value).toFixed(2)}`;
  };
  const resultText = (item) => {
    const score = item.score || ([item.actualHomeGoals, item.actualAwayGoals].every((value) => Number.isFinite(Number(value))) ? `${item.actualHomeGoals}-${item.actualAwayGoals}` : "");
    const direction = item.actualResult === "HOME" ? "主胜" : item.actualResult === "AWAY" ? "客胜" : item.actualResult === "DRAW" ? "平" : "-";
    return score ? `${score} · ${direction} · ${item.actualGoals ?? "-"}球` : `${direction} · ${item.actualGoals ?? "-"}球`;
  };
  const handicapLineText = (item) => Number.isFinite(Number(item.asianHandicap)) ? `主队 ${Number(item.asianHandicap) > 0 ? "+" : ""}${item.asianHandicap}` : "-";
  const totalLineText = (item) => Number(item.over25Odds) || Number(item.under25Odds)
    ? `大2.5 ${Number(item.over25Odds) ? Number(item.over25Odds).toFixed(2) : "-"} / 小2.5 ${Number(item.under25Odds) ? Number(item.under25Odds).toFixed(2) : "-"}`
    : "-";
  const hasAnyOddsSample = result.topCases.some((item) =>
    [item.sportteryHomeSp, item.sportteryDrawSp, item.sportteryAwaySp, item.euroHomeOdds, item.euroDrawOdds, item.euroAwayOdds].some((value) => Number(value))
  );
  const strictSampleCount = Number(stats.strictSampleCount ?? result.topCases.filter((item) => !item.distributionOnly).length);
  const distributionSampleCount = Number(stats.distributionSampleCount ?? result.topCases.filter((item) => item.distributionOnly).length);
  const hasDistributionFallback = distributionSampleCount > 0;
  const casePanelTitle = hasDistributionFallback ? "相似盘口 + 联赛分布样本" : hasAnyOddsSample ? "相似盘口历史样本" : "联赛历史分布样本";
  const caseUsageText = hasDistributionFallback ? `严格 ${strictSampleCount}场 + 分布补充 ${distributionSampleCount}场` : hasAnyOddsSample ? "盘口形态 + 赛果分布" : "赛果、比分和总进球分布";
  const caseSummaryText = hasDistributionFallback
    ? "表中先列严格相似盘口，不足部分标记为‘同赛事分布’。分布样本只校验赛果、比分和总进球，不参与置信度修正。"
    : hasAnyOddsSample
      ? "这里只记录历史相似盘口当时怎么开、低位落在哪里、最后打成什么比分；不按命中或失败评价当前模型。"
      : "这些外部样本目前以赛果为主，用来校验联赛胜平负、比分和总进球分布，不直接推断盘口低位。";
  const referenceHeader = hasAnyOddsSample ? "相似度" : "参考类型";
  const referenceText = (item) => {
    if (item.distributionOnly || !hasAnyOddsSample) return "同赛事分布";
    return item.similarityScore;
  };
  const rows = result.topCases
    .map(
      (item) => `
        <tr>
          <td>${referenceText(item)}</td>
          <td>${item.homeTeam} vs ${item.awayTeam}</td>
          <td>${item.league}</td>
          <td>${oddsText(item)}</td>
          <td>${handicapLineText(item)}</td>
          <td>${marketLowText(item)}</td>
          <td>${totalLineText(item)}</td>
          <td>${resultText(item)}</td>
        </tr>
      `
    )
    .join("") || `<tr><td colspan="8" class="empty-cell">${casePanelTitle}不足，先作为观察项。</td></tr>`;
  return `
    <section class="match-page-section similar-case-panel">
      <span>${casePanelTitle}</span>
      <div class="similar-case-summary">
        <article><small>样本范围</small><strong>${stats.competition || "同赛事"}</strong></article>
        <article><small>使用方式</small><strong>${caseUsageText}</strong></article>
        <article><small>匹配样本</small><strong>${result.sampleCount}</strong></article>
        <article><small>锁版 / 外部</small><strong>${stats.lockedSampleCount || 0} / ${stats.externalSampleCount || 0}</strong></article>
        <article><small>主 / 平 / 客</small><strong>${pct(stats.homeWinRate)} / ${pct(stats.drawRate)} / ${pct(stats.awayWinRate)}</strong></article>
        <article><small>平均进球</small><strong>${Number(stats.avgGoals || 0).toFixed(2)}</strong></article>
      </div>
      <p class="similar-case-summary-text">${caseSummaryText}</p>
      <div class="similar-case-distribution">
        <article><small>总进球分布</small><strong>${totalText}</strong></article>
        <article><small>常见比分</small><strong>${scoreText}</strong></article>
        <article><small>让球赛果分布</small><strong>${handicapText}</strong></article>
      </div>
      <div class="similar-case-practical">
        ${practicalFields().map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join("")}
      </div>
      <div class="review-record-wrap compact similar-case-wrap">
        <table class="review-record-table similar-case-table">
          <thead>
            <tr>
              <th>${referenceHeader}</th>
              <th>比赛</th>
              <th>联赛</th>
              <th>当时胜/平/负SP</th>
              <th>当时让球</th>
              <th>市场低位</th>
              <th>大小球</th>
              <th>最终结果</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSportteryEvidenceGate(item, modelPred, research) {
  const leagueProfile = leagueProfileForMatch(item, modelPred);
  const checks = [
    ["锁版结果", Boolean(modelPred?.pick && modelPred?.totalGoalsPick && (modelPred?.mainScore || modelPred?.counterScore))],
    ["体彩当前盘", Boolean(item?.normal || item?.handicapOdds)],
    ["让球盘口", Boolean(item?.handicap || modelPred?.handicapPick || modelPred?.handicap)],
    ["比分赔率", Boolean(item?.scoreOdds?.length || modelPred?.mainScore)],
    ["总进球赔率", Boolean(item?.totalGoalsOdds?.length || modelPred?.totalGoalsPick)],
    ["比赛发展推演", Boolean(modelPred?.script)],
    ["半场触发", Boolean(modelPred?.halftimeDecision || modelPred?.halftimeTrigger)],
    ["状态转移", Boolean(modelPred?.stateTransfer || modelPred?.knockoutStateTransfer || modelPred?.timeStateTransfer)],
    ["最终闸门", Boolean(modelPred?.finalDecisionAction || modelPred?.decisionConflict)],
    ["赛果画像", Boolean(leagueProfile?.usableSampleCount >= 30)],
    ["盘口样本", Boolean(leagueProfile?.withOddsCount >= 30)],
  ];
  const ready = checks.filter(([, ok]) => ok).length;
  const score = Math.round((ready / checks.length) * 100);
  const level = score >= 86 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : "D";
  const tone = level === "A" ? "hot" : level === "B" ? "warm" : level === "C" ? "watch" : "cold";
  const action =
    level === "A"
      ? "证据完整，可正常复核"
      : level === "B"
        ? "证据较完整，按联赛模型复核"
        : level === "C"
          ? "证据部分缺失，降低数据可信度"
          : "证据不足，只保留盘口预筛";
  const notes = [
    `模型版本 ${modelPred ? predictionVersionLabel(modelPred) : "未锁版"}`,
    `盘口状态 ${item?.normal || item?.handicapOdds ? "已接入" : "等待数据"}`,
    `建议动作 ${research?.action || "-"}`,
    checks.filter(([, ok]) => !ok).slice(0, 3).map(([label]) => `${label}缺失`).join(" / ") || "核心字段完整",
  ];
  return `
    <section class="match-page-section decision-gate-panel ${tone}">
      <span>证据质量</span>
      <div class="decision-gate-head">
        <strong>${level}</strong>
        <em>${score}</em>
        <b>${action}</b>
      </div>
      <div class="decision-gate-bar"><i style="width:${score}%"></i></div>
      <div class="decision-gate-notes">
        ${notes.map((note) => `<span>${note}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderSportteryV4FullMode(item, modelPred, research, totalGoals, scoreOdds, sourceStamp) {
  if (!modelPred) {
    return `
      <section class="match-page-section sporttery-model-panel">
        <span>模型状态</span>
        <h3>待推演 / 待锁版</h3>
        <p>这场比赛已经可以进入详情页，但还没有写入真实模型锁版记录。当前完整推演只展示证据质量和数据支持；联赛画像统一保留在快速判断中。正式推演完成后，这里会替换为模型真实推演链和锁版结论。</p>
      </section>
      ${renderSportteryEvidenceGate(item, modelPred, research)}
      ${renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp)}
      ${renderJudgementRiskPanel(modelPred, research.riskNotes)}
    `;
  }
  const filter = sportteryV4Filter(modelPred, research);
  return `
    ${renderProjectionDecisionDeck(item, modelPred, filter, {
      gate: false,
      issue: item.issue || item.no || "-",
      competition: item.league || modelPred.competitionModel || modelPred.competitionType || "体彩赛事",
      totalPick: research.totalPick,
      scorePick: research.scorePick,
      handicapPick: research.handicapPick,
      directionPick: research.directionPick,
    })}
    ${renderSportteryEvidenceGate(item, modelPred, research)}
    ${renderUniversalModelPanel(modelPred)}
    ${renderD1CaseBasePanel(modelPred, item)}
    ${renderSimilarCasePanel(modelPred, item)}
    ${renderFinalDecisionGatePanel(modelPred)}
    ${renderJudgementRiskPanel(modelPred, research.riskNotes)}
  `;
}

function renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp) {
  return `
    <details class="match-page-section sporttery-data-panel" open>
      <summary>数据支撑</summary>
      <div class="match-page-columns">
        ${oddsPairList("胜平负", item.normal)}
        ${oddsPairList(`让球胜平负（${item.handicap || "0"}）`, item.handicapOdds)}
      </div>
      <div class="sporttery-data-stack">
        <section>
          <span>总进球赔率</span>
          <div class="sporttery-detail-odds compact">
            ${totalGoals.length ? totalGoals.map((odd) => `<article><small>${odd.goals}球</small><strong>${odd.odds}</strong></article>`).join("") : "<p>暂无总进球数据。</p>"}
          </div>
        </section>
        <section>
          <span>比分低赔候选</span>
          <div class="sporttery-detail-odds compact">
            ${scoreOdds.length ? scoreOdds.slice(0, 8).map((odd) => `<article><small>${odd.score}</small><strong>${odd.odds}</strong></article>`).join("") : "<p>暂无比分赔率。</p>"}
          </div>
        </section>
      </div>
    </details>
    <section class="match-page-section">
      <span>数据说明</span>
      <p>盘口来自体彩官方接口；实时比分来自 APIfootball；赛后仍以体彩官方赛果回填作为复盘口径。最近体彩快照：${sourceStamp || "等待刷新"}。</p>
    </section>
  `;
}

function renderFootballDataLayerPanel(item, modelPred) {
  const context = modelPred?.objectiveDataLayer || footballDataContextForSportteryItem(item);
  if (!context || (!context.stage && !context.stateSummary && !context.regularScore && !context.halfScore)) return "";
  const homeState = context.homeState || {};
  const awayState = context.awayState || {};
  const sourceStamp = formatCapturedAt(context.importedAt || footballDataContext.importedAt);
  return `
    <section class="match-page-section sporttery-data-panel">
      <span>客观数据层</span>
      <div class="match-page-columns">
        <article>
          <small>赛事阶段</small>
          <strong>${context.stage || "-"}${context.group ? ` · ${context.group}` : ""}</strong>
          <p>90分钟 ${context.regularScore || "-"} · 半场 ${context.halfScore || "-"}${context.scoreDuration ? ` · ${context.scoreDuration}` : ""}</p>
        </article>
        <article>
          <small>${item.displayHome || item.home}</small>
          <strong>${Number.isFinite(Number(homeState.rank)) ? `第${homeState.rank}` : "-"} · ${homeState.points ?? "-"}分</strong>
          <p>进${homeState.goalsFor ?? "-"} 失${homeState.goalsAgainst ?? "-"} 净胜${homeState.goalDifference ?? "-"} ${homeState.form ? `· ${homeState.form}` : ""}</p>
        </article>
        <article>
          <small>${item.displayAway || item.away}</small>
          <strong>${Number.isFinite(Number(awayState.rank)) ? `第${awayState.rank}` : "-"} · ${awayState.points ?? "-"}分</strong>
          <p>进${awayState.goalsFor ?? "-"} 失${awayState.goalsAgainst ?? "-"} 净胜${awayState.goalDifference ?? "-"} ${awayState.form ? `· ${awayState.form}` : ""}</p>
        </article>
      </div>
      <p>${displayModelText(context.stateSummary || "football-data 已接入，等待匹配到赛程和球队状态。")}</p>
      <small>来源 football-data.org · ${sourceStamp || "等待同步"} · 赛果口径使用90分钟 regularTime</small>
    </section>
  `;
}

function renderSportteryMatchDetail(key) {
  const content = document.querySelector("#match-detail-body");
  const resetScroll = sportteryDetailNavigationPending;
  sportteryDetailNavigationPending = false;
  const preserveScroll = !resetScroll && window.location.hash.startsWith("#sporttery-match-") && window.scrollY > 0;
  const previousScrollY = preserveScroll ? window.scrollY : 0;
  if (!sportteryPoolItemCache.size) cacheSportteryPoolItems(sportteryPoolItems());
  const base = findSportteryItemByKey(key);
  if (!content) return;
  if (!base) {
    const lookupKey = sportteryLookupKeyFromHash(key);
    content.innerHTML = `
      <div class="match-page-toolbar">
        <button type="button" data-detail-back>← 赛事池</button>
        <span>体彩详情</span>
      </div>
      <section class="match-page-section sporttery-model-panel">
        <span>模型状态</span>
        <h3>待推演 / 待锁版</h3>
        <p>这场比赛已进入详情页，但当前快照没有找到完整原始行。后续数据刷新或模型锁版写入后，会在这里展示盘口、联赛画像和真实推演记录。</p>
        <p>当前识别键：${lookupKey || "-"}</p>
      </section>
      <div class="match-page-actions">
        <button type="button" class="secondary" data-detail-back>返回赛事池</button>
      </div>
    `;
    activateTab("match-detail");
    document.body.classList.add("sporttery-detail-mode");
    return;
  }
  const item = sportteryDetailRow(base);
  let modelPred = sportteryPredictionForItem(item) || (item.linkedNo ? latestPredictionFor(item.linkedNo) : null);
  const hasCloudMatchId = Boolean(cloudMatchIdForSportteryItem(item));
  const needsPreferredLock = hasCloudMatchId && !hasCompleteSportteryLockFields(modelPred);
  if (needsPreferredLock) {
    ensureSportteryLockForItem(item, sportteryLookupKeyFromHash(key));
    modelPred = sportteryPredictionForItem(item) || (item.linkedNo ? latestPredictionFor(item.linkedNo) : null);
    if (!hasCompleteSportteryLockFields(modelPred)) modelPred = null;
  }
  const lockSyncing = !modelPred && hasCloudMatchId;
  const research = sportteryResearchSnapshot(item, modelPred);
  const backLabel =
    matchDetailReturnTarget === "review"
      ? "← 模型复盘统计"
      : matchDetailReturnTarget === "locks"
        ? "← 赛事推演锁版"
      : matchDetailReturnTarget === "model-stats"
        ? "← 统计和回测"
      : matchDetailReturnTarget === "odds-map"
        ? "← 返回盘口图谱"
        : "← 赛事池";
  const scoreText = item.score || (item.status === "进行中" ? "LIVE" : "vs");
  const totalGoals = item.totalGoalsOdds || [];
  const scoreOdds = item.scoreOdds || [];
  const sourceStamp = formatCapturedAt(oddsData.importedAt || resultsData.importedAt);
  const modelName = modelPred ? modelDisplayName(modelPred, item, modelPred.competitionModel || modelPred.competitionType || item.league) : "";
  content.innerHTML = `
    <div class="match-page-toolbar">
      <button type="button" data-detail-back>${backLabel}</button>
      <span>${item.issue || item.no || "体彩"} · ${formatDate(item.displayDate)} · ${item.displayGroup}</span>
    </div>
    <section class="match-page-hero sporttery-detail-hero">
      <div>
        <p class="eyebrow">${modelName || "Sporttery Research"}</p>
        <h2>${item.displayHome} vs ${item.displayAway}</h2>
        <p>${modelPred?.keyJudgement || `${item.league || "体彩赛事"} · ${item.kickoffTime || "--:--"} 开赛 · 让球 ${item.handicap || "0"} · ${research.action}`}</p>
      </div>
      <div class="match-page-summary">
        <span>${research.statusLabel}</span>
        <div class="summary-grid">
          <div><small>体彩期号</small><b>${item.issue || item.no || "-"}</b></div>
          <div><small>当前比分</small><b>${scoreText}</b></div>
          <div><small>单选</small><b>${modelPred?.pick || research.directionPick}</b></div>
          <div><small>预测</small><b>${research.scorePick}</b></div>
        </div>
      </div>
    </section>
    <div class="match-mode-switch" role="tablist" aria-label="体彩单场详情模式">
      <button type="button" class="active" data-match-mode="quick">快速判断</button>
      <button type="button" data-match-mode="full">完整推演</button>
    </div>
    <div class="match-mode-panel active" data-match-mode-panel="quick">
      <section class="quick-decision-board sporttery-quick-board">
        <article class="quick-main-card">
          <span>${modelPred ? "锁版结论" : "模型状态"}</span>
          <strong>${modelPred ? research.directionPick : lockSyncing ? "同步锁版中" : "待锁版"}</strong>
          <p>${modelPred ? `让球 ${research.handicapPick} · 总进球 ${research.totalPick} · 比分 ${research.scorePick}` : lockSyncing ? "正在读取 Cloudflare D1 锁版记录" : `盘口预筛 ${research.directionPick} · 让球 ${research.handicapPick}`}</p>
        </article>
        <article>
          <span>比赛状态</span>
          <strong>${item.status || "待赛"}</strong>
          <p>${item.liveScore ? `实时比分 ${item.liveScore}，${item.liveStatus || "进行中"}` : `当前比分 ${scoreText}`}</p>
        </article>
        <article>
          <span>建议动作</span>
          <strong>${modelPred ? research.action : lockSyncing ? "同步锁版" : research.action}</strong>
          <p>${modelPred?.advice || (lockSyncing ? "已请求线上锁版包，返回后自动刷新详情" : "等待模型真实推演后写入锁版记录")}</p>
        </article>
        <article>
          <span>模型版本</span>
          <strong>${modelPred ? predictionVersionLabel(modelPred) : lockSyncing ? "同步中" : "未锁版"}</strong>
          <p>${modelName || (lockSyncing ? "正在读取线上 preferred lock" : `${item.league || "该赛事"}待锁版，不计入正式模型版本`)}</p>
        </article>
      </section>
      <section class="match-page-section sporttery-research-panel">
        <span>${modelPred ? `${modelName}快速判断` : research.score ? "复盘验票" : lockSyncing ? "同步锁版" : "待推演"}</span>
        <p>${
          research.score
            ? `实际比分 ${research.score}，赛果 ${research.actualDirection || "-"}，让球结果 ${research.actualHandicap || "-"}，总进球 ${research.actualTotal ?? "-"}。`
            : modelPred
              ? displayModelText(modelPred.finalDecisionAction || modelPred.marketGap || modelPred.script)
              : lockSyncing
                ? "正在从 Cloudflare D1 读取这场比赛的 preferred lock，读取完成后会自动展示完整模型链路和最终结论。"
              : "这场比赛还没有真实模型推演记录。当前只显示盘口预筛信息，完成推演并锁版后会展示完整模型链路和最终结论。"
        }</p>
      </section>
      ${renderFootballDataLayerPanel(item, modelPred)}
      ${renderLeagueProfilePanel(item, modelPred)}
      ${renderSportteryDataSupport(item, totalGoals, scoreOdds, sourceStamp)}
    </div>
    <div class="match-mode-panel" data-match-mode-panel="full" hidden>
      ${renderSportteryV4FullMode(item, modelPred, research, totalGoals, scoreOdds, sourceStamp)}
    </div>
    <div class="match-page-actions">
      ${item.linkedNo ? `<button type="button" data-detail-model="${item.linkedNo}">赛事推演锁版</button>` : ""}
      ${modelPred && !item.linkedNo ? `<button type="button" data-detail-global-stats>统计和回测</button>` : ""}
      <button type="button" class="secondary" data-detail-back>${backLabel.replace("← ", "返回")}</button>
    </div>
  `;
  activateTab("match-detail");
  document.body.classList.add("sporttery-detail-mode");
  document.querySelectorAll(".home-topbar nav button").forEach((button) => button.classList.remove("active"));
  document.querySelector(".home-topbar [data-sporttery-pool]")?.classList.add("active");
  if (modelPred) refreshD1CaseBasePanel(modelPred, item);
  if (resetScroll) {
    window.scrollTo({ top: 0, behavior: "auto" });
  } else if (preserveScroll) {
    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(previousScrollY, maxScroll), behavior: "auto" });
    });
  }
}

function openSportteryMatchPage(key, returnTarget = "sporttery") {
  matchDetailReturnTarget = returnTarget;
  const lookupKey = sportteryLookupKeyFromHash(key);
  const hashKey = encodeURIComponent(lookupKey);
  if (window.location.hash !== `#sporttery-match-${hashKey}`) {
    sportteryDetailNavigationPending = true;
    window.location.hash = `sporttery-match-${hashKey}`;
    return;
  }
  renderSportteryMatchDetail(lookupKey);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMatchPage() {
  if (window.location.hash.startsWith("#match-") || window.location.hash.startsWith("#sporttery-match-")) {
    const hash = matchDetailReturnTarget === "review" ? "#model-stats" : matchDetailReturnTarget === "model-stats" ? "#model-stats" : matchDetailReturnTarget === "locks" ? "#locks" : matchDetailReturnTarget === "odds-map" ? "#odds-map" : matchDetailReturnTarget === "sporttery" ? "#sporttery" : "#worldcup";
    history.pushState("", document.title, `${window.location.pathname}${window.location.search}${hash}`);
  }
  activateTab(matchDetailReturnTarget === "review" ? "model-stats" : matchDetailReturnTarget === "model-stats" ? "model-stats" : matchDetailReturnTarget === "locks" ? "site-locks" : matchDetailReturnTarget === "odds-map" ? "odds-map" : matchDetailReturnTarget === "sporttery" ? "sporttery-pool" : "schedule");
}

function handleRouteFromHash() {
  if (!window.location.hash) {
    showHome();
    return;
  }
  const match = window.location.hash.match(/^#match-(.+)$/);
  if (match) {
    showDashboard();
    renderMatchDetail(match[1]);
    return;
  }
  const sportteryMatch = window.location.hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) {
    showDashboard();
    renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
    return;
  }
  if (window.location.hash === "#worldcup") {
    activateTab("schedule");
  }
  if (window.location.hash === "#worldcup-knockout") {
    history.replaceState("", document.title, `${window.location.pathname}${window.location.search}#worldcup`);
    activateTab("schedule");
  }
  if (window.location.hash === "#sporttery") {
    activateTab("sporttery-pool");
  }
  if (window.location.hash === "#locks") {
    activateTab("site-locks");
  }
  if (window.location.hash === "#model-intro") {
    activateTab("model-intro");
  }
  if (window.location.hash === "#model-stats") {
    activateTab("model-stats");
  }
  if (window.location.hash === "#odds-map") {
    activateTab("odds-map");
  }
  if (window.location.hash === "#about") {
    activateTab("about-site");
  }
}

function renderSchedule() {
  const filtered = getFilteredMatches();
  document.querySelector("#schedule-list").innerHTML = renderGoalTrendTable(filtered, {
    title: "2026 世界杯进球轨道",
    dateFormatter: (match) => formatDate(ticaiDate(match)),
    issueFormatter: ticaiIssue,
    scoreFormatter: officialScoreForMatch,
  });
  var schFinished = filtered.filter(function(m){ return parseScore(officialScoreForMatch(m)); });
  if (schFinished.length > 0) {
    var goalData = { labels: [], values: [] };
    schFinished.slice().sort(function(a,b){ return a.date.localeCompare(b.date); }).forEach(function(m){
      var p = parseScore(officialScoreForMatch(m));
      if (p) { goalData.labels.push(formatDate(m.date).slice(-5)); goalData.values.push(p.total); }
    });
    renderGoalTrendChart(goalData, "已完成场次进球走势");
  }
  document.querySelector("#schedule-2022-list").innerHTML = renderGoalTrendTable(data.worldCup2022Matches || [], {
    title: "2022 世界杯进球轨道",
    dateFormatter: (match) => formatDate(match.date),
  });
}

function renderGoalTrendTable(sourceMatches, options = {}) {
  const buckets = ["0球", "1球", "2球", "3球", "4球", "5球", "6球", "7+球"];
  const rows = sourceMatches
    .map((match) => {
      const scoreText = options.scoreFormatter ? options.scoreFormatter(match) : match.score;
      const parsed = parseScore(scoreText);
      const activeBucket = parsed ? goalBucket(parsed.total) : "";
      const issue = options.issueFormatter ? options.issueFormatter(match) : match.no;
      const date = options.dateFormatter ? options.dateFormatter(match) : formatDate(match.date);
      const bucketCells = buckets
        .map((bucket) => `<td class="bucket-cell ${bucket === activeBucket ? "active-bucket" : ""}">${bucket === activeBucket ? bucket : ""}</td>`)
        .join("");
      return `
        <tr class="${parsed ? "is-finished" : "is-upcoming"}">
          <td>${date}</td>
          <td class="mono">${issue}</td>
          <td class="home-cell">${match.home}</td>
          <td class="score-cell">${scoreText || ""}</td>
          <td class="away-cell">${match.away}</td>
          ${bucketCells}
          <td>${parsed ? parsed.total : ""}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="global-stats-table-toolbar goal-trend-toolbar">
      <div>
        <span>进球轨道明细</span>
        <strong>${options.title || "世界杯进球轨道"} · ${sourceMatches.length} 场</strong>
      </div>
      <button type="button" data-goal-trend-maximize aria-label="最大化查看${options.title || "世界杯进球轨道"}">
        <span>最大化查看</span>
      </button>
    </div>
    <div class="trend-wrap">
      <table class="trend-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>场次</th>
            <th>主队</th>
            <th>比分</th>
            <th>客队</th>
            ${buckets.map((bucket) => `<th>${bucket}</th>`).join("")}
            <th>总进球</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function openGoalTrendModal(button) {
  const timeline = button?.closest(".timeline");
  const sourceTable = timeline?.querySelector(".trend-table");
  if (!sourceTable) return;
  document.querySelector(".global-stats-modal")?.remove();
  const summary = timeline.querySelector(".goal-trend-toolbar strong")?.textContent || "世界杯进球轨道";
  const modal = document.createElement("div");
  modal.className = "global-stats-modal goal-trend-modal";
  modal.innerHTML = `
    <div class="global-stats-dialog goal-trend-dialog" role="dialog" aria-modal="true" aria-label="进球轨道最大化表格">
      <header>
        <div>
          <span>进球轨道</span>
          <strong>${summary}</strong>
          <em>横向滚动查看进球区间，纵向滚动查看更多比赛。</em>
        </div>
        <button type="button" data-global-stats-close aria-label="关闭最大化表格">×</button>
      </header>
      <div class="global-stats-dialog-body goal-trend-dialog-body"></div>
    </div>
  `;
  const tableClone = sourceTable.cloneNode(true);
  tableClone.classList.add("trend-table-expanded");
  modal.querySelector(".goal-trend-dialog-body")?.appendChild(tableClone);
  document.body.appendChild(modal);
}
