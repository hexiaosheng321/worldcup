function parseOkoooJczqMatches(html = "") {
  const objectText = extractAssignedObject(html, "var oddsData");
  if (!objectText) throw new Error("OKOOO oddsData not found");

  const oddsData = JSON.parse(objectText);
  const capturedAt = new Date().toISOString();

  return Object.entries(oddsData).flatMap(([orderId, item]) => {
    const result = item?.Result || {};

    const hasFinished = Object.values(result).some((value) => value !== null && value !== undefined && value !== "");
    if (hasFinished) return [];

    const oddsList = item?.OddsList || {};
    const boundary = item?.Boundary || {};

    const normalOdds = oddsList.SportteryWDL || {};
    const handicapOdds = oddsList.SportteryNWDL || {};
    const totalGoalsRaw = oddsList.SportteryTotalGoals || {};
    const scoreRaw = oddsList.SportteryScore || {};

    const no = String(orderId).slice(-3).padStart(3, "0");

    const match = {
      orderId: String(orderId),
      issue: `周${no}`,
      no,
      ticaiDate: "",
      matchDate: "",
      kickoffTime: "",
      league: "竞彩",
      matchId: `okooo-${orderId}`,

      // 这里先用占位，下一步再从 HTML 里补真实队名
      home: `OKOOO-${orderId}-主队`,
      away: `OKOOO-${orderId}-客队`,

      venue: "",
      statusCode: "Selling",
      score: "",
      handicap: normalizeOkoooHandicap(boundary.SportteryWDL || "0"),

      normal: {
        win: oddText(normalOdds["10"]),
        draw: oddText(normalOdds["11"]),
        lose: oddText(normalOdds["13"]),
      },

      handicapOdds: {
        win: oddText(handicapOdds["14"]),
        draw: oddText(handicapOdds["15"]),
        lose: oddText(handicapOdds["16"]),
      },

      scoreOdds: Object.entries(scoreRaw).map(([code, odds]) => ({
        score: code,
        odds: oddText(odds),
        bucket: "",
      })),

      totalGoalsOdds: Object.entries(totalGoalsRaw).map(([code, odds]) => ({
        goals: code.replace(/^0/, ""),
        odds: oddText(odds),
      })),

      updatedAt: capturedAt,
      sportteryKey: `okooo-${orderId}`,
      source: "okooo-jczq",
    };

    return [match];
  });
}
