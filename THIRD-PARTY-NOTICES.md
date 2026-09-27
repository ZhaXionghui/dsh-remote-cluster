# Third-party notices

`dsh-remote-cluster` redistributes, under `vendor/`, pre-built JavaScript
produced by other projects. This file records what is vendored, where it came
from, and under which licence. The vendored sources are **not** modified except
where explicitly noted below.

---

## 1. `@deepseek-ai/dsh-*` remote-host packages

| Directory | Upstream package | Version | Licence |
|---|---|---|---|
| `vendor/host-remote-host/` | `@deepseek-ai/dsh-host-remote-host` | `0.1.2-alpha.2` | MIT |
| `vendor/host-remote-host-ssh/` | `@deepseek-ai/dsh-host-remote-host-ssh` | `0.1.2-alpha.2` | MIT |
| `vendor/tool-remote-host/` | `@deepseek-ai/dsh-tool-remote-host` | `0.1.2-alpha.2` | MIT |
| `vendor/remote-host-controller/` | `@deepseek-ai/dsh-api-remote-host-controller` | `0.1.2-alpha.2` | MIT |
| `vendor/ui-remote-host/` | `@deepseek-ai/dsh-client-ui-remote-host` | `0.1.2-alpha.2` | MIT |

> **Note on `vendor/ui-remote-host`:** its `lib/client.js` has been **modified**
> in this repository — see section 3 — to integrate with the official right
> sidebar instead of the retired `dsh-better-sidebar`. Every other file in that
> directory, and all four other packages, are byte-identical to upstream apart
> from the changes listed below.

**Source:** DeepSeek Harness, `packages/host/remote-host`,
`packages/host/remote-host-ssh`, `packages/host/tool-remote-host`,
`packages/api/remote-host-controller`, `packages/client/ui-remote-host`.

- Upstream repository: <https://github.com/deepseek-ai/deepseek-harness>
- Copyright: DeepSeek. Licensed MIT; see each package's `package.json`
  `"license": "MIT"` field. The upstream licence is the standard MIT text, whose
  operative paragraphs are reproduced here so this file is self-contained:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The verbatim copyright line for this repository's own copy is in the top-level
`LICENSE` file.

**Why these are vendored rather than installed:** these five packages are **not
published to any npm registry**
(`npm view @deepseek-ai/dsh-host-remote-host` → `E404`), and the published
`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app` bundles declare no
dependency on them. The copies under `vendor/` are therefore the only source of
this capability for a dsh installed from npm.

### Modifications made to these five packages

The `lib/` trees were copied from each package's build output. The following
changes were applied; **no other edits were made**, and all other bytes are
identical to upstream.

1. **Pruned build residue**: `lib/tsconfig.tsbuildinfo`, `lib/**/*.d.ts.map`
   and `lib/**/*.js.map` were removed. These are TypeScript incremental-build
   and source-map artefacts with no runtime role.
2. **Rewrote cross-package bare imports (8 sites)**: upstream, three of these
   packages import the seam package *by bare name*. Because that package is
   unpublished and the vendored copies do not sit on Node's `node_modules`
   lookup path, those specifiers cannot resolve at runtime. Each was rewritten
   to a relative path pointing at the sibling vendored copy.

   | File | Original specifier | Rewritten to |
   |---|---|---|
   | `host-remote-host-ssh/lib/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../host-remote-host/lib/index.js` |
   | `host-remote-host-ssh/lib/types/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../../host-remote-host/lib/index.js` |
   | `host-remote-host-ssh/lib/types/provider.js` | `@deepseek-ai/dsh-host-remote-host` | `../../../host-remote-host/lib/index.js` |
   | `host-remote-host-ssh/lib/types/transfer.js` | `@deepseek-ai/dsh-host-remote-host` | `../../../host-remote-host/lib/index.js` |
   | `remote-host-controller/lib/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../host-remote-host/lib/index.js` |
   | `remote-host-controller/lib/types/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../../host-remote-host/lib/index.js` |
   | `tool-remote-host/lib/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../host-remote-host/lib/index.js` |
   | `tool-remote-host/lib/types/index.js` | `@deepseek-ai/dsh-host-remote-host` | `../../../host-remote-host/lib/index.js` |

   Every other bare import in these packages (`@deepseek-ai/cordis`,
   `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`, `ssh2`, …) is left
   untouched: those packages are part of, or resolve from, the host dsh
   installation.
3. **Trimmed each `package.json`**: removed `publishConfig`, `repository`,
   `types`, `devDependencies`, `files`, and the `./src/*` export; removed all
   `workspace:*` dependency declarations. The `name` field is preserved
   **verbatim**, because the client-module discovery walks up from the loaded
   module to the nearest `package.json` and requires the `name` to match the
   expected package; `main` and `exports` now point only at the shipped `lib/`
   files.
4. **Migrated `ui-remote-host`'s browser half to the official sidebar** (0.4.0).
   `lib/client.js` was updated to register through `sidebarRightTabs` /
   `sidebar.right.pane.tab` instead of the retired `betterSidebar` service, and
   its `package.json` `dsh.client.inject` now names
   `@deepseek-ai/dsh-client-ui-sidebar-right`. Two locale keys were added
   (`guideDescription` in both dictionaries) for the tab-type guide entry. See
   section 3 for why the service it previously used had to go.

---

## 2. Runtime dependencies declared by this bundle

Ten packages, in three groups. Getting this list wrong makes the bundle
**uninstallable**, so it is pinned by an assertion rather than maintained by
hand — see `tools/verify-bundle.mjs` family `[13]`, which walks the vendored
import graph and fails if any specifier it reaches has no owner here.

| Package | Declared range | Used by | Licence |
|---|---|---|---|
| `@deepseek-ai/dsh-credentials` | `^0.1.5-rc.3` | `vendor/host-remote-host-ssh` | MIT |
| `@deepseek-ai/dsh-native-command` | `^0.1.5-rc.3` | `vendor/host-remote-host-ssh` | MIT |
| `@deepseek-ai/dsh-output-retention` | `^0.1.5-rc.3` | `vendor/host-remote-host-ssh` | MIT |
| `@deepseek-ai/dsh-util-values` | `^0.1.5-rc.3` | `vendor/host-remote-host-ssh` | MIT |
| `@deepseek-ai/dsh-settings` | `^0.1.5-rc.3` | `vendor/host-remote-host-ssh` | MIT |
| `@deepseek-ai/dsh-typert-protocol` | `^0.1.5-rc.3` | `vendor/remote-host-controller` | MIT |
| `@deepseek-ai/schemastery` | `3.18.2` | `vendor/host-remote-host-ssh` | MIT |
| `ssh2` | `^1.17.0` | `vendor/host-remote-host-ssh` | MIT |
| `ws` | `^8.18.0` | `vendor/remote-host-controller` | MIT |
| `zod` | `^4.4.3` | `vendor/remote-host-controller` (`./typert` subpath) | MIT |

### Why the scoped fork is pinned to an exact version

`@deepseek-ai/schemastery` is the **scoped fork**, a different package from the
native `schemastery` on npm. Only the fork is used here — the native package was
pulled in by the retired `dsh-better-sidebar` and is no longer declared.

The fork is pinned to exactly `3.18.2` rather than a caret range because
`@deepseek-ai/dsh-settings@0.1.5-rc.3` declares an **exact** peer on `3.18.2`;
a `^` instead resolves to `3.18.4` and produces an unmet-peer warning.

A related failure shipped in 0.3.0 and is worth recording, because the wrong
lesson is easy to draw from it: the manifest then declared the *native* name
while the vendored ssh provider imports the *scoped* one, and the native package
has **never published a 3.18.2**, so `dsh plugin add` aborted with
`ERR_PNPM_NO_MATCHING_VERSION`. That failure was invisible inside the harness
source tree, because `pnpm-workspace.yaml` there carries
`overrides: {'@deepseek-ai/schemastery': 'link:vendor/schemastery'}`, so the bare
name resolved to *something* regardless of what was declared. The check
therefore derives its verdict from the import graph and the manifest, never from
the fact that a resolution happened to succeed locally.

### Why `zod` is declared even though nothing `import`s it directly

`vendor/remote-host-controller` publishes the typert RPC surface through its
`exports` map:

```json
{ "./typert": "./lib/typert.host.js", "./remote": "./lib/typert.remote-client.js" }
```

The framework loads those files **by subpath**, not through a static `import`,
and both begin with `import { z } from 'zod'`. A walk seeded only from the
patch rows would miss them, which is why the assertion also seeds from every
vendored `exports` target.

These are ordinary `dependencies`: pnpm installs them from the registry into the
profile's `node_modules`, and the vendored code resolves them from there.

### A harmless install warning

`ssh2` carries an **optional** native binding (`cpu-features`) whose `node-gyp`
step needs a Python interpreter. On a machine without one, `pnpm add` prints

```
node_modules/ssh2 install: gyp ERR! find Python
node_modules/ssh2 install: Failed to build optional crypto binding
```

and still exits `0`. This is **not an error**: `ssh2` falls back to a pure-JS
implementation, the binding is optional, and the harness's own
`pnpm-workspace.yaml` sets `cpu-features: false` for the same reason. No
capability of this bundle depends on it.

---

## 3. The official right sidebar is consumed, not vendored

Since `dsh-web-app@0.1.7-rc.2` the sidebar is provided by the harness itself
(`@deepseek-ai/dsh-client-ui-sidebar`, `…-sidebar-right`, `…-sidebar-files`,
`…-sidebar-browser`, `…-sidebar-terminal`, `…-sidebar-documentpreview`).
`vendor/ui-remote-host` therefore **consumes** the official services
(`sidebarRightTabs`, `sidebarRight`) instead of shipping a sidebar of its own,
and nothing from that family is redistributed here.

Until 0.3.0 this bundle inlined `dsh-better-sidebar@0.19.1` to supply a sidebar.
That copy was **removed** in 0.4.0, and the reason is worth stating precisely
because it is a version-skew defect rather than a preference:

`conversation.chat.turnTail` changed contract at `0.1.7`. It used to be a
`kind: "chain"` slot (registration supplies `options.select`); it is now
`kind: "list"` (registration supplies `options.id`). `dsh-better-sidebar@0.19.1`
registers it the old way, so on a new host it throws

```
[dsh-better-sidebar] interception error: list slot "conversation.chat.turnTail" requires options.id
```

from `@deepseek-ai/dsh-client-ui-slots/lib/index.js` (`case "list"`). Upstream
reached the same conclusion independently: `dsh-web-app@0.1.7-rc.2`'s own
`cordis.patch.yml` contains no `better-sidebar` row at all. The full evidence
trail is in `_acc/BETTER-SIDEBAR-ROOTCAUSE.md`.

---

## 4. Duplicate entry ids are a declared constraint, not a guarded case

The patch `insert`s five rows unconditionally, because the include's insert
branch is a bare `data.push(...insert)` with no dedup
(`vendor/include/src/index.ts:93-95`) and it appends into the same top-level
array the host bundle wrote. If another bundle already declares one of those
ids, that array holds two rows with the same id and the loader rejects it:

```
TypeError: duplicate loader entry id: <id>
```

That throw happens **before** any `disabled` flag is consulted
(`vendor/loader/src/config/group.ts:59-66`) and rolls the entire group back
(`:70-78`) — which is why the desktop client reported those rows as 「异常」
rather than merely skipping them.

An earlier 0.4.0 draft tried to absorb the collision with a per-row
`disabled: !!js '... loader.store["<id>"] !== undefined'` guard, so that a row
whose id was already taken would disable itself. **That does not work**, and the
failure mode is worth recording because it passed every static check: the guard
reads `loader.store`, but `store` is written by `EntryGroup.create`
(`group.ts:22-23`), which `update` calls only *after* its duplicate scan. At the
throw the map is provably empty (instrumenting the loader printed
`storeKeys=[]`), so the guard always evaluates to "not disabled" and absorbs
nothing. There is no alternative: `PatchOptions` has no delete/rename key
(`include/src/index.ts:145-160`), and a nested `group` shares one id namespace
because `Group` passes the parent tree (`group.ts:119`).

The guards were therefore removed and the constraint declared instead: this
bundle requires a target dsh whose bundles do not already declare these five
ids — true of the published `dsh-base`/`dsh-web-app@0.1.7-rc.2` (verified: zero
matches for `remote-host` in their patches). `tools/verify-bundle.mjs` family
`[15]` asserts no row carries a guard and re-checks the four structural
premises that make one useless, so a future "fix" in that direction fails
loudly; `tools/boot-smoke.mjs` characterises the collision on the in-tree shape.
Full evidence: `_acc/YIELD-GUARD-REFUTED.md` and `_acc/DESKTOP-DIAGNOSIS.md`.

