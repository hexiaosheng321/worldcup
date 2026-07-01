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
    container.className = "chart-container";
    var head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
    head.innerHTML = '<span style="font-weight:950;font-size:13px;color:var(--muted);">' + (label || "进球走势") + '</span><span class="data-hint">已完成场次</span>';
    container.appendChild(head);
    container.appendChild(document.createElement("div"));
    target.parentNode.insertBefore(container, target);
  }
  var body = container.querySelector("div:last-child");
  if (!body) return;
  var maxVal = Math.max.apply(null, goalData.values, 1);
  var html = goalData.labels.map(function(l, i){
    var v = goalData.values[i];
    var w = (v / maxVal) * 100;
    var color = v >= 4 ? "#c1121f" : v >= 3 ? "#d99a16" : "#082052";
    return '<div class="stat-chart-bar"><span class="bar-label" style="min-width:50px;font-size:11px;">' + l + '</span><div class="bar-track-chart"><div class="bar-fill" style="width:' + w + '%;background:' + color + ';"></div></div><span class="bar-value">' + v + '</span></div>';
  }).join("");
  body.innerHTML = '<div style="padding:4px 0;">' + html + '</div>';
}
