import fs from "node:fs";
import vm from "node:vm";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) continue;
  const value = process.argv[index + 1];
  args.set(key.slice(2), value && !value.startsWith("--") ? value : "true");
  if (value && !value.startsWith("--")) index += 1;
}

const input = args.get("input") || "web/data/externalHistoricalSamples.js";
const reportPath = args.get("report") || "docs/kleague-probability-backtest-20260723.md";
const targetSeason = String(args.get("test-season") || "2026");
const source = args.get("source") || "500.com-full-history";
const sourceLabel = source === "500.com-full-history"
  ? "500.com 韩职历史赛程、欧指与亚指页"
  : "OKOOO 历史联赛页与欧指页";
const epsilon = 1e-12;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(input, "utf8"), sandbox, { filename: input });
const allSamples = sandbox.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];

function validOdds(row, prefix = "") {
  const odds = prefix === "latest"
    ? row.payload?.oddsSemantics?.latest
    : {
        home: row.euroHomeOdds ?? row.sportteryHomeSp,
        draw: row.euroDrawOdds ?? row.sportteryDrawSp,
        away: row.euroAwayOdds ?? row.sportteryAwaySp,
      };
  return odds && [odds.home, odds.draw, odds.away].every((value) => Number.isFinite(Number(value)) && Number(value) > 1);
}

function noVig(odds) {
  const inverse = [1 / Number(odds.home), 1 / Number(odds.draw), 1 / Number(odds.away)];
  const total = inverse.reduce((sum, value) => sum + value, 0);
  return inverse.map((value) => value / total);
}

function outcomeIndex(row) {
  if (row.actualResult === "HOME") return 0;
  if (row.actualResult === "DRAW") return 1;
  if (row.actualResult === "AWAY") return 2;
  const home = Number(row.actualHomeGoals);
  const away = Number(row.actualAwayGoals);
  return home > away ? 0 : home < away ? 2 : 1;
}

function softmax(values) {
  const max = Math.max(...values);
  const exp = values.map((value) => Math.exp(value - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map((value) => value / total);
}

function fitCalibrator(rows, { epochs = 3500, learningRate = 0.12, l2 = 0.02 } = {}) {
  let temperature = 1;
  const bias = [0, 0, 0];
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let temperatureGradient = 0;
    const biasGradient = [0, 0, 0];
    for (const row of rows) {
      const q = row.openingProbability;
      const logQ = q.map((value) => Math.log(Math.max(epsilon, value)));
      const probabilities = softmax(logQ.map((value, index) => temperature * value + bias[index]));
      const actual = outcomeIndex(row);
      for (let index = 0; index < 3; index += 1) {
        const error = probabilities[index] - (index === actual ? 1 : 0);
        biasGradient[index] += error;
        temperatureGradient += error * logQ[index];
      }
    }
    const divisor = Math.max(1, rows.length);
    temperatureGradient = temperatureGradient / divisor + l2 * (temperature - 1);
    temperature -= learningRate * temperatureGradient;
    temperature = Math.min(3, Math.max(0.2, temperature));
    for (let index = 0; index < 3; index += 1) {
      biasGradient[index] = biasGradient[index] / divisor + l2 * bias[index];
      bias[index] -= learningRate * biasGradient[index];
    }
    const meanBias = bias.reduce((sum, value) => sum + value, 0) / 3;
    for (let index = 0; index < 3; index += 1) bias[index] -= meanBias;
  }
  return { temperature, bias };
}

function calibratedProbability(q, model) {
  return softmax(q.map((value, index) => model.temperature * Math.log(Math.max(epsilon, value)) + model.bias[index]));
}

function marketMovementFeatures(row) {
  const opening = row.openingProbability;
  const latest = row.latestProbability;
  const asianOpening = Number(row.asianOpening);
  const asianLatest = Number(row.asianLatest);
  return [
    Math.log(opening[0] / opening[1]),
    Math.log(opening[2] / opening[1]),
    Math.log(latest[0] / latest[1]),
    Math.log(latest[2] / latest[1]),
    latest[1],
    latest[0] - opening[0],
    latest[1] - opening[1],
    latest[2] - opening[2],
    asianOpening,
    asianLatest,
    asianLatest - asianOpening,
    Math.abs(asianLatest),
  ];
}

function fitMultinomial(rows, lambda = 0.1, { epochs = 2600, learningRate = 0.08 } = {}) {
  const raw = rows.map(marketMovementFeatures);
  const dimension = raw[0].length;
  const means = Array.from({ length: dimension }, (_, feature) =>
    raw.reduce((sum, values) => sum + values[feature], 0) / raw.length
  );
  const scales = Array.from({ length: dimension }, (_, feature) => {
    const variance = raw.reduce((sum, values) => sum + (values[feature] - means[feature]) ** 2, 0) / raw.length;
    return Math.max(1e-6, Math.sqrt(variance));
  });
  const standardized = raw.map((values) => [1, ...values.map((value, feature) => (value - means[feature]) / scales[feature])]);
  const weights = Array.from({ length: 3 }, () => Array(dimension + 1).fill(0));
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = Array.from({ length: 3 }, () => Array(dimension + 1).fill(0));
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const values = standardized[rowIndex];
      const probabilities = softmax(weights.map((classWeights) =>
        classWeights.reduce((sum, weight, feature) => sum + weight * values[feature], 0)
      ));
      const actual = outcomeIndex(rows[rowIndex]);
      for (let outcome = 0; outcome < 3; outcome += 1) {
        const error = probabilities[outcome] - (outcome === actual ? 1 : 0);
        for (let feature = 0; feature < values.length; feature += 1) {
          gradient[outcome][feature] += error * values[feature];
        }
      }
    }
    const rate = learningRate / Math.sqrt(1 + epoch / 350);
    for (let outcome = 0; outcome < 3; outcome += 1) {
      for (let feature = 0; feature <= dimension; feature += 1) {
        const penalty = feature === 0 ? 0 : lambda * weights[outcome][feature];
        weights[outcome][feature] -= rate * (gradient[outcome][feature] / rows.length + penalty);
      }
    }
    for (let feature = 0; feature <= dimension; feature += 1) {
      const mean = weights.reduce((sum, classWeights) => sum + classWeights[feature], 0) / 3;
      for (const classWeights of weights) classWeights[feature] -= mean;
    }
  }
  return { means, scales, weights, lambda };
}

function multinomialProbability(row, model) {
  const values = [1, ...marketMovementFeatures(row).map((value, feature) =>
    (value - model.means[feature]) / model.scales[feature]
  )];
  return softmax(model.weights.map((classWeights) =>
    classWeights.reduce((sum, weight, feature) => sum + weight * values[feature], 0)
  ));
}

function factorial(number) {
  let result = 1;
  for (let index = 2; index <= number; index += 1) result *= index;
  return result;
}

function poisson(lambda, goals) {
  return Math.exp(-lambda) * (lambda ** goals) / factorial(goals);
}

function weightedAverage(values, fallback) {
  const usable = values.filter((row) => Number.isFinite(row.value) && row.weight > 0);
  const total = usable.reduce((sum, row) => sum + row.weight, 0);
  return total ? usable.reduce((sum, row) => sum + row.value * row.weight, 0) / total : fallback;
}

function scoreModelProbability(history, match) {
  const before = history.filter((row) => row.date < match.date);
  if (before.length < 80) return [1 / 3, 1 / 3, 1 / 3];
  const decay = (date) => Math.exp(-Math.max(0, (Date.parse(match.date) - Date.parse(date)) / 86_400_000) / 240);
  const leagueHome = weightedAverage(before.map((row) => ({ value: row.homeGoals, weight: decay(row.date) })), 1.35);
  const leagueAway = weightedAverage(before.map((row) => ({ value: row.awayGoals, weight: decay(row.date) })), 1.1);
  const homeRows = before.filter((row) => row.homeTeam === match.homeTeam).slice(-20);
  const awayRows = before.filter((row) => row.awayTeam === match.awayTeam).slice(-20);
  const prior = 6;
  const shrink = (rows, getter, baseline) => {
    const weights = rows.map((row) => decay(row.date));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const observed = rows.reduce((sum, row, index) => sum + getter(row) * weights[index], 0);
    return (observed + prior * baseline) / (total + prior);
  };
  const homeAttack = shrink(homeRows, (row) => row.homeGoals, leagueHome) / leagueHome;
  const homeDefence = shrink(homeRows, (row) => row.awayGoals, leagueAway) / leagueAway;
  const awayAttack = shrink(awayRows, (row) => row.awayGoals, leagueAway) / leagueAway;
  const awayDefence = shrink(awayRows, (row) => row.homeGoals, leagueHome) / leagueHome;
  const lambdaHome = Math.min(3.5, Math.max(0.25, leagueHome * Math.sqrt(homeAttack * awayDefence)));
  const lambdaAway = Math.min(3.5, Math.max(0.25, leagueAway * Math.sqrt(awayAttack * homeDefence)));
  const rho = -0.08;
  const totals = [0, 0, 0];
  let mass = 0;
  for (let home = 0; home <= 8; home += 1) {
    for (let away = 0; away <= 8; away += 1) {
      let correction = 1;
      if (home === 0 && away === 0) correction = 1 - lambdaHome * lambdaAway * rho;
      if (home === 0 && away === 1) correction = 1 + lambdaHome * rho;
      if (home === 1 && away === 0) correction = 1 + lambdaAway * rho;
      if (home === 1 && away === 1) correction = 1 - rho;
      const probability = Math.max(0, poisson(lambdaHome, home) * poisson(lambdaAway, away) * correction);
      totals[home > away ? 0 : home < away ? 2 : 1] += probability;
      mass += probability;
    }
  }
  return totals.map((value) => value / mass);
}

function blend(left, right, marketWeight) {
  return left.map((value, index) => value * marketWeight + right[index] * (1 - marketWeight));
}

function metrics(rows, getter) {
  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  let drawActual = 0;
  let drawPredictedCorrect = 0;
  const calibration = Array.from({ length: 10 }, () => ({ count: 0, probability: 0, correct: 0 }));
  for (const row of rows) {
    const probabilities = getter(row);
    const actual = outcomeIndex(row);
    const pick = probabilities.indexOf(Math.max(...probabilities));
    if (pick === actual) correct += 1;
    if (actual === 1) {
      drawActual += 1;
      if (pick === 1) drawPredictedCorrect += 1;
    }
    logLoss -= Math.log(Math.max(epsilon, probabilities[actual]));
    for (let index = 0; index < 3; index += 1) {
      brier += (probabilities[index] - (index === actual ? 1 : 0)) ** 2;
    }
    const confidence = Math.max(...probabilities);
    const bin = Math.min(9, Math.floor(confidence * 10));
    calibration[bin].count += 1;
    calibration[bin].probability += confidence;
    calibration[bin].correct += pick === actual ? 1 : 0;
  }
  const count = Math.max(1, rows.length);
  const ece = calibration.reduce((sum, bin) => {
    if (!bin.count) return sum;
    return sum + (bin.count / count) * Math.abs(bin.correct / bin.count - bin.probability / bin.count);
  }, 0);
  return {
    count: rows.length,
    accuracy: correct / count,
    logLoss: logLoss / count,
    brier: brier / count,
    ece,
    drawRecall: drawActual ? drawPredictedCorrect / drawActual : 0,
    drawActual,
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMetric(value) {
  return Number(value).toFixed(4);
}

function classDistribution(rows, getter) {
  const actual = [0, 0, 0];
  const predicted = [0, 0, 0];
  for (const row of rows) {
    actual[outcomeIndex(row)] += 1;
    const probabilities = getter(row);
    for (let index = 0; index < 3; index += 1) predicted[index] += probabilities[index];
  }
  return {
    actual: actual.map((value) => value / rows.length),
    predicted: predicted.map((value) => value / rows.length),
  };
}

const rows = allSamples
  .filter((row) => row.league === "韩职" && row.source === source && validOdds(row))
  .map((row) => ({
    ...row,
    season: String(row.season || String(row.kickoffTime).slice(0, 4)),
    date: String(row.kickoffTime).slice(0, 10),
    homeGoals: Number(row.actualHomeGoals),
    awayGoals: Number(row.actualAwayGoals),
    openingProbability: noVig({
      home: row.euroHomeOdds ?? row.sportteryHomeSp,
      draw: row.euroDrawOdds ?? row.sportteryDrawSp,
      away: row.euroAwayOdds ?? row.sportteryAwaySp,
    }),
    latestProbability: validOdds(row, "latest") ? noVig(row.payload.oddsSemantics.latest) : null,
    asianOpening: Number(row.payload?.asianSemantics?.opening ?? row.asianHandicap),
    asianLatest: Number(row.payload?.asianSemantics?.latest ?? row.asianHandicap),
  }))
  .filter((row) =>
    row.date
    && row.latestProbability
    && [row.homeGoals, row.awayGoals, row.asianOpening, row.asianLatest].every(Number.isFinite)
  )
  .sort((left, right) => left.date.localeCompare(right.date));

const trainRows = rows.filter((row) => row.season < targetSeason);
const testRows = rows.filter((row) => row.season === targetSeason);

if (trainRows.length < 100 || testRows.length < 50) {
  throw new Error(`Insufficient chronological data: train=${trainRows.length}, test=${testRows.length}`);
}

const finalCalibrator = fitCalibrator(trainRows);
const validationSeason = String(Number(targetSeason) - 1);
const weightTrainRows = rows.filter((row) => row.season < validationSeason);
const weightValidationRows = rows.filter((row) => row.season === validationSeason);
if (weightTrainRows.length < 100 || weightValidationRows.length < 50) {
  throw new Error(`Insufficient nested validation data: fit=${weightTrainRows.length}, validation=${weightValidationRows.length}`);
}
const validationCalibrator = fitCalibrator(weightTrainRows);
for (const row of rows) row.scoreProbability = scoreModelProbability(rows, row);

const regularizationCandidates = [0.01, 0.03, 0.1, 0.3, 1];
let selectedLambda = regularizationCandidates[0];
let selectedValidationLogLoss = Infinity;
for (const lambda of regularizationCandidates) {
  const candidate = fitMultinomial(weightTrainRows, lambda);
  const result = metrics(weightValidationRows, (row) => multinomialProbability(row, candidate));
  if (result.logLoss < selectedValidationLogLoss) {
    selectedValidationLogLoss = result.logLoss;
    selectedLambda = lambda;
  }
}
const movementModel = fitMultinomial(trainRows, selectedLambda);

let bestWeight = 1;
let bestValidationLogLoss = Infinity;
if (weightValidationRows.length >= 50) {
  for (let step = 0; step <= 20; step += 1) {
    const weight = step / 20;
    const result = metrics(weightValidationRows, (row) => blend(calibratedProbability(row.openingProbability, validationCalibrator), row.scoreProbability, weight));
    if (result.logLoss < bestValidationLogLoss) {
      bestValidationLogLoss = result.logLoss;
      bestWeight = weight;
    }
  }
}

const evaluations = [
  ["开盘市场去水", metrics(testRows, (row) => row.openingProbability)],
  ["最新市场去水（诊断上限）", metrics(testRows.filter((row) => row.latestProbability), (row) => row.latestProbability)],
  ["韩职开盘校准", metrics(testRows, (row) => calibratedProbability(row.openingProbability, finalCalibrator))],
  [`韩职盘口变化概率（L2=${selectedLambda}）`, metrics(testRows, (row) => multinomialProbability(row, movementModel))],
  ["韩职滚动比分模型", metrics(testRows, (row) => row.scoreProbability)],
  [`韩职融合模型（市场权重${bestWeight.toFixed(2)}）`, metrics(testRows, (row) => blend(calibratedProbability(row.openingProbability, finalCalibrator), row.scoreProbability, bestWeight))],
];

const winner = [...evaluations]
  .filter(([name]) => !name.includes("诊断上限"))
  .sort((left, right) => left[1].logLoss - right[1].logLoss)[0];
const market = evaluations[0][1];
const latestMarket = evaluations[1][1];
const promotionEligible = winner[0].startsWith("韩职盘口变化概率")
  && winner[1].logLoss < latestMarket.logLoss
  && winner[1].brier < latestMarket.brier;

const seasonCounts = Object.fromEntries([...new Set(rows.map((row) => row.season))].sort().map((season) => [season, rows.filter((row) => row.season === season).length]));
const openingDistribution = classDistribution(testRows, (row) => row.openingProbability);
const latestDistribution = classDistribution(testRows, (row) => row.latestProbability);
const table = evaluations.map(([name, result]) =>
  `| ${name} | ${result.count} | ${formatPercent(result.accuracy)} | ${formatMetric(result.logLoss)} | ${formatMetric(result.brier)} | ${formatMetric(result.ece)} | ${formatPercent(result.drawRecall)} (${result.drawActual}) |`
).join("\n");

const report = `# 韩职胜平负概率离线回测

- 生成时间：${new Date().toISOString()}
- 数据源：${sourceLabel}
- 样本赛季：${JSON.stringify(seasonCounts)}
- 训练集：${trainRows.length} 场（赛季 < ${targetSeason}）
- 测试集：${testRows.length} 场（${targetSeason}）
- 融合权重训练集：${weightTrainRows.length} 场（赛季 < ${validationSeason}）
- 融合权重选择集：${weightValidationRows.length} 场（${validationSeason}，严格早于测试集）
- 开盘校准参数：temperature=${finalCalibrator.temperature.toFixed(6)}, bias=${finalCalibrator.bias.map((value) => value.toFixed(6)).join(",")}
- 盘口变化模型正则化：L2=${selectedLambda}（仅由 ${validationSeason} 验证集选择）

## 样本外结果

| 模型 | 场数 | 单选命中 | Log Loss | Brier | ECE | 平局召回 |
|---|---:|---:|---:|---:|---:|---:|
${table}

## 2026 分布诊断

| 分布 | 主胜 | 平 | 客胜 |
|---|---:|---:|---:|
| 实际赛果 | ${formatPercent(openingDistribution.actual[0])} | ${formatPercent(openingDistribution.actual[1])} | ${formatPercent(openingDistribution.actual[2])} |
| 开盘市场平均概率 | ${formatPercent(openingDistribution.predicted[0])} | ${formatPercent(openingDistribution.predicted[1])} | ${formatPercent(openingDistribution.predicted[2])} |
| 最新市场平均概率 | ${formatPercent(latestDistribution.predicted[0])} | ${formatPercent(latestDistribution.predicted[1])} | ${formatPercent(latestDistribution.predicted[2])} |

## 结论

- 样本外 Log Loss 最优：**${winner[0]}**
- 相对开盘市场 Log Loss：${((winner[1].logLoss - market.logLoss) / market.logLoss * 100).toFixed(2)}%
- 相对开盘市场 Brier：${((winner[1].brier - market.brier) / market.brier * 100).toFixed(2)}%
- 若候选使用临场/盘口变化信息，晋级必须同时优于“最新市场去水”，不能只胜过开盘基线。
- 晋级资格：**${promotionEligible ? "具备进入影子验证资格" : "不具备；继续使用市场基线并保留候选模型"}**

注意：“最新市场”包含开盘后的信息，只作为诊断上限，不能和开盘模型作公平晋级比较。当前报告不会自动修改 Champion 模型。
`;

fs.writeFileSync(reportPath, report);
console.log(JSON.stringify({
  ok: true,
  input,
  reportPath,
  source,
  seasonCounts,
  train: trainRows.length,
  test: testRows.length,
  bestWeight,
  winner: winner[0],
  promotionEligible,
  evaluations: Object.fromEntries(evaluations),
}, null, 2));
