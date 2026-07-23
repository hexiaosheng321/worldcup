import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("web/app/app-home.js", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name} in app-home.js`);
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

const context = vm.createContext({});
vm.runInContext(`
${functionSource("orderedSportteryPoolGroups")}
this.orderGroups = orderedSportteryPoolGroups;
`, context);

const grouped = new Map([
  ["2026-07-21", [{ issue: "204" }, { issue: "205" }]],
  ["2026-07-22", [{ issue: "201" }, { issue: "202" }]],
]);
const plain = (value) => JSON.parse(JSON.stringify(value));

const finished = context.orderGroups(grouped, "finished");
assert.deepEqual(
  plain(finished.map(([date]) => date)),
  ["2026-07-22", "2026-07-21"],
  "finished dates must render newest first",
);
assert.deepEqual(
  plain(finished[0][1].map((item) => item.issue)),
  ["201", "202"],
  "sorting date groups must preserve each day's match order",
);
assert.deepEqual(
  plain(context.orderGroups(grouped, "open").map(([date]) => date)),
  ["2026-07-21", "2026-07-22"],
  "open-pool grouping must retain its existing order",
);
assert.deepEqual(
  [...grouped.keys()],
  ["2026-07-21", "2026-07-22"],
  "ordering must not mutate the source grouping",
);

console.log("Sporttery pool ordering tests passed: finished dates are newest-first while other views and same-day order remain stable.");
