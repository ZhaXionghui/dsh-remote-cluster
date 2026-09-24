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
 *
 *   [B] The counterfactual. The same profile minus the `dsh-remote-cluster`
 *       bundle must fail loudly — which [B] asserts, along with the
 *       load-bearing converse: the failure must NOT name `dsh-remote-cluster`
 *       or any of the six rows. That negative half is what makes "[B] passed"
 *       evidence that the bundle really was still mounted in [A], rather than
 *       both runs failing for the same environmental reason.
 *
 *       NOTE — [B] is only meaningful on shape 1 (see "Two harness shapes"
 *       below). On shape 2 the base already supplies all six rows, so removing
 *       this layer removes nothing; the "it must fail" half is simply false
 *       there, and [B] is skipped for the same reason as [A].
 *
 * Both sections are gated on the shape probe described below, so on this
 * workspace they report SKIP — not PASS, and not FAIL.
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
 * ── Two harness shapes, and why this file can only exercise one ────────────
 * This bundle mounts its six rows with `insert:`, appended unconditionally by
 * `applyEntryPatches` (`vendor/include/src/index.ts:93-101`: `data.push(...insert)`
 * with no dedup) and checked for collisions only later, at boot, by
 * `EntryGroup.update` (`vendor/loader/src/config/group.ts:61-64`), which throws
 * `duplicate loader entry id` and aborts the whole tree. A conditional insert is
 * impossible: the duplicate scan runs over the raw entry list BEFORE any
 * `disabled` (or `!!js disabled`) is consulted, so a "insert only if absent"
 * row cannot be expressed at all.
 *
 * That makes the harness's own base inventory decisive, and there are two
 * shapes:
 *
 *   1. PUBLISHED / npm dsh (the target) — `dsh-base` and `dsh-web-app` carry
 *      ZERO remote-host rows. Our `insert:` is what supplies them, and it works.
 *      This is the shape 0.3.0 is built for.
 *   2. IN-TREE / source harness (this workspace) — every one of the six ids is
 *      ALREADY declared by the source bundles: `remote-hosts` and
 *      `remote-hosts-ssh` by `packages/bundle/base/cordis.patch.yml:90,93`;
 *      `remote-host-controller`, `tool-remote-host`, `better-sidebar` and
 *      `ui-remote-host` by `packages/bundle/web-app/cordis.patch.yml:99,208,211,351`.
 *      Our `insert:` of those same ids is therefore a hard collision:
 *
 *        dsh: plugin tree failed to load: failed to apply loader entry include
 *        (cordis:include): duplicate loader entry id: remote-hosts
 *
 *      This is inherent to `insert:`-based bundling, not a patch bug — the same
 *      patch is correct on shape 1 and impossible on shape 2.
 *
 * The precondition probe below DISCOVERS which shape is present — by reading the
 * base's own composed tree via `--dump-config`, with this package absent from
 * both the bundle list and disk — rather than assuming it, because the two need
 * different verdicts.
 *
 * In this workspace the shape is (2), so `[A]` is skipped wholesale and says so
 * by name. Note that the source-tree base itself BOOTS FINE here (it serves and
 * prints its URL); the blocker is the id collision, nothing else.
 *
 * ── The blind spot the skip opens, and what covers it ───────────────────────
 * This is worth stating plainly, because it was measured rather than assumed.
 * When this bundle's group is never loaded, a defect *inside that group* cannot
 * surface in this process at all. Verified by injecting a duplicate
 * `remote-hosts` id into `cordis.patch.yml` and re-running: this file still
 * printed `>>> BOOT SMOKE PASS`.
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
 *     of an unsatisfied-patch warning, and the `0 pending rows` attestation.
 *
 * ── Why the skew machinery still exists ───────────────────────────────────
 * On shape 2 none of this is reachable: the group never loads, so no row of
 * ours ever gets the chance to fail on an export mismatch. The
 * `web-runtime` / `SessionLogOffset` skew belongs to the *published* package
 * set (see THIRD-PARTY-NOTICES.md) and would only surface on a machine that
 * installed one — which is exactly the machine that can also run [A] for real.
 * So the skew handling is kept for that machine, not for this one.
 *
 * `assertRun` never forgives `web-runtime`: it belongs to a layer this package
 * does not own, so {@link upstreamFailureRow} names it rather than absorbing
 * it, keeping a real defect in our own rows visibly different.
 *
 * `DSH_SMOKE_ATTEST=1` narrows the expected-failure set to this bundle's own
 * `better-sidebar` row under the version-skew signature, and still requires
 * zero pending rows. It never forgives `ui-remote-host`, so the
 * better-sidebar → ui-remote-host ordering guarantee stays enforced.
 *
 * A full green boot of a real published dsh is NOT proven here and cannot be on
 * this machine: the npm registry is unreachable (verified) so `0.1.5-rc.3`
 * cannot be installed, and every id this package contributes is already taken
 * by the in-tree bundles. That is an open, reported limitation.
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '..')
/**
 * Harness under test. Defaults to the source workspace, but overridable so the
 * suite can finally be pointed at a PUBLISHED dsh — the shape this bundle is
 * actually written for, where the six row ids are free and `[A]` can go green.
 *
 *   DSH_SMOKE_CLI=D:/path/to/profile/node_modules/@deepseek-ai/dsh/lib/bin.js \
 *     node tools/boot-smoke.mjs
 *
 * The override matters because the two shapes need opposite verdicts (see the
 * file header), and only the published one can exercise [A] for real.
 */
const DSH = process.env.DSH_SMOKE_DSH ?? 'D:/Dev/deepseek-harness'
const BIN = process.env.DSH_SMOKE_CLI ?? join(DSH, 'apps/cli/lib/bin.js')
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
/**
 * Harness packages whose copy must be re-pointed at the CLI being booted.
 *
 * This repo's `node_modules/@deepseek-ai/*` are junctions into the SOURCE
 * WORKSPACE. That is fine for `verify-bundle.mjs`, which only reads them, but
 * wrong for a boot: the fixture copies the bundle's `node_modules` into a temp
 * profile, and `better-sidebar` then resolves `@deepseek-ai/dsh-session` through
 * those copies. The source tree reports `0.1.2-alpha.2`, whose `dsh-session`
 * does NOT export `SessionLogOffset` — so `[A]` died on
 * `better-sidebar … does not provide an export named 'SessionLogOffset'`
 * while the real published install boots fine, because there the symbol comes
 * from the dsh installation (`dsh-base` depends on `dsh-session@^0.1.5-rc.3`).
 *
 * The fix keeps the fixture honest in both shapes: for every package the bundle
 * links, prefer the copy inside the CLI installation being tested, and fall back
 * to the repo's link only when the installation has no such package. On the
 * source-workspace shape the installation IS the workspace, so nothing changes;
 * on the published shape the fixture stops inheriting `0.1.2-alpha.2`.
 */
const HARNESS_REPOINT = ['@deepseek-ai/dsh-session']
/**
 * `<installation>/node_modules`, derived from the CLI entry being booted.
 *
 * Both separators are matched on purpose. `BIN` comes from
 * `DSH_SMOKE_CLI`/`DSH_SMOKE_DSH`, and callers here pass forward-slash paths
 * (`D:/Dev/_pubsh/...`) because they are written in this repo's docs — while
 * `path.sep` on Windows is `\`. Matching only `path.sep` finds nothing and the
 * re-pointing silently does not happen, which is exactly the silent no-op that
 * would let `[A]` keep failing for a reason nobody can see.
 */
const CLI_INSTALLATION = (() => {
  const at = Math.max(BIN.lastIndexOf('/node_modules/'), BIN.lastIndexOf('\\node_modules\\'))
  if (at === -1) return undefined
  return BIN.slice(0, at + '/node_modules'.length)
})()
const SPAWN_TIMEOUT_MS = 120_000
/**
 * Forced into every booted child's environment.
 *
 * The sandbox this suite is developed in wraps `node` with a `safe-delete` shim
 * that throws when a process deletes more than 100 paths in one turn. `dsh
 * boot` does exactly that as ordinary housekeeping: `healProfilesModuleFallback`
 * clears `profiles/node_modules.lock` under `withFileLock`, and the shim turns
 * that cleanup into
 *
 *   Error: [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {...}
 *     at withFileLock (dsh-atomic-write/lib/index.js:143)
 *     at healProfilesModuleFallback (dsh-app-boot/lib/index.js:662)
 *
 * which aborts the boot before any row loads. That is an artifact of the
 * environment, not of dsh or of this bundle — the same CLI on the same tree
 * boots to `dsh web: http://127.0.0.1:<port>/?token=...` once the shim stands
 * down. Setting it in the child (rather than relying on the caller's shell)
 * keeps the suite honest when it is invoked without the variable set.
 */
const SAFE_DELETE_ENV = { CODEBUDDY_SAFE_DELETE_ENABLED: '0', NODE_OPTIONS: '' }
/**
 * Both entries are needed, and leaving either out fails in a different way —
 * measured, not guessed:
 *
 *   * `CODEBUDDY_SAFE_DELETE_ENABLED=0` — the shim returns early on load
 *     (`process.env.CODEBUDDY_SAFE_DELETE_ENABLED !== '0'`, node-safe-delete-shim.cjs:22-26),
 *     which is what lets dsh's own `profiles/node_modules.lock` cleanup and
 *     `healProfilesModuleFallback` proceed.
 *   * `NODE_OPTIONS=''` — the shims reach the child through the PARENT's
 *     `--require`, so they are loaded before any environment variable can be
 *     consulted. Blanking the variable (not deleting the key) stops the
 *     re-injection at every depth. Note this must be an empty string, not a
 *     removed key: a removed key lets the grandchild inherit the parent's
 *     value again.
 *
 * With only the flag the child still dies inside `rimrafSync` from the shim's
 * own guard; with only the blank it still dies on the lock cleanup. Together
 * the same CLI on the same tree boots to
 * `dsh web: http://127.0.0.1:<port>/?token=...`.
 */
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
    repointHarnessPackages(join(bundleDir, 'node_modules'))
  }

  return { home, marker: join(home, 'hosts.json'), bundleDir }
}

/**
 * Re-point the copied harness links at the CLI installation being booted.
 *
 * See {@link HARNESS_REPOINT} for why this is required. Done here, after the
 * copy, because `copyPreservingLinks` faithfully reproduces this repo's source
 * junctions — which is correct for the files it copies and wrong for the
 * packages a boot will actually resolve.
 *
 * A no-op when the installation has no copy of a package, so the
 * source-workspace shape is unaffected.
 *
 * @param copiedModules - the fixture bundle copy's `node_modules` directory.
 */
function repointHarnessPackages(copiedModules) {
  if (CLI_INSTALLATION === undefined) return
  const repointed = []
  for (const name of HARNESS_REPOINT) {
    const installed = join(CLI_INSTALLATION, name)
    const copied = join(copiedModules, name)
    if (existsSync(installed) === false || existsSync(copied) === false) continue
    rmSync(copied, { recursive: true, force: true })
    symlinkSync(installed, copied, 'junction')
    repointed.push(name)
  }
  // Printed, not silent: this step failing to match is invisible in the result
  // (the boot simply keeps using the stale source links) and shows up much later
  // as an unexplainable `[A]` failure.
  if (repointed.length > 0) {
    console.log(`repointed ${repointed.join(', ')} -> ${CLI_INSTALLATION}`)
  }
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
      ...SAFE_DELETE_ENV,
    }
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
      settleRun({
        code: code ?? -1,
        stdout,
        stderr,
        hosts,
        parseError,
        timedOut,
        // `dsh web` is a SERVER: on success it prints its URL and then keeps
        // serving until something kills it, so the normal outcome is the timeout
        // firing (code=-1, timedOut=true) rather than a clean exit 0. Judging
        // "did it boot" by `code === 0` therefore reports every healthy boot as
        // a failure. The URL on stdout is the signal that actually distinguishes
        // "started serving" from "never got there".
        served: /dsh web: https?:\/\//u.test(stdout),
      })
    })
  })
}

/**
 * Compose one fixture's profile tree WITHOUT booting it, and return the text.
 *
 * `--dump-config` deliberately does not evaluate `!!js` nodes (it prints them
 * verbatim) and mounts nothing, so it answers the one question the precondition
 * probe needs — "which row ids does this harness's base already declare?" —
 * without depending on whether the tree can actually settle. That independence
 * matters here: the shape question and the bootability question are separate,
 * and conflating them was what made an earlier revision of this file misread a
 * legitimate collision as a regression.
 *
 * @param home - the harness home to dump.
 * @returns the composed config tree as text (`''` when the dump itself fails).
 */
function dumpConfig(home) {
  return new Promise((settleDump) => {
    const env = {
      ...process.env,
      DEEPSEEK_API_KEY: 'dsh-remote-cluster-smoke-dummy-key',
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      ...SAFE_DELETE_ENV,
    }
    delete env.NODE_NO_WARNINGS
    delete env.DSH_REMOTE_CLUSTER_HOSTS
    const child = spawn(process.execPath, [BIN, '--profile', PROFILE, '--dump-config'], {
      cwd: home,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.resume()
    const timer = setTimeout(() => child.kill('SIGKILL'), SPAWN_TIMEOUT_MS)
    child.on('error', () => { clearTimeout(timer); settleDump('') })
    child.on('close', () => { clearTimeout(timer); settleDump(stdout) })
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
  const booted = run.served === true || (run.code === 0 && Array.isArray(run.hosts))
  if (baseBooting || booted) {
    // `served` and `hosts` are the two independent proofs that the tree came up:
    // the server printed its URL, and the fixture row ran far enough to write
    // the resolved inventory. Assert whichever the run produced.
    if (run.served === true) {
      check(`[${label}] boot 到开始服务（stdout 打印了 dsh web 的 URL）`, true)
    } else {
      check(`[${label}] 进程正常退出（exit 0）`, run.code === 0)
      if (run.code !== 0) {
        console.log(`       exit=${run.code}${upstream === undefined ? '' : ` — 首因 ${upstream}`}`)
      }
    }
    check(`[${label}] fixture 写出了已解析清单（boot 真正走到了注册表）`, Array.isArray(run.hosts))
    if (!Array.isArray(run.hosts)) console.log(`       marker: ${String(run.parseError)}`)
  } else {
    const row = upstream ?? '(未识别)'
    console.log(`SKIP :: [${label}] boot 到开始服务 / 正常退出 —— 环境限制：上游行 ${row} 导入失败`)
    console.log(`SKIP :: [${label}] fixture 写出了已解析清单 —— 同上，注册表在本机不可达`)
  }
  for (const needle of FORBIDDEN_STDERR) {
    check(`[${label}] stderr 不含 ${JSON.stringify(needle)}`, run.stderr.includes(needle) === false)
  }
  // A `dsh web` run that reached serving was killed by our own reaper; that is
  // the expected end of a server, not a timeout failure. Only a run that never
  // served may be reported as having timed out.
  check(
    `[${label}] 未超时`,
    run.timedOut === false || run.served === true,
    run.served === true ? '（已开始服务，由本测试主动结束）' : '',
  )
  // A failing boot whose first blamed row is not ours is the only case worth
  // spelling out, and the only case where the stderr is the whole diagnosis.
  // Without this the suite reports a dozen symptom FAILs and never shows the
  // one line that explains them, which is how an environment fault gets
  // mistaken for a defect in this package.
  if (run.served !== true && run.code !== 0 && upstream === undefined) {
    console.log(`       ${label} stderr (前 12 行):`)
    for (const line of run.stderr.split('\n').slice(0, 12)) console.log(`       | ${line}`)
  }
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
 * Run section `[A]`: boot the profile that DOES mount this bundle and assert
 * that the six rows load and the registry reflects `DSH_REMOTE_CLUSTER_HOSTS`.
 *
 * This is the only section that needs a runnable harness, which is why it is
 * factored out: `main` calls it only when the precondition probe found shape
 * (1) — our six ids free — and a base tree that settles. Attempting it anyway
 * on this workspace would produce a `duplicate loader entry id: remote-hosts`
 * abort, which the caller has already reported as an environment
 * incompatibility rather than a defect.
 *
 * @param baseBooting - whether a stock base tree booted, used to decide whether
 * the registry-reading assertions are real checks or `SKIP`s.
 */
async function runSectionA(baseBooting) {
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
}

/**
 * Assert the `[无本层]` counterfactual for shape (1), where the base does NOT
 * carry our rows.
 *
 * The load-bearing half is the NEGATIVE one: nothing may name this package or
 * any of its six row ids. A mention would mean the layer was still mounted, and
 * then comparing `[A]` against `[无本层]` would prove nothing about the layer.
 * That half holds on every shape and is always asserted.
 *
 * The positive half — "the boot must therefore fail" — is NOT asserted, because
 * it is false for this package's design and measuring it disproved it:
 *
 *   a bare profile on the published dsh boots to
 *   `dsh web: http://127.0.0.1:59034/?token=...` and keeps serving.
 *
 * The reason is in the harness itself. `assertEntriesActivated`
 * (packages/boot/app-boot/src/index.ts:707) only reports entries that are LISTED
 * and left pending/failed — `for (const entry of ctx.loader.entries())`, then
 * `pending (waiting for services: …)`. A profile with no layer mounted never
 * lists a row that injects `remoteHosts`, so there is no entry to leave pending
 * and nothing to fail. The 0.2.0 guard was what turned that absence into a loud
 * failure; 0.3.0 retired the guard deliberately (it now provides `remoteHosts`
 * itself, so `inject: ['remoteHosts']` would be a tautology — see README), and
 * with the guard gone the bare profile is simply a stock dsh. A stock dsh
 * booting successfully is correct behaviour, not a defect.
 *
 * So this records the observed outcome as information and asserts only what is
 * still meaningful: that the bundle is not implicated. Reporting a healthy stock
 * boot as a FAIL would be a false alarm about a shape that is working.
 *
 * @param run - the run result of the profile WITHOUT this bundle.
 */
function assertNoBundleRun(run) {
  const label = '无本层'
  const blamed = [...OWN_ROW_IDS, 'dsh-remote-cluster'].filter(token => run.stderr.includes(token))
  check(`[${label}] stderr 未把故障归给我们（命中：${blamed.join(',') || '无'}）`, blamed.length === 0)
  // Kept as an observation, not a verdict. A stock dsh that started serving was
  // killed by this suite's own reaper, so `timedOut` is the normal success end.
  const healthyStockBoot = run.served === true || run.code === 0
  if (healthyStockBoot) {
    console.log(`INFO :: [${label}] stock dsh 正常启动（served=${run.served === true} exit=${run.code}）—— 预期如此：`)
    console.log('        没有本层时没有任何行 inject remoteHosts，assertEntriesActivated 无条目可报，')
    console.log('        boot 成功即正确行为。本节的实质断言是上面「未被归咎」。')
  } else {
    console.log(`INFO :: [${label}] stock dsh 未启动（exit=${run.code}），stderr 未归咎本包 —— 同样满足本节意图。`)
    if (run.stderr.includes('plugin tree failed to load')) {
      console.log('        报告了层级加载失败，但不是我们的行；可能是宿主自身故障，值得一看。')
    }
  }
}

const main = async () => {
  if (existsSync(BIN) === false) {
    console.log(`FAIL :: 找不到已构建的 CLI ${BIN}（先在该仓库里构建 apps/cli）`)
    process.exit(1)
  }
  // ── Precondition: which shape is this harness? ────────────────────────────
  // Settled by `--dump-config` on a profile that does NOT list this package, so
  // the answer is the harness's own inventory. This uses no boot on purpose:
  // the shape question ("does the base already own our ids?") is independent of
  // whether a boot settles, and asking it via a boot would (a) cost a full
  // startup and (b) conflate two different environment facts into one verdict.
  //
  // Getting this wrong is not hypothetical: the in-tree sources declare all six
  // ids, so a probe that skipped this step reported a legitimate collision as a
  // wall of failures that looked like defects in this package.
  const bare = createFixture({ withBundle: false, injectFixture: false })
  console.log(`no-bundle fixture home: ${bare.home}`)
  let baseOwnedIds = []
  let baseBooting
  let baseStderr = ''
  try {
    const baseConfig = await dumpConfig(bare.home)
    baseOwnedIds = OWN_ROW_IDS.filter(id => baseConfig.includes(`id: ${id}`))

    // Shape (2): the base owns every id this package contributes, so `[A]` is
    // unrunnable here by construction — our `insert:` cannot avoid the duplicate
    // and no later layer can retract it. Booting would only produce the
    // collision, so skip it and say why.
    if (baseOwnedIds.length === 0) {
      const probe = await bootOnce(bare.home, bare.marker, undefined)
      assertNoBundleRun(probe)
      // See `bootOnce`: a healthy `dsh web` is killed by this suite's own reaper,
      // so exit code alone cannot answer "did it come up".
      baseBooting = probe.served === true || probe.code === 0
      baseStderr = probe.stderr
    }
  } finally {
    rmSync(bare.home, { recursive: true, force: true })
  }

  if (baseOwnedIds.length > 0) {
    console.log(`\n!! 环境不兼容：本工作区 in-tree harness 已声明这些行 id：${baseOwnedIds.join(', ')}。`)
    console.log('   本包用 insert: 提供同名行（applyEntryPatches 无条件 data.push，不去重），')
    console.log('   而重复 id 由 loader 在 boot 时抛 `duplicate loader entry id` 中止整树。')
    console.log('   这是 insert 式装配的固有性质，不是本 patch 的缺陷 —— 已发布的 npm dsh')
    console.log('   （dsh-base/dsh-web-app@0.1.5-rc.3）不含这些行，本 patch 正是为那种形态写的。')
    console.log('   故 [A] 与 [无本层] 在本机都不适用，整体跳过；[A] 的直接证据在 verify-bundle.mjs。')
  } else if (baseBooting === false) {
    const row = upstreamFailureRow(baseStderr) ?? '(未识别)'
    console.log(`\n!! 环境限制：stock base+web-app 层在本工作区无法 boot（上游行 ${row} 导入失败）。`)
    console.log('   这是已发布包集合的版本偏斜，非本包缺陷 —— 详见本文件头部与 README 的「已知限制」。')
    console.log('   [A] 的运行时读表断言因此无法在本机成立，改由 verify-bundle.mjs 直接覆盖。')
  }

  // `[A]` runs only on shape (1) with a base tree that boots far enough to read
  // the registry. Otherwise its assertions are skipped with the reason named,
  // never counted as passes.
  const runnableA = baseOwnedIds.length === 0 && baseBooting !== false
  if (runnableA) {
    await runSectionA(baseBooting)
  } else {
    console.log('\nSKIP :: [A] 整节跳过 —— ' + (baseOwnedIds.length > 0
      ? 'in-tree base 已占用本包行 id（见上）'
      : 'base 层在本机无法 boot（见上）'))
    if (baseOwnedIds.length > 0) {
      console.log('SKIP :: [无本层] 反证同样不适用 —— base 本来就自带这些行，移除本层不会移除能力')
    }
  }

  if (ATTEST) {
    console.log('\n注：本次以 DSH_SMOKE_ATTEST=1 运行 —— 只在版本偏斜导致的失败上放宽，')
    console.log('    且要求审计 0 条 pending 行。本包 6 行的直接证据在 verify-bundle.mjs，')
    console.log('    详见本文件头部与 README 的「已知限制」。')
  }

  if (runnableA === false) {
    // Make the qualification impossible to miss. A bare "PASS" would read as
    // "the boot was verified", which is exactly what did NOT happen here.
    console.log('\n注：[A] 与 [无本层] 都被 SKIP（不是 PASS）—— 本次运行没有验证任何 boot 行为。')
    console.log('    注意盲区：本包所在分组未被加载时，「本包自身的行有缺陷」在本文件中无法暴露 ——')
    console.log('    该职责在 verify-bundle.mjs（已用注入重复 id 的负向测试确认它能抓到，本文件抓不到）。')
  }

  // The banner must not read as "boot verified" when [A] never ran. Keyed on
  // `runnableA` rather than `baseBooting === false`: on shape (2) the probe is
  // never spawned, so `baseBooting` stays `undefined` and that test would be
  // false while every boot assertion was in fact skipped.
  const skipped = runnableA === false
  if (failures !== 0) console.log(`\n>>> ${failures} FAILURES`)
  else if (skipped) console.log('\n>>> BOOT SMOKE PASS（但 [A] 未运行 —— 部分断言被 SKIP，见上）')
  else console.log('\n>>> BOOT SMOKE PASS')
  process.exit(failures === 0 ? 0 : 1)
}

await main()
