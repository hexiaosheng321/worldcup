import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { researchTemplate, runUnifiedPrediction } from "./lib/unified-prediction-engine.mjs";

const audit = JSON.parse(await fs.readFile("web/data/directVenueSamples-20260717.json", "utf8"));
assert.equal(audit.targetMatchCount, 8);
assert.equal(audit.teamVenueGroupCount, 16);
assert.equal(audit.sampleAssignmentCount, 80);

const context = { window: {} };
vm.runInNewContext(await fs.readFile("web/data/externalHistoricalSamples.js", "utf8"), context);
const library = context.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];

for (const group of audit.groups) {
  assert.equal(group.samples.length, 5, `${group.code} ${group.role} sample count`);
  for (const row of group.samples) {
    assert.equal(row.formalCompetition, true);
    assert.equal(row.beforeTargetKickoff, true);
    assert.equal(row.venueVerified, true);
    assert.ok(row.kickoffTime < group.kickoffTime.slice(0, 10));
    assert.match(row.sourceUrl, new RegExp(`shuju-${row.fixtureId}\\.shtml$`));
    if (group.role === "HOME") assert.equal(row.homeTeam, group.sourceTeam);
    else assert.equal(row.awayTeam, group.sourceTeam);
    const sample = library.find((item) => String(item.matchId || "") === `500-${row.fixtureId}`)
      || library.find((item) => String(item.sourceUrl || "").includes(`-${row.fixtureId}.shtml`));
    assert.ok(sample, `500-${row.fixtureId} exists in external library`);
    assert.equal(`${sample.actualHomeGoals}-${sample.actualAwayGoals}`, row.score);
    assert.ok(sample.payload?.directVenueTargets?.some((item) =>
      item.targetMatchId === group.matchId && item.targetTeamRole === group.role));
  }
}

for (const target of [...new Map(audit.groups.map((group) => [group.matchId, group])).values()]) {
  const match = {
    matchId: target.matchId,
    league: target.league,
    home: target.displayHome,
    away: target.displayAway,
    matchDate: target.kickoffTime.slice(0, 10),
    kickoffTime: target.kickoffTime,
    handicap: "0",
  };
  const result = runUnifiedPrediction({
    match,
    market: { normal: { win: 2.4, draw: 3.2, lose: 2.8 }, handicapOdds: {}, scoreOdds: [], totalGoalsOdds: [] },
    samples: library,
    research: researchTemplate(match),
    asOf: "2026-07-17T12:00:00.000Z",
  });
  assert.ok(result.featureSet.venueProfile.homeSampleCount >= 3, `${target.code} model home venue samples`);
  assert.ok(result.featureSet.venueProfile.awaySampleCount >= 3, `${target.code} model away venue samples`);
}

console.log(JSON.stringify({ ok: true, targetMatches: 8, groups: 16, assignments: 80, uniqueSourceMatches: audit.uniqueSourceMatchCount }, null, 2));
