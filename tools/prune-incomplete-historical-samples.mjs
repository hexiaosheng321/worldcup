import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  args.set(key.slice(2), value && !value.startsWith("--") ? value : "true");
  if (value && !value.startsWith("--")) index += 1;
}

const dataDir = path.resolve(args.get("data-dir") || "web/data");
const apply = args.get("apply") === "true";
const seedTarget = Math.max(1, Number(args.get("seed-target") || 100));
const preserveAllLeagues = new Set(
  String(args.get("preserve-all-leagues") || "世界杯").split(",").map((item) => item.trim()).filter(Boolean),
);
const files = fs.readdirSync(dataDir)
  .filter((name) => /^externalHistoricalSamples.*\.js$/.test(name))
  .sort();

function validOdd(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 1;
}

function hasCompleteOneXTwo(sample) {
  return [sample?.euroHomeOdds, sample?.euroDrawOdds, sample?.euroAwayOdds].every(validOdd);
}

function normalizeMarketFields(sample) {
  if (sample.asianHandicap === undefined && sample.asianHandicapLine !== undefined) sample.asianHandicap = sample.asianHandicapLine;
  if (sample.asianHomeWater === undefined && sample.asianHomeOdds !== undefined) sample.asianHomeWater = sample.asianHomeOdds;
  if (sample.asianAwayWater === undefined && sample.asianAwayOdds !== undefined) sample.asianAwayWater = sample.asianAwayOdds;
  delete sample.asianHandicapLine;
  delete sample.asianHomeOdds;
  delete sample.asianAwayOdds;
  return sample;
}

function samplesFromFile(filePath) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return Array.isArray(context.window.WC_EXTERNAL_HISTORICAL_SAMPLES)
    ? context.window.WC_EXTERNAL_HISTORICAL_SAMPLES
    : [];
}

function assignmentFor(name, samples) {
  const json = JSON.stringify(samples, null, 2);
  return name === "externalHistoricalSamples.js"
    ? `window.WC_EXTERNAL_HISTORICAL_SAMPLES = ${json};\n`
    : `window.WC_EXTERNAL_HISTORICAL_SAMPLES = (window.WC_EXTERNAL_HISTORICAL_SAMPLES || []).concat(${json});\n`;
}

function fixtureKey(sample) {
  return [sample?.league, String(sample?.kickoffTime || "").slice(0, 10), sample?.homeTeam, sample?.awayTeam]
    .map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, ""))
    .join("|");
}

function cappedLeagueSamples(samples) {
  const league = String(samples[0]?.league || "");
  if (preserveAllLeagues.has(league)) {
    return [...samples].sort((a, b) => String(b.kickoffTime || "").localeCompare(String(a.kickoffTime || "")));
  }
  const unique = new Map();
  for (const sample of samples) {
    const key = fixtureKey(sample);
    const current = unique.get(key);
    const score = [sample.over25Odds, sample.under25Odds, sample.asianHandicap, sample.asianHomeWater, sample.asianAwayWater]
      .filter((value) => Number.isFinite(Number(value))).length;
    const currentScore = current
      ? [current.over25Odds, current.under25Odds, current.asianHandicap, current.asianHomeWater, current.asianAwayWater]
        .filter((value) => Number.isFinite(Number(value))).length
      : -1;
    if (!current || score > currentScore) unique.set(key, sample);
  }
  return [...unique.values()]
    .sort((a, b) => String(b.kickoffTime || "").localeCompare(String(a.kickoffTime || "")))
    .slice(0, seedTarget);
}

const report = [];
for (const name of files) {
  const filePath = path.join(dataDir, name);
  const before = samplesFromFile(filePath);
  const complete = before.filter(hasCompleteOneXTwo);
  const groups = new Map();
  for (const sample of complete) {
    const league = String(sample?.league || "unknown");
    const bucket = groups.get(league) || [];
    bucket.push(sample);
    groups.set(league, bucket);
  }
  const after = [...groups.values()].flatMap(cappedLeagueSamples).map(normalizeMarketFields);
  const removedByLeague = {};
  for (const sample of before) {
    if (hasCompleteOneXTwo(sample)) continue;
    const league = String(sample?.league || "unknown");
    removedByLeague[league] = (removedByLeague[league] || 0) + 1;
  }
  if (apply) fs.writeFileSync(filePath, assignmentFor(name, after), "utf8");
  report.push({ file: name, before: before.length, completeOdds: complete.length, kept: after.length, removed: before.length - after.length, removedByLeague });
}

console.log(JSON.stringify({ apply, seedTarget, preserveAllLeagues: [...preserveAllLeagues], files: report, totals: {
  before: report.reduce((sum, item) => sum + item.before, 0),
  kept: report.reduce((sum, item) => sum + item.kept, 0),
  removed: report.reduce((sum, item) => sum + item.removed, 0),
} }, null, 2));
