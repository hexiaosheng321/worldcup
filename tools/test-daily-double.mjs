import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("web/lib/daily-tickets.js", "utf8"), sandbox);
const engine = sandbox.window.WC_DAILY_DOUBLE;
assert.ok(engine);

const days = engine.buildTickets([
  { date: "2026-07-23", matchId: "a", home: "甲", away: "乙", selection: "HOME", probabilities: { HOME: 0.82, DRAW: 0.1, AWAY: 0.08 }, probabilitySource: "model" },
  { date: "2026-07-23", matchId: "b", home: "丙", away: "丁", selection: "AWAY", probabilities: { HOME: 0.1, DRAW: 0.12, AWAY: 0.78 }, probabilitySource: "model" },
  { date: "2026-07-23", matchId: "c", home: "戊", away: "己", selection: "HOME", probabilities: { HOME: 0.72, DRAW: 0.16, AWAY: 0.12 }, probabilitySource: "model" },
  { date: "2026-07-23", matchId: "d", home: "庚", away: "辛", selection: "DRAW", probabilities: { HOME: 0.2, DRAW: 0.62, AWAY: 0.18 }, probabilitySource: "model" },
]);
assert.equal(days.length, 1);
assert.equal(days[0].tickets.length, 2);
assert.equal(days[0].tickets[0].legs.length, 2);
assert.equal(days[0].tickets[0].combinedProbability > 0.6, true);

const reviewed = engine.evaluateTickets([{ ...days[0], tickets: [{ ...days[0].tickets[0], legs: days[0].tickets[0].legs.map((leg, index) => ({ ...leg, actualDirection: index === 0 ? leg.selection : "DRAW" })) }] }]);
assert.equal(reviewed[0].tickets[0].status, "MISS");

const manyCandidates = Array.from({ length: 6 }, (_, index) => ({
  date: "2026-07-24",
  matchId: `m${index + 1}`,
  home: `主${index + 1}`,
  away: `客${index + 1}`,
  selection: index % 2 ? "AWAY" : "HOME",
  probabilities: index % 2
    ? { HOME: 0.12, DRAW: 0.1, AWAY: 0.78 - index * 0.01 }
    : { HOME: 0.78 - index * 0.01, DRAW: 0.1, AWAY: 0.12 },
  probabilitySource: "model",
}));
const threeTicketDays = engine.buildTickets(manyCandidates);
assert.equal(threeTicketDays.length, 1);
assert.equal(threeTicketDays[0].tickets.length, 3);
const usage = threeTicketDays[0].tickets
  .flatMap((ticket) => ticket.legs.map((leg) => leg.matchId))
  .reduce((counts, matchId) => ({ ...counts, [matchId]: (counts[matchId] || 0) + 1 }), {});
assert.equal(Math.max(...Object.values(usage)), 2);
console.log("Daily 2-leg ticket selector tests passed.");
