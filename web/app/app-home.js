// app-home.js — 首页、倒计时、体彩池、信号
function handicapLabel(pred) {
  const match = matches.find((item) => item.no === pred.no);
  const line = reviewHandicapLine(pred);
  const home = match?.home || pred?.home || "";
  return home && line ? `${home}${line}` : "";
}

function uniquePredictionCount() {
  return new Set([
    ...data.predictions.map((item) => `wc-${item.no}`),
    ...(data.sportteryPredictions || []).map((item) => `sp-${item.sportteryKey || item.no}`),
  ]).size;
}

function predictionVersionRank(pred) {
  const version = predictionModelVersion(pred);
  if (version === "V1") return 1;
  if (version === "V2") return 2;
  if (version === "V3") return 3;
  if (version === "V4") return 4;
  return 0;
}

function predictionModelVersion(pred) {
  if (!pred) return "";
  if (pred.modelVersion) return modelVersionFromText(pred.modelVersion) || pred.modelVersion;
  if ((pred.type || "").includes("V4")) return "V4";
  if ((pred.type || "").includes("V3")) return "V3";
  if ((pred.type || "").includes("V2")) return "V2";
  if ((pred.type || "").includes("V1")) return "V1";
  return Number(pred.no) >= 25 ? "V2" : "V1";
}

function predictionVersionLabel(pred) {
  if (!pred) return "";
  return `${predictionModelVersion(pred)} 锁版`;
}

function groupedPredictions() {
  return matches
    .map((match) => ({
      match,
      predictions: data.predictions
        .filter((pred) => pred.no === match.no)
        .slice()
        .sort((a, b) => predictionVersionRank(b) - predictionVersionRank(a)),
    }))
    .filter((item) => item.predictions.length)
    .sort((a, b) => {
      const dateCompare = b.match.date.localeCompare(a.match.date);
      if (dateCompare !== 0) return dateCompare;
      return Number(b.match.no) - Number(a.match.no);
    });
}

function sportteryWorldCupGroupedPredictions() {
  const staticKeys = new Set(
    groupedPredictions().map(({ match }) => `${match.no}-${match.date}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`)
  );
  return (data.sportteryPredictions || [])
    .map((pred) => {
      const item = findSportteryItemForPrediction(pred);
      const competition = pred.competition || pred.competitionModel || item?.league || "";
      if (!/世界杯|world\s*cup/i.test(competition)) return null;
      if (hasOfficialWorldCupLock(pred, item)) return null;
      const actualScore = item ? verifiedSportteryScore(item) : "";
      const match = {
        no: pred.no || item?.no || "",
        date: pred.date || pred.matchDate || item?.ticaiDate || item?.matchDate || "",
        matchDate: pred.matchDate || item?.matchDate || pred.date || item?.ticaiDate || "",
        kickoffTime: pred.kickoffTime || item?.kickoffTime || "",
        group: pred.group || pred.competition || item?.league || "世界杯",
        competition: pred.competition || item?.league || "世界杯",
        league: pred.competition || item?.league || "世界杯",
        home: pred.home || item?.home || "",
        away: pred.away || item?.away || "",
        score: actualScore,
        sportteryKey: pred.sportteryKey || (item ? sportteryItemKey(item) : ""),
        matchId: pred.matchId || item?.matchId || "",
      };
      const key = `${match.no}-${match.date}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`;
      if (!match.home || !match.away || staticKeys.has(key)) return null;
      return { match, predictions: [pred] };
    })
    .filter(Boolean);
}

function groupedWorldCupPredictions() {
  return [...groupedPredictions(), ...sportteryWorldCupGroupedPredictions()].sort((a, b) => {
    const dateCompare = String(b.match.date || "").localeCompare(String(a.match.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(b.match.no || 0) - Number(a.match.no || 0);
  });
}

function latestPredictionFor(no) {
  return data.predictions
    .filter((pred) => pred.no === no)
    .slice()
    .sort((a, b) => predictionVersionRank(b) - predictionVersionRank(a))[0];
}

function goalBucket(total) {
  if (total >= 7) return "7+球";
  return `${total}球`;
}

function getFilteredMatches() {
  const keyword = searchInput?.value.trim() || "";
  const status = statusFilter?.value || "all";
  return matches.filter((match) => {
    const textHit = !keyword || `${match.home}${match.away}${match.group}`.includes(keyword);
    const isFinished = Boolean(parseScore(officialScoreForMatch(match)));
    const hasPrediction = predictionMap.has(match.no);
    const statusHit =
      status === "all" ||
      (status === "finished" && isFinished) ||
      (status === "upcoming" && !isFinished) ||
      (status === "predicted" && hasPrediction);
    return textHit && statusHit;
  });
}

function formatDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ticaiDate(match) {
  const odds = oddsMatch(match);
  if (odds?.ticaiDate) return odds.ticaiDate;
  if (match.ticaiDate) return match.ticaiDate;
  return addDays(match.date, data.ticaiDateOffsetDays || 0);
}

function ticaiIssue(match) {
  return oddsMatch(match)?.issue || match.no;
}

function dashboardToday() {
  if (data.currentDate) return data.currentDate;
  return calendarToday();
}

function calendarToday() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function currentSportteryBusinessDate(currentCalendarDate = calendarToday()) {
  const oddsDates = [...(oddsData.matchDates || [])].filter(Boolean).sort();
  const oddsLotterNo = oddsData.lotterNo || "";
  return (
    (oddsDates.includes(currentCalendarDate) ? currentCalendarDate : "") ||
    (oddsLotterNo && oddsLotterNo >= currentCalendarDate ? oddsLotterNo : "") ||
    oddsDates.find((date) => date >= currentCalendarDate) ||
    oddsDates.at(-1) ||
    currentCalendarDate
  );
}

function recentSportteryDateSet(currentCalendarDate = calendarToday(), currentSportteryDate = currentSportteryBusinessDate(currentCalendarDate)) {
  return new Set(
    [currentCalendarDate, addDays(currentCalendarDate, -1), currentSportteryDate, addDays(currentSportteryDate, -1)].filter(Boolean)
  );
}

function itemMatchesDateSet(item = {}, dateSet = new Set()) {
  return [item.ticaiDate, item.matchDate, item.date].filter(Boolean).some((date) => dateSet.has(date));
}

function uniqueSportteryRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = sportteryItemKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function homeReferenceDate() {
  return currentSportteryBusinessDate(calendarToday());
}

function homeUpcomingMatches() {
  const baseDate = homeReferenceDate();
  const recentPoolDates = recentSportteryDateSet();
  const future = matches
    .filter((match) => !parseScore(officialScoreForMatch(match)) && match.date >= baseDate)
    .map((match) => ({ ...match, homeDate: match.date }));
  const sportteryOnly = (oddsData.matches || [])
    .filter((item) => !matchFromOddsItem(item))
    .filter((item) => {
      const score = verifiedSportteryScore(item);
      if (score) return false;
      const saleDate = item.ticaiDate || item.matchDate || "";
      return saleDate >= baseDate || item.matchDate >= baseDate || itemMatchesDateSet(item, recentPoolDates);
    })
    .map((item) => ({
      ...item,
      no: item.no || item.issue,
      date: item.matchDate || item.ticaiDate || baseDate,
      homeDate: item.matchDate || item.ticaiDate || baseDate,
      group: item.league || "竞彩",
      sportteryKey: sportteryItemKey(item),
      sportteryOnly: true,
    }));
  const merged = [...future, ...sportteryOnly]
    .slice()
    .sort((a, b) => (a.homeDate || a.date).localeCompare(b.homeDate || b.date) || Number(a.no) - Number(b.no));
  if (merged.length) return merged;
  return matches
    .filter((match) => !parseScore(officialScoreForMatch(match)))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.no) - Number(b.no));
}

function sportteryWorldCupFlowMatches(dateSet = new Set()) {
  return (oddsData.matches || [])
    .filter((item) => /世界杯|world\s*cup/i.test(item.league || item.competition || ""))
    .filter((item) => itemMatchesDateSet(item, dateSet))
    .map((item) => ({
      no: item.no || compactSportteryNo(item.issue, item.matchId),
      date: item.ticaiDate || item.matchDate || dashboardToday(),
      matchDate: item.matchDate || item.ticaiDate || dashboardToday(),
      ticaiDate: item.ticaiDate || "",
      kickoffTime: item.kickoffTime || "",
      group: item.stage || item.round || item.league || "世界杯",
      competition: item.league || "世界杯",
      league: item.league || "世界杯",
      home: item.home,
      away: item.away,
      score: normalizeResultScore(item.score),
      issue: item.issue || "",
      matchId: item.matchId || "",
      statusCode: item.statusCode || "",
      statusName: item.statusName || "",
      sportteryKey: sportteryItemKey(item),
      sportteryOnly: true,
    }));
}

function worldCupMatchFlowMatches(today, tomorrow) {
  const dateSet = new Set([today, tomorrow].filter(Boolean));
  const staticRows = matches.filter((m) => dateSet.has(m.date) || dateSet.has(ticaiDate(m)) || dateSet.has(m.matchDate));
  const byKey = new Map(
    staticRows.map((match) => [
      `${normalizedIssueNo(match.no)}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`,
      match,
    ])
  );
  sportteryWorldCupFlowMatches(dateSet).forEach((match) => {
    const key = `${normalizedIssueNo(match.no)}-${normalizeTeamName(match.home)}-${normalizeTeamName(match.away)}`;
    if (!byKey.has(key)) byKey.set(key, match);
  });
  return [...byKey.values()].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return Number(normalizedIssueNo(a.no)) - Number(normalizedIssueNo(b.no));
  });
}

function parseKickoffAt(date, time) {
  if (!date || !time) return null;
  const cleanTime = String(time).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(cleanTime)) return null;
  const parsed = Date.parse(`${date}T${cleanTime}:00+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoffElapsedMinutes(kickoffAt) {
  if (!kickoffAt) return null;
  return Math.max(0, Math.floor((Date.now() - kickoffAt) / 60000));
}

function isPastResultWindow(kickoffAt) {
  const elapsed = kickoffElapsedMinutes(kickoffAt);
  return elapsed !== null && elapsed > SPORTTERY_RESULT_PENDING_WINDOW_MINUTES;
}

function inferredLiveText(statusName, kickoffAt) {
  if (statusName && statusName !== "待开奖") return statusName;
  if (kickoffElapsedMinutes(kickoffAt) === null) return "进行中";
  if (isPastResultWindow(kickoffAt)) return "待回填";
  return "进行中";
}

function inferredLiveNote(statusName, kickoffAt) {
  const elapsed = kickoffElapsedMinutes(kickoffAt);
  if (statusName && statusName !== "待开奖") return "来自体彩官方状态";
  if (elapsed === null) return "等待官方比分回填";
  if (isPastResultWindow(kickoffAt)) return "比赛已超过官方回填观察窗口，等待比分回填";
  return `已开赛约 ${elapsed} 分钟，等待官方比分回填`;
}

function homeFallbackKickoff(match) {
  const date = match?.matchDate || match?.date || match?.ticaiDate || homeReferenceDate();
  const time = match?.kickoffTime || match?.matchTime;
  return parseKickoffAt(date, time);
}

function homeCountdownCandidates() {
  const now = Date.now();
  const liveMatches = (oddsData.matches || [])
    .map((match) => {
      const reference = matchFromOddsItem(match) || {};
      const kickoffAt = homeFallbackKickoff(match);
      const score = verifiedSportteryScore(match);
      return {
        ...reference,
        ...match,
        group: reference.group || match.group || match.league || "竞彩",
        date: match.matchDate || reference.date || match.ticaiDate,
        kickoffAt,
        score,
      };
    })
    .filter((match) => !match.score && Number.isFinite(match.kickoffAt) && match.kickoffAt >= now)
    .sort((a, b) => a.kickoffAt - b.kickoffAt || Number(a.no) - Number(b.no));

  if (liveMatches.length) return liveMatches;

  return homeUpcomingMatches()
    .map((match) => ({ ...match, kickoffAt: homeFallbackKickoff(match) }))
    .sort((a, b) => a.kickoffAt - b.kickoffAt || Number(a.no) - Number(b.no));
}

function formatCountdownDuration(diffMs) {
  const safeDiff = Math.max(0, diffMs);
  const hours = Math.floor(safeDiff / 3600000);
  const minutes = Math.floor((safeDiff % 3600000) / 60000);
  const seconds = Math.floor((safeDiff % 60000) / 1000);
  return { hours, minutes, seconds };
}

function flagForTeam(team) {
  return teamFlags[team] || "";
}

function renderHomeCountdown() {
  const next = homeCountdownCandidates()[0];
  const nextMatch = document.querySelector("#home-next-match");
  const nextHour = document.querySelector("#home-countdown-hour");
  const nextMinute = document.querySelector("#home-countdown-minute");
  const nextSecond = document.querySelector("#home-countdown-second");
  if (!next) {
    if (nextMatch) nextMatch.textContent = "- vs -";
    if (nextHour) nextHour.textContent = "00";
    if (nextMinute) nextMinute.textContent = "00";
    if (nextSecond) nextSecond.textContent = "00";
    return;
  }

  const diff = formatCountdownDuration(next.kickoffAt - Date.now());
  if (nextMatch) {
    nextMatch.innerHTML = `
      <span class="team-flag">${flagForTeam(next.home)}</span>
      <span>${next.home}</span>
      <small>vs</small>
      <span>${next.away}</span>
      <span class="team-flag">${flagForTeam(next.away)}</span>
    `;
  }
  if (nextHour) nextHour.textContent = String(diff.hours).padStart(2, "0");
  if (nextMinute) nextMinute.textContent = String(diff.minutes).padStart(2, "0");
  if (nextSecond) nextSecond.textContent = String(diff.seconds).padStart(2, "0");
}

function startHomeCountdown() {
  renderHomeCountdown();
  clearInterval(homeCountdownTimer);
  homeCountdownTimer = setInterval(renderHomeCountdown, 1000);
}

function matchKickoffAt(match) {
  const odds = oddsMatch(match);
  const result = resultForWorldCupMatch(match);
  const date = odds?.matchDate || result?.matchDate || match.matchDate || match.date;
  const time = odds?.kickoffTime || result?.kickoffTime || match.kickoffTime;
  return parseKickoffAt(date, time);
}

function liveScoreForMatch(match) {
  return officialScoreForMatch(match) || currentLiveScoreForMatch(match);
}

function liveStatusForMatch(match) {
  const officialScore = officialScoreForMatch(match);
  const odds = oddsMatch(match);
  const liveRow = liveScoreForSportteryItem({ ...match, ...odds });
  const liveScore = currentLiveScoreForMatch(match);
  const result = resultForWorldCupMatch(match);
  const kickoffAt = matchKickoffAt(match);
  const now = Date.now();
  if (officialScore) {
    return {
      tone: "finished",
      label: "已完赛",
      value: officialScore,
      note: result?.statusName || "官方赛果已回填",
      kickoffAt,
    };
  }
  if (liveScore) {
    return {
      tone: "live",
      label: liveScoreStatusText(liveRow) || "进行中",
      value: liveScore,
      note: liveRow?.source ? `实时比分 · ${liveRow.source}` : "实时比分",
      kickoffAt,
    };
  }
  if (kickoffAt && now >= kickoffAt) {
    const statusName = result?.statusName || "";
    if (isPastResultWindow(kickoffAt)) {
      return {
        tone: "pending-result",
        label: "待回填",
        value: "待回填",
        note: inferredLiveNote(statusName, kickoffAt),
        kickoffAt,
      };
    }
    return {
      tone: "live",
      label: inferredLiveText(statusName, kickoffAt) === "待回填" ? "待回填" : "进行中",
      value: inferredLiveText(statusName, kickoffAt),
      note: inferredLiveNote(statusName, kickoffAt),
      kickoffAt,
    };
  }
  if (kickoffAt) {
    return {
      tone: "countdown",
      label: "距开赛",
      value: "",
      note: "北京开球时间",
      kickoffAt,
    };
  }
  return {
    tone: "pending",
    label: "待赛",
    value: "时间待同步",
    note: "等待赛程源",
    kickoffAt: null,
  };
}

function formatMatchCountdown(kickoffAt) {
  if (!kickoffAt) return "时间待同步";
  const diff = kickoffAt - Date.now();
  if (diff <= 0) return isPastResultWindow(kickoffAt) ? "待回填" : "进行中";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}天 ${String(hours).padStart(2, "0")}时`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function homeSportteryStatus(item = {}) {
  const result = resultForSportteryItem(item);
  const liveScore = liveScoreForSportteryItem(item);
  const resultScore = verifiedSportteryScore(item);
  const liveScoreText = normalizeResultScore(liveScore?.score);
  const kickoffAt = homeFallbackKickoff(item);
  if (resultScore) {
    return {
      tone: "finished",
      label: "已完赛",
      value: resultScore,
      note: result?.statusName || item.statusName || "赛果已回填",
      kickoffAt,
    };
  }
  if (liveScoreText && liveScoreStatusText(liveScore)) {
    return {
      tone: liveScore?.isFinished ? "finished" : "live",
      label: liveScoreStatusText(liveScore),
      value: liveScoreText,
      note: liveScore?.source ? `实时比分 · ${liveScore.source}` : "实时比分",
      kickoffAt,
    };
  }
  if (kickoffAt && Date.now() >= kickoffAt) {
    return isPastResultWindow(kickoffAt)
      ? {
          tone: "pending-result",
          label: "待回填",
          value: "待回填",
          note: "比赛已超过官方回填观察窗口，等待比分回填",
          kickoffAt,
        }
      : {
          tone: "live",
          label: "进行中",
          value: "进行中",
          note: "等待官方比分回填",
          kickoffAt,
        };
  }
  return {
    tone: "countdown",
    label: "距开赛",
    value: "",
    note: "北京开球时间",
    kickoffAt,
  };
}

function updateMatchFlowTimers() {
  document.querySelectorAll("[data-match-countdown]").forEach((node) => {
    const kickoffAt = Number(node.dataset.kickoffAt);
    const homeCard = node.closest(".home-match-card");
    if (homeCard?.classList.contains("finished")) return;
    node.textContent = formatMatchCountdown(kickoffAt);
    const card = node.closest(".match-card");
    if (card && kickoffAt && Date.now() >= kickoffAt && !card.classList.contains("finished")) {
      const label = card.querySelector("[data-live-label]");
      const note = card.querySelector("[data-live-note]");
      if (isPastResultWindow(kickoffAt)) {
        card.classList.remove("is-live");
        if (label) label.textContent = "待回填";
        if (note) note.textContent = "比赛已超过官方回填观察窗口，等待比分回填";
      } else {
        card.classList.add("is-live");
        if (label) label.textContent = "进行中";
        if (note) note.textContent = "等待官方比分回填";
      }
    }
    if (homeCard && kickoffAt && Date.now() >= kickoffAt) {
      const label = homeCard.querySelector("[data-home-live-label]");
      const note = homeCard.querySelector("[data-home-live-note]");
      homeCard.classList.toggle("is-live", !isPastResultWindow(kickoffAt));
      homeCard.classList.toggle("pending-result", isPastResultWindow(kickoffAt));
      if (label) label.textContent = isPastResultWindow(kickoffAt) ? "待回填" : "进行中";
      if (note) note.textContent = isPastResultWindow(kickoffAt)
        ? "比赛已超过官方回填观察窗口，等待比分回填"
        : "等待官方比分回填";
    }
  });
}

function startMatchFlowTimers() {
  updateMatchFlowTimers();
  clearInterval(matchFlowTimer);
  matchFlowTimer = setInterval(updateMatchFlowTimers, 1000);
}

function dataFreshnessLabel(value) {
  return formatCapturedAt(value) || "等待快照";
}

function renderHomeResearchLab() {
  const grid = document.querySelector("#home-research-grid");
  if (!grid) return;
  const oddsRows = oddsMapRows();
  const conflictCount = oddsRows.filter((row) => row.riskFlags.length).length;
  const highCount = oddsRows.filter((row) => row.pressureLevel === "强异动").length;
  const teams = buildTeamTable();
  const topPath = teams.slice().sort((a, b) => b.title - a.title)[0];
  const auditRows = modelAuditRows();
  const locked = auditRows.length;
  const currentPreferred = uniquePredictionCount();
  const verified = auditRows.filter((row) => row.review?.actualDirection).length;
  const services = [
    {
      label: "实时数据服务",
      value: `${oddsData.matches?.length || 0} 场`,
      note: `开盘 ${dataFreshnessLabel(oddsData.importedAt || oddsData.lastUpdateTime)}`,
      tone: "data",
    },
    {
      label: "SP 漂移雷达",
      value: `${highCount}/${oddsRows.length || 0}`,
      note: `${conflictCount} 个跨市场冲突`,
      tone: "sp",
    },
    {
      label: "模型锁版库",
      value: `${locked} 条`,
      note: `${currentPreferred} 条当前首选 · ${verified} 条已有赛果`,
      tone: "model",
    },
    {
      label: "世界杯路径",
      value: topPath?.name || "待计算",
      note: topPath ? `冠军模拟 ${pct(topPath.title)}` : "积分榜待更新",
      tone: "path",
    },
    {
      label: "证据输入清单",
      value: "5 层",
      note: "盘口 / SP / 赛果 / 路径 / 模型文本",
      tone: "check",
    },
  ];
  grid.innerHTML = services
    .map(
      (item) => `
        <article class="${item.tone}">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <em>${item.note}</em>
        </article>
      `
    )
    .join("");
}

function renderHome() {
  const upcoming = homeUpcomingMatches();
  const grid = document.querySelector("#home-upcoming-grid");
  startHomeCountdown();
  renderHomeResearchLab();
  if (!grid) return;
  grid.innerHTML = upcoming
    .slice(0, 6)
    .map((match) => {
      const kickoffAt = matchKickoffAt(match);
      const liveStatus = match.sportteryOnly ? homeSportteryStatus(match) : liveStatusForMatch(match);
      const effectiveKickoffAt = liveStatus.kickoffAt || kickoffAt;
      const groupLabel = match.sportteryOnly ? match.group || "竞彩" : `${match.group} 组`;
      const hasPrediction = match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no);
      const cardTarget = match.sportteryOnly
        ? `data-home-sporttery-key="${encodeURIComponent(match.sportteryKey || sportteryItemKey(match))}"`
        : `data-home-match-no="${match.no}"`;
      const kickoffLabel = effectiveKickoffAt
        ? new Date(effectiveKickoffAt).toLocaleTimeString("zh-CN", {
            timeZone: data.timezone || "Asia/Shanghai",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "时间待同步";
      const countdownValue = liveStatus.tone === "countdown"
        ? formatMatchCountdown(effectiveKickoffAt)
        : liveStatus.value || liveStatus.label;
      const countdownLabel = liveStatus.tone === "countdown" ? "距离开赛" : liveStatus.label;
      const countdownNote = liveStatus.tone === "countdown" ? `${kickoffLabel} 北京时间` : liveStatus.note;
      return `
        <button type="button" class="home-match-card ${liveStatus.tone === "live" ? "is-live" : ""} ${liveStatus.tone === "pending-result" ? "pending-result" : ""} ${liveStatus.tone === "finished" ? "finished" : ""}" ${cardTarget}>
          <span>${groupLabel}</span>
          <em>${formatDate(match.date)}</em>
          <strong>${match.home}<small>vs</small>${match.away}</strong>
          <div class="home-match-countdown">
            <small data-home-live-label>${countdownLabel}</small>
            <strong data-match-countdown data-kickoff-at="${effectiveKickoffAt || ""}">${countdownValue}</strong>
            <em data-home-live-note>${countdownNote}</em>
          </div>
          <b>${hasPrediction ? "已有推演" : "待锁版"}</b>
        </button>
      `;
    })
    .join("");
  startMatchFlowTimers();
}

function lowestOddOption(options = [], labelKey = "score") {
  return [...options]
    .map((item) => ({ ...item, number: numberOdd(item.odds) }))
    .filter((item) => item.number)
    .sort((a, b) => a.number - b.number)[0]?.[labelKey];
}

function marketFavoriteText(odds) {
  if (!odds?.normal) return "";
  const rows = [
    ["胜", odds.normal.win],
    ["平", odds.normal.draw],
    ["负", odds.normal.lose],
  ]
    .map(([label, odd]) => ({ label, odd: numberOdd(odd) }))
    .filter((item) => item.odd);
  if (!rows.length) return "";
  const top = rows.sort((a, b) => a.odd - b.odd)[0];
  return `${top.label} ${top.odd.toFixed(2)}`;
}

function matchLiveDataSummary(match, pred) {
  const odds = oddsMatch(match);
  const spRow = spRadarForMatch(match);
  const consistency = pred ? marketConsistency(match.no, pred) : null;
  const gate = pred ? autoDecisionGate(match.no, pred) : null;
  const scoreLow = odds ? lowestOddOption(odds.scoreOdds, "score") : "";
  const totalLow = odds ? lowestOddOption(odds.totalGoalsOdds, "goals") : "";
  const items = [];

  if (odds) {
    items.push(["体彩开盘", odds.issue || match.no, "ready"]);
    items.push(["盘口", `${match.home}${odds.handicap || "0"}`, "ready"]);
    const favorite = marketFavoriteText(odds);
    if (favorite) items.push(["胜平负低位", favorite, "ready"]);
    if (scoreLow) items.push(["比分低赔", scoreLow.replace(":", "-"), "watch"]);
    if (totalLow) items.push(["总进球低赔", `${totalLow}球`, "watch"]);
  } else {
    items.push(["体彩开盘", pred ? "已截止" : "待同步", pred ? "closed" : "pending"]);
  }

  if (spRow?.strongest) {
    items.push(["SP异动", `${spRow.strongest.market} ${spRow.strongest.label}`, spRow.volatility >= 0.08 ? "hot" : "ready"]);
    items.push(["盘口温度", spRow.pressureLevel, spRow.riskFlags.length ? "hot" : "watch"]);
  } else {
    items.push(["SP历史", pred ? "锁版复核" : "等待快照", pred ? "closed" : "pending"]);
  }

  if (gate) items.push(["证据等级", `${gate.level} ${gate.score}`, gate.tone === "cold" ? "watch" : gate.tone === "watch" ? "watch" : "ready"]);
  if (consistency) items.push(["一致性", `${consistency.label} ${consistency.score || "-"}`, consistency.score < 50 ? "hot" : "ready"]);

  return items.slice(0, 7);
}

function matchCard(match, options = {}) {
  const pred = match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no);
  const liveStatus = liveStatusForMatch(match);
  const finished = liveStatus.tone === "finished";
  const displayDate = options.dateGetter ? options.dateGetter(match) : ticaiDate(match);
  const statusText = finished ? "已完赛" : liveStatus.tone === "live" ? "进行中" : liveStatus.tone === "pending-result" ? "待回填" : "待赛";
  const modelText = pred ? `模型 ${pred.pick}` : "待锁版";
  const scoreText = pred ? `比分 ${pred.mainScore} / ${pred.counterScore}` : "等待推演";
  const liveItems = matchLiveDataSummary(match, pred);
  const liveValue =
    liveStatus.tone === "countdown"
      ? `<strong data-match-countdown data-kickoff-at="${liveStatus.kickoffAt}">${formatMatchCountdown(liveStatus.kickoffAt)}</strong>`
      : `<strong>${liveStatus.value}</strong>`;
  const cardTarget = match.sportteryOnly
    ? `data-sporttery-match-key="${encodeURIComponent(match.sportteryKey || sportteryItemKey(match))}"`
    : `data-match-no="${match.no}"`;
  return `
    <article class="match-card ${finished ? "finished" : "upcoming"} ${liveStatus.tone === "live" ? "is-live" : ""} ${pred ? "has-model" : "no-model"}" ${cardTarget}>
      <div class="match-meta">
        <span class="match-issue">${match.no}</span>
        <span>${formatDate(displayDate)} · ${match.group}组</span>
      </div>
      <div class="teams">
        <strong>${match.home}</strong>
        <b>${liveScoreForMatch(match) || "vs"}</b>
        <strong>${match.away}</strong>
      </div>
      <div class="match-live-status ${liveStatus.tone}">
        <span data-live-label>${liveStatus.label}</span>
        ${liveValue}
        <em data-live-note>${liveStatus.note}</em>
      </div>
      <div class="match-card-insight">
        <span class="status-dot ${finished ? "done" : "open"}"></span>
        <strong>${modelText}</strong>
        <em>${scoreText}</em>
      </div>
      <div class="match-live-strip">
        ${liveItems.map(([label, value, tone]) => `<span class="${tone}"><b>${label}</b><strong>${value}</strong></span>`).join("")}
      </div>
      <div class="card-foot">
        <span class="${finished ? "status-done" : "status-open"}">${statusText}</span>
        ${pred ? `<span class="model-chip">${pred.totalGoalsPick || "总进球待定"}</span>` : "<span>暂无模型</span>"}
      </div>
      <span class="card-deep-link">进入单场详情页 ›</span>
    </article>
  `;
}

function renderMatchLanes(sourceMatches, options = {}) {
  const dateGetter = options.dateGetter || ticaiDate;
  const groups = sourceMatches.reduce((acc, match) => {
    const date = dateGetter(match);
    if (!acc.has(date)) acc.set(date, []);
    acc.get(date).push(match);
    return acc;
  }, new Map());

  return [...groups.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, items]) => {
      const modelCount = items.filter((match) => (match.sportteryOnly ? sportteryPredictionForItem(match) : latestPredictionFor(match.no))).length;
      return `
        <section class="day-lane">
          <div class="day-lane-head">
            <div>
              <span>${formatDate(date)}</span>
              <strong>${items.length} 场</strong>
            </div>
            <em>${modelCount}/${items.length} 锁版</em>
          </div>
          <div class="match-grid">${items.map((match) => matchCard(match, { dateGetter })).join("")}</div>
        </section>
      `;
    })
    .join("");
}

function sportteryPoolItems() {
  const resultRows = resultsData.results || [];
  const currentCalendarDate = calendarToday();
  const currentSportteryDate = currentSportteryBusinessDate(currentCalendarDate);
  const recentPoolDates = recentSportteryDateSet(currentCalendarDate, currentSportteryDate);
  const now = Date.now();
  /* 赛事池：优先 oddsData（实时云数据），其次 spHistoryData（含池补全），最后空 */
  const poolMatches = oddsData.matches?.length ? oddsData.matches : (spHistoryData.matches || []);
  const openItems = (poolMatches)
    .map((item) => {
      const linkedMatch = matchFromOddsItem(item);
      const result = resultForSportteryItem(item);
      const liveScore = liveScoreForSportteryItem(item);
      const resultScore = verifiedSportteryScore(item);
      const liveScoreText = normalizeResultScore(liveScore?.score);
      const score = resultScore || (liveScore?.isFinished ? liveScoreText : "");
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const elapsed = kickoffElapsedMinutes(kickoffAt);
      const likelyPastLiveWindow = !score && elapsed !== null && elapsed > SPORTTERY_RESULT_PENDING_WINDOW_MINUTES && !liveScoreText;
      const liveSignal = Boolean(liveScore?.live || liveScoreStatusText(liveScore));
      const kickoffStarted = Number.isFinite(kickoffAt) && now >= kickoffAt;
      const isLive = !score && !likelyPastLiveWindow && ((Boolean(liveScoreText) && liveSignal) || kickoffStarted);
      const displayScore = score || (isLive ? liveScoreText : "");
      const modelPred = sportteryPredictionForItem(item);
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || oddsData.lotterNo || dashboardToday(),
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        score,
        liveScore: liveScoreText,
        displayScore,
        liveStatus: liveScoreStatusText(liveScore),
        liveHalfScore: liveScore?.halfScore || "",
        liveSource: liveScore?.source || "",
        sourceType: "open",
        poolTone: score ? "finished" : isLive ? "live" : "open",
        status: score
          ? "已完赛"
          : likelyPastLiveWindow
            ? "待回填"
            : isLive
              ? liveScoreStatusText(liveScore) || "进行中"
              : modelPred ? "已有推演" : "已开盘",
        pendingResultNote: likelyPastLiveWindow ? inferredLiveNote(item.statusName, kickoffAt) : "",
      };
    })
    .sort((a, b) => a.displayDate.localeCompare(b.displayDate) || String(a.issue).localeCompare(String(b.issue)));
  const visibleOpenItems = openItems.filter((item) => {
    if (item.poolTone !== "open") return false;
    const ticaiDate = item.ticaiDate || "";
    const matchDate = item.matchDate || "";
    const saleDate = ticaiDate || matchDate;
    return saleDate >= currentSportteryDate || matchDate === currentCalendarDate || (!normalizeResultScore(item.score) && itemMatchesDateSet(item, recentPoolDates));
  });

  const resultKeys = new Set(
    resultRows
      .filter((item) => sportteryResultIsFinished(item))
      .map((item) =>
        [
          normalizedIssueNo(item.no || item.issue),
          item.ticaiDate || "",
          item.matchDate || "",
          `${item.home || ""}__${item.away || ""}`,
        ].join("|")
      )
  );
  const worldCupFinishedFallbackRows = matches
    .filter((match) => normalizeResultScore(officialScoreForMatch(match)))
    .map((match) => {
      const odds = oddsMatch(match) || {};
      const score = officialScoreForMatch(match);
      return {
        ...odds,
        orderId: odds.orderId || "",
        issue: odds.issue || match.no,
        no: match.no,
        ticaiDate: odds.ticaiDate || match.date,
        matchDate: odds.matchDate || match.date,
        kickoffTime: odds.kickoffTime || "",
        league: odds.league || "世界杯",
        matchId: odds.matchId || "",
        home: match.home,
        away: match.away,
        statusCode: odds.statusCode || "11",
        statusName: "已完成",
        score,
        result: direction(score),
        resultSource: "worldcup-data-fallback",
        linkedMatch: match,
      };
    })
    .filter((item) => {
      const key = [
        normalizedIssueNo(item.no || item.issue),
        item.ticaiDate || "",
        item.matchDate || "",
        `${item.home || ""}__${item.away || ""}`,
      ].join("|");
      return !resultKeys.has(key);
    });
  const liveFinishedFallbackRows = openItems
    .filter((item) => sportteryResultIsFinished(item))
    .filter((item) => {
      const key = [
        normalizedIssueNo(item.no || item.issue),
        item.ticaiDate || "",
        item.matchDate || "",
        `${item.home || ""}__${item.away || ""}`,
      ].join("|");
      return !resultKeys.has(key);
    })
    .map((item) => ({
      ...item,
      statusCode: item.statusCode || "11",
      statusName: item.statusName && item.statusName !== "待开奖" ? item.statusName : "已完成",
      result: item.result || direction(item.score),
      resultSource: item.liveSource || "live-fallback",
    }));

  const seenFinishedKeys = new Set();
  const finishedItems = [...resultRows, ...worldCupFinishedFallbackRows, ...liveFinishedFallbackRows]
    .filter((item) => {
      const key = sportteryItemKey(item);
      if (seenFinishedKeys.has(key)) return false;
      seenFinishedKeys.add(key);
      return true;
    })
    .filter((item) => {
      return itemMatchesDateSet(item, recentPoolDates);
    })
    .filter((item) => normalizeResultScore(item.score))
    .map((item) => {
      const linkedMatch = item.linkedMatch || matchFromResultItem(item);
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || item.matchDate || currentSportteryDate,
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        sourceType: "finished",
        poolTone: "finished",
        status: item.statusName || "已完赛",
      };
    })
    .sort((a, b) => String(a.issue).localeCompare(String(b.issue)));

  const liveResultItems = resultRows
    .filter((item) => !normalizeResultScore(item.score))
    .filter((item) => itemMatchesDateSet(item, recentPoolDates))
    .filter((item) => {
      const status = `${item.statusCode || ""} ${item.statusName || ""}`;
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const hasStarted = Number.isFinite(kickoffAt) && Date.now() >= kickoffAt;
      return hasStarted || /进行|半场|中场|暂停|加时|未完成|比赛中|待开奖|[1-9]\d?'/.test(status);
    })
    .map((item) => {
      const linkedMatch = matchFromResultItem(item);
      const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
      const pendingResult = isPastResultWindow(kickoffAt);
      const liveScore = liveScoreForSportteryItem(item);
      const score = liveScore?.isFinished ? normalizeResultScore(liveScore.score) : "";
      return {
        ...item,
        sportteryKey: sportteryItemKey(item),
        linkedNo: linkedMatch?.no || "",
        displayDate: item.ticaiDate || item.matchDate || dashboardToday(),
        displayHome: linkedMatch?.home || item.home,
        displayAway: linkedMatch?.away || item.away,
        displayGroup: linkedMatch ? `${linkedMatch.group}组` : item.league || "竞彩",
        score,
        displayScore: score,
        liveHalfScore: liveScore?.halfScore || "",
        liveSource: liveScore?.source || "",
        sourceType: score ? "finished" : "live",
        poolTone: score ? "finished" : pendingResult ? "open" : "live",
        status: score ? "已完赛" : inferredLiveText(item.statusName, kickoffAt),
        liveNote: score ? "" : inferredLiveNote(item.statusName, kickoffAt),
        pendingResultNote: pendingResult ? inferredLiveNote(item.statusName, kickoffAt) : "",
      };
    })
    .filter((item) => item.poolTone === "live" || item.pendingResultNote);

  const liveOpenItems = openItems.filter((item) => item.poolTone === "live" || (item.pendingResultNote && itemMatchesDateSet(item, recentPoolDates)));
  if (activeSportteryPoolView === "finished") return finishedItems;
  if (activeSportteryPoolView === "live") return uniqueSportteryRows([...liveResultItems, ...liveOpenItems]);
  return visibleOpenItems;
}

function sportteryPoolCard(item) {
  const linked = Boolean(item.linkedNo);
  const cardKey = encodeURIComponent(item.sportteryKey || sportteryItemKey(item));
  const detailHref = `#sporttery-match-${cardKey}`;
  const handicap = item.handicap || "0";
  const normalText = item.normal
    ? `胜 ${item.normal.win} · 平 ${item.normal.draw} · 负 ${item.normal.lose}`
    : `让球 ${handicap}`;
  const score = normalizeResultScore(item.score);
  const displayScore = normalizeResultScore(item.displayScore) || score;
  const isLive = item.poolTone === "live";
  const statusLine = isLive ? item.status || "进行中" : item.status;
  const marketText = item.sourceType === "finished"
    ? `半场 ${item.halfScore || "-"} · ${item.result || direction(score) || "-"}`
    : item.sourceType === "live"
      ? item.liveScore
        ? `半场 ${item.liveHalfScore || "-"} · ${item.liveSource || "实时比分源"}`
        : item.liveNote || "实时源未匹配，等待官方比分回填"
      : isLive
        ? item.liveScore
          ? `半场 ${item.liveHalfScore || "-"} · ${item.liveSource || "实时比分源"}`
          : "实时源未匹配，等待官方比分回填"
        : item.pendingResultNote || normalText;
  return `
    <article class="match-card sporttery-card ${score ? "finished" : ""} ${isLive ? "is-live" : ""}" data-sporttery-match-key="${cardKey}" ${linked ? `data-pool-match-no="${item.linkedNo}"` : ""}>
      <div class="match-meta">
        <span>${item.issue || item.no} · ${item.displayGroup}</span>
        <span>${formatDate(item.displayDate)}</span>
      </div>
      <div class="teams">
        <strong>${item.displayHome}</strong>
        <b>${displayScore || (isLive ? "LIVE" : "vs")}</b>
        <strong>${item.displayAway}</strong>
      </div>
      <div class="match-card-insight">
        <strong>${statusLine}</strong>
        <em>${marketText}</em>
      </div>
      <div class="card-foot">
        <span>${item.league || "体彩"}</span>
        <a class="sporttery-detail-link" href="${detailHref}" data-sporttery-match-key="${cardKey}">进入体彩详情 ›</a>
      </div>
    </article>
  `;
}

function renderSportteryPool() {
  const target = document.querySelector("#sporttery-pool-grid");
  if (!target) return;
  const items = sportteryPoolItems();
  cacheSportteryPoolItems(items);
  const grouped = items.reduce((acc, item) => {
    if (!acc.has(item.displayDate)) acc.set(item.displayDate, []);
    acc.get(item.displayDate).push(item);
    return acc;
  }, new Map());
  const lockedCount = items.filter((item) => sportteryPredictionForItem(item)).length;
  const countNode = document.querySelector("#sporttery-pool-count");
  const labelNode = document.querySelector("#sporttery-pool-label");
  const sourceNode = document.querySelector("#sporttery-source");
  document.querySelectorAll("[data-pool-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.poolView === activeSportteryPoolView);
  });
  if (countNode) countNode.textContent = `${items.length} 场`;
  if (labelNode) {
    const labelMap = {
      open: `${lockedCount}/${items.length} 已锁版`,
      live: `${items.length} 场实时`,
      finished: `${items.length} 场完赛`,
    };
    labelNode.textContent = labelMap[activeSportteryPoolView] || `${lockedCount}/${items.length} 已锁版`;
  }
  if (sourceNode) {
    const stamp = oddsData.lastUpdateTime || formatCapturedAt(oddsData.importedAt) || "等待刷新";
    const source = oddsData.isCloudSnapshot ? "Cloudflare D1 云端数据" : oddsData.isLiveSnapshot ? "体彩官方实时接口" : "本地静态兜底";
    const resultStamp = formatCapturedAt(resultsData.importedAt);
    const resultSource = resultsData.isCloudSnapshot
      ? "Cloudflare D1 云端赛果"
      : resultsData.isStaticFallback
        ? "本地赛果静态兜底"
        : "体彩官方赛果接口";
    const liveStamp = formatCapturedAt(liveFootballData.importedAt);
    const liveSource = liveFootballData.isCloudSnapshot
      ? "Cloudflare D1 实时比分"
      : liveFootballData.isStaticFallback
        ? "本地实时比分静态兜底"
        : "football-data/APIfootball 实时比分";
    sourceNode.textContent =
      activeSportteryPoolView === "finished"
        ? `数据源：${resultSource} · ${resultStamp || "已有快照"}`
        : activeSportteryPoolView === "live"
          ? `数据源：${source} + ${liveSource} · ${liveStamp || stamp}`
          : `数据源：${source} · ${stamp}`;
  }
  target.innerHTML = grouped.size
    ? [...grouped.entries()]
        .map(
          ([date, groupItems]) => `
            <section class="day-lane">
              <div class="day-lane-head">
                <div>
                  <span>${formatDate(date)}</span>
                  <strong>${groupItems.length} 场${activeSportteryPoolView === "finished" ? "完赛" : activeSportteryPoolView === "live" ? "实时" : "开盘"}</strong>
                </div>
                <em>${groupItems.filter((item) => sportteryPredictionForItem(item)).length}/${groupItems.length} 已锁版</em>
              </div>
              <div class="match-grid">${groupItems.map(sportteryPoolCard).join("")}</div>
            </section>
          `
        )
        .join("")
    : !cloudBootstrapAttempted && !oddsData.matches?.length
      ? dataLoadingMarkup("正在同步赛事池", "正在读取 Cloudflare D1 开盘、赛果和实时比分数据。")
    : `<p class='empty'>暂无${activeSportteryPoolView === "finished" ? "今日已完赛" : activeSportteryPoolView === "live" ? "正在比赛中" : "体彩开盘"}赛事</p>`;
}

function formatCapturedAt(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataLoadingMarkup(title = "正在同步云端数据", detail = "正在读取 Cloudflare D1 最新数据，稍后会自动显示。") {
  return `
    <section class="data-loading-panel" aria-live="polite">
      <div>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <strong>${title}</strong>
      <p>${detail}</p>
    </section>
  `;
}

function rerenderOddsSurfaces() {
  applyResultBackfill();
  refreshRuntimeCaseBase();
  renderHome();
  renderSportteryPool();
  renderSiteLocks();
  renderOddsMap();
  renderSignals();
  renderStats();
  renderGlobalStats();
  const match = window.location.hash.match(/^#match-(.+)$/);
  if (match) renderMatchDetail(match[1]);
  const sportteryMatch = window.location.hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
}

function renderCurrentRouteSurfaces() {
  applyResultBackfill();
  refreshRuntimeCaseBase();
  const hash = window.location.hash || "";
  const match = hash.match(/^#match-(.+)$/);
  if (match) {
    renderMatchDetail(match[1]);
    return;
  }
  const sportteryMatch = hash.match(/^#sporttery-match-(.+)$/);
  if (sportteryMatch) {
    renderSportteryMatchDetail(decodeURIComponent(sportteryMatch[1]));
    return;
  }
  if (hash === "#model-stats") {
    renderGlobalStats();
    return;
  }
  if (hash === "#sporttery") {
    renderSportteryPool();
    return;
  }
  if (hash === "#locks") {
    renderSiteLocks();
    return;
  }
  if (hash === "#odds-map") {
    renderOddsMap();
    return;
  }
  if (hash === "#worldcup") {
    renderSignals();
    renderSchedule();
    return;
  }
  if (hash === "#worldcup-knockout") {
    history.replaceState("", document.title, `${window.location.pathname}${window.location.search}#worldcup`);
    renderSignals();
    renderSchedule();
    return;
  }
  if (hash === "#model-intro" || hash === "#about") {
    return;
  }
  if (!hash) {
    renderInitialHomeOnly();
    return;
  }
  renderAll();
}
