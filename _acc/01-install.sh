#!/usr/bin/env bash
set -uo pipefail
LOG=/mnt/d/Dev/dsh-remote-cluster/_acc/01.log
exec > "$LOG" 2>&1
export PATH="$HOME/.npm-global/bin:$PATH"
export http_proxy="http://192.168.128.1:7897" https_proxy="http://192.168.128.1:7897"

echo "=== WSL dsh 版本 ==="
dsh --version

echo
echo "=== 当前 web profile 状态 ==="
node -e "const p=require(process.env.HOME+'/.dsh/profiles/web/package.json');console.log(JSON.stringify({bundles:p['dsh']?.profile?.bundles,deps:p.dependencies},null,2))"

echo
echo "=== 清理旧的 dsh-remote-cluster ==="
dsh plugin --profile web remove dsh-remote-cluster 2>&1 | tail -3

echo
echo "=== 从本地路径安装 0.3.0 ==="
cd "$HOME"
timeout 600 dsh plugin --profile web add "file:/mnt/d/Dev/dsh-remote-cluster" 2>&1 | tail -30
echo "add rc=$?"

echo
echo "=== 安装后 bundles ==="
node -e "const p=require(process.env.HOME+'/.dsh/profiles/web/package.json');console.log(JSON.stringify({bundles:p['dsh']?.profile?.bundles,deps:p.dependencies},null,2))"
