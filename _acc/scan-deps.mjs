// 扫描 vendor/ 下每个 lib 的裸模块导入，逐个核对「已发布 dsh 是否自带」。
// 依据：D:/Dev/.pubdsh/pkgs/{dsh-base,dsh-web-app}/node_modules/@deepseek-ai
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PUB = "D:/Dev/.pubdsh/pkgs";
const available = new Set();
for (const d of ["dsh-base", "dsh-web-app"]) {
  const nm = join(PUB, d, "node_modules", "@deepseek-ai");
  if (!existsSync(nm)) continue;
  for (const n of readdirSync(nm)) available.add(n);
}

const rows = [];
for (const v of readdirSync("vendor")) {
  const lib = join("vendor", v, "lib");
  if (!existsSync(lib)) continue;
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith(".js")) {
        const src = readFileSync(fp, "utf8");
        for (const m of src.matchAll(/from\s+"(@?[^"./][^"]*)"/g)) rows.push([v, fp, m[1]]);
      }
    }
  };
  walk(lib);
}

// 本插件自己声明在 dependencies 里的外部包
const selfDeps = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {}));

const byDep = new Map();
for (const [v, fp, dep] of rows) {
  if (dep.startsWith("node:") || dep === "module") continue;
  if (!byDep.has(dep)) byDep.set(dep, new Set());
  byDep.get(dep).add(v);
}

console.log("=== vendor 裸导入 vs 已发布 dsh 自带情况 ===\n");
let fatal = 0;
const fatals = [];
for (const [dep, owners] of [...byDep].sort()) {
  let tag, note;
  if (dep.startsWith("@deepseek-ai/")) {
    const short = dep.slice("@deepseek-ai/".length);
    if (available.has(short)) { tag = "OK   "; note = "已发布 dsh 自带"; }
    else { tag = "FATAL"; note = "!!! 已发布 dsh 中不存在 !!!"; fatal++; fatals.push(dep); }
  } else if (selfDeps.has(dep)) {
    tag = "EXT  "; note = "本插件 dependencies 已声明";
  } else {
    tag = "FATAL"; note = "!!! 未声明的外部依赖 !!!"; fatal++; fatals.push(dep);
  }
  console.log(`${tag} ${dep.padEnd(42)} [${[...owners].sort().join(", ")}]  ${note}`);
}
console.log(`\n致命缺失: ${fatal}`);
if (fatals.length) console.log("清单: " + fatals.join(", "));

// 同时核对 package.json 声明的依赖是否真的被 vendor 用到
const usedBare = new Set([...byDep.keys()].filter((d) => !d.startsWith("@deepseek-ai/")));
console.log("\n=== package.json dependencies 与 vendor 实际用量的差集 ===");
for (const d of selfDeps) console.log(`  声明 ${d.padEnd(24)} ${usedBare.has(d) ? "被使用" : "!! 未被任何 vendor 文件导入 !!"}`);
for (const d of usedBare) if (!selfDeps.has(d)) console.log(`  使用 ${d.padEnd(24)} !! 未声明 !!`);
