#!/usr/bin/env bash
# 冷备份脚本 — 在节点停止后将 PebbleDB 数据目录备份到指定位置。
# 用法: ./scripts/backup-pebble-cold.sh <node-data-dir> <backup-dest-dir>
# 示例: ./scripts/backup-pebble-cold.sh docker/dev-cluster/node1 /backup/wukongim
set -euo pipefail

NODE_DIR="${1:?usage: $0 <node-data-dir> <backup-dest-dir>}"
BACKUP_ROOT="${2:?usage: $0 <node-data-dir> <backup-dest-dir>}"

if [ ! -d "$NODE_DIR" ]; then
    echo "错误: 节点数据目录不存在: $NODE_DIR" >&2
    exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/wukongim-${TIMESTAMP}"

echo "==> 冷备份 $NODE_DIR → $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# PebbleDB 子目录
SUBDIRS=("data" "raft" "channellog" "controller-meta" "controller-raft" "raft-snapshots" "controller-raft-snapshots" "logs")

BACKUP_COUNT=0
for dir in "${SUBDIRS[@]}"; do
    src="${NODE_DIR}/${dir}"
    if [ -d "$src" ]; then
        dst="${BACKUP_DIR}/${dir}"
        echo "  备份 $dir ..."
        rsync -a --delete "$src/" "$dst/"
        BACKUP_COUNT=$((BACKUP_COUNT + 1))
    fi
done

if [ $BACKUP_COUNT -eq 0 ]; then
    echo "警告: 未找到任何 PebbleDB 子目录，备份可能无效" >&2
    rm -rf "$BACKUP_DIR"
    exit 1
fi

# 写入备份元信息
cat > "${BACKUP_DIR}/backup.json" <<META
{
  "timestamp": "$TIMESTAMP",
  "source": "$NODE_DIR",
  "subdirs": $BACKUP_COUNT
}
META

echo "==> 备份完成: $BACKUP_DIR ($BACKUP_COUNT 个子目录)"
echo "    大小: $(du -sh "$BACKUP_DIR" | cut -f1)"
