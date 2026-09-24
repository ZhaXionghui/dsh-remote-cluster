// 探测这 7 个包在 npm 上是否存在（决定修复路线：补声明 vs 必须内联 vendor）
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const pkgs = [
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-credentials",
  "@deepseek-ai/dsh-native-command",
  "@deepseek-ai/dsh-output-retention",
  "@deepseek-ai/dsh-settings",
  "@deepseek-ai/dsh-typert-protocol",
  "@deepseek-ai/dsh-util-values",
  // 对照：确认存在的
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/schemastery",
  "schemastery",
];

for (const p of pkgs) {
  try {
    const { stdout } = await run("npm", ["view", p + "@0.1.5-rc.3", "version"], {
      timeout: 45000,
      shell: true,
    });
    console.log(`OK    ${p.padEnd(42)} ${stdout.trim()}`);
  } catch (e) {
    const msg = String(e.stderr || e.stdout || e.message);
    const code = /E404|is not in this registry/.test(msg) ? "E404" : /E403/.test(msg) ? "E403" : "ERR ";
    console.log(`${code}  ${p.padEnd(42)} ${msg.split("\n").find((l) => l.trim())?.slice(0, 90)}`);
  }
}
