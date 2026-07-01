import { onRequest as handleApiRequest } from "./functions/api/[[path]].js";

function wantsHtml(request) {
  return (request.headers.get("accept") || "").includes("text/html");
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest({ request, env, ctx });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/" || url.pathname === "") {
        return env.ASSETS.fetch(assetRequest(request, "/index.html"));
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status === 404 && wantsHtml(request)) {
        return env.ASSETS.fetch(assetRequest(request, "/index.html"));
      }
      return assetResponse;
    }

    return env.ASSETS.fetch(request);
  },
};
