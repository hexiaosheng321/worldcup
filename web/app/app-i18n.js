// app-i18n.js — lightweight, non-destructive UI localization.
(function () {
  const STORAGE_KEY = "ticai_ui_locale_v1";
  const supported = ["zh-CN", "ja", "en"];
  const dictionaries = {
    ja: {
      "足彩 AI · 体彩模型": "Football AI · スポーツくじモデル",
      "首页": "ホーム", "赛事池": "試合一覧", "赛事推演锁版": "予測ロック", "世界杯": "ワールドカップ",
      "模型介绍": "モデル概要", "盘口图谱": "オッズマップ", "统计和回测研究": "統計・バックテスト", "关于本站": "このサイト",
      "体彩足彩 · 全赛事模型工作台": "スポーツくじ · 全試合モデルワークベンチ",
      "足彩直觉，真的成立吗？": "サッカーの直感は本当に正しいのか？", "用回测说话": "バックテストで検証",
      "竞彩足球、北京单场、胜负彩和杯赛专题统一进入一套流程：赛程抓取、盘口快照、赛前锁版、赛后验票。 不承诺必胜，只把数据依据、判断逻辑和赛后复盘讲清楚。": "公式スポーツくじ、単試合、プール式予測、カップ戦を同じ流れで分析します：日程取得、オッズ保存、試合前ロック、試合後検証。的中を保証せず、データ、判断根拠、振り返りを公開します。",
      "进入世界杯专题": "ワールドカップ特集", "查看赛事池": "試合一覧を見る", "距下场比赛": "次の試合まで",
      "时": "時", "分": "分", "秒": "秒", "今日 / 即将开赛": "本日 / まもなく開始", "进入完整赛程 →": "全日程へ →",
      "数据和模型研究引擎": "データ・モデル研究エンジン", "查看模型说明 →": "モデル説明 →",
      "2026 世界杯模型控制室": "2026 ワールドカップ・モデル管理室", "进球轨道": "ゴールトラック", "比分实验室": "スコア分析",
      "体彩开盘赛程": "スポーツくじ対象試合", "今日开盘": "本日発売", "正在比赛": "ライブ", "今日已完赛": "本日終了",
      "数据源：体彩官方开盘快照": "データ：公式オッズスナップショット", "排序方式": "並び順", "最新在前": "新着順", "按锁版日期和场次倒序": "ロック日時の新着順",
      "快速判断": "クイック判定", "完整推演": "完全分析", "锁版结论": "ロック結論", "当前比分": "現在のスコア", "单选": "本命", "预测": "予測",
      "判断风险": "判定リスク", "比赛状态": "試合状況", "建议动作": "推奨アクション", "模型版本": "モデル版", "总进球": "合計ゴール",
      "胜": "ホーム勝", "平": "引き分け", "负": "アウェイ勝", "让胜": "ハンデ勝", "让平": "ハンデ引分", "让负": "ハンデ負",
      "可选": "選択可", "主打": "本命", "谨慎": "慎重", "跳过": "見送り", "观察": "様子見", "返回赛事池": "試合一覧に戻る",
      "赛前盘口雷达": "試合前オッズレーダー", "SP漂移回测": "SP変動バックテスト", "数据状态": "データ状況", "最大化查看": "最大表示",
      "全部日期": "全期間", "近7天": "直近7日", "近15天": "直近15日", "回测明细表": "バックテスト詳細",
      "待锁版": "未ロック", "已有推演": "予測済み", "距离开赛": "開始まで", "进行中": "試合中", "待回填": "結果待ち"
    },
    en: {
      "足彩 AI · 体彩模型": "Football AI · Sporttery Model",
      "首页": "Home", "赛事池": "Match Pool", "赛事推演锁版": "Locked Predictions", "世界杯": "World Cup",
      "模型介绍": "Model", "盘口图谱": "Odds Map", "统计和回测研究": "Stats & Backtests", "关于本站": "About",
      "体彩足彩 · 全赛事模型工作台": "Sporttery Football · All-Match Model Workbench",
      "足彩直觉，真的成立吗？": "Does football intuition really hold up?", "用回测说话": "Let backtests decide",
      "竞彩足球、北京单场、胜负彩和杯赛专题统一进入一套流程：赛程抓取、盘口快照、赛前锁版、赛后验票。 不承诺必胜，只把数据依据、判断逻辑和赛后复盘讲清楚。": "Official pools, single-match markets and cup competitions follow one workflow: fixture ingestion, odds snapshots, pre-match locks and post-match review. We do not promise wins; we publish the data, reasoning and verified results.",
      "进入世界杯专题": "World Cup Hub", "查看赛事池": "View Match Pool", "距下场比赛": "Next match in",
      "时": "hr", "分": "min", "秒": "sec", "今日 / 即将开赛": "Today / Upcoming", "进入完整赛程 →": "Full schedule →",
      "数据和模型研究引擎": "Data & Model Research Engine", "查看模型说明 →": "Model methodology →",
      "2026 世界杯模型控制室": "2026 World Cup Model Control Room", "进球轨道": "Goal Track", "比分实验室": "Score Lab",
      "体彩开盘赛程": "Sporttery Fixtures", "今日开盘": "Open Today", "正在比赛": "Live", "今日已完赛": "Finished Today",
      "数据源：体彩官方开盘快照": "Source: official Sporttery odds snapshot", "排序方式": "Sort", "最新在前": "Newest first", "按锁版日期和场次倒序": "By lock date and match number",
      "快速判断": "Quick View", "完整推演": "Full Projection", "锁版结论": "Locked Decision", "当前比分": "Current Score", "单选": "Primary Pick", "预测": "Prediction",
      "判断风险": "Decision Risks", "比赛状态": "Match Status", "建议动作": "Suggested Action", "模型版本": "Model Version", "总进球": "Total Goals",
      "胜": "Home Win", "平": "Draw", "负": "Away Win", "让胜": "Handicap Win", "让平": "Handicap Draw", "让负": "Handicap Loss",
      "可选": "Optional", "主打": "Primary", "谨慎": "Cautious", "跳过": "Skip", "观察": "Observe", "返回赛事池": "Back to Match Pool",
      "赛前盘口雷达": "Pre-match Odds Radar", "SP漂移回测": "SP Movement Backtest", "数据状态": "Data Status", "最大化查看": "Maximize",
      "全部日期": "All Dates", "近7天": "Last 7 Days", "近15天": "Last 15 Days", "回测明细表": "Backtest Details",
      "待锁版": "Not Locked", "已有推演": "Projected", "距离开赛": "Kickoff in", "进行中": "Live", "待回填": "Awaiting Result"
    }
  };

  const requestedLocale = new URLSearchParams(window.location.search).get("lang");
  let locale = supported.includes(requestedLocale)
    ? requestedLocale
    : supported.includes(localStorage.getItem(STORAGE_KEY))
      ? localStorage.getItem(STORAGE_KEY)
      : "zh-CN";
  let translating = false;

  function translateValue(value) {
    if (locale === "zh-CN" || !value) return value;
    const dict = dictionaries[locale] || {};
    const trimmed = value.trim();
    const canonical = trimmed.replace(/\s+/g, " ");
    if (dict[canonical]) return `${value.match(/^\s*/)?.[0] || ""}${dict[canonical]}${value.match(/\s*$/)?.[0] || ""}`;
    return value
      .replace(/(\d+)\s*场开盘/g, locale === "ja" ? "$1 試合" : "$1 open matches")
      .replace(/(\d+)\s*场/g, locale === "ja" ? "$1 試合" : "$1 matches")
      .replace(/(\d+)月(\d+)日/g, locale === "ja" ? "$1月$2日" : "$1/$2");
  }

  function translateNode(root) {
    if (translating || !root) return;
    translating = true;
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    else if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return /\S/.test(node.nodeValue || "") && !["SCRIPT", "STYLE"].includes(node.parentElement?.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      if (!node.__zhSource) node.__zhSource = node.nodeValue;
      node.nodeValue = locale === "zh-CN" ? node.__zhSource : translateValue(node.__zhSource);
    });
    document.documentElement.lang = locale;
    document.title = locale === "ja" ? "スポーツくじ・サッカーモデル" : locale === "en" ? "Sporttery Football Model Center" : "体彩足彩模型中心";
    translating = false;
  }

  function setLocale(next) {
    if (!supported.includes(next)) return;
    locale = next;
    localStorage.setItem(STORAGE_KEY, locale);
    document.querySelectorAll("[data-language-option]").forEach((button) => button.classList.toggle("active", button.dataset.languageOption === locale));
    translateNode(document.body);
    window.dispatchEvent(new CustomEvent("ticai:localechange", { detail: { locale } }));
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-language-option]");
    if (button) setLocale(button.dataset.languageOption);
  });
  const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach(translateNode)));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.WC_I18N = { get locale() { return locale; }, setLocale, t: translateValue, translate: translateNode };
  setLocale(locale);
})();
