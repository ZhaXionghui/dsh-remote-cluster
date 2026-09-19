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
 * @returns paths of the home, the marker file, and the bundle copy.
 */
function createFixture() {
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

  // The profile's own user layer, above every bundle layer: it only carries the
  // test fixture row. 'startup' patchReload means no HMR watcher is mounted.
  writeFileSync(join(profileDir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: remote-cluster-smoke-fixture',
    `      name: ${JSON.stringify(pathToFileURL(join(home, 'fixture.mjs')).href)}`,
    '',
  ].join('\n'))

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

  console.log(failures === 0 ? '\n>>> BOOT SMOKE PASS' : `\n>>> ${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
}

await main()
