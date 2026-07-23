function directionForScore(home, away) {
  return home > away ? "胜" : home < away ? "负" : "平";
}

function handicapForScore(home, away, line) {
  const adjusted = home + Number(line || 0) - away;
  return adjusted > 0 ? "让胜" : adjusted < 0 ? "让负" : "让平";
}

export function formalPairCompatible(winDrawLose, handicap, line) {
  if (!winDrawLose || !handicap) return true;
  for (let home = 0; home <= 12; home += 1) {
    for (let away = 0; away <= 12; away += 1) {
      if (directionForScore(home, away) === winDrawLose && handicapForScore(home, away, line) === handicap) {
        return true;
      }
    }
  }
  return false;
}

export function formalSelectionSummary(formalSelections = {}) {
  const selections = [
    formalSelections.winDrawLose ? `胜平负 ${formalSelections.winDrawLose}` : "",
    formalSelections.handicap ? `让球 ${formalSelections.handicap}` : "",
    formalSelections.totalGoals ? `总进球 ${formalSelections.totalGoals}` : "",
    Array.isArray(formalSelections.scores) && formalSelections.scores.length
      ? `比分 ${formalSelections.scores.join(" / ")}`
      : "",
  ].filter(Boolean);
  return selections.join("；") || "无正式玩法";
}
