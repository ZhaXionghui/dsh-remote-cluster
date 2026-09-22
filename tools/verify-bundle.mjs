/**
 * Boot-free regression verification for the `dsh-remote-cluster` bundle.
 *
 * Everything here is asserted through the harness's OWN machinery, so a future
 * loader/include change cannot silently invalidate the claims this bundle makes:
 *
 *   * `loadOverlayPatches` parses `cordis.patch.yml` exactly as `dsh boot` does;
 *   * `applyEntryPatches` (the include's real patch algorithm) is driven over the
 *     real base bundle's `insert` list, proving layer order and that this layer
 *     never reaches `tool-remote-host`;
 *   * `interpolate` evaluates the `!!js` inventory expression against pinned
 *     `process.env` scopes, proving the three states (unset / empty / populated).
 *
 * Since 0.2.0 the bundle also inserts a loud-fail guard row; [11] asserts that
 * row's shape (top-level insert, portable bare-package `name`, non-colliding id)
 * and its module's contracts (exports `name` / `inject` / `apply`, zero imports,
 * shipped via `files`).
 *
 * Run: node tools/verify-bundle.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '..')
const DSH = 'D:/Dev/deepseek-harness'
const BIN_NAME = 'dsh'
const require = createRequire(join(DSH, 'apps/cli/package.json'))

let failures = 0
/**
 * Print one PASS/FAIL line and count the failure.
 * @param name - the assertion description.
 * @param condition - the assertion outcome.
 */
const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} :: ${name}`)
  if (!condition) failures += 1
}

/** Structural deep equality via canonical JSON (config rows are plain JSON data). */
const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const { loadOverlayPatches } = require('@deepseek-ai/dsh-app-boot')
const { interpolate, isJsExpr } = require('@deepseek-ai/cordis-plugin-loader')
const { applyEntryPatches } = require('@deepseek-ai/cordis-plugin-include')

const patchFile = join(BUNDLE_DIR, 'cordis.patch.yml')
const basePatchFile = join(DSH, 'packages/bundle/base/cordis.patch.yml')

// ── 1. Parse through the real loader ───────────────────────────────────────
let patches = null
let loadError = null
try {
  patches = loadOverlayPatches(BIN_NAME, patchFile)
} catch (error) {
  loadError = error
}
check('[1] cordis.patch.yml 由 DSH 真实 loader 解析成功', loadError === null)
if (loadError !== null) console.log(`       ${String(loadError.message ?? loadError)}`)
if (patches === null) process.exit(1)

check('[1] 解析结果是数组', Array.isArray(patches))
check('[1] patch 列表恰好两行：一行 id-targeted override + 一行守卫 insert', patches.length === 2)
// The id-targeted override is the row carrying `id` + `config` but no `insert`.
const patch = patches.find(entry => entry.id !== undefined && entry.insert === undefined)
check(
  '[1] 存在唯一的 id-targeted override 行（无 insert）',
  patch !== undefined && patches.filter(entry => entry.id !== undefined && entry.insert === undefined).length === 1,
)
check(
  '[1] 该 override 行键集合恰为 {id, name, config}（证明它不是 insert 行）',
  patch !== undefined && Object.keys(patch).sort().join(',') === 'config,id,name',
)

// ── 2. Identity ────────────────────────────────────────────────────────────
check("[2] patch.id === 'remote-hosts-ssh'", patch.id === 'remote-hosts-ssh')
check(
  "[2] patch.name === '@deepseek-ai/dsh-host-remote-host-ssh'",
  patch.name === '@deepseek-ai/dsh-host-remote-host-ssh',
)

// ── 3. The inventory expression is still an unevaluated node ───────────────
const config = patch.config ?? {}
check(
  '[3] config.hosts 仍是待求值表达式节点（未被 YAML 静默解析成 mapping）',
  typeof config.hosts === 'object' && config.hosts !== null && isJsExpr(config.hosts),
)
const hostsExpr = String(config.hosts?.__jsExpr ?? '')
check('[3] 表达式引用 DSH_REMOTE_CLUSTER_HOSTS', hostsExpr.includes('DSH_REMOTE_CLUSTER_HOSTS'))
check('[3] 表达式调用 JSON.parse', hostsExpr.includes('JSON.parse'))

// ── 4. Three-state evaluation through the loader's own interpolate ─────────
const evalHosts = (env) => interpolate({ process: { env } }, config.hosts)
const unset = evalHosts({})
check('[4] env 未设 → []', Array.isArray(unset) && unset.length === 0)
const empty = evalHosts({ DSH_REMOTE_CLUSTER_HOSTS: '[]' })
check("[4] env='[]' → []", Array.isArray(empty) && empty.length === 0)
const sample = [{ id: 'a', label: 'A', hostname: 'h', user: 'u' }]
const populated = evalHosts({ DSH_REMOTE_CLUSTER_HOSTS: JSON.stringify(sample) })
check(
  '[4] env 含一台主机 → 深等于解析后的对象',
  Array.isArray(populated) && populated.length === 1 && populated[0]?.id === 'a'
    && equalJson(populated, sample),
)
check(
  '[4] 三态互不相同（证明表达式真的在求值，而非恒返回同一个常量）',
  equalJson(unset, populated) === false && equalJson(empty, populated) === false,
)

// ── 5. The three base defaults are restated verbatim ───────────────────────
check('[5] config.passwordControlMaster === true', config.passwordControlMaster === true)
check('[5] config.controlPersistSeconds === 900', config.controlPersistSeconds === 900)
check('[5] config.maxTransferBytes === 268435456', config.maxTransferBytes === 268435456)

// ── 6. Layer order and non-overreach, through the real patch algorithm ─────
const baseRows = loadOverlayPatches(BIN_NAME, basePatchFile).flatMap(entry => entry.insert ?? [])
const baseToolRow = structuredClone(baseRows.find(row => row.id === 'tool-remote-host'))
const baseHostsSshRow = structuredClone(baseRows.find(row => row.id === 'remote-hosts-ssh'))

const warnings = []
const composed = applyEntryPatches(
  baseRows,
  [patch],
  (message, ...args) => {
    let index = 0
    warnings.push(message.replace(/%C/gu, () => String(args[index++])))
  },
)

check('[6] 本层应用到 base 行时不触发任何 warn', warnings.length === 0)
if (warnings.length > 0) console.log(`       ${warnings.join(' | ')}`)
check('[6] 行数未增加（本层不 insert）', composed.length === baseRows.length)

const composedHostsSsh = composed.find(row => row.id === 'remote-hosts-ssh')
check(
  '[6] remote-hosts-ssh 的 config 归属本层（hosts 是本层的表达式节点）',
  isJsExpr(composedHostsSsh?.config?.hosts) === true
    && composedHostsSsh.config.hosts.__jsExpr === config.hosts.__jsExpr,
)
check(
  '[6] remote-hosts-ssh 的三个 base 默认值被本层原样携带',
  composedHostsSsh?.config?.passwordControlMaster === true
    && composedHostsSsh?.config?.controlPersistSeconds === 900
    && composedHostsSsh?.config?.maxTransferBytes === 268435456,
)
check(
  '[6] base 原本就是中性默认 hosts: []（本层替换的对象确是它）',
  Array.isArray(baseHostsSshRow?.config?.hosts) && baseHostsSshRow.config.hosts.length === 0,
)

const composedToolRow = composed.find(row => row.id === 'tool-remote-host')
check('[6] tool-remote-host 行的 disabled 仍未定义', composedToolRow?.disabled === undefined)
check('[6] tool-remote-host 行的 config 与 base 原值一致（本层没碰它）', equalJson(composedToolRow?.config, baseToolRow?.config))
check('[6] tool-remote-host 行整体与 base 原值逐字节一致', equalJson(composedToolRow, baseToolRow))

// ── 7. "no-op on a dsh without remote-host" is a regression assertion ──────
const foreignRows = [
  { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer', config: { keep: 1 } },
  { id: 'tool-remote-host', name: '@deepseek-ai/dsh-tool-remote-host' },
]
const foreignSnapshot = structuredClone(foreignRows)
const foreignWarnings = []
const foreignResult = applyEntryPatches(
  foreignRows,
  [patch],
  (message, ...args) => {
    let index = 0
    foreignWarnings.push(message.replace(/%C/gu, () => String(args[index++])))
  },
)
check(
  '[7] 目标行不存在时恰好收到一条 skipped-patch 警告',
  foreignWarnings.length === 1 && foreignWarnings[0] === 'patch: entry remote-hosts-ssh not found',
)
if (foreignWarnings.length !== 1 || foreignWarnings[0] !== 'patch: entry remote-hosts-ssh not found') {
  console.log(`       got: ${JSON.stringify(foreignWarnings)}`)
}
check('[7] 该情况下输入 entries 未被改动（静默 no-op）', equalJson(foreignResult, foreignSnapshot))

// ── 8/9. Manifest and shipped-file invariants ──────────────────────────────
const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
const dependencyKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
check('[8] package.json 不含任何依赖字段', dependencyKeys.every(key => manifest[key] === undefined))
check('[8] package.json 不含任何生命周期脚本', manifest.scripts === undefined)
check('[8] files 包含 LICENSE', manifest.files?.includes('LICENSE') === true)
check('[8] files 包含 README.md', manifest.files?.includes('README.md') === true)
check('[8] files 每一项都真实存在', (manifest.files ?? []).every(file => existsSync(join(BUNDLE_DIR, file))))
check('[8] LICENSE 文件存在且非空', readFileSync(join(BUNDLE_DIR, 'LICENSE'), 'utf8').trim().length > 0)
check(
  '[8] README 中的 LICENSE 链接指向已发货的文件',
  readFileSync(join(BUNDLE_DIR, 'README.md'), 'utf8').includes('](LICENSE)'),
)
check(
  "[9] package.json 的 dsh.bundle.patch === './cordis.patch.yml'",
  manifest.dsh?.bundle?.patch === './cordis.patch.yml',
)
check('[9] 该 patch 文件存在', existsSync(join(BUNDLE_DIR, manifest.dsh?.bundle?.patch ?? 'MISSING')))

// ── 10. Plain-text guard: this layer never names the model-facing tool row ─
// The guard is asserted against the YAML *code*, not the comments: the file's
// header deliberately NAMES `tool-remote-host` to document that this layer must
// never declare it (and why). A comment mentioning a row does not touch it — an
// entry id or a `name:` value would — so comments are stripped first and the
// remaining document must contain no reference to that row at all.
const patchText = readFileSync(patchFile, 'utf8')
const patchCode = patchText
  .split(/\r?\n/u)
  .filter(line => line.trimStart().startsWith('#') === false)
  .join('\n')
check(
  '[10] cordis.patch.yml 的代码部分不含字符串 tool-remote-host（纯文本防线，注释除外）',
  patchCode.includes('tool-remote-host') === false,
)
if (patchCode.includes('tool-remote-host')) console.log(`       code:\n${patchCode}`)
check(
  '[10] 该层 id-targeted 目标集合恰为 {remote-hosts-ssh}（override 行只碰这一行）',
  (patchCode.match(/\bid:/gu) ?? []).length === 2
    && patchCode.includes('id: remote-hosts-ssh')
    && patchCode.includes('id: remote-cluster-guard'),
)

// ── 11. The loud-fail guard row ────────────────────────────────────────────
// The guard is a top-level `insert` row (not an id-targeted override): only an
// inserted row enters the tree at all, and only then can its `inject` be read by
// the boot audit. Its `name` must be a portable bare-package subpath, its id must
// not collide with any base row, and its module must ship with zero imports.
const guardName = 'dsh-remote-cluster/lib/guard.js'
const guardId = 'remote-cluster-guard'
const insertRows = patches.flatMap(entry => entry.insert ?? [])
const guardRow = insertRows.find(row => row.id === guardId)
check('[11] 守卫行以顶层 insert 出现（不是 id-targeted override）', guardRow !== undefined)
check(`[11] 守卫行 name === '${guardName}'（裸包名+子路径，可移植）`, guardRow?.name === guardName)
check(
  '[11] 守卫行 name 不是 ./ 相对名（相对名只对 insert 生效且被改写成绝对 URL，跨机不可移植）',
  typeof guardRow?.name === 'string' && guardRow.name.startsWith('./') === false && guardRow.name.startsWith('../') === false,
)

const baseIds = new Set(baseRows.map(row => row.id))
check('[11] 守卫 id 不与 base 任何行冲突', baseIds.has(guardId) === false)

const guardPath = join(BUNDLE_DIR, 'lib/guard.js')
check('[11] lib/guard.js 文件存在且非空', existsSync(guardPath) && readFileSync(guardPath, 'utf8').trim().length > 0)
const guardSource = existsSync(guardPath) ? readFileSync(guardPath, 'utf8') : ''
check(
  "[11] 守卫导出 name / inject 且 inject 含 'remoteHosts'",
  /export\s+const\s+name\s*=/u.test(guardSource)
    && /export\s+const\s+inject\s*=/u.test(guardSource)
    && guardSource.includes('remoteHosts'),
)
check('[11] 守卫导出 apply（registry 需要 function 或带 apply 的 object）', /export\s+function\s+apply\s*\(/u.test(guardSource))
check(
  '[11] 守卫零 import（守零依赖 / 零构建约束）',
  /^\s*import\s/mu.test(guardSource) === false && /(?:^|\n)\s*import\s*\(/u.test(guardSource) === false,
)
check(
  '[11] package.json 的 files 放行 lib/guard.js（files 含 "lib"，且 guard.js 确实在 lib/ 下）',
  manifest.files?.includes('lib') === true && existsSync(join(BUNDLE_DIR, 'lib', 'guard.js')),
)

console.log(failures === 0 ? '\n>>> ALL BUNDLE CHECKS PASS' : `\n>>> ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
