# 云端自动更新方案

当前方案：Cloudflare Pages 托管页面，GitHub Actions 定时触发线上 Pages API 完成体彩数据同步、自动推演锁版、赛果采集和复盘入库。**不依赖 Mac 在线。**

体彩官方接口可能对云服务器请求返回 `567`，因此线上同步通过 `SPORTTERY_UPSTREAM_PROXY` 中转；浏览器直连官方接口保留为前端兜底。

## 自动推演时间规则

系统按 `ticaiDate/businessDate` 识别体彩销售日，不按自然比赛日 `matchDate` 识别当日赛程。比如 `ticaiDate=2026-06-30`、`matchDate=2026-07-01`、`kickoffTime=03:00` 的凌晨比赛，归属 6 月 30 日体彩销售日，必须在 6 月 30 日完成推演和锁版。

每场比赛最终锁版时间：

```text
finalLockAt = min(matchDate + kickoffTime - 60分钟, ticaiDate 19:50)
```

状态规则：

```text
DRAFT_AUTO      19:50 前，未到最终锁版点时的自动初推演
FINAL_LOCK      到达最终锁版点后生成最终锁版
RISK_WATCH      20:00 后只记录风险，不新增可买推荐
SALE_CLOSED     22:00 后停售冻结，只允许赛果复盘
RESULT_REVIEW   赛果出来后自动复盘入库
```

## 运行方式

`.github/workflows/sporttery-auto-deploy.yml` 的运行方式：

- 每次 `main` 分支有新提交时直接部署一次，确保 Codex 更新模型、赛程或页面后，线上网站自动同步。
- 北京时间 08:00-22:30 每 30 分钟触发一次线上同步。
- 北京时间 19:50 额外触发最终锁版检查。
- 北京时间 21:40 记录停售前最后盘口快照。
- 北京时间 22:05 执行停售冻结和赛后复盘检查。

1. 安装 Node 22 和项目依赖
2. 定时任务调用 `https://worldcup-dashboard-4hr.pages.dev/api/sync/sporttery`
3. Pages API 采集体彩赛程、盘口和赛果，写入 D1
4. Pages API 按销售日和 19:50 规则生成自动锁版
5. 网站打开后从 `/api/bootstrap` 和 `/api/auto-predictions` 读取云端自动推演

## GitHub Secrets

仓库需要配置两个 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

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
> 网站自动发布和自动推演以 GitHub Actions 定时触发线上 API 为准，不需要 Mac 在线。
