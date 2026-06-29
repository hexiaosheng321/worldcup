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

function fallbackMatch(row) {
  const kickoff = String(row.kickoff_time || "");
  return {
    orderId: row.match_id || "",
    issue: row.match_code || "",
    no: compactNo(row.match_code, row.match_id),
    ticaiDate: kickoff.slice(0, 10),
    matchDate: kickoff.slice(0, 10),
    kickoffTime: kickoff.slice(11, 16),
    league: row.league || "竞彩",
    matchId: String(row.match_id || "").replace(/^sporttery-/, ""),
    home: row.home_team || "",
    away: row.away_team || "",
    score: "",
  };
}

export async function onRequest({ env }) {
  if (!env.DB) {
    return new Response("window.LIVE_SPORTTERY_ODDS = { matches: [] };\n", { headers, status: 200 });
  }
  const { results } = await env.DB.prepare("SELECT * FROM matches ORDER BY kickoff_time ASC LIMIT 300").all();
  const matches = (results || [])
    .map((row) => {
      const payload = parsePayload(row.payload_json, null);
      return payload?.home && payload?.away ? payload : fallbackMatch(row);
    })
    .filter((item) => item.home && item.away);
  const data = {
    source: "Cloudflare D1 + 中国体育彩票官方接口",
    apiEndpoint: "/live-sporttery-data.js",
    importedAt: results?.[0]?.updated_at || new Date().toISOString(),
    isLiveSnapshot: true,
    isCloudSnapshot: true,
    totalCount: matches.length,
    lastUpdateTime: results?.[0]?.updated_at || "",
    matchDates: [...new Set(matches.map((item) => item.ticaiDate || item.matchDate).filter(Boolean))],
    matches,
  };
  return new Response(`window.LIVE_SPORTTERY_ODDS = ${JSON.stringify(data, null, 2)};\n`, { headers });
}
