/* ── 纯 CSS 可视化辅助 (无外部依赖) ── */

function renderGoalDistributionChart(bucketCounts, finishedCount) {
  var container = document.getElementById("chart-goal-dist-wrap");
  if (!container) {
    var target = document.querySelector("#goal-bars");
    if (!target) return;
    container = document.createElement("div");
    container.id = "chart-goal-dist-wrap";
    container.className = "chart-container";
    var head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
    head.innerHTML = '<span style="font-weight:950;font-size:13px;color:var(--muted);">总进球分布</span><span class="data-hint">已完赛 ' + finishedCount + ' 场</span>';
    container.appendChild(head);
    container.appendChild(document.createElement("div"));
    target.parentNode.insertBefore(container, target.nextSibling);
  }
  var body = container.querySelector("div:last-child");
  if (!body) return;
  var buckets = ["0球","1球","2球","3球","4球","5球","6球","7+球"];
  var maxVal = Math.max.apply(null, buckets.map(function(b){ return bucketCounts[b] || 0; }), 1);
  var colors = ["#082052","#082052","#082052","#d99a16","#d99a16","#c1121f","#c1121f","#c1121f"];
  var html = buckets.map(function(b, i){
    var count = bucketCounts[b] || 0;
    var pct = finishedCount ? ((count / finishedCount) * 100).toFixed(1) : "0.0";
    var w = (count / maxVal) * 100;
    return '<div class="stat-chart-bar"><span class="bar-label">' + b + '</span><div class="bar-track-chart"><div class="bar-fill" style="width:' + w + '%;background:' + colors[i] + ';"></div></div><span class="bar-value">' + count + '</span><span style="font-size:11px;color:var(--muted);font-weight:900;min-width:40px;">' + pct + '%</span></div>';
  }).join("");
  body.innerHTML = '<div style="padding:4px 0;">' + html + '</div>';
}

function renderDrawRateChart(drawRows) {
  var container = document.getElementById("chart-draw-rate-wrap");
  if (!container) {
    var target = document.querySelector("#draw-rates");
    if (!target) return;
    container = document.createElement("div");
    container.id = "chart-draw-rate-wrap";
    container.className = "chart-container compact";
    var head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
    head.innerHTML = '<span style="font-weight:950;font-size:13px;color:var(--muted);">平局率趋势</span>';
    container.appendChild(head);
    container.appendChild(document.createElement("div"));
    target.parentNode.insertBefore(container, target.nextSibling);
  }
  var body = container.querySelector("div:last-child");
  if (!body) return;
  var maxRate = Math.max.apply(null, drawRows.map(function(r){ return parseFloat(r.rate); }), 1);
  var html = drawRows.map(function(r){
    var val = parseFloat(r.rate);
    var w = (val / maxRate) * 100;
    var color = r.current ? "#d99a16" : "#082052";
    return '<div class="stat-chart-bar"><span class="bar-label">' + r.label + '</span><div class="bar-track-chart"><div class="bar-fill" style="width:' + w + '%;background:' + color + ';"></div></div><span class="bar-value">' + r.rate + '%</span></div>';
  }).join("");
  body.innerHTML = '<div style="padding:4px 0;">' + html + '</div>';
}

function renderScoreFreqChart(scoreCounts, finishedCount) {
  var container = document.getElementById("chart-score-freq-wrap");
  if (!container) {
    var target = document.querySelector("#score-table");
    if (!target) return;
    container = document.createElement("div");
    container.id = "chart-score-freq-wrap";
    container.className = "chart-container compact";
    var head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
    head.innerHTML = '<span style="font-weight:950;font-size:13px;color:var(--muted);">比分频率 TOP10</span>';
    container.appendChild(head);
    container.appendChild(document.createElement("div"));
    target.parentNode.insertBefore(container, target.nextSibling);
  }
  var body = container.querySelector("div:last-child");
  if (!body) return;
  var sorted = Array.from(scoreCounts.entries()).sort(function(a,b){ return b[1]-a[1]||a[0].localeCompare(b[0]); }).slice(0, 10);
  if (!sorted.length) { body.innerHTML = ""; return; }
  var maxCount = sorted[0][1];
  var html = sorted.map(function(s){
    var count = s[1];
    var label = s[0].replace("-",":");
    var w = (count / maxCount) * 100;
    var pct = finishedCount ? ((count / finishedCount) * 100).toFixed(1) : "0.0";
    return '<div class="stat-chart-bar"><span class="bar-label">' + label + '</span><div class="bar-track-chart"><div class="bar-fill" style="width:' + w + '%;background:var(--blue-2);"></div></div><span class="bar-value">' + count + '</span><span style="font-size:11px;color:var(--muted);font-weight:900;min-width:40px;">' + pct + '%</span></div>';
  }).join("");
  body.innerHTML = '<div style="padding:4px 0;">' + html + '</div>';
}

function renderGoalTrendChart(goalData, label) {
  if (!goalData || !goalData.labels || !goalData.labels.length) return;
  var container = document.getElementById("chart-goal-trend-wrap");
  if (!container) {
    var target = document.querySelector("#schedule-list");
    if (!target) return;
    container = document.createElement("div");
    container.id = "chart-goal-trend-wrap";
    container.className = "chart-container goal-decision-panel";
    var head = document.createElement("div");
    head.className = "goal-decision-head";
    head.innerHTML = '<span>总进球决策雷达</span><em>用于复核 1/2球、2/3球、3/4球锁版区间</em>';
    container.appendChild(head);
    container.appendChild(document.createElement("div"));
    target.parentNode.insertBefore(container, target);
  }
  var body = container.querySelector("div:last-child");
  if (!body) return;
  var values = goalData.values.map(function(value){ return Number(value) || 0; });
  var sampleCount = values.length;
  var avg = sampleCount ? values.reduce(function(sum, value){ return sum + value; }, 0) / sampleCount : 0;
  var low = values.filter(function(value){ return value <= 1; }).length;
  var mid = values.filter(function(value){ return value >= 2 && value <= 3; }).length;
  var high = values.filter(function(value){ return value >= 4; }).length;
  var zero = values.filter(function(value){ return value === 0; }).length;
  var maxZone = Math.max(low, mid, high, 1);
  var dominant = mid >= low && mid >= high ? "2/3球" : high >= low ? "3/4球" : "1/2球";
  var risk = high >= sampleCount * 0.28
    ? "大球波动偏高，4+ 要作为风险分支"
    : low >= sampleCount * 0.28
      ? "低进球占比偏高，先防 0-0 / 1-0"
      : "主区间集中，优先复核 2/3 球";
  function pct(count) {
    return sampleCount ? ((count / sampleCount) * 100).toFixed(1) + "%" : "0.0%";
  }
  function zone(labelText, count, note, cls) {
    var width = Math.max(8, (count / maxZone) * 100);
    return '<article class="goal-zone ' + cls + '"><div><span>' + labelText + '</span><strong>' + count + '场</strong><em>' + pct(count) + '</em></div><i><b style="width:' + width + '%"></b></i><p>' + note + '</p></article>';
  }
  body.innerHTML = ''
    + '<div class="goal-decision-grid">'
    + '<article><small>已完赛样本</small><strong>' + sampleCount + '场</strong><span>当前世界杯口径</span></article>'
    + '<article><small>场均总进球</small><strong>' + avg.toFixed(2) + '</strong><span>' + (avg >= 3 ? "偏开放" : avg <= 2.2 ? "偏收紧" : "常规区间") + '</span></article>'
    + '<article><small>主判断区间</small><strong>' + dominant + '</strong><span>按已完赛分布</span></article>'
    + '<article><small>零封/闷局</small><strong>' + zero + '场</strong><span>0球样本</span></article>'
    + '</div>'
    + '<div class="goal-zone-stack">'
    + zone("低进球区间 0-1", low, "适合校验 1/2 球和防平脚本", "low")
    + zone("主区间 2-3", mid, "模型默认总进球判断的核心区", "mid")
    + zone("高进球区间 4+", high, "用于识别大球或崩盘分支", "high")
    + '</div>'
    + '<div class="goal-decision-note"><b>模型使用建议</b><span>' + risk + '；锁版时不要只看历史均值，要结合盘口低赔、比赛阶段和让球保护一起判断。</span></div>';
}
