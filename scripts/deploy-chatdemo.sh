#!/usr/bin/env bash
# 构建 chatdemo 前端并同步到 nginx 部署目录 (docker/chatdemo)。
# nginx 通过 docker-compose.yml 将 ./docker/chatdemo 只读挂载为服务目录，
# 因此每次改完前端都必须构建 + 同步，改动才会上线。
set -euo pipefail

# 定位仓库根：脚本在 <root>/scripts 下
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC_DIR="$ROOT_DIR/demo/chatdemo"
DIST_DIR="$SRC_DIR/dist"
DEST_DIR="$ROOT_DIR/docker/chatdemo"

echo "==> 构建 chatdemo ($SRC_DIR)"
cd "$SRC_DIR"
if [ ! -d node_modules ]; then
    echo "==> 未发现 node_modules，先安装依赖"
    npm install
fi
npm run build

if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "构建失败：未生成 $DIST_DIR/index.html" >&2
    exit 1
fi

echo "==> 同步产物到部署目录 ($DEST_DIR)"
mkdir -p "$DEST_DIR/assets"
# 清空旧 assets，避免带哈希的旧文件残留
rm -f "$DEST_DIR"/assets/*
cp -f "$DIST_DIR/index.html" "$DEST_DIR/index.html"
[ -f "$DIST_DIR/logo.png" ] && cp -f "$DIST_DIR/logo.png" "$DEST_DIR/logo.png"
cp -f "$DIST_DIR"/assets/* "$DEST_DIR"/assets/

echo "==> 完成。部署目录当前引用："
grep -o 'assets/[^"]*' "$DEST_DIR/index.html" || true

echo ""
echo "nginx 为只读挂载静态文件，无需重启容器。"
echo "浏览器请硬刷新清缓存：Ctrl+Shift+R (Mac: Cmd+Shift+R)"
