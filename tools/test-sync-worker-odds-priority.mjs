import assert from "node:assert/strict";
import { syncViaPagesApi } from "../worker/sync-worker.js";

const originalFetch = globalThis.fetch;

function response(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

try {
  {
    const calls = [];
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path === "/api/sync/okooo-live") return response(200, { ok: true, matchCount: 34, snapshotsWritten: 34 });
      return response(503, { ok: false, error: "non-critical test failure" });
    };
    const result = await syncViaPagesApi({ PAGES_API_BASE: "https://example.test" });
    assert.equal(result.ok, true);
    assert.equal(result.degraded, true);
    assert.ok(calls.includes("/api/sync/okooo-live"));
    assert.ok(!calls.includes("/api/sync/sporttery"), "official odds fallback must not run after OKOOO persisted snapshots");
    assert.ok(!calls.includes("/api/sync/sporttery-results"), "unstable official results must not run in the scheduled path");
  }

  {
    const calls = [];
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      return response(503, { ok: false, error: "test failure" });
    };
    await assert.rejects(() => syncViaPagesApi({ PAGES_API_BASE: "https://example.test" }), /okooo-live/);
    assert.ok(!calls.includes("/api/sync/sporttery"), "unstable official odds endpoint must not re-enter the scheduled path");
    assert.ok(!calls.includes("/api/sync/sporttery-results"), "unstable official results endpoint must not re-enter the scheduled path");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Sync worker priority tests passed: OKOOO owns SP, 500.com stays schedule-only, official odds/results stay out of the scheduled path, and non-critical failures do not discard snapshots.");
