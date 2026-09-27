# 源码树符号链接净化（2026-09-27）

## 一、结论

`C:\Users\Administrator\.dsh\profiles\node_modules` 下有 **707 个符号链接**，
**全部指向 `D:\Dev\deepseek-harness`**（源码工作区）。它们已**全部移出**
（不是删除，可回滚），使桌面 profile 改为从 npm 拉取真实 `0.1.7-rc.2` 包。

这正是桌面端那两行「异常」与 `better-sidebar` interception 错误的**共同根因**。

## 二、为什么这些链接会致病

DSH 解析 bundle 时按 Node 规则**向上查找** `node_modules`。桌面 profile 是
`profiles/desktop/`，所以它先看 `profiles/desktop/node_modules`（只有本包 + 依赖闭包，
共 15 项），**找不到 `@deepseek-ai/dsh-base` / `dsh-web-app`，就继续向上**
到 `profiles/node_modules`。

而那一层里 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 等 231 个条目
**是指向源码树的链接**，于是：

```bash
$ node -p "require('./@deepseek-ai/dsh-base/package.json').version"
0.1.2-alpha.2          # ← 源码树版本，不是客户端的 0.1.7-rc.2
```

而源码树的 `dsh-base` / `dsh-web-app@0.1.2-alpha.2` **自带 remote-host 行与
better-sidebar**：

```
dsh-base/cordis.patch.yml:90     - id: remote-hosts
dsh-base/cordis.patch.yml:93     - id: remote-hosts-ssh
dsh-base/cordis.patch.yml:280    - id: tool-remote-host
dsh-web-app/cordis.patch.yml:99  - id: remote-host-controller
dsh-web-app/cordis.patch.yml:208 - id: better-sidebar          ← turnTail 报错来源
dsh-web-app/cordis.patch.yml:211 - id: ui-remote-host
dsh-web-app/cordis.patch.yml:351 - id: tool-remote-host
```

两个后果各自对应一个上报症状：

| 症状 | 链路 |
|---|---|
| `[dsh-better-sidebar] interception error: list slot "conversation.chat.turnTail" requires options.id` | 源码树的 `dsh-web-app:208` 行挂起了 **`dsh-better-sidebar@0.18.0-alpha.0`**（也是链接），它对旧契约注册 |
| `remote-hosts-ssh` / `tool-remote-host` 显示**异常** | 本包 `insert` 的 5 行与源码树自带的同名行**重复 id** → `duplicate loader entry id` → 回滚整组 |

## 三、净化范围（比初次估计大得多）

初次只看到 `@deepseek-ai/` 下的 231 个，实际逐层扫下来是 **707 个**：

| 位置 | 数量 |
|---|---|
| `@deepseek-ai/` 下 | 231 |
| 其他 `@scope/` 子目录内（`@types` 39、`@codemirror` 23、`@aws-sdk` 19、`@lezer` 16、`@lexical` 11、`@opentelemetry` 11、`@smithy` 9 …） | 175 |
| 顶层裸包名（`react`、`react-dom`、`express`、`zod`、`ssh2`、`schemastery`、`ws`、`yaml`、`typescript` …） | 301 |
| **合计** | **707** |

顶层与 scope 内的分布说明这不是「只污染了 dsh 包」——**整个 `profiles/node_modules`
的依赖解析都建立在源码树的 `node_modules` 之上**（`react`/`express` 这类运行时刚需
包同样是链接）。因此这一步必须整体做，只清 `@deepseek-ai` 会留下不一致的解析图。

## 四、执行方式

用 `tools/purge-source-links.mjs`（新增），而非 shell glob —— shell 的
`for d in *` 循环在大目录上**两次被 SIGTERM 杀掉**（每次都要对每个条目 `readlink`）。
脚本流式遍历、幂等、且先出清单再动手：

```bash
# 干跑：只列清单，不动任何文件
node tools/purge-source-links.mjs

# 迁移：把命中的链接移动到备份目录（保留相对结构）
node tools/purge-source-links.mjs --move \
  "C:/Users/Administrator/.dsh/profiles/node_modules/_source-links-backup"
```

判据是**目标路径**而非包名：`/deepseek-harness|D:\Dev\.../`。这比列举包名可靠 ——
否则新加一个包就得改脚本。

**移动而非删除**：`renameSync` 到 `_source-links-backup/`，保留相对路径结构，
所以回滚就是把内容搬回去（清单见 `SYMLINK-BACKUP.txt`，707 行）。

结果：

```
scanned symlinks: 175
source-workspace links: 175
moved into: .../_source-links-backup
leftover (move failed): 0
```

再扫一次 → `scanned: 0, source-workspace links: 0`。**完全净化。**

## 五、回滚方法

```bash
SRC="C:/Users/Administrator/.dsh/profiles/node_modules/_source-links-backup"
DST="C:/Users/Administrator/.dsh/profiles/node_modules"
cd "$SRC" && find . -type l | while IFS= read -r l; do
  mkdir -p "$DST/$(dirname "$l")"
  cp -P "$l" "$DST/$l"        # -P 保留链接本身，不复制目标内容
done
```

`@deepseek-ai.source-links-backup/` 同理（231 条）。

## 六、净化之后要注意的

1. **桌面端可能首次启动时需要重新安装运行时**：净化后 `profiles/node_modules`
   不再提供 `@deepseek-ai/dsh`、`react`、`express` 等。若客户端不会自动补齐，
   桌面端将无法启动 —— 这是净化必然的代价，回滚脚本已备好。
2. **不要在源码树里跑 dsh**：凡是在 `D:\Dev\deepseek-harness` 里执行 `dsh` 命令，
   都可能重新生成这批链接（它们建于 Aug 31 22:14，早于全部 remote-host 开发）。
   要跑本仓库的验证，请用独立的 `DSH_HOME`。
3. **本包在净化后的形态下才有意义**：真实 `dsh-base`/`dsh-web-app@0.1.7-rc.2`
   不含任何 remote-host 行（实测 grep 0 命中），本包的 5 行 `insert` 才是唯一来源。
