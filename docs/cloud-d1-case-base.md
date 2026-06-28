# Cloudflare D1 Case Base

这个项目的长期数据层使用 Cloudflare Pages Functions + D1。静态页面仍然可以独立打开；D1 绑定完成后，锁版、赛果、复盘案例和历史相似样本可以进入云端数据库，不再依赖本机 Mac 文件。

## 一次性配置

1. 在 Cloudflare 创建 D1 数据库：

```bash
npx wrangler d1 create worldcup-case-base
```

2. 在 Cloudflare Pages 项目 `worldcup-dashboard-4hr` 里绑定 D1：

- Binding name: `DB`
- Database: `worldcup-case-base`

3. 执行建表：

```bash
npx wrangler d1 execute worldcup-case-base --file migrations/0001_case_base_schema.sql --remote
```

4. 部署后验证：

```bash
curl https://worldcup-dashboard-4hr.pages.dev/api/health
```

期望结果：

```json
{
  "ok": true,
  "dbBound": true,
  "version": "V4"
}
```

如果 `dbBound` 是 `false`，说明 Pages Function 已上线，但 D1 还没有绑定到项目。

## 当前 API

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/matches`
- `POST /api/matches`
- `GET /api/locks`
- `GET /api/locks/preferred?matchId=...`
- `POST /api/locks`
- `POST /api/results`
- `GET /api/cases`
- `POST /api/cases/generate`
- `POST /api/review/run`
- `POST /api/similar-cases`

## 数据原则

- 赛前锁版不可覆盖；重复 `lockId` 会返回 409。
- 只有 `FINAL_LOCK` 且已有赛果的记录，才能进入 Case Base。
- 样本不足时只展示参考，不参与置信度修正。
- 前端默认继续使用本地静态数据；云端接口可用后再逐步切换具体页面。
