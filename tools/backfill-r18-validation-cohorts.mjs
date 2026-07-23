const apiBase = String(process.env.PUBLIC_API_BASE || "https://ticai-model.com").replace(/\/$/, "");
const governanceToken = String(process.env.MODEL_GOVERNANCE_ADMIN_TOKEN || "").trim();
const governanceAdminUser = String(process.env.MODEL_GOVERNANCE_ADMIN_USER || "r18-backfill").trim();

if (!governanceToken) throw new Error("MODEL_GOVERNANCE_ADMIN_TOKEN is required");

const headers = {
  "content-type": "application/json",
  "x-admin-token": governanceToken,
  "x-admin-user": governanceAdminUser,
};

function parseObject(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); }
  catch { return {}; }
}

function revision(output = {}) {
  return String(output.modelLessons?.version || output.modelRevision || output.modelVersion || "").trim();
}

function cohortIdFor(league, season) {
  const leagueSlug = String(league || "unknown").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "unknown";
  return `r16-r18-wdl-${leagueSlug}-${season}`;
}

async function post(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`${path} failed: ${payload.error || response.status}`);
  return payload;
}

const response = await fetch(`${apiBase}/api/model-runs?limit=500`, { signal: AbortSignal.timeout(15000) });
const payload = await response.json();
if (!response.ok || !payload.ok) throw new Error(`model-runs fetch failed: ${payload.error || response.status}`);

const grouped = new Map();
for (const run of payload.runs || []) {
  const comparisonGroupId = String(run.comparison_group_id || "").trim();
  if (!comparisonGroupId) continue;
  const group = grouped.get(comparisonGroupId) || {};
  const role = String(run.run_role || "").toUpperCase();
  if (role === "CHAMPION") group.champion = run;
  if (role === "CHALLENGER") group.challenger = run;
  grouped.set(comparisonGroupId, group);
}

const summary = { pairedGroups: 0, registered: 0, alreadyRegistered: 0, skipped: 0, failed: [] };
for (const [comparisonGroupId, pair] of grouped) {
  if (!pair.champion || !pair.challenger) {
    summary.skipped += 1;
    continue;
  }
  summary.pairedGroups += 1;
  const input = parseObject(pair.champion.input_json);
  const championOutput = parseObject(pair.champion.output_json);
  const challengerOutput = parseObject(pair.challenger.output_json);
  const league = String(input.match?.league || championOutput.match?.league || "").trim();
  const season = String(input.match?.season || input.match?.matchDate || input.match?.ticaiDate || championOutput.match?.matchDate || "").slice(0, 4);
  if (!league || !season || challengerOutput.shadowOnly !== true) {
    summary.skipped += 1;
    continue;
  }
  const cohortId = cohortIdFor(league, season);
  try {
    await post("/api/model-validation-cohorts", {
      cohortId,
      primaryModule: "WIN_DRAW_LOSE",
      targetMarket: "winDrawLose",
      league,
      season,
      championRevision: revision(championOutput),
      challengerRevision: revision(challengerOutput),
    });
    const registered = await post("/api/model-validation-samples", {
      cohortId,
      championRunId: pair.champion.run_id,
      challengerRunId: pair.challenger.run_id,
    });
    if (registered.registered === false) summary.alreadyRegistered += 1;
    else summary.registered += 1;
  } catch (error) {
    summary.failed.push({ comparisonGroupId, error: error?.message || String(error) });
  }
}

console.log(JSON.stringify({ ok: summary.failed.length === 0, ...summary }, null, 2));
if (summary.failed.length) process.exitCode = 1;
