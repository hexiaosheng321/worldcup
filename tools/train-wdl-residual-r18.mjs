import fs from "node:fs";
import path from "node:path";
import { finalizeWdlResidualArtifact, rollingWdlResidualBacktest } from "./lib/wdl-residual-challenger.mjs";

const args = new Map(process.argv.slice(2).map((item, index, source) => item.startsWith("--") ? [item.slice(2), source[index + 1]] : null).filter(Boolean));
const inputFile = path.resolve(args.get("input") || "web/data/wdl-calibration-training-r17.json");
const artifactFile = path.resolve(args.get("artifact") || "tools/data/wdl-residual-r18.json");
const reportFile = path.resolve(args.get("report") || "/tmp/wdl-residual-r18-report.json");
const source = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const samples = source.samples || [];
if (samples.length < 50) throw new Error(`At least 50 eligible locked samples are required; received ${samples.length}`);

const options = { minimumTrain: 40, testBlock: 12, globalPriorStrength: 12, leagueShrinkage: 16, minimumPatternSupport: 8, minimumModelEdge: 0.08 };
const backtest = rollingWdlResidualBacktest(samples, options);
const artifact = finalizeWdlResidualArtifact(samples, backtest, options);
artifact.modelId = "WDL_R18_MARKET_RESIDUAL_SELECTOR_20260722";
artifact.modelRevision = "LESSONS_2026-07-22_MARKET_RESIDUAL_R18_CHALLENGER";
artifact.championRevision = "LESSONS_2026-07-22_LEAF_OUTPUT_FORWARD_R16";
artifact.trainingWindow = { from: samples[0]?.lockedAt || "", to: samples.at(-1)?.lockedAt || "" };
artifact.trainingSource = { contractVersion: source.contractVersion, auditedRecords: source.auditedRecords, eligibleSamples: source.eligibleSamples, sourceCounts: source.sourceCounts, leagueCounts: source.leagueCounts };
fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`);
fs.writeFileSync(reportFile, `${JSON.stringify({
  contractVersion: "WDL_R18_BACKTEST_REPORT_V1",
  generatedAt: new Date().toISOString(),
  source: { inputFile, auditedRecords: source.auditedRecords, eligibleSamples: samples.length, leagueCounts: source.leagueCounts, exclusions: source.exclusions },
  artifact: { modelId: artifact.modelId, status: artifact.status, promotionDecision: artifact.promotionDecision, researchChecks: artifact.researchChecks },
  backtest: { minimumTrain: backtest.minimumTrain, testBlock: backtest.testBlock, overall: backtest.overall, byLeague: backtest.byLeague },
}, null, 2)}\n`);
console.log(JSON.stringify({ artifactFile, reportFile, modelId: artifact.modelId, status: artifact.status, researchChecks: artifact.researchChecks, overall: backtest.overall }, null, 2));
