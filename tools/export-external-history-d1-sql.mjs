import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
  args.set(token.slice(2), value);
}

const dataDir = path.resolve(args.get("data-dir") || "web/data");
const output = path.resolve(args.get("output") || "/tmp/external-historical-samples.sql");
const replace = args.get("replace") === "true";
const requestedLeagues = new Set(String(args.get("leagues") || args.get("league") || "").split(",").map((item) => item.trim()).filter(Boolean));
const files = fs.readdirSync(dataDir)
  .filter((name) => /^externalHistoricalSamples.*\.js$/.test(name))
  .sort();

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(dataDir, file), "utf8"), sandbox, { filename: file });
}

const allRows = Array.isArray(sandbox.window.WC_EXTERNAL_HISTORICAL_SAMPLES)
  ? sandbox.window.WC_EXTERNAL_HISTORICAL_SAMPLES
  : [];

const targetPrimaryLeagues = new Set(["美职", "巴西甲"]);
const primarySourcePattern = /^(500\.com|okooo)/i;
const primaryCountByLeague = new Map();
allRows.forEach((row) => {
  const league = String(row.league || "").trim();
  if (targetPrimaryLeagues.has(league) && primarySourcePattern.test(String(row.source || row.dataSource || ""))) {
    primaryCountByLeague.set(league, (primaryCountByLeague.get(league) || 0) + 1);
  }
});
const rows = allRows.filter((row) => {
  const league = String(row.league || "").trim();
  if (requestedLeagues.size && !requestedLeagues.has(league)) return false;
  if (!targetPrimaryLeagues.has(league) || (primaryCountByLeague.get(league) || 0) < 100) return true;
  return primarySourcePattern.test(String(row.source || row.dataSource || ""));
});

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const sql = (value) => value === null || value === undefined || value === ""
  ? "NULL"
  : `'${String(value).replaceAll("'", "''")}'`;
const numericSql = (value) => Number.isFinite(number(value)) ? String(number(value)) : "NULL";
const qualityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const fixtureKey = (row) => [row.league, String(row.kickoffTime || "").slice(0, 10), row.homeTeam, row.awayTeam]
  .map((value) => text(value).toLowerCase().replace(/\s+/g, ""))
  .join("|");
const completeness = (row) => [
  row.euroHomeOdds, row.euroDrawOdds, row.euroAwayOdds,
  row.over25Odds, row.under25Odds,
  row.asianHandicap, row.asianHomeWater, row.asianAwayWater,
].filter((value) => number(value) !== null).length;

const selected = new Map();
for (const row of rows) {
  if (!row.league || !row.kickoffTime || !row.homeTeam || !row.awayTeam) continue;
  const key = fixtureKey(row);
  const current = selected.get(key);
  const rowScore = completeness(row) * 10 + (qualityRank[text(row.dataQuality).toUpperCase()] || 0);
  const currentScore = current ? completeness(current) * 10 + (qualityRank[text(current.dataQuality).toUpperCase()] || 0) : -1;
  if (!current || rowScore > currentScore) selected.set(key, row);
}

const columns = [
  "sample_id", "source", "source_url", "source_captured_at", "league", "season", "kickoff_time", "home_team", "away_team",
  "sporttery_home_sp", "sporttery_draw_sp", "sporttery_away_sp", "euro_home_odds", "euro_draw_odds", "euro_away_odds",
  "euro_home_prob", "euro_draw_prob", "euro_away_prob", "over25_odds", "under25_odds", "asian_handicap", "asian_home_water", "asian_away_water",
  "bookmaker_count_1x2", "bookmaker_count_total", "bookmaker_count_asian", "data_quality", "actual_result",
  "actual_home_goals", "actual_away_goals", "actual_goals", "score", "payload_json",
];

const statements = [...selected.values()].map((row, index) => {
  const id = text(row.caseId || `external-${index + 1}`);
  const values = [
    sql(id), sql(text(row.source || "external")), sql(text(row.sourceUrl)), sql(text(row.sourceCapturedAt)), sql(row.league), sql(text(row.season)),
    sql(row.kickoffTime), sql(row.homeTeam), sql(row.awayTeam),
    numericSql(row.sportteryHomeSp), numericSql(row.sportteryDrawSp), numericSql(row.sportteryAwaySp),
    numericSql(row.euroHomeOdds), numericSql(row.euroDrawOdds), numericSql(row.euroAwayOdds),
    numericSql(row.euroHomeProb), numericSql(row.euroDrawProb), numericSql(row.euroAwayProb),
    numericSql(row.over25Odds), numericSql(row.under25Odds), numericSql(row.asianHandicap ?? row.asianHandicapLine), numericSql(row.asianHomeWater ?? row.asianHomeOdds), numericSql(row.asianAwayWater ?? row.asianAwayOdds),
    numericSql(row.bookmakerCount1x2), numericSql(row.bookmakerCountTotal), numericSql(row.bookmakerCountAsian),
    sql(text(row.dataQuality || "LOW").toUpperCase()), sql(text(row.actualResult)),
    numericSql(row.actualHomeGoals), numericSql(row.actualAwayGoals), numericSql(row.actualGoals), sql(text(row.score)),
    sql(JSON.stringify({ sourceMatchId: row.matchId || "", sourceUrl: row.sourceUrl || "" })),
  ];
  return `INSERT INTO external_historical_samples (${columns.join(",")}) VALUES (${values.join(",")})\n` +
    `ON CONFLICT(source, league, kickoff_time, home_team, away_team) DO UPDATE SET\n` +
    columns.slice(2).map((column) => `  ${column}=excluded.${column}`).join(",\n") + ",\n  updated_at=CURRENT_TIMESTAMP;";
});

fs.writeFileSync(output, `${replace ? "DELETE FROM external_historical_samples;\n" : ""}${statements.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ inputFiles: files.length, inputRows: rows.length, dedupedRows: selected.size, replace, output, bytes: fs.statSync(output).size }, null, 2));
