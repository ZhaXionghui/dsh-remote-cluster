#!/usr/bin/env bash
# 02-verify.sh —— 0.3.0 端到端验收（WSL / 真实已发布 dsh 0.1.5-rc.3）
# 阶段：重新安装 -> dump-config 六行核对 -> 真实 boot
set -uo pipefail
LOG=/mnt/d/Dev/dsh-remote-cluster/_acc/02.log
exec > "$LOG" 2>&1
export PATH="$HOME/.npm-global/bin:$PATH"
export http_proxy="http://192.168.128.1:7897" https_proxy="http://192.168.128.1:7897"

PROF="$HOME/.dsh/profiles/web"
SIX="remote-hosts remote-hosts-ssh remote-host-controller tool-remote-host better-sidebar ui-remote-host"

echo "=== [0] 基线 ==="
dsh --version

echo
echo "=== [1] 卸载 -> 重装（验证可重复安装） ==="
dsh plugin --profile web remove dsh-remote-cluster 2>&1 | tail -3
cd "$HOME"
timeout 900 dsh plugin --profile web add "file:/mnt/d/Dev/dsh-remote-cluster" 2>&1 | tail -25
echo "add rc=$?"

echo
echo "=== [2] bundles 是否含 dsh-remote-cluster ==="
node -e "const p=require('$PROF/package.json');console.log(JSON.stringify(p['dsh']?.profile?.bundles))"

echo
echo "=== [3] 六个 id 在合成配置中的出现次数 ==="
timeout 300 dsh --profile web --dump-config > /tmp/cfg.yml 2>/tmp/cfg.err
echo "dump rc=$?  行数=$(wc -l < /tmp/cfg.yml)"
if [ -s /tmp/cfg.err ]; then echo "--- dump stderr ---"; head -20 /tmp/cfg.err; fi
MISS=0
for id in $SIX; do
  n=$(grep -c "^ *- id: $id\b" /tmp/cfg.yml)
  printf "  %-26s %s\n" "$id" "$n"
  [ "$n" -ge 1 ] || MISS=$((MISS+1))
done
echo "缺失 id 数: $MISS"

echo
echo "=== [4] 我们这层提供的 6 行是否指向 ./vendor ==="
grep -n "vendor/" /tmp/cfg.yml | head -20

echo
echo "=== [5] 真实启动（--no-open，预期 exit 124 = 存活） ==="
cd "$HOME"
timeout 45 dsh web --no-open > /tmp/boot.log 2>&1
rc=$?
echo "boot rc=$rc  (124 = 服务器存活，符合预期)"
echo "--- boot 输出（前 40 行） ---"
head -40 /tmp/boot.log
echo "--- 是否出现致命错误 ---"
grep -nE "did not activate|failed to import|Cannot find (module|package)|ERR_MODULE" /tmp/boot.log || echo "  （无致命错误）"

echo
echo "=== [6] 结论 ==="
if [ "$MISS" -eq 0 ] && [ "$rc" -eq 124 ]; then echo "PASS: 六个 id 全部合成，且真实 boot 存活"; else echo "FAIL: MISS=$MISS boot_rc=$rc"; fi
