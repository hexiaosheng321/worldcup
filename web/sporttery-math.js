/**
 * sporttery-math.js — pure math functions adapted from Johnserf-Seed/SportteryAPI derive.ts
 *
 * All functions are zero-dependency, operate on plain number arrays/objects,
 * and follow the same formulas as the upstream TypeScript derive module.
 *
 * Reference: https://github.com/Johnserf-Seed/SportteryAPI
 * License: MIT
 */
(function () {
  "use strict";

  function deriveOdds(odds) {
    if (!Array.isArray(odds) || odds.length < 2) return null;
    const filtered = odds.filter((o) => Number.isFinite(o) && o > 1);
    if (filtered.length < 2) return null;
    const impliedProbs = filtered.map((o) => 1 / o);
    const overround = impliedProbs.reduce((s, p) => s + p, 0);
    const returnRate = 1 / overround;
    const margin = 1 - returnRate;
    const noVigProbs = impliedProbs.map((p) => p / overround);
    const fairOdds = noVigProbs.map((p) => 1 / p);
    return { odds: filtered, impliedProbs, overround, returnRate, margin, noVigProbs, fairOdds };
  }

  function compareValue(offeredOdds, refProbs, labels) {
    if (!offeredOdds?.length || !refProbs?.length) return [];
    const n = Math.min(offeredOdds.length, refProbs.length);
    const result = [];
    for (let i = 0; i < n; i++) {
      const odds = offeredOdds[i];
      const refProb = refProbs[i];
      if (!Number.isFinite(odds) || !Number.isFinite(refProb)) continue;
      const kellyIndex = odds * refProb;
      const ev = kellyIndex - 1;
      const kellyFraction = odds > 1 ? ev / (odds - 1) : 0;
      result.push({
        label: labels?.[i] || String(i),
        odds,
        refProb,
        kellyIndex,
        ev,
        kellyFraction,
        isValue: kellyIndex > 1,
        isStrongValue: kellyIndex > 1.05,
        confidence: kellyIndex > 1.05 ? "strong" : kellyIndex > 1 ? "weak" : "none",
      });
    }
    return result;
  }

  function kellyIndex(odds, refProb) {
    return Number.isFinite(odds) && Number.isFinite(refProb) && odds > 1 ? odds * refProb : null;
  }

  function expectedValue(odds, refProb) {
    const k = kellyIndex(odds, refProb);
    return k !== null ? k - 1 : null;
  }

  function kellyFraction(odds, refProb) {
    const ev = expectedValue(odds, refProb);
    return ev !== null && odds > 1 ? ev / (odds - 1) : null;
  }

  function marketAnalysis(odds, modelProbs, labels) {
    const market = deriveOdds(odds);
    if (!market) return null;
    const value = compareValue(odds, modelProbs, labels);
    return {
      market,
      value,
      pickValue: value.find((v) => v.isValue) || null,
      bestValue: value.reduce((best, v) => (v.kellyIndex > (best?.kellyIndex || 0) ? v : best), null),
    };
  }

  function pct(value, digits) {
    if (!Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(digits ?? 1)}%`;
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "-";
    return value.toFixed(digits ?? 2);
  }

  window.SportteryMath = { deriveOdds, compareValue, kellyIndex, expectedValue, kellyFraction, marketAnalysis, pct, fmt };
})();
