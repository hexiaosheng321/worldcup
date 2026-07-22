import fs from "node:fs";
import path from "node:path";
import { finalizeWdlTemperatureArtifact, rollingWdlTemperatureBacktest } from "./lib/wdl-calibrator.mjs";

const args = new Map(process.argv.slice(2).map((item, index, source) => item.startsWith("--") ? [item.slice(2), source[index + 1]] : null).filter(Boolean));
const inputFile = path.resolve(args.get("input") || "web/data/wdl-calibration-training-r17.json");
const artifactFile = path.resolve(args.get("artifact") || "tools/data/wdl-calibration-r17.json");
const reportFile = path.resolve(args.get("report") || "/tmp/wdl-calibration-r17-report.json");
const source = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const samples = source.samples || [];
if (samples.length < 50) throw new Error(`At least 50 eligible locked samples are required; received ${samples.length}`);

const options = { minimumTrain: 40, testBlock: 12, leagueShrinkage: 50, probabilityField: "marketProbabilities" };
const backtest = rollingWdlTemperatureBacktest(samples, options);
const artifact = finalizeWdlTemperatureArtifact(samples, backtest, options);
artifact.researchGateStatus = artifact.status;
artifact.status = "CHALLENGER";
artifact.promotionDecision = "NOT_PROMOTED";
artifact.promotionReason = "R17 mixed deployment policy did not satisfy the Champion promotion target; retain research evidence only.";
artifact.automaticPromotion = false;
for (const profile of Object.values(artifact.leagueProfiles || {})) profile.enabled = false;
artifact.modelId = "WDL_R17_LOCKED_ALL_MARKET_TEMPERATURE_20260722";
artifact.modelRevision = "LESSONS_2026-07-22_WDL_CALIBRATION_R17";
artifact.trainingWindow = { from: samples[0]?.lockedAt || "", to: samples.at(-1)?.lockedAt || "" };
artifact.trainingSource = { contractVersion: source.contractVersion, auditedRecords: source.auditedRecords, eligibleSamples: source.eligibleSamples, sourceCounts: source.sourceCounts, leagueCounts: source.leagueCounts };
artifact.validationMethod = { type: "EXPANDING_WINDOW_OUT_OF_SAMPLE", minimumTrain: options.minimumTrain, testBlock: options.testBlock };
fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`);
fs.writeFileSync(reportFile, `${JSON.stringify({
  contractVersion: "WDL_R17_BACKTEST_REPORT_V2",
  generatedAt: new Date().toISOString(),
  source: { inputFile, auditedRecords: source.auditedRecords, eligibleSamples: samples.length, leagueCounts: source.leagueCounts, exclusions: source.exclusions },
  artifact: { modelId: artifact.modelId, status: artifact.status, promotionDecision: artifact.promotionDecision, researchGateStatus: artifact.researchGateStatus, globalChecks: artifact.globalChecks, leagueValidation: artifact.leagueValidation },
  backtest: { minimumTrain: backtest.minimumTrain, testBlock: backtest.testBlock, overall: backtest.overall, byLeague: backtest.byLeague },
}, null, 2)}\n`);
console.log(JSON.stringify({ artifactFile, reportFile, modelId: artifact.modelId, status: artifact.status, globalChecks: artifact.globalChecks, overall: backtest.overall, leagueValidation: artifact.leagueValidation }, null, 2));
