/**
 * `dsh-remote-cluster` — a DeepSeek Harness profile bundle that carries the
 * complete remote-host (SSH) subsystem plus the Web sidebar workbench it needs.
 *
 * This module is intentionally empty.
 *
 * A DSH bundle is identified *solely* by its `dsh.bundle.patch` manifest entry
 * in `package.json`: the harness reads that path and applies the parsed patch
 * list as one extra layer over the profile's configuration tree. All behaviour
 * of this bundle therefore lives in `cordis.patch.yml`.
 *
 * Since 0.3.0 that patch layer does much more than override a config value: it
 * `insert`s the whole subsystem — the five upstream `@deepseek-ai/dsh-*-remote-host*`
 * packages plus `dsh-better-sidebar` — from the vended copies under `vendor/`.
 * That is what lets the bundle work on a dsh installed from npm, whose
 * `dsh-base` / `dsh-web-app` bundles ship without any remote-host rows. The
 * 0.2.0 loud-fail guard is gone: this bundle now *provides* the `remoteHosts`
 * service rather than merely asserting someone else did, so a guard injecting
 * it would be a tautology. Every failure it used to catch — an unresolvable
 * module, a plugin that throws on import, a service nobody provides — is
 * already reported by the boot audit (`assertEntriesLoaded` /
 * `assertEntriesActivated` in `@deepseek-ai/dsh-app-boot`), which fails the
 * process with the offending row and the original stack.
 *
 * Keeping a minimal, valid ESM module with **no `prepare` / `install` / `build`
 * lifecycle scripts** remains a hard requirement, not an accident: `dsh plugin
 * add` is a thin forwarder to pnpm in the profile directory, and a git spec is
 * cloned as *source*, so any bundle carrying a build step trips pnpm >= 10's
 * `allowBuilds` gate and the install is blocked until the user grants it
 * code-execution rights at install time. This module has no imports at all, and
 * the `vendor/` tree holds pre-built ESM, so a raw git checkout installs
 * cleanly.
 */
export {}
