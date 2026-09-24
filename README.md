<div align="center">

# 🖧 dsh-remote-cluster

**把 DSH 的整套「远程主机（remote-host）」能力——SSH 连接、面向模型的工具面、以及 Web 侧栏工作台——打包成一个自带实现的 profile bundle，装到不含该子系统的 dsh 上也能直接用。**

[![dsh bundle](https://img.shields.io/badge/dsh-bundle-4f46e5.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](https://github.com/ZhaXionghui/dsh-remote-cluster)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%20%3E%3D24-brightgreen.svg)](https://nodejs.org)

[这是什么](#这是什么) · [与 0.1/0.2 的区别](#-与-0102-的区别) · [安装](#-安装) · [配置集群清单](#-配置集群清单) · [验证](#-验证) · [已知限制](#-已知限制) · [目录结构](#-目录结构) · [常见问题](#-常见问题)

</div>

---

## 这是什么

`dsh-remote-cluster` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的一个 **profile bundle**。

**0.3.0 是一次定位转变：从「配置层」变成「功能插件」。**

它现在**自带整个 remote-host 子系统的实现**——5 个上游 `@deepseek-ai/dsh-*` 包连同它们依赖的 UI 侧栏 `dsh-better-sidebar`，全部内联在 `vendor/` 下——因此你**不需要**预先拥有这套能力。从 npm 装的 dsh（`@deepseek-ai/dsh@0.1.5-rc.3` 一类）的 base bundle 里**一行 remote-host 都没有**，装上本包之后就有完整的：

- **注册表与接缝**：`remoteHosts` 服务（与 transport 无关的远程主机注册表）；
- **SSH 实现**：真正的连接、命令、文件传输、ControlMaster 复用；
- **工具面**：面向模型的 `remote_host_*` 工具；
- **Web 侧栏**：右侧栏工作台 + 远程主机面板。

```
DSH profile 的层序（后者胜，同 id 行逐层覆盖）
────────────────────────────────────────────────────────────────────────
  dsh-base                     ← in-box（npm 线：不含任何 remote-host 行）
  dsh-web-app                  ← in-box
  dsh-remote-cluster           ← 本包（out-of-tree，reconcile 追加到 bundles 末尾）
    insert: remote-hosts        ./vendor/host-remote-host/lib/index.js
    insert: remote-hosts-ssh    ./vendor/host-remote-host-ssh/lib/index.js
                                config.hosts = DSH_REMOTE_CLUSTER_HOSTS
    insert: remote-host-controller ./vendor/remote-host-controller/lib/index.js
    insert: tool-remote-host    ./vendor/tool-remote-host/lib/index.js
    insert: better-sidebar      ./vendor/better-sidebar/lib/index.js
    insert: ui-remote-host      ./vendor/ui-remote-host/lib/index.js
  用户层                       ← 仍在最上面
    profiles/<p>/cordis.patch.yml · $DSH_HOME/cordis.patch.yml · --patch
────────────────────────────────────────────────────────────────────────
  生效配置 → Loader 挂载（`!!js` 表达式在此刻求值）
```

六个行的 id 在已发布的 `dsh-base@0.1.5-rc.3` / `dsh-web-app@0.1.5-rc.3` 里**全部空闲**，所以 `insert` 不会撞 id（撞了会在 boot 时抛 `duplicate loader entry id`）。

---

## 🔄 与 0.1/0.2 的区别

| | 0.1.0 | 0.2.0 | **0.3.0** |
|---|---|---|---|
| 定位 | 配置层 | 配置层 + 守卫 | **功能插件（自带实现）** |
| 提供 remote-host 能力？ | ❌ 只配置别人提供的 | ❌ 只配置别人提供的 | ✅ **自带 5 个上游包** |
| 提供 Web 侧栏？ | ❌ | ❌ | ✅ **自带 better-sidebar + ui-remote-host** |
| 目标 dsh 缺该子系统时 | **静默 no-op**（危险） | **启动即 exit 1**（响亮） | **正常工作**（能力由本包提供） |
| 顶层 patch 条目 | 2（1 override + 1 insert） | 2（同上，insert 的是守卫） | **1（一个 `insert:` 装 6 行）** |
| `lib/guard.js` | — | 有（41 行守卫） | **已移除**（见下） |
| 在 npm 装的 dsh 上 | 不生效 | 启动失败 | **完整可用** |

### 为什么 0.3.0 移除了守卫插件

0.2.0 的 `lib/guard.js` 声明 `inject: ['remoteHosts']`，用途是：当目标 dsh 缺少该子系统时，让这个 fiber 停在 PENDING，由 boot 的 `assertEntriesActivated` 把它列出来并使启动失败——**把静默 no-op 变成响亮失败**。

0.3.0 **自己提供 `remoteHosts`**，所以 `inject: ['remoteHosts']` 成了一个恒真的同义反复：守卫永远不会 pending，也就永远不会报警。它失去了存在的理由，留着只会误导读者以为「本包仍需检测子系统」。于是移除。

「子系统真的装配好了吗」这个疑问，现在由两个**更强**的机制回答：

1. `assertEntriesLoaded`（`packages/boot/app-boot/src/index.ts:673-679`）对**任何**解析不动的行**硬失败**——比守卫星座具体得多；
2. `assertEntriesActivated`（同文件 `:707-740`）对 `FIBER_FAILED` **硬失败**并附上原始 stack，对 `FIBER_PENDING` **硬失败**并点名缺哪个服务。

也就是说：本包的 6 行里任何一行装配失败，boot 都会带着具体原因失败。不需要额外守卫。

---

## 📦 安装

### 1. GitHub 简写（推荐，最短）

```bash
dsh plugin --profile <profile名> add github:ZhaXionghui/dsh-remote-cluster
```

### 2. 完整 git URL（GitCode 镜像 / 需要显式 URL 时）

```bash
# GitHub
dsh plugin --profile <profile名> add git+https://github.com/ZhaXionghui/dsh-remote-cluster.git

# GitCode 镜像（国内网络）
dsh plugin --profile <profile名> add git+https://gitcode.com/ZhaXionghui/dsh-remote-cluster.git
```

### 3. 本地路径（改本 bundle 源码后即时验证）

```bash
dsh plugin --profile <profile名> add file:/绝对路径/dsh-remote-cluster
# 等价：file:/绝对路径/dsh-remote-cluster
```

### 4. npm 包名（本包发布到 registry 之后）

```bash
dsh plugin --profile <profile名> add dsh-remote-cluster
```

### `#` 后面接什么

如果目标环境的网络需要，可以指定分支、标签或提交：

```bash
dsh plugin --profile <profile名> add github:ZhaXionghui/dsh-remote-cluster#v0.3.0
```

### 关于 `allowBuilds`

本 bundle **不需要** `allowBuilds`：

- **零构建脚本**——`package.json` 里没有 `scripts`，没有东西可被 pnpm ≥ 10 的构建授权闸门拦下；
- **产物已经随包发货**——`vendor/` 下的 `.js` 就是最终运行时产物，不需要在安装时编译。

所以四种安装形态都是**一条命令一步装完**。

> ⚠️ 维护者注意：`package.json` 的 `files` **必须**包含 `vendor/`。npm/git 打包只带 `files` 明确列出的路径，漏了 `vendor/` 就会发一个只有 patch、没有任何实现的空壳。

---

## ⚙️ 配置集群清单

本包的 `remote-hosts-ssh` 行读取环境变量 `DSH_REMOTE_CLUSTER_HOSTS`（JSON 数组），未设置时回落中性默认 `[]`：

```yaml
hosts: !!js 'process.env.DSH_REMOTE_CLUSTER_HOSTS ? JSON.parse(process.env.DSH_REMOTE_CLUSTER_HOSTS) : []'
```

### 路线 A：环境变量（推荐；容器 / CI / 临时供给）

```bash
export DSH_REMOTE_CLUSTER_HOSTS='[
  {"id":"gpu","label":"GPU 集群","kind":"cluster","hostname":"login.gpu.example.org","user":"me","passwordAuth":true},
  {"id":"build","label":"构建机","kind":"server","hostname":"build.example.org","port":2222,"user":"me","agentSocket":"$SSH_AUTH_SOCK"}
]'
dsh web
```

字段参考见 [`docs/CLUSTER-INVENTORY.md`](docs/CLUSTER-INVENTORY.md)。

> ⚠️ 必须在**启动 dsh 的那个进程环境**里设置。profile 的 `.env` 与环境变量不同源。

### 路线 B：持久化到 `$DSH_HOME/settings.yaml`

```yaml
# $DSH_HOME/settings.yaml
remote-host-ssh:
  hosts:
    - id: gpu
      label: GPU 集群
      kind: cluster
      hostname: login.gpu.example.org
      user: me
      passwordAuth: true
```

settings 路线在 `remote-hosts-ssh` 行挂载后生效，且会与配置里的 `hosts` 合并/覆盖。

### 认证材料

每台主机**必须恰好配置一种**认证源，否则 `validate()` 抛错：

| 方式 | 字段 | 说明 |
|---|---|---|
| 私钥文件 | `identityFile` | 本地私钥路径 |
| SSH agent | `agentSocket` | agent socket 路径 |
| 密码 | `passwordAuth: true` | 密码走凭据库，**不写在这里** |

`hosts` 里**永远不要**写密码或私钥正文——密码经 `ctx.credentials` 存取，私钥经 `identityFile` 读取。

---

## 🔍 验证

### 1. 确认 bundle 已被识别为 profile 的一层

```bash
cat "$DSH_HOME/profiles/<p>/package.json"
# dsh.profile.bundles 末尾应有 "dsh-remote-cluster"
```

### 2. 确认 6 个行都进了配置树

```bash
dsh --profile <p> --dump-config | grep -n -E "remote-hosts|remote-host-controller|tool-remote-host|better-sidebar|ui-remote-host"
```

期望命中 6 行，且来源注释里带 `dsh-remote-cluster`，`name` 是 `file:///…/dsh-remote-cluster/vendor/…/lib/index.js`。

> ⚠️ `--dump-config` 是**只 dump、不 boot**：`!!js` 表达式**逐字原样打印、不求值**。想验证 `!!js` 求值，只能真 boot。

### 3. 在真实 boot 里确认清单生效

启动 `dsh web`，打开右侧栏的远程主机面板，应看到你在 `DSH_REMOTE_CLUSTER_HOSTS` 里配置的主机。

### 4. 跑仓库自带的两个校验工具

```bash
node tools/verify-bundle.mjs    # 结构 + 真实 loader 解析 + 真实模块导入 + 真值求值
node tools/boot-smoke.mjs       # 真实 boot 冒烟
```

（如果沙箱拦截递归删除，加 `CODEBUDDY_SAFE_DELETE_ENABLED=0`；若 `node` 被 shim 包裹，还要 `NODE_OPTIONS=''`——原因见 `tools/boot-smoke.mjs` 里 `SAFE_DELETE_ENV` 的注释。）

`verify-bundle.mjs` 是**本包的主要证据**：它用真实 loader 解析 patch、真实 import 每个 vendored 产物、在活 context 上激活每一对服务，并用引擎自己的 `interpolate` 求值那条 `!!js` 表达式。本机实测 **153 PASS / 0 FAIL**。

`boot-smoke.mjs` 有**两种形态**，脚本会先用 `--dump-config` 判定当前是哪种（不是猜）：

| 形态 | 判定依据 | 结果 |
|---|---|---|
| **已发布 npm dsh**（本包的目标形态） | base 不含那六个 id | **`>>> BOOT SMOKE PASS`，无 SKIP** —— `[A]` 与 `[无本层]` 都真正跑了 |
| **本仓库源码工作区** | in-tree base 已声明那六个 id | 退出码 0，但 `[A]`/`[无本层]` 被标 `SKIP` 并打印原因 |

指向已发布形态：

```bash
DSH_SMOKE_DSH=<安装目录> \
DSH_SMOKE_CLI=<安装目录>/node_modules/@deepseek-ai/dsh/lib/bin.js \
  node tools/boot-smoke.mjs
```

**`SKIP` 不是 `PASS`**：看到 `SKIP` 就说明本次运行没有验证 boot 行为。

已发布形态的 `[A]` 实测断言（全部 PASS）包括：boot 到开始服务、fixture 写出已解析清单、注册表里恰好 2 台主机、`gpu-cluster` 的 `kind`/`hostname`/`user` 与 `build-server` 的 `port=2222` 均正确、`label` 原样传递、以及 `env` 未设时回落为空清单——即那条 `!!js` hosts 表达式与整条 remote-host 栈端到端工作。

---

## ⚠️ 已知限制

---

### 1. 本机源码工作区上跑不了完整 boot（不是版本偏斜，是 id 撞车；目标形态已实测通过）

> **先说结论**：这条限制**只影响「在源码工作区里跑 boot」这一种用法**。本 bundle 的**目标形态——装在已发布的 npm dsh 上——已经端到端实测通过**，证据见本节末尾「已发布形态的端到端实测」。

**这条限制与版本无关。** 本仓库开发机上链接的 harness 是 **源码工作区**（`D:\Dev\deepseek-harness`），而源码工作区的 in-tree bundle **自己就声明了本包要提供的全部六个行 id**：

| 行 id | 声明位置 |
|---|---|
| `remote-hosts` | `packages/bundle/base/cordis.patch.yml:90` |
| `remote-hosts-ssh` | `packages/bundle/base/cordis.patch.yml:93` |
| `tool-remote-host` | `packages/bundle/base/cordis.patch.yml:280`、`packages/bundle/web-app/cordis.patch.yml:351` |
| `remote-host-controller` | `packages/bundle/web-app/cordis.patch.yml:99` |
| `better-sidebar` | `packages/bundle/web-app/cordis.patch.yml:208` |
| `ui-remote-host` | `packages/bundle/web-app/cordis.patch.yml:211` |

于是本包的 `insert:` 与 base 层**必然**重名。这不是本 patch 的缺陷，而是 `insert` 式装配的固有性质：

- `applyEntryPatches` 对 `insert` 行做的是**无条件 `data.push(...insert)`，没有任何去重**（`vendor/include/src/index.ts:93-101`）；
- 重复 id 是**更晚**在 boot 时由 `EntryGroup.update` 抛出的：`for (const options of config) { const id = this.tree.ensureId(options); if (seen.has(id)) throw new TypeError('duplicate loader entry id: ' + id) }`（`vendor/loader/src/config/group.ts:61-64`）；
- 这段扫描遍历的是**原始条目列表，早于任何 `disabled`（含 `!!js disabled`）被读取**。

由此得到两个结论，都已在源码上验证：

1. **不存在**「有则跳过、无则插入」的条件行写法——条件再怎么写都改变不了扫描顺序；
2. loader 在任一行失败时**回滚整个分组**（`vendor/loader/src/config/group.ts:77-78`），所以这一撞是**致命**的，不是可忽略的告警。

**本机实测**：源码工作区的 base **本身能正常 boot**（会打印 `dsh web: http://127.0.0.1:63331/?token=…` 并开始服务）。之前一度记录为「base 自身无法 boot」是本机临时装的 `/d/Dev/.pubdsh` 已发布包链接造成的假象，与源码工作区无关。

**本机到底能验证什么**：`--dump-config` 在源码树的合成配置里能查到 `id: remote-hosts` 出现 2 次、`id: better-sidebar` 与 `id: ui-remote-host` 各 1 次——即撞车被直接观测到，与上面的源码结论一致。

**后果**：`tools/boot-smoke.mjs` 在检测到 base 已占用这些 id 时（用 `--dump-config` 判定，不是猜），把 `[A]` 与 `[无本层]` 两节整体标记为 `SKIP`（**不是 PASS**），并在总结里显式声明盲区：本包所在分组未被加载时，「本包自身的行有缺陷」在 boot-smoke 里**无法暴露**。该职责由 `tools/verify-bundle.mjs` 承担——它用「向 patch 注入重复 id」的负向测试确认了自己能抓到这类缺陷，而 boot-smoke 抓不到。

#### 已发布形态的端到端实测

上面说的「两种形态无法同时取得」是**过程**，不是**结论**。已发布的 npm 包是可以拿到的，所以目标形态被真正跑了一遍。做法：

1. 在一个干净的 `DSH_HOME` 下装真实的 `@deepseek-ai/dsh@0.1.5-rc.3`；
2. 从 registry 取 `dsh-base@0.1.5-rc.3` 与 `dsh-web-app@0.1.5-rc.3` 的 tarball，**在 tarball 层面**数六个 id 的出现次数——**两者都是 0**，证实已发布形态里这六行确实空闲（这与源码工作区正好相反）；
3. 在 profile 里执行 `dsh plugin add file:D:/Dev/dsh-remote-cluster`。

实测结果：

| 检查项 | 结果 |
|---|---|
| `plugin add` | **成功**：`+ dsh-remote-cluster 0.3.0`，`Done in 49.7s using pnpm v11.24.0` |
| bundle 落地 | `node_modules/.pnpm/dsh-remote-cluster@file+.../node_modules/dsh-remote-cluster/` 下 `vendor/`（6 个）、`cordis.patch.yml`、`lib/`、`THIRD-PARTY-NOTICES.md` 齐全 |
| 依赖闭包 | `@deepseek-ai/schemastery@3.18.2`、`schemastery@3.18.0`、`ssh2@1.17.0`、`ws@8.21.3`、`zod@4.6.5`、`@deepseek-ai/cordis@4.0.2` 全部解析成功 |
| `--dump-config` | **539 行 → 566 行**，多出的 27 行就是本包的六个行，**顺序正确** |

`--dump-config` 里本包那六行（`better-sidebar` 在 `ui-remote-host` 之前，`!!js` 表达式原样保留）：

```yaml
- id: remote-hosts
  name: file:///.../dsh-remote-cluster/vendor/host-remote-host/lib/index.js
- id: remote-hosts-ssh
  name: file:///.../dsh-remote-cluster/vendor/host-remote-host-ssh/lib/index.js
  config:
    hosts: !!js process.env.DSH_REMOTE_CLUSTER_HOSTS ? JSON.parse(...) : []
- id: remote-host-controller
- id: tool-remote-host
- id: better-sidebar
- id: ui-remote-host
  name: file:///.../dsh-remote-cluster/vendor/ui-remote-host/lib/index.js
```

其中 `file://` URL 是 boot 期 `anchorInsertedPluginNames`（`packages/boot/app-boot/src/index.ts:311-321`）把 `./vendor/...` 相对名重写出来的——这正是第 3 步选「相对名 + 运行期锚定」而不是「裸包名」的直接证据：`npm view @deepseek-ai/dsh-host-remote-host` 返回 **E404**，裸名在 registry 上不存在，只能靠相对路径。

**所以：** 若你要在源码工作区里跑 `tools/boot-smoke.mjs`，看到 `[A]`/`[无本层]` 两节是 `SKIP` 属预期，**不代表本包有问题**；要在已发布 dsh 上跑，用 `DSH_SMOKE_CLI=<profile>/node_modules/@deepseek-ai/dsh/lib/bin.js node tools/boot-smoke.mjs` 即可，那才是本包的目标形态。

### 2. 与 aggregate bundle 的互斥

`dsh-better-sidebar` 的上游 `cordis.patch.yml` 带一个 `!!js` 守卫，防止它在与其他 bundle **同时**挂载时重复装配。本包**不**发货那个 `cordis.patch.yml`，而是直接在自己的 patch 里挂 `better-sidebar` 行——所以：

**不要把本包与另一个已经自带 `better-sidebar`（或自带整套 remote-host 子系统）的 aggregate bundle 同时装进同一个 profile**，否则会撞 `duplicate loader entry id`。

### 3. 版本锁定

本包内联的上游产物面向 `0.1.5-rc.3` 生态。宿主 dsh 大版本变化时，vendored 的产物可能不再兼容——升级 dsh 后请重跑 `tools/verify-bundle.mjs`。

### 4. 没有「原生终端认证」这条路

上游 remote-host 子系统有一条**可选**能力：在原生终端里完成密码 / MFA / 主机密钥 / 私钥口令提示，从而绕过浏览器轮询。**本包不提供它。**

原因是上游调用的 `openNativeTerminal`（`@deepseek-ai/dsh-native-command`）**从未随任何版本发布**——它在源码提交 `c36edb349f` 里新增，排在 `3f1b46a5db release(dsh): 0.1.2-alpha.2` 之后。已发布的 `0.1.5-rc.3` 只导出：

```
canOpenNativePath · nativeFileManager · openNativePath
openNativeTextFile · revealNativePath · runNativeCommand
```

而这是个**静态 ESM 绑定**，失败发生在链接期而非解析期，所以 `node --check` 看不出、`[13]` 断言族也看不出；只有该行真正加载时才炸，而且会**整棵插件树一起失败**：

```
Error: dsh: plugin tree failed to load: failed to import loader entry
remote-hosts-ssh (.../vendor/host-remote-host-ssh/lib/index.js):
The requested module '@deepseek-ai/dsh-native-command' does not provide
an export named 'openNativeTerminal'
```

**处理方式**：把该启动器改成显式抛 `TERMINAL_UNAVAILABLE`。这不是权宜之计——该能力在 Service Definition 里本来就是可选的，缺 `openTerminal` 时**上游自己就抛这个错误**（`vendor/host-remote-host/lib/index.js:125`），SSH backend 也会走到同一分支（`vendor/host-remote-host-ssh/lib/index.js:1247`），controller 把它映射成 `remote-host/terminal-unavailable`，调用方已有处理。

**影响**：失去「在原生终端里认证」的快捷路径；**面板内认证路径完全不受影响**，仍可建立由 DSH 管理的连接。

**回归防护**：`tools/verify-bundle.mjs` 的 `[14]` 断言族现在会对**每一个可达的具名导入**核对它在真实已发布包里的存在性。它**刻意优先用已发布安装而不是本仓库的源码链接**：源码链接报 `0.1.2-alpha.2`，那个版本的 `dsh-session` 不导出 `SessionLogOffset`，而已发布的 `0.1.5-rc.3` 导出——拿未发布的版本去判定 vendored 代码，只会造出消费者碰不到的假缺陷。只有源码链接的包会被标成 `SKIP`，不会被判失败。

#### 一个已排查的疑点：`@deepseek-ai/dsh-session` 没有声明为本包依赖

`better-sidebar` 从 `@deepseek-ai/dsh-session` 导入 `SessionLogOffset`，但本包的 `dependencies` 里**没有**它。这不缺，因为**宿主侧负责**：`dsh-base@0.1.5-rc.3` 自己就声明了 `@deepseek-ai/dsh-session: ^0.1.5-rc.3`，且 `resolveBundleDir` 会**从 dsh 安装目录或 profile** 解析（`dsh-app-boot/lib/index.js:831`）。这条链已在**真实消费者场景**下实测：

| 场景 | 结果 |
|---|---|
| 把 bundle 以 `file:` 装进**全新 \$DSH_HOME**（真实副本，无 `node_modules`） | ✅ `dsh web: http://127.0.0.1:63927/?token=…` |
| 该 profile 的 `node_modules/@deepseek-ai/` 内容 | 只有本包声明的 8 个 + `dsh-brand` + `schemastery`；**没有** `dsh-session` |
| `dsh-session` 实际来源 | dsh 安装目录 `node_modules/@deepseek-ai/dsh-session@0.1.5-rc.3`（导出 `SessionLogOffset`） |

**排查过程中一度误判为缺陷**：在本仓库开发机上，bundle 目录被软链到源码树，而源码树自带的 `node_modules/@deepseek-ai/dsh-session` 指向 `packages/core/session`（`0.1.2-alpha.2`，**不**导出该符号）。当解析回落到这个链接时，boot 会以
`better-sidebar … does not provide an export named 'SessionLogOffset'` 失败——**这是开发脚手架的产物，不是发布形态的问题**：真实安装中该符号由 dsh 安装目录提供，上面的实测表就是证据。`[14]` 断言族选择只按已发布安装判定，正是为了避免把这类脚手架假象当成缺陷。

### 5. 宿主要求

`engines.node` 为 `^22.19 || >=24`。本包声明 **11 个** `dependencies`（6 个 `@deepseek-ai/dsh-*` 上游包、`@deepseek-ai/schemastery` 与 `schemastery` 两个不同的包、`ssh2`、`ws`、`zod`）以及一个 `peerDependencies`：`@deepseek-ai/cordis@4.0.2`（框架由 profile 提供，与 `dsh-base` / `dsh-web-app` 的声明方式一致）。pnpm 会从 registry 把这些装进 profile，vendored 代码从那里解析。

完整清单与「为什么 `schemastery` 和 `@deepseek-ai/schemastery` 是两个不同的包」见 `THIRD-PARTY-NOTICES.md` 第 3 节。这份清单由 `tools/verify-bundle.mjs` 的 `[13]` 断言族守住：它从 patch 的 6 个入口出发，沿相对 import 与各 vendored manifest 的 `exports` 子路径做**运行期可达性遍历**，任何一个可达的裸导入没有归属就硬失败。

---

## 📁 目录结构

```
dsh-remote-cluster/
├── package.json            # bundle 声明：dsh.bundle.patch → ./cordis.patch.yml
├── cordis.patch.yml        # 唯一的 patch：一个 insert: 装 6 行
├── lib/
│   └── index.js            # 空模块（export {}）——见下
├── vendor/                 # 内联的上游产物（0.3.0 的核心）
│   ├── host-remote-host/           # 注册表 / 接缝（提供 remoteHosts）
│   ├── host-remote-host-ssh/       # SSH provider
│   ├── remote-host-controller/     # Typert Remote 投影（浏览器侧）
│   ├── tool-remote-host/           # 面向模型的工具
│   ├── better-sidebar/             # VS Code 式侧栏（dsh-better-sidebar@0.19.1）
│   └── ui-remote-host/             # 远程主机面板（Web 侧栏）
├── docs/
│   └── CLUSTER-INVENTORY.md        # 清单字段参考 + 两条路线取舍
├── tools/
│   ├── verify-bundle.mjs           # 主证据：真实 loader / 真实 import / 真值求值
│   ├── boot-smoke.mjs              # 真实 boot 冒烟（含环境限制的诚实标注）
│   └── link-deps.mjs               # 本地复现 healProfileModuleFallback 的依赖闭包
├── THIRD-PARTY-NOTICES.md  # 内联了哪些上游、改写了几处、什么许可
├── README.md
└── LICENSE
```

### 为什么用 `./vendor/...` 相对名而不是裸包名？

这 5 个上游包**在 npm 上不存在**（`npm view @deepseek-ai/dsh-host-remote-host` → E404），已发布的 dsh 也不声明它们。裸包名要靠 profile 的 `node_modules` 解析，而 `healProfileModuleFallback` 只 link「能从本包 package.json 按 Node 规则解析到」的依赖——`vendor/` 下的副本名字与位置都不在 Node 查找路径里，裸名解析不到。

路径可行：`./vendor/xxx/lib/index.js` 会在**运行时**被 `anchorInsertedPluginNames`（`packages/boot/app-boot/src/index.ts:311-321`）重写成锚定 patch 文件所在目录的绝对 `file://` URL。仓库里存的是相对字面量，所以在任何机器上 clone、装进任何 profile，重写出来的都是那台机器上的正确绝对路径——**跨机可移植**。

### 为什么 `lib/index.js` 是空的？

DSH 判定一个依赖是不是 bundle，**只看** `package.json` 里有没有 `dsh.bundle.patch`；真正的行为全部由 `cordis.patch.yml` 声明。留一个最小的合法 ESM 模块，是为了保证从 git 源码安装时不会因为缺少入口而触发任何构建流程。

### 为什么 `better-sidebar` 必须排在 `ui-remote-host` 之前？

`ui-remote-host` 的 `dsh.client.inject` 声明了 `dsh-better-sidebar`，客户端模块图要求被 inject 的行先到达。缺了它，该 entry 会停在 pending，而 `assertEntriesActive`（`packages/client/web/src/boot.ts:138-158`）会让**整页白屏**（`web boot: 1 entry did not activate`）。本包的 patch 顺序保证了这个先序，且 `tools/verify-bundle.mjs` 有断言钉住它。

---

## ❓ 常见问题

**Q1：装了以后侧栏/工具没出现，怎么查？**

按顺序排查：

1. `cat "$DSH_HOME/profiles/<p>/package.json"` → `dsh.profile.bundles` 里有没有 `"dsh-remote-cluster"`；
2. `dsh --profile <p> --dump-config | grep -c "dsh-remote-cluster"` → 应有 6 行来自本包；
3. 启动时的 stderr 有没有 `duplicate loader entry id` → 说明撞了另一个自带同名的 bundle（见[已知限制 2](#2-与-aggregate-bundle-的互斥)）；
4. 清单为空 ⇒ 检查 `DSH_REMOTE_CLUSTER_HOSTS` 是不是在**启动 dsh 的那个进程环境**里设的。

**Q2：清单取值写错了会怎样？**

`hosts` 必须是 JSON 数组。除 `null`（与未设置等价，回落 `[]`）之外，非数组与非法 JSON 都会让 boot **fail-loud**（exit 1）：

| `DSH_REMOTE_CLUSTER_HOSTS` 的字面取值 | 真实结果 |
|---|---|
| 未设 / `[]` | exit 0，清单 `[]` |
| `null` | **exit 0，静默回落 `[]`**（schema 的 `.default([])`）——与其它非数组不一致，须留意 |
| `123` | **exit 1**：`invalid config: - $.hosts expected array but got 123 (at hosts)` |
| `"str"` | **exit 1**：`… expected array but got str (at hosts)` |
| `{}` | **exit 1**：`… expected array but got [object Object] (at hosts)` |
| `{oops`（非法 JSON） | **exit 1**：`… Expected property name or '}' in JSON at position 1` |
| `[{"id":"x"}]`（缺 `label`/`hostname`/`user`） | **exit 1**：`… $.hosts[0].label missing required value (at hosts.0.label)` |

**Q3：为什么 `passwordAuth` 的目标要走 ControlMaster？**

因为一次会话里可能要跑很多条命令、做多次传输，而密码认证**没法复用 agent**。本层保留 `passwordControlMaster: true` + `controlPersistSeconds: 900`：第一次登录后用 OpenSSH ControlMaster 复用同一条连接，900 秒内不重复握手。**这三个键必须一次写全**——patch 的 `config` 是**整体替换**而非 merge（`vendor/include/src/index.ts:121-124`），不重述就会被清回 schema 默认值。

**Q4：可以用多个 profile 吗？**

可以，对每个 profile 各执行一次 `dsh plugin --profile <名字> add ...`。profile 的 `dsh.profile.bundles` 各自独立。

**Q5：升级 dsh 之后要不要重测？**

要。见[已知限制 3](#3-版本锁定)：重跑 `node tools/verify-bundle.mjs`。

---

## 🗑 卸载

```bash
dsh plugin --profile <profile名> remove dsh-remote-cluster
```

DSH 会自动 reconcile `dsh.profile.bundles`，把这一层摘掉。想彻底清干净，可再删除 profile 目录下的 `node_modules/dsh-remote-cluster`。

---

## 📄 许可证

本包自身：[MIT](LICENSE)。

它**内联**了若干上游项目的产物（`@deepseek-ai/dsh-*` 诸包、`dsh-better-sidebar`），许可以及各处的改写记录见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

---

<div align="center">

**Harness:** [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

</div>
