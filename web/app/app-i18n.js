// app-i18n.js — explicit, render-bound localization without DOM observers.
(function () {
  const STORAGE_KEY = "ticai_ui_locale_v2";
  const VERSION = "20260717_postponed_lifecycle_v1";
  const SUPPORTED = ["zh-CN", "ja", "en"];
  const TITLES = {
    "zh-CN": "体彩足彩模型中心",
    ja: "スポーツくじ・サッカーモデル",
    en: "Sporttery Football Model Center",
  };
  const LANGUAGE_LABELS = { "zh-CN": "中文", ja: "日本語", en: "English" };
  const dictionaries = { "zh-CN": {} };
  const textState = new WeakMap();
  const attrState = new WeakMap();
  let locale = "zh-CN";
  let scheduled = false;
  let requestSequence = 0;
  let lastMetrics = { nodes: 0, durationMs: 0 };

  function preferredLocale() {
    const query = new URLSearchParams(window.location.search).get("lang");
    if (SUPPORTED.includes(query)) return query;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
    return "zh-CN";
  }

  async function loadDictionary(nextLocale) {
    if (dictionaries[nextLocale]) return dictionaries[nextLocale];
    const response = await fetch(`/i18n/${nextLocale}.json?v=${VERSION}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`locale dictionary ${response.status}`);
    dictionaries[nextLocale] = await response.json();
    return dictionaries[nextLocale];
  }

  function dynamicTranslation(value) {
    if (locale === "zh-CN") return value;
    const dict = dictionaries[locale] || {};
    const leading = value.match(/^\s*/)?.[0] || "";
    const trailing = value.match(/\s*$/)?.[0] || "";
    const plain = value.trim().replace(/\s+/g, " ");
    if (!plain) return value;
    if (dict[plain]) return `${leading}${dict[plain]}${trailing}`;
    let translated = plain;
    if (locale === "ja") {
      translated = translated
        .replace(/(\d+)\s*场开盘/g, "$1 試合")
        .replace(/(\d+)\s*场实时/g, "$1 試合ライブ")
        .replace(/(\d+)\s*场/g, "$1 試合")
        .replace(/(\d+)月(\d+)日/g, "$1月$2日")
        .replace(/距离开赛/g, "開始まで")
        .replace(/北京时间/g, "北京時間");
    } else {
      translated = translated
        .replace(/(\d+)\s*场开盘/g, "$1 open matches")
        .replace(/(\d+)\s*场实时/g, "$1 live matches")
        .replace(/(\d+)\s*场/g, "$1 matches")
        .replace(/(\d+)月(\d+)日/g, "$1/$2")
        .replace(/距离开赛/g, "Kickoff in")
        .replace(/北京时间/g, "Beijing Time");
    }
    return translated === plain ? value : `${leading}${translated}${trailing}`;
  }

  function translateTextNode(node) {
    const current = node.nodeValue || "";
    if (!/\S/.test(current) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement?.tagName)) return 0;
    let state = textState.get(node);
    if (!state || current !== state.applied) state = { source: current, applied: current };
    const next = locale === "zh-CN" ? state.source : dynamicTranslation(state.source);
    if (current !== next) node.nodeValue = next;
    textState.set(node, { source: state.source, applied: next });
    return 1;
  }

  function translateAttributes(element) {
    const attributes = ["aria-label", "title", "placeholder"];
    let states = attrState.get(element);
    if (!states) states = {};
    attributes.forEach((name) => {
      if (!element.hasAttribute(name)) return;
      const current = element.getAttribute(name) || "";
      const previous = states[name];
      const source = !previous || current !== previous.applied ? current : previous.source;
      const next = locale === "zh-CN" ? source : dynamicTranslation(source);
      if (current !== next) element.setAttribute(name, next);
      states[name] = { source, applied: next };
    });
    attrState.set(element, states);
  }

  function activeRoots() {
    const content = document.body.classList.contains("home-mode")
      ? document.querySelector("#main-content")
      : document.querySelector(".panel.active-panel");
    return [...new Set([
      document.querySelector(".home-topbar"),
      content,
      document.querySelector(".site-footer"),
      ...document.querySelectorAll(".global-stats-modal, .odds-backtest-modal, #model-notice"),
    ].filter(Boolean))];
  }

  function refresh(root) {
    const startedAt = performance.now();
    const roots = root ? [root] : activeRoots();
    let nodes = 0;
    roots.forEach((target) => {
      if (target.nodeType === Node.TEXT_NODE) {
        nodes += translateTextNode(target);
        return;
      }
      if (target.nodeType !== Node.ELEMENT_NODE && target.nodeType !== Node.DOCUMENT_NODE) return;
      if (target.nodeType === Node.ELEMENT_NODE) translateAttributes(target);
      target.querySelectorAll?.("[aria-label], [title], [placeholder]").forEach(translateAttributes);
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes += translateTextNode(walker.currentNode);
    });
    document.documentElement.lang = locale;
    if (typeof isSportteryDetailRoute !== "function" || !isSportteryDetailRoute()) {
      document.title = TITLES[locale];
    }
    lastMetrics = { nodes, durationMs: Number((performance.now() - startedAt).toFixed(2)) };
    return lastMetrics;
  }

  function schedule(root) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh(root);
    });
  }

  function updateControls(busy = false) {
    document.querySelectorAll("[data-language-option]").forEach((button) => {
      const active = button.dataset.languageOption === locale;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.disabled = busy;
    });
    const current = document.querySelector("[data-language-current]");
    if (current) current.textContent = LANGUAGE_LABELS[locale];
    const toggle = document.querySelector("[data-language-toggle]");
    if (toggle) toggle.disabled = busy;
    document.querySelector(".language-switcher")?.setAttribute("aria-busy", String(busy));
  }

  function setMenuOpen(open) {
    const toggle = document.querySelector("[data-language-toggle]");
    const menu = document.querySelector(".language-menu");
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  }

  async function setLocale(nextLocale, options = {}) {
    if (!SUPPORTED.includes(nextLocale)) return false;
    const sequence = ++requestSequence;
    updateControls(true);
    try {
      await loadDictionary(nextLocale);
      if (sequence !== requestSequence) return false;
      locale = nextLocale;
      if (options.persist !== false) localStorage.setItem(STORAGE_KEY, locale);
      if (options.updateUrl !== false) {
        const url = new URL(window.location.href);
        if (locale === "zh-CN") url.searchParams.delete("lang");
        else url.searchParams.set("lang", locale);
        history.replaceState(history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
      }
      updateControls(false);
      refresh();
      window.dispatchEvent(new CustomEvent("ticai:localechange", { detail: { locale } }));
      return true;
    } catch (error) {
      console.warn("语言资源加载失败，保留当前语言。", error);
      updateControls(false);
      return false;
    }
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-language-toggle]");
    if (toggle) {
      setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
      return;
    }
    const button = event.target.closest("[data-language-option]");
    if (button) {
      setMenuOpen(false);
      setLocale(button.dataset.languageOption);
      return;
    }
    if (!event.target.closest(".language-switcher")) setMenuOpen(false);
    schedule();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuOpen(false);
  });
  document.addEventListener("change", () => schedule());
  window.addEventListener("hashchange", () => schedule());
  window.addEventListener("popstate", () => schedule());

  window.WC_I18N = {
    get locale() { return locale; },
    get metrics() { return { ...lastMetrics }; },
    refresh,
    schedule,
    setLocale,
    t: dynamicTranslation,
  };
  setLocale(preferredLocale(), { persist: false, updateUrl: false });
})();
