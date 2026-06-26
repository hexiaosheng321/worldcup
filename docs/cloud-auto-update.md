# 云端自动更新方案

当前方案：GitHub Actions 定时抓取体彩数据，然后部署到 Cloudflare Pages。**完全云端运行，不依赖 Mac 在线。**

不采用 Cloudflare Worker Cron 的原因：体彩官方接口会对 Cloudflare Worker 请求返回 `567`，Worker 不能稳定直接抓取源数据。

## 运行方式

`.github/workflows/sporttery-auto-deploy.yml` 有两种运行方式：

- 每 10 分钟在 GitHub 服务器执行一次，抓取体彩实时数据；只有真实数据变化时才部署，避免无意义发布。
- 每次 `main` 分支有新提交时强制部署一次，确保 Codex 更新模型、赛程或页面后，线上网站自动同步。

1. 安装 Node 22 和项目依赖
2. 运行 `npm run sporttery:auto-deploy`（CI 模式下自动部署）
3. 拉取体彩实时开盘、赛果、SP 历史
4. 如果只有抓取时间戳变化，跳过部署
5. 如果赛程、比分、盘口或 SP 有实际变化，部署 `web/` 到 Cloudflare Pages

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

> 本地运行 `npm run sporttery:auto-deploy` 只会抓取数据、不会部署，日志会提示改用 `npm run cloudflare:deploy`。
> 正式自动更新以 GitHub Actions 为准，不需要 Mac 在线。
