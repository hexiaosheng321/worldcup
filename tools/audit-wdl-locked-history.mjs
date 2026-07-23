import fs from "node:fs";
import path from "node:path";
import { buildLockedHistoryAudit } from "./lib/wdl-history-audit.mjs";

const args = new Map(process.argv.slice(2)
  .map((item, index, source) => item.startsWith("--") ? [item.slice(2), source[index + 1]] : null)
  .filter(Boolean));
const inputFile = path.resolve(args.get("input") || "web/data/wdl-calibration-training-r17.json");
const outputFile = path.resolve(args.get("output") || "/tmp/wdl-locked-history-audit.json");
const manifest = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const report = buildLockedHistoryAudit(manifest, {
  minimumTrain: Number(args.get("minimum-train") || 40),
  testBlock: Number(args.get("test-block") || 10),
});

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputFile,
  sampleBoundary: report.sampleBoundary,
  overall: report.overall,
  agreement: report.agreement,
  sourceDecomposition: report.sourceDecomposition,
  rollingSourceBlend: report.rollingSourceBlend,
  failureSignals: report.failureSignals,
}, null, 2));
