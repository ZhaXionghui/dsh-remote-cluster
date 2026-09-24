# _acc/ —— 0.3.0 取证材料

这里不是发布内容（`files` 里没有它），而是**排查过程的原始记录**，保留下来是因为它支撑了
`package.json` 依赖声明与几个断言族的结论——删掉它，那些结论就只剩结论了。

| 文件 | 是什么 |
|---|---|
| `DIAGNOSIS.md` | 依赖声明缺陷的独立取证：`schemastery@^3.18.2` 不可满足的根因、scope 前缀丢失、以及 `[11]` 为什么曾是假绿（在源码树里跑，pnpm `overrides` 兜住了裸名解析）。 |
| `ACCEPTANCE-REPORT.md` | WSL 端到端验收报告。记录了 `openNativeTerminal` 那次排查的**完整证据链**：跨版本导出对比表、引入提交 `c36edb349f`、「该 API 从未随任何版本发布」的论证，以及当时提出的 A/B/C 三条路线。 |
| `01-install.sh` / `01.log` | 干净安装的复现脚本与输出。 |
| `02-verify.sh` / `02.log` | 安装后核对（六行是否合成、`file://` 是否生成、依赖闭包）。 |
| `03-drift.sh` / `03.log` | 对 vendor 全部 `@deepseek-ai/*` 具名导入做存在性普查。 |
| `probe-npm.mjs` | registry 探测（版本、tarball）。 |
| `scan-deps.mjs` / `analyze-imports.mjs` | 导入图扫描与依赖归属分析。 |

**与最终状态的关系**：`DIAGNOSIS.md` 里报的问题已在 `e5de2a6`、`5afe5b9` 修复；
`ACCEPTANCE-REPORT.md` 报的 `openNativeTerminal` 已在 `7935b4b` 以「降级为
`TERMINAL_UNAVAILABLE`」处理（路线 A）。两份文档记录的是**当时**的证据与判断，
不随修复回填，以免后人以为问题未曾存在。
