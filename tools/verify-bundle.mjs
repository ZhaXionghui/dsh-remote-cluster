/**
 * One-off verification for the dsh-remote-cluster bundle.
 *
 * Parses cordis.patch.yml through the harness's own patch loader, then runs the
 * loader's own `interpolate` against a platform-pinned `process` so both the
 * win32 and POSIX branches of the command/args expressions are pinned on any
 * host (the same technique `apps/cli/tests/windows-shell.spec.ts:121` uses).
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
const require = createRequire(join(DSH, 'apps/cli/package.json'))

let failures = 0
const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} :: ${name}`)
  if (!condition) failures += 1
}

const { loadOverlayPatches } = require('@deepseek-ai/dsh-app-boot')
const { evaluate, interpolate, isJsExpr } = require('@deepseek-ai/cordis-plugin-loader')

const patchFile = join(BUNDLE_DIR, 'cordis.patch.yml')

// ── Parse through the real loader ──────────────────────────────────────────
let patches = null
let loadError = null
try {
  patches = loadOverlayPatches('dsh', patchFile)
} catch (error) {
  loadError = error
}
check('cordis.patch.yml 由 DSH 真实 loader 解析成功', loadError === null)
if (loadError !== null) console.log(`       ${String(loadError.message ?? loadError)}`)
if (patches === null) process.exit(1)

// ── Structure ──────────────────────────────────────────────────────────────
check('解析结果是数组', Array.isArray(patches))
check('只有一条 patch', patches.length === 1)
const patch = patches[0]
check('patch 只有 insert 键', Object.keys(patch).join(',') === 'insert')
check('insert 是数组且只有一行', Array.isArray(patch.insert) && patch.insert.length === 1)

const entry = patch.insert[0]
check('单条 entry（平台自适应由 config 表达式承担）', entry.id === 'hsagent-mcp')
check("name = '@deepseek-ai/dsh-mcp-client'", entry.name === '@deepseek-ai/dsh-mcp-client')
check('entry 没有 disabled（不需要行级互斥）', entry.disabled === undefined)

const config = entry.config ?? {}
check('config.serverName = hsagent', config.serverName === 'hsagent')
check('config.transport = stdio', config.transport === 'stdio')

// The expressions must still be unevaluated nodes here — the loader resolves
// them later. A plain string or a mangled mapping instead of an expression node
// is the failure mode this guards against.
check(
  'config.command 仍是待求值表达式节点',
  typeof config.command === 'object' && config.command !== null && isJsExpr(config.command),
)
check(
  'config.args 仍是待求值表达式节点',
  typeof config.args === 'object' && config.args !== null && isJsExpr(config.args),
)
check('config.cwd 仍是待求值表达式节点', typeof config.cwd === 'object' && isJsExpr(config.cwd))
check('config.cwd 表达式 = process.cwd()', config.cwd?.__jsExpr === 'process.cwd()')

// Guard against the silent-corruption failure mode: an unquoted ternary parses
// without error but yields a *mapping* keyed by the expression object.
check(
  'command/args 未被 YAML 误解析成映射（无声损坏防护）',
  !Array.isArray(config.command) && config.command?.__jsExpr !== undefined
    && !Array.isArray(config.args) && config.args?.__jsExpr !== undefined,
)

// ── Resolve both platform branches through the loader's interpolate ────────
const resolveOn = (platform) => {
  const scoped = { process: { platform } }
  return {
    command: interpolate(scoped, config.command),
    args: interpolate(scoped, config.args),
  }
}

const win32 = resolveOn('win32')
const linux = resolveOn('linux')

check('win32: command = wsl', win32.command === 'wsl')
check('win32: args = [hsagent-bridge, serve]', JSON.stringify(win32.args) === JSON.stringify(['hsagent-bridge', 'serve']))
check('linux: command = hsagent-bridge', linux.command === 'hsagent-bridge')
check('linux: args = [serve]', JSON.stringify(linux.args) === JSON.stringify(['serve']))
check('darwin 与 linux 同分支', JSON.stringify(resolveOn('darwin')) === JSON.stringify(linux))

check('两个平台分支的 command 互不相同', win32.command !== linux.command)
check('两个平台分支的 args 互不相同', JSON.stringify(win32.args) !== JSON.stringify(linux.args))
check('所有分支的 argv 末位都是 serve', win32.args.at(-1) === 'serve' && linux.args.at(-1) === 'serve')

// cwd resolves to a non-empty string on both branches.
const cwdValue = interpolate({}, config.cwd)
check('cwd 求值为非空字符串', typeof cwdValue === 'string' && cwdValue.length > 0)

// The real host platform must land on one of the two known branches.
const hostName = process.platform === 'win32' ? 'win32' : 'posix'
const known = process.platform === 'win32' ? win32 : linux
check(
  `宿主平台 ${process.platform} 落在已知分支（${hostName}）`,
  known.command === win32.command || known.command === linux.command,
)

// Keep benign expression-only cases distinct from real platform gating.
check(
  'command 表达式引用 process.platform',
  String(config.command.__jsExpr).includes('process.platform'),
)
check(
  'args 表达式引用 process.platform',
  String(config.args.__jsExpr).includes('process.platform'),
)

// ── Cross-check field sets against the shipped memorix reference ───────────
const reference = loadOverlayPatches(
  'dsh',
  join(DSH, 'apps/cli/config/examples/mcp-memory/memorix.cordis.yml'),
)
const referenceEntry = reference[0].insert[0]
check(
  '与官方 memorix 范例的 entry 字段集合一致',
  Object.keys(entry).sort().join(',') === Object.keys(referenceEntry).sort().join(','),
)
check(
  '与官方 memorix 范例的 config 字段集合一致',
  Object.keys(config).sort().join(',') === Object.keys(referenceEntry.config).sort().join(','),
)

// Shipped bundles already use the same platform-gating idiom; pin it once more
// so a future loader change cannot silently break our expressions.
const basePatch = readFileSync(join(DSH, 'packages/bundle/base/cordis.patch.yml'), 'utf8')
check(
  '仓库内已有 `disabled: !!js process.platform` 生产先例',
  basePatch.includes("disabled: !!js process.platform === 'win32'"),
)
check(
  '该先例表达式按平台求值为 true/false',
  evaluate({ process: { platform: 'win32' } }, "process.platform === 'win32'") === true
    && evaluate({ process: { platform: 'linux' } }, "process.platform === 'win32'") === false,
)

// ── No build-triggering fields in the manifest ─────────────────────────────
const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
const buildKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
check('package.json 不含任何依赖字段', buildKeys.every(key => manifest[key] === undefined))
check('package.json 不含任何生命周期脚本', (manifest.scripts ?? undefined) === undefined)

// Every published file must exist, and LICENSE must ship alongside README:
// both are linked from README.md, and an npm package without its license file
// ships a broken link and a non-compliant tarball.
check('files 包含 LICENSE', manifest.files?.includes('LICENSE') === true)
check('files 包含 README.md', manifest.files?.includes('README.md') === true)
check(
  'files 每一项都真实存在',
  (manifest.files ?? []).every(file => existsSync(join(BUNDLE_DIR, file))),
)
check('LICENSE 文件存在且非空', readFileSync(join(BUNDLE_DIR, 'LICENSE'), 'utf8').trim().length > 0)
// README links to ./LICENSE; keep the link and the shipped file in sync.
check(
  'README 中的 LICENSE 链接指向已发货的文件',
  readFileSync(join(BUNDLE_DIR, 'README.md'), 'utf8').includes('](LICENSE)')
    && manifest.files?.includes('LICENSE') === true,
)

console.log(failures === 0 ? '\n>>> ALL BUNDLE CHECKS PASS' : `\n>>> ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
