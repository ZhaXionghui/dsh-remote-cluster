# 0.3.0 依赖声明缺陷 —— 独立取证结论

结论：**0.3.0 的 `package.json` 依赖声明是错的，且 `tools/verify-bundle.mjs` 的断言 `[11]` 是假绿 —— 它在 harness 源码树里跑，那里有 pnpm `overrides` 兜住了裸名解析。**

---

## 1. 直接症状

WSL 安装 `dsh plugin --profile web add file:/mnt/d/Dev/dsh-remote-cluster` 失败：

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found for schemastery@^3.18.2
The latest release of schemastery is "3.18.0".
```

## 2. 根因：scope 前缀丢失

`vendor/host-remote-host-ssh/lib/index.js:9` 导入的是：

```js
import z from "@deepseek-ai/schemastery";
```

而 `package.json` 声明的是：

```json
"schemastery": "^3.18.2"
```

**`@deepseek-ai/` 前缀被丢掉了。** 这是两个完全不同的包：

| 包名 | npm 最新 | 使用者 |
|---|---|---|
| `schemastery`（native） | `3.18.0` | `vendor/better-sidebar` |
| `@deepseek-ai/schemastery`（scoped fork） | `3.18.4`（含 `3.18.2`） | `vendor/host-remote-host-ssh` |

pnpm 去 native 包找 `^3.18.2` → 不存在 → 报错。**两个包都必须声明。**

## 3. 断言 `[11]` 为什么假绿

harness 源码树里：

| 位置 | 实际形态 |
|---|---|
| `deepseek-harness/node_modules/@deepseek-ai/schemastery` | **REAL，ver `0.1.5-rc.3`**（npm 装下来的，是另一个包） |
| `deepseek-harness/vendor/schemastery` | 本地 fork，ver `3.18.2` |
| `pnpm-workspace.yaml` overrides | `'@deepseek-ai/schemastery': 'link:vendor/schemastery'` |

`overrides` 把裸名 `@deepseek-ai/schemastery` **劫持到本地 fork**。断言在源码树里跑，裸名能解析 → 绿。**离开源码树（安装到 profile）就必然失败。**

## 4. 完整缺陷清单（7 个缺失依赖）

用 `_acc/scan-deps.mjs` 扫描 vendor 全部裸导入，逐个核对「已发布 dsh 是否自带」
（依据 `D:/Dev/.pubdsh/pkgs/{dsh-base,dsh-web-app}/node_modules/@deepseek-ai`）：

| 依赖 | 使用者 | 已发布 dsh 自带 | npm 可获取版本 |
|---|---|---|---|
| `@deepseek-ai/cordis` | host-remote-host | ✗ | `4.0.4`（独立版本线） |
| `@deepseek-ai/dsh-credentials` | host-remote-host-ssh | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-native-command` | host-remote-host-ssh | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-output-retention` | host-remote-host-ssh | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-settings` | better-sidebar | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-typert-protocol` | remote-host-controller | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/dsh-util-values` | host-remote-host-ssh | ✗ | `0.1.5-rc.3` |
| `@deepseek-ai/schemastery` | host-remote-host-ssh | ✗（自带的是 0.1.5-rc.3 同名异包） | `3.18.4` |

**7 个包全部在 npm 上可获取** —— 所以修复路线是「补全 `dependencies` 声明」，而不是「再 vendor 一层」。

## 5. 两个误报（已排除）

- `extension` —— 仅出现在 `vendor/better-sidebar/lib/client-mermaid.js:21431` 的**文档注释**里（`* from "extension" will be copied...`），不是 import。
- `react/jsx-runtime` —— 客户端 bundle 走平台注入的 `require` shim（`dsh.client` 机制），不需声明。

## 6. 权威依据：源包 `package.json`

从 `D:/Dev/deepseek-harness/packages/*/` 读出（`workspace:^` → 已发布 `^0.1.5-rc.3`）：

```
host/remote-host            peer: @deepseek-ai/cordis
host/remote-host-ssh        dep:  dsh-credentials, dsh-native-command, dsh-output-retention,
                                 dsh-settings, dsh-util-values, @deepseek-ai/schemastery, ssh2
host/tool-remote-host       peer: (全部由 dsh 自带)
api/remote-host-controller  dep:  zod;  peer: dsh-typert-protocol
client/ui-remote-host       peer: @deepseek-ai/cordis
```

注：`zod` 在 vendor 的 `lib/*.js` 里**未见 `from "zod"` 导入**（可能被内联或走 typert），待确认是否需要声明。

## 7. 修复方案

1. `package.json` 的 `dependencies` 改为：

```json
"dependencies": {
  "@deepseek-ai/cordis": "^4.0.4",
  "@deepseek-ai/dsh-credentials": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-native-command": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-output-retention": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-settings": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-typert-protocol": "^0.1.5-rc.3",
  "@deepseek-ai/dsh-util-values": "^0.1.5-rc.3",
  "@deepseek-ai/schemastery": "^3.18.2",
  "schemastery": "^3.18.0",
  "ssh2": "^1.17.0",
  "ws": "^8.18.0"
}
```

2. `tools/verify-bundle.mjs` 新增断言族：**每个 vendor 裸导入必须在 `dependencies` 里有对应声明**（用 `_acc/scan-deps.mjs` 的逻辑），彻底堵住这类假绿。

3. 重新在 WSL 做端到端验收。
