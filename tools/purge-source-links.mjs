// Enumerate every symlink under `profiles/node_modules` that points into the
// source workspace (`D:\Dev\...`), record it, and optionally move it aside.
//
// Why a script rather than shell: the shell glob loops were killed twice. The
// tree is large and every entry is a symlink whose target must be read, so the
// work needs to stream rather than glob-expand. This also lets the migration be
// idempotent and report a full inventory before touching anything.
//
// Usage:
//   node tools/purge-source-links.mjs                 # dry run: list only
//   node tools/purge-source-links.mjs --move <dest>    # move matches into <dest>
import { mkdirSync, readdirSync, readlinkSync, renameSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'

// `--move <dest>` relocates matches into <dest>; the default is a dry run.
// `PURGE_ROOT` overrides the scanned tree in either mode.
const MODE = process.argv.includes('--move') ? 'move' : 'dry'
const DEST = MODE === 'move' ? process.argv[process.argv.indexOf('--move') + 1] : undefined
const ROOT = process.env.PURGE_ROOT ?? 'C:/Users/Administrator/.dsh/profiles/node_modules'
if (MODE === 'move' && DEST === undefined) {
  console.error('--move requires a destination directory')
  process.exit(2)
}

// A link counts as pollution when its target resolves into the source
// workspace. Both separators are matched because Git Bash reports POSIX paths
// while Node on Windows would report backslashes.
const isSourceTarget = (target) => /deepseek-harness|[A-Za-z]:[\\/]+Dev[\\/]/u.test(target)

if (MODE === 'move') mkdirSync(DEST, { recursive: true })

const matches = []
let scanned = 0

/** Walk `dir`, collecting (and optionally moving) matching symlinks. */
function walk(dir, depth = 0) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // The backup directories hold the links already migrated, so re-scanning
    // them would double-count and, worse, re-move them into themselves.
    if (entry.name.includes('source-links-backup')) continue
    const full = join(dir, entry.name)
    // `withFileTypes` reports the link itself for a symlink, so this check does
    // not follow it — which matters, since most targets are directories.
    if (entry.isSymbolicLink()) {
      scanned += 1
      let target = ''
      try {
        target = readlinkSync(full)
      } catch {
        continue
      }
      if (isSourceTarget(target) === false) continue
      const rel = relative(ROOT, full).replace(/\\/gu, '/')
      matches.push({ rel, target })
      if (MODE === 'move') {
        const to = join(DEST, rel)
        mkdirSync(dirname(to), { recursive: true })
        try {
          renameSync(full, to)
        } catch (error) {
          console.error(`MOVE-FAILED ${rel}: ${String(error)}`)
        }
      }
      continue
    }
    // Recurse only into scope directories and real package trees, and only to a
    // sane depth: `node_modules/<pkg>/node_modules/...` nesting is real but
    // bounded, and an unbounded walk could chase a cycle.
    if (entry.isDirectory() && depth < 6 && entry.name.startsWith('@') === false) continue
    if (entry.isDirectory() && depth < 6) walk(full, depth + 1)
  }
}

walk(ROOT)

console.log(`scanned symlinks: ${scanned}`)
console.log(`source-workspace links: ${matches.length}`)
if (MODE === 'dry') {
  for (const { rel, target } of matches) console.log(`${rel}\t${target}`)
} else {
  console.log(`moved into: ${DEST}`)
  const leftover = matches.filter(({ rel }) => existsSync(join(ROOT, rel)))
  console.log(`leftover (move failed): ${leftover.length}`)
  for (const { rel } of leftover) console.log(`  ${rel}`)
}
