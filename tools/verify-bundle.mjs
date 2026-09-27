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
 * Since 0.4.0 this bundle is a *functional plugin*, not a config overlay: its
 * patch `insert`s the whole remote-host subsystem (five upstream packages) from
 * the vended copies under `vendor/`, and integrates with the OFFICIAL right
 * sidebar (`@deepseek-ai/dsh-client-ui-sidebar-right`, shipped by dsh-web-app
 * since `0.1.7-rc.2`) rather than vendoring a sidebar of its own. The assertions
 * below therefore cover:
 *
 *   [1]-[5]  patch shape, insert-only, row order, the inventory expression
 *   [6]      every row's `name` resolves to an on-disk vendored module
 *   [7]      vendor package manifests (name parity, exports, dsh.client)
 *   [8]      the vendored trees load as real ESM
 *   [9]      manifest / shipped-file invariants
 *   [10]     no residual cross-package bare import in the vendor tree
 *   [11]     third-party notices keep the MIT licence text
 *   [12]     the retired 0.2.0 guard is gone and nothing references it
 *   [13]     every bare import in `vendor/` has an owner: a relative path, a
 *            declared dependency, or a package the published dsh provides
 *   [15]     the insert is unconditional (no guard can yield) and the
 *            boundary that follows from it is documented
 *
 * Run: node tools/verify-bundle.mjs
 */

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
/**
 * Records one assertion. `detail` is printed only on failure: when an invariant
 * breaks, the value that broke it is what makes the failure actionable, and
 * keeping it off the passing lines preserves the one-line-per-assertion read.
 */
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`PASS :: ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL :: ${name}${detail === '' ? '' : `\n         ${detail}`}`)
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
check('[1] insert 恰有 5 行（5 个 remote-host 包；UI 侧改由官方侧栏承载）', insertRows.length === 5)

// ── 2. Row ids and order ───────────────────────────────────────────────────
// Order follows the runtime dependency direction: the registry/seam provider
// first, then the SSH provider, then the RPC projection, then the tool face,
// then the UI. `ui-remote-host` is last because its client half consumes the
// `remote.remoteHosts` namespace the controller projects, and the client module
// graph requires an injected row to arrive first.
const expectedOrder = [
  'remote-hosts',
  'remote-hosts-ssh',
  'remote-host-controller',
  'tool-remote-host',
  'ui-remote-host',
]
const actualOrder = insertRows.map(row => row.id)
check('[2] 5 行的 id 与顺序完全符合预期', equalJson(actualOrder, expectedOrder))
if (equalJson(actualOrder, expectedOrder) === false) {
  console.log(`       expected: ${JSON.stringify(expectedOrder)}`)
  console.log(`       actual:   ${JSON.stringify(actualOrder)}`)
}
check(
  '[2] remote-hosts（seam 提供者）排在所有消费者之前',
  actualOrder.indexOf('remote-hosts') === 0,
)
check(
  '[2] ui-remote-host 排在 remote-host-controller 之后（它消费后者投影的 RPC 面）',
  actualOrder.indexOf('remote-host-controller') < actualOrder.indexOf('ui-remote-host'),
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
check('[3] patch 文本里恰好读出 5 个 name 字面量', literalNames.length === insertRows.length)
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
  '[3] 5 行的 name 互不相同',
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
//
// Note this is the "nothing else mounted them" case only. The complementary
// case — another layer already owns an id — is family [15]: it is UNSUPPORTED
// (the duplicate check precedes any `disabled`, so the insert cannot yield),
// and the boundary is pinned there rather than papered over.
const warnings = []
const composed = applyEntryPatches([], structuredClone(patches), (message, ...args) => {
  let index = 0
  warnings.push(message.replace(/%C/gu, () => String(args[index++])))
})
check('[6] 应用到空 root 时不触发任何 warn', warnings.length === 0)
if (warnings.length > 0) console.log(`       ${warnings.join(' | ')}`)
check('[6] 空 root 恰好得到 5 行', composed.length === 5)
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
// The UI panel was migrated off `dsh-better-sidebar` onto the official right
// sidebar. Both halves of that migration are asserted here, because a half-done
// migration is exactly the failure mode: the manifest could stop naming the
// retired service while the client bundle still calls it, and the panel would
// then simply never mount.
const uiManifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'vendor/ui-remote-host/package.json'), 'utf8'))
check(
  "[7] ui-remote-host 的 dsh.client.inject 已不再引用 dsh-better-sidebar",
  Array.isArray(uiManifest.dsh?.client?.inject) && uiManifest.dsh.client.inject.includes('dsh-better-sidebar') === false,
  `实际: ${JSON.stringify(uiManifest.dsh?.client?.inject)}`,
)
check(
  "[7] ui-remote-host 的 dsh.client.inject 声明了官方右侧栏 @deepseek-ai/dsh-client-ui-sidebar-right",
  Array.isArray(uiManifest.dsh?.client?.inject) && uiManifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'),
  `实际: ${JSON.stringify(uiManifest.dsh?.client?.inject)}`,
)
check(
  '[7] vendor/better-sidebar 目录已从仓库移除（不再自带侧栏实现）',
  existsSync(join(BUNDLE_DIR, 'vendor/better-sidebar')) === false,
)

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1')

// ── 8. The vendored host halves load as real ESM ───────────────────────────
// Four of the five packages have a browser half that only the harness's Web
// client can execute; their host halves, however, are plain ESM. The fifth,
// `ui-remote-host`, is client-only, so it is checked differently below.
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

// `ui-remote-host`'s host half is a presence stub and its browser half is a
// `__ModuleLoader__` bundle, so neither can be imported by Node here. What CAN
// be asserted without a browser is that the browser half is still a well-formed
// bundle and that it no longer touches the retired `betterSidebar` service in
// any form — the exact regression this release exists to prevent.
{
  const clientPath = join(BUNDLE_DIR, 'vendor', 'ui-remote-host', 'lib', 'client.js')
  const source = stripComments(readFileSync(clientPath, 'utf8'))
  check(
    '[8] ui-remote-host 的浏览器产物仍是 __ModuleLoader__ 包',
    source.includes('window.__ModuleLoader__.load('),
  )
  check(
    '[8] ui-remote-host 的浏览器产物不再引用 betterSidebar 服务',
    /betterSidebar|better-sidebar/u.test(source) === false,
  )
  check(
    '[8] ui-remote-host 的浏览器产物注册官方 sidebarRightTabs 服务',
    source.includes('ctx.sidebarRightTabs.register('),
  )
  check(
    '[8] ui-remote-host 的浏览器产物注册到官方 keyed seat sidebar.right.pane.tab',
    source.includes('"sidebar.right.pane.tab"'),
  )
  check(
    '[8] ui-remote-host 的浏览器产物声明须注入的官方服务',
    ['"sidebarRightTabs"', '"sidebarRight"', '"slots"'].every((s) => source.includes(s)),
  )
}

// ── 9. Manifest and shipped-file invariants ────────────────────────────────
const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
check('[9] package.json 不含任何生命周期脚本', manifest.scripts === undefined)
// The vendored runtime's dependency set is not a free choice: it is exactly the
// bare specifiers the vendored modules import. Enumerating it here (rather than
// deriving it) means a dropped declaration is a hard failure, and family [13]
// independently cross-checks the same set from the import sites.
check('[9] dependencies 恰为 vendored 代码运行时依赖的全集',
  equalJson(Object.keys(manifest.dependencies ?? {}).sort(), [
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-native-command',
    '@deepseek-ai/dsh-output-retention',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-util-values',
    '@deepseek-ai/schemastery',
    'ssh2',
    'ws',
    'zod',
  ]),
  `实际: ${JSON.stringify(Object.keys(manifest.dependencies ?? {}).sort())}`,
)
// `@deepseek-ai/cordis` is a PEER, matching how `dsh-base` and `dsh-web-app`
// declare it: it is the framework the profile supplies, never a dependency of
// a bundle. It must be pinned exactly, as both bundles do.
check(
  '[9] peerDependencies 恰为 @deepseek-ai/cordis@4.0.2（框架由 profile 提供）',
  equalJson(manifest.peerDependencies ?? {}, { '@deepseek-ai/cordis': '4.0.2' }),
  `实际: ${JSON.stringify(manifest.peerDependencies ?? {})}`,
)
check('[9] version === 0.4.0', manifest.version === '0.4.0')
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
check('[11] 内联 MIT 许可证全文（含 AS IS 免责段）', notices.includes('WITHOUT WARRANTY OF ANY KIND'))
check('[11] 记录了 8 处跨包 import 的改写', notices.includes('Rewrote cross-package bare imports (8 sites)'))
// The retired `dsh-better-sidebar` must no longer be presented as vendored. The
// notices legitimately *mention* it when explaining why it was retired, so the
// assertion targets the licence section and the directory table — the two
// places that would otherwise tell a consumer this bundle still ships code it
// does not contain — rather than the bare string.
check(
  '[11] 不再把 dsh-better-sidebar 列为内联第三方（0.4.0 已退役）',
  /\| *`vendor\/better-sidebar\/`/u.test(notices) === false
    && /Copyright \(c\) 2026 dsh-external/u.test(notices) === false,
  'notices 仍把 dsh-better-sidebar 当作在包的第三方列出',
)
check(
  '[11] notices 明确记录了 dsh-better-sidebar 于 0.4.0 退役',
  notices.includes('BETTER-SIDEBAR-ROOTCAUSE.md'),
)

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

// ── 13. Every bare import in the vendor tree is accounted for ──────────────
// This family exists because 0.3.0 shipped a real install-breaking defect that
// nothing here caught: `vendor/host-remote-host-ssh` imports the SCOPED fork
// `@deepseek-ai/schemastery`, but `package.json` declared only the native
// `schemastery@^3.18.2` — a version that does not exist (native versions stop
// at 3.18.0). `dsh plugin add` therefore failed with
// `ERR_PNPM_NO_MATCHING_VERSION`. The green run was an artifact of this file
// executing inside the harness source tree, where `pnpm-workspace.yaml` has
// `overrides: {'@deepseek-ai/schemastery': 'link:vendor/schemastery'}` and the
// bare name resolves to something regardless of what we declare.
//
// The rule that must hold INSTEAD is independent of any resolver: each bare
// specifier a vendored runtime module imports must be either (a) imported by
// relative path (not bare at all), (b) satisfied by a package the published dsh
// itself provides, or (c) declared in this bundle's own manifest. Anything else
// can only work on a machine that happens to have the package lying around.
//
// Two deliberate exclusions, each verified by reading the import site:
//   * `react` / `react/jsx-runtime` — client-side bundles (`dsh.client`) are
//     served through the platform's own module shim, not Node resolution;
//   * a bare-looking token inside a comment is not an import (the original
//     scanner counted `from "extension"` in a JSDoc block of the vendored
//     mermaid copy, which is prose, not code).
const VENDOR_ROOT = join(BUNDLE_DIR, 'vendor')
const bundleManifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
const declaredDeps = new Set([
  ...Object.keys(bundleManifest.dependencies ?? {}),
  ...Object.keys(bundleManifest.peerDependencies ?? {}),
])
/**
 * Packages the published `dsh` (the install target) brings itself. Derived from
 * the installed `@deepseek-ai/dsh-base` / `dsh-web-app` manifests rather than a
 * hand-kept list, so a dependency this bundle may rely on upstream is not
 * misread as missing.
 */
const publishedProvides = new Set()
for (const pkg of ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']) {
  const pkgJson = join(DSH, 'packages/bundle', pkg.replace('@deepseek-ai/dsh-', ''), 'package.json')
  if (!existsSync(pkgJson)) continue
  const parsed = JSON.parse(readFileSync(pkgJson, 'utf8'))
  for (const dep of Object.keys(parsed.dependencies ?? {})) publishedProvides.add(dep)
}
/** Specifiers resolved by the host platform rather than by Node. */
const PLATFORM_PROVIDED = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'])

// Reachability matters here, and getting it wrong in either direction is a
// real error. Scanning every `.js` under `vendor/` over-reports: the vendored
// trees carry `.d.ts` companions AND `.js` files that no row can reach, so a
// scan-everything rule demands dependencies for code that never executes (it
// wants `@deepseek-ai/dsh-brand` on behalf of `host-remote-host/lib/types/
// index.js`, which is imported by nothing — `lib/index.js` only imports
// `@deepseek-ai/cordis`, and no other file references that path). But scanning
// only each row's entry file under-reports: the defect this family exists for
// lives two hops down.
//
// So the walk starts at the five real entry points and follows relative imports
// transitively, exactly as Node would. What it reaches is what must resolve.

/**
 * Module specifiers a file actually imports, statement form only. A bare
 * `from "x"` match is not enough: the vendored client bundles contain prose and
 * string literals that read like import syntax — a doc block saying
 * `exportName from "module"`, and the keyword-table entry `"import export
 * from"` — neither of which is an import. Requiring the leading keyword
 * excludes both without needing a full parser.
 */
const importsOf = (src) => [
  ...src.matchAll(/\bimport\s+[\w${}*,\s]*\s*from\s*['"]([^'"]+)['"]/gu),
  ...src.matchAll(/\bexport\s+[\w${}*,\s]*\s*from\s*['"]([^'"]+)['"]/gu),
  ...src.matchAll(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/gmu),
].map((m) => m[1])

const bareImports = new Map()
const reached = new Set()
const visit = (file) => {
  const normalized = resolve(file)
  if (reached.has(normalized) || existsSync(normalized) === false) return
  reached.add(normalized)
  const src = stripComments(readFileSync(normalized, 'utf8'))
  for (const spec of importsOf(src)) {
    if (spec.startsWith('node:') || spec.startsWith('file:')) continue
    if (spec.startsWith('.')) { visit(resolve(dirname(normalized), spec)); continue }
    const owner = relative(BUNDLE_DIR, normalized).replace(/\\/gu, '/')
    if (!bareImports.has(spec)) bareImports.set(spec, new Set())
    bareImports.get(spec).add(owner)
  }
}
// Entry points are the rows this layer actually mounts: `./vendor/<pkg>/lib/index.js`.
for (const name of literalNames) visit(resolve(BUNDLE_DIR, name))

// ...plus every target reachable through each vendored manifest's `exports` map.
// The patch row is not the only way in. The typert framework loads a package's
// generated RPC surface through the `./typert` subpath — `remote-host-controller`
// publishes `{'./typert': './lib/typert.host.js', './remote': './lib/typert.remote-client.js'}`
// — and those files import `zod`. Nothing statically imports them, so a walk
// seeded only from the rows would miss a dependency that genuinely loads at
// runtime on any host that uses the remote-host RPC surface.
for (const dir of readdirSync(VENDOR_ROOT) ) {
  const manifestPath = join(VENDOR_ROOT, dir, 'package.json')
  if (existsSync(manifestPath) === false) continue
  const exported = JSON.parse(readFileSync(manifestPath, 'utf8')).exports ?? {}
  for (const target of Object.values(exported)) {
    const rel = typeof target === 'string' ? target : target?.default
    if (typeof rel !== 'string' || rel.startsWith('.') === false) continue
    visit(resolve(VENDOR_ROOT, dir, rel))
  }
}

const packageOf = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
const unresolved = []
for (const [spec] of bareImports) {
  const pkgName = packageOf(spec)
  if (PLATFORM_PROVIDED.has(pkgName)) continue
  if (declaredDeps.has(pkgName)) continue
  if (publishedProvides.has(pkgName)) continue
  unresolved.push([spec, [...bareImports.get(spec)].sort()])
}
check(
  '[13] 运行期可达的每个裸导入都有归属（本包声明 / 已发布 dsh 自带）',
  unresolved.length === 0,
  unresolved.length === 0
    ? ''
    : `未归属: ${unresolved.map(([s, o]) => `${s} (${o.join(' ')})`).join('; ')}`,
)
// Guard the walk itself: if the entry points ever stop being reachable the
// assertion above would pass vacuously over an empty set.
check('[13] 可达性遍历确实覆盖了 5 个 vendored 包的产物', reached.size >= 5)

// The scoped fork and the native package are DIFFERENT packages with different
// version lines. 0.3.0 shipped the defect this family exists for: the vendored
// ssh provider imports the SCOPED fork while the manifest declared the NATIVE
// name, and the native name has no 3.18.2 to satisfy `^3.18.2`.
//
// In 0.4.0 only the scoped fork is imported at all: the native package was
// pulled in by the retired `dsh-better-sidebar`, so it is declared nowhere and
// must not reappear. The assertion is therefore the pair below — the fork is
// declared, and the native name is not — and its version must stay satisfiable
// by what is actually published.
check('[13] 声明了 scoped fork @deepseek-ai/schemastery', declaredDeps.has('@deepseek-ai/schemastery'))
check(
  '[13] 不再声明 native schemastery（其唯一使用者 dsh-better-sidebar 已退役）',
  declaredDeps.has('schemastery') === false,
  `实际声明: ${JSON.stringify(Object.keys(bundleManifest.dependencies ?? {}))}`,
)
// The fork is pinned exactly because `@deepseek-ai/dsh-settings` peers on that
// exact version; a caret resolves past it and produces an unmet-peer warning.
const forkPin = bundleManifest.dependencies?.['@deepseek-ai/schemastery'] ?? ''
check(
  '[13] scoped fork 精确钉在 3.18.2（满足 dsh-settings 的精确 peer）',
  forkPin === '3.18.2',
  `实际: ${forkPin}`,
)
// The notices document this dependency set for a human reader. If the manifest
// and the document disagree, the document is what a consumer will believe, so
// each declared package must actually be named in the dependencies table.
for (const dep of declaredDeps) {
  check(`[13] THIRD-PARTY-NOTICES.md 记录了依赖 ${dep}`, notices.includes(`\`${dep}\``))
}

/**
 * [14] Named imports must exist in the published package they name.
 *
 * Family [13] proves every bare specifier has an owner, but owning a package is
 * not the same as that package exporting the symbol. The vendored artifacts are
 * copied from a source commit, and a source commit can be AHEAD of every release
 * — it can import a symbol that was added after the last version was cut and
 * therefore does not exist on any machine that installs this bundle from npm.
 *
 * This is not hypothetical: `vendor/host-remote-host-ssh/lib/index.js` imported
 * `openNativeTerminal` from `@deepseek-ai/dsh-native-command`, a symbol added by
 * `c36edb349f` and never released. `0.1.5-rc.3` exports only `canOpenNativePath`,
 * `nativeFileManager`, `openNativePath`, `openNativeTextFile`, `revealNativePath`
 * and `runNativeCommand`. The import is a static ESM binding, so it does not
 * fail until the row loads — at which point the whole plugin tree refuses to
 * boot:
 *
 *   failed to import loader entry remote-hosts-ssh: The requested module
 *   '@deepseek-ai/dsh-native-command' does not provide an export named
 *   'openNativeTerminal'
 *
 * `node --check` cannot see this (it is a link-time error, not a parse error)
 * and family [13] cannot see it (the package is declared and present). So the
 * exports are read from the real installed packages and compared by name.
 *
 * WHICH installation matters, and this is the subtle part. Two trees are on
 * this machine and they disagree:
 *
 *   * `node_modules/@deepseek-ai/*` — symlinks into the SOURCE WORKSPACE, which
 *     reports `0.1.2-alpha.2`. A source commit is not a release.
 *   * `<published profile>/node_modules/@deepseek-ai/*` — real `0.1.5-rc.3`
 *     packages, exactly what a consumer installs.
 *
 * Checking the first would be checking the wrong thing: `dsh-session` at
 * `0.1.2-alpha.2` does not export `SessionLogOffset` while `0.1.5-rc.3` does, so
 * a source-tree verdict would report a defect that no consumer can hit. The
 * published tree is therefore preferred, and a package available only as a
 * source link is SKIPPED rather than judged — a verdict about a version nobody
 * installs is worse than no verdict.
 *
 * The published tree is located without hard-coding one machine's layout:
 * `DSH_VERIFY_PUBLISHED` names it explicitly, otherwise a profile produced by
 * `tools/boot-smoke.mjs` is looked for under the usual scratch roots.
 */
const NAMED_IMPORT_RE = /\b(?:import|export)\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gu
const namedImports = new Map()
const namedReached = new Set()
const visitNamed = (file) => {
  const normalized = resolve(file)
  if (namedReached.has(normalized) || existsSync(normalized) === false) return
  namedReached.add(normalized)
  const src = stripComments(readFileSync(normalized, 'utf8'))
  // Relative edges first, so the whole reachable graph is covered, not just rows.
  for (const spec of importsOf(src)) {
    if (spec.startsWith('.')) visitNamed(resolve(dirname(normalized), spec))
  }
  for (const m of src.matchAll(NAMED_IMPORT_RE)) {
    const spec = m[2].trim()
    // Only package specifiers name a package to check. A relative specifier is
    // resolved by `visitNamed` above, and `..` (which appears verbatim in the
    // vendored `../../host-remote-host/lib/index.js`) is not a package name.
    if (spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith('file:')) continue
    const pkgName = packageOf(spec)
    if (PLATFORM_PROVIDED.has(pkgName)) continue
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/u)[0].trim()
      if (name === '' || name.startsWith('type ')) continue
      if (!namedImports.has(pkgName)) namedImports.set(pkgName, new Map())
      if (!namedImports.get(pkgName).has(name)) namedImports.get(pkgName).set(name, new Set())
      namedImports.get(pkgName).get(name).add(relative(BUNDLE_DIR, normalized).replace(/\\/gu, '/'))
    }
  }
}
for (const name of literalNames) visitNamed(resolve(BUNDLE_DIR, name))
for (const dir of readdirSync(VENDOR_ROOT)) {
  const manifestPath = join(VENDOR_ROOT, dir, 'package.json')
  if (existsSync(manifestPath) === false) continue
  const exported = JSON.parse(readFileSync(manifestPath, 'utf8')).exports ?? {}
  for (const target of Object.values(exported)) {
    const rel = typeof target === 'string' ? target : target?.default
    if (typeof rel !== 'string' || rel.startsWith('.') === false) continue
    visitNamed(resolve(VENDOR_ROOT, dir, rel))
  }
}

/** Candidate `node_modules` roots holding a real published install, best first. */
const publishedRoots = []
if (process.env.DSH_VERIFY_PUBLISHED) publishedRoots.push(process.env.DSH_VERIFY_PUBLISHED)
for (const scratch of ['D:/Dev/_pubhome', 'D:/Dev/_pubsh']) {
  for (const profile of ['web', 'node', 'clustersmoke']) {
    const candidate = join(scratch, 'profiles', profile, 'node_modules')
    if (existsSync(candidate)) publishedRoots.push(candidate)
  }
}
publishedRoots.push(join(BUNDLE_DIR, 'node_modules'))
/**
 * Locate the package the way the loader would, preferring the published tree.
 *
 * Returns `{ dir, provenance }`, or `undefined` when the package is nowhere.
 */
const locate = (pkgName) => {
  for (const root of publishedRoots) {
    const dir = join(root, pkgName)
    if (existsSync(join(dir, 'package.json'))) {
      const isLink = statSync(dir).isSymbolicLink?.() ?? lstatSyncSafe(dir)
      // A link into the source workspace is still a source tree, whichever root
      // it was reached through — record that so the caller can weigh it.
      return { dir, published: isLink === false }
    }
  }
  return undefined
}
/** `statSync` follows links, so the source check needs the link itself. */
function lstatSyncSafe(p) {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}
/** Resolve a package's root entry the way Node would for an ESM import.
 *
 * Condition order matters and is easy to get wrong: `ws` publishes
 * `{"browser": "./browser.js", "import": "./wrapper.mjs", "require": "./index.js"}`.
 * Taking the first key yields `browser.js`, whose namespace has no `WebSocket`,
 * which would report a symbol as missing that is in fact exported. An `import`
 * resolution picks `wrapper.mjs`, which does export it.
 */
const rootEntryOf = (manifest) => {
  const root = manifest.exports?.['.']
  if (typeof root === 'string') return root
  if (root !== undefined && typeof root === 'object') {
    for (const condition of ['import', 'node', 'default']) {
      const target = root[condition]
      if (typeof target === 'string') return target
    }
    for (const value of Object.values(root)) {
      if (typeof value === 'string') return value
    }
  }
  return manifest.module ?? manifest.main ?? 'index.js'
}

/**
 * Names a module's source declares as exported bindings.
 *
 * `Object.keys(namespace)` is not always the whole answer. A bundler emits
 * `var RemoteHostError = class extends Error {...}` and then lists the binding
 * in one trailing `export { RemoteHostError, RemoteHostId, ... }` statement;
 * reading that statement is the reliable answer, and it is also exactly what a
 * static ESM binding resolves against. The namespace is still consulted, since
 * a CJS root (again `ws`) exposes its names there and not in any `export {}`.
 */
const declaredExportsOf = (src) => {
  const names = new Set()
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/gu)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/u).pop().trim()
      if (name !== '') names.add(name)
    }
  }
  for (const m of src.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gu)) {
    names.add(m[1])
  }
  names.add('default')
  return names
}

const missingSymbols = []
const uncheckedPackages = []
const sourceOnlyPackages = []
const checkedVersions = new Map()
for (const [pkgName, wanted] of [...namedImports].sort()) {
  const found = locate(pkgName)
  if (found === undefined) { uncheckedPackages.push(pkgName); continue }
  // A source-workspace link is not a release. Judging the vendored code against
  // it would invent defects (and hide real ones) for a version no consumer gets.
  if (found.published === false) { sourceOnlyPackages.push(pkgName); continue }
  const manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8'))
  checkedVersions.set(pkgName, manifest.version ?? '?')
  const entryFile = join(found.dir, rootEntryOf(manifest))
  if (existsSync(entryFile) === false) { uncheckedPackages.push(pkgName); continue }
  const declared = declaredExportsOf(readFileSync(entryFile, 'utf8'))
  let namespace = new Set()
  try {
    namespace = new Set(Object.keys(await import(pathToFileURL(entryFile).href)))
  } catch {
    // A root that cannot be imported here is not evidence that a symbol is
    // missing; the declaration scan above still decides.
  }
  for (const [name, owners] of wanted) {
    if (namespace.has(name) || declared.has(name)) continue
    missingSymbols.push([pkgName, name, [...owners], manifest.version ?? '?'])
  }
}

check('[14] 可达性遍历确实读到了具名导入（防止空集假绿）', namedImports.size > 0, `已扫: ${namedImports.size} 个包`)
check(
  '[14] 已确认存在真实已发布安装（否则本族无从判定）',
  checkedVersions.size > 0,
  '未找到任何已发布包；请先跑 tools/boot-smoke.mjs 生成 profile，或用 DSH_VERIFY_PUBLISHED 指定',
)
check(
  '[14] 每个具名导入在已发布的包里真实存在',
  missingSymbols.length === 0,
  missingSymbols.length === 0
    ? ''
    : `缺失: ${missingSymbols.map(([p, n, o, v]) => `${p}@${v} → ${n} (${o.join(' ')})`).join('; ')}`,
)
// A hole in the evidence is not a pass. Say so out loud so nobody reads the
// line above as "all named imports verified" when it is not.
if (uncheckedPackages.length > 0) {
  console.log(`SKIP :: [14] 以下包未安装，其具名导入未被核对: ${uncheckedPackages.join(', ')}`)
}
if (sourceOnlyPackages.length > 0) {
  console.log(
    `SKIP :: [14] 以下包只找到源码工作区链接（非发布版），未按其判定: ${sourceOnlyPackages.join(', ')}`,
  )
}
// The specific symbol that broke the published boot must stay gone.
const nativeCommand = join(BUNDLE_DIR, 'vendor', 'host-remote-host-ssh', 'lib', 'index.js')
if (existsSync(nativeCommand)) {
  const src = stripComments(readFileSync(nativeCommand, 'utf8'))
  check(
    '[14] ssh provider 不再 import 从未发布的 openNativeTerminal',
    src.includes('openNativeTerminal') === false,
    '仍在使用该符号；已发布 dsh-native-command 不导出它，boot 会失败',
  )
}

// ── 15. The insert is unconditional, and the boundary is documented ────────
// This family exists because the desktop client reported two of our rows as
// 「异常」 while three others ran, and the first attempt at a fix was WRONG in a
// way that passed every static check — so the mechanism is pinned here in the
// direction that actually holds.
//
// The facts, all measured rather than inferred:
//
//   * the include's insert branch is a bare `data.push(...insert)` with NO
//     dedup (vendor/include/src/index.ts:93-95), and it appends into the SAME
//     top-level array the host bundle wrote, so a host-declared id lands twice
//     in one list;
//   * `EntryGroup.update` throws on the duplicate BEFORE any `disabled` is read
//     (vendor/loader/src/config/group.ts:59-66, rolling back at :70-78);
//   * `loader.store` is only written by `create()` (group.ts:22-23), which runs
//     AFTER that scan — so at the moment of the throw `store` is provably empty.
//     Instrumenting the loader at the throw printed `storeKeys=[]` while the
//     same `config` list held `remote-hosts` twice.
//
// Therefore a `disabled: !!js '... loader.store["<id>"] ...'` guard can never
// fire: it reads an empty map and always evaluates to "not disabled". A first
// version of this bundle shipped exactly that guard; `boot-smoke.mjs` then
// failed on `duplicate loader entry id: remote-hosts` in a real boot while
// every static assertion about the guards passed. The guards were removed.
//
// There is no condition-insert escape hatch: `PatchOptions`
// (include/src/index.ts:145-160) has no delete/rename key, and a nested `group`
// does not isolate ids because `Group` passes the parent tree
// (vendor/loader/src/config/group.ts:119) — one shared namespace.
//
// So the assertions below pin the *design decision* instead of a mechanism:
// no row carries a guard (keeping one would imply protection that does not
// exist), and the structural facts that force this are re-checked against the
// harness sources so a future change that WOULD make a guard viable is noticed.
const guardedRows = insertRows.filter(row => isJsExpr(row.disabled))
check(
  '[15] 没有任何行携带 disabled 守卫（实测其求值时机晚于重复检查，无法让位）',
  guardedRows.length === 0,
  `不应存在守卫，实际: ${guardedRows.map(row => row.id).join(', ') || '无'}`,
)

// The one thing a guard could still do is kill the row on every host — assert
// no row is disabled at all, literal or expression, in either form.
const disabledRows = insertRows.filter(row => row.disabled !== undefined)
check(
  '[15] 没有任何行被 disabled（无论字面量还是 !!js，都不该出现）',
  disabledRows.length === 0,
  `意外 disabled: ${disabledRows.map(row => row.id).join(', ') || '无'}`,
)

// `loader.store` is written by `create()`, not at parse time. The structural
// claim is about CALL ordering, not line ordering: `update` performs the
// duplicate scan in its first loop and only then calls `create` for each row
// (in the `Promise.allSettled(config.map(... => this.create(options)))` line).
// So at the moment the throw happens, no row of the composed list has been
// created yet and `store` holds only entries from the PREVIOUS update cycle —
// which is why the instrumented boot printed an empty `storeKeys=[]`.
//
// Asserting "the store write appears after the throw" would be wrong: `create`
// is defined above `update`. The meaningful halves are (a) the throw is in
// `update`'s first loop, and (b) `create` — the sole writer — is invoked later
// in the same method.
const groupSource = existsSync(join(DSH, 'vendor/loader/src/config/group.ts'))
  ? readFileSync(join(DSH, 'vendor/loader/src/config/group.ts'), 'utf8')
  : ''
if (groupSource !== '') {
  const updateBody = groupSource.slice(groupSource.indexOf('async update('))
  const throwIndex = updateBody.indexOf('duplicate loader entry id')
  const createCallIndex = updateBody.indexOf('this.create(options)')
  check(
    '[15] group 的重复 id 检查仍先于任何 disabled 处理（故 disabled:true 救不了重复 id）',
    throwIndex !== -1 && updateBody.includes('_disabled(') === false,
  )
  check(
    '[15] 写入 loader.store 的 create() 仍在重复检查之后才被调用（守卫读到空表，必然恒为「不禁用」）',
    throwIndex !== -1 && createCallIndex !== -1 && throwIndex < createCallIndex,
  )
  // `create` must still be the only place the map is populated; if a future
  // loader pre-populated it from the composed list, a guard would become viable.
  const beforeUpdate = groupSource.slice(0, groupSource.indexOf('async update('))
  check(
    '[15] loader.store 仍只由 create() 写入（没有「解析即入表」的提前填充）',
    /this\.tree\.store\[id\] = /u.test(beforeUpdate) && beforeUpdate.includes('for (const options of config)') === false,
  )
}

// The insert branch must still be an unconditional push with no dedup, and
// still append to the same array. Both halves are what make the collision
// unavoidable rather than merely likely.
const includeSource = existsSync(join(DSH, 'vendor/include/src/index.ts'))
  ? readFileSync(join(DSH, 'vendor/include/src/index.ts'), 'utf8')
  : ''
if (includeSource !== '') {
  check(
    '[15] insert 分支仍是无条件 data.push(...insert)（没有去重，故无法「不存在才插入」）',
    /data\.push\(\.\.\.insert\)/u.test(includeSource),
  )
  const patchOptions = includeSource.slice(includeSource.indexOf('export interface PatchOptions'))
  const body = patchOptions.slice(0, patchOptions.indexOf('}'))
  check(
    '[15] PatchOptions 仍无 delete/rename 之类的删除键（故无法先移除冲突行）',
    /\b(delete|remove|rename)\s*\??:/u.test(body) === false,
  )
}

// A nested group shares the tree, so wrapping the rows cannot dodge a collision.
const groupPluginSource = groupSource !== '' ? groupSource.slice(groupSource.indexOf('export class Group')) : ''
if (groupPluginSource !== '') {
  check(
    '[15] Group 仍传父树的 tree（嵌套 group 不能隔离 id，故包一层也躲不掉冲突）',
    /parent\.tree/u.test(groupPluginSource),
  )
}

console.log(failures === 0 ? '\n>>> ALL BUNDLE CHECKS PASS' : `\n>>> ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
