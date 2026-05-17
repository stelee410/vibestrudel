#!/bin/bash
# VibeStrudel 一键部署 — 把 timestamp 烧进 index.html, rsync 上去, 重启 caddy
# 用法:
#   bash deploy.sh                  # 同步 index.html + themes 到 server (轻量, 默认)
#   bash deploy.sh --bundle         # 顺便重建并同步 vendor/strudel bundle
#   bash deploy.sh --server         # 顺便重建并同步 server/ + 重建 docker app
#   bash deploy.sh --bundle --server  # 全套
#
# 关键: 每次跑都用当前 unix timestamp 替换 index.html 里的 __BUILD_TS__ 占位符
# 所有 <script>/<link>/import 都带 ?v=${TS}, 浏览器缓存自动失效.
set -e
cd "$(dirname "$0")"

REMOTE="root@8.217.251.36"
REMOTE_DIR="/opt/vibestrudel"

DO_BUNDLE=0
DO_SERVER=0
for arg in "$@"; do
  case "$arg" in
    --bundle) DO_BUNDLE=1 ;;
    --server) DO_SERVER=1 ;;
  esac
done

# 0) 如果要 build bundle, 跑 build.sh (内部会 verify 防降级)
if [ "$DO_BUNDLE" = "1" ]; then
  echo "==> Building strudel bundle..."
  (cd vendor/strudel-build && bash build.sh)
fi

# 1) 算两个版本号:
#   __BUILD_TS__: 当前 unix 秒, 每次 deploy 都变 — 用于 HTML/CSS/i18n 这类轻量文件
#   __BUNDLE_VER__: vendor/strudel/index.mjs 的 sha256 前 12 位, 内容没变就不变 —
#                  浏览器继续用 24h 缓存, 1.2MB 大包不重下
TS=$(date +%s)
BUNDLE_VER=$(shasum -a 256 vendor/strudel/index.mjs | awk '{print $1}' | head -c 12)
TMP_HTML=$(mktemp)
sed -e "s/__BUILD_TS__/${TS}/g" -e "s/__BUNDLE_VER__/${BUNDLE_VER}/g" index.html > "$TMP_HTML"
echo "==> BUILD_TS=${TS}  BUNDLE_VER=${BUNDLE_VER}"

# 2) rsync index.html (替换后) + landing.html + themes/ + assets/
rsync -az "$TMP_HTML" "${REMOTE}:${REMOTE_DIR}/index.html"
rsync -az landing.html "${REMOTE}:${REMOTE_DIR}/landing.html"
rsync -az themes/ "${REMOTE}:${REMOTE_DIR}/themes/"
# assets/ — control-icons SVG 等小图标 (~300KB, control 模式必需)
[ -d assets ] && rsync -az --delete assets/ "${REMOTE}:${REMOTE_DIR}/assets/"
rm -f "$TMP_HTML"

# 3) 视参数同步 bundle / server
if [ "$DO_BUNDLE" = "1" ]; then
  echo "==> rsync bundle..."
  rsync -az vendor/strudel/index.mjs "${REMOTE}:${REMOTE_DIR}/vendor/strudel/index.mjs"
fi

if [ "$DO_SERVER" = "1" ]; then
  echo "==> rsync server/..."
  rsync -az --exclude 'node_modules' --exclude '.dockerignore' server/ "${REMOTE}:${REMOTE_DIR}/server/"
  echo "==> rebuild docker app..."
  ssh "$REMOTE" "cd ${REMOTE_DIR} && docker compose build app && docker compose up -d app"
fi

# 4) 重启 vibe-caddy — 因为单文件 bind-mount 被 rsync rename 后, 容器看的是旧 inode
echo "==> restart vibe-caddy (refresh bind-mounts)..."
ssh "$REMOTE" "docker restart vibe-caddy" >/dev/null

echo
echo "✓ Deployed"
echo "  HTML/CSS ver:  ${TS}"
echo "  Bundle ver:    ${BUNDLE_VER}  (内容不变的话浏览器不会重下)"
echo "  https://vibe.linkyun.co/?v=${TS}"
