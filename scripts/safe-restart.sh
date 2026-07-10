#!/usr/bin/env bash
# 安全重启脚本 — 优雅停止→验证→重启→健康检查。
# 用法: ./scripts/safe-restart.sh
# 必须在 docker-compose.yml 所在目录运行。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

SERVICES=("wk-node1" "wk-node2" "wk-node3")
GRACE_PERIOD=120

echo "=== 悟空IM 安全重启 ==="
echo ""

# Step 1: 优雅停止
echo "=== [1/4] 优雅停止节点 (grace=${GRACE_PERIOD}s) ==="
docker-compose stop -t "$GRACE_PERIOD" "${SERVICES[@]}"

echo ""
echo "=== [2/4] 验证节点状态 ==="
ALL_STOPPED=true
for svc in "${SERVICES[@]}"; do
    full_name="wukongim-${svc}-1"
    status="$(docker inspect -f '{{.State.Status}}' "$full_name" 2>/dev/null || echo "not found")"
    echo "  $svc: $status"
    if [ "$status" != "exited" ]; then
        ALL_STOPPED=false
    fi
done

if [ "$ALL_STOPPED" = false ]; then
    echo "警告: 部分节点未正常退出，等待额外 10s ..."
    sleep 10
fi

# Step 3: 启动
echo ""
echo "=== [3/4] 启动节点 ==="
docker-compose up -d "${SERVICES[@]}"

# Step 4: 等待健康
echo ""
echo "=== [4/4] 等待节点就绪 ==="
MAX_WAIT=90
for svc in "${SERVICES[@]}"; do
    full_name="wukongim-${svc}-1"
    echo -n "  等待 $svc..."
    for i in $(seq 1 $MAX_WAIT); do
        health="$(docker inspect -f '{{.State.Health.Status}}' "$full_name" 2>/dev/null || echo "starting")"
        if [ "$health" = "healthy" ]; then
            echo " OK ($((i))s)"
            break
        fi
        if [ "$i" -eq "$MAX_WAIT" ]; then
            echo " 超时 (状态: $health)"
        fi
        sleep 1
    done
done

echo ""
echo "=== 安全重启完成 ==="
docker-compose ps --format "table {{.Name}}\t{{.Status}}"
