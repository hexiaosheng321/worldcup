// app-data.js — 云端数据加载、缓存、刷新
function normalizeSportteryResultPayload(raw, capturedAt = new Date().toISOString()) {
  const days = raw?.value?.matchInfoList || [];
  const results = days.flatMap((day) =>
    (day.subMatchList || []).map((match) => {
      const score = normalizeResultScore(match.sectionsNo999 || "");
      return {
        orderId: String(match.matchNum || ""),
        issue: match.matchNumStr || "",
        no: compactSportteryNo(match.matchNumStr, match.matchNum),
        ticaiDate: day.matchDate || match.businessDate || match.matchDate || "",
        matchDate: match.matchDate || "",
        kickoffTime: String(match.matchTime || "").slice(0, 5),
        league: match.leagueAbbName || match.leagueAllName || "竞彩",
        matchId: String(match.matchId || ""),
        home: match.homeTeamAbbName || match.homeTeamAllName || "",
        away: match.awayTeamAbbName || match.awayTeamAllName || "",
        statusCode: match.matchStatus || "",
        statusName: match.matchStatusName || "",
        halfScore: String(match.sectionsNo1 || "").replace(":", "-"),
        fullScoreRaw: match.sectionsNo999 || "",
        score,
        result: score ? direction(score) : "",
      };
    })
  );
  return {
    source: "中国体育彩票官方赛果接口",
    apiEndpoint: SPORTTERY_RESULTS_API_URL,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: results.length,
    matchDates: days.map((day) => day.matchDate || day.businessDate).filter(Boolean),
    results,
  };
}

async function refreshSportteryLiveData() {
  try {
    const response = await fetch(SPORTTERY_API_URL, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Sporttery API ${response.status}`);
    const raw = await response.json();
    if (!raw.success) throw new Error(raw.errorMessage || "Sporttery API error");
    const nextData = normalizeSportteryPayload(raw);
    if (!nextData.matches.length) return;
    oddsData = nextData;
    window.LIVE_SPORTTERY_ODDS = nextData;
    renderCurrentRouteSurfaces();
  } catch (error) {
    console.warn("体彩官方实时刷新失败，继续使用当前快照。", error);
    const sourceNode = document.querySelector("#sporttery-source");
    if (sourceNode && oddsData.matches?.length) {
      const stamp = oddsData.lastUpdateTime || formatCapturedAt(oddsData.importedAt) || "已有快照";
      sourceNode.textContent = `数据源：当前快照 · ${stamp} · 刷新失败`;
    }
  }
}

async function refreshSportteryResultsData() {
  try {
    const response = await fetch(SPORTTERY_RESULTS_API_URL, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Sporttery results API ${response.status}`);
    const raw = await response.json();
    if (!raw.success) throw new Error(raw.errorMessage || "Sporttery results API error");
    const nextData = normalizeSportteryResultPayload(raw);
    if (!nextData.results.length) return;
    resultsData = nextData;
    window.LIVE_SPORTTERY_RESULTS = nextData;
    renderCurrentRouteSurfaces();
  } catch (error) {
    console.warn("体彩官方赛果刷新失败，继续使用当前赛果快照。", error);
  }
}

async function refreshSportterySpHistoryData(sourceMatches = oddsData.matches || []) {
  const matchesForHistory = sourceMatches.filter((match) => match.matchId).slice(0, 30);
  if (!matchesForHistory.length) return;
  const capturedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    matchesForHistory.map(async (match) => {
      const url = `${SPORTTERY_FIXED_BONUS_API_URL}?clientCode=3001&matchId=${encodeURIComponent(match.matchId)}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${match.matchId} ${response.status}`);
      const raw = await response.json();
      if (!raw.success) throw new Error(raw.errorMessage || `${match.matchId} API error`);
      return normalizeSportteryHistory(match, raw.value || {});
    })
  );
  const histories = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);
  if (!histories.length) return;
  spHistoryData = {
    source: "中国体育彩票官方 SP 历史接口",
    apiEndpoint: SPORTTERY_FIXED_BONUS_API_URL,
    importedAt: capturedAt,
    isLiveSnapshot: true,
    totalCount: histories.length,
    errors: settled
      .map((item, index) => item.status === "rejected"
        ? { matchId: String(matchesForHistory[index]?.matchId || ""), message: item.reason?.message || "unknown" }
        : null)
      .filter(Boolean),
    matches: histories,
  };
  window.LIVE_SPORTTERY_SP_HISTORY = spHistoryData;
  renderCurrentRouteSurfaces();
}

function oddsMapNeedsSpHistoryRefresh() {
  if (!oddsData.matches?.some((match) => match.matchId)) return false;
  if (!spHistoryData.matches?.length) return true;
  return !oddsMapRows().some((row) => !oddsMapScoreForRow(row)?.score);
}

function scheduleSportterySpHistoryRefresh(delay = 400) {
  if (!oddsMapNeedsSpHistoryRefresh()) return;
  runWhenPageIdle(() => refreshSportterySpHistoryData(oddsData.matches || []), delay);
}

function loadScriptOnce(src) {
  if (dynamicScriptPromises.has(src)) return dynamicScriptPromises.get(src);
  if (document.querySelector(`script[data-dynamic-src="${src}"][data-loaded="true"]`)) return Promise.resolve();
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.dataset.dynamicSrc = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      dynamicScriptPromises.delete(src);
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
  dynamicScriptPromises.set(src, promise);
  return promise;
}

function loadFreshScript(src) {
  const resolvedSrc = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolvedSrc;
    script.dataset.freshSrc = src;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

function markStaticFallback(payload, fallbackSource) {
  return {
    ...payload,
    source: `${payload.source || fallbackSource}（静态兜底）`,
    isCloudSnapshot: false,
    isStaticFallback: true,
  };
}

async function loadWorldCupStaticDataFallback({ rerender = false } = {}) {
  if (data.predictions?.length && data.matches?.length) {
    worldCupStaticDataLoaded = true;
    return false;
  }
  if (worldCupStaticDataPending) {
    const changed = await worldCupStaticDataPending;
    if (rerender) renderCurrentRouteSurfaces();
    return changed;
  }
  const currentData = data;
  worldCupStaticDataPending = (async () => {
    await loadScriptOnce("./data.js");
    if (!window.WC_DATA || window.WC_DATA === currentData) return false;
    Object.assign(currentData, window.WC_DATA);
    window.WC_DATA = currentData;
    matches = mergeWorldCupSportteryMatches(currentData.matches || [], oddsData.matches || []);
    currentData.matches = matches;
    predictionMap.clear();
    (currentData.predictions || []).forEach((item) => predictionMap.set(item.no, item));
    worldCupStaticDataLoaded = Boolean(currentData.predictions?.length && currentData.matches?.length);
    return worldCupStaticDataLoaded;
  })();
  try {
    const changed = await worldCupStaticDataPending;
    if (changed && rerender) renderCurrentRouteSurfaces();
    return changed;
  } finally {
    worldCupStaticDataPending = null;
  }
}

async function loadStaticSnapshotFallback({ rerender = false, force = false } = {}) {
  await Promise.allSettled(STATIC_SNAPSHOT_FALLBACKS.map(loadScriptOnce));
  let changed = false;
  if ((force || !oddsData.matches?.length) && window.LIVE_SPORTTERY_ODDS?.matches?.length) {
    oddsData = markStaticFallback(window.LIVE_SPORTTERY_ODDS, "本地赛事池快照");
    window.LIVE_SPORTTERY_ODDS = oddsData;
    changed = true;
  }
  if (!oddsData.matches?.length && window.OKOOO_ODDS?.matches?.length) {
    oddsData = markStaticFallback(window.OKOOO_ODDS, "本地赔率快照");
    changed = true;
  }
  if (!resultsData.results?.length && window.LIVE_SPORTTERY_RESULTS?.results?.length) {
    resultsData = markStaticFallback(window.LIVE_SPORTTERY_RESULTS, "本地赛果快照");
    window.LIVE_SPORTTERY_RESULTS = resultsData;
    changed = true;
  }
  if (!spHistoryData.matches?.length && window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length) {
    spHistoryData = markStaticFallback(window.LIVE_SPORTTERY_SP_HISTORY, "本地SP历史快照");
    window.LIVE_SPORTTERY_SP_HISTORY = spHistoryData;
    changed = true;
  }
  if (!liveFootballData.matches?.length && window.LIVE_FOOTBALL_SCORES?.matches?.length) {
    liveFootballData = markStaticFallback(window.LIVE_FOOTBALL_SCORES, "本地实时比分快照");
    window.LIVE_FOOTBALL_SCORES = liveFootballData;
    changed = true;
  }
  if (!footballDataContext.matches?.length && window.FOOTBALL_DATA_CONTEXT?.matches?.length) {
    footballDataContext = markStaticFallback(window.FOOTBALL_DATA_CONTEXT, "本地football-data上下文");
    window.FOOTBALL_DATA_CONTEXT = footballDataContext;
    changed = true;
  }
  if (changed && rerender) renderCurrentRouteSurfaces();
  return changed;
}

async function refreshLiveFootballScoresData({ rerender = false } = {}) {
  try {
    await loadFreshScript("/api/live-football-scores.js");
    if (!window.LIVE_FOOTBALL_SCORES?.matches?.length) return false;
    liveFootballData = window.LIVE_FOOTBALL_SCORES;
    if (rerender) renderCurrentRouteSurfaces();
    return true;
  } catch (error) {
    console.warn("实时比分刷新失败，继续使用当前快照。", error);
    return false;
  }
}

function parseCloudJson(text, fallback = null) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function cloudMatchRowsToOddsData(rows = [], capturedAt = new Date().toISOString()) {
  const matchesFromRows = rows
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, null);
      const base = payload?.home && payload?.away
        ? payload
        : {
        orderId: row.match_id || "",
        issue: row.match_code || "",
        no: compactSportteryNo(row.match_code, row.match_id),
        ticaiDate: String(row.kickoff_time || "").slice(0, 10),
        matchDate: String(row.kickoff_time || "").slice(0, 10),
        kickoffTime: String(row.kickoff_time || "").slice(11, 16),
        league: row.league || "竞彩",
        matchId: String(row.match_id || "").replace(/^sporttery-/, ""),
        home: row.home_team || "",
        away: row.away_team || "",
        statusCode: row.status || "",
        score: "",
      };
      const fallback = findOddsRow(oddsData.matches || [], base) || {};
      const kickoffDate = String(row.kickoff_time || "");
      return {
        ...fallback,
        ...base,
        no: base.no || fallback.no || compactSportteryNo(base.issue || row.match_code, base.matchId || row.match_id),
        issue: base.issue || fallback.issue || row.match_code || "",
        ticaiDate: base.ticaiDate || fallback.ticaiDate || kickoffDate.slice(0, 10),
        matchDate: base.matchDate || fallback.matchDate || kickoffDate.slice(0, 10),
        kickoffTime: base.kickoffTime || fallback.kickoffTime || kickoffDate.slice(11, 16),
        matchId: base.matchId || fallback.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
        home: base.home || fallback.home || row.home_team || "",
        away: base.away || fallback.away || row.away_team || "",
      };
    })
    .filter((item) => item.home && item.away);
  return {
    source: "Cloudflare D1 + 中国体育彩票官方接口",
    apiEndpoint: "/api/bootstrap",
    importedAt: capturedAt,
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: matchesFromRows.length,
    lastUpdateTime: capturedAt,
    matchDates: [...new Set(matchesFromRows.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    matches: matchesFromRows.sort(
      (a, b) =>
        String(a.ticaiDate || a.matchDate).localeCompare(String(b.ticaiDate || b.matchDate)) ||
        String(a.issue || a.no).localeCompare(String(b.issue || b.no))
    ),
  };
}

function cloudResultRowsToResultsData(rows = [], matchRows = [], capturedAt = new Date().toISOString()) {
  const matchPayloadById = new Map(
    matchRows.map((row) => [row.match_id, parseCloudJson(row.payload_json, {})])
  );
  const resultsFromRows = rows
    .map((row) => {
      const payload = parseCloudJson(row.payload_json, {});
      const matchPayload = matchPayloadById.get(row.match_id) || {};
      const score = `${row.full_time_home_goals}-${row.full_time_away_goals}`;
      return {
        ...matchPayload,
        ...payload,
        orderId: payload.orderId || matchPayload.orderId || row.match_id,
        issue: payload.issue || matchPayload.issue || "",
        no: payload.no || matchPayload.no || compactSportteryNo(matchPayload.issue, row.match_id),
        ticaiDate: payload.ticaiDate || matchPayload.ticaiDate || String(matchPayload.matchDate || "").slice(0, 10),
        matchDate: payload.matchDate || matchPayload.matchDate || "",
        kickoffTime: payload.kickoffTime || matchPayload.kickoffTime || "",
        league: payload.league || matchPayload.league || "竞彩",
        matchId: payload.matchId || matchPayload.matchId || String(row.match_id || "").replace(/^sporttery-/, ""),
        home: payload.home || matchPayload.home || "",
        away: payload.away || matchPayload.away || "",
        score,
        fullScoreRaw: `${row.full_time_home_goals}:${row.full_time_away_goals}`,
        result: direction(score),
      };
    })
    .filter((item) => item.home && item.away && normalizeResultScore(item.score));
  return {
    source: "Cloudflare D1 + 中国体育彩票官方赛果接口",
    apiEndpoint: "/api/bootstrap",
    importedAt: capturedAt,
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: resultsFromRows.length,
    matchDates: [...new Set(resultsFromRows.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    results: resultsFromRows.sort(
      (a, b) =>
        String(a.ticaiDate || a.matchDate).localeCompare(String(b.ticaiDate || b.matchDate)) ||
        String(a.issue || a.no).localeCompare(String(b.issue || b.no))
    ),
  };
}

function applyCloudBootstrapPayload(payload, { rerender = false, cached = false } = {}) {
  if (!payload?.ok) return false;
  window.WC_CLOUD_BOOTSTRAP = payload;
  const capturedAt =
    payload.matches?.[0]?.updated_at ||
    payload.results?.[0]?.reviewed_at ||
    payload.cases?.[0]?.createdAt ||
    new Date().toISOString();
  let changed = false;
  if (payload.matches?.length) {
    const oldMatches = oddsData.matches || [];
    oddsData = cloudMatchRowsToOddsData(payload.matches, capturedAt);
    const newKeys = new Set((oddsData.matches || []).map((m) => `${m.ticaiDate || ""}|${m.matchId || m.no || ""}`));
    const missingFromOld = oldMatches.filter(
      (m) => !newKeys.has(`${m.ticaiDate || ""}|${m.matchId || m.no || ""}`)
    );
    if (missingFromOld.length) {
      oddsData.matches = [...(oddsData.matches || []), ...missingFromOld];
      oddsData.matchDates = [...new Set([...(oddsData.matchDates || []), ...missingFromOld.map((m) => m.ticaiDate || m.matchDate).filter(Boolean)])].sort();
    }
    if (cached) oddsData.isCachedSnapshot = true;
    window.LIVE_SPORTTERY_ODDS = oddsData;
    changed = true;
  }
  if (payload.results?.length) {
    resultsData = cloudResultRowsToResultsData(payload.results, payload.matches || [], capturedAt);
    if (cached) resultsData.isCachedSnapshot = true;
    window.LIVE_SPORTTERY_RESULTS = resultsData;
    changed = true;
  }
  if (payload.spHistory?.matches?.length) {
    spHistoryData = payload.spHistory;
    if (cached) spHistoryData.isCachedSnapshot = true;
    window.LIVE_SPORTTERY_SP_HISTORY = spHistoryData;
    changed = true;
  }
  if (payload.cases?.length && window.WC_CASE_BASE?.appendCases) {
    if (window.WC_CASE_BASE.appendCases(payload.cases)) {
      runtimeCaseBaseCache = null;
      changed = true;
    }
  }
  if (mergeCloudAutoPredictions(cloudLockRowsToPredictions(payload.locks || []))) {
    changed = true;
  }
  cloudBootstrapLoaded = true;
  if (changed && rerender) renderCurrentRouteSurfaces();
  return changed;
}

function writeCloudBootstrapCache(payload) {
  try {
    const cachePayload = {
      ok: true,
      cachedAt: new Date().toISOString(),
      matches: payload.matches || [],
      locks: payload.locks || [],
      results: payload.results || [],
      spHistory: payload.spHistory || null,
      cases: [],
      autoPredictions: [],
    };
    localStorage.setItem(CLOUD_BOOTSTRAP_CACHE_KEY, JSON.stringify(cachePayload));
  } catch {}
}

function restoreCloudBootstrapCache() {
  try {
    const raw = localStorage.getItem(CLOUD_BOOTSTRAP_CACHE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    return applyCloudBootstrapPayload(payload, { cached: true });
  } catch {
    return false;
  }
}

async function loadCloudBootstrapData({ rerender = false, includeCases = false, scope = "initial" } = {}) {
  if (!window.WC_CLOUD_STORE?.bootstrap) return false;
  const requestedScope = scope || "initial";
  const pendingKey = `${requestedScope}:${includeCases ? "cases" : "base"}`;
  if (cloudBootstrapPending.has(pendingKey)) {
    const changed = await cloudBootstrapPending.get(pendingKey);
    if (rerender) renderCurrentRouteSurfaces();
    return changed;
  }
  const pending = (async () => {
    cloudBootstrapAttempted = true;
    const payload = await window.WC_CLOUD_STORE.bootstrap({ includeCases, scope: requestedScope });
    if (!payload?.ok) return false;
    writeCloudBootstrapCache(payload);
    return applyCloudBootstrapPayload(payload, { rerender, cached: false });
  })();
  cloudBootstrapPending.set(pendingKey, pending);
  try {
    return await pending;
  } finally {
    cloudBootstrapPending.delete(pendingKey);
  }
}

let cloudCaseBaseLoaded = false;

async function loadCloudCaseBaseData({ rerender = false } = {}) {
  if (cloudCaseBaseLoaded || !window.WC_CLOUD_STORE?.listCases || !window.WC_CASE_BASE?.appendCases) return false;
  const payload = await window.WC_CLOUD_STORE.listCases();
  if (!payload?.ok || !payload.cases?.length) return false;
  cloudCaseBaseLoaded = true;
  const added = window.WC_CASE_BASE.appendCases(payload.cases);
  if (added) {
    runtimeCaseBaseCache = null;
    if (rerender) renderCurrentRouteSurfaces();
  }
  return Boolean(added);
}

async function loadCloudSportterySpHistoryData({ rerender = false } = {}) {
  const src = window.location.protocol === "file:"
    ? "https://worldcup-dashboard-4hr.pages.dev/api/live-sporttery-sp-history.js"
    : "/api/live-sporttery-sp-history.js";
  /* 始终尝试云端 API——云端数据比静态快照更新更全 */
  try {
    await loadFreshScript(src);
    if (window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length) {
      spHistoryData = window.LIVE_SPORTTERY_SP_HISTORY;
      if (rerender) renderCurrentRouteSurfaces();
      return true;
    }
  } catch (error) {
    console.warn("Cloudflare SP 历史快照读取失败，尝试静态兜底。", error);
  }
  /* 云端失败或无数据 → 用本地静态 SP 历史快照兜底 */
  if (!window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length) {
    const staticSrc = STATIC_SNAPSHOT_FALLBACKS.find((f) => /sp-history/.test(f));
    if (staticSrc) await loadFreshScript(staticSrc.replace(/\?.*$/, ""));
  }
  if (window.LIVE_SPORTTERY_SP_HISTORY?.matches?.length) {
    spHistoryData = window.LIVE_SPORTTERY_SP_HISTORY;
    if (rerender) renderCurrentRouteSurfaces();
    return true;
  }
  return false;
}

function hasPastUnfilledSportteryMatches() {
  const now = Date.now();
  return (oddsData.matches || []).some((item) => {
    if (verifiedSportteryScore(item)) return false;
    const kickoffAt = parseKickoffAt(item.matchDate || item.ticaiDate, item.kickoffTime);
    return Number.isFinite(kickoffAt) && now - kickoffAt > SPORTTERY_RESULT_SYNC_DELAY_MINUTES * 60 * 1000;
  });
}

function recentSportteryResultSyncChecked() {
  try {
    const checkedAt = Number(localStorage.getItem(SPORTTERY_RESULT_SYNC_THROTTLE_KEY) || 0);
    return Number.isFinite(checkedAt) && Date.now() - checkedAt < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

async function syncCloudSportteryResultsIfNeeded({ force = false, rerender = true } = {}) {
  if (!window.WC_CLOUD_STORE?.syncSportteryResults) return false;
  if (!force && !hasPastUnfilledSportteryMatches()) return false;
  if (!force && recentSportteryResultSyncChecked()) return false;
  try {
    localStorage.setItem(SPORTTERY_RESULT_SYNC_THROTTLE_KEY, String(Date.now()));
  } catch {}
  const synced = await window.WC_CLOUD_STORE.syncSportteryResults({ pages: 5 });
  if (!synced?.ok) return false;
  const changed = await loadCloudBootstrapData({ rerender, scope: "initial" });
  return Boolean(changed || synced.results);
}

async function refreshSportteryCloudData() {
  await loadStaticSnapshotFallback({ force: true, rerender: false });
  const loadedCloud = await loadCloudBootstrapData({ rerender: true });
  await syncCloudSportteryResultsIfNeeded({ rerender: true });
  if (loadedCloud) {
    const loadedSpHistory = await loadCloudSportterySpHistoryData({ rerender: true });
    if (!loadedSpHistory) await loadStaticSnapshotFallback({ rerender: true });
    await refreshLiveFootballScoresData({ rerender: true });
    scheduleSportterySpHistoryRefresh();
    return;
  }
  if (oddsData.isCloudSnapshot || resultsData.isCloudSnapshot || liveFootballData.isCloudSnapshot) {
    await refreshLiveFootballScoresData({ rerender: true });
    renderCurrentRouteSurfaces();
    scheduleSportterySpHistoryRefresh();
    return;
  }
  if (!SPORTTERY_CLOUD_API_URL) {
    await refreshLiveFootballScoresData({ rerender: false });
    await loadStaticSnapshotFallback({ rerender: true });
    renderCurrentRouteSurfaces();
    scheduleSportterySpHistoryRefresh();
    return;
  }
  try {
    const response = await fetch(SPORTTERY_CLOUD_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sporttery cloud API ${response.status}`);
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Sporttery cloud API error");
    let changed = false;
    if (payload.odds?.matches?.length) {
      oddsData = payload.odds;
      window.LIVE_SPORTTERY_ODDS = payload.odds;
      changed = true;
    }
    if (payload.results?.results?.length) {
      resultsData = payload.results;
      window.LIVE_SPORTTERY_RESULTS = payload.results;
      changed = true;
    }
    if (payload.spHistory?.matches?.length) {
      spHistoryData = payload.spHistory;
      window.LIVE_SPORTTERY_SP_HISTORY = payload.spHistory;
      changed = true;
    }
    if (payload.liveFootball?.matches?.length) {
      liveFootballData = payload.liveFootball;
      window.LIVE_FOOTBALL_SCORES = payload.liveFootball;
      changed = true;
    }
    if (await refreshLiveFootballScoresData({ rerender: false })) changed = true;
    if (changed) {
      const sourceNode = document.querySelector("#sporttery-source");
      if (sourceNode) {
        const stamp =
          payload.updatedAt ||
          payload.odds?.lastUpdateTime ||
          formatCapturedAt(payload.odds?.importedAt || payload.results?.importedAt);
        sourceNode.textContent = `数据源：Cloudflare 云端数据同步 · ${stamp || "最新快照"}`;
      }
      renderCurrentRouteSurfaces();
      scheduleSportterySpHistoryRefresh();
    }
  } catch (error) {
    console.warn("Cloudflare 云端数据刷新失败，尝试使用本地静态兜底。", error);
    await loadStaticSnapshotFallback({ rerender: true });
    scheduleSportterySpHistoryRefresh();
  }
}
