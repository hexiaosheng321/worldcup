import fs from "node:fs";
import { execFileSync } from "node:child_process";

const index = fs.readFileSync("web/index.html", "utf8");
const main = fs.readFileSync("web/app/app-main.js", "utf8");
const sync = fs.readFileSync("tools/sync-sporttery-cache.mjs", "utf8");

const retiredMarkers = [
  'data-tab="path"',
  'data-tab="knockout"',
  'id="path"',
  'id="knockout"',
  'activateTab("path")',
  'activateTab("knockout")',
];

const foundRetired = retiredMarkers.filter((marker) => index.includes(marker) || main.includes(marker));
if (foundRetired.length) {
  throw new Error(`Production baseline rejected retired World Cup UI: ${foundRetired.join(", ")}`);
}

const requiredMarkers = [
  'data-tab="schedule"',
  'id="schedule"',
  'hash === "#worldcup" || hash === "#worldcup-knockout"',
  'activateTab("schedule")',
];
const missingRequired = requiredMarkers.filter((marker) => !index.includes(marker) && !main.includes(marker));
if (missingRequired.length) {
  throw new Error(`Production baseline missing required World Cup behavior: ${missingRequired.join(", ")}`);
}

const syncMarkers = [
  "/api/sync/sporttery-snapshot",
  "/api/sync/okooo-live",
  "/api/sync/okooo-results",
  "/api/sync/live-results",
];
const missingSyncMarkers = syncMarkers.filter((marker) => !sync.includes(marker));
if (missingSyncMarkers.length) {
  throw new Error(`Production baseline missing automatic score pipeline: ${missingSyncMarkers.join(", ")}`);
}
const syncPositions = syncMarkers.map((marker) => sync.indexOf(marker));
if (!syncPositions.every((position, index) => index === 0 || position > syncPositions[index - 1])) {
  throw new Error("Production baseline requires match seeding before live schedule and result synchronization.");
}

if (!process.env.GITHUB_ACTIONS) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const remoteMain = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  if (head !== remoteMain) {
    throw new Error(`Production deploy must use the pushed origin/main commit. HEAD=${head.slice(0, 8)} origin/main=${remoteMain.slice(0, 8)}`);
  }
  const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) throw new Error("Production deploy requires a clean worktree.");
}

console.log("Production baseline verified: current World Cup navigation, full D1 score loading, automatic result pipeline, and source alignment checks passed.");
