import assert from "node:assert/strict";
import { buildCompetitionMotivationContext } from "./lib/competition-motivation.mjs";

const league = buildCompetitionMotivationContext({
  match: {
    league: "韩职",
    home: "主队",
    away: "客队",
    matchDate: "2026-06-01",
    season: "2026",
    round: "10",
    competitionType: "LEAGUE",
  },
  competitionContext: {
    standings: {
      home: { rank: 4, points: 18, played: 9 },
      away: { rank: 10, points: 9, played: 9 },
    },
  },
});
assert.equal(league.competition.type, "LEAGUE");
assert.equal(league.competition.season, "2026");
assert.equal(league.competition.round, "10");
assert.deepEqual(league.pointsImpact, { win: 3, draw: 1, loss: 0 });
assert.equal(league.standings.home.points, 18);
assert.equal(league.motivation.home.tolerance, "UNKNOWN");
assert.match(league.summary, /第4名，18分/);
assert.match(league.summary, /不能把“必须赢”当作事实/);

const knockout = buildCompetitionMotivationContext({
  match: {
    league: "欧冠",
    home: "追分主队",
    away: "领先客队",
    matchDate: "2026-07-01",
    season: "2026/27",
    round: "第二轮",
    competitionType: "QUALIFYING",
    competitionStage: "QUALIFYING",
  },
  tieContext: {
    isTwoLeg: true,
    legNumber: 2,
    aggregateHomeBeforeMatch: 0,
    aggregateAwayBeforeMatch: 1,
  },
  competitionContext: { settlement: "EXTRA_TIME_AND_PENALTIES" },
});
assert.equal(knockout.competition.type, "KNOCKOUT_QUALIFYING");
assert.equal(knockout.motivation.home.tolerance, "MUST_WIN");
assert.equal(knockout.motivation.away.tolerance, "DRAW_ACCEPTABLE");
assert.equal(knockout.motivation.strongerSide, "HOME");
assert.deepEqual(knockout.tieContext.aggregateBeforeMatch, { home: 0, away: 1 });

const incomplete = buildCompetitionMotivationContext({
  match: { league: "韩职", home: "主队", away: "客队", matchDate: "2026-06-01" },
});
assert.equal(incomplete.evidenceLevel, "PARTIAL");
assert.equal(incomplete.motivation.home.tolerance, "UNKNOWN");
assert.ok(incomplete.missingEvidence.includes("standings.homeAway"));
assert.match(incomplete.summary, /不能把“必须赢”当作事实|结果容忍度未核验/);

console.log("Competition motivation context verified.");
