# Graphify 项目构图规则

项目中的比赛锁版、研究证据和翻译 JSON 是运行数据，不是代码结构。它们由 `.graphifyignore` 排除，避免数据文件被错误计为“零 AST”。

## 环境准备

```bash
npm run graphify:setup
```

这会在当前 Graphify Python 环境中安装项目固定版本及 SQL 解析扩展，使 `migrations/*.sql` 可以生成 AST。

## 健康检查

```bash
npm run graphify:health
```

健康检查会重新执行一次无语义成本的代码 AST 抽取，并执行以下项目契约：

- `ref_*` 和清单文件声明的依赖生成明确的外部依赖节点，不再作为悬空端点；
- 顶层回调产生的绝对路径 caller ID 只有在能唯一对应本文件节点时才重写；
- 相对路径导入的导出常量只有在能定位真实模块和定义行时才生成 binding 节点；
- 同一有向端点对的多种关系合并为一条复合关系，同时在 `parallel_edges` 中保留每条原始关系；
- 构图必须使用有向图，双向调用因此不会被无向折叠。

任何无法证明来源的内部端点仍会使检查失败，不会用猜测节点掩盖。

## 完整构图

Graphify 完成 AST 与 semantic 合并、生成 `graphify-out/.graphify_extract.json` 后，在 build/cluster 前运行：

```bash
npm run graphify:normalize
```

随后按 `directed=True` 构建图。项目适配器会原子覆盖 extraction；若仍有无法解析的内部端点则拒绝写入。

适配器测试：

```bash
npm run graphify:test
```
