<div align="center">

# 🔌 dsh-remote-cluster

**把 HSAgent 的远程集群 / HPC MCP 工具接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的官方 profile bundle。**

[![dsh bundle](https://img.shields.io/badge/dsh-bundle-4f46e5.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/ZhaXionghui/dsh-remote-cluster)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%20%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/Protocol-MCP-ff6b35.svg)](https://modelcontextprotocol.io)

[安装](#-安装) · [验证](#-验证) · [卸载](#-卸载) · [目录结构](#-目录结构) · [前置条件详解](#-前置条件详解)

</div>

---

## 这是什么

`dsh-remote-cluster` 是 DeepSeek Harness（DSH）的一个 **profile bundle**。它本身不含任何业务逻辑，只有一份 `cordis.patch.yml`，作用是向某个 DSH profile 里插入一个 `@deepseek-ai/dsh-mcp-client` 节点，让 DSH 以 **stdio** 方式拉起本地的 HSAgent MCP server，从而把 `hpc_login` / `execute_hpc_command` / `submit_hpc_job` 等远程集群工具变成模型可直接调用的工具。

```
┌──────────────┐   stdio (MCP)   ┌──────────────────────┐   SSH    ┌─────────────┐
│  DeepSeek    │ ◄─────────────► │  hsagent-bridge      │ ◄──────► │  HPC 集群   │
│  Harness     │                 │  serve（本地子进程）  │          │  Slurm 等   │
└──────────────┘                 └──────────────────────┘          └─────────────┘
        ▲
        │ dsh.profile.bundles: ["dsh-remote-cluster"]
        │
   cordis.patch.yml
```

> ⚠️ **本仓库只含 DSH 打包层，不含任何 Python 代码。**
> Python 实现在上游 **[hsagent-platform](https://github.com/ZhaXionghui/hsagent-platform)**（基于其二次封装打包），本仓库仅负责「把它接进 DSH」。

---

## ✅ 前置条件

| # | 条件 | 说明 |
|---|------|------|
| 1 | **DSH 已安装且可用** | 终端里 `dsh --version` 有输出；`pnpm` 在 PATH 上（`dsh plugin` 是 pnpm 的转发层） |
| 2 | **Python ≥ 3.11** | HSAgent 的要求 |
| 3 | **已安装 HSAgent** | `pip install hsagent-platform`，且该 Python 环境对 DSH 进程可见 |
| 4 | **`hsagent-bridge` 可执行** | Linux/macOS：`which hsagent-bridge` 有输出；Windows：在 WSL 发行版里 `which hsagent-bridge` 有输出。找不到说明第 3 步没生效 |
| 5 | **Windows 专属：WSL2 可用** | 已在发行版内部完成第 3 步（详见[平台自适应](#-平台自适应开箱即用无需手动改配置)） |
| 6 | **集群会话已建立** | 首次使用需先在**独立终端**执行 `hsagent-bridge hpc login --cluster <id> --host <host> --user <user>`（stdio 模式下无法交互输入密码/OTP） |

### 📍 术语：`DSH_HOME` 是什么

`DSH_HOME` 是 DSH 存放全部用户数据（profile、配置、会话等）的**单一根目录**，profiler 目录就是 `$DSH_HOME/profiles/<profile名>/`。

- **默认值**：`~/.dsh`（即用户家目录下的 `.dsh`）；
- **优先级**：显式配置 > 环境变量 `$DSH_HOME` > 默认 `~/.dsh`（源码 `packages/util/home-paths/src/index.ts:87-91`，默认Home 定义在同文件 `:61-63`）；
- **为空视为未设置**：`$DSH_HOME` 是空白字符串时会回落到默认值，不会被解析成当前工作目录；
- **怎么查**：没有专门的子命令（`dsh` 只有 `web` / `plugin` 两个子命令），按上面的优先级推算即可；想显式指定就设环境变量：

```bash
# Linux / macOS
export DSH_HOME="$HOME/.dsh"
# Windows PowerShell
$env:DSH_HOME = "$env:USERPROFILE\.dsh"

echo "$DSH_HOME/profiles/<profile名>/package.json"   # 应存在
```

下文凡出现 `$DSH_HOME`，都按此处取值。

### 🖥️ 平台自适应（开箱即用，无需手动改配置）

HSAgent 依赖 SSH ControlMaster，**不支持原生 Windows**。所以本 bundle 内置了按平台切换的启动方式：

| 平台 | 实际执行的命令 |
|------|----------------|
| Linux / macOS | `hsagent-bridge serve` |
| Windows | `wsl hsagent-bridge serve` |

这条切换写在 `cordis.patch.yml` 里，靠 `!!js` 表达式在运行期求值，**你不需要做任何手工覆盖**。

Windows 上的前置条件（多一步）：

1. 已安装 **WSL2** 发行版；
2. 在 **WSL 发行版内部**完成 `pip install hsagent-platform`（不是装到 Windows 的 Python 里）；
3. `hsagent-bridge` 在该发行版的 PATH 上。自检：WSL 终端里跑 `which hsagent-bridge`，应有输出，通常是 `/home/<用户名>/.local/bin/hsagent-bridge`。

> 若某些发行版的非登录 shell 不加载 `~/.local/bin`，可在该发行版里用绝对路径兜底（`wsl /home/<用户名>/.local/bin/hsagent-bridge serve`）——只需确保该路径在你的发行版里存在。

---

## 📦 安装

一条命令，装进指定 profile（`hsagent` 请替换成你自己的 profile 名）：

```bash
dsh plugin --profile hsagent add 'git+https://github.com/ZhaXionghui/dsh-remote-cluster.git#dsh-plugin-v0.1.1'
```

GitCode 镜像（国内网络备选）：

```bash
dsh plugin --profile hsagent add 'git+https://gitcode.com/ZhaXionghui/dsh-remote-cluster.git#dsh-plugin-v0.1.1'
```

也可以跟分支走（滚动更新，不推荐用于生产）：

```bash
dsh plugin --profile hsagent add 'git+https://github.com/ZhaXionghui/dsh-remote-cluster.git#dsh-plugin'
```

> 💡 为什么不用 `npm install`？
> 本 bundle **故意**做成零依赖、零构建的纯 patch 包。`dsh plugin add` 是 pnpm 的薄转发层，git 依赖拉的是源码；一旦包里带 `prepare` / `build` 脚本，pnpm ≥ 10 的 `allowBuilds` 会直接拦截安装。所以这里 `lib/index.js` 只有一行 `export {}`，装完即用、无需任何 allowBuilds 配置。

---

## 🔍 验证

**1. 确认 bundle 已被识别为 profile 层**

```bash
cat "$DSH_HOME/profiles/hsagent/package.json"
```

应能看到：`dsh.profile.bundles` 数组里有 `"dsh-remote-cluster"`。若只有 dependencies 没有 bundles，说明包没被识别成 bundle（检查 `dsh.bundle.patch` 是否丢失）。

**2. 确认 patch 被正确合成**

```bash
dsh --profile hsagent --dump-default-config
```

输出里应出现下面这段。`# == dsh-remote-cluster` 是来源注释，说明这一行确实由本 bundle 提供：

```yaml
# == dsh-remote-cluster
- id: hsagent-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: hsagent
    transport: stdio
    command: !!js 'process.platform === "win32" ? "wsl" : "hsagent-bridge"'
    args: !!js 'process.platform === "win32" ? ["hsagent-bridge", "serve"] : ["serve"]'
    cwd: !!js process.cwd()
```

> ⚠️ **注意：`command` / `args` 在这里显示的是未求值的 `!!js` 表达式，不是算好的命令。**
> `--dump-default-config` 只做「合成」，不执行 `!!js`（`dump-config.ts:3-4` 明确不求值）；真正的求值发生在 Loader 加载时，届时才会按你所在平台变成 `hsagent-bridge serve` 或 `wsl hsagent-bridge serve`。
> 换言之：**在任何平台上，`--dump-default-config` 的输出都长得跟上面一模一样**。如果你看到的是已经算好的命令，那是 `--dump-config`（不带 `default`）叠加了别的层，不是这个 bundle 本身。

**3. 确认 MCP server 本体能起来（不经过 DSH）**

Linux / macOS：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' | hsagent-bridge serve
```

Windows（在 PowerShell 里，走 WSL）：

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' | wsl hsagent-bridge serve
```

返回一段包含 `"serverInfo"` 的 JSON 即正常；若报 `command not found`，回到[前置条件](#-前置条件)第 3、4 步（Windows 请检查 WSL 发行版内是否已装好）。

**4. 在会话中验证工具已挂载**

启动 DSH 后问模型：

> 用 `mcp__hsagent__hpc_status` 看一下 `my-cluster` 的会话状态。

工具按 `mcp__<serverName>__<原始工具名>` 命名，即 `mcp__hsagent__*` 前缀。

---

## 🗑 卸载

```bash
dsh plugin --profile hsagent remove dsh-remote-cluster
```

DSH 会自动 reconcile `dsh.profile.bundles`，把该层从 profile 里摘掉。想彻底清干净，可再删除 profile 目录下的 `node_modules/dsh-remote-cluster`。

---

## 📁 目录结构

```
dsh-remote-cluster/
├── package.json          # bundle 声明：dsh.bundle.patch → ./cordis.patch.yml
├── cordis.patch.yml      # 唯一的实质内容：insert 一个 mcp-client 节点（含平台自适应）
├── lib/
│   └── index.js          # 空模块（export {}），让 git 安装跳过构建
├── tools/
│   └── verify-bundle.mjs # 回归校验：真实 loader 解析 + 双平台分支断言
├── README.md
├── LICENSE
└── .gitignore
```

**为什么 `lib/index.js` 是空的？** DSH 判定一个依赖是否「bundle」只看它的 `package.json` 里有没有 `dsh.bundle`，真正的挂载行为全部由 `cordis.patch.yml` 声明。留一个最小的合法 ESM 模块，可以保证从 git 源码安装时不会因为缺少入口而触发任何构建流程。

`tools/verify-bundle.mjs` 只在开发期用，不在 `package.json` 的 `files` 里，不会进安装产物。改动 `cordis.patch.yml` 后建议跑一次：

```bash
node tools/verify-bundle.mjs
```

---

## 🔧 前置条件详解

### DSH 侧做了什么（不多不少）

1. `dsh plugin --profile <p> add <spec>` → 转发给 `pnpm add`，在 `<DSH_HOME>/profiles/<p>/` 里装包；
2. reconcile：扫描 profile 的 dependencies，凡是 `package.json` 里声明了 `dsh.bundle` 的，把它的真名 append 进 `dsh.profile.bundles`；
3. 启动时按层序加载每个 bundle 的 patch 文件，把 `hsagent-mcp` 这一行合成进最终配置树；`command` / `args` 在此刻按平台求值，然后由 `@deepseek-ai/dsh-mcp-client` 拉起子进程并注册工具。

**DSH 不负责安装 MCP server 本体。** `hsagent-bridge` 必须你已经用 pip 装好。

### 为什么选用 `hsagent-bridge serve` 作为启动命令

`hsagent-bridge` 是 `hsagent-platform` 随 wheel 一起发布的 console script（上游 `pyproject.toml:13`），它的 `serve` 子命令（`hsagent_bridge/__main__.py:40-41`）以 stdio 拉起 FastMCP 服务，并注册全部 HPC 工具（`hsagent_bridge/server.py`）——这正是以 stdio 暴露远程集群能力、且随 `pip install` 直接可用的入口。

### 平台自适应是怎么实现的

`cordis.patch.yml` 里 `command` / `args` 写成 `!!js` 表达式，由 DSH 的 Cordis loader 在运行期按 `process.platform` 求值：

```yaml
command: !!js 'process.platform === "win32" ? "wsl" : "hsagent-bridge"'
args:    !!js 'process.platform === "win32" ? ["hsagent-bridge", "serve"] : ["serve"]'
```

等价的伪代码：

```
if (process.platform === 'win32') spawn('wsl', ['hsagent-bridge', 'serve'])
else                             spawn('hsagent-bridge', ['serve'])
```

两个细节值得留意：

- 表达式必须**加引号**。YAML 里 `: ` 是键值分隔符，不加引号的三元表达式会被解析成一个「以表达式对象为键的映射」——**不报错，但配置静默损坏**，是最难排查的一类问题。因此这里用单引号包住整个表达式、内部字符串用双引号。
- 求值发生在 Loader 加载期，不在 dump 期。`--dump-default-config` 打印的原始表达式在每个平台上都相同，真正变成具体命令是在运行时——验证方式见[上文](#-验证)。

仓库自带的 `tools/verify-bundle.mjs` 会用 DSH 真实 loader 解析该文件，并对 win32 / linux 两个分支分别断言出上述命令，可作为回归防线。

### 环境变量（可选）

按需在 profile 的 `.env` 或系统环境里设置：

| 变量 | 作用 |
|------|------|
| `HSAGENT_HPC_BACKEND` | SSH 后端：`auto` / `native` / `gitbash` / `wsl` |
| `HSAGENT_RELAY_URL` | Relay 服务地址（遥测上报、技能包），不配也能独立运行 |
| `HSAGENT_BRIDGE_HOME` | Bridge 状态目录 |

---

## ❓ 常见问题

**Q：安装时报 pnpm 阻断 build script？**
A：本包零依赖零构建，理论上不会。若仍然遇到，多半是 pnpm 版本或 profile 里其它包触发的，按 DSH 提示把对应 key 加进 `<DSH_HOME>/profiles/<p>/pnpm-workspace.yaml` 的 `allowBuilds`。

**Q：`hpc_login` 一直返回 `missing_hpc_session`？**
A：设计如此——stdio 模式下无法交互输入密码/OTP。请在**独立终端**（不是 IDE 内嵌终端）先跑 `hsagent-bridge hpc login ...`，再回来调用。

**Q：可以用多個 profile 吗？**
A：可以，对每个 profile 各执行一次 `dsh plugin --profile <名字> add ...`。

---

## 📄 许可证

[MIT](LICENSE)

---

<div align="center">

**Upstream:** [hsagent-platform](https://github.com/ZhaXionghui/hsagent-platform) · **Harness:** [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

</div>
