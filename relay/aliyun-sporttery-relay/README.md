# 阿里云体彩缓存中继

这是给网站自动更新用的体彩官方数据缓存中继。

核心原则：

```text
阿里云服务器后台定时抓体彩官方接口
↓
写入服务器本地 JSON 缓存
↓
GitHub / Cloudflare 只读取缓存
```

这样 GitHub / Cloudflare 不再实时穿透请求体彩官方，稳定性比普通代理更高。

## 功能

- `GET /health`：健康检查。
- `GET /refresh`：手动刷新缓存。
- `GET /sporttery/calculator.json`：读取赛程和开盘缓存。
- `GET /sporttery/results-page-1.json`：读取赛果缓存，最多默认缓存 5 页。
- `GET /fetch?url={encoded-url}`：兼容旧地址，返回对应缓存。
- `GET /proxy?url={encoded-url}`：兼容当前 GitHub Secret，返回对应缓存。
- 可选 `RELAY_TOKEN`：开启后必须带 `?token=...` 或请求头 `x-relay-token`。
- 只允许 `https://webapi.sporttery.cn` 下的以下路径：
  - `/gateway/uniform/football/getMatchCalculatorV1.qry`
  - `/gateway/uniform/fb/getMatchDataPageListV1.qry`
  - `/gateway/uniform/football/getFixedBonusV1.qry`
  - `/gateway/jc/football/getMatchCalculatorV1.qry`

## 阿里云服务器部署

适合轻量应用服务器 / ECS。服务器只需要 Node.js 20 或更新。

推荐安装位置：

```bash
/opt/sporttery-proxy/index.mjs
/opt/sporttery-proxy/package.json
/opt/sporttery-proxy/cache/
```

systemd 服务建议：

```ini
[Unit]
Description=Sporttery cache relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/sporttery-proxy
Environment=PORT=8787
Environment=DATA_DIR=/opt/sporttery-proxy/cache
Environment=REFRESH_INTERVAL_MS=180000
ExecStart=/usr/bin/node /opt/sporttery-proxy/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

部署后验证：

```bash
curl "http://114.55.11.209:8787/health"
curl "http://114.55.11.209:8787/sporttery/calculator.json"
```

`/health` 里的 `service` 应该是：

```json
"sporttery-cache-relay"
```

## 接入 GitHub Actions

当前 Secret 可以继续使用：

```bash
SPORTTERY_UPSTREAM_PROXY=http://114.55.11.209:8787/proxy?url=
```

然后触发 GitHub Actions 手动测试：

```bash
gh workflow run sporttery-auto-deploy.yml \
  --repo hexiaosheng321/worldcup \
  --ref main \
  -f update_data=true
```

测试成功后，GitHub 会每 10 分钟自动抓取体彩数据，有变化就自动部署网站。
