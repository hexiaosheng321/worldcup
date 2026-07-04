import http from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || process.env.FC_SERVER_PORT || process.env.CA_PORT || 8787);
const RELAY_TOKEN = (process.env.RELAY_TOKEN || "").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 180000);
const DATA_DIR = process.env.DATA_DIR || "/opt/sporttery-proxy/cache";
const MAX_RESULT_PAGES = Number(process.env.MAX_RESULT_PAGES || 5);

const ALLOWED_HOST = "webapi.sporttery.cn";
const CALCULATOR_PATH = "/gateway/uniform/football/getMatchCalculatorV1.qry";
const RESULTS_PATH = "/gateway/uniform/fb/getMatchDataPageListV1.qry";
const FIXED_BONUS_PATH = "/gateway/uniform/football/getFixedBonusV1.qry";
const LEGACY_CALCULATOR_PATH = "/gateway/jc/football/getMatchCalculatorV1.qry";

const CALCULATOR_API = `https://${ALLOWED_HOST}${CALCULATOR_PATH}?channel=c`;
const RESULT_API = (pageNo) => `https://${ALLOWED_HOST}${RESULTS_PATH}?method=result&pageSize=80&pageNo=${pageNo}`;

const SPORTTERY_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  "accept-language": "zh-CN,zh;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

const state = {
  startedAt: new Date().toISOString(),
  refreshing: false,
  lastRefreshAt: "",
  lastSuccessAt: "",
  lastError: "",
  items: {},
};

function cachePath(name) {
  return path.join(DATA_DIR, name);
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,x-relay-token",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, status, text, contentType = "application/json; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,x-relay-token",
    "cache-control": "no-store",
    "content-type": contentType,
    ...extraHeaders,
  });
  res.end(text);
}

function readToken(req, requestUrl) {
  return req.headers["x-relay-token"] || requestUrl.searchParams.get("token") || "";
}

function assertAllowedTarget(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return { ok: false, error: "invalid target url" };
  }
  if (target.protocol !== "https:") return { ok: false, error: "only https target is allowed" };
  if (target.hostname !== ALLOWED_HOST) return { ok: false, error: "target host is not allowed" };
  if (![CALCULATOR_PATH, RESULTS_PATH, FIXED_BONUS_PATH, LEGACY_CALCULATOR_PATH].includes(target.pathname)) {
    return { ok: false, error: "target path is not allowed" };
  }
  return { ok: true, target };
}

function cacheFileForTarget(target) {
  if (target.pathname === CALCULATOR_PATH || target.pathname === LEGACY_CALCULATOR_PATH) {
    return "calculator.json";
  }
  if (target.pathname === RESULTS_PATH) {
    const pageNo = Number(target.searchParams.get("pageNo") || "1");
    return `results-page-${Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1}.json`;
  }
  return "";
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: SPORTTERY_HEADERS,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Sporttery ${response.status}: ${text.slice(0, 160)}`);
    JSON.parse(text);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function writeCache(fileName, text, sourceUrl) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = cachePath(`${fileName}.tmp`);
  const now = new Date().toISOString();
  await writeFile(tmp, text);
  await rename(tmp, cachePath(fileName));
  state.items[fileName] = { ok: true, updatedAt: now, sourceUrl };
}

async function readCache(fileName) {
  const text = await readFile(cachePath(fileName), "utf8");
  return text;
}

async function refreshOne(fileName, sourceUrl) {
  try {
    const text = await fetchText(sourceUrl);
    await writeCache(fileName, text, sourceUrl);
    return { fileName, ok: true };
  } catch (error) {
    state.items[fileName] = {
      ...(state.items[fileName] || {}),
      ok: false,
      error: error.message,
      failedAt: new Date().toISOString(),
      sourceUrl,
    };
    return { fileName, ok: false, error: error.message };
  }
}

async function refreshAll() {
  if (state.refreshing) return;
  state.refreshing = true;
  state.lastRefreshAt = new Date().toISOString();
  state.lastError = "";
  try {
    const targets = [{ fileName: "calculator.json", sourceUrl: CALCULATOR_API }];
    for (let pageNo = 1; pageNo <= MAX_RESULT_PAGES; pageNo += 1) {
      targets.push({ fileName: `results-page-${pageNo}.json`, sourceUrl: RESULT_API(pageNo) });
    }
    const results = await Promise.all(targets.map((item) => refreshOne(item.fileName, item.sourceUrl)));
    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      state.lastError = failed.map((item) => `${item.fileName}: ${item.error}`).join(" | ");
    } else {
      state.lastSuccessAt = new Date().toISOString();
    }
    await writeFile(cachePath("status.json"), JSON.stringify(state, null, 2)).catch(() => {});
  } finally {
    state.refreshing = false;
  }
}

async function serveCache(res, fileName) {
  try {
    if (state.items[fileName]?.ok === false) {
      sendJson(res, 503, {
        ok: false,
        error: "cache refresh failed",
        cacheFile: fileName,
        item: state.items[fileName],
        status: state,
      });
      return;
    }
    const text = await readCache(fileName);
    sendText(res, 200, text, "application/json; charset=utf-8", {
      "x-sporttery-cache": "hit",
      "x-sporttery-cache-file": fileName,
    });
  } catch {
    sendJson(res, 503, {
      ok: false,
      error: "cache not ready",
      cacheFile: fileName,
      status: state,
    });
  }
}

async function handle(req, res) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "sporttery-cache-relay",
      mode: "background-cache",
      port: PORT,
      dataDir: DATA_DIR,
      tokenRequired: Boolean(RELAY_TOKEN),
      state,
    });
    return;
  }

  if (requestUrl.pathname === "/refresh") {
    if (RELAY_TOKEN && readToken(req, requestUrl) !== RELAY_TOKEN) {
      sendJson(res, 401, { ok: false, error: "invalid relay token" });
      return;
    }
    await refreshAll();
    sendJson(res, state.lastError ? 207 : 200, { ok: !state.lastError, state });
    return;
  }

  if (requestUrl.pathname.startsWith("/sporttery/")) {
    const fileName = requestUrl.pathname.replace("/sporttery/", "");
    if (!/^(calculator|results-page-\d+|status)\.json$/.test(fileName)) {
      sendJson(res, 404, { ok: false, error: "cache file not found" });
      return;
    }
    await serveCache(res, fileName);
    return;
  }

  if (!["/fetch", "/proxy"].includes(requestUrl.pathname)) {
    sendJson(res, 404, { ok: false, error: "not found" });
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method not allowed" });
    return;
  }

  if (RELAY_TOKEN && readToken(req, requestUrl) !== RELAY_TOKEN) {
    sendJson(res, 401, { ok: false, error: "invalid relay token" });
    return;
  }

  const rawTarget = requestUrl.searchParams.get("url") || "";
  const checked = assertAllowedTarget(rawTarget);
  if (!checked.ok) {
    sendJson(res, 403, { ok: false, error: checked.error });
    return;
  }

  const cacheFile = cacheFileForTarget(checked.target);
  if (!cacheFile) {
    sendJson(res, 404, { ok: false, error: "target is not cacheable yet" });
    return;
  }
  const refreshResult = await refreshOne(cacheFile, checked.target.href);
  if (!refreshResult.ok) {
    sendJson(res, 502, {
      ok: false,
      error: "fresh upstream fetch failed",
      cacheFile,
      detail: refreshResult.error,
      item: state.items[cacheFile],
    });
    return;
  }
  await serveCache(res, cacheFile);
}

await mkdir(DATA_DIR, { recursive: true });
refreshAll().catch((error) => {
  state.lastError = error.message || "initial refresh failed";
});
setInterval(() => {
  refreshAll().catch((error) => {
    state.lastError = error.message || "scheduled refresh failed";
  });
}, REFRESH_INTERVAL_MS);

http
  .createServer((req, res) => {
    handle(req, res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message || "relay error" });
    });
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`sporttery cache relay listening on ${PORT}`);
  });
