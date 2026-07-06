/**
 * 联赛 V1 硬闸门合规检查工具
 *
 * 读取 manual-locks-*.json 中的所有联赛 V1 条目，
 * 逐条检查 5 道硬闸门：球队状态、赔率动态、冲突闸门、让球映射、总进球。
 *
 * 用法: node tools/check-league-v1-gates.mjs [--file web/data/manual-locks-xxx.json]
 * 不传 --file 时扫描 web/data/manual-locks-*.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../web/data");

/* ── 5 道闸门检查器 ── */

function checkTeamState(lock) {
  const ts = lock.analysis?.teamState || lock.teamState || "";
  if (!ts || ts.trim().length < 20) {
    return { status: "FAIL", detail: "teamState 缺失或过短（<20字符）" };
  }
  const template = [
    /仅\s*参考/i, /结合联赛节奏/, /结合.*主客场/, /结合.*热度/,
    /模板/, /未补齐/, /未补状态前不做终版/,
  ];
  for (const pat of template) {
    if (pat.test(ts)) {
      return { status: "FAIL", detail: `teamState 含模板/占位文本: ${ts.slice(0, 80)}…` };
    }
  }
  const hasSideA = /排名|近[35]场|进\d失\d|BTTS|伤停|停赛|轮换|进攻|防守/.test(ts);
  const hasSideB = /[主客]队|对手|对方|仁川|全北|蔚山|水原|浦项|大田|光州|济州|FC|联\s*$/.test(ts)
    || (ts.match(/近[35]场/g) || []).length >= 2;
  if (!hasSideA || !hasSideB) {
    return { status: "WARN", detail: "teamState 可能只覆盖了一方信息" };
  }
  return { status: "PASS" };
}

function checkOddsMovement(lock) {
  const steps = lock.analysis?.unifiedSteps || [];
  const oddsText = steps.find(s => /赔率动态/.test(s)) || "";
  if (!oddsText) {
    return { status: "FAIL", detail: "未找到赔率动态步骤" };
  }
  const timePattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g;
  const times = oddsText.match(timePattern);
  if (!times || times.length < 2) {
    return { status: "FAIL", detail: `赔率动态仅 ${times ? times.length : 0} 个时间点，需至少 2 个比较` };
  }
  if (/仅.*开盘/.test(oddsText) && /未.*追(逐|价)/.test(oddsText)) {
    return { status: "FAIL", detail: `赔率动态为模板文本，无实质比较: ${oddsText.slice(0, 80)}…` };
  }
  return { status: "PASS", detail: `${times.length} 个时间点` };
}

function checkDecisionConflict(lock) {
  const steps = lock.analysis?.unifiedSteps || [];
  const conflictText = steps.find(s => /冲突闸门|决策冲突/.test(s)) || "";
  const scorePick = lock.scorePick || lock.analysis?.finalPick?.scores?.join(" / ") || "";
  const side = lock.recommendationSide || lock.analysis?.finalPick?.winDrawLose || "";

  if (!scorePick && !conflictText) {
    return { status: "WARN", detail: "无比分候选和冲突闸门文本，无法判断" };
  }

  const lowDrawScores = scorePick.match(/(?:^|\s)[0-1]-[0-1](?:\s|\/|$)/);
  if (lowDrawScores && /平|DRAW/i.test(side)) {
    const layersCount = (conflictText.match(/(球队状态|联赛画像|赔率动态|让球映射|相似样本)/g) || []).length;
    if (layersCount < 2) {
      return { status: "FAIL", detail: `低比分平局方向，但仅 ${layersCount} 层非比分支持，不足 2 层` };
    }
  }

  if (!conflictText) {
    return { status: "WARN", detail: "无冲突闸门文本" };
  }
  return { status: "PASS" };
}

function checkHandicapMapping(lock) {
  const steps = lock.analysis?.unifiedSteps || [];
  const handicapText = steps.find(s => /让球.*闸门|让球独立|让球映射/.test(s)) || "";
  const scorePick = lock.scorePick || "";

  if (!scorePick && !handicapText) {
    return { status: "WARN", detail: "无比分候选和让球文本，无法判断" };
  }

  const protectAsWin = /受让.*保护.*让胜/.test(handicapText)
    && !/不能.*自动|不能.*等同/.test(handicapText);
  if (protectAsWin) {
    return { status: "FAIL", detail: "把受让保护直接等同于让胜" };
  }

  if (!handicapText) {
    return { status: "WARN", detail: "无让球闸门文本" };
  }
  return { status: "PASS" };
}

function checkTotalGoals(lock) {
  const steps = lock.analysis?.unifiedSteps || [];
  const totalText = steps.find(s => /总进球/.test(s)) || "";
  const totalPick = lock.totalGoalsPick || lock.analysis?.finalPick?.totalGoals || "";

  if (!totalPick && !totalText) {
    return { status: "WARN", detail: "无总进球信息和文本" };
  }

  const lowDefault = /1[\/\s]?2球/.test(totalPick) &&
    (steps.some(s => /联赛副本.*低[比得]/.test(s) || /模板.*1[\/\s]?2/.test(s)))
    && !(steps.some(s => /联赛画像|近期.*大球|BTTS/.test(s)));
  if (lowDefault) {
    return { status: "WARN", detail: "总进球 1/2 球但未引用联赛画像或 BTTS 信息" };
  }

  if (!totalText) {
    return { status: "WARN", detail: "无总进球校验文本" };
  }
  return { status: "PASS" };
}

/* ── 主函数 ── */

function scanLocks(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  let data;
  try { data = JSON.parse(raw); } catch (e) { return; }

  const locks = Array.isArray(data) ? data : (data.locks || []);
  const results = [];

  for (const lock of locks) {
    const league = lock.league || "";
    const modelVer = lock.modelVersion || "";
    if (league === "世界杯") continue;
    if (!modelVer.includes("V1") && !modelVer.includes("v1")) continue;

    const label = `[${lock.matchCode || lock.matchId}] ${lock.homeTeam || "?"} vs ${lock.awayTeam || "?"} (${league})`;
    const lockType = lock.lockType || "?";

    const gates = [
      { name: "球队状态", ...checkTeamState(lock) },
      { name: "赔率动态", ...checkOddsMovement(lock) },
      { name: "冲突闸门", ...checkDecisionConflict(lock) },
      { name: "让球映射", ...checkHandicapMapping(lock) },
      { name: "总进球", ...checkTotalGoals(lock) },
    ];

    results.push({ label, lockType, gates });
  }

  return results;
}

/* ── 输出 ── */

function printResults(allResults) {
  const stats = { PASS: 0, WARN: 0, FAIL: 0, entries: 0 };

  console.log("");
  console.log("======================");
  console.log("联赛 V1 硬闸门合规检查");
  console.log("======================");
  console.log("");

  for (const file of allResults) {
    const rel = path.relative(dataDir, file.file);
    console.log(`--- ${rel} ---`);
    if (file.results.length === 0) {
      console.log("  （无联赛 V1 条目）");
      continue;
    }

    for (const r of file.results) {
      stats.entries++;
      const isFinal = r.lockType === "FINAL_LOCK";
      console.log("");
      console.log(`  ${isFinal ? "[FINAL]" : "[PRE]"} ${r.label}`);
      console.log(`     类型: ${r.lockType}`);

      for (const g of r.gates) {
        const icon = g.status === "PASS" ? "PASS" : g.status === "WARN" ? "WARN" : "FAIL";
        console.log(`     [${icon}] ${g.name}${g.detail ? " — " + g.detail : ""}`);
        if (g.status === "PASS") stats.PASS++;
        else if (g.status === "WARN") stats.WARN++;
        else stats.FAIL++;
      }
    }
  }

  console.log("");
  console.log("--- 汇总 ---");
  console.log(`  检查条目: ${stats.entries}`);
  console.log(`  PASS: ${stats.PASS}  WARN: ${stats.WARN}  FAIL: ${stats.FAIL}`);

  if (stats.FAIL > 0) {
    console.log(`  *** ${stats.FAIL} 项 FAIL，需人工处理 ***`);
  }
  if (stats.WARN > 0) {
    console.log(`  *** ${stats.WARN} 项 WARN，建议复查 ***`);
  }
}

/* ── 入口 ── */

function main() {
  const argIndex = process.argv.indexOf("--file");
  let files;
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    files = [path.resolve(process.argv[argIndex + 1])];
  } else {
    const dir = fs.readdirSync(dataDir)
      .filter(f => /^manual-locks-\d{8}/.test(f) && f.endsWith(".json"))
      .sort()
      .map(f => path.join(dataDir, f));
    files = dir;
  }

  const allResults = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`文件不存在: ${f}`);
      continue;
    }
    const results = scanLocks(f);
    if (results && results.length > 0) {
      allResults.push({ file: f, results });
    }
  }
  printResults(allResults);
}

main();
