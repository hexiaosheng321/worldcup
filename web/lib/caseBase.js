window.WC_CASE_BASE = (() => {
  const memoryCases = [];

  function keyFor(item) {
    return item?.sourceLockId || item?.caseId || "";
  }

  function loadCaseBase() {
    const staticCases = Array.isArray(window.WC_CASE_BASE_DATA) ? window.WC_CASE_BASE_DATA : [];
    return [...staticCases, ...memoryCases];
  }

  function hasCaseForLock(sourceLockId, cases = loadCaseBase()) {
    return cases.some((item) => item.sourceLockId === sourceLockId);
  }

  function appendCase(item) {
    if (!item || hasCaseForLock(item.sourceLockId)) return false;
    memoryCases.push(item);
    return true;
  }

  function appendCases(items = []) {
    const existing = new Set(loadCaseBase().map(keyFor).filter(Boolean));
    let added = 0;
    items.forEach((item) => {
      const key = keyFor(item);
      if (!item || !key || existing.has(key)) return;
      existing.add(key);
      memoryCases.push(item);
      added += 1;
    });
    return added;
  }

  function getCasesByMatch(matchId) {
    return loadCaseBase().filter((item) => String(item.matchId) === String(matchId));
  }

  function getAllCases() {
    return loadCaseBase();
  }

  return {
    loadCaseBase,
    appendCase,
    appendCases,
    hasCaseForLock,
    getCasesByMatch,
    getAllCases,
  };
})();
