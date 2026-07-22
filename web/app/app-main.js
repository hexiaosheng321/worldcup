// app-main.js — 初始化、路由、Analytics
function renderAll() {
  applyResultBackfill();
  renderHome();
  renderSignals();
  renderSportteryPool();
  renderSiteLocks();
  renderGlobalStats();
  renderOddsMap();
  renderSchedule();
  renderPath();
  renderKnockout();
  renderStats();
}

function renderInitialHomeOnly() {
  applyResultBackfill();
  renderHome();
  renderSignals();
}

function renderPanelForTab(tabName) {
  if (tabName === "path") renderPath();
  else if (tabName === "knockout") renderKnockout();
  else if (tabName === "schedule") renderSchedule();
  else if (tabName === "stats") renderStats();
  else if (tabName === "sporttery-pool") renderSportteryPool();
  else if (tabName === "site-locks") renderSiteLocks();
  else if (tabName === "model-stats") renderGlobalStats();
  else if (tabName === "odds-map") renderOddsMap();
}

function runWhenPageIdle(task, timeout = 2200) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout });
    return;
  }
  setTimeout(task, Math.min(timeout, 1200));
}

function currentRouteNeedsWorldCupStaticData() {
  const hash = window.location.hash || "";
  return hash === "#model-stats" || hash === "#worldcup" || hash === "#worldcup-knockout" || /^#match-/.test(hash);
}

function currentRouteNeedsCloudBootstrap() {
  const hash = window.location.hash || "";
  return hash === "#worldcup" || hash === "#worldcup-knockout" || hash === "#sporttery" || hash === "#locks" || hash === "#model-stats" || hash === "#odds-map" || isSportteryDetailRoute();
}

function currentRouteNeedsFullCloudBootstrap() {
  const hash = window.location.hash || "";
  return hash === "#worldcup" || hash === "#worldcup-knockout" || hash === "#model-stats" || hash === "#odds-map";
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    renderPanelForTab(tab.dataset.tab);
    activateTab(tab.dataset.tab);
  });
});

homeEnters.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#worldcup") {
      window.location.hash = "worldcup";
      return;
    }
    showDashboard();
    renderPanelForTab("path");
    activateTab("schedule");
  });
});

siteHome?.addEventListener("click", () => {
  if (window.location.hash || isSportteryDetailRoute()) {
    history.pushState("", document.title, `/${window.location.search || ""}`);
    handleClientRouteChange();
    return;
  }
  showHome();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

sportteryPoolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#sporttery") {
      window.location.hash = "sporttery";
      return;
    }
    renderPanelForTab("sporttery-pool");
    activateTab("sporttery-pool");
  });
});

siteLocksButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#locks") {
      window.location.hash = "locks";
      return;
    }
    renderPanelForTab("site-locks");
    activateTab("site-locks");
  });
});

modelIntroButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#model-intro") {
      window.location.hash = "model-intro";
      return;
    }
    activateTab("model-intro");
  });
});

modelStatsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#model-stats") {
      window.location.hash = "model-stats";
      return;
    }
    renderPanelForTab("model-stats");
    activateTab("model-stats");
  });
});

oddsMapButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#odds-map") {
      window.location.hash = "odds-map";
      return;
    }
    renderPanelForTab("odds-map");
    activateTab("odds-map");
  });
});

aboutSiteButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.location.hash !== "#about") {
      window.location.hash = "about";
      return;
    }
    activateTab("about-site");
  });
});

document.addEventListener(
  "click",
  (event) => {
    const sportteryCard = event.target.closest("[data-sporttery-match-key], [data-home-sporttery-key]");
    if (!sportteryCard) return;
    const key = sportteryCard.dataset.sportteryMatchKey || sportteryCard.dataset.homeSportteryKey;
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    openSportteryMatchPage(key);
  },
  true
);

document.querySelector(".home-screen")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-home-match-no], [data-home-sporttery-key]");
  if (!card) return;
  if (card.dataset.homeSportteryKey) {
    openSportteryMatchPage(card.dataset.homeSportteryKey);
    return;
  }
  openMatchPage(card.dataset.homeMatchNo);
});

document.querySelector(".home-countdown-card")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.currentTarget.click();
});

document.querySelector("#sporttery-pool")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-pool-view]");
  if (viewButton) {
    activeSportteryPoolView = viewButton.dataset.poolView || "open";
    renderSportteryPool();
    return;
  }
  const card = event.target.closest("[data-sporttery-match-key]");
  if (!card) return;
  openSportteryMatchPage(card.dataset.sportteryMatchKey);
});

document.querySelector("#knockout")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-knockout-match]");
  if (!card) return;
  openMatchPage(card.dataset.knockoutMatch, "knockout");
});

document.querySelector("#odds-map")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-odds-map-view]");
  if (viewButton) {
    activeOddsMapView = viewButton.dataset.oddsMapView || "pre";
    renderOddsMap();
    return;
  }
  const summaryButton = event.target.closest("[data-odds-signal-summary]");
  if (summaryButton) {
    openOddsSignalSummaryModal(summaryButton.dataset.oddsSignalSummary);
    return;
  }
  const detailButton = event.target.closest("[data-odds-backtest-detail]");
  if (detailButton) {
    openOddsBacktestModal(detailButton.dataset.oddsBacktestDetail);
  }
});

document.body.addEventListener("click", (event) => {
  const r15BacktestOpen = event.target.closest("[data-r15-backtest-open]");
  if (r15BacktestOpen) {
    openR15BacktestModal();
    return;
  }
  const r15DailyReviewOpen = event.target.closest("[data-r15-daily-review-open]");
  if (r15DailyReviewOpen) {
    openR15DailyReviewModal();
    return;
  }
  const globalStatsModal = event.target.closest(".global-stats-modal");
  const globalStatsClose = event.target.closest("[data-global-stats-close]");
  const globalStatsBackdrop = event.target.classList?.contains("global-stats-modal") ? event.target : null;
  if (globalStatsClose || globalStatsBackdrop) {
    (globalStatsClose?.closest(".global-stats-modal") || globalStatsBackdrop)?.remove();
    return;
  }
  if (globalStatsModal) {
    const sportteryButton = event.target.closest("[data-review-open-sporttery]");
    if (sportteryButton) {
      document.querySelectorAll(".global-stats-modal").forEach((modal) => modal.remove());
      openSportteryMatchPage(sportteryButton.dataset.reviewOpenSporttery, "model-stats");
      return;
    }
    const matchButton = event.target.closest("[data-review-open-match]");
    if (matchButton) {
      document.querySelectorAll(".global-stats-modal").forEach((modal) => modal.remove());
      openMatchPage(matchButton.dataset.reviewOpenMatch, "model-stats");
      return;
    }
  }
  const closeButton = event.target.closest("[data-odds-backtest-close]");
  const modalBackdrop = event.target.classList?.contains("odds-backtest-modal") ? event.target : null;
  if (closeButton || modalBackdrop) {
    document.querySelector(".odds-backtest-modal")?.remove();
    return;
  }
  const detailButton = event.target.closest("[data-odds-open-detail]");
  if (detailButton) {
    document.querySelector(".odds-backtest-modal")?.remove();
    openSportteryMatchPage(detailButton.dataset.oddsOpenDetail, "odds-map");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelector(".odds-backtest-modal")?.remove();
    document.querySelector(".global-stats-modal")?.remove();
  }
});

document.querySelector("#site-locks")?.addEventListener("click", (event) => {
  const sportteryCard = event.target.closest("[data-lock-sporttery]");
  if (sportteryCard) {
    openSportteryMatchPage(sportteryCard.dataset.lockSporttery, "locks");
    return;
  }
  const worldCupCard = event.target.closest("[data-lock-worldcup]");
  if (worldCupCard) {
    openMatchPage(worldCupCard.dataset.lockWorldcup, "locks");
  }
});

document.querySelector("#global-stats-table")?.addEventListener("change", (event) => {
  const leagueSelect = event.target.closest("[data-global-stats-league]");
  const dateSelect = event.target.closest("[data-global-stats-date]");
  if (leagueSelect) {
    activeGlobalStatsLeague = leagueSelect.value;
  } else if (dateSelect) {
    activeGlobalStatsDate = dateSelect.value;
  } else {
    return;
  }
  renderGlobalStats();
});

document.querySelector("#global-stats-table")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-global-stats-maximize]")) {
    openGlobalStatsModal();
    return;
  }
  const sportteryButton = event.target.closest("[data-review-open-sporttery]");
  if (sportteryButton) {
    openSportteryMatchPage(sportteryButton.dataset.reviewOpenSporttery, "model-stats");
    return;
  }
  const matchButton = event.target.closest("[data-review-open-match]");
  if (!matchButton) return;
  openMatchPage(matchButton.dataset.reviewOpenMatch, "model-stats");
});

document.querySelector("#schedule")?.addEventListener("click", (event) => {
  const maximizeButton = event.target.closest("[data-goal-trend-maximize]");
  if (!maximizeButton) return;
  openGoalTrendModal(maximizeButton);
});

document.querySelector("#today-grid")?.addEventListener("click", (event) => {
  const sportteryCard = event.target.closest("[data-sporttery-match-key]");
  if (sportteryCard) {
    openSportteryMatchPage(sportteryCard.dataset.sportteryMatchKey);
    return;
  }
  const card = event.target.closest("[data-match-no]");
  if (!card) return;
  openMatchPage(card.dataset.matchNo);
});

document.querySelector(".signal-strip")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-signal-page]");
  if (!card) return;
  openSignalPage(card.dataset.signalPage);
});

document.querySelector(".signal-strip")?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const card = event.target.closest("[data-signal-page]");
  if (!card) return;
  event.preventDefault();
  openSignalPage(card.dataset.signalPage);
});

document.querySelector("#signal-detail")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-signal-back]")) {
    activateTab("schedule");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const card = event.target.closest("[data-match-no]");
  if (!card) return;
  openMatchPage(card.dataset.matchNo);
});

document.querySelector("#match-detail")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-detail-back]")) {
    closeMatchPage();
    return;
  }
  const mode = event.target.closest("[data-match-mode]");
  if (mode) {
    const root = mode.closest("#match-detail");
    root?.querySelectorAll("[data-match-mode]").forEach((button) => button.classList.toggle("active", button === mode));
    root?.querySelectorAll("[data-match-mode-panel]").forEach((panel) => {
      const active = panel.dataset.matchModePanel === mode.dataset.matchMode;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    if (mode.dataset.matchMode === "full") {
      sendAnalyticsEvent("click_event", { target: "full_projection" });
    }
    return;
  }
  const model = event.target.closest("[data-detail-model]");
  if (model) {
    openModelForMatch(model.dataset.detailModel);
    return;
  }
  const review = event.target.closest("[data-detail-review]");
  if (review) {
    openReviewForMatch(review.dataset.detailReview);
    return;
  }
  if (event.target.closest("[data-detail-global-stats]")) {
    activateTab("model-stats");
  }
});

searchInput?.addEventListener("input", renderSchedule);
statusFilter?.addEventListener("change", renderSchedule);
resetButton?.addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "all";
  renderSchedule();
});

document.querySelector(".schedule-subtabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-view]");
  if (!button) return;
  document.querySelectorAll("[data-schedule-view]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  const view = button.dataset.scheduleView;
  document.querySelector("#schedule-list").hidden = view !== "current";
  document.querySelector("#schedule-2022-list").hidden = view !== "wc2022";
});

function analyticsSessionId() {
  try {
    const key = "fde_analytics_session";
    const current = sessionStorage.getItem(key);
    if (current) return current;
    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return "";
  }
}

function analyticsPagePath() {
  const sportteryKey = currentSportteryRouteKey();
  if (sportteryKey) return canonicalSportteryMatchPath(sportteryKey);
  return `${window.location.pathname || "/"}${window.location.hash || "#home"}`;
}

function sendAnalyticsEvent(eventType = "page_view", payload = {}) {
  const body = JSON.stringify({
    eventType,
    pagePath: analyticsPagePath(),
    pageTitle: document.title || "",
    sessionId: analyticsSessionId(),
    referrer: document.referrer || "",
    route: currentSportteryRouteKey() ? canonicalSportteryMatchPath(currentSportteryRouteKey()) : window.location.hash || "#home",
    ...payload,
  });
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
  } catch {}
  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function handleClientRouteChange({ track = true } = {}) {
  handleRouteFromHash();
  if (currentRouteNeedsWorldCupStaticData()) {
    loadWorldCupStaticDataFallback({ rerender: true });
  }
  if (currentRouteNeedsCloudBootstrap()) {
    loadCloudBootstrapData({ rerender: true, scope: currentRouteNeedsFullCloudBootstrap() ? "full" : "initial" })
      .then(() => syncCloudSportteryResultsIfNeeded({ rerender: true }));
  }
  if (track) sendAnalyticsEvent("page_view");
}

window.addEventListener("hashchange", () => handleClientRouteChange());
window.addEventListener("popstate", () => handleClientRouteChange());

restoreCloudBootstrapCache();
normalizeLegacySportteryRoute();
const initialHash = window.location.hash;
const initialRouteActive = Boolean(initialHash || currentSportteryRouteKey());
if (initialRouteActive) {
  renderCurrentRouteSurfaces();
} else {
  renderInitialHomeOnly();
}
document.body.classList.remove("page-loading"); document.body.classList.add("page-loaded");
handleRouteFromHash();
sendAnalyticsEvent("page_view");
if (currentRouteNeedsCloudBootstrap()) {
  loadCloudBootstrapData({ rerender: true, scope: currentRouteNeedsFullCloudBootstrap() ? "full" : "initial" }).then(async (changed) => {
    const synced = await syncCloudSportteryResultsIfNeeded({ rerender: true });
    if (changed) {
      refreshLiveFootballScoresData({ rerender: true });
      renderCurrentRouteSurfaces();
    } else if (synced) renderCurrentRouteSurfaces();
    scheduleSportterySpHistoryRefresh();
  });
} else if (!initialRouteActive) {
  const liveScoresReady = refreshLiveFootballScoresData({ rerender: false });
  loadCloudBootstrapData({ rerender: false, scope: "initial" }).then(async () => {
    renderCurrentRouteSurfaces();
    syncCloudSportteryResultsIfNeeded({ rerender: false });
    if (await liveScoresReady) renderCurrentRouteSurfaces();
  });
} else {
  runWhenPageIdle(() => {
    loadStaticSnapshotFallback({ rerender: false });
    refreshLiveFootballScoresData({ rerender: false });
  }, 900);
}
if (currentRouteNeedsWorldCupStaticData()) {
  loadWorldCupStaticDataFallback({ rerender: true });
}
runWhenPageIdle(() => loadCloudCaseBaseData({ rerender: initialRouteActive }), initialRouteActive ? 2200 : 3600);
runWhenPageIdle(() => loadFirecrawlEnrichmentData({ rerender: initialRouteActive }), initialRouteActive ? 2600 : 3900);
runWhenPageIdle(() => {
  if (window.location.hash && !currentRouteNeedsWorldCupStaticData()) {
    loadWorldCupStaticDataFallback({ rerender: Boolean(window.location.hash) });
  }
}, initialRouteActive ? 4200 : 2600);

setInterval(refreshSportteryCloudData, 5 * 60 * 1000);

/* ── 返回顶部 ── */
(function(){
  var btn = document.getElementById("back-to-top");
  if (!btn) return;
  var ticking = false;
  window.addEventListener("scroll", function(){
    if (!ticking) {
      requestAnimationFrame(function(){
        btn.classList.toggle("visible", window.scrollY > 400);
        ticking = false;
      });
      ticking = true;
    }
  });
  btn.addEventListener("click", function(){
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();

/* ── 滚动浮现观察器 ── */
(function(){
  if (!window.IntersectionObserver) return;
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach(function(el){ observer.observe(el); });

  /* ── 也观察 panel 内新出现的 .reveal ── */
  var panelObserver = new MutationObserver(function(){
    document.querySelectorAll(".reveal:not(._obs)").forEach(function(el){
      el.classList.add("_obs");
      observer.observe(el);
    });
  });
  panelObserver.observe(document.body, { childList: true, subtree: true });
})();

/* ── 渲染完成后为关键模块添加滚动浮现 ── */
(function addRevealAfterRender(){
  var timer = setInterval(function(){
    if (!document.body.classList.contains("page-loaded")) return;
    clearInterval(timer);
    /* 给动态渲染的卡片/区块加上 .reveal */
    document.querySelectorAll(
      ".home-section-head, " +
      ".home-products article, " +
      ".home-research-grid article, " +
      ".about-mission-card, " +
      ".about-flow article, " +
      ".about-split section, " +
      ".about-section-band, " +
      ".about-note, " +
      ".about-disclaimer, " +
      ".model-version-timeline article, " +
      ".model-contract-grid section, " +
      ".model-evidence-grid article, " +
      ".model-intro-hero, " +
      ".model-stats-hero, " +
      ".site-lock-card, " +
      ".odds-map-hero, " +
      ".odds-radar-summary article, " +
      ".odds-spotlight-card, " +
      ".sp-backtest-grid article, " +
      ".insight-card, " +
      ".stats-overview .stat-box, " +
      ".review-record-table tr, " +
      ".odds-map-record-table tr, " +
      ".global-stats-record-table tr, " +
      ".home-upcoming-grid > button, " +
      ".home-countdown-card"
    ).forEach(function(el){
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });
  }, 100);
})();
