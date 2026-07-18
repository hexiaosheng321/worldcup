# 云端自动更新方案

当前方案：Cloudflare Pages 托管页面，GitHub Actions 定时触发线上 Pages API 完成体彩数据同步、赛果采集和复盘入库。**不依赖 Mac 在线。**

体彩官方接口可能对云服务器请求返回 `567`，因此线上同步通过 `SPORTTERY_UPSTREAM_PROXY` 中转；浏览器直连官方接口保留为前端兜底。

## 锁版口径

系统按 `ticaiDate/businessDate` 识别体彩销售日，不按自然比赛日 `matchDate` 识别当日赛程。比如 `ticaiDate=2026-06-30`、`matchDate=2026-07-01`、`kickoffTime=03:00` 的凌晨比赛，归属 6 月 30 日体彩销售日，必须在 6 月 30 日完成推演和锁版。

自动推演功能已关闭。云端只同步赛程、盘口、赛果、实时比分和历史快照；正式赛前推演必须由人工确认后写入 `locked_predictions`，页面只展示人工 FINAL_LOCK。

建议的人工最终锁版时间：

```text
finalLockAt = min(matchDate + kickoffTime - 60分钟, ticaiDate 19:50)
```

## 运行方式

`.github/workflows/sporttery-auto-deploy.yml` 的运行方式：

- 每次 `main` 分支有新提交时直接部署一次，确保 Codex 更新模型、赛程或页面后，线上网站自动同步。
- 北京时间 08:00-22:30 每 30 分钟触发一次线上同步。
- 北京时间 19:50 额外触发盘口快照和人工锁版检查窗口，不自动生成推演。
- 北京时间 21:40 记录停售前最后盘口快照。
- 北京时间 22:05 执行停售冻结和赛后复盘检查。

1. 安装 Node 22 和项目依赖
2. 定时任务调用 `https://worldcup-dashboard-4hr.pages.dev/api/sync/sporttery`
3. Pages API 采集体彩赛程、盘口和赛果，写入 D1
4. 人工赛前锁版通过 `/api/locks` 写入 D1
5. 网站打开后从 `/api/bootstrap` 读取云端赛程、人工锁版、赛果和案例库

## 比分回填来源

赛果自动回填按优先级执行：

1. OKOOO 赛果。与 SP 主源使用同一赛事身份映射。
2. `football-data.org`。用于 OKOOO 赛果延迟时的第一备用源，需要 `FOOTBALL_DATA_API_KEY`。世界杯优先使用 `WC` 专属赛程接口，避免通用日期接口在免费权限下返回空数据。
3. APIfootball。保留原有备用源，需要 `APIFOOTBALL_API_KEY`。
4. TheSportsDB。作为最后兜底源，默认使用免费公共 key `3`，也可配置 `THESPORTSDB_API_KEY`。

自动链路不再请求不稳定的体彩官方接口。既有官方赛果同步端点保留为人工诊断工具，不进入每 5 分钟任务；常规时间比分由上述多源回填，并继续记录来源与差异。

Cloudflare `worldcup-sync-worker` 每 5 分钟执行一次自动同步：

1. 优先调用 Pages `/api/sync/okooo-live` 写入赔率快照；写入端使用 D1 batch，避免逐场串行查询触发 Worker 资源上限。
2. 5 分钟赔率链路不再调用体彩官方赛程/赔率或直接 IP 缓存。Okooo 负责 SP，500.com 只负责开球时间、停售时间和队名校正；Okooo 失败时保留上一快照并告警，不把赛程数据伪装为赔率。
   Okooo 的来源赛事 ID 不直接作为线上主键；系统按销售编号、销售日和主客队匹配 D1 既有赛事，优先沿用已被锁版/赛果引用或最早建立的 canonical match ID。
3. 开盘前两条快照必存，之后只保存赔率变化或每 30 分钟心跳；每场最多 128 条，首页只取开盘首条和最近 24 条。
4. 调用 `/api/sync/okooo-results` 与 `/api/sync/live-results`，用多源补回常规时间比分。
5. 赛果或复盘步骤失败只标记为降级，不会抹掉已经成功写入的赔率快照，也不会回退到体彩官方接口。

`/api/sync/live-results` 不重新抓体彩赛程，只读取 D1 中已有赛程，再用备用比分源回填赛果。

备用源写入前必须通过常规时间闸门：`After ET`、`Extra Time`、`Penalty`、`Shootout`、`AET`、`加时`、`点球` 等状态会被排除；`football-data.org` 优先使用 `regularTime`，并记录 `scoreMode` / `scoreDuration` 方便追踪。

页面进行中比分读取 `/api/live-football-scores.js`。该接口会按 D1 中的近期赛程匹配 football-data / APIfootball / TheSportsDB 的实时行，并且 football-data 比分统一优先使用 `regularTime`，符合体彩 90 分钟常规时间口径。

自动化验收读取 `/api/live-score-health`。该接口返回近期 D1 赛程窗口、各备用源原始行数、常规时间可用行数、匹配成功数、被排除的加时/点球行数、最近写入的 `match_results` 和最近同步日志。

`football-data.org` 还可以继续补强这些网站能力：

- 赛程阶段：小组赛、32 强、16 强等阶段字段可用于杯赛规则判断。
- 半全场比分：完赛后可补全半场比分，支持半全场复盘。
- 球队状态：世界杯/联赛积分榜里的积分、进失球、净胜球、近况 `form` 可进入球队状态层。
- 联赛扩展：英超、西甲、德甲、意甲、法甲、荷甲、葡超、英冠、欧冠、世界杯等免费层赛事可以作为后续联赛 V1 的客观数据源。

当前已接入的数据层：

- `/api/football-data-context.js` 输出 `window.FOOTBALL_DATA_CONTEXT`，包含赛事阶段、积分/状态表、每场比赛匹配到的球队状态和 90 分钟比分上下文。
- 人工锁版可以把 `footballDataContext` 写入比赛 payload，并把球队状态、赛事阶段、半全场口径写入 `teamState`、`competitionStage`、`halftimeDecision`、`objectiveDataLayer`。
- 前端单场详情页展示“客观数据层”，与体彩盘口数据支撑分开展示。

## GitHub Secrets

仓库需要配置这些 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SPORTTERY_UPSTREAM_PROXY`
- `FOOTBALL_DATA_API_KEY`
- `APIFOOTBALL_API_KEY`（可选，但建议保留）
- `THESPORTSDB_API_KEY`（可选，不配置时使用免费公共 key `3`）

当前 Cloudflare Account ID：

```text
feccf68cc851a65611d357e4a079161f
```

Cloudflare API Token 需要有 Pages 部署权限。

## 本地操作说明

本地手动抓取数据（不上传）：

```bash
npm run sporttery:fetch
```

本地手动抓取并强制部署（需要手动触发时才用）：

```bash
npm run cloudflare:deploy
```

> 本地运行 `npm run sporttery:auto-deploy` 仍可手动刷新静态快照，但线上闭环以 Pages API + D1 为准。
> 网站自动发布和数据同步以 GitHub Actions 定时触发线上 API 为准，不需要 Mac 在线；正式推演不再自动生成。
