import fs from "node:fs";
import path from "node:path";
import { buildWdlConflictAudit } from "./lib/wdl-conflict-audit.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  args.set(key.slice(2), value && !value.startsWith("--") ? value : "true");
  if (value && !value.startsWith("--")) index += 1;
}

const inputPath = path.resolve(args.get("input") || "web/data/wdl-calibration-training-r17.json");
const runsArgument = args.get("runs");
if (!runsArgument) {
  throw new Error("Missing --runs <model-runs.json>; conflict attribution requires immutable model-run snapshots.");
}
const runsPath = path.resolve(runsArgument);
const outputPath = path.resolve(args.get("output") || "/tmp/wdl-conflict-audit.json");
const manifest = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const runs = JSON.parse(fs.readFileSync(runsPath, "utf8"));
const audit = buildWdlConflictAudit(manifest, runs);

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  sampleBoundary: audit.sampleBoundary,
  outcome: audit.outcome,
  attribution: audit.attribution,
  sourceDiagnosis: audit.sourceDiagnosis,
}, null, 2));
