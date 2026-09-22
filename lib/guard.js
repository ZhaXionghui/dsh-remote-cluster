/**
 * `dsh-remote-cluster` — the loud-fail guard for the remote-host seam.
 *
 * `cordis.patch.yml` inserts this module as one extra row in the profile tree.
 * Its only job is to declare `inject: ['remoteHosts']`: an entry that injects a
 * service the running dsh does not provide cannot activate.
 *
 * Why declare an injection instead of probing the service at runtime:
 * injecting is the one declaration the boot audit already understands. When the
 * `remoteHosts` service (provided by `@deepseek-ai/dsh-host-remote-host`, a base
 * bundle row) is absent, Cordis leaves this entry's fiber PENDING — it never
 * runs `apply`, so a runtime check inside `apply` would never execute and the
 * miss would stay silent. A declared injection, by contrast, is exactly what
 * `assertEntriesActivated` reads: it names this entry and the missing service
 * (`... pending (waiting for service: remoteHosts)`) and fails the boot. That
 * turns "installed but inert" into a loud startup failure.
 *
 * `apply` is empty on purpose. This module registers nothing and reads nothing;
 * it exists only to be activated, so its activation *or* its pending state is
 * the whole signal. Exporting `apply` is still required — the registry rejects
 * a plugin that is neither a function nor an object with an `apply` method —
 * and returning `undefined` is a valid, side-effect-free outcome.
 *
 * Zero imports and zero dependencies are hard requirements, not choices: this
 * package is installed straight from a raw git checkout, and any bundle that
 * needs a build or an install step trips pnpm >= 10's `allowBuilds` gate, which
 * blocks installation until the user grants it code-execution rights. A module
 * with no imports and no lifecycle scripts installs cleanly.
 */

/** The loader entry name shown in boot diagnostics when this guard is pending. */
export const name = 'remote-cluster-guard'

/**
 * The service this entry requires. Providing it is the base bundle's job; when
 * it is missing, this entry stays PENDING and the boot audit fails loudly.
 */
export const inject = ['remoteHosts']

/** No-op: activation (or pending) of this entry is itself the whole signal. */
export function apply() {}
