# 统一赛前推演流程

所有世界杯、芬超、韩职比赛统一使用 `UNIFIED_PREDICTION_V1`。旧的联赛生成器也只调用同一个引擎，不再各自维护概率、比分和门禁逻辑。

## 每场比赛的固定顺序

1. 从线上 D1 bootstrap 读取当前比赛和体彩胜平负、让球赔率；`full` 失败时自动降级到 `initial`。
2. 读取线上 SP 历史和 D1 滚动历史样本，计算去水市场概率、近期状态、Poisson 比分和两套情景。
3. 生成七项赛前资料模板：球队状态、伤停、预计首发、动机、天气场地、风格对位、市场消息。
4. 使用搜索逐项补齐，并为每项保存摘要、抓取时间、事实发生/更新时间 `observedAt`、来源 URL、证据等级和数值影响。无法核实的项目保持 `MISSING`，禁止推断成已确认事实。
5. 统一执行赔率完整性、样本量、盘口变化、赛前搜索、比分校验、冲突处理和让球映射七道门禁。
6. 10步中的每一步输出 0-100 分与通过状态；任一道门禁失败只能输出 `PRE_LOCK`，全部通过才允许 `FINAL_LOCK`。
7. 使用 `--publish-run true` 将本次输入与输出写入 D1 `model_runs`，保证每次推演可追溯。正式锁版必须携带该 `modelRunId`，API 会验证比赛、10步门禁、主比分和让球映射，不能再以 `finalApproval` 单独绕过。
8. 赛后复盘记录 Brier Score、Log Loss 和概率校准分箱，除命中率外同时评价概率质量。

```bash
npm run prediction:unified -- --match 1320350 --lock FINAL_LOCK
npm run prediction:unified -- --match 1320350 --evidence /tmp/research-1320350.json --lock FINAL_LOCK --publish-run true
```

资料模板默认写入 `/tmp/unified-research-template.json`。预计首发和临场伤停尚未发布时，应先保留 `PRE_LOCK`，开赛前再次搜索补齐后重跑。

每项研究证据的 `impact` 均为有上限的概率/xG修正，格式如下；中性信息必须明确填写 0，不能省略：

```json
{
  "status": "VERIFIED",
  "evidenceGrade": "A",
  "summary": "可复核的赛前事实与判断依据",
  "capturedAt": "2026-07-10T08:00:00.000Z",
  "observedAt": "2026-07-10T07:30:00.000Z",
  "sources": [{ "title": "来源", "url": "https://example.com" }],
  "impact": { "home": 0.02, "draw": 0.01, "away": -0.03, "xgHome": 0.1, "xgAway": -0.1 }
}
```

## 2026-07-10 连续失败复盘规则

- 让球不穿只调整让球结论，不得自动把胜平负热门改成平局。
- 最终胜平负按全部场景概率汇总，不能由单个主比分直接决定。
- 两个比分必须覆盖不同赛果方向；第二比分是真正反向脚本，不是主脚本的保守缩小版。
- 当市场第一方向领先平局至少 12 个百分点时，改选平局必须有至少两项独立量化证据。
- 球队状态/风格最多使用 7 天内信息，伤停/首发最多 24 小时，天气最多 48 小时，市场消息最多 6 小时。
- `PRE_LOCK` 只作影子测试，不进入正式命中率；同一比赛只有 preferred `FINAL_LOCK` 可以生成正式 Case。
