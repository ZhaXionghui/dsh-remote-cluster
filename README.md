<div align="center">

# 🖧 dsh-remote-cluster

**把 DSH 原生的 remote-host（远程主机 / 集群）能力，以「集群清单 / 配置层」的形式接入 base-backed profile 的纯 patch bundle。**

[![dsh bundle](https://img.shields.io/badge/dsh-bundle-4f46e5.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/ZhaXionghui/dsh-remote-cluster)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%20%3E%3D24-brightgreen.svg)](https://nodejs.org)

[这是什么](#-这是什么) · [前置条件](#-前置条件最重要) · [安装](#-安装) · [配置集群清单](#-配置集群清单) · [验证](#-验证) · [卸载](#-卸载) · [目录结构](#-目录结构) · [常见问题](#-常见问题)

</div>

---

## 这是什么

`dsh-remote-cluster` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的一个 **profile bundle**。它**不含任何业务逻辑**——实质内容是一份 `cordis.patch.yml`（现在是**两个顶层条目**：一行 id-targeted override + 一行 insert）加一个 41 行的**零依赖守卫模块** `lib/guard.js`。

它做两件事：

1. 把 base bundle 里 `remote-hosts-ssh` 那一行的中性默认 `hosts: []`，替换成「由环境变量供给的集群清单」，同时**原样重述** base 的另外三个默认值；
2. （**0.2.0 起**）insert 一行守卫插件 `remote-cluster-guard`，它在目标 dsh 缺少 remote-host 子系统时让 boot **响亮失败**，而不是静默 no-op（见[守卫插件](#-守卫插件020-起)）。

```
DSH profile 的层序（后者胜，同 id 行逐层覆盖）
────────────────────────────────────────────────────────────────────────
  dsh-base                     ← in-box
    insert: remote-hosts / remote-hosts-ssh(hosts: []) / tool-remote-host(启用)
  dsh-web-app                  ← in-box
    tool-remote-host: disabled: true（改由 standard preset 启用）
  dsh-remote-cluster           ← 本包（out-of-tree，reconcile 追加到 bundles 末尾）
    id: remote-hosts-ssh → config.hosts = DSH_REMOTE_CLUSTER_HOSTS
    insert: remote-cluster-guard（inject: ['remoteHosts']，子系统缺失时响亮失败）
  用户层                       ← 仍在最上面
    profiles/<p>/cordis.patch.yml · $DSH_HOME/cordis.patch.yml · --patch
────────────────────────────────────────────────────────────────────────
  生效配置 → Loader 挂载（`!!js` 表达式在此刻求值）
```

> 本层**不** insert 任何 in-box 已存在的行 id（唯一 insert 的 `remote-cluster-guard` 在 base 里不存在），也**不**声明 `tool-remote-host`——见[目录结构](#-目录结构)与 `cordis.patch.yml` 文件头的注释说明。

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

**0.1.0：静默 no-op。** **0.2.0 起：启动即响亮失败（exit 1）。** 逐条对齐权威语义：

1. 本层那条 `remote-hosts-ssh` override 是 id-targeted 的（没有 `insert`）；
2. Loader 按 `id` 找目标行 `remote-hosts-ssh`；
3. 找不到时该 patch 被**跳过**（`vendor/include/src/index.ts:110-114`）；
4. 同时，本层 insert 的守卫行 `remote-cluster-guard` 声明了 `inject: ['remoteHosts']`。子系统缺失 → 该 service 无人提供 → 守卫的 fiber 停在 PENDING（`vendor/cordis/src/fiber.ts:597-621`）→ boot 审计 `assertEntriesActivated`（`packages/boot/app-boot/src/index.ts:707-738`）把**所有** PENDING 行（不止守卫，见下）一并列出并抛出 → boot 包一层 `plugin tree failed to load`（同文件 `:788`/`:816`）→ **进程 exit 1**。

**逐字实测**（构造一个把 base `remote-hosts` 行 `disabled: true` 的 profile）：见 [守卫插件（0.2.0 起）](#-守卫插件020-起) 一节的 stderr 原文。

> **为什么 id-targeted 跳过本身仍是静默的？** 那条 `remote-hosts-ssh` 找不到目标行时 Loader 只记一条 warn 级日志（`patch: entry remote-hosts-ssh not found`，`vendor/include/src/index.ts:110-114`）——**而 dsh 默认日志级别只导出 `error` 与 `info`，这条 warn 默认既不上 stderr 也不进日志缓冲。** 所以「没看到这条警告」**不能**当作「这一行没被跳过」。
>
> > 源码依据：`vendor/cordis/src/logger.ts:22-27` 定义 `LoggerLevel { ERROR=0, INFO=1, WARN=2, DEBUG=3 }`；
> > `:155-156` 处 `targetLevel = exporter.levels?.[name] ?? exporter.levels?.default ?? this.level ?? LoggerLevel.INFO;`
> > `if (targetLevel < level) continue` —— 默认级别是 INFO(1)、而 warn 是 2，故 warn 被丢弃。
> > （构建产物里同一逻辑见 `vendor/cordis/lib/types/logger.js:89-95`。）
>
> 真正**响亮**的那条信号来自守卫插件（`inject` 缺失 → PENDING → `assertEntriesActivated`），而不是这条 warn。这就是 0.2.0 加守卫的原因：把「静默 no-op」变成「启动即失败」。

所以**把「你的 dsh 是否含 remote-host 子系统」当作安装前的第一道检查项**。三条互补的判据，从最省事到最直接：

```bash
# 1) 最省事：合成后的配置树里有没有 remote-hosts 这一行（源码线期望命中 10 行，npm 线 0 行）
dsh web --dump-config | grep -c remote-host

# 2) 看特定行的来源注释里有没有 dsh-remote-cluster
dsh --profile <profile名> --dump-default-config | grep -n remote-hosts-ssh

# 3) 看 profile 的安装闭包里有没有这三个包（在 profile 目录里执行）
ls "$DSH_HOME/profiles/<profile名>/node_modules/@deepseek-ai/" | grep remote-host
# 期望看到：dsh-host-remote-host / dsh-host-remote-host-ssh / dsh-tool-remote-host
```

> ⚠️ 三条 `--dump-*` 命令都**不求值** `!!js`（见[验证](#-验证)第 2 步的说明），它们只回答「这一行在不在、来自哪一层」，**不**回答「清单求值成了什么」。
> 注：第 2 条在「dsh 不含远程主机子系统」时**也会（因为 base 就没有这一行）**没有输出；含有该子系统的 dsh 一定能看到这一行。

---

## 🛡 守卫插件（0.2.0 起）

从 **0.2.0** 开始，本包除了那条 `remote-hosts-ssh` override，还 insert 一行守卫插件：

```yaml
- insert:
    - id: remote-cluster-guard
      name: dsh-remote-cluster/lib/guard.js
```

它对应的 `lib/guard.js` 只声明了一件事——**依赖 remote-host 的服务**：

```js
export const name = 'remote-cluster-guard'
export const inject = ['remoteHosts']
export function apply() {}
```

`remoteHosts` service 由 `@deepseek-ai/dsh-host-remote-host` 提供（base bundle 的一行）。**子系统缺失时**这个 service 无人提供 → 守卫的 fiber 停在 PENDING → boot 审计把所有 PENDING 行列出并让进程**非 0 退出**。

### 子系统缺失时你会看到什么（逐字实测）

构造一个把 base `remote-hosts` 行 `disabled: true` 的 profile 真跑一次（`dsh --profile <p> --no-open --host 127.0.0.1 --port 0`），**完整 stderr 原文**如下（未加工）：

```
file:///D:/Dev/deepseek-harness/packages/boot/app-boot/lib/index.js:1511
		throw new Error(`${binName}: ${stage}: ${detail}${stack}`, { cause });
		      ^

Error: dsh: plugin tree failed to load: dsh: 3 entries did not activate
@deepseek-ai/dsh-host-remote-host-ssh: pending (waiting for service: remoteHosts)
@deepseek-ai/dsh-tool-remote-host: pending (waiting for service: remoteHosts)
dsh-remote-cluster/lib/guard.js: pending (waiting for service: remoteHosts)
    at boot (file:///D:/Dev/deepseek-harness/packages/boot/app-boot/lib/index.js:1511:9)
    at async runProfile (file:///D:/Dev/deepseek-harness/apps/cli/lib/profile-boot-BTzzdrGY.js:261:14)
    at async file:///D:/Dev/deepseek-harness/apps/cli/lib/bin.js:130:3 {
  [cause]: Error: dsh: 3 entries did not activate
  @deepseek-ai/dsh-host-remote-host-ssh: pending (waiting for service: remoteHosts)
  @deepseek-ai/dsh-tool-remote-host: pending (waiting for service: remoteHosts)
  dsh-remote-cluster/lib/guard.js: pending (waiting for service: remoteHosts)
      at assertEntriesActivated (file:///D:/Dev/deepseek-harness/packages/boot/app-boot/lib/index.js:1458:9)
      at boot (file:///D:/Dev/deepseek-harness/packages/boot/app-boot/lib/index.js:1503:9)
      at async runProfile (file:///D:/Dev/deepseek-harness/apps/cli/lib/profile-boot-BTzzdrGY.js:261:14)
      at async file:///D:/Dev/deepseek-harness/apps/cli/lib/bin.js:130:3
}

Node.js v22.22.2
```

退出码 **1**（stdout 为空）。要点：

- `dsh:` 前缀出现**两次**——一次在 `plugin tree failed to load: dsh: 3 entries did not activate`（boot 包装层），一次在 `[cause]: Error: dsh: 3 entries did not activate`（审计层的原始错误）；
- PENDING 列表里除了本包的守卫，还有 `remoteHosts` 的**其它既有消费者**（`@deepseek-ai/dsh-host-remote-host-ssh`、以及工具面 `@deepseek-ai/dsh-tool-remote-host`；web profile 下是 `@deepseek-ai/dsh-api-remote-host-controller`）。因此条数是**上游消费者数量的函数**，会随 profile 组态变化——守卫只是让这个本就存在的故障**显性化**，并非新增故障；
- 我们的模块名逐字出现：`dsh-remote-cluster/lib/guard.js: pending (waiting for service: remoteHosts)`（`entry.options.name` 是 patch 里写的**原始字符串**，故显示为裸包名+子路径）。
- `at boot ...` 与 `[cause]` 段是 Node 打印 Error（含 `cause`）的标准形态，**确实**会打印。

> 📌 **可移植性**：上文是**本机逐字抓取**（保留为实测凭据），其中 `file:///D:/...` 绝对路径与带 hash 的构建产物名（`profile-boot-BTzzdrGY.js`、`app-boot/lib/index.js` 的行号）会随机器与构建版本变化。**稳定判据**只有三样：`pending (waiting for service: remoteHosts)`、`X entries did not activate`、以及逐字出现的模块名 `dsh-remote-cluster/lib/guard.js`。

### 它不会误伤健康安装

在**健康的 web profile** 上守卫**正常激活、不会报错**：`remote-hosts` 由 base 提供 `remoteHosts`，而 `dsh-web-app` 只碰 `remote-host-controller`、`ui-remote-host`、`tool-remote-host` 三个**别的**行，**从不**碰提供 `remoteHosts` 的 `remote-hosts`（`packages/bundle/base/cordis.patch.yml:90-91`）。`tools/boot-smoke.mjs` 的「env 已设 / 未设」两态正是在验证这一点：健康链上 boot 照常 exit 0。

---

## 📦 安装

`dsh plugin --profile <名字> add <spec>` 会把参数**原样转发**给 profile 目录里的 pnpm，所以任何 pnpm 支持的 spec 形态都能用。四种常用形态：

### 1. GitHub 简写（推荐，最短）

```bash
dsh plugin --profile <profile名> add github:ZhaXionghui/dsh-remote-cluster#dsh-remote-cluster-v0.2.0
```

### 2. 完整 git URL（GitCode 镜像 / 需要显式 URL 时）

```bash
# GitHub
dsh plugin --profile <profile名> add 'git+https://github.com/ZhaXionghui/dsh-remote-cluster.git#dsh-remote-cluster-v0.2.0'

# GitCode 镜像（国内网络）
dsh plugin --profile <profile名> add 'git+https://gitcode.com/ZhaXionghui/dsh-remote-cluster.git#dsh-remote-cluster-v0.2.0'
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
... add github:ZhaXionghui/dsh-remote-cluster#dsh-remote-cluster-v0.2.0     # 锁 tag（0.1.0 的历史 tag 仍可用）
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

**如果目标行不存在，dump 会直接把那条「跳过」警告打到 stderr**（这是最直观的诊断信号，比之前文中只提的「调高日志级别」实用得多）。逐字实测——对一个不含 `remote-hosts-ssh` 这一行的 profile 执行 dump：

```
$ dsh --profile <p> --dump-config            # 或 --dump-default-config，两者都会打
dsh: [dsh-remote-cluster] patch: entry "remote-hosts-ssh" not found
```

注意三点：① 它走 **stderr** 而不是 stdout，所以 `... | grep` 抓不到，要看 stderr（或 `2>&1`）；② 前缀 `[dsh-remote-cluster]` 表明是**本层**那条 patch 被跳过；③ id 是**带引号**的 `"remote-hosts-ssh"`（与 0.1.0 里引用的 loader 内部 warn 文案 `patch: entry remote-hosts-ssh not found` 差一对引号——dump 这条来自 `composeEntries` 的包装，`packages/boot/app-boot/src/index.ts:854-861`）。**两个 dump flag 都会打这条警告**，区别只在包含的层数。

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
├── cordis.patch.yml        # 唯一的 patch：两个顶层条目——一行 remote-hosts-ssh 的 id-targeted override + 一行 remote-cluster-guard 的 insert
├── lib/
│   ├── index.js            # 空模块（export {}），让 git 源码安装不触发任何构建
│   └── guard.js            # 守卫插件：inject: ['remoteHosts']，子系统缺失时让 boot 响亮失败（0.2.0 起）
├── docs/
│   └── CLUSTER-INVENTORY.md # 清单字段参考（抄自 Provider schema）+ 两条路线取舍
├── tools/
│   ├── verify-bundle.mjs   # 回归校验：真实 loader 解析 + 真实 patch 算法 + 三态求值 + [11] 守卫断言族
│   └── boot-smoke.mjs      # 真实 boot 冒烟：临时 DSH_HOME，三态（设 env / 不设 env / 无 remote-host 接缝）各跑一遍
├── README.md
├── LICENSE
└── .gitignore
```

### 为什么 `lib/index.js` 是空的？

DSH 判定一个依赖是不是「bundle」，**只看**它的 `package.json` 里有没有 `dsh.bundle.patch`；真正的行为全部由 `cordis.patch.yml` 声明。留一个最小的合法 ESM 模块，是为了保证从 git 源码安装时不会因为缺少入口而触发任何构建流程。（0.2.0 起新增的 `lib/guard.js` 是功能性模块，但同样零 import，不改变这一结论。）

### 为什么本包不需要 `allowBuilds`？

DSH 官方文档在 [Installing from GitHub](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md) 里描述了一个常见坑：**git 安装拉的是源码不是构建产物**，所以带 `prepare` / `install` / `build` 脚本的包会触发 pnpm ≥ 10 的构建授权闸门，用户必须手工加一条 `allowBuilds` 放行后重装——而那条授权实质上等于「允许该包在安装时于你机器上执行代码」。

本 bundle 两个字面上都不属于这类：

- **零构建脚本**——`package.json` 里没有 `scripts`，没有东西可被拦；
- **零依赖**——不拉任何传递依赖；本包发货的**两个** JS（`lib/index.js`、`lib/guard.js`）都是零 import 的纯 ESM（前者仅 `export {}`；后者仅三个导出 `name` / `inject` / `apply`，无任何 import），本身就是最终产物。

所以四种安装形态都是**一条命令一步装完**，不需要 `allowBuilds`，也不需要「再跑一次」。

> ⚠️ 维护者注意：`package.json` 的 `files` 已从 `["lib/index.js"]` 改为 `["lib"]`。**0.1.0 式的单文件 `files` 会漏发 `lib/guard.js`**——npm/git 打包只会带 `files` 明确列出的路径，守卫模块缺位会让「响亮失败」静默失效。

`tools/*.mjs` 只在开发期用，不在 `package.json` 的 `files` 里，不会进安装产物。

---

## ❓ 常见问题

**Q1：装了以后集群清单没生效，怎么查？**

按顺序排查四步：

1. `cat "$DSH_HOME/profiles/<p>/package.json"` → `dsh.profile.bundles` 里有没有 `"dsh-remote-cluster"`；
2. `dsh --profile <p> --dump-config | grep -n -A 8 remote-hosts-ssh` → 有没有这一行、来源注释里有没有 `dsh-remote-cluster`。**没有这一行 ⇒ 你的 dsh 不含 remote-host 子系统**（见[前置条件](#-前置条件最重要)）；
3. 要确认这一行是否被**跳过**，看 `dsh --profile <p> --dump-config` 的 **stderr** 有没有直接打出那条 warn：
   ```
   dsh: [dsh-remote-cluster] patch: entry "remote-hosts-ssh" not found
   ```
   这是最直观的一条：dump 走的是与 boot 同一条 `composeEntries` 路径，同一条 warn 照样发到 stderr（id 是**带引号**的、前面带 `[层名]` 前缀）。**别指望 boot 日志**——默认日志级别下那条 warn 不显示（见[前置条件](#-前置条件最重要)）；
4. 有这一行但还是空清单 ⇒ 检查 `DSH_REMOTE_CLUSTER_HOSTS` 是不是**在启动 dsh 的那个进程环境里**设的（profile 的 `.env` 与环境变量不同源）。**`hosts` 必须是 JSON 数组**——除 `null`（与未设置等价，回落 `[]`）之外，非数组与非法 JSON 都会让 boot **fail-loud**（exit 1）；报错文案见下表。

> ⚠️ `--dump-config` / `--dump-default-config` 都是**只 dump、不 boot**：`!!js` 表达式**逐字原样打印、不求值**（见 `apps/cli/src/dump-config.ts` 模块注释与 `app-boot/src/index.ts:362-372`）。所以两个 dump 命令**都不会**因为 `!!js` 求值失败而报错——想验证 `!!js` 本身，只能真 boot。

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

**Q2：在旧的 dsh 上装了会怎样？**

分两个版本：

- **0.1.0：静默 no-op，且不报错。** id-targeted patch 找不到目标行时会被跳过（loader 会记一条 warn，但默认日志级别下不可见，见[前置条件](#-前置条件最重要)），boot 照常成功——没有目标行就没有 provider 需要配置。
- **0.2.0 起：启动即响亮失败（exit 1）。** 守卫插件 `dsh-remote-cluster/lib/guard.js` 声明了 `inject: ['remoteHosts']`，而 `remoteHosts` 服务由 base 行的 `remote-hosts` 提供。旧 dsh 不含该子系统时，守卫所在的 fiber 拿不到这个服务，就会被 `assertEntriesActivated` 列进 PENDING 清单、直接令 boot 抛错退出（逐字 stderr 见[守卫插件](#-守卫插件020-起)）。旧版「装了没反应」的坑，在 0.2.0 起会变成一个**一眼可见的报错**。

不论哪个版本，装前都请先确认安装闭包里有 remote-host 三包（[前置条件](#-前置条件最重要)）。

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
