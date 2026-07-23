import fs from "node:fs";

const artifactPath = process.argv[2] || "tools/data/kleague-independent-poisson-r1.json";
if (!fs.existsSync(artifactPath)) {
  throw new Error(`Missing Challenger artifact: ${artifactPath}`);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const finite = (value) => Number.isFinite(Number(value));

if (artifact.status !== "CHALLENGER") throw new Error("Independent model must remain CHALLENGER");
if (artifact.automaticPromotion !== false) throw new Error("Independent model must not auto-promote");
if (artifact.source !== "500.com-full-history") throw new Error("Unexpected training source");
if (!artifact.model || artifact.model.modelVersion !== "KLEAGUE_INDEPENDENT_POISSON_R1") {
  throw new Error("Missing independent model payload");
}
if (!Array.isArray(artifact.model.teams) || artifact.model.teams.length < 4) {
  throw new Error("Independent model has too few teams");
}
for (const key of ["mu", "homeAdvantage", "rho", "ridge"]) {
  if (!finite(artifact.model[key])) throw new Error(`Non-finite model parameter: ${key}`);
}
for (const value of [...artifact.model.attack, ...artifact.model.defence]) {
  if (!finite(value)) throw new Error("Non-finite team parameter");
}
if (artifact.trainRows < 300 || artifact.testRows < 50) throw new Error("Backtest sample is unexpectedly small");

console.log(JSON.stringify({
  ok: true,
  modelVersion: artifact.model.modelVersion,
  source: artifact.source,
  trainRows: artifact.trainRows,
  testRows: artifact.testRows,
  automaticPromotion: artifact.automaticPromotion,
}));
