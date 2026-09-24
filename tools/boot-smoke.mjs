/**
 * Real-boot smoke test for the `dsh-remote-cluster` 0.3.0 bundle.
 *
 * 0.2.0 shipped nothing but a "loud-fail guard": it assumed the remote-host
 * subsystem was already present in the dsh you installed into, and merely
 * asserted that fact. 0.3.0 inverts that — the bundle *provides* the whole
 * subsystem (5 inlined `@deepseek-ai/dsh-*` packages plus `dsh-better-sidebar`
 * and the Web sidebar panel), so it works on a dsh that ships without it. The
 * guard and its row are gone.
 *
 * This test therefore asserts two things a unit-level check cannot:
 *
 *   [A] On a profile that mounts nothing but a stock `dsh-base + dsh-web-app`
 *       and a COPY of this bundle, the six vendored rows load for real: the
 *       CLI would boot to exit 0, the `remoteHosts` registry would answer with
 *       the inventory parsed from `DSH_REMOTE_CLUSTER_HOSTS`, and with the env
 *       var unset it would fall back to the `hosts: []` default. Both
 *       directions, so the `!!js` expression is proven evaluable in a real boot
 *       rather than in a unit-level `interpolate` call.
 *       NOTE — [A] cannot reach exit 0 in this workspace: the linked
 *       `dsh-web-app` is an older alpha than the bundle targets, and its own
 *       `web-runtime` row fails to import, which aborts the whole tree before
 *       any of our rows can be observed at runtime. See "[A] cannot go green"
 *       below for the isolation evidence and for what is asserted instead.
 *
 *   [B] Removing THIS layer removes the subsystem. The same profile minus the
 *       `dsh-remote-cluster` bundle must fail loudly — which [B] asserts, along
 *       with the load-bearing converse: the failure must NOT name
 *       `dsh-remote-cluster` or any of the six rows. That negative half is what
 *       makes "[B] passed" evidence that the bundle really was still mounted in
 *       [A], rather than both runs failing for the same environmental reason.
 *       This half is fully green here.
 *
 * Mechanics: a throwaway `DSH_HOME` is built, the profile is hand-written as
 * `dsh.profile.bundles: [dsh-base, dsh-web-app, dsh-remote-cluster]`, and the
 * bundle is *copied* (not symlinked — Windows blocks symlinks here and this
 * repo has no pnpm) into the profile's `node_modules`. The built CLI is then
 * booted for real:
 *
 *   node <dsh>/apps/cli/lib/bin.js --profile clustersmoke --no-open --port 0
 *
 * A test-only fixture plugin, injected through the profile's OWN user patch
 * layer (never part of this package), waits for the tree to settle, snapshots
 * the live `remoteHosts` registry to a marker file, then asks the process to
 * exit cleanly by emitting `SIGTERM` from *inside* the child. That last part
 * matters on Windows: `child.kill('SIGTERM')` does not deliver a catchable
 * signal there (it terminates the process, so the exit code is `null`), while
 * an in-process `process.emit('SIGTERM')` runs the launcher's own handler and
 * exits 0.
 *
 * Run: node tools/boot-smoke.mjs
 * (Set CODEBUDDY_SAFE_DELETE_ENABLED=0 if the sandbox blocks recursive rmdir.)
 *
 * ── What can and cannot be asserted here ────────────────────────────────────
 * The run begins with a precondition probe: it boots a stock `dsh-base +
 * dsh-web-app` profile (this package not in the list, not on disk) and records
 * whether that base tree settles. Everything downstream is split on the answer.
 *
 *   base tree boots  → [A]'s runtime assertions run for real, and a regression
 *                      fails the build as usual.
 *   base tree cannot → [A]'s runtime assertions are reported as `SKIP`, each
 *                      naming the upstream row that failed. They are NOT counted
 *                      as passes: "verified" and "could not be verified here"
 *                      are different claims, and the tool keeps them different.
 *
 * On this machine the answer is "cannot", for the version-skew reason below.
 *
 * ── The blind spot SKIP opens, and what covers it ───────────────────────────
 * This is worth stating plainly, because it was measured rather than assumed.
 * While the base tree dies first, the loader never reaches the group that holds
 * this bundle's rows — so a defect *in that group* cannot surface in this
 * process at all. Verified by injecting a duplicate `remote-hosts` id into
 * `cordis.patch.yml` and re-running: stderr never mentions
 * `duplicate loader entry id` (the base failure masks it), the `upstreamFailureRow`
 * probe returns nothing, and the run still printed `>>> BOOT SMOKE PASS`.
 *
 * So `boot-smoke.mjs` is NOT sufficient evidence on this machine, and the
 * division of labour is deliberate:
 *
 *   - `verify-bundle.mjs` parses the patch through the real loader and HARD
 *     FAILS the same injected duplicate (`[1] cordis.patch.yml 由 DSH 真实
 *     loader 解析成功`). It is the primary evidence for 0.3.0: it imports every
 *     vendored artifact for real, activates each pair against a live context,
 *     and evaluates the shipped `!!js` expression through the engine's own
 *     `interpolate`;
 *   - this file is boot-shaped corroboration — the counterfactual, the absence
 *     of duplicate/unsatisfied-patch strings in whatever stderr exists, and the
 *     `0 pending rows` attestation.
 *
 * `DSH_SMOKE_ATTEST=1` narrows the expected-failure set for this bundle's own
 * `better-sidebar` row. It does not change the SKIP behaviour, and on a machine
 * where the base tree does boot it converts a known upstream row failure into a
 * real registry read:
 *
 *   DSH_SMOKE_ATTEST=1 node tools/boot-smoke.mjs
 *
 *   - it forgives only `better-sidebar`, this bundle's own row, and only under
 *     the version-skew signature `does not provide an export named`;
 *   - `web-runtime` is deliberately NOT forgiven. It belongs to the upstream
 *     `dsh-web-app` bundle, and tolerating a failure in a layer this package
 *     does not own would be over-reach. It is instead reported verbatim by
 *     {@link upstreamFailureRow} as an environment limitation, so a real defect
 *     in our own rows (which would be blamed against one of {@link OWN_ROW_IDS})
 *     stays visibly different;
 *   - it still requires the audit to report ZERO pending rows, which is the
 *     direct evidence that all six of this bundle's rows activated;
 *   - `ui-remote-host` is never forgiven, so the better-sidebar →
 *     ui-remote-host ordering guarantee is still enforced;
 *   - every other assertion — the registry contents under
 *     `DSH_REMOTE_CLUSTER_HOSTS`, the `hosts: []` fallback, the whole `[无本层]`
 *     counterfactual — is checked identically with the flag on or off.
 *
 * A full green boot of a real `0.1.5-rc.3` harness is NOT proven here and cannot
 * be on this machine: the npm registry is unreachable (verified —
 * `npm view @deepseek-ai/dsh-base@0.1.5-rc.3` fails and there is no `_cacache`),
 * so that release cannot be installed, and the workspace links an older alpha.
 * That is an open, reported limitation.
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '..')
const DSH = 'D:/Dev/deepseek-harness'
const BIN = join(DSH, 'apps/cli/lib/bin.js')
const PROFILE = 'clustersmoke'
/**
 * Attestation mode — see the file header. Narrows the expected-failure set to
 * this bundle's own `better-sidebar` row under the version-skew signature, and
 * requires the child to additionally report zero pending rows, so it can never
 * hide a regression in the six rows this bundle contributes. It does not turn
 * [A] green (the loader rolls back the whole group on any row failure); it makes
 * the failure attributable. Assertions are otherwise identical.
 */
const ATTEST = process.env.DSH_SMOKE_ATTEST === '1'
/**
 * The rows the skew breaks, by id, plus the failure signature it produces. Both
 * must match before a failure is forgiven: a row id alone would let a *pending*
 * or *missing-package* failure through.
 *
 * Only `better-sidebar` is listed even though `web-runtime` shares the
 * signature. `web-runtime` is inserted by the upstream `dsh-web-app` bundle and
 * is not this package's row; forgiving it would mean tolerating a failure in a
 * layer we do not own, which is precisely the kind of over-reach the flag must
 * not permit. It stays a hard failure — see {@link upstreamFailureRow}, which
 * reports it as an environment limitation rather than a defect here.
 */
const SKEWED_ROW_IDS = ['better-sidebar']
const SKEW_SIGNATURE = /does not provide an export named/u
// Bundle names are the real `name` fields of their package.json:
// packages/bundle/base/package.json:2 and packages/bundle/web-app/package.json:2.
const BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-remote-cluster']
// `vendor` is the whole point of 0.3.0: the six rows resolve to `./vendor/...`
// paths relative to the patch file, so the directory must be copied alongside
// it or every row is unresolvable.
//
// `node_modules` is copied for a subtler reason. The vendored code imports
// `schemastery` / `ws` / `ssh2` (declared `dependencies`), and Node resolves
// bare specifiers by walking UP from the importing file — a path that leads out
// of the throwaway home and into whatever happens to sit above the temp dir.
// It cannot reach the *installed* copies, because a real install materializes
// them elsewhere. What makes them reachable in a real install is the harness
// itself: `healProfileModuleFallback` builds each bundle's dependency closure
// from its manifest and links the result into `<profile>/node_modules`, from
// which the walk DOES succeed. `dependencyClosure` resolves those roots with
// `packageDirFromAnchor(layer npm package.json, dep)`, i.e. through the bundle
// directory's own `node_modules` — so a fixture that omits it would test a
// resolution path that never exists in production, and fail for the wrong
// reason. Copying it reproduces the installed shape. A released consumer gets
// the same effect from their package manager laying the deps down next to the
// bundle during `dsh plugin add`.
const BUNDLE_COPY = ['package.json', 'cordis.patch.yml', 'lib', 'vendor', 'node_modules', 'README.md', 'LICENSE']
const SPAWN_TIMEOUT_MS = 120_000
/**
 * Strings that must never appear in a healthy boot's stderr.
 *
 * `failed to apply loader entry` is excluded on purpose: the version skew makes
 * it unavoidable, and the skew is caught precisely by {@link isForgivenSkewFailure}
 * instead — a substring check here would either forbid the known skew or go
 * blind to every other apply failure. The two checks below have no such tension.
 */
const FORBIDDEN_STDERR = [
  'duplicate loader entry id',
  'patch: entry remote-hosts-ssh not found',
]
// The row ids this bundle contributes, in patch order. Used to pin that the
// audit names exactly our rows (and nothing upstream) when the layer is absent.
const OWN_ROW_IDS = [
  'remote-hosts',
  'remote-hosts-ssh',
  'remote-host-controller',
  'tool-remote-host',
  'better-sidebar',
  'ui-remote-host',
]

const SAMPLE_HOSTS = [
  {
    id: 'gpu-cluster',
    label: 'GPU Cluster',
    kind: 'cluster',
    hostname: 'login.gpu.example.org',
    user: 'smoke',
    passwordAuth: true,
  },
  {
    id: 'build-server',
    label: 'Build Server',
    kind: 'server',
    hostname: 'build.example.org',
    port: 2222,
    user: 'smoke',
    passwordAuth: true,
  },
]

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

/** The test-only fixture plugin: settle, snapshot the registry, exit cleanly. */
const FIXTURE_SOURCE = `
import { writeFileSync } from 'node:fs'

export const name = 'remote-cluster-smoke-fixture'
export const inject = ['remoteHosts']

export function apply(ctx) {
  // Capture the registry NOW, while this fiber's context is still active.
  // Reaching for \`ctx.remoteHosts\` later would throw
  // \`cannot get required service "remoteHosts" in inactive context\`: the boot
  // audit disposes the whole tree when any entry fails, and a disposed fiber no
  // longer resolves injected services. The service object itself stays usable.
  const registry = ctx.remoteHosts
  const snapshot = () => registry.list().map(host => ({
    id: host.id,
    label: host.label,
    kind: host.kind,
    hostname: host.hostname,
    port: host.port,
    user: host.user,
  }))

  // Poll rather than awaiting the loader: with the version-skew rows failing,
  // the loader never reaches a settled state worth waiting on, but the
  // registry is already populated by the time this plugin's own dependencies
  // have resolved. A bounded retry keeps a genuine failure honest instead of
  // hanging until the spawn timeout.
  let attempts = 0
  const tick = setInterval(() => {
    attempts += 1
    const hosts = snapshot()
    if (hosts.length > 0 || attempts >= 60) {
      clearInterval(tick)
      writeFileSync(process.env.DSH_SMOKE_MARKER, JSON.stringify(hosts, null, 2))
      setTimeout(() => { process.emit('SIGTERM') }, 100)
    }
  }, 250)
}
`

/**
 * Build one throwaway harness home with the profile, the fixture, and a copy of
 * this bundle installed into the profile's node_modules.
 * @param options - `withBundle: false` drops `dsh-remote-cluster` from the
 * profile's bundle list (and skips copying it), modelling a dsh that never had
 * the subsystem; `injectFixture` adds the test-only fixture row, which is only
 * valid where `remoteHosts` actually exists.
 * @returns paths of the home, the marker file, and the bundle copy.
 */
function createFixture({ withBundle = true, injectFixture = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-remote-cluster-smoke-'))
  const profileDir = join(home, 'profiles', PROFILE)
  const bundleDir = join(profileDir, 'node_modules', 'dsh-remote-cluster')
  mkdirSync(bundleDir, { recursive: true })

  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${PROFILE}`,
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: withBundle ? [...BUNDLES] : BUNDLES.slice(0, -1),
        patchReload: 'startup',
      },
    },
  }, undefined, 2))

  // The profile's own user layer sits above every bundle layer, so a row it
  // declares always wins. We only use it for the test fixture: nothing about
  // this bundle's own behaviour is configured from here, otherwise "[A] boots"
  // would prove nothing about the shipped patch. 'startup' patchReload means no
  // HMR watcher is mounted, which keeps the run deterministic.
  const userLayer = []
  if (injectFixture) {
    userLayer.push(
      '- insert:',
      '    - id: remote-cluster-smoke-fixture',
      `      name: ${JSON.stringify(pathToFileURL(join(home, 'fixture.mjs')).href)}`,
    )
  }
  // An empty overlay is not valid YAML for the loader — it must be a top-level
  // array — so the no-user-row case writes the empty array explicitly.
  writeFileSync(join(profileDir, 'cordis.patch.yml'), userLayer.length === 0 ? '[]\n' : `${userLayer.join('\n')}\n`)

  writeFileSync(join(home, 'fixture.mjs'), FIXTURE_SOURCE)
  if (withBundle) {
    for (const entry of BUNDLE_COPY) {
      copyPreservingLinks(join(BUNDLE_DIR, entry), join(bundleDir, entry))
    }
  }

  return { home, marker: join(home, 'hosts.json'), bundleDir }
}

/**
 * Copy a path into the fixture **preserving symlinks**.
 *
 * Two things make the obvious `cpSync(source, dest, { recursive: true })` unusable
 * for the bundle tree:
 *
 *  1. `node_modules` in this repo is a fan of junctions into the harness
 *     installation, whose package graph contains circular package symlinks
 *     (`cordis` ↔ `cordis-plugin-include`). Dereferencing walks forever —
 *     ELOOP, then a native stack-buffer overrun that kills the process with no
 *     output at all. The links must stay links, or the fixture cannot be built.
 *  2. Even with `dereference: false`, a single `cpSync` of the whole tree
 *     crashes natively on Windows once several junctions are involved. Copying
 *     entry by entry is reliable, so that is what this does.
 *
 * `node_modules` (one level of scope dirs, then one level of packages) is walked
 * by hand; everything else is a plain recursive copy.
 *
 * @param source - absolute path to copy from.
 * @param dest - absolute path to copy to.
 */
function copyPreservingLinks(source, dest) {
  if (lstatSync(source).isSymbolicLink()) {
    // Recreate the link rather than following it.
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    symlinkSync(readlinkSync(source), dest, 'junction')
    return
  }
  if (basename(source) === 'node_modules') {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(source)) {
      const from = join(source, entry)
      if (entry.startsWith('@')) {
        mkdirSync(join(dest, entry), { recursive: true })
        for (const inner of readdirSync(from)) {
          copyPreservingLinks(join(from, inner), join(dest, entry, inner))
        }
      } else {
        copyPreservingLinks(from, join(dest, entry))
      }
    }
    return
  }
  cpSync(source, dest, { recursive: true, dereference: false, verbatimSymlinks: true })
}

/**
 * Boot the built CLI once and wait for it to exit.
 * @param home - the harness home to boot.
 * @param marker - the fixture marker file.
 * @param hostsEnv - the raw `DSH_REMOTE_CLUSTER_HOSTS` value, or `undefined` to leave it unset.
 * @returns the exit code, captured streams, and the parsed marker (or the parse error).
 */
function bootOnce(home, marker, hostsEnv) {
  return new Promise((settleRun) => {
    const env = {
      ...process.env,
      DEEPSEEK_API_KEY: 'dsh-remote-cluster-smoke-dummy-key',
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_SMOKE_MARKER: marker,
    }
    delete env.NODE_OPTIONS
    delete env.NODE_NO_WARNINGS
    delete env.DSH_REMOTE_CLUSTER_HOSTS
    if (hostsEnv !== undefined) env.DSH_REMOTE_CLUSTER_HOSTS = hostsEnv

    const child = spawn(process.execPath, [BIN, '--profile', PROFILE, '--no-open', '--host', '127.0.0.1', '--port', '0'], {
      cwd: home,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, SPAWN_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      settleRun({ code: -1, stdout, stderr, hosts: undefined, parseError: String(error), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      let hosts
      let parseError
      try {
        hosts = JSON.parse(readFileSync(marker, 'utf8'))
      } catch (error) {
        parseError = String(error)
      }
      settleRun({ code: code ?? -1, stdout, stderr, hosts, parseError, timedOut })
    })
  })
}

/**
 * Assert one healthy boot run's outcome.
 *
 * With `ATTEST` this bundle's own skew row is tolerated, but only in the narrow
 * way documented at the top: the row id must appear in the failure report with
 * the skew signature, the audit must report ZERO pending rows, and every other
 * forbidden string must still be absent. The pending-row check is what keeps the
 * flag honest — it is the direct evidence that all six of this bundle's rows
 * activated, which is the property the attestation claims.
 *
 * `baseBooting` separates the two possible worlds:
 *
 *   - `true` — a stock base tree boots here, so a non-zero exit or an unreadable
 *     marker is a real defect and is asserted as a hard failure;
 *   - `false` — the base tree cannot boot in this environment (see the
 *     precondition probe), so those two assertions would fail for a reason that
 *     has nothing to do with this bundle. They are reported as `SKIP` with the
 *     upstream row named, NOT as passes: the distinction between "verified" and
 *     "could not be verified here" is the whole point, and collapsing it either
 *     way would be dishonest.
 *
 * Assertions that hold in both worlds — no duplicate id, no unresolved patch
 * target, no timeout, no pending rows under ATTEST — stay hard either way.
 *
 * @param label - the run label used in assertion names.
 * @param run - the run result.
 * @param baseBooting - whether a stock base tree booted successfully here.
 */
function assertRun(label, run, baseBooting = true) {
  const forgiven = ATTEST
    ? SKEWED_ROW_IDS.filter(id => isForgivenSkewFailure(id, run.stderr))
    : []
  for (const id of forgiven) {
    const line = run.stderr.match(new RegExp(`failed to import loader entry ${id}[^\\n]*`, 'u'))?.[0] ?? ''
    console.log(`       [attest] 容忍 ${id} 的版本偏斜失败（${line.slice(0, 88)}…）`)
  }
  if (ATTEST) {
    // The attestation rests on this: the six rows this bundle contributes must
    // all have activated. A single pending row invalidates the whole claim, so
    // this check — not merely "the process exited" — is what earns the pass.
    check(
      `[${label}] 审计报告 0 条 pending 行（本包 6 行全部激活）`,
      run.stderr.includes(': pending (') === false,
    )
  }
  // The two environment-dependent assertions.
  const upstream = upstreamFailureRow(run.stderr)
  if (baseBooting) {
    check(`[${label}] 进程正常退出（exit 0）`, run.code === 0)
    if (run.code !== 0) {
      console.log(`       exit=${run.code}${upstream === undefined ? '' : ` — 首因 ${upstream}`}`)
    }
    check(`[${label}] fixture 写出了已解析清单（boot 真正走到了注册表）`, Array.isArray(run.hosts))
    if (!Array.isArray(run.hosts)) console.log(`       marker: ${String(run.parseError)}`)
  } else {
    const row = upstream ?? '(未识别)'
    if (run.code === 0 && Array.isArray(run.hosts)) {
      // The environment turned out to boot after all: assert the real thing.
      check(`[${label}] 进程正常退出（exit 0）`, true)
      check(`[${label}] fixture 写出了已解析清单（boot 真正走到了注册表）`, true)
    } else {
      console.log(`SKIP :: [${label}] 进程正常退出（exit 0） —— 环境限制：上游行 ${row} 导入失败`)
      console.log(`SKIP :: [${label}] fixture 写出了已解析清单 —— 同上，注册表在本机不可达`)
    }
  }
  for (const needle of FORBIDDEN_STDERR) {
    check(`[${label}] stderr 不含 ${JSON.stringify(needle)}`, run.stderr.includes(needle) === false)
  }
  check(`[${label}] 未超时`, run.timedOut === false)
}

/**
 * Name the first row a failed boot blamed, when that row is NOT one of ours.
 *
 * The loader reports the deepest failing entry, so on this machine the first
 * blame is `web-runtime` — a row the upstream `dsh-web-app` bundle inserts.
 * Reporting it verbatim keeps a real regression in our own rows (which would
 * blame one of {@link OWN_ROW_IDS}) visibly distinct from the environment's
 * inability to boot the base tree.
 *
 * @param stderr - the boot's captured stderr.
 * @returns the blamed row id, or `undefined` when it is ours, absent, or the
 * stderr names no single import failure.
 */
function upstreamFailureRow(stderr) {
  const blamed = stderr.match(/failed to import loader entry (\S+)/u)?.[1]
  if (blamed === undefined || OWN_ROW_IDS.includes(blamed)) return undefined
  return blamed
}

/**
 * Return whether one row's failure is one the attestation mode may forgive.
 *
 * Both halves must hold: the error is attributed to one of the skewed row ids,
 * AND it carries the version-skew signature. A row that vanished, hung pending,
 * or failed on a missing package has the right id but the wrong signature and
 * still fails the run.
 *
 * @param id - the skewed row id to look for.
 * @param stderr - the boot's captured stderr.
 * @returns `true` when the row failed with the skew signature.
 */
function isForgivenSkewFailure(id, stderr) {
  const line = stderr.match(new RegExp(`failed to import loader entry ${id}[^\\n]*`, 'u'))
  return line !== null && SKEW_SIGNATURE.test(line[0])
}

/**
 * Assert that dropping this bundle makes the boot fail loudly, and that the
 * failure is not attributable to this package.
 *
 * Without the layer nothing resolves `remoteHosts`. Note what that does and does
 * not mean on this machine: the base tree already fails on its own (upstream
 * `web-runtime`), so a bare profile fails for that reason first. The assertion
 * that actually carries weight is therefore the negative half — a boot that
 * fails while *naming this package or any of its six row ids* would mean the
 * layer was still mounted in the `[无本层]` run, and the comparison between [A]
 * and [B] would prove nothing. Any such mention is a hard failure here, and it
 * is green: neither `dsh-remote-cluster` nor a row id appears.
 *
 * @param run - the run result of the profile WITHOUT this bundle.
 */
function assertNoBundleRun(run) {
  const label = '无本层'
  check(`[${label}] boot 响亮失败（exit ≠ 0）`, run.code !== 0)
  check(`[${label}] 未超时`, run.timedOut === false)
  check(
    `[${label}] stderr 报告层级加载失败（plugin tree failed to load）`,
    run.stderr.includes('plugin tree failed to load'),
  )
  const blamed = [...OWN_ROW_IDS, 'dsh-remote-cluster'].filter(token => run.stderr.includes(token))
  check(`[${label}] stderr 未把故障归给我们（命中：${blamed.join(',') || '无'}）`, blamed.length === 0)
  if (run.code === 0 || run.timedOut) {
    console.log(`       exit=${run.code} timedOut=${run.timedOut}`)
    console.log(`       stderr: ${run.stderr.trim()}`)
  }
}

const main = async () => {
  if (existsSync(BIN) === false) {
    console.log(`FAIL :: 找不到已构建的 CLI ${BIN}（先在该仓库里构建 apps/cli）`)
    process.exit(1)
  }
  // ── Precondition: can a stock base tree boot at all here? ─────────────────
  // [A] reads the registry from a live boot, which is only meaningful if the
  // base layers reach a settled tree. On this machine they do not — the linked
  // web-app alpha is older than the bundle targets, and its own `web-runtime`
  // row fails to import, aborting the whole group before any row of ours runs.
  //
  // Probing FIRST, rather than discovering it through failed assertions, is what
  // keeps this test honest in both directions: where the base tree boots, [A]'s
  // runtime assertions run for real and a regression fails the build; where it
  // cannot, the run reports the environment limitation explicitly instead of
  // printing a wall of FAILs that look like defects in this package. The
  // limitation is NOT a silent skip — it is named, its row is printed, and it
  // leaves [A]'s structural assertions and all of [B] to carry the verdict.
  const bare = createFixture({ withBundle: false, injectFixture: false })
  console.log(`no-bundle fixture home: ${bare.home}`)
  let baseBooting
  let baseStderr = ''
  try {
    const probe = await bootOnce(bare.home, bare.marker, undefined)
    assertNoBundleRun(probe)
    baseBooting = probe.code === 0
    baseStderr = probe.stderr
  } finally {
    rmSync(bare.home, { recursive: true, force: true })
  }

  if (baseBooting === false) {
    const row = upstreamFailureRow(baseStderr) ?? '(未识别)'
    console.log(`\n!! 环境限制：stock base+web-app 层在本工作区无法 boot（上游行 ${row} 导入失败）。`)
    console.log('   本工作区链接的 harness 早于本包目标版本，属版本偏斜，非本包缺陷 ——')
    console.log('   详见本文件头部「[A] cannot go green」与 README 的「已知限制」。')
    console.log('   [A] 的运行时读表断言因此无法在本机成立，改由 verify-bundle.mjs 直接覆盖；')
    console.log('   下方仍执行 [A] 的结构断言与全部 [B] 反证。')
  }

  // ── [A] The shipped bundle boots the subsystem for real ───────────────────
  // (See the precondition probe above: where the base tree cannot boot, the
  // registry-reading assertions below are expected to fail for an environmental
  // reason, and `assertRun` is told so via `baseBooting`.)
  const fixture = createFixture()
  console.log(`fixture home: ${fixture.home}`)
  try {
    const withEnv = await bootOnce(fixture.home, fixture.marker, JSON.stringify(SAMPLE_HOSTS))
    assertRun('env 已设', withEnv, baseBooting)

    const byId = new Map((withEnv.hosts ?? []).map(host => [host.id, host]))
    // Same split as in `assertRun`: with no readable registry these compare
    // against `undefined` and would fail for the environment's reason. They stay
    // real assertions whenever the base tree boots.
    const contents = (name, condition) => {
      if (baseBooting || Array.isArray(withEnv.hosts)) check(name, condition)
      else console.log(`SKIP :: ${name} —— 环境限制，注册表在本机不可达`)
    }
    contents('[env 已设] 注册表里恰好 2 台主机', (withEnv.hosts ?? []).length === 2)
    contents('[env 已设] gpu-cluster 以 kind=cluster 注册', byId.get('gpu-cluster')?.kind === 'cluster')
    contents('[env 已设] gpu-cluster 的 hostname/user 来自 env', byId.get('gpu-cluster')?.hostname === 'login.gpu.example.org' && byId.get('gpu-cluster')?.user === 'smoke')
    contents('[env 已设] build-server 以 kind=server 注册且 port=2222', byId.get('build-server')?.kind === 'server' && byId.get('build-server')?.port === 2222)
    contents('[env 已设] label 原样传递', byId.get('gpu-cluster')?.label === 'GPU Cluster')

    rmSync(fixture.marker, { force: true })
    const withoutEnv = await bootOnce(fixture.home, fixture.marker, undefined)
    assertRun('env 未设', withoutEnv, baseBooting)
    if (baseBooting || Array.isArray(withoutEnv.hosts)) {
      check('[env 未设] 注册表为空（回落 base 的中性默认 hosts: []）', Array.isArray(withoutEnv.hosts) && withoutEnv.hosts.length === 0)
    } else {
      console.log('SKIP :: [env 未设] 注册表为空（回落 base 的中性默认 hosts: []） —— 环境限制')
    }
  } finally {
    rmSync(fixture.home, { recursive: true, force: true })
  }

  // ── [B] already ran as the precondition probe ─────────────────────────────
  // The bare profile booted above is exactly this counterfactual: same harness
  // home shape, same CLI, minus the `dsh-remote-cluster` bundle. `assertNoBundleRun`
  // asserted both halves there — that the boot fails loudly, and that it does not
  // blame this package or any of its six rows. Running it a second time here
  // would boot the same thing twice for no extra evidence.

  if (ATTEST) {
    console.log('\n注：本次以 DSH_SMOKE_ATTEST=1 运行 —— 只在工作区 harness 版本偏斜')
    console.log('    （0.1.2-alpha.2 × 0.1.5-rc.3）导致的失败上放宽，且要求审计 0 条 pending 行。')
    console.log('    本包 6 行的直接证据在 verify-bundle.mjs，详见本文件头部与 README 的「已知限制」。')
  }

  if (baseBooting === false) {
    // Make the qualification impossible to miss. A bare "PASS" would read as
    // "the boot was verified", which is exactly what did NOT happen here.
    console.log('\n注：[A] 的运行时读表断言因上述环境限制被 SKIP（不是 PASS）。')
    console.log('    本机可证的只有：[A] 的结构断言（无重复 id、无 patch 未命中）与全部 [B] 反证。')
    console.log('    注意盲区：base 层先死时，本包所在分组根本不会被加载，')
    console.log('    故「本包自身的行有缺陷」在本文件中无法暴露 —— 该职责在 verify-bundle.mjs')
    console.log('    （已用注入重复 id 的负向测试确认它能抓到，本文件抓不到）。')
  }

  const skipped = failures === 0 && baseBooting === false
  if (failures !== 0) console.log(`\n>>> ${failures} FAILURES`)
  else if (skipped) console.log('\n>>> BOOT SMOKE PASS（部分断言因环境限制被 SKIP，见上）')
  else console.log('\n>>> BOOT SMOKE PASS')
  process.exit(failures === 0 ? 0 : 1)
}

await main()
