#!/usr/bin/env bash
# 04-boot.sh —— 修复后（drop openNativeTerminal + declare zod）的真实启动复验
set -uo pipefail
LOG=/mnt/d/Dev/dsh-remote-cluster/_acc/04.log
exec > "$LOG" 2>&1
export PATH="$HOME/.npm-global/bin:$PATH"
export http_proxy="http://192.168.128.1:7897" https_proxy="http://192.168.128.1:7897"

PROF="$HOME/.dsh/profiles/web"

echo "=== [1] 重装（拉入 zod 与已移除 openNativeTerminal 的代码） ==="
dsh plugin --profile web remove dsh-remote-cluster 2>&1 | tail -2
cd "$HOME"
timeout 900 dsh plugin --profile web add "file:/mnt/d/Dev/dsh-remote-cluster" 2>&1 | tail -12
echo "add rc=$?"

echo
echo "=== [2] 六个 id 合成情况 ==="
timeout 300 dsh --profile web --dump-config > /tmp/c4.yml 2>/tmp/c4.err
echo "dump rc=$?  行数=$(wc -l < /tmp/c4.yml)"
MISS=0
for id in remote-hosts remote-hosts-ssh remote-host-controller tool-remote-host better-sidebar ui-remote-host; do
  n=$(grep -c "^ *- id: $id\b" /tmp/c4.yml)
  printf "  %-26s %s\n" "$id" "$n"
  [ "$n" -ge 1 ] || MISS=$((MISS+1))
done
echo "缺失 id 数: $MISS"
[ -s /tmp/c4.err ] && { echo "--- dump stderr ---"; head -10 /tmp/c4.err; }

echo
echo "=== [3] 真实启动（--no-open，exit 124 = 服务器存活） ==="
cd "$HOME"
timeout 45 dsh web --no-open > /tmp/b4.log 2>&1
rc=$?
echo "boot rc=$rc"
echo "--- 输出前 25 行 ---"
head -25 /tmp/b4.log

echo
echo "--- 致命错误扫描 ---"
grep -nE "did not activate|failed to import|does not provide an export|Cannot find (module|package)|ERR_MODULE|Error:" /tmp/b4.log || echo "  （无致命错误）"

echo
echo "=== [4] 结论 ==="
if [ "$MISS" -eq 0 ] && [ "$rc" -eq 124 ]; then
  echo "PASS: 六个 id 全部合成，且真实 boot 存活（exit 124）"
else
  echo "FAIL: MISS=$MISS boot_rc=$rc"
fi
