# 阿里云体彩中继

这是给网站自动更新用的极简中继，只转发中国体育彩票官方足球接口，避免 GitHub / Cloudflare 直连官方接口时被 `567` 拦截。

## 功能

- `GET /health`：健康检查。
- `GET /fetch?url={encoded-url}`：转发白名单内的体彩官方接口。
- 可选 `RELAY_TOKEN`：开启后必须带 `?token=...` 或请求头 `x-relay-token`。
- 只允许 `https://webapi.sporttery.cn` 下的以下路径：
  - `/gateway/uniform/football/getMatchCalculatorV1.qry`
  - `/gateway/uniform/fb/getMatchDataPageListV1.qry`
  - `/gateway/uniform/football/getFixedBonusV1.qry`
  - `/gateway/jc/football/getMatchCalculatorV1.qry`

## 阿里云函数计算部署

在阿里云函数计算创建一个 HTTP/Web 函数：

1. 运行环境：Node.js 20 或更新。
2. 上传本目录代码，或把 `index.mjs` 和 `package.json` 放到函数代码目录。
3. 启动命令：`npm start` 或 `node index.mjs`。
4. 监听端口：代码会自动读取 `PORT` / `FC_SERVER_PORT` / `CA_PORT`，默认 `9000`。
5. 环境变量：
   - `RELAY_TOKEN`：建议设置一个长随机字符串。
   - `REQUEST_TIMEOUT_MS`：默认 `12000`。
6. 触发器：HTTP 触发器，允许公网访问。

部署后先访问：

```bash
curl "https://你的函数域名/health"
```

如果返回 `{"ok":true,...}`，说明中继运行正常。

## 接入 GitHub Actions

把函数地址写入 GitHub Secret：

```bash
gh secret set SPORTTERY_UPSTREAM_PROXY \
  --repo hexiaosheng321/worldcup \
  --body "https://你的函数域名/fetch?token=你的RELAY_TOKEN&url={url}"
```

如果没有设置 `RELAY_TOKEN`，则使用：

```bash
gh secret set SPORTTERY_UPSTREAM_PROXY \
  --repo hexiaosheng321/worldcup \
  --body "https://你的函数域名/fetch?url={url}"
```

然后触发 GitHub Actions 手动测试：

```bash
gh workflow run sporttery-auto-deploy.yml \
  --repo hexiaosheng321/worldcup \
  --ref main \
  -f update_data=true
```

测试成功后，GitHub 会每 10 分钟自动抓取体彩数据，有变化就自动部署网站。
