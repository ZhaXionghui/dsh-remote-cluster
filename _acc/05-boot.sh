#!/usr/bin/env bash
# 05-boot.sh —— 04 因代理抖动失败（remove 成功、add 失败），本脚本带重试复验
set -uo pipefail
LOG=/mnt/d/Dev/dsh-remote-cluster/_acc/05.log
exec > "$LOG" 2>&1
export PATH="$HOME/.npm-global/bin:$PATH"
export http_proxy="http://192.168.128.1:7897" https_proxy="http://192.168.128.1:7897"

PROF="$HOME/.dsh/profiles/web"

echo "=== [1] 安装（最多重试 4 次，规避代理抖动） ==="
cd "$HOME"
OK=0
for i in 1 2 3 4; do
  echo "--- 尝试 $i ---"
  timeout 900 dsh plugin --profile web add "file:/mnt/d/Dev/dsh-remote-cluster" 2>&1 | tail -8
  rc=${PIPESTATUS[0]}
  echo "add rc=$rc"
  if node -e "const b=require('$PROF/package.json')['dsh']?.profile?.bundles||[];process.exit(b.includes('dsh-remote-cluster')?0:1)"; then
    echo "bundles 已含 dsh-remote-cluster"; OK=1; break
  fi
  echo "未完成，5s 后重试"; sleep 5
done
echo "安装成功标志 OK=$OK"

echo
echo "=== [2] 六个 id 合成情况 ==="
timeout 300 dsh --profile web --dump-config > /tmp/c5.yml 2>/tmp/c5.err
echo "dump rc=$?  行数=$(wc -l < /tmp/c5.yml)"
[ -s /tmp/c5.err ] && { echo "--- dump stderr ---"; head -10 /tmp/c5.err; }
MISS=0
for id in remote-hosts remote-hosts-ssh remote-host-controller tool-remote-host better-sidebar ui-remote-host; do
  n=$(grep -c "^ *- id: $id\b" /tmp/c5.yml)
  printf "  %-26s %s\n" "$id" "$n"
  [ "$n" -ge 1 ] || MISS=$((MISS+1))
done
echo "缺失 id 数: $MISS"

echo
echo "=== [3] 六行是否都指向我们的 vendor ==="
grep -c "dsh-remote-cluster/vendor" /tmp/c5.yml

echo
echo "=== [4] 真实启动（--no-open，exit 124 = 服务器存活） ==="
cd "$HOME"
timeout 45 dsh web --no-open > /tmp/b5.log 2>&1
rc=$?
echo "boot rc=$rc"
echo "--- 输出前 25 行 ---"
head -25 /tmp/b5.log
echo "--- 致命错误扫描 ---"
grep -nE "did not activate|failed to import|does not provide an export|Cannot find (module|package)|ERR_MODULE|Error:" /tmp/b5.log || echo "  （无致命错误）"

echo
echo "=== [5] 结论 ==="
if [ "$OK" -eq 1 ] && [ "$MISS" -eq 0 ] && [ "$rc" -eq 124 ]; then
  echo "PASS: 安装成功 + 六 id 全部合成 + 真实 boot 存活"
else
  echo "FAIL: OK=$OK MISS=$MISS boot_rc=$rc"
fi
