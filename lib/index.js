/**
 * `dsh-remote-cluster` — a pure-patch DeepSeek Harness profile bundle.
 *
 * This module is intentionally empty.
 *
 * A DSH bundle is identified *solely* by its `dsh.bundle.patch` manifest entry
 * in `package.json`: the harness reads that path and applies the parsed patch
 * list as one extra layer over the profile's configuration tree. All behaviour
 * of this bundle therefore lives in `cordis.patch.yml` — a single id-targeted
 * override of the in-box `remote-hosts-ssh` row. No JavaScript runs on the DSH
 * side.
 *
 * Keeping a minimal, valid ESM module with **zero dependencies and no
 * `prepare` / `install` / `build` lifecycle scripts** is a hard requirement,
 * not an accident: `dsh plugin add` is a thin forwarder to pnpm in the profile
 * directory, and a git spec is cloned as *source*, so any bundle carrying a
 * build step trips pnpm >= 10's `allowBuilds` gate and the install is blocked
 * until the user grants it code-execution rights at install time. A one-line
 * ESM module installs cleanly from a raw git checkout.
 */
export {}
