/**
 * Real-boot smoke test for the `dsh-remote-cluster` bundle.
 *
 * It builds a throwaway `DSH_HOME`, hand-writes a profile whose
 * `dsh.profile.bundles` is `dsh-base + dsh-web-app + dsh-remote-cluster`,
 * drops the bundle into that profile's `node_modules` (a plain copy — Windows
 * cannot create real symlinks here and this repo has no pnpm), and boots the
 * built CLI for real:
 *
 *   node <dsh>/apps/cli/lib/bin.js --profile clustersmoke --no-open --port 0
 *
 * A tiny test-only fixture plugin (injected through the profile's OWN user
 * patch layer, never part of this package) waits for the tree to settle, reads
 * the resolved inventory back out of the live remote-host registry, writes it
 * to a marker file, and then asks the process to exit cleanly by emitting
 * `SIGTERM` from *inside* the child. That last part matters on Windows:
 * `child.kill('SIGTERM')` there does not deliver a catchable signal (it
 * terminates the process, so the exit code is `null`), while an in-process
 * `process.emit('SIGTERM')` runs the launcher's own handler and exits 0.
 *
 * Both directions are exercised — with and without `DSH_REMOTE_CLUSTER_HOSTS` —
 * so the `!!js` inventory expression is proven evaluable in a real boot, not
 * merely in a unit-level `interpolate` call.
 *
 * Since 0.2.0 a third state boots a profile with the base `remote-hosts` row
 * turned OFF (a dsh without the remote-host subsystem). The loud-fail guard
 * must then keep the process from starting: exit != 0 with a boot audit naming
 * the guard and the missing `remoteHosts` service. That state also asserts the
 * guard's OWN audited pending row via a line-anchored match (not a loose
 * substring), the audit's blast radius is >= 2 pending rows, and the reported
 * `N entries did not activate` count equals the number of pending rows printed
 * — so removing the guard row from the patch turns the state red at runtime.
 *
 * Run: node tools/boot-smoke.mjs
 */

import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_DIR = resolve(HERE, '..')
const DSH = 'D:/Dev/deepseek-harness'
const BIN = join(DSH, 'apps/cli/lib/bin.js')
const PROFILE = 'clustersmoke'
// Bundle names are the real `name` fields of their package.json:
// packages/bundle/base/package.json:2 and packages/bundle/web-app/package.json:2.
const BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-remote-cluster']
const BUNDLE_COPY = ['package.json', 'cordis.patch.yml', 'lib', 'README.md', 'LICENSE']
const SPAWN_TIMEOUT_MS = 120_000
const FORBIDDEN_STDERR = [
  'failed to apply loader entry',
  'plugin tree failed to load',
  'patch: entry remote-hosts-ssh not found',
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
  void ctx.loader.await().then(() => {
    const hosts = ctx.remoteHosts.list().map(host => ({
      id: host.id,
      label: host.label,
      kind: host.kind,
      hostname: host.hostname,
      port: host.port,
      user: host.user,
    }))
    writeFileSync(process.env.DSH_SMOKE_MARKER, JSON.stringify(hosts, null, 2))
    setTimeout(() => { process.emit('SIGTERM') }, 100)
  })
}
`

/**
 * Build one throwaway harness home with the profile, the fixture, and a copy of
 * this bundle installed into the profile's node_modules.
 * @param options - `disableRemoteHosts` turns the base `remote-hosts` provider
 * row off (simulating a dsh without the remote-host subsystem); `injectFixture`
 * adds the test-only fixture row (only valid when `remoteHosts` exists).
 * @returns paths of the home, the marker file, and the bundle copy.
 */
function createFixture({ disableRemoteHosts = false, injectFixture = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-remote-cluster-smoke-'))
  const profileDir = join(home, 'profiles', PROFILE)
  const bundleDir = join(profileDir, 'node_modules', 'dsh-remote-cluster')
  mkdirSync(bundleDir, { recursive: true })

  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: `dsh-profile-${PROFILE}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...BUNDLES], patchReload: 'startup' } },
  }, undefined, 2))

  // The profile's own user layer, above every bundle layer. It carries the test
  // fixture row (when the subsystem exists) and, for the missing-subsystem
  // case, an id-targeted `disabled: true` on the base `remote-hosts` row —
  // the faithful way to model a dsh that never had the provider: the row is
  // present but never activates, so no `remoteHosts` service is published.
  // 'startup' patchReload means no HMR watcher is mounted.
  const userLayer = []
  if (disableRemoteHosts) {
    userLayer.push('- id: remote-hosts', '  disabled: true')
  }
  if (injectFixture) {
    userLayer.push(
      '- insert:',
      '    - id: remote-cluster-smoke-fixture',
      `      name: ${JSON.stringify(pathToFileURL(join(home, 'fixture.mjs')).href)}`,
    )
  }
  writeFileSync(join(profileDir, 'cordis.patch.yml'), `${userLayer.join('\n')}\n`)

  writeFileSync(join(home, 'fixture.mjs'), FIXTURE_SOURCE)
  for (const entry of BUNDLE_COPY) {
    cpSync(join(BUNDLE_DIR, entry), join(bundleDir, entry), { recursive: true })
  }

  return { home, marker: join(home, 'hosts.json'), bundleDir }
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
 * Assert one boot run's outcome.
 * @param label - the run label used in assertion names.
 * @param run - the run result.
 */
function assertRun(label, run) {
  check(`[${label}] 进程正常退出（exit 0）`, run.code === 0)
  if (run.code !== 0) {
    console.log(`       stdout: ${run.stdout.trim()}`)
    console.log(`       stderr: ${run.stderr.trim()}`)
  }
  for (const needle of FORBIDDEN_STDERR) {
    check(`[${label}] stderr 不含 ${JSON.stringify(needle)}`, run.stderr.includes(needle) === false)
  }
  check(`[${label}] 未超时`, run.timedOut === false)
  check(`[${label}] fixture 写出了已解析清单（boot 真正走到了注册表）`, Array.isArray(run.hosts))
  if (!Array.isArray(run.hosts)) console.log(`       marker: ${String(run.parseError)}`)
}

const main = async () => {
  if (existsSync(BIN) === false) {
    console.log(`FAIL :: 找不到已构建的 CLI ${BIN}（先在该仓库里构建 apps/cli）`)
    process.exit(1)
  }

  const fixture = createFixture()
  console.log(`fixture home: ${fixture.home}`)
  try {
    const withEnv = await bootOnce(fixture.home, fixture.marker, JSON.stringify(SAMPLE_HOSTS))
    assertRun('env 已设', withEnv)

    const byId = new Map((withEnv.hosts ?? []).map(host => [host.id, host]))
    check('[env 已设] 注册表里恰好 2 台主机', (withEnv.hosts ?? []).length === 2)
    check('[env 已设] gpu-cluster 以 kind=cluster 注册', byId.get('gpu-cluster')?.kind === 'cluster')
    check('[env 已设] gpu-cluster 的 hostname/user 来自 env', byId.get('gpu-cluster')?.hostname === 'login.gpu.example.org' && byId.get('gpu-cluster')?.user === 'smoke')
    check('[env 已设] build-server 以 kind=server 注册且 port=2222', byId.get('build-server')?.kind === 'server' && byId.get('build-server')?.port === 2222)
    check('[env 已设] label 原样传递', byId.get('gpu-cluster')?.label === 'GPU Cluster')

    rmSync(fixture.marker, { force: true })
    const withoutEnv = await bootOnce(fixture.home, fixture.marker, undefined)
    assertRun('env 未设', withoutEnv)
    check('[env 未设] 注册表为空（回落 base 的中性默认 hosts: []）', Array.isArray(withoutEnv.hosts) && withoutEnv.hosts.length === 0)
  } finally {
    rmSync(fixture.home, { recursive: true, force: true })
  }

  // ── [post-0.2.0] The loud-fail guard on a dsh WITHOUT the remote-host seam ──
  // A healthy profile mounts `remote-hosts` (the `remoteHosts` provider) from
  // dsh-base, so the guard activates and boot is silent — proven above. Here the
  // provider row is turned off, so the guard's `inject: ['remoteHosts']` cannot
  // resolve: its fiber stays PENDING and the boot audit must fail the process.
  // This is asserted on a SEPARATE fixture and does NOT touch the exit-0 model.
  const noSeam = createFixture({ disableRemoteHosts: true, injectFixture: false })
  console.log(`no-seam fixture home: ${noSeam.home}`)
  try {
    const run = await bootOnce(noSeam.home, noSeam.marker, undefined)
    check('[无 remote-host 接缝] boot 响亮失败（exit ≠ 0）', run.code !== 0)
    check('[无 remote-host 接缝] 未超时', run.timedOut === false)
    check('[无 remote-host 接缝] stderr 含 "plugin tree failed to load"', run.stderr.includes('plugin tree failed to load'))
    check('[无 remote-host 接缝] stderr 含 "did not activate"', run.stderr.includes('did not activate'))
    check('[无 remote-host 接缝] stderr 含 "waiting for service: remoteHosts"', run.stderr.includes('waiting for service: remoteHosts'))
    check('[无 remote-host 接缝] stderr 点名守卫模块 dsh-remote-cluster/lib/guard.js', run.stderr.includes('dsh-remote-cluster/lib/guard.js'))
    // ── Anchored assertions (post-QA gap) ────────────────────────────────────
    // The five substring assertions above are TOO LOOSE: the first three pass
    // even if the guard row is removed entirely, because a dsh lacking the
    // `remoteHosts` provider already leaves `remote-hosts-ssh` and
    // `tool-remote-host` (or `remote-host-controller` on the web line) PENDING,
    // so boot fails loudly anyway. Only an assertion that pins the guard's OWN
    // audited row can catch a "guard removed" regression at runtime. We use a
    // LINE-ANCHORED match (`^...$` + `m`) so the whole pending record must be
    // present as its own line — not merely a substring mentioned elsewhere.
    check(
      '[无 remote-host 接缝] 审计逐行含守卫的 pending 行（守卫确为被审计的 PENDING entry 之一）',
      /^dsh-remote-cluster\/lib\/guard\.js: pending \(waiting for service: remoteHosts\)$/mu.test(run.stderr),
    )
    // The audit explodes over the FULL blast radius of the missing service, not
    // just the guard: every consumer of `remoteHosts` is listed. We assert the
    // blast radius is ≥ 2 pending rows (the guard plus at least one upstream
    // consumer) WITHOUT hard-coding the exact count — the count is a function of
    // the profile's composition (see README's guard section), so it must not be
    // pinned here.
    const pendingRows = run.stderr.match(/^\S+: pending \(waiting for service: remoteHosts\)$/gmu) ?? []
    check(
      '[无 remote-host 接缝] 审计列出 ≥ 2 条 pending 行（同一病灶的完整爆炸半径）',
      pendingRows.length >= 2,
    )
    // The `N entries did not activate` count must be consistent with (i.e. equal
    // to) the number of pending rows actually printed — proving the audited rows
    // are exactly the ones counted, not a partial listing. Extracted dynamically,
    // never hard-coded.
    const countMatch = run.stderr.match(/(\d+) entries did not activate/u)
    const auditedCount = countMatch ? Number(countMatch[1]) : NaN
    check(
      '[无 remote-host 接缝] "N entries did not activate" 的 N 与 pending 行数一致',
      Number.isFinite(auditedCount) && auditedCount === pendingRows.length && auditedCount >= 2,
    )
    if (run.code === 0 || run.timedOut) {
      console.log(`       exit=${run.code} timedOut=${run.timedOut}`)
      console.log(`       stderr: ${run.stderr.trim()}`)
    }
  } finally {
    rmSync(noSeam.home, { recursive: true, force: true })
  }

  console.log(failures === 0 ? '\n>>> BOOT SMOKE PASS' : `\n>>> ${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
}

await main()
