# 0.3.0 WSL 端到端验收报告

dsh `0.1.5-rc.3` · Ubuntu-22.04 (WSL2) · 2026-09-18

---

## 一、修复成果（已验证）

### 1. 依赖声明修复 — 通过

原 `package.json` 缺 6 个必需依赖 + 1 个 scope 写错，现已补全：

```json
"dependencies": {
  "@deepseek-ai/dsh-credentials": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-native-command": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-output-retention": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-settings": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-typert-protocol": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-util-values": "^0.1.5-rc.3",
  "@deepseek-ai/schemastery": "3.18.2",
  "schemastery": "^3.18.0",
  "ssh2": "^1.17.0",
  "ws": "^8.18.0"
},
"peerDependencies": { "@deepseek-ai/cordis": "4.0.2" }
```

- `@deepseek-ai/schemastery` 用**精确 `3.18.2`**：因为 `dsh-settings` 的 peer 就是精确 `3.18.2`，用 `^` 会被解析到 `3.18.4` 触发 unmet warning。
- `@deepseek-ai/cordis` 归 **peer**：与 `dsh-base`/`dsh-web-app` 的声明方式一致（它不在 `node_modules` 里，由 profile flatten 提供）。
- `schemastery`（native）与 `@deepseek-ai/schemastery`（scoped fork）是**两个不同的包**，必须分别声明。

### 2. 安装 — 通过

```
add rc=0        Packages: +22        Done in 4m 9.5s (pnpm 10.33.0)
bundles: ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-remote-cluster"]
```

### 3. 六个 id 合成 — 通过

`dsh --profile web --dump-config` → **565 行**（空 profile 为 539 行，+26 即本层）

| id | 出现次数 |
|---|---|
| remote-hosts | 2 |
| remote-hosts-ssh | 1 |
| remote-host-controller | 1 |
| tool-remote-host | 1 |
| better-sidebar | 1 |
| ui-remote-host | 1 |

**缺失 id 数: 0**

### 4. `./vendor` 相对名 + 运行时 `file://` 生成 — 通过

```
543:  file:///home/zxh/.dsh/profiles/web/node_modules/dsh-remote-cluster/vendor/host-remote-host/lib/index.js
546:  .../vendor/host-remote-host-ssh/lib/index.js
556:  .../vendor/remote-host-controller/lib/index.js
559:  .../vendor/tool-remote-host/lib/index.js
562:  .../vendor/better-sidebar/lib/index.js
565:  .../vendor/ui-remote-host/lib/index.js
```

六行全部正确落到 profile 内的 `node_modules/dsh-remote-cluster/vendor/`。仓库里存的是可移植字面量，绝对 `file://` URL 由 `anchorInsertedPluginNames` 在运行时生成 —— 机制按设计工作。

### 5. 依赖解析 — 通过

profile `node_modules/@deepseek-ai` 下出现 9 个包（原为 0）：

```
cosmokit  dsh-brand  dsh-credentials  dsh-native-command
dsh-output-retention  dsh-settings  dsh-typert-protocol
dsh-util-values  schemastery
```

---

## 二、暴露的真实缺陷（阻塞启动）

### 症状

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
failed to import loader entry remote-hosts-ssh (.../vendor/host-remote-host-ssh/lib/index.js):
The requested module '@deepseek-ai/dsh-native-command' does not provide an export named 'openNativeTerminal'
```

### 根因：vendor 代码依赖了未发布的 API

`@deepseek-ai/dsh-native-command` 的导出跨版本对比：

| 来源 | `openNativeTerminal` | `nativeFileManager` |
|---|---|---|
| 源码树 `0.1.2-alpha.2` (`c36edb349f`) | **有** | 无 |
| npm `0.1.5-rc.1` | 无 | 有 |
| npm `0.1.5-rc.2` | 无 | 有 |
| npm `0.1.5-rc.3` | 无 | 有 |

**双向漂移**：源码树新增了 `openNativeTerminal`，npm 版本保留着 `nativeFileManager`。

### 引入点

```
提交:  c36edb349f   2026-09-14 19:12
标题:  feat(remote-host): project remote hosts into tools, API, and the web client
tags:  无（git tag --contains c36edb349f 为空）
HEAD:  de97b65b44（本提交是其祖先）
```

`packages/util/native-command/src/terminal-opener.ts:133` 的 `openNativeTerminal`
是在此提交中**新增**的，且**排在 `3f1b46a5db release(dsh): 0.1.2-alpha.2` 之后**。

⇒ **该 API 从未随任何版本发布。** 因此 vendor 进插件的 remote-host 代码，
在结构上无法在任何已发布 dsh 上运行。

### 为什么这是可选能力（降级有设计背书）

设计笔记 `.agents/notes/implemented/feature/2026-09-09-remote-host-native-terminal.zh.md`：

> 远程主机 Service Definition 暴露**可选的** `openTerminal()` provider 操作。

Service Definition 实现（`vendor/host-remote-host/lib/index.js:122-127`）：

```js
async openTerminal(id) {
  this.assertActive();
  const backend = this.expect(id);
  if (backend.openTerminal === void 0)
    throw new RemoteHostError(`remote host "${id}" has no native terminal launcher`,
                              "TERMINAL_UNAVAILABLE");
  await backend.openTerminal();
}
```

**显式处理了 `openTerminal` 未定义的分支**，抛 `TERMINAL_UNAVAILABLE`，
由 controller 映射为 `remote-host/terminal-unavailable`。

该能力的用途（据笔记）：绕过浏览器轮询，在原生终端里完成密码 / MFA / 主机密钥 / 私钥口令提示。
笔记明确写道：**"面板内认证路径仍然可用，用于建立由 DSH 管理的连接。"**

调用点只有 1 处（`vendor/host-remote-host-ssh/lib/index.js:223`）；
`lib/types/terminal.js` 中的另一处属编译残留死代码（`exports` 表不含 `types/`）。

---

## 三、API 漂移普查结论

对 vendor 全部 33 个 `@deepseek-ai/*` 具名导入做存在性核对：

**缺失符号总数: 1**（仅 `openNativeTerminal`）

其余全部 `ok`，含：
`credentialKey` · `TextRetainer` · `SettingsConflictError` · `Remote` · `RemoteError`
· `TypertRemoteService` · `deepEqualJson` · `SessionLogOffset` · `defineTool`
· `TOOL_ABORTED` · `createUserMessage` · `HarnessError` · `snapshotSubagentDescriptor` · `Service`

⇒ **漂移面极窄，修复成本低。**

---

## 四、待决事项

唯一阻塞项是 `openNativeTerminal`。三条路线：

| 路线 | 做法 | 代价 |
|---|---|---|
| **A. 降级移除**（推荐） | 删掉该 import 与调用，让 `openTerminal` 走既有 `TERMINAL_UNAVAILABLE` 分支 | 失去"原生终端认证"路径；面板内认证不受影响 |
| **B. 内联实现** | 把 `terminal-opener.ts` 一并 vendor 进来 | 体积小（单文件），但需处理其对 `nativeFileManager` 等的反向依赖 |
| **C. 补丁上游** | 把 `c36edb349f` 的 native-command 部分单独发版 | 触及上游发布流程，超出插件职责 |

另需修 `tools/verify-bundle.mjs`：新增「每个 vendor 裸导入必须在 dependencies 中有声明」
与「每个具名导入必须在目标包中真实存在」两族断言，堵住这次的假绿。
