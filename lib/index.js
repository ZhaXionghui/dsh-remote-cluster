/**
 * `dsh-remote-cluster` — a pure-patch DeepSeek Harness profile bundle.
 *
 * This module is intentionally empty.
 *
 * A DSH bundle is identified solely by its `dsh.bundle.patch` manifest entry
 * (`package.json`): the harness loads and applies `cordis.patch.yml`, which
 * inserts an `@deepseek-ai/dsh-mcp-client` entry pointing at the HSAgent MCP
 * server. No JavaScript is executed on the DSH side — all behaviour is
 * declarative configuration.
 *
 * Keeping Zero dependencies and no `prepare` / `install` scripts is a hard
 * requirement, not an accident: `dsh plugin add` is a thin pnpm forwarder and
 * a git spec is cloned as source, so any bundle carrying a build step trips
 * pnpm >= 10's `allowBuilds` gate and the install is blocked. A one-line ESM
 * module with no lifecycle scripts installs cleanly from a raw git tarball.
 */
export {}
