(function attachDailyDouble(global) {
  const SIDE_LABELS = { HOME: "胜", DRAW: "平", AWAY: "负" };

  function sideKey(value = "") {
    const text = String(value || "").trim().toUpperCase();
    if (["HOME", "H", "胜", "主胜"].includes(text)) return "HOME";
    if (["DRAW", "D", "平", "平局"].includes(text)) return "DRAW";
    if (["AWAY", "A", "负", "客胜"].includes(text)) return "AWAY";
    return "";
  }

  function normalizeProbabilities(source = {}) {
    const values = [source.HOME, source.DRAW, source.AWAY].map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!(total > 0)) return null;
    return {
      HOME: values[0] / total,
      DRAW: values[1] / total,
      AWAY: values[2] / total,
    };
  }

  function buildTickets(candidates = [], options = {}) {
    const maxTickets = Math.max(1, Math.min(3, Number(options.maxTickets || 3)));
    const minLegProbability = Number(options.minLegProbability || 0.5);
    const minCombinedProbability = Number(options.minCombinedProbability || 0.25);
    const maxLegUses = Math.max(1, Number(options.maxLegUses || 2));
    const grouped = new Map();

    candidates.forEach((candidate) => {
      const date = String(candidate.date || "").slice(0, 10);
      const selection = sideKey(candidate.selection);
      const probabilities = normalizeProbabilities(candidate.probabilities);
      const legProbability = probabilities?.[selection] || 0;
      if (!date || !selection || !probabilities || legProbability < minLegProbability) return;
      const matchId = String(candidate.matchId || candidate.id || `${date}|${candidate.home}|${candidate.away}`);
      const normalized = {
        ...candidate,
        matchId,
        selection,
        selectionLabel: SIDE_LABELS[selection],
        probabilities,
        legProbability,
      };
      const previous = grouped.get(date) || new Map();
      const current = previous.get(matchId);
      if (!current || normalized.legProbability > current.legProbability) previous.set(matchId, normalized);
      grouped.set(date, previous);
    });

    return [...grouped.entries()]
      .map(([date, candidateMap]) => {
        const ranked = [...candidateMap.values()].sort((left, right) =>
          right.legProbability - left.legProbability
          || String(left.kickoff || "").localeCompare(String(right.kickoff || ""))
        );
        const pairs = [];
        for (let left = 0; left < ranked.length; left += 1) {
          for (let right = left + 1; right < ranked.length; right += 1) {
            const first = ranked[left];
            const second = ranked[right];
            const combinedProbability = first.legProbability * second.legProbability;
            if (combinedProbability < minCombinedProbability) continue;
            pairs.push({
              legs: [first, second],
              combinedProbability,
              key: `${first.matchId}::${second.matchId}`,
            });
          }
        }
        pairs.sort((left, right) => right.combinedProbability - left.combinedProbability);
        const targetCount = ranked.length >= 6 ? maxTickets : ranked.length >= 4 ? Math.min(2, maxTickets) : 1;
        const selected = [];
        const uses = new Map();
        for (const pair of pairs) {
          if (selected.length >= targetCount) break;
          if (pair.legs.some((leg) => (uses.get(leg.matchId) || 0) >= maxLegUses)) continue;
          selected.push({
            ...pair,
            ticketNo: selected.length + 1,
            status: "PENDING",
            source: pair.legs.every((leg) => leg.probabilitySource === "model") ? "model" : "mixed",
          });
          pair.legs.forEach((leg) => uses.set(leg.matchId, (uses.get(leg.matchId) || 0) + 1));
        }
        return { date, candidateCount: ranked.length, candidates: ranked, tickets: selected };
      })
      .filter((day) => day.tickets.length)
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  function evaluateTickets(days = []) {
    return days.map((day) => ({
      ...day,
      tickets: day.tickets.map((ticket) => {
        const states = ticket.legs.map((leg) => sideKey(leg.actualDirection));
        const status = states.some((value) => !value) ? "PENDING" : states.every((value, index) => value === ticket.legs[index].selection) ? "HIT" : "MISS";
        return { ...ticket, status };
      }),
    }));
  }

  global.WC_DAILY_DOUBLE = {
    SIDE_LABELS,
    sideKey,
    normalizeProbabilities,
    buildTickets,
    evaluateTickets,
  };
})(typeof window === "undefined" ? globalThis : window);
