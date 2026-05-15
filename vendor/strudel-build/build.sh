#!/bin/bash
# 重建本地 Strudel + draw 引擎 bundle
# 用法: cd vendor/strudel-build && bash build.sh
# 输出: ../strudel/index.mjs (~1MB)
set -e
cd "$(dirname "$0")"
npm install --silent
npx esbuild entry.mjs --bundle --format=esm --outfile=../strudel/index.mjs --log-level=warning
echo "✓ vendor/strudel/index.mjs 已更新 ($(wc -c < ../strudel/index.mjs | tr -d ' ') bytes)"
# 防降级 — verify 失败就 exit, 阻止后续 deploy
bash "$(dirname "$0")/verify.sh"
