#!/usr/bin/env bash
# 03-drift.sh —— 系统性普查：vendor 里从 @deepseek-ai/* 导入的每个具名符号，
# 在「已发布 dsh 的 node_modules」里是否真实存在。一次找全所有 API 漂移。
set -uo pipefail
LOG=/mnt/d/Dev/dsh-remote-cluster/_acc/03.log
exec > "$LOG" 2>&1
export PATH="$HOME/.npm-global/bin:$PATH"
export http_proxy="http://192.168.128.1:7897" https_proxy="http://192.168.128.1:7897"

PROF="$HOME/.dsh/profiles/web"
NM="$PROF/node_modules"

echo "=== 已安装 profile 的 node_modules/@deepseek-ai 清单 ==="
ls "$NM/@deepseek-ai" 2>/dev/null | head -40
echo "总数: $(ls "$NM/@deepseek-ai" 2>/dev/null | wc -l)"

echo
echo "=== 对 vendor 的每个 @deepseek-ai 具名导入做存在性核对 ==="
cd /mnt/d/Dev/dsh-remote-cluster

node --input-type=module -e '
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const NM = process.env.HOME + "/.dsh/profiles/web/node_modules";
const req = createRequire(NM + "/x.js");

const targets = [];
for (const v of readdirSync("vendor")) {
  const lib = join("vendor", v, "lib");
  if (!existsSync(lib)) continue;
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name);
      if (e.isDirectory()) { if (e.name !== "types") walk(fp); }
      else if (e.name.endsWith(".js")) {
        const src = readFileSync(fp, "utf8");
        for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"(@deepseek-ai\/[^"]+)"/gm)) {
          const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
          for (const n of names) targets.push([m[2], n, fp]);
        }
      }
    }
  };
  walk(lib);
}

// 按包归并
const byPkg = new Map();
for (const [pkg, name, fp] of targets) {
  if (!byPkg.has(pkg)) byPkg.set(pkg, new Map());
  const nm = byPkg.get(pkg);
  if (!nm.has(name)) nm.set(name, new Set());
  nm.get(name).add(fp);
}

let bad = 0;
for (const [pkg, names] of [...byPkg].sort()) {
  let real = null;
  try { real = req.resolve(pkg); } catch { real = null; }
  console.log("\n### " + pkg + (real ? "   -> " + real.replace(NM + "/", "") : "   [无法解析]"));
  if (!real) { bad += names.size; for (const n of names.keys()) console.log("   UNRESOLVED " + n); continue; }
  const mod = await import(real);
  const exported = new Set(Object.keys(mod));
  const miss = [];
  for (const n of names.keys()) {
    if (exported.has(n)) console.log("   ok   " + n);
    else { console.log("   MISS " + n); miss.push(n); }
  }
  if (miss.length) { bad += miss.length; console.log("   >>> 该包缺失: " + miss.join(", ")); }
}
console.log("\n=== 缺失符号总数: " + bad + " ===");
' 2>&1

echo
echo "=== 对照：源码树里这些包的真实导出 ==="
cd /mnt/d/Dev/dsh-remote-cluster
for p in dsh-native-command dsh-output-retention dsh-util-values dsh-credentials dsh-typert-protocol dsh-settings; do
  f="/mnt/d/Dev/deepseek-harness/packages"
  hit=$(find "$f" -maxdepth 4 -type d -name "$p" 2>/dev/null | head -1)
  printf "%-24s " "$p"
  if [ -n "$hit" ]; then echo "$hit"; else echo "(未找到)"; fi
done
