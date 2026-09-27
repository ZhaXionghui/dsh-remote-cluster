# desktop profile 诊断（2026-09-27）

## 一、结论速览

| 观察到的现象 | 真正原因 |
|---|---|
| `interception error: list slot "conversation.chat.turnTail" requires options.id` | 我们 vendor 的 `better-sidebar@0.19.1` 与官方新版 UI 冲突；**官方已弃用 better-sidebar** |
| `remote-hosts-ssh` / `tool-remote-host` 显示**异常** | 六个 id 与官方 bundle **重复注入**，重复 id 使整个 group 回滚 |
| 安装时报错 | `ssh2` 的 `cpu-features` 原生绑定编译失败（找不到 Python）——**无害**，ssh2 有纯 JS 回退 |
| 桌面端"已有官方侧边栏" | 属实。`0.1.7-rc.2` 已用官方 `ui-sidebar` 取代 `better-sidebar` |

## 二、桌面客户端的真实身份

- 安装位置：`D:\Administrator\ProgramFiles\DeepSeek Harness\`
- 版本：**`0.1.7-rc.2`**（`resources/runtime/primary-runtime/runtime.json` 的 `desktopVersion`）
- 自带 Node `24.21.0` / pnpm `11.7.0` / Python `3.12.14`（Electron 44.0.0）
- 待安装更新包：`@deepseek-aidsh-desktop-updater/pending/deepseek-harness-0.1.7-rc.2-win-x64.exe`

## 三、关键证据：0.1.7-rc.2 的 bundle 内容

### `dsh-web-app@0.1.7-rc.2`（从 npm 实拉核实）

**`better-sidebar` 行已被彻底删除**，取而代之的是整套官方 sidebar：

```
ui-layout
ui-sidebar                        @deepseek-ai/dsh-client-ui-sidebar
ui-sidebar-right                  @deepseek-ai/dsh-client-ui-sidebar-right
ui-sidebar-documentpreview        @deepseek-ai/dsh-client-ui-sidebar-documentpreview
ui-sidebar-browser                @deepseek-ai/dsh-client-ui-sidebar-browser
ui-sidebar-terminal               @deepseek-ai/dsh-client-ui-sidebar-terminal
ui-sidebar-files                  @deepseek-ai/dsh-client-ui-sidebar-files
```

`grep -nE "better-sidebar|remote-host" cordis.patch.yml` → **0 命中**。

### `dsh-base@0.1.7-rc.2`

`grep -nE "remote-host|remote-hosts" cordis.patch.yml` → **0 命中**。

### npm 上的 remote-host 包

`@deepseek-ai/dsh-host-remote-host@0.1.7-rc.2` → **E404**
`@deepseek-ai/dsh-client-ui-remote-host@0.1.7-rc.2` → **E404**

⇒ **远程主机子系统至今仍未发布**，插件仍有存在价值；但 `better-sidebar` 已成历史包袱。

## 四、必须注意的环境陷阱：源码树符号链接污染

> **已处理（2026-09-27）**：共 **707 个**链接（不止下面写的 231 个）已全部移出，
> 细节与回滚方式见 [`SYMLINK-PURGE.md`](SYMLINK-PURGE.md)。本节保留原始记录。

`C:\Users\Administrator\.dsh\profiles\node_modules\@deepseek-ai\` 下有 **231 个符号链接**，
**全部指向 `D:\Dev\deepseek-harness`**（建于 Aug 31 22:14，早于全部 remote-host 开发）：

```
dsh              -> /d/Dev/deepseek-harness/apps/cli
dsh-base         -> /d/Dev/deepseek-harness/apps/cli/node_modules/@deepseek-ai/dsh-base
dsh-web-app      -> .../dsh-client-ui-sidebar
dsh-client-ui-sidebar -> /d/Dev/deepseek-harness/apps/cli/node_modules/@deepseek-ai/dsh-web-app/node_modules/@deepseek-ai/dsh-client-ui-sidebar
```

后果：
1. `dsh-base` / `dsh-web-app` 版本是 **`0.1.2-alpha.2`（源码树）**，不是客户端的 `0.1.7-rc.2`
2. 任何"在源码树内跑"的检查都不可信（同 0925 那次的 `overrides` 假绿，性质相同）
3. 桌面端看到的"官方侧边栏"里，有一部分是**源码树构建产物**

⇒ 若要复现客户端真实行为，必须先把这些链接摘掉，让 profile 从 npm 拉真实版本。
**已执行，见 [`SYMLINK-PURGE.md`](SYMLINK-PURGE.md)。**

## 五、官方 sidebar 的扩展契约（已查清）

`ui-remote-host` 原来依赖 `betterSidebar` 的 4 个方法：

```js
ctx.betterSidebar.registerTab({...})        // client.js:947
ctx.betterSidebar.getSnapshot()             // :957
ctx.betterSidebar.openTab({type:"remote-hosts"}, {sessionId})  // :960
ctx.betterSidebar.subscribeState(...)       // :963
```
且 `dsh.client.inject = ['locale','betterSidebar','remote','remote.remoteHosts']`。

### 官方替代：`ui-sidebar` + `sidebarRightTabs` + `slots`

`@deepseek-ai/dsh-client-ui-sidebar@0.1.7-rc.2`（32 KB client.js，`lib/index.js` 仅 181 B 空壳）：

- 提供服务 **`sidebar`**（不是 `betterSidebar`）
- `inject = ["slots","layout","uiWorkspace","locale","shortcuts"]`
- 面板列表来自 slot **`sidebar.panellist`**：
  ```js
  ctx.slots.entriesOfSlot("sidebar.panellist")
     .map(({ options }) => ({ id: options.id, order: options.order ?? 0,
                              label: resolveSlotLabel(options.label) ?? id }))
  ```
  ← **`list slot "requires options.id"` 这条报错就是它发出的**：我们的 `better-sidebar@0.19.1`
  往这个 slot 注册时没带 `id`，于是被官方校验拦下。
- 切换面板：`ctx.layout.selectPanel(id)`

### 官方 tab 注册范例（`dsh-client-ui-sidebar-files@0.1.7-rc.2`）

```js
const FILES_ID   = "@deepseek-ai/dsh-client-ui-sidebar-files"
const FILES_KIND = "files"

const inject = ["slots","locale","sidebarRightTabs","sidebarRight","remote","remote.workspaceFiles"]

// 1) 注册 tab 类型
ctx.effect(() => ctx.sidebarRightTabs.register({
  id: FILES_ID, kind: FILES_KIND, priority: "builtin",
  title: () => t("type.label"),
  guide: [{ id: "workspace", commandId: "workspace.files", order: 10,
            title, description, icon: GuideArtworkFiles }]
}), "…: files type")

// 2) 注册 tab 主体
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
  name: "sidebar.right.pane.tab", key: FILES_ID, locale: NS, store, inject
}, FilesBody)), "…: files tab body")

// 3) 注册 tab 标题
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
  name: "sidebar.right.pane.tab.title", key: FILES_ID
}, FilesTitle)), "…: files tab title")
```

⇒ **迁移路径明确**：`ui-remote-host` 的 4 处 `betterSidebar.*` 改写为
`sidebarRightTabs.register` + `slots.register("sidebar.right.pane.tab")`
+ `slots.register("sidebar.right.pane.tab.title")`，`inject` 换成
`["locale","sidebarRightTabs","sidebarRight","remote","remote.remoteHosts"]`。

## 六、改造方案（三档）

| 档位 | 做法 | 适用 |
|---|---|---|
| **A（最小改动）** | 删掉 `better-sidebar` 行，不再 vendor `dsh-better-sidebar`；`ui-remote-host` 改写为官方 slot 模型 | 目标是 0.1.7-rc.x 桌面端 |
| **B（双兼容）** | 运行时探测：有 `sidebar` 服务走官方 slot，有 `betterSidebar` 走旧 API | 需同时支持 0.1.5-rc.x 与 0.1.7-rc.x |
| **C（按版本分层）** | 升到 0.4.0，明确只支持 `0.1.7-rc.x+` | 最干净，放弃 0.1.5 兼容 |

另需处理：**五个 id 的重复注入**。
**注意（2026-09-27 更新）**：最初设想的「插件在官方 bundle 已声明该行时优雅让位」
**已被实测否证** —— 行级 `disabled` 的求值时机晚于重复 id 检查，任何守卫都拦不住。
最终方案是把适用条件写成硬约束（本包只用于不含这些行的 dsh），证据见
[`YIELD-GUARD-REFUTED.md`](YIELD-GUARD-REFUTED.md)。

更关键的是：**桌面端那两行「异常」的根因正是第四节的符号链接污染** —— 那 231 个链接
让 profile 挂上了**自带这些行**的源码树 bundle（`dsh-base` 占 3 个、`dsh-web-app` 占 2 个，
另有 `better-sidebar`），于是本包的五行必然冲突。摘掉链接、让 profile 从 npm 拉
真实的 `0.1.7-rc.2`（其 base/web-app 不含任何 remote-host 行与 better-sidebar）之后，
本包的五行才能正常插入。

`ssh2` 的 `cpu-features` 编译失败**无害**（ssh2 有纯 JS 回退），建议 README 注明。
