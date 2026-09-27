# 「行级 `disabled` 自动让位」不可行 —— 实测否证（2026-09-27）

## 一、背景

桌面端曾把本包的 `remote-hosts-ssh` / `tool-remote-host` 两行报为**异常**。
初判原因是**重复 entry id**：本包用 `insert:` 无条件注入 5 行，而宿主 bundle
已声明同名 id，`EntryGroup.update` 抛 `duplicate loader entry id` 并回滚整组。

当时（0.4.0 早期草稿）设计的修法是：给每一行加 `disabled` 的 `!!js` 守卫，
在 id 已被占用时让该行**自行禁用**，从而实现用户要求的「自动检测并让位」：

```yaml
- id: remote-hosts
  name: ./vendor/host-remote-host/lib/index.js
  disabled: !!js 'typeof loader === "undefined" || loader.store === undefined ? false : loader.store["remote-hosts"] !== undefined'
```

**这个修法是错的。** 本文记录否证过程与证据。

## 二、为什么看起来可行（当时的推理）

| 环节 | 出处 | 结论 |
|---|---|---|
| `disabled` 支持 `!!js` | `vendor/loader/src/config/entry.ts:104-107` `isJsExpr(options.disabled) ? Boolean(this.evaluate(...)) : ...` | ✅ |
| 求值作用域含 `loader` | `entry.ts:67` `this.ctx = loader.ctx.extend({ [Entry.key]: this })` | ✅ |
| `loader.store` 可读 | `Loader extends EntryTree`，`EntryTree.store` 是 `public`（`tree.ts:13`） | ✅ |
| 求值早于 `init()`，不会 import | `entry.ts:172` `if (!this._disabled(candidate)) await this.init()` | ✅ |

四条全部为真，且被 `verify-bundle.mjs` 的 `[15]` 族静态断言覆盖并通过。

## 三、实测否证

### 3.1 真实 boot 失败

在 5 行全部带守卫的情况下，真实 boot（`tools/boot-smoke.mjs` 的冲突刻画段）仍然：

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include
(cordis:include): duplicate loader entry id: remote-hosts
```

**静态断言全绿，真实 boot 照旧崩溃。**

### 3.2 插桩定位：抛错那一刻 `store` 是空的

在 `vendor/loader/lib/index.js` 的抛错点插桩打印状态：

```js
if (seen.has(id)) {
  console.error("DBGGUARD throw id=" + id
    + " storeKeys=" + JSON.stringify(Object.keys(this.tree.store))
    + " configIds=" + JSON.stringify(config.map(o => o.id))
    + " disabledOfThisRow=" + JSON.stringify(config.filter(o => o.id === id).map(o => o.disabled)));
  throw new TypeError(`duplicate loader entry id: ${id}`);
}
```

输出（截取关键部分）：

```
DBGGUARD throw id=remote-hosts storeKeys=[]
  configIds=["timer","hmr","llm",...,"remote-hosts","remote-hosts-ssh",...,
             "remote-host-controller",...,"tool-remote-host",...,
             "ui-remote-host",...,"remote-hosts","remote-host-ssh"...]
  disabledOfThisRow=[null,{"__jsExpr":"... loader.store[\"remote-hosts\"] !== undefined"}]
```

两个决定性事实：

1. **`storeKeys=[]`** —— 抛错时 `loader.store` **完全为空**。
   守卫读 `loader.store["remote-hosts"]` 得到 `undefined`，于是
   `undefined !== undefined` 为 `false` → 「不禁用」→ 一行都拦不住，**恒不生效**。
2. **`configIds` 里 `remote-hosts` 出现两次** —— 冲突发生在**同一个
   `update()` 调用的扁平数组内部**，不是跨 group，也不是跨 update 周期。

### 3.3 根因：求值时机

```
EntryGroup.update(config)                     group.ts:59
  ├─ for (const options of config) {          :61
  │     const id = ensureId(options)
  │     if (seen.has(id)) throw               :64  ← 抛错在这里
  │  }
  ├─ Promise.allSettled(config.map(create))   :73
  │     └─ create(options)                    :20
  │           └─ this.tree.store[id] = new Entry(...)   :23  ← store 才被写入
  └─ ...
```

`store` 只在 **`create()`** 里写入，而 `create()` 由 `update()` 在重复检查**之后**调用。
所以守卫的判据（`store` 里有没有同 id）在它被求值的那一刻**必然还没被填充**。

> 注意：不是「求值太晚所以来不及 import」——`entry.ts:172` 那条链是对的；
> 而是**判据数据源在那一刻还不存在**。守卫的输入本身是空的。

### 3.4 也没有别的绕法

| 可能的绕法 | 为何不行 | 出处 |
|---|---|---|
| 用 patch 删掉冲突行再插入自己的 | `PatchOptions` 没有 delete/rename 键 | `include/src/index.ts:145-160` |
| 把 5 行塞进一个嵌套 `group` 以隔离 id | `Group` 传的是 `ctx.fiber.entry!.parent.tree`，**同一棵树**，id 命名空间共享 | `group.ts:119` |
| 在 `insert` 列表层面按条件决定加不加 | `!!js` 只在**行自己的 fiber** 里惰性解析；`Include` 的 `static [EntryGroup.key] = true` 让 config 保持字面量，无法条件化整个列表 | `include/src/index.ts:176-181` |
| 改用非 insert patch（改已有行） | 目标行缺失时只是 warn + skip，**天然具备「不存在就跳过」语义**，但它**只能改已存在的行、不能新增** —— 在目标 dsh 完全没有这些行时（本包主要场景）将什么都不提供 | `app-boot/src/index.ts:327-331` |

最后一条是关键权衡：**「提供」与「让位」在同一行上互斥**。
`insert` 能新增但必冲突；非 insert 能容忍缺失但无法新增。

## 四、结论与最终设计

1. **移除全部 `disabled` 守卫。** 保留它只会造成「已经防住了」的错觉 ——
   这正是它最危险的地方：静态检查会全绿。
2. **把适用条件写成硬约束**（README「已知限制」第 1 条）：
   目标 dsh 的 `dsh-base` / `dsh-web-app` **必须不声明**这 5 个 id。
   已发布的 **npm 版** `dsh-base`/`dsh-web-app@0.1.7-rc.2` 正是如此（实测 grep 0 命中）。
3. **把否证固定成断言**，避免将来有人再"修"回来：
   - `verify-bundle.mjs` `[15]` 族：断言**没有任何行带守卫**、没有任何行 `disabled`，
     并复查使其不可行的四条结构前提（重复检查早于 `disabled`、`create()` 在检查之后、
     `PatchOptions` 无删除键、`Group` 共享父树）；
   - `boot-smoke.mjs` 冲突刻画段：在 in-tree 形态下断言重复 id **确实被报出**、
     报错形态是 include 冲突而非插件导入失败、且没有其它 pending 行。

## 五、与「源码树符号链接污染」的叠加

地面实况（`C:\Users\Administrator\.dsh\profiles\node_modules\@deepseek-ai\`，
231 个符号链接全部指向 `D:\Dev\deepseek-harness`）显示桌面 profile 实际挂载的是
**源码树 bundle（`0.1.2-alpha.2`）**，而它们**自带这些行**：

```
dsh-base/cordis.patch.yml:90    - id: remote-hosts
dsh-base/cordis.patch.yml:93    - id: remote-hosts-ssh
dsh-base/cordis.patch.yml:280   - id: tool-remote-host
dsh-web-app/cordis.patch.yml:99   - id: remote-host-controller
dsh-web-app/cordis.patch.yml:208  - id: better-sidebar
dsh-web-app/cordis.patch.yml:211  - id: ui-remote-host
dsh-web-app/cordis.patch.yml:351  - id: tool-remote-host
```

⇒ 桌面端那两行「异常」，**根因就是这些链接让 profile 挂上了自带同 id 的源码树 bundle**。
同时也解释了 `better-sidebar` 的行来源（`dsh-web-app:208`）。
处理办法见 `DESKTOP-DIAGNOSIS.md` 第四节：先摘掉链接，让 profile 从 npm 拉真实
`0.1.7-rc.2`（该版本的 base/web-app 不含任何 remote-host 行，也不含 better-sidebar）。
