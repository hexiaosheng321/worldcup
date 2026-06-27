import http from "node:http";

const PORT = Number(process.env.PORT || process.env.FC_SERVER_PORT || process.env.CA_PORT || 9000);
const RELAY_TOKEN = (process.env.RELAY_TOKEN || "").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);

const ALLOWED_HOST = "webapi.sporttery.cn";
const ALLOWED_PATHS = [
  "/gateway/uniform/football/getMatchCalculatorV1.qry",
  "/gateway/uniform/fb/getMatchDataPageListV1.qry",
  "/gateway/uniform/football/getFixedBonusV1.qry",
  "/gateway/jc/football/getMatchCalculatorV1.qry",
];

const SPORTTERY_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-encoding": "identity",
  "accept-language": "zh-CN,zh;q=0.9",
  origin: "https://m.sporttery.cn",
  referer: "https://m.sporttery.cn/",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type,x-relay-token",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
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
  if (target.protocol !== "https:") {
    return { ok: false, error: "only https target is allowed" };
  }
  if (target.hostname !== ALLOWED_HOST) {
    return { ok: false, error: "target host is not allowed" };
  }
  if (!ALLOWED_PATHS.includes(target.pathname)) {
    return { ok: false, error: "target path is not allowed" };
  }
  return { ok: true, target };
}

async function proxySporttery(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      headers: SPORTTERY_HEADERS,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      },
      body: text,
    };
  } finally {
    clearTimeout(timer);
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
      service: "sporttery-relay",
      allowedHost: ALLOWED_HOST,
      tokenRequired: Boolean(RELAY_TOKEN),
    });
    return;
  }

  if (requestUrl.pathname !== "/fetch") {
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

  try {
    const proxied = await proxySporttery(checked.target.href);
    res.writeHead(proxied.status, proxied.headers);
    res.end(proxied.body);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: error.name === "AbortError" ? "upstream timeout" : error.message });
  }
}

http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    sendJson(res, 500, { ok: false, error: error.message || "relay error" });
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`sporttery relay listening on ${PORT}`);
});
