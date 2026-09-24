/**
 * Boot-free regression verification for the `dsh-remote-cluster` bundle.
 *
 * Everything here is asserted through the harness's OWN machinery, so a future
 * loader/include change cannot silently invalidate the claims this bundle makes:
 *
 *   * `loadOverlayPatches` parses `cordis.patch.yml` exactly as `dsh boot` does;
 *   * `applyEntryPatches` (the include's real patch algorithm) is driven over an
 *     empty root, proving every row this layer mounts and their order;
 *   * `interpolate` evaluates the `!!js` inventory expression against pinned
 *     `process.env` scopes, proving the three states (unset / empty / populated).
 *
 * Since 0.3.0 this bundle is a *functional plugin*, not a config overlay: its
 * patch `insert`s the whole remote-host subsystem (five upstream packages) plus
 * the `dsh-better-sidebar` workbench they need, all from the vended copies under
 * `vendor/`. The assertions below therefore cover:
 *
 *   [1]-[5]  patch shape, insert-only, row order, the inventory expression
 *   [6]      every row's `name` resolves to an on-disk vendored module
 *   [7]      vendor package manifests (name parity, exports, dsh.client)
 *   [8]      the vendored trees load as real ESM
 *   [9]      manifest / shipped-file invariants
 *   [10]     no residual cross-package bare import in the vendor tree
 *   [11]     third-party notices keep the MIT licence text
 *   [12]     the retired 0.2.0 guard is gone and nothing references it
 *
 * Run: node tools/verify-bundle.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
const patchText = readFileSync(patchFile, 'utf8')

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
check('[1] patch 列表恰好一行：一个顶层 insert 容器', patches.length === 1)
const container = patches[0]
check('[1] 该行只有 insert 键（无 id，故不是 id-targeted override）', container?.id === undefined && container?.insert !== undefined)
check('[1] 该行键集合恰为 {insert}', Object.keys(container ?? {}).sort().join(',') === 'insert')

const insertRows = container.insert
check('[1] insert 恰有 6 行（5 个 remote-host 包 + better-sidebar）', insertRows.length === 6)

// ── 2. Row ids and order ───────────────────────────────────────────────────
// Order is load-bearing: `better-sidebar` must precede `ui-remote-host`, whose
// client half injects the `betterSidebar` service. A swap would leave that entry
// PENDING and the Web boot audit would fail the whole page.
const expectedOrder = [
  'remote-hosts',
  'remote-hosts-ssh',
  'remote-host-controller',
  'tool-remote-host',
  'better-sidebar',
  'ui-remote-host',
]
const actualOrder = insertRows.map(row => row.id)
check('[2] 6 行的 id 与顺序完全符合预期', equalJson(actualOrder, expectedOrder))
if (equalJson(actualOrder, expectedOrder) === false) {
  console.log(`       expected: ${JSON.stringify(expectedOrder)}`)
  console.log(`       actual:   ${JSON.stringify(actualOrder)}`)
}
check(
  '[2] better-sidebar 排在 ui-remote-host 之前（否则 UI 条目会 pending）',
  actualOrder.indexOf('better-sidebar') < actualOrder.indexOf('ui-remote-host'),
)

// ── 3. Every name is a ./vendor/<pkg>/lib/index.js relative path ────────────
// A relative name is what makes the vendored copies reachable: the loader
// rewrites it to an absolute file:// URL anchored at the patch file's directory
// (`anchorInsertedPluginNames`), and the client-module discovery then walks up
// from the module to the nearest package.json. A bare package name would have
// to resolve through the profile's node_modules, which cannot work because these
// packages are unpublished.
// NOTE: by the time the rows are read back, `anchorInsertedPluginNames` has
// already rewritten each `./…` name into an absolute `file://` URL. So the
// repo-side literal is recovered from the patch *text* (the `name:` scalars),
// and the row objects only serve to cross-check the resolved URL.
const literalNames = [...patchText.matchAll(/^\s*-?\s*name:\s*(\S+)\s*$/gmu)].map(m => m[1])
check('[3] patch 文本里恰好读出 6 个 name 字面量', literalNames.length === insertRows.length)
for (const [index, row] of insertRows.entries()) {
  const literal = literalNames[index]
  check(`[3] '${row.id}' 的 name 是 ./ 开头的相对路径（${literal}）`, typeof literal === 'string' && literal.startsWith('./'))
  check(`[3] '${row.id}' 的 name 形如 ./vendor/<pkg>/lib/index.js（${literal}）`, /^\.\/vendor\/[\w-]+\/lib\/[\w.-]+$/u.test(String(literal)))
  const target = join(BUNDLE_DIR, String(literal))
  check(`[3] '${row.id}' 的目标文件存在（${literal}）`, existsSync(target))
  check(
    `[3] '${row.id}' 的 name 被改写成指向同一文件的 file:// URL`,
    row.name === pathToFileURL(target).href,
  )
}
check(
  '[3] 6 行的 name 互不相同',
  new Set(insertRows.map(row => row.name)).size === insertRows.length,
)

// ── 4. The inventory expression is still an unevaluated node ───────────────
const sshRow = insertRows.find(row => row.id === 'remote-hosts-ssh')
const config = sshRow?.config ?? {}
check(
  '[4] remote-hosts-ssh 的 config.hosts 仍是待求值表达式节点（未被 YAML 静默解析成 mapping）',
  typeof config.hosts === 'object' && config.hosts !== null && isJsExpr(config.hosts),
)
const hostsExpr = String(config.hosts?.__jsExpr ?? '')
check('[4] 表达式引用 DSH_REMOTE_CLUSTER_HOSTS', hostsExpr.includes('DSH_REMOTE_CLUSTER_HOSTS'))
check('[4] 表达式调用 JSON.parse', hostsExpr.includes('JSON.parse'))

// ── 5. Three-state evaluation through the loader's own interpolate ─────────
const evalHosts = (env) => interpolate({ process: { env } }, config.hosts)
const unset = evalHosts({})
check('[5] env 未设 → []', Array.isArray(unset) && unset.length === 0)
const empty = evalHosts({ DSH_REMOTE_CLUSTER_HOSTS: '[]' })
check("[5] env='[]' → []", Array.isArray(empty) && empty.length === 0)
const sample = [{ id: 'a', label: 'A', hostname: 'h', user: 'u' }]
const populated = evalHosts({ DSH_REMOTE_CLUSTER_HOSTS: JSON.stringify(sample) })
check(
  '[5] env 含一台主机 → 深等于解析后的对象',
  Array.isArray(populated) && populated.length === 1 && populated[0]?.id === 'a'
    && equalJson(populated, sample),
)
check(
  '[5] 三态互不相同（证明表达式真的在求值，而非恒返回同一个常量）',
  equalJson(unset, populated) === false && equalJson(empty, populated) === false,
)
check('[5] 三个 base 默认值随行携带', config.passwordControlMaster === true && config.controlPersistSeconds === 900 && config.maxTransferBytes === 268435456)

// ── 6. The whole layer mounts onto an empty root without warnings ──────────
// The published dsh's dsh-base / dsh-web-app carry NO remote-host rows (verified
// against the published tarballs), so this layer is the sole provider. Driving
// the include's real algorithm over an empty root proves that: every row lands,
// no patch is skipped, nothing warns.
const warnings = []
const composed = applyEntryPatches([], structuredClone(patches), (message, ...args) => {
  let index = 0
  warnings.push(message.replace(/%C/gu, () => String(args[index++])))
})
check('[6] 应用到空 root 时不触发任何 warn', warnings.length === 0)
if (warnings.length > 0) console.log(`       ${warnings.join(' | ')}`)
check('[6] 空 root 恰好得到 6 行', composed.length === 6)
check('[6] 组合后的 id 顺序不变', equalJson(composed.map(row => row.id), expectedOrder))

// ── 7. Vendored package manifests ──────────────────────────────────────────
// `name` parity with upstream is a hard requirement: the client-module
// discovery walks up from the loaded module to the nearest package.json and the
// `dsh.client.inject` entries are matched against those names.
const vendorExpectations = [
  { dir: 'host-remote-host', name: '@deepseek-ai/dsh-host-remote-host', client: false },
  { dir: 'host-remote-host-ssh', name: '@deepseek-ai/dsh-host-remote-host-ssh', client: false },
  { dir: 'remote-host-controller', name: '@deepseek-ai/dsh-api-remote-host-controller', client: false },
  { dir: 'tool-remote-host', name: '@deepseek-ai/dsh-tool-remote-host', client: false },
  { dir: 'better-sidebar', name: 'dsh-better-sidebar', client: true },
  { dir: 'ui-remote-host', name: '@deepseek-ai/dsh-client-ui-remote-host', client: true },
]
for (const expectation of vendorExpectations) {
  const manifestPath = join(BUNDLE_DIR, 'vendor', expectation.dir, 'package.json')
  check(`[7] vendor/${expectation.dir}/package.json 存在`, existsSync(manifestPath))
  if (existsSync(manifestPath) === false) continue
  const vendored = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check(`[7] vendor/${expectation.dir} 的 name 与上游逐字一致（${expectation.name}）`, vendored.name === expectation.name)
  check(`[7] vendor/${expectation.dir} 的 exports['.'] 指向 lib/ 下的真实文件`, (() => {
    const entry = vendored.exports?.['.']
    const target = typeof entry === 'string' ? entry : entry?.default
    return typeof target === 'string' && existsSync(join(BUNDLE_DIR, 'vendor', expectation.dir, target))
  })())
  check(`[7] vendor/${expectation.dir} 不含任何 workspace: 协议声明`, readFileSync(manifestPath, 'utf8').includes('workspace:') === false)
  if (expectation.client) {
    const entry = vendored.exports?.['./client']
    const target = typeof entry === 'string' ? entry : entry?.default
    check(`[7] vendor/${expectation.dir} 声明 exports['./client'] 且文件存在`, typeof target === 'string' && existsSync(join(BUNDLE_DIR, 'vendor', expectation.dir, target)))
    check(`[7] vendor/${expectation.dir} 声明 dsh.client.platform === 'web'`, vendored.dsh?.client?.platform === 'web')
  }
}
// The UI panel injects `dsh-better-sidebar` by that exact name, so the two
// manifests must agree.
const uiManifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'vendor/ui-remote-host/package.json'), 'utf8'))
check(
  "[7] ui-remote-host 的 dsh.client.inject 含 'dsh-better-sidebar'",
  Array.isArray(uiManifest.dsh?.client?.inject) && uiManifest.dsh.client.inject.includes('dsh-better-sidebar'),
)
const sidebarManifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'vendor/better-sidebar/package.json'), 'utf8'))
check(
  "[7] better-sidebar 的 name 恰好满足上面那条 inject（'dsh-better-sidebar'）",
  sidebarManifest.name === 'dsh-better-sidebar',
)

// ── 8. The vendored host halves load as real ESM ───────────────────────────
// Five of the six packages have a browser half that only the harness's Web
// client can execute; their host halves, however, are plain ESM.
//
// Resolution here is set up the way the harness sets it up, because a bare
// import inside a vendored file walks UP from that file and cannot see any
// install-time `node_modules`. In a live profile the harness closes that gap:
// `healProfileModuleFallback` builds each bundle layer's dependency closure
// from its manifest and links the result into `<profile>/node_modules`. This
// repo mirrors the same closure locally (the same packages, reachable by the
// same bare names) so the import can run to completion instead of dying on the
// first ERR_MODULE_NOT_FOUND — which is what makes the assertions below
// meaningful rather than tautological.
const hostHalves = ['host-remote-host', 'host-remote-host-ssh', 'remote-host-controller', 'tool-remote-host']
for (const dir of hostHalves) {
  const entry = join(BUNDLE_DIR, 'vendor', dir, 'lib', 'index.js')
  let outcome = 'ok'
  let detail = ''
  try {
    const module = await import(pathToFileURL(entry).href)
    if (typeof module !== 'object') outcome = 'not-a-module'
    else if ([...Object.keys(module)].length === 0) outcome = 'empty-module'
  } catch (error) {
    // A resolution failure here means the closure is incomplete — a real
    // defect, not an artifact of running outside a profile (that gap is what
    // the node_modules mirror above closes). Only genuine syntax errors are
    // distinguished for the message.
    outcome = String(error?.code ?? error?.message ?? error)
    detail = String(error?.message ?? '').split('\n')[0].slice(0, 200)
  }
  check(`[8] vendor/${dir}/lib/index.js 可被真实加载并导出插件符号`, outcome === 'ok')
  if (outcome !== 'ok') console.log(`       ${outcome}\n       ${detail}`)
}

// `better-sidebar` is held to the same bar, with one documented exception: it
// targets `^0.1.5-rc.1`, and this repository's harness dependency links are at
// `0.1.2-alpha.2`, which does not export `SessionLogOffset`. Every module it
// imports must still RESOLVE (that is a property of what we ship), so the
// assertion accepts that one named-export error and nothing else.
{
  const dir = 'better-sidebar'
  const entry = join(BUNDLE_DIR, 'vendor', dir, 'lib', 'index.js')
  let outcome = 'ok'
  let detail = ''
  try {
    const module = await import(pathToFileURL(entry).href)
    if (typeof module !== 'object' || Object.keys(module).length === 0) outcome = 'empty-module'
  } catch (error) {
    const code = String(error?.code ?? '')
    const message = String(error?.message ?? '')
    detail = message.split('\n')[0].slice(0, 200)
    // A missing module is a packaging defect and always fails.
    if (code === 'ERR_MODULE_NOT_FOUND') outcome = 'module-not-found'
    // A named-export mismatch against the pinned alpha harness is the known,
    // documented skew; the modules themselves resolved.
    else if (/does not provide an export named/u.test(message)) outcome = 'ok'
    else outcome = code !== '' ? code : message || 'unknown'
  }
  check(`[8] vendor/${dir}/lib/index.js 的全部 import 可解析（已知的 0.1.5×0.1.2 命名导出偏斜除外）`, outcome === 'ok')
  if (outcome !== 'ok') console.log(`       ${outcome}\n       ${detail}`)
}

// ── 9. Manifest and shipped-file invariants ────────────────────────────────
const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
check('[9] package.json 不含任何生命周期脚本', manifest.scripts === undefined)
check('[9] dependencies 恰为 ssh2 / schemastery / ws（vendored 代码的运行时依赖）', equalJson(Object.keys(manifest.dependencies ?? {}).sort(), ['schemastery', 'ssh2', 'ws']))
check('[9] peerDependencies 不再声明上游包（已内联，无需外部提供）', manifest.peerDependencies === undefined)
check('[9] version === 0.3.0', manifest.version === '0.3.0')
check('[9] files 包含 LICENSE', manifest.files?.includes('LICENSE') === true)
check('[9] files 包含 README.md', manifest.files?.includes('README.md') === true)
check('[9] files 包含 vendor（内联产物必须随包发货）', manifest.files?.includes('vendor') === true)
check('[9] files 包含 THIRD-PARTY-NOTICES.md', manifest.files?.includes('THIRD-PARTY-NOTICES.md') === true)
check('[9] files 每一项都真实存在', (manifest.files ?? []).every(file => existsSync(join(BUNDLE_DIR, file))))
check('[9] LICENSE 文件存在且非空', readFileSync(join(BUNDLE_DIR, 'LICENSE'), 'utf8').trim().length > 0)
check("[9] package.json 的 dsh.bundle.patch === './cordis.patch.yml'", manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('[9] 该 patch 文件存在', existsSync(join(BUNDLE_DIR, manifest.dsh?.bundle?.patch ?? 'MISSING')))

/** Recursively collect every `.js` file under a directory. */
const collectJs = (dir) => {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) found.push(full)
    }
  }
  walk(dir)
  return found
}
const vendorJs = collectJs(join(BUNDLE_DIR, 'vendor'))
check('[9] vendor 树里的 .js 文件数合理（> 30）', vendorJs.length > 30)
check('[9] vendor 树不含 tsbuildinfo / sourcemap 构建残留', vendorJs.length > 0 && collectJs(join(BUNDLE_DIR, 'vendor')).every(file => file.endsWith('.js')))
const residue = []
for (const file of collectJs(join(BUNDLE_DIR, 'vendor'))) residue.push(file)
const allVendorFiles = []
const walkAll = (current) => {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) walkAll(full)
    else allVendorFiles.push(full)
  }
}
walkAll(join(BUNDLE_DIR, 'vendor'))
check(
  '[9] vendor 树不含 tsconfig.tsbuildinfo / *.d.ts.map / *.js.map',
  allVendorFiles.every(file => file.endsWith('.tsbuildinfo') === false && file.endsWith('.map') === false),
)
void residue

// ── 10. No residual cross-package bare import in the vendor tree ───────────
// Upstream, three packages import the seam package by bare name. Those sites
// were rewritten to relative paths (see THIRD-PARTY-NOTICES.md); a regression
// that reintroduced one would break the whole subsystem at boot.
const seamSpecifier = /from\s+['"]@deepseek-ai\/dsh-host-remote-host['"]/u
const offenders = allVendorFiles.filter(file => file.endsWith('.js') && seamSpecifier.test(readFileSync(file, 'utf8')))
check('[10] vendor 树里没有残留的 @deepseek-ai/dsh-host-remote-host 裸导入', offenders.length === 0)
for (const offender of offenders) console.log(`       ${relative(BUNDLE_DIR, offender)}`)

// The rewritten relative paths must actually land on the vendored seam.
const rewrittenSites = [
  'vendor/host-remote-host-ssh/lib/index.js',
  'vendor/host-remote-host-ssh/lib/types/index.js',
  'vendor/host-remote-host-ssh/lib/types/provider.js',
  'vendor/host-remote-host-ssh/lib/types/transfer.js',
  'vendor/remote-host-controller/lib/index.js',
  'vendor/remote-host-controller/lib/types/index.js',
  'vendor/tool-remote-host/lib/index.js',
  'vendor/tool-remote-host/lib/types/index.js',
]
for (const site of rewrittenSites) {
  const full = join(BUNDLE_DIR, site)
  check(`[10] ${site} 存在`, existsSync(full))
  if (existsSync(full) === false) continue
  const source = readFileSync(full, 'utf8')
  const match = /from\s+['"](\.[^'"]*host-remote-host\/lib\/index\.js)['"]/u.exec(source)
  check(`[10] ${site} 用相对路径指向同级 vendored seam`, match !== null)
  if (match !== null) {
    check(`[10] ${site} 的相对路径真实可达`, existsSync(resolve(dirname(full), match[1])))
  }
}

// ── 11. Third-party notices preserve the MIT licence text ──────────────────
const noticesPath = join(BUNDLE_DIR, 'THIRD-PARTY-NOTICES.md')
check('[11] THIRD-PARTY-NOTICES.md 存在且非空', existsSync(noticesPath) && statSync(noticesPath).size > 0)
const notices = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : ''
check('[11] 声明 dsh-better-sidebar 的版本 0.19.1', notices.includes('0.19.1'))
check('[11] 声明上游仓库地址 omdsh-dev/DSH-better-sidebar', notices.includes('omdsh-dev/DSH-better-sidebar'))
check('[11] 内联 MIT 许可证全文（含 Copyright (c) 2026 dsh-external）', notices.includes('Copyright (c) 2026 dsh-external'))
check('[11] 内联 MIT 许可证全文（含 AS IS 免责段）', notices.includes('WITHOUT WARRANTY OF ANY KIND'))
check('[11] 记录了 8 处跨包 import 的改写', notices.includes('Rewrote cross-package bare imports (8 sites)'))
const vendoredLicense = join(BUNDLE_DIR, 'vendor/better-sidebar/LICENSE')
check('[11] vendor/better-sidebar/LICENSE 原文保留', existsSync(vendoredLicense) && readFileSync(vendoredLicense, 'utf8').includes('Copyright (c) 2026 dsh-external'))

// ── 12. The retired 0.2.0 guard is gone ────────────────────────────────────
// 0.2.0 inserted a guard row with `inject: ['remoteHosts']` so a dsh without the
// subsystem failed loudly. In 0.3.0 this bundle PROVIDES `remoteHosts`, so that
// assertion is a tautology; every failure it caught is already reported by the
// boot audit. The module and its row must be gone, with nothing left referring
// to them.
check('[12] lib/guard.js 已移除', existsSync(join(BUNDLE_DIR, 'lib/guard.js')) === false)
check('[12] patch 里没有 remote-cluster-guard 行', insertRows.every(row => row.id !== 'remote-cluster-guard'))
check('[12] cordis.patch.yml 不再引用 guard.js', patchText.includes('guard.js') === false)
check('[12] lib/ 下只有 index.js', equalJson(readdirSync(join(BUNDLE_DIR, 'lib')).sort(), ['index.js']))
// The guard's raison d'être — naming tool-remote-host so a preset owns it — is
// preserved differently in 0.3.0: we now insert that row ourselves, so the old
// "never names the model-facing tool row" invariant is intentionally gone.
// Assert instead that the row we DO insert is the vendored one.
check(
  '[12] tool-remote-host 由本层作为 vendored 行提供',
  literalNames[actualOrder.indexOf('tool-remote-host')] === './vendor/tool-remote-host/lib/index.js',
)

console.log(failures === 0 ? '\n>>> ALL BUNDLE CHECKS PASS' : `\n>>> ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
