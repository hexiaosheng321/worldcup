export const SPORTTERY_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

export function toOdd(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

export function compactNo(matchNumStr = "", matchNum = "") {
  const text = String(matchNumStr || matchNum || "");
  const found = text.match(/(\d{3})$/);
  return found ? found[1] : text.slice(-3).padStart(3, "0");
}

export function normalizeHandicap(goalLine = "") {
  const raw = String(goalLine || "0").trim();
  if (!raw) return "0";
  const numeric = Number(raw.replace("+", ""));
  if (Number.isNaN(numeric)) return raw;
  if (numeric > 0) return `+${numeric}`;
  return String(numeric);
}

export function scoreBucket(home, away) {
  if (home > away) return "胜";
  if (home < away) return "负";
  return "平";
}

export function marketOdds(market) {
  if (!market || !market.h) return null;
  return {
    win: toOdd(market.h),
    draw: toOdd(market.d),
    lose: toOdd(market.a),
  };
}

export function scoreOdds(crs = {}) {
  return Object.entries(crs)
    .flatMap(([key, value]) => {
      if (!value || key.endsWith("f")) return [];
      if (key === "s-1sh" || key === "s1sh") return [{ score: "胜其它", odds: toOdd(value), bucket: "胜" }];
      if (key === "s-1sd" || key === "s1sd") return [{ score: "平其它", odds: toOdd(value), bucket: "平" }];
      if (key === "s-1sa" || key === "s1sa") return [{ score: "负其它", odds: toOdd(value), bucket: "负" }];
      const found = key.match(/^s(\d{2})s(\d{2})$/);
      if (!found) return [];
      const home = Number(found[1]);
      const away = Number(found[2]);
      return [{ score: `${home}:${away}`, odds: toOdd(value), bucket: scoreBucket(home, away) }];
    })
    .sort((a, b) => Number(a.odds) - Number(b.odds))
    .slice(0, 12);
}

export function totalGoalsOdds(ttg = {}) {
  return Array.from({ length: 8 }, (_, index) => {
    const value = ttg[`s${index}`];
    if (!value) return null;
    return { goals: index === 7 ? "7+" : String(index), odds: toOdd(value) };
  }).filter(Boolean);
}

export function latestMarketUpdate(match) {
  return [match.had, match.hhad, match.crs, match.ttg, match.hafu]
    .map((market) => {
      const stamp = `${market?.updateDate || ""} ${market?.updateTime || ""}`.trim();
      return stamp || "";
    })
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}
