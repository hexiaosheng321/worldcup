import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "web");
const port = Number(process.env.PORT || 4173);
const liveApiOrigin = process.env.LIVE_API_ORIGIN || "https://worldcup-dashboard-4hr.pages.dev";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function proxyApi(req, res) {
  const target = new URL(req.url, liveApiOrigin);
  const proxy = https.request(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    }
  );
  proxy.on("error", (error) => {
    send(res, 502, JSON.stringify({ ok: false, error: error.message }), {
      "content-type": "application/json; charset=utf-8",
    });
  });
  req.pipe(proxy);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const requested = path.normalize(path.join(webRoot, pathname));
  if (!requested.startsWith(webRoot)) {
    send(res, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const file = await fs.readFile(requested);
    const ext = path.extname(requested).toLowerCase();
    send(res, 200, file, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
  } catch (error) {
    if (error.code === "ENOENT" && !path.extname(pathname)) {
      const fallback = await fs.readFile(path.join(webRoot, "index.html"));
      send(res, 200, fallback, {
        "content-type": contentTypes[".html"],
        "cache-control": "no-store",
      });
      return;
    }
    send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not Found" : error.message, {
      "content-type": "text/plain; charset=utf-8",
    });
  }
}

const host = process.env.HOST || "127.0.0.1";

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Local site: http://${host}:${port}`);
  console.log(`API proxy: ${liveApiOrigin}/api`);
});
