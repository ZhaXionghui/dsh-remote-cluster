/**
 * Rebuild the local dependency-closure links this repo's tooling needs.
 *
 * Nothing here ships: `node_modules` is git-ignored and never listed in
 * `files`. These links exist so `verify-bundle.mjs` and `boot-smoke.mjs` can
 * resolve the bare specifiers the vendored code imports. In a live profile the
 * harness performs the equivalent job itself — `healProfileModuleFallback`
 * reads each bundle layer's manifest and links the closure into
 * `<profile>/node_modules`.
 *
 * The links must stay LINKS. The harness package tree contains circular package
 * symlinks, so anything that dereferences them (a recursive copy, for instance)
 * walks forever; the boot fixture therefore copies this tree with
 * `dereference: false`.
 *
 * Run: node tools/link-deps.mjs
 */

import { existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const HARNESS = 'D:/Dev/deepseek-harness'
const ROOT = 'D:/Dev/dsh-remote-cluster'
const HARNESS_NM = `${HARNESS}/node_modules`
const PNPM = `${HARNESS_NM}/.pnpm`

// Provided by the harness installation and resolved by bare name at boot.
const HOST_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-output-retention',
  '@deepseek-ai/dsh-native-command',
  '@deepseek-ai/dsh-util-values',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-sidebar-right',
  '@deepseek-ai/dsh-host-webserver',
]

/** Resolve a harness package: `vendor/cordis` is special, pnpm dirs otherwise. */
const harnessSource = (name) => {
  if (name === '@deepseek-ai/cordis') return `${HARNESS}/vendor/cordis`
  return join(HARNESS_NM, name)
}

const LINKS = {
  ...Object.fromEntries(HOST_PACKAGES.map(name => [name, harnessSource(name)])),
  // Declared `dependencies` of this bundle; a package manager would install them.
  schemastery: `${PNPM}/schemastery@3.18.0/node_modules/schemastery`,
  ws: `${PNPM}/ws@8.21.0/node_modules/ws`,
  ssh2: `${PNPM}/ssh2@1.17.0/node_modules/ssh2`,
  // The seam package. Upstream, its siblings import it by bare name; inside the
  // vendor tree those imports are relative instead (see THIRD-PARTY-NOTICES),
  // but the harness still resolves it by name when building the closure.
  '@deepseek-ai/dsh-host-remote-host': `${ROOT}/vendor/host-remote-host`,
}

const nm = join(ROOT, 'node_modules')
mkdirSync(nm, { recursive: true })
let created = 0
let missing = 0
for (const [name, source] of Object.entries(LINKS)) {
  const dest = join(nm, name)
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest)) continue
  if (existsSync(source) === false) {
    console.log(`  源缺失 ${name}（${source}）`)
    missing += 1
    continue
  }
  symlinkSync(source, dest, 'junction')
  created += 1
}
console.log(`依赖闭包链接就绪：新建 ${created} 个，源缺失 ${missing} 个（共 ${Object.keys(LINKS).length}）`)
