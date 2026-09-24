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

**Source:** DeepSeek Harness, `packages/host/remote-host`,
`packages/host/remote-host-ssh`, `packages/host/tool-remote-host`,
`packages/api/remote-host-controller`, `packages/client/ui-remote-host`.

- Upstream repository: <https://github.com/deepseek-ai/deepseek-harness>
- Copyright: DeepSeek. Licensed MIT; see each package's `package.json`
  `"license": "MIT"` field. The upstream LICENSE text is the standard MIT
  licence and is reproduced in this repository's top-level `LICENSE` file.

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

---

## 2. `dsh-better-sidebar`

| Directory | Upstream package | Version | Licence |
|---|---|---|---|
| `vendor/better-sidebar/` | `dsh-better-sidebar` | `0.19.1` | MIT |

- Upstream repository: <https://github.com/omdsh-dev/DSH-better-sidebar>
- Copyright (c) 2026 dsh-external
- The full upstream licence text is preserved verbatim at
  `vendor/better-sidebar/LICENSE` and reproduced here:

```
MIT License

Copyright (c) 2026 dsh-external

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

**Why it is vendored:** `@deepseek-ai/dsh-client-ui-remote-host`'s browser half
injects the `betterSidebar` service, which only `dsh-better-sidebar` provides.
Without that row in the tree the panel's module cannot activate, and the Web
client's boot audit (`assertEntriesActive`) fails the whole page. Version
`0.19.1` was chosen because its peer range (`^0.1.5-rc.1`) matches the
`0.1.5-rc.3` dsh ecosystem exactly.

### Modifications made to `dsh-better-sidebar`

**None.** `vendor/better-sidebar/lib/` and `vendor/better-sidebar/LICENSE` are
byte-for-byte copies of the published `dsh-better-sidebar@0.19.1` npm tarball.
Its `package.json` retains its original `name`, `version`, `license`, `main`,
`exports` and `dsh.client` declaration verbatim; only fields irrelevant to a
vendored runtime copy were dropped (`dependencies`, `devDependencies`,
`scripts`, `peerDependencies`, `peerDependenciesMeta`, `files`, `engines`,
`repository`, `publishConfig`). Its `cordis.patch.yml` is **not** shipped —
this bundle mounts the row directly from its own patch (see below), so the
upstream aggregate-mount guard does not apply.

### Third-party runtime dependencies of `dsh-better-sidebar`

`dsh-better-sidebar`'s host half imports two packages that are **not** part of a
plain dsh installation. Both are declared in this bundle's `dependencies` so
pnpm installs them into the profile, where the vendored code resolves them:

| Package | Declared range | Purpose | Licence |
|---|---|---|---|
| `schemastery` | `^3.18.2` | host-half config schema | MIT |
| `ws` | `^8.18.0` | host-half WebSocket server | MIT |

Its browser halves (`lib/client*.js`) `require(...)` only `react`,
`react-dom` and `@deepseek-ai/dsh-client-ui-primitives`; all three are supplied
by the Web client's static module seed and need no Node resolution.

---

## 3. Runtime dependencies declared by this bundle

| Package | Declared range | Used by | Licence |
|---|---|---|---|
| `ssh2` | `^1.17.0` | `vendor/host-remote-host-ssh` | MIT |
| `schemastery` | `^3.18.2` | `vendor/better-sidebar` | MIT |
| `ws` | `^8.18.0` | `vendor/better-sidebar` | MIT |

These are ordinary `dependencies`: pnpm installs them from the registry into the
profile's `node_modules`, and the vendored code resolves them from there.
