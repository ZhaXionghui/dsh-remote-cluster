// 精确区分 vendor/ 下的两类模块引用：
//   A. 真正顶层 ESM `import ... from "x"` —— 由 Node ESM loader 解析 → 必须能落到 node_modules
//   B. `require("x")`（客户端 bundle 经 __ModuleLoader__ 注入的 shim）→ 无需声明
//
// 判据：所有 client*.js 的顶层 import 计数为 0，全走 require shim。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PUB = "D:/Dev/.pubdsh/pkgs";
const published = new Set();
for (const d of ["dsh-base", "dsh-web-app"]) {
  const nm = join(PUB, d, "node_modules", "@deepseek-ai");
  if (!existsSync(nm)) continue;
  for (const n of readdirSync(nm)) published.add(n);
}

const selfDeps = new Set(Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {}));

const statics = new Map();
const requires = new Map();
const add = (map, dep, v) => {
  if (dep.startsWith("node:") || dep === "module") return;
  if (!map.has(dep)) map.set(dep, new Set());
  map.get(dep).add(v);
};

for (const v of readdirSync("vendor")) {
  const lib = join("vendor", v, "lib");
  if (!existsSync(lib)) continue;
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith(".js")) {
        const src = readFileSync(fp, "utf8");
        // 只认真正位于行首的 ESM import 语句（multiline import 的续行以 from "x" 收尾）
        for (const m of src.matchAll(/^import\s[^\n]*?from\s+"(@?[^"./][^"]*)"/gm)) add(statics, m[1], v);
        for (const m of src.matchAll(/^import\s+"(@?[^"./][^"]*)"/gm)) add(statics, m[1], v);
        for (const m of src.matchAll(/\brequire\("(@?[^"./][^"]*)"\)/g)) add(requires, m[1], v);
      }
    }
  };
  walk(lib);
}

console.log("=== A. 顶层 ESM import（必须能在 node_modules 解析） ===\n");
const mustDeclare = [];
for (const [dep, owners] of [...statics].sort()) {
  let tag, note;
  if (selfDeps.has(dep)) { tag = "OK   "; note = "已声明"; }
  else if (dep === "@deepseek-ai/cordis") { tag = "OK   "; note = "框架 peer（已发布 dsh 提供）"; }
  else if (dep.startsWith("@deepseek-ai/") && published.has(dep.slice("@deepseek-ai/".length))) {
    tag = "OK   "; note = "已发布 dsh 自带";
  } else {
    tag = "MISS "; note = "!!! 未声明且已发布 dsh 无 !!!"; mustDeclare.push([dep, [...owners].sort().join(",")]);
  }
  console.log(`${tag} ${dep.padEnd(40)} [${[...owners].sort().join(", ")}]  ${note}`);
}

console.log("\n=== B. require(...) —— 客户端 shim，无需声明 ===\n");
for (const [dep, owners] of [...requires].sort()) {
  console.log(`SHIM  ${dep.padEnd(40)} [${[...owners].sort().join(", ")}]`);
}

console.log(`\n必须补进 dependencies: ${mustDeclare.length}`);
for (const [d, o] of mustDeclare) console.log(`   - ${d}   <- ${o}`);
