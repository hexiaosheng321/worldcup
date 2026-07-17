import fs from "node:fs";
import vm from "node:vm";

const output = process.argv[2] || "/tmp/direct-venue-canonical-updates.sql";
const audit = JSON.parse(fs.readFileSync("web/data/directVenueSamples-20260717.json", "utf8"));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("web/data/externalHistoricalSamples.js", "utf8"), context);
const library = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];
const sql = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

const rows = new Map();
for (const group of audit.groups || []) {
  for (const sample of group.samples || []) rows.set(sample.fixtureId, sample);
}
if (rows.size !== audit.uniqueSourceMatchCount) {
  throw new Error(`audit unique fixture mismatch: ${rows.size}/${audit.uniqueSourceMatchCount}`);
}

const statements = [...rows.values()].map((row) => {
  const libraryRow = library.find((item) => String(item.matchId || "") === `500-${row.fixtureId}`)
    || library.find((item) => String(item.sourceUrl || "").includes(`-${row.fixtureId}.shtml`));
  if (!libraryRow) throw new Error(`500-${row.fixtureId} missing from local library`);
  if (libraryRow.homeTeam !== row.homeTeam || libraryRow.awayTeam !== row.awayTeam) {
    throw new Error(`500-${row.fixtureId} local canonical identity mismatch`);
  }
  return `UPDATE external_historical_samples\n`
    + `SET home_team=${sql(row.homeTeam)}, away_team=${sql(row.awayTeam)}, source_url=${sql(row.sourceUrl)}, updated_at=CURRENT_TIMESTAMP\n`
    + `WHERE source='500.com' AND json_extract(payload_json, '$.sourceMatchId')=${sql(`500-${row.fixtureId}`)};`;
});

fs.writeFileSync(output, `${statements.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ output, updates: statements.length, bytes: fs.statSync(output).size }, null, 2));
