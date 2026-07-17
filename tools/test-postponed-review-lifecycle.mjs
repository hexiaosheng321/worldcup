import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("web/app/app-core.js", "utf8");

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
});

vm.runInContext(`
${functionSource("exceptionalLiveStatusText")}
${functionSource("sportteryReviewLifecycle")}
this.classify = sportteryReviewLifecycle;
`, context);

const classify = (...args) => JSON.parse(JSON.stringify(context.classify(...args)));

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

console.log("Postponed review lifecycle tests passed: delayed fixtures pause validation, reschedules resume tracking, cancellations stay outside backtests, and final scores close the loop.");
