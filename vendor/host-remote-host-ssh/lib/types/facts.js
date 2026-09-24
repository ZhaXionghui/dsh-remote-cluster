/** POSIX host-information probe and strict parser for the SSH provider. */
/** Fixed probe delivered through `sh -s`; every emitted value occupies one tab-delimited line. */
export const INSPECTION_SCRIPT = String.raw `set +e
dsh_value() {
  dsh_key="$1"
  shift
  dsh_output="$($@ 2>/dev/null)" || return
  dsh_output="$(printf '%s' "$dsh_output" | tr '\t\r\n' '   ')"
  printf '%s\t%s\n' "$dsh_key" "$dsh_output"
}
dsh_value hostname hostname
dsh_value kernel uname -sr
dsh_value architecture uname -m
if [ -r /etc/os-release ]; then
  dsh_os="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | head -n 1)"
  dsh_os="$(printf '%s' "$dsh_os" | sed 's/^"//; s/"$//')"
  dsh_os="$(printf '%s' "$dsh_os" | tr '\t\r\n' '   ')"
  [ -n "$dsh_os" ] && printf 'operatingSystem\t%s\n' "$dsh_os"
fi
if [ -r /proc/uptime ]; then
  awk '{ printf "uptimeSeconds\t%d\n", $1 }' /proc/uptime 2>/dev/null
fi
if [ -r /proc/loadavg ]; then
  awk '{ printf "loadAverage\t%s\t%s\t%s\n", $1, $2, $3 }' /proc/loadavg 2>/dev/null
fi
dsh_value logicalCpuCount getconf _NPROCESSORS_ONLN
if [ -r /proc/meminfo ]; then
  awk '/^MemTotal:/ { total=$2 * 1024 } /^MemAvailable:/ { available=$2 * 1024 } END { if (total > 0) printf "memory\t%.0f\t%.0f\n", total, available }' /proc/meminfo 2>/dev/null
fi
df -Pk / 2>/dev/null | awk 'NR == 2 { printf "rootDisk\t%.0f\t%.0f\n", $2 * 1024, $3 * 1024 }'
`;
function finiteNonNegative(value) {
    if (value === undefined || value.trim().length === 0)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function positiveInteger(value) {
    const parsed = finiteNonNegative(value);
    return parsed !== undefined && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
/**
 * Parse independent probe rows so an invalid or unavailable fact does not discard its companions.
 * @param id - configured host identity.
 * @param output - bounded probe stdout.
 * @param observedAt - local observation timestamp.
 * @param latencyMs - complete probe round-trip.
 * @returns the safe partial fact record.
 */
export function parseRemoteHostFacts(id, output, observedAt, latencyMs) {
    const facts = {};
    for (const line of output.split('\n')) {
        const [key, ...values] = line.split('\t');
        if (key !== undefined && key.length > 0 && facts[key] === undefined)
            facts[key] = values;
    }
    const load = facts.loadAverage;
    const loadAverage = load === undefined
        ? undefined
        : load.slice(0, 3).map(value => finiteNonNegative(value));
    const memory = facts.memory;
    const disk = facts.rootDisk;
    const uptimeSeconds = finiteNonNegative(facts.uptimeSeconds?.[0]);
    const logicalCpuCount = positiveInteger(facts.logicalCpuCount?.[0]);
    const memoryTotalBytes = finiteNonNegative(memory?.[0]);
    const memoryAvailableBytes = finiteNonNegative(memory?.[1]);
    const rootDiskTotalBytes = finiteNonNegative(disk?.[0]);
    const rootDiskUsedBytes = finiteNonNegative(disk?.[1]);
    return {
        id,
        observedAt,
        latencyMs,
        ...facts.hostname?.[0] ? { hostname: facts.hostname[0] } : {},
        ...facts.operatingSystem?.[0] ? { operatingSystem: facts.operatingSystem[0] } : {},
        ...facts.kernel?.[0] ? { kernel: facts.kernel[0] } : {},
        ...facts.architecture?.[0] ? { architecture: facts.architecture[0] } : {},
        ...uptimeSeconds !== undefined ? { uptimeSeconds } : {},
        ...loadAverage?.length === 3 && loadAverage.every(value => value !== undefined)
            ? { loadAverage: loadAverage }
            : {},
        ...logicalCpuCount !== undefined ? { logicalCpuCount } : {},
        ...memoryTotalBytes !== undefined ? { memoryTotalBytes } : {},
        ...memoryAvailableBytes !== undefined ? { memoryAvailableBytes } : {},
        ...rootDiskTotalBytes !== undefined ? { rootDiskTotalBytes } : {},
        ...rootDiskUsedBytes !== undefined ? { rootDiskUsedBytes } : {},
    };
}
//# sourceMappingURL=facts.js.map