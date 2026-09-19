# 集群清单参考（Cluster Inventory）

本文件是 `dsh-remote-cluster` 配置的**详细参考**。所有字段名与默认值都**逐一抄自** SSH Provider 的 schema——
`packages/host/remote-host-ssh/src/index.ts:108-138`（`hostConfig` 在 `:108-121`，顶层 `Config` 在 `:124-138`）——
以及它的校验逻辑（`:181-242`）。上游仓库：`deepseek-ai/deepseek-harness`。

> 本包只负责**替换** `remote-hosts-ssh` 这一行的 `hosts`（以及原样重述三个 base 默认值），
> 字段语义完全由上面的 Provider 决定；本文件不改写、不扩展任何字段。

---

## 1. 顶层配置（`remote-hosts-ssh` 行）

| 键 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| `hosts` | array | `[]` | **本包要替换的唯一键**。清单，每项见 §2 |
| `idleDisconnectMs` | number | `18000000` | 空闲多久自动断开（ms，正整数） |
| `connectTimeoutMs` | number | `20000` | 连接超时（ms，正整数） |
| `disconnectTimeoutMs` | number | `5000` | 断开超时（ms，正整数） |
| `commandTimeoutMs` | number | `60000` | 命令默认超时（ms，正整数） |
| `maxOutputBytes` | number | `256000` | 单条命令输出上限（正整数） |
| `maxTransferBytes` | number | `268435456` | 单文件上传/下载上限（正整数） |
| `passwordControlMaster` | boolean | `true` | password-only 目标是否走 OpenSSH ControlMaster |
| `controlPersistSeconds` | number | `900` | ControlMaster 复用连接保留时长（正整数） |
| `keepaliveIntervalMs` | number | `15000` | 保活间隔（非负整数） |
| `keepaliveCountMax` | number | `3` | 保活失败容忍次数（正整数） |
| `sshClient` | `'auto' \| 'native' \| 'wsl'` | `'auto'` | 用哪个本地 SSH 客户端 |
| `wslDistro` | string | 无（可选） | `sshClient` 解析为 WSL 客户端时使用的发行版名 |

**本层只重述 `passwordControlMaster` / `controlPersistSeconds` / `maxTransferBytes` 三个键**，
其余键继续沿用 schema 默认（因为 patch 的 `config` 是**整体替换该行的 config 对象**，
`vendor/include/src/index.ts:121-124`；没提到的键不会被清空，而是回到 schema 默认）。

---

## 2. 清单项（`hosts[]` 的每一项）

| 键 | 类型 | 必填 / 默认 | secret? | 说明 |
|----|------|-------------|---------|------|
| `id` | string | **必填** | | 稳定、非空、**唯一**的 id（重复 id 会报错，`:222-223`） |
| `label` | string | **必填** | | 展示名，非空；会出现在 Remote hosts 面板 |
| `kind` | `'server' \| 'cluster'` | 默认 `'server'` | | 语义分类，见 §4 |
| `hostname` | string | **必填** | | DNS 名或 IP |
| `port` | number | 默认 `22` | | 1–65535，整数 |
| `user` | string | **必填** | | 远端登录用户 |
| `hostKeySha256` | string | 可选 | ✅ `role('secret')` | 期望的主机公钥 SHA-256（小写 hex，格式校验见 `:181-185`） |
| `identityFile` | string | 可选 | ✅ `role('secret')` | **认证来源之一**：私钥文件路径（支持 `~`） |
| `agentSocket` | string | 可选 | ✅ `role('secret')` | **认证来源之一**：ssh-agent socket 路径 |
| `passwordAuth` | boolean | 默认 `false` | | **认证来源之一**：改用密码/键盘交互 |
| `controlMaster` | boolean | 可选 | | 按主机覆盖顶层 `passwordControlMaster` |
| `controlPersistSeconds` | number | 可选 | | 按主机覆盖顶层 `controlPersistSeconds`（正整数） |

### 关键约束：**恰好一种认证来源**

Provider 会统计 `identityFile` / `agentSocket` / `passwordAuth === true` 三者的数量，
**必须恰好为 1**，否则报错
（`remote-host-ssh: host "<id>" must configure exactly one of identityFile, agentSocket, or passwordAuth`，
`:225-232`）。这条错误会让那一行挂载失败，并让 boot **fail-loud**（不是静默跳过）。

### `role('secret')` 意味着什么

`hostKeySha256` / `identityFile` / `agentSocket` 三个字段在 schema 里被标记为
`z.string().role('secret')`（`:115-117`）。这意味着：

- **放进这些字段的必须是「引用」，不是「秘密本身」**——一个路径、一个 socket 位置、一个指纹；
- **永远不要把私钥内容、密码明文写进这些字段**；
- 需要落盘/回显的配置面（settings 文档、dump、UI）会把这些字段当敏感值对待，但**这不是加密**，
  别把它当保密手段用。

---

## 3. JSON 示例（环境变量 / `hosts` 值）

两台主机：一台集群（走 `identityFile`）、一台单机（走 `passwordAuth`，因此会走 ControlMaster）：

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

最小可用项（三个必填键 + 一种认证来源）：

```json
[{ "id": "h1", "label": "H1", "hostname": "h1.example.org", "user": "alice", "passwordAuth": true }]
```

用 `agentSocket` 的项（例如 Windows 上 Pageant）：

```json
[{ "id": "w1", "label": "Win host", "hostname": "w1.example.org", "user": "alice", "agentSocket": "pageant" }]
```

### 输入必须是一个 JSON 数组（边界矩阵）

`DSH_REMOTE_CLUSTER_HOSTS` 的值被本层的 `!!js` 表达式原样 `JSON.parse`，再交给 Provider 的 schema 校验
（`packages/host/remote-host-ssh/src/index.ts:124-138`）。下面每一行都是**真实 boot 实测**的结果
（`dsh --profile <p> --no-open --host 127.0.0.1 --port 0`，一个临时 `DSH_HOME`）。
下表第一列 `X` 表示 `DSH_REMOTE_CLUSTER_HOSTS` 在进程环境里的**字面取值**——即那一串原始字符本身（**含**引号与花括号），不是 JSON 类型名：

| `DSH_REMOTE_CLUSTER_HOSTS` 的字面取值 | 真实结果 |
|---|---|
| 未设 / `[]` | exit 0，清单 `[]` |
| `null` | **exit 0，静默回落 `[]`**（`null` 触发 schema 的 `.default([])`，与「未设置」等价）—— 与其它非数组**不一致**，务必留意 |
| `123` | **exit 1**：`… invalid config: - $.hosts expected array but got 123 (at hosts)` |
| `"str"` | **exit 1**：`… invalid config: - $.hosts expected array but got str (at hosts)` |
| `{}` | **exit 1**：`… invalid config: - $.hosts expected array but got [object Object] (at hosts)` |
| `{oops`（非法 JSON） | **exit 1**：`… Expected property name or '}' in JSON at position 1 (line 1 column 2)` |
| `[{"id":"x"}]`（缺 `label`/`hostname`/`user`） | **exit 1**：`… invalid config: - $.hosts[0].label missing required value (at hosts.0.label)` |

上表中的 `…` 都代表同一个前缀：

```
dsh: fatal load failure: Error: failed to apply loader entry remote-hosts-ssh (@deepseek-ai/dsh-host-remote-host-ssh):
```

**这是刻意的 fail-loud。** 一个拼错的环境变量会让 harness **直接启动失败（exit 1）**，而不是带着半截或空清单悄悄继续跑——
后者会表现成「看起来装好了，但目标主机永远不在」，那才是最难排查的一类故障。
唯一例外是 `null`：它被 schema 当「无值」处理并套用默认 `[]`，所以 `null` 与未设置等价、**不会**报错——别指望靠 boot 失败发现自己把清单写成了 `null`。

---

## 4. `kind` 的语义：登录节点 vs 计算节点

`kind` 是**面向操作者的角色标签**（上游类型注释即 "Operator-facing role of a configured SSH target"，
`packages/host/remote-host/src/types.ts:11-12`），取值只有 `'server'` 与 `'cluster'`。Provider 会把它**原样**放进
注册表的 summary（`:295`，缺省 `'server'`），Remote hosts 面板与面向模型的 `remote_host_*` 工具据此展示分类。

实践上的用法：

- **`kind: cluster`** —— 指向集群的**登录节点 / 提交节点**（有调度器：Slurm / PBS / LSF 等）。
  作业提交、队列查询都在这台机器上做。
- **`kind: server`** —— 指向一台普通单机。
- **不要**把每个计算节点都单独登记成一项。计算节点通常没有对外 SSH、且是调度器动态分配的资源；
  登记它们既不会让作业跑得更快，也会让清单失控、把 `hosts` 变成一份会过期的拓扑快照。
  真的需要直连某台计算节点时，再单独加一项即可。
- `kind` 只是**分类标签**，不影响 Provider 的认证、多路复用或超时行为。

多集群怎么办？**一个集群一项（登录节点）**，用 `id` 区分（例如 `gpu-cluster` / `cpu-cluster`）。
本包不做任何聚合、分组或继承——`hosts` 就是一个扁平数组，语义与 base 完全一致。

---

## 5. 两条路线：环境变量 vs settings

| 维度 | 路线 A：`DSH_REMOTE_CLUSTER_HOSTS` | 路线 B：`$DSH_HOME/settings.yaml` |
|------|-----------------------------------|-----------------------------------|
| 生效方式 | 本层 `!!js` 表达式在 Loader 挂载时求值 | settings 文档层覆盖 `base`（即本层） |
| 优先级 | 低于 settings | **高于**环境变量 |
| 适合 | 容器 / CI / 临时供给；按环境切换同一台机器 | 这台机器就是这个清单；重启后仍在 |
| 写入者 | 你的 shell / 容器编排 | 你手工写文件，或 `remote_host_create` 工具 / Web 面板 |
| 值形态 | **JSON 字符串** | **YAML** |
| 代码出处 | `cordis.patch.yml`（本包） | `packages/host/remote-host-ssh/src/index.ts:99,391-396` + `packages/settings/settings/src/index.ts:739-753,287-295` |

**为什么 settings 优先级更高（且数组是整体替换）**：

1. Provider 用命名空间 `remote-host-ssh` 注册 settings，并把插件 base config 作为 `base` 传入
   （`packages/host/remote-host-ssh/src/index.ts:99`、`:391-396`）；
2. settings 的解析是 `schema(mergeLayers(base, section))`（`packages/settings/settings/src/index.ts:739-753`）；
3. `mergeLayers` 的规则是「普通对象递归合并，**其它值（含数组）整体替换**」（同文件 `:287-295`）。

所以 `settings.yaml` 里 `remote-host-ssh.hosts` 会**整体替换**本层给出的 `hosts`，
但不会顺手清掉 `passwordControlMaster` 等键。

> ⚠️ 写 settings 时注意：**数组是整体替换**，不是追加。想让 settings 里的清单生效，
> 就把**完整**清单都写进去——写半份会得到半份。

---

## 6. 什么**不该**放进去

| 不要放 | 原因 | 应该放哪 |
|--------|------|----------|
| 密码明文 | `passwordAuth` 只是开关；密码由凭据库管理 | 凭据库（`remote_host_*` 工具的密码认证 / Web 面板）；`resolvePassword` 从凭据库读（`packages/host/remote-host-ssh/src/index.ts:325-331`） |
| 私钥**内容** | `identityFile` 要的是**路径** | 磁盘上的私钥文件，字段里只写路径 |
| OTP / 一次性口令 | 清单是静态配置，不是会话状态 | 交互式认证流程 |
| 每个计算节点 | 清单会变成会过期的拓扑快照 | 只登记登录节点，用 `kind: cluster` |
| 生产主机名/口令进**本仓库** | 本仓库不硬编码任何真实集群 | 环境变量或 settings（都在你的机器上） |

> 本 bundle 的 `cordis.patch.yml` **不含**任何真实主机名、用户名、路径或密码——
> `hosts` 就是一个 `process.env.DSH_REMOTE_CLUSTER_HOSTS` 表达式，env 未设置时回落 `[]`。
