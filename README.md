<div align="center">

# 🖧 dsh-remote-cluster

**把 DSH 原生的 remote-host（远程主机 / 集群）能力，以「集群清单 / 配置层」的形式接入 base-backed profile 的纯 patch bundle。**

[![dsh bundle](https://img.shields.io/badge/dsh-bundle-4f46e5.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/ZhaXionghui/dsh-remote-cluster)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%20%3E%3D24-brightgreen.svg)](https://nodejs.org)

[这是什么](#-这是什么) · [前置条件](#-前置条件最重要) · [安装](#-安装) · [配置集群清单](#-配置集群清单) · [验证](#-验证) · [卸载](#-卸载) · [目录结构](#-目录结构) · [常见问题](#-常见问题)

</div>

---

## 这是什么

`dsh-remote-cluster` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的一个 **profile bundle**。它**不含任何业务逻辑**——整个包里唯一的实质内容是一份 `cordis.patch.yml`，是一个**只有一层、只有一条 id-targeted 行**的 patch。

它做的事只有一件：把 base bundle 里 `remote-hosts-ssh` 那一行的中性默认 `hosts: []`，替换成「由环境变量供给的集群清单」，同时**原样重述** base 的另外三个默认值。

```
DSH profile 的层序（后者胜，同 id 行逐层覆盖）
────────────────────────────────────────────────────────────────────────
  dsh-base                     ← in-box
    insert: remote-hosts / remote-hosts-ssh(hosts: []) / tool-remote-host(启用)
  dsh-web-app                  ← in-box
    tool-remote-host: disabled: true（改由 standard preset 启用）
  dsh-remote-cluster           ← 本包（out-of-tree，reconcile 追加到 bundles 末尾）
    id: remote-hosts-ssh → config.hosts = DSH_REMOTE_CLUSTER_HOSTS
  用户层                       ← 仍在最上面
    profiles/<p>/cordis.patch.yml · $DSH_HOME/cordis.patch.yml · --patch
────────────────────────────────────────────────────────────────────────
  生效配置 → Loader 挂载（`!!js` 表达式在此刻求值）
```

> 本层**不** insert 任何 in-box 已存在的行 id，也**不**声明 `tool-remote-host`——见[目录结构](#-目录结构)与 `cordis.patch.yml` 文件头的注释说明。

---

## ⚠️ 前置条件（最重要）

**你的 dsh 安装闭包里必须已经包含 remote-host 子系统**，即下列三个包可被解析：

| 包 | 角色 |
|----|------|
| `@deepseek-ai/dsh-host-remote-host` | 与 transport 无关的远程主机注册表（Service Definition） |
| `@deepseek-ai/dsh-host-remote-host-ssh` | SSH Provider（本包配置的那一行） |
| `@deepseek-ai/dsh-tool-remote-host` | 面向模型的 Consumer（工具面） |

**这三个包目前没有发布到 npm。** 目前的实测结论是：npm 上的 `@deepseek-ai/dsh-base`（含最新 alpha `0.1.6-alpha.2`）的 `dependencies` **不含** remote-host 三包，也就是说**从 npm 装的 dsh 拿不到这套能力**。它们存在于源码仓库（`packages/host/remote-host`、`packages/host/remote-host-ssh`、`packages/tool/remote-host`）以及从源码构建的安装里。

### 在缺少该子系统的 dsh 上会发生什么

**不会崩溃，也不会报错——能力静默不生效。** 逐条对齐权威语义（`vendor/include/src/index.ts:110-114`）：

1. 本层唯一那条 patch 是 id-targeted 的（没有 `insert`）；
2. Loader 按 `id` 找目标行 `remote-hosts-ssh`；
3. 该 patch 被**跳过**（`vendor/include/src/index.ts:110-114`），boot 照常成功（exit 0）；
4. Loader 会经 `loader` 命名空间记一条 warn 级日志（`patch: entry remote-hosts-ssh not found`）——
   **但 dsh 默认日志级别只导出 `error` 与 `info`，这条 warn 默认既不上 stderr 也不进日志缓冲。**
   因此「没看到这条警告」**不能**当作「这一行没被跳过」；要看它必须调高日志级别。

   > 源码依据：`vendor/cordis/src/logger.ts:22-27` 定义 `LoggerLevel { ERROR=0, INFO=1, WARN=2, DEBUG=3 }`；
   > `:155-156` 处 `targetLevel = exporter.levels?.[name] ?? exporter.levels?.default ?? this.level ?? LoggerLevel.INFO;`
   > `if (targetLevel < level) continue` —— 默认级别是 INFO(1)、而 warn 是 2，故 warn 被丢弃。
   > （构建产物里同一逻辑见 `vendor/cordis/lib/types/logger.js:89-95`。）

所以**把「你的 dsh 是否含 remote-host 子系统」当作安装前的第一道检查项**：

```bash
# 1) 看 profile 的安装闭包里有没有这三个包（在 profile 目录里执行）
ls "$DSH_HOME/profiles/<profile名>/node_modules/@deepseek-ai/" | grep remote-host
# 期望看到：dsh-host-remote-host / dsh-host-remote-host-ssh / dsh-tool-remote-host

# 2) 看合成后的配置树里有没有 remote-hosts-ssh 这一行
dsh --profile <profile名> --dump-default-config | grep -n remote-hosts-ssh
# 没有输出 ⇒ 该 dsh 不含 remote-host 子系统，本包装了也是 no-op
```

> 注：第 2 条命令在「dsh 不含远程主机子系统」时**也会（因为 base 就没有这一行）**没有输出；含有该子系统的 dsh 一定能看到这一行。这就是最省事的判据。

---

## 📦 安装

`dsh plugin --profile <名字> add <spec>` 会把参数**原样转发**给 profile 目录里的 pnpm，所以任何 pnpm 支持的 spec 形态都能用。四种常用形态：

### 1. GitHub 简写（推荐，最短）

```bash
dsh plugin --profile <profile名> add github:ZhaXionghui/dsh-remote-cluster#dsh-remote-cluster-v0.1.0
```

### 2. 完整 git URL（GitCode 镜像 / 需要显式 URL 时）

```bash
# GitHub
dsh plugin --profile <profile名> add 'git+https://github.com/ZhaXionghui/dsh-remote-cluster.git#dsh-remote-cluster-v0.1.0'

# GitCode 镜像（国内网络）
dsh plugin --profile <profile名> add 'git+https://gitcode.com/ZhaXionghui/dsh-remote-cluster.git#dsh-remote-cluster-v0.1.0'
```

### 3. 本地路径（改本 bundle 源码后即时验证）

```bash
dsh plugin --profile <profile名> add /绝对路径/dsh-remote-cluster
# 等价：file:/绝对路径/dsh-remote-cluster
```

### 4. npm 包名（本包发布到 registry 之后）

```bash
dsh plugin --profile <profile名> add dsh-remote-cluster
```

### `#` 后面接什么

`#` 后面可以是 **tag / 分支名 / commit sha**：

```bash
... add github:ZhaXionghui/dsh-remote-cluster#main                          # 跟分支走（滚动更新）
... add github:ZhaXionghui/dsh-remote-cluster#dsh-remote-cluster-v0.1.0     # 锁 tag
... add github:ZhaXionghui/dsh-remote-cluster#<commit-sha>                  # 锁 commit
```

> 🔒 **建议锁 sha。** tag 和分支在远端都可能被重新指向别的提交，只有 sha 能保证「你运行的就是你审过的那份代码」。tag 便于阅读，sha 才是承诺。
>
> 💡 关于引号：`#` 处于词中时 bash / zsh 都不把它当注释，不加引号通常也能工作。这里加引号是防御性写法——一旦 `#` 前面出现空格，它就会变成注释，后面的 ref 被悄悄丢掉。

---

## ⚙️ 配置集群清单

清单来自**环境变量 `DSH_REMOTE_CLUSTER_HOSTS`**（一个 JSON 数组）。未设置、或设为 `[]`，就回落成 base 的中性默认 `hosts: []`——所以本仓库里**不硬编码任何真实集群**。

### 路线 A：环境变量（推荐；容器 / CI / 临时供给）

先看一个两台主机的完整例子（一台 `cluster`、一台 `server`，字段名全部取自 Provider 的 schema）：

```json
[
  {
    "id": "gpu-cluster",
    "label": "GPU Cluster (login node)",
    "kind": "cluster",
    "hostname": "login.gpu.example.org",
    "port": 22,
    "user": "alice",
    "identityFile": "~/.ssh/id_ed25519"
  },
  {
    "id": "build-server",
    "label": "Build Server",
    "kind": "server",
    "hostname": "build.example.org",
    "port": 2222,
    "user": "alice",
    "passwordAuth": true
  }
]
```

**bash / zsh：**

```bash
export DSH_REMOTE_CLUSTER_HOSTS='[{"id":"gpu-cluster","label":"GPU Cluster","kind":"cluster","hostname":"login.gpu.example.org","user":"alice","identityFile":"~/.ssh/id_ed25519"},{"id":"build-server","label":"Build Server","kind":"server","hostname":"build.example.org","port":2222,"user":"alice","passwordAuth":true}]'
```

**Windows PowerShell：**

```powershell
$env:DSH_REMOTE_CLUSTER_HOSTS = '[{"id":"gpu-cluster","label":"GPU Cluster","kind":"cluster","hostname":"login.gpu.example.org","user":"alice","identityFile":"~/.ssh/id_ed25519"},{"id":"build-server","label":"Build Server","kind":"server","hostname":"build.example.org","port":2222,"user":"alice","passwordAuth":true}]'
```

> 单引号包住整段 JSON，是两种 shell 里都最省心的写法：JSON 里的双引号原样保留，`$` 也不会被展开。
>
> ⚠️ **每台主机必须恰好配置一种认证来源**：`identityFile` / `agentSocket` / `passwordAuth: true` 三者**只能有一个**（Provider 的校验，见 `packages/host/remote-host-ssh/src/index.ts:225-232`）。一个都不给、或给两个，都会让那一行挂载失败并让 boot fail-loud。

完整字段表、默认值、以及「什么不该放进去」，见 **[docs/CLUSTER-INVENTORY.md](docs/CLUSTER-INVENTORY.md)**。

### 路线 B：持久化到 `$DSH_HOME/settings.yaml`

同一份清单也可以写进用户 settings 文档的 `remote-host-ssh:` 小节，从而**无需环境变量、且重启后仍在**：

```yaml
# $DSH_HOME/settings.yaml
remote-host-ssh:
  hosts:
    - id: gpu-cluster
      label: GPU Cluster (login node)
      kind: cluster
      hostname: login.gpu.example.org
      user: alice
      identityFile: ~/.ssh/id_ed25519
    - id: build-server
      label: Build Server
      kind: server
      hostname: build.example.org
      port: 2222
      user: alice
      passwordAuth: true
```

这条路线**真实存在且优先级更高**，依据是：

- SSH Provider 用 `SETTINGS_NAMESPACE = 'remote-host-ssh'` 注册了自己的 settings 命名空间，并把**插件 base config 作为 `base`** 传进去（`packages/host/remote-host-ssh/src/index.ts:99`、`:391-396`）；
- settings 的解析顺序是「schema 默认 → `base` → 用户文档层」（`packages/settings/settings/src/index.ts:739-753`），而合并规则是**普通对象递归合并、数组整体替换**（同文件 `:287-295`）。

因此 `settings.yaml` 里的 `remote-host-ssh.hosts` 会**整体替换** base（也就是本层）给出的 `hosts`，而本层的其它键（`passwordControlMaster` 等）不受影响。用户 settings 的文档默认位于 `<harness home>/settings.yaml`，即 `$DSH_HOME/settings.yaml`（`packages/settings/settings-file/src/index.ts:56-57`）。

> 两条路线怎么选：环境变量适合「同一台机器上按环境切换清单」；settings 适合「这台机器就是这个清单」。两者同时存在时 **settings 胜**（它在 `base` 之上）。

---

## 🔍 验证

### 1. 确认 bundle 已被识别为 profile 的一层

```bash
cat "$DSH_HOME/profiles/<profile名>/package.json"
```

`dsh.profile.bundles` 数组里应出现 `"dsh-remote-cluster"`（out-of-tree bundle 由 reconcile 追加到数组末尾）。若只有 `dependencies` 而没有 `bundles`，说明包没被识别成 bundle——检查它的 `package.json` 里 `dsh.bundle.patch` 是否丢失。

### 2. 确认 patch 被正确合成

```bash
dsh --profile <profile名> --dump-default-config | grep -n -A 8 remote-hosts-ssh
```

应能看到 `remote-hosts-ssh` 那一行，且它的来源注释里包含 `dsh-remote-cluster`——注释形式为 `# == <贡献该行的文件>, patched by <打过它的层...>`（`packages/boot/app-boot/src/index.ts:477-479`）。

**① 你在 `cordis.patch.yml` 里写的形式**（单引号单行——不引号的话，三元表达式里的 `: ` 会被 YAML 当成键分隔符而静默解析成 mapping）：

```yaml
# == @deepseek-ai/dsh-base, patched by dsh-remote-cluster
- id: remote-hosts-ssh
  name: '@deepseek-ai/dsh-host-remote-host-ssh'
  config:
    hosts: !!js 'process.env.DSH_REMOTE_CLUSTER_HOSTS ? JSON.parse(process.env.DSH_REMOTE_CLUSTER_HOSTS) : []'
    passwordControlMaster: true
    controlPersistSeconds: 900
    maxTransferBytes: 268435456
```

**② dump 打印出来的形式**（语义与 ① 完全相同，只是 YAML 序列化会把长标量渲染成**折叠块** `>-`，而不是单引号单行）：

```yaml
# == @deepseek-ai/dsh-base, patched by dsh-remote-cluster
- id: remote-hosts-ssh
  name: '@deepseek-ai/dsh-host-remote-host-ssh'
  config:
    hosts: !!js >-
      process.env.DSH_REMOTE_CLUSTER_HOSTS ?
      JSON.parse(process.env.DSH_REMOTE_CLUSTER_HOSTS) : []
    passwordControlMaster: true
    controlPersistSeconds: 900
    maxTransferBytes: 268435456
```

> ⚠️ **注意：`hosts` 在这里显示的是未求值的 `!!js` 表达式，不是算好的数组。**
> dump 这条路**永远不会**给你求值后的值：两个 dump flag 走的是同一个 `runDumpConfig`，其模块文档明确写着 compose **"without booting or evaluating `!!js`"**（`apps/cli/src/dump-config.ts:2-5`、`:30-52`）。两个 flag 的区别**只在包含的层数**，不在求值（`apps/cli/src/dump-config.ts:31-49`）：
>
> | flag | 包含的层 |
> |------|----------|
> | `--dump-default-config` | 只有 bundle 层（不含用户层，用于排查坏掉的 `cordis.patch.yml`） |
> | `--dump-config` | bundle 层 + profile 的 `cordis.patch.yml` + home 级 patch + 各 `--patch` overlay |
>
> 想看求值后的实际清单，只能真正 boot 一次（见下一条）。

### 3. 在真实 boot 里确认清单生效（`remote_host_*` 行为差异）

`hosts` 表达式只在 **Loader 挂载时**求值。最直接的验证是看模型能看到的 remote-host 工具面：

| 步骤 | 操作 | 期望 |
|------|------|------|
| A | **不设** `DSH_REMOTE_CLUSTER_HOSTS` 启动，问模型列出远程主机 | 清单为空，没有任何可用的目标主机 |
| B | **设** `DSH_REMOTE_CLUSTER_HOSTS`（≥1 台）后重启，问模型列出远程主机 | 出现你配置的 `id` / `label` / `kind` |

工具面来自 `@deepseek-ai/dsh-tool-remote-host`：base 默认**启用**它（`packages/bundle/base/cordis.patch.yml:280-281`），而 web profile **故意把它置灰**并改由 per-agent preset 启用（`packages/bundle/web-app/cordis.patch.yml:351-352` → `packages/preset/agent-presets/presets/standard/agent.cordis.yml:78-79`）。所以：

- 在 **web profile** 下，工具只对**使用 standard preset 的会话**可见——请在会话里用 standard preset；
- 在 **TUI / 其它 base-backed profile** 下，工具是进程级启用。

本仓库自带 `tools/boot-smoke.mjs`，它会在一个临时 `DSH_HOME` 里真的 boot 一次 web 链，并把 Provider 注册表里最终的清单抓出来——设与不设环境变量各跑一遍：

```bash
node tools/boot-smoke.mjs
```

---

## 🗑 卸载

```bash
dsh plugin --profile <profile名> remove dsh-remote-cluster
```

DSH 会自动 reconcile `dsh.profile.bundles`，把这一层从 profile 里摘掉。想彻底清干净，可再删除 profile 目录下的 `node_modules/dsh-remote-cluster`。

---

## 📁 目录结构

```
dsh-remote-cluster/
├── package.json            # bundle 声明：dsh.bundle.patch → ./cordis.patch.yml
├── cordis.patch.yml        # 唯一的实质内容：一层、一条 id-targeted 行（remote-hosts-ssh）
├── lib/
│   └── index.js            # 空模块（export {}），让 git 源码安装不触发任何构建
├── docs/
│   └── CLUSTER-INVENTORY.md # 清单字段参考（抄自 Provider schema）+ 两条路线取舍
├── tools/
│   ├── verify-bundle.mjs   # 回归校验：真实 loader 解析 + 真实 patch 算法 + 三态求值
│   └── boot-smoke.mjs      # 真实 boot 冒烟：临时 DSH_HOME，设/不设 env 各跑一遍
├── README.md
├── LICENSE
└── .gitignore
```

### 为什么 `lib/index.js` 是空的？

DSH 判定一个依赖是不是「bundle」，**只看**它的 `package.json` 里有没有 `dsh.bundle.patch`；真正的行为全部由 `cordis.patch.yml` 声明。留一个最小的合法 ESM 模块，是为了保证从 git 源码安装时不会因为缺少入口而触发任何构建流程。

### 为什么本包不需要 `allowBuilds`？

DSH 官方文档在 [Installing from GitHub](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md) 里描述了一个常见坑：**git 安装拉的是源码不是构建产物**，所以带 `prepare` / `install` / `build` 脚本的包会触发 pnpm ≥ 10 的构建授权闸门，用户必须手工加一条 `allowBuilds` 放行后重装——而那条授权实质上等于「允许该包在安装时于你机器上执行代码」。

本 bundle 两个字面上都不属于这类：

- **零构建脚本**——`package.json` 里没有 `scripts`，没有东西可被拦；
- **零依赖**——不拉任何传递依赖；`lib/index.js` 本身就是最终产物，只有一行 `export {}`。

所以四种安装形态都是**一条命令一步装完**，不需要 `allowBuilds`，也不需要「再跑一次」。

`tools/*.mjs` 只在开发期用，不在 `package.json` 的 `files` 里，不会进安装产物。

---

## ❓ 常见问题

**Q1：装了以后集群清单没生效，怎么查？**

按顺序排查四步：

1. `cat "$DSH_HOME/profiles/<p>/package.json"` → `dsh.profile.bundles` 里有没有 `"dsh-remote-cluster"`；
2. `dsh --profile <p> --dump-default-config | grep -n -A 8 remote-hosts-ssh` → 有没有这一行、来源注释里有没有 `dsh-remote-cluster`。**没有这一行 ⇒ 你的 dsh 不含 remote-host 子系统**（见[前置条件](#-前置条件最重要)）；
3. 要确认这一行是否被跳过，**用第 2 步的 `--dump-default-config`**，不要指望 boot 日志——默认日志级别看不到那条 warn（见[前置条件](#-前置条件最重要)）；
4. 有这一行但还是空清单 ⇒ 检查 `DSH_REMOTE_CLUSTER_HOSTS` 是不是**在启动 dsh 的那个进程环境里**设的（profile 的 `.env` 与环境变量不同源）。**`hosts` 必须是 JSON 数组**——除 `null`（与未设置等价，回落 `[]`）之外，非数组与非法 JSON 都会让 boot **fail-loud**（exit 1）；报错文案见下表。

**清单取值逐例实测**（真实 boot，`dsh --profile <p> --no-open --host 127.0.0.1 --port 0`）。下表第一列 `X` 表示 `DSH_REMOTE_CLUSTER_HOSTS` 在进程环境里的**字面取值**——即那一串原始字符本身（**含**引号与花括号），不是 JSON 类型名。这是**刻意的 fail-loud**：一个拼错的环境变量会让 harness 直接启动失败，而不是带着半截清单继续跑。

| `DSH_REMOTE_CLUSTER_HOSTS` 的字面取值 | 真实结果 |
|---|---|
| 未设 / `[]` | exit 0，清单 `[]` |
| `null` | **exit 0，静默回落 `[]`**（`null` 触发 schema 的 `.default([])`）——与其它非数组**不一致**，必须留意 |
| `123` | **exit 1**：`dsh: fatal load failure: Error: failed to apply loader entry remote-hosts-ssh (@deepseek-ai/dsh-host-remote-host-ssh): invalid config: - $.hosts expected array but got 123 (at hosts)` |
| `"str"` | **exit 1**：`… invalid config: - $.hosts expected array but got str (at hosts)` |
| `{}` | **exit 1**：`… invalid config: - $.hosts expected array but got [object Object] (at hosts)` |
| `{oops`（非法 JSON） | **exit 1**：`… Expected property name or '}' in JSON at position 1 (line 1 column 2)` |
| `[{"id":"x"}]`（缺 `label`/`hostname`/`user`） | **exit 1**：`… invalid config: - $.hosts[0].label missing required value (at hosts.0.label)` |

> ⚠️ 注意 `null` 那一行：它是唯一「格式不对但 boot 不失败」的取值，因为 schema 把 `null` 当「无值」而套用了默认 `[]`。别指望靠 boot 失败来发现自己把清单写成了 `null`。

**Q2：在旧的 dsh 上装了没用，也不报错？**

这是**设计使然**，不是 bug：id-targeted patch 找不到目标行时会被跳过（loader 会记一条 warn，但默认日志级别下不可见，见[前置条件](#-前置条件最重要)），boot 照常成功——没有目标行就没有 provider 需要配置。请先确认安装闭包里有 remote-host 三包（[前置条件](#-前置条件最重要)）。

**Q3：为什么 `passwordAuth` 的目标要走 ControlMaster？**

因为一次 SSH 会话里可能要跑很多条命令、做多次文件传输。密码认证**没法复用 agent**，所以本层保留 base 的默认 `passwordControlMaster: true` + `controlPersistSeconds: 900`：第一次登录后用 OpenSSH 的 ControlMaster 复用同一条连接，900 秒内不再重复握手（这个 900s 与原版 HSAgent 的 `ControlPersist=900s` 对齐，见 `packages/bundle/base/cordis.patch.yml:84-99` 的注释）。**保留这三个键是本层存在的必要条件之一**——因为 patch 的 `config` 是**整体替换**而非 merge（`vendor/include/src/index.ts:121-124`），不重述就会被清回 schema 默认值。

**Q4：可以用多个 profile 吗？**

可以，对每个 profile 各执行一次 `dsh plugin --profile <名字> add ...`。注意 profile 的 `dsh.profile.bundles` 各自独立。

---

## 📄 许可证

[MIT](LICENSE)

---

<div align="center">

**Harness:** [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

</div>
