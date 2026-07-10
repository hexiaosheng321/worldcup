# 统一赛前推演流程

所有世界杯、芬超、韩职比赛统一使用 `UNIFIED_PREDICTION_V1`。旧的联赛生成器也只调用同一个引擎，不再各自维护概率、比分和门禁逻辑。

## 每场比赛的固定顺序

1. 从线上 D1 bootstrap 读取当前比赛和体彩胜平负、让球赔率；`full` 失败时自动降级到 `initial`。
2. 读取线上 SP 历史和 D1 滚动历史样本，计算去水市场概率、近期状态、Poisson 比分和两套情景。
3. 生成七项赛前资料模板：球队状态、伤停、预计首发、动机、天气场地、风格对位、市场消息。
4. 使用搜索逐项补齐，并为每项保存摘要、抓取时间和来源 URL。无法核实的项目保持 `MISSING`，禁止推断成已确认事实。
5. 统一执行赔率完整性、样本量、盘口变化、赛前搜索、比分校验、冲突处理和让球映射七道门禁。
6. 任一道门禁失败只能输出 `PRE_LOCK`；全部通过才允许 `FINAL_LOCK`。
7. 使用 `--publish-run true` 将本次输入与输出写入 D1 `model_runs`，保证每次推演可追溯。正式锁版仍通过 locks 接口完成，不能用模型运行记录代替锁版。

```bash
npm run prediction:unified -- --match 1320350 --lock FINAL_LOCK
npm run prediction:unified -- --match 1320350 --evidence /tmp/research-1320350.json --lock FINAL_LOCK --publish-run true
```

资料模板默认写入 `/tmp/unified-research-template.json`。预计首发和临场伤停尚未发布时，应先保留 `PRE_LOCK`，开赛前再次搜索补齐后重跑。
