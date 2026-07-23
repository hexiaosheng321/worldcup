import fs from "node:fs";
import path from "node:path";
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
const targetSeason = String(args.get("test-season") || "2026");
const source = args.get("source") || "500.com-full-history";
const reportPath = args.get("report") || "docs/kleague-independent-model-20260724.md";
const artifactPath = args.get("artifact") || "tools/data/kleague-independent-poisson-r1.json";
const rollingBlock = Math.max(1, Number(args.get("rolling-block") || 14));
const epsilon = 1e-9;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(input, "utf8"), sandbox, { filename: input });
const allSamples = sandbox.window.WC_EXTERNAL_HISTORICAL_SAMPLES || [];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function outcomeIndex(row) {
  if (row.actualResult === "HOME") return 0;
  if (row.actualResult === "DRAW") return 1;
  if (row.actualResult === "AWAY") return 2;
  return row.homeGoals > row.awayGoals ? 0 : row.homeGoals < row.awayGoals ? 2 : 1;
}

function noVig(row) {
  const odds = [row.euroHomeOdds, row.euroDrawOdds, row.euroAwayOdds].map(number);
  if (odds.some((value) => value === null || value <= 1)) return null;
  const inverse = odds.map((value) => 1 / value);
  const total = inverse.reduce((sum, value) => sum + value, 0);
  if (total < 1 || total > 1.2) return null;
  return inverse.map((value) => value / total);
}

function poisson(lambda, goals) {
  let factorial = 1;
  for (let index = 2; index <= goals; index += 1) factorial *= index;
  return Math.exp(-lambda) * (lambda ** goals) / factorial;
}

function scoreProbability(lambdaHome, lambdaAway, rho = 0) {
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
  return totals.map((value) => value / Math.max(epsilon, mass));
}

function dateWeight(date, latestDate, decayDays) {
  if (!Number.isFinite(decayDays)) return 1;
  const ageDays = Math.max(0, (Date.parse(latestDate) - Date.parse(date)) / 86_400_000);
  return Math.exp(-ageDays / decayDays);
}

function fitIndependentModel(rows, options = {}) {
  const decayDays = Number(options.decayDays);
  const ridge = Number(options.ridge || 0.1);
  const rho = Number(options.rho || 0);
  const epochs = Number(options.epochs || 1800);
  const learningRate = Number(options.learningRate || 0.025);
  const teams = [...new Set(rows.flatMap((row) => [row.homeTeam, row.awayTeam]))].sort();
  const indexByTeam = new Map(teams.map((team, index) => [team, index]));
  const latestDate = rows.at(-1)?.date || rows[0]?.date || "";
  const weights = rows.map((row) => dateWeight(row.date, latestDate, decayDays));
  const totalWeight = Math.max(epsilon, weights.reduce((sum, value) => sum + value, 0));
  const homeMean = rows.reduce((sum, row, index) => sum + row.homeGoals * weights[index], 0) / totalWeight;
  const awayMean = rows.reduce((sum, row, index) => sum + row.awayGoals * weights[index], 0) / totalWeight;
  let mu = Math.log(Math.max(0.25, (homeMean + awayMean) / 2));
  let homeAdvantage = Math.log(Math.max(0.5, homeMean) / Math.max(0.5, awayMean));
  const attack = Array(teams.length).fill(0);
  const defence = Array(teams.length).fill(0);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let muGradient = 0;
    let homeAdvantageGradient = 0;
    const attackGradient = Array(teams.length).fill(0);
    const defenceGradient = Array(teams.length).fill(0);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const weight = weights[rowIndex];
      const homeIndex = indexByTeam.get(row.homeTeam);
      const awayIndex = indexByTeam.get(row.awayTeam);
      const lambdaHome = Math.min(4.5, Math.max(0.15, Math.exp(mu + homeAdvantage + attack[homeIndex] - defence[awayIndex])));
      const lambdaAway = Math.min(4.5, Math.max(0.15, Math.exp(mu + attack[awayIndex] - defence[homeIndex])));
      const homeResidual = (lambdaHome - row.homeGoals) * weight;
      const awayResidual = (lambdaAway - row.awayGoals) * weight;
      muGradient += homeResidual + awayResidual;
      homeAdvantageGradient += homeResidual;
      attackGradient[homeIndex] += homeResidual;
      attackGradient[awayIndex] += awayResidual;
      defenceGradient[awayIndex] -= homeResidual;
      defenceGradient[homeIndex] -= awayResidual;
    }
    const rate = learningRate / Math.sqrt(1 + epoch / 300);
    mu -= rate * muGradient / totalWeight;
    homeAdvantage -= rate * homeAdvantageGradient / totalWeight;
    for (let index = 0; index < teams.length; index += 1) {
      attack[index] -= rate * (attackGradient[index] / totalWeight + ridge * attack[index]);
      defence[index] -= rate * (defenceGradient[index] / totalWeight + ridge * defence[index]);
      attack[index] = Math.max(-1.5, Math.min(1.5, attack[index]));
      defence[index] = Math.max(-1.5, Math.min(1.5, defence[index]));
    }
    const attackMean = attack.reduce((sum, value) => sum + value, 0) / Math.max(1, teams.length);
    const defenceMean = defence.reduce((sum, value) => sum + value, 0) / Math.max(1, teams.length);
    for (let index = 0; index < teams.length; index += 1) {
      attack[index] -= attackMean;
      defence[index] -= defenceMean;
    }
    mu = Math.max(-1.2, Math.min(1.2, mu));
    homeAdvantage = Math.max(-0.5, Math.min(0.5, homeAdvantage));
  }
  return {
    modelVersion: "KLEAGUE_INDEPENDENT_POISSON_R1",
    decayDays: Number.isFinite(decayDays) ? decayDays : null,
    ridge,
    teams,
    mu,
    homeAdvantage,
    attack,
    defence,
    rho,
    trainingRows: rows.length,
    trainingThrough: latestDate,
  };
}

function expectedGoals(model, row) {
  const homeIndex = model.teams.indexOf(row.homeTeam);
  const awayIndex = model.teams.indexOf(row.awayTeam);
  const homeAttack = homeIndex >= 0 ? model.attack[homeIndex] : 0;
  const awayDefence = awayIndex >= 0 ? model.defence[awayIndex] : 0;
  const awayAttack = awayIndex >= 0 ? model.attack[awayIndex] : 0;
  const homeDefence = homeIndex >= 0 ? model.defence[homeIndex] : 0;
  return {
    home: Math.min(4.5, Math.max(0.15, Math.exp(model.mu + model.homeAdvantage + homeAttack - awayDefence))),
    away: Math.min(4.5, Math.max(0.15, Math.exp(model.mu + awayAttack - homeDefence))),
  };
}

function metrics(rows, predictor) {
  let hits = 0;
  let logLoss = 0;
  let brier = 0;
  let draws = 0;
  let drawRecallHits = 0;
  const predicted = [0, 0, 0];
  const actual = [0, 0, 0];
  for (const row of rows) {
    const probabilities = predictor(row);
    const actualIndex = outcomeIndex(row);
    const pick = probabilities.indexOf(Math.max(...probabilities));
    if (pick === actualIndex) hits += 1;
    if (actualIndex === 1) {
      draws += 1;
      if (pick === 1) drawRecallHits += 1;
    }
    actual[actualIndex] += 1;
    probabilities.forEach((value, index) => {
      predicted[index] += value;
      brier += (value - (index === actualIndex ? 1 : 0)) ** 2;
    });
    logLoss -= Math.log(Math.max(epsilon, probabilities[actualIndex]));
  }
  return {
    count: rows.length,
    accuracy: hits / Math.max(1, rows.length),
    logLoss: logLoss / Math.max(1, rows.length),
    brier: brier / Math.max(1, rows.length),
    drawRecall: draws ? drawRecallHits / draws : 0,
    actualDistribution: actual.map((value) => value / Math.max(1, rows.length)),
    predictedDistribution: predicted.map((value) => value / Math.max(1, rows.length)),
  };
}

function prediction(model, row) {
  const xg = expectedGoals(model, row);
  return scoreProbability(xg.home, xg.away, model.rho);
}

function blend(independent, market, weight) {
  return independent.map((value, index) => value * weight + market[index] * (1 - weight));
}

function rollingPredictions(initialRows, targetRows, options) {
  const predictions = [];
  for (let offset = 0; offset < targetRows.length; offset += rollingBlock) {
    const trainingRows = [...initialRows, ...targetRows.slice(0, offset)];
    const model = fitIndependentModel(trainingRows, options);
    const block = targetRows.slice(offset, offset + rollingBlock);
    predictions.push(...block.map((row) => ({ row, probabilities: prediction(model, row) })));
  }
  return predictions;
}

function metricsFromPredictions(predictions, selector = (item) => item.probabilities) {
  return metrics(predictions.map((item) => ({ ...item.row, __prediction: selector(item) })), (row) => row.__prediction);
}

const rows = allSamples
  .filter((row) => row.league === "韩职" && row.source === source)
  .map((row) => ({
    ...row,
    season: String(row.season || String(row.kickoffTime).slice(0, 4)),
    date: String(row.kickoffTime || "").slice(0, 10),
    homeGoals: number(row.actualHomeGoals),
    awayGoals: number(row.actualAwayGoals),
    marketProbability: noVig(row),
  }))
  .filter((row) => row.date && row.homeTeam && row.awayTeam && row.homeGoals !== null && row.awayGoals !== null)
  .sort((left, right) => left.date.localeCompare(right.date));

const trainRows = rows.filter((row) => row.season < targetSeason);
const testRows = rows.filter((row) => row.season === targetSeason);
const validationSeason = String(Number(targetSeason) - 1);
const validationFitRows = rows.filter((row) => row.season < validationSeason);
const validationRows = rows.filter((row) => row.season === validationSeason);
if (validationFitRows.length < 100 || validationRows.length < 50 || trainRows.length < 100 || testRows.length < 50) {
  throw new Error(`Insufficient chronological data: fit=${validationFitRows.length}, validation=${validationRows.length}, train=${trainRows.length}, test=${testRows.length}`);
}

const decayCandidates = [180, 360, 720, Infinity];
const ridgeCandidates = [0.01, 0.03, 0.1, 0.3];
const rhoCandidates = [-0.18, -0.12, -0.08, -0.04, 0];
let selected = null;
for (const decayDays of decayCandidates) {
  for (const ridge of ridgeCandidates) {
    for (const rho of rhoCandidates) {
      const candidate = fitIndependentModel(validationFitRows, { decayDays, ridge, rho });
      const result = metrics(validationRows, (row) => prediction(candidate, row));
      const rank = [result.logLoss, result.brier];
      if (!selected || rank[0] < selected.rank[0] - 1e-12 || (Math.abs(rank[0] - selected.rank[0]) < 1e-12 && rank[1] < selected.rank[1])) {
        selected = { decayDays, ridge, rho, rank, validation: result };
      }
    }
  }
}

const model = fitIndependentModel(trainRows, selected);
const validationRolling = rollingPredictions(validationFitRows, validationRows, selected);
const testRolling = rollingPredictions(trainRows, testRows, selected);
const independent = metricsFromPredictions(testRolling);
const market = metrics(testRows, (row) => row.marketProbability || [1 / 3, 1 / 3, 1 / 3]);
const invalidMarketOdds = testRows.filter((row) => !row.marketProbability).length;

let bestBlend = { weight: 1, validation: null };
for (let step = 0; step <= 20; step += 1) {
  const weight = step / 20;
  const result = metricsFromPredictions(validationRolling, (item) => blend(item.probabilities, item.row.marketProbability || [1 / 3, 1 / 3, 1 / 3], weight));
  if (!bestBlend.validation || result.logLoss < bestBlend.validation.logLoss) bestBlend = { weight, validation: result };
}
const blended = metricsFromPredictions(testRolling, (item) => blend(item.probabilities, item.row.marketProbability || [1 / 3, 1 / 3, 1 / 3], bestBlend.weight));

const seasonCounts = Object.fromEntries([...new Set(rows.map((row) => row.season))].sort().map((season) => [season, rows.filter((row) => row.season === season).length]));
const report = `# 韩职独立概率模型回测

- 生成时间：${new Date().toISOString()}
- 数据源：${source}
- 数据边界：这是外部历史样本的 Challenger 回测，不计入 FINAL_LOCK 正式分母，也不会改写 case_base。
- 市场对照质量：测试集 ${testRows.length - invalidMarketOdds}/${testRows.length} 场通过隐含概率和校验（倒数和要求在 1.00–1.20）；无效场次市场指标使用均匀先验，不参与独立模型训练。
- 训练集：${trainRows.length} 场（赛季 < ${targetSeason}）
- 测试集：${testRows.length} 场（${targetSeason}）
- 验证集：${validationRows.length} 场（${validationSeason}）
- 赛季样本：${JSON.stringify(seasonCounts)}
- 模型：只使用历史赛果、主客场和球队攻防强度；赔率只作为对照，不进入独立模型训练
- 概率计算：λ_H=exp(μ+h+a_H-d_A)，λ_A=exp(μ+a_A-d_H)，在0-8球网格上求胜/平/负概率；攻防参数按日期衰减并做岭收缩
- 评估：扩展窗口样本外回测，每 ${rollingBlock} 场重新拟合一次；每场只使用开赛前数据
- 选定衰减：${Number.isFinite(selected.decayDays) ? `${selected.decayDays} 天` : "不衰减"}
- 选定正则：${selected.ridge}
- 选定低比分相关修正 rho：${selected.rho}

## 样本外结果

| 模型 | 场数 | 命中率 | Log Loss | Brier | 平局召回 |
|---|---:|---:|---:|---:|---:|
| 韩职独立 Poisson | ${independent.count} | ${(independent.accuracy * 100).toFixed(1)}% | ${independent.logLoss.toFixed(4)} | ${independent.brier.toFixed(4)} | ${(independent.drawRecall * 100).toFixed(1)}% |
| 开盘市场去水 | ${market.count} | ${(market.accuracy * 100).toFixed(1)}% | ${market.logLoss.toFixed(4)} | ${market.brier.toFixed(4)} | ${(market.drawRecall * 100).toFixed(1)}% |
| 独立模型/市场融合（独立权重 ${bestBlend.weight.toFixed(2)}） | ${blended.count} | ${(blended.accuracy * 100).toFixed(1)}% | ${blended.logLoss.toFixed(4)} | ${blended.brier.toFixed(4)} | ${(blended.drawRecall * 100).toFixed(1)}% |

## 解释

- 该模型是 Challenger/Shadow，不会自动接入 Champion。
- 当前独立模型没有超过开盘市场基线，不能把它当成已验证的韩职生产模型。
- 只有在至少一个完整未来赛季中同时改善 Log Loss、Brier 和命中率，且完成正式审核后，才考虑进入统一推演。
- 如果独立模型仍低于市场，问题应继续追溯到球队攻防数据、赛季状态和主客场样本，而不是增加放行门禁。
`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(reportPath, report);
fs.writeFileSync(artifactPath, `${JSON.stringify({
  model,
  selected,
  targetSeason,
  source,
  rollingBlock,
  seasonCounts,
  trainRows: trainRows.length,
  testRows: testRows.length,
  status: "CHALLENGER",
  automaticPromotion: false,
}, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  reportPath,
  artifactPath,
  seasonCounts,
  train: trainRows.length,
  validation: validationRows.length,
  test: testRows.length,
  selected,
  independent,
  market,
  invalidMarketOdds,
  blended,
  status: "CHALLENGER",
}, null, 2));
