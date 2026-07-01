(function () {
  const API_BASE = window.location.protocol === "file:"
    ? "https://worldcup-dashboard-4hr.pages.dev/api"
    : "/api";

  async function request(path, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return { ok: false, status: response.status, data };
      }
      return data || { ok: true };
    } catch (error) {
      return { ok: false, offline: true, error: error.message };
    }
  }

  function post(path, payload) {
    return request(path, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  }

  window.WC_CLOUD_STORE = {
    health: () => request("/health"),
    bootstrap: () => request("/bootstrap"),
    listMatches: () => request("/matches"),
    upsertMatch: (match) => post("/matches", match),
    listAutoPredictions: () => request("/auto-predictions"),
    listLocks: (matchId) => request(matchId ? `/locks?matchId=${encodeURIComponent(matchId)}` : "/locks"),
    getPreferredLock: (matchId) => request(`/locks/preferred?matchId=${encodeURIComponent(matchId)}`),
    createLock: (lock) => post("/locks", lock),
    upsertResult: (result) => post("/results", result),
    listCases: () => request("/cases"),
    generateCase: (lockId) => post("/cases/generate", { lockId }),
    runReview: (lockId) => post("/review/run", { lockId }),
    similarCases: (payload) => post("/similar-cases", payload),
  };
})();
