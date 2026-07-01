import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_NODE_BIN_DIR = path.join(ROOT, ".tools/node-v22.12.0-darwin-arm64/bin");
const LOCAL_NODE_BIN = path.join(LOCAL_NODE_BIN_DIR, "node");
const NODE_BIN = existsSync(LOCAL_NODE_BIN) ? LOCAL_NODE_BIN : process.execPath;
const WRANGLER_HOME = process.env.CLOUDFLARE_API_TOKEN ? process.env.HOME : path.join(ROOT, ".tools/home");
const LOG_FILE = path.join(ROOT, "local-server", "auto-update-deploy.log");
const DATA_FILES = [
  "web/live-sporttery-data.js",
  "web/live-sporttery-results.js",
  "web/live-sporttery-sp-history.js",
  "web/live-football-scores.js",
  "web/data/caseBase.js",
];
const FETCH_SCRIPTS = [
  "tools/fetch-sporttery-live.mjs",
  "tools/fetch-sporttery-results.mjs",
  "tools/fetch-sporttery-sp-history.mjs",
  "tools/fetch-live-football-scores.mjs",
  "tools/generate-case-base.mjs",
];

async function log(message) {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_FILE, line, "utf8");
  console.log(message);
}

function runNode(args, label) {
  return runCommand(NODE_BIN, args, label);
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: WRANGLER_HOME,
        PATH: `${LOCAL_NODE_BIN_DIR}:${process.env.PATH || ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", async (code) => {
      if (stdout.trim()) await log(`${label}: ${stdout.trim().replace(/\n/g, " | ")}`);
      if (stderr.trim()) await log(`${label} stderr: ${stderr.trim().replace(/\n/g, " | ")}`);
      if (code === 0) resolve();
      else reject(new Error(`${label} exited ${code}`));
    });
  });
}

async function readMaybe(file) {
  try {
    return await readFile(path.join(ROOT, file), "utf8");
  } catch {
    return "";
  }
}

function stableJsonFromJs(content) {
  const matched = content.match(/=\s*([\[{][\s\S]*[\]}]);?\s*$/);
  if (!matched) return content.trim();
  try {
    const data = JSON.parse(matched[1]);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      delete data.importedAt;
    }
    return JSON.stringify(data);
  } catch {
    return content.trim();
  }
}

async function main() {
  const before = new Map();
  for (const file of DATA_FILES) {
    const content = await readMaybe(file);
    before.set(file, { content, stable: stableJsonFromJs(content) });
  }

  for (const script of FETCH_SCRIPTS) {
    await runNode([script], script);
  }

  const changed = [];
  for (const file of DATA_FILES) {
    const after = await readMaybe(file);
    if (stableJsonFromJs(after) !== before.get(file)?.stable) {
      changed.push(file);
    } else if (before.get(file)?.content && after !== before.get(file).content) {
      await writeFile(path.join(ROOT, file), before.get(file).content, "utf8");
    }
  }
  if (!changed.length && !process.argv.includes("--force")) {
    await log("no meaningful live data change; skipped deploy");
    return;
  }

  const runtime = process.env.GITHUB_ACTIONS ? "ci" : "local";
  await log(`${runtime} changed: ${changed.join(", ") || "forced deploy"}`);
  await runCommand("npx", ["wrangler", "pages", "deploy", "web", "--project-name", "worldcup-dashboard"], "cloudflare deploy");
  await log("deploy complete");
}

main().catch(async (error) => {
  await log(`auto update failed: ${error.stack || error.message}`);
  process.exit(1);
});
