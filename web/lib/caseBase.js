window.WC_CASE_BASE = (() => {
  const memoryCases = [];

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

  function getCasesByMatch(matchId) {
    return loadCaseBase().filter((item) => String(item.matchId) === String(matchId));
  }

  function getAllCases() {
    return loadCaseBase();
  }

  return {
    loadCaseBase,
    appendCase,
    hasCaseForLock,
    getCasesByMatch,
    getAllCases,
  };
})();
