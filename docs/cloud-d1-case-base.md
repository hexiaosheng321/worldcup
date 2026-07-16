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
- `GET /api/shadow-audits`
- `POST /api/shadow-audits/generate`
- `POST /api/review/run`
- `POST /api/similar-cases`
- `GET /api/model-upgrade-notes`
- `POST /api/model-upgrade-notes`

## 数据原则

- 赛前锁版不可覆盖；重复 `lockId` 会返回 409。
- 非世界杯联赛必须先写 `PRE_LOCK` 补齐模型；没有 `finalApproval=true` 时，API 会拒绝写入联赛 `FINAL_LOCK`。
- 只有 `FINAL_LOCK` 且已有赛果的记录，才能进入 Case Base。
- 同场最新 `PRE_LOCK` 且已有赛果的记录进入独立 Shadow Audit，不混入 Case Base 和正式命中率。
- `/api/results` 写入或更新赛果后，会自动触发该场锁版复盘和 Case Base 生成，避免手工比分回填断链。
- Case Base 的 `payload_json` 固定保存比分覆盖、总进球覆盖、让球覆盖、半场比分、失败模式和诊断摘要。
- 每条新 Case 会同步生成一条 `model_upgrade_notes` 记录，用于把赛后诊断沉淀为模型升级候选项。
- `betOutcome` 与 `modelAudit` 分开保存：跳过场的 `betOutcome=VOID` 不计正式推荐胜负，但 `modelAudit` 仍验票胜平负、正式让球、独立让球、条件 Challenger、胜平负+让球联合、总进球和比分。
- Case 同时保存联赛、当前赛季和量化赛季叙事；`VOID` 只能生成影子观察或失败记录，不能因为“不计胜负”被误写成正样本。
- 样本不足时只展示参考，不参与置信度修正。
- 前端默认继续使用本地静态数据；云端接口可用后再逐步切换具体页面。

## 增量迁移

已有 D1 库如果已经执行过 `0001_case_base_schema.sql`，只需要补跑：

```bash
npm run d1:migrate:upgrade-notes
```
