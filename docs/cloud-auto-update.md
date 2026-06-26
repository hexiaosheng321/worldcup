# 云端自动更新方案

当前方案：Cloudflare Pages 托管页面，浏览器打开网站后直接向体彩官方接口刷新实时数据；GitHub Actions 负责在代码更新后自动部署到 Cloudflare Pages。**不依赖 Mac 在线。**

不采用 Cloudflare Worker / GitHub Cron 直接抓取体彩的原因：体彩官方接口会对云服务器请求返回 `567`，云端不能稳定直接抓取源数据。官方接口允许浏览器跨域访问，因此实时刷新放在前端执行更稳。

## 运行方式

`.github/workflows/sporttery-auto-deploy.yml` 的运行方式：

- 每次 `main` 分支有新提交时直接部署一次，确保 Codex 更新模型、赛程或页面后，线上网站自动同步。

1. 安装 Node 22 和项目依赖
2. 运行 `npm run cloudflare:deploy`
3. 部署 `web/` 到 Cloudflare Pages
4. 用户打开网页后，前端每 5 分钟刷新体彩开盘、赛果、SP 历史

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

> 本地运行 `npm run sporttery:auto-deploy` 仍可手动刷新静态快照，但线上实时刷新以浏览器直连官方接口为准。
> 网站自动发布以 GitHub Actions 为准，不需要 Mac 在线。
