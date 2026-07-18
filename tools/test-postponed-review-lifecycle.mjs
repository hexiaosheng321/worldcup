import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("web/app/app-core.js", "utf8");
const homeSource = fs.readFileSync("web/app/app-home.js", "utf8");
const panelsSource = fs.readFileSync("web/app/app-panels.js", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name} in app-core.js`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing ${name} function body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name} function`);
}

const context = vm.createContext({
  normalizeResultScore(score = "") {
    const text = String(score || "").trim().replace(":", "-");
    return /^\d+-\d+$/.test(text) ? text : "";
  },
  resultForSportteryItem(item = {}) {
    return item.result || {};
  },
  liveScoreForSportteryItem(item = {}) {
    return item.liveScore || {};
  },
  verifiedSportteryScore(item = {}) {
    return item.score || "";
  },
  POSTPONED_LOCK_RETENTION_DAYS: 7,
});

vm.runInContext(`
${functionSource("exceptionalLiveStatusText")}
${functionSource("sportteryReviewLifecycle")}
${functionSource("sportteryPoolShouldHide")}
${functionSource("sportteryPostponedLockExpired")}
this.classify = sportteryReviewLifecycle;
this.shouldHideFromPool = sportteryPoolShouldHide;
this.postponedLockExpired = sportteryPostponedLockExpired;
`, context);

const classify = (...args) => JSON.parse(JSON.stringify(context.classify(...args)));
const shouldHideFromPool = (...args) => context.shouldHideFromPool(...args);
const postponedLockExpired = (...args) => context.postponedLockExpired(...args);

assert.deepEqual(classify(
  { matchDate: "2026-07-17", liveScore: { status: "延期", statusName: "延期", minute: "延期" } },
  { date: "2026-07-17" },
), {
  code: "POSTPONED",
  label: "延期追踪",
  scoreLabel: "延期",
  severity: "postponed",
  note: "暂停验票并保留原锁版，等待官方新开赛时间。",
});

assert.equal(classify({ liveScore: { status: "Cancelled" } }, {}).code, "VOID");
assert.equal(classify({ liveScore: { status: "腰斩" } }, {}).code, "SUSPENDED");
assert.equal(classify({ matchDate: "2026-07-20" }, { matchDate: "2026-07-17" }).code, "RESCHEDULED");
assert.equal(classify({ matchDate: "2026-07-17" }, { matchDate: "2026-07-17" }).code, "PENDING");
assert.equal(classify({ liveScore: { status: "延期" } }, {}, null, "2-1").code, "VERIFIED");

assert.equal(shouldHideFromPool({ liveScore: { status: "延期" } }), true, "confirmed postponements must leave every current pool view");
assert.equal(shouldHideFromPool({ liveScore: { status: "Cancelled" } }), true, "cancelled matches must leave every current pool view");
assert.equal(shouldHideFromPool({ liveScore: { status: "Scheduled", scheduled: true } }), false, "a rescheduled match must return after the live source restores its scheduled state");
assert.equal(shouldHideFromPool({ liveScore: { status: "延期" } }, null, "2-1"), false, "a later official final score must close the match in the finished pool");

const originalLock = { matchDate: "2026-07-01", kickoffTime: "08:30" };
assert.equal(postponedLockExpired({ liveScore: { status: "延期" } }, originalLock, Date.parse("2026-07-08T08:30:00+08:00")), true, "a confirmed postponement must expire its old lock after seven days");
assert.equal(postponedLockExpired({ liveScore: { status: "延期" } }, originalLock, Date.parse("2026-07-08T08:29:59+08:00")), false, "the seven-day retention window must remain exact");
assert.equal(postponedLockExpired({ liveScore: { status: "Scheduled", scheduled: true } }, originalLock, Date.parse("2026-07-20T08:30:00+08:00")), false, "a fixture restored to scheduled state must not expire as postponed");
assert.equal(postponedLockExpired({ liveScore: { status: "延期" }, score: "2-1" }, originalLock, Date.parse("2026-07-20T08:30:00+08:00")), false, "a final score must keep the completed review record");
assert.equal(postponedLockExpired({}, { ...originalLock, resultStatus: "POSTPONED" }, Date.parse("2026-07-08T08:30:00+08:00")), true, "the persisted lock status must expire even after the old fixture leaves the bootstrap window");
assert.equal(postponedLockExpired({}, { ...originalLock, resultStatus: "EXPIRED_POSTPONED" }, Date.parse("2026-07-20T08:30:00+08:00")), true, "a fixture rescheduled after seven days must not reactivate its old lock");

assert.match(homeSource, /homeUpcomingMatches[\s\S]*sportteryPoolShouldHide/, "homepage schedules must use the same exceptional-fixture visibility rule");
assert.match(homeSource, /sportteryWorldCupFlowMatches[\s\S]*sportteryPoolShouldHide/, "World Cup schedules must use the same exceptional-fixture visibility rule");
assert.match(homeSource, /activeSportteryPredictions[\s\S]*sportteryPostponedLockExpired/, "homepage lock totals must exclude expired postponed locks");
assert.match(panelsSource, /sportteryPostponedLockExpired\(item \|\| pred, pred\)/, "expired postponed locks must leave active lock and backtest views");

console.log("Postponed review lifecycle tests passed: current schedules hide confirmed exceptions, seven-day postponements expire old locks, reschedules resume tracking, and final scores close the loop.");
