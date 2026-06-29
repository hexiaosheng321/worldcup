const headers = {
  "content-type": "application/javascript; charset=utf-8",
  "cache-control": "no-store",
};

function parsePayload(text, fallback = {}) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function compactNo(matchCode = "", matchId = "") {
  const text = String(matchCode || matchId || "");
  const found = text.match(/(\d{3})$/);
  return found ? found[1] : text.slice(-3).padStart(3, "0");
}

function direction(score = "") {
  const [home, away] = String(score).split("-").map(Number);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return "";
  if (home > away) return "胜";
  if (home < away) return "负";
  return "平";
}

export async function onRequest({ env }) {
  if (!env.DB) {
    return new Response("window.LIVE_SPORTTERY_RESULTS = { results: [] };\n", { headers, status: 200 });
  }
  const [resultRows, matchRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM match_results ORDER BY reviewed_at DESC LIMIT 300").all(),
    env.DB.prepare("SELECT * FROM matches ORDER BY kickoff_time DESC LIMIT 300").all(),
  ]);
  const matchPayloadById = new Map((matchRows.results || []).map((row) => [row.match_id, parsePayload(row.payload_json, {})]));
  const results = (resultRows.results || [])
    .map((row) => {
      const payload = parsePayload(row.payload_json, {});
      const matchPayload = matchPayloadById.get(row.match_id) || {};
      const score = `${row.full_time_home_goals}-${row.full_time_away_goals}`;
      return {
        ...matchPayload,
        ...payload,
        orderId: payload.orderId || matchPayload.orderId || row.match_id,
        issue: payload.issue || matchPayload.issue || "",
        no: payload.no || matchPayload.no || compactNo(matchPayload.issue, row.match_id),
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
    .filter((item) => item.home && item.away && item.score);
  const data = {
    source: "Cloudflare D1 + 中国体育彩票官方赛果接口",
    apiEndpoint: "/live-sporttery-results.js",
    importedAt: resultRows.results?.[0]?.reviewed_at || new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: results.length,
    matchDates: [...new Set(results.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    results,
  };
  return new Response(`window.LIVE_SPORTTERY_RESULTS = ${JSON.stringify(data, null, 2)};\n`, { headers });
}
