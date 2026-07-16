#!/usr/bin/env bash
# 恢复 biz-backend 数据库备份
# 用法: ./restore-biz-db.sh [备份文件.gz]
#       不带参数时列出所有可用备份供选择
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$ROOT_DIR/docker/biz-data/biz.db"
BACKUP_DIR="$ROOT_DIR/docker/biz-data/backups"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "备份目录不存在: $BACKUP_DIR"
    exit 1
fi

list_backups() {
    echo "可用备份:"
    echo "----------------------------------------"
    ls -1th "$BACKUP_DIR"/biz_*.db.gz 2>/dev/null | head -30 | nl -w2 -s'. '
    echo "----------------------------------------"
}

if [ $# -eq 0 ]; then
    list_backups
    echo ""
    read -p "输入编号 (或直接输入文件路径) 来恢复: " CHOICE
    if [[ "$CHOICE" =~ ^[0-9]+$ ]]; then
        FILES=($(ls -1t "$BACKUP_DIR"/biz_*.db.gz 2>/dev/null))
        IDX=$((CHOICE - 1))
        if [ "$IDX" -lt 0 ] || [ "$IDX" -ge "${#FILES[@]}" ]; then
            echo "无效编号"
            exit 1
        fi
        BACKUP_FILE="${FILES[$IDX]}"
    else
        BACKUP_FILE="$CHOICE"
    fi
else
    BACKUP_FILE="$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "备份文件不存在: $BACKUP_FILE"
    exit 1
fi

echo "即将恢复: $(basename $BACKUP_FILE)"
echo "           创建时间: $(stat -c %y "$BACKUP_FILE" 2>/dev/null || stat -f %Sm "$BACKUP_FILE")"
echo "           大小: $(du -h "$BACKUP_FILE" | cut -f1)"
echo ""
echo "⚠️  当前数据库将被覆盖！"
read -p "确认恢复? (输入 yes 继续): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "已取消"
    exit 0
fi

# 先额外备份当前数据库
if [ -f "$DB_PATH" ]; then
    SAFE_BACKUP="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).db.gz"
    echo "先备份当前数据库到: $SAFE_BACKUP"
    sqlite3 "$DB_PATH" ".backup /tmp/restore_tmp.db" && gzip -c /tmp/restore_tmp.db > "$SAFE_BACKUP"
    rm -f /tmp/restore_tmp.db
fi

# 恢复
echo "恢复中..."
gunzip -c "$BACKUP_FILE" > /tmp/restore_target.db
# 关闭 WAL 再替换，避免文件不一致
docker compose -f "$ROOT_DIR/docker-compose.yml" stop biz-backend 2>/dev/null || true
cp /tmp/restore_target.db "$DB_PATH"
rm -f "$DB_PATH"-wal "$DB_PATH"-shm /tmp/restore_target.db
docker compose -f "$ROOT_DIR/docker-compose.yml" start biz-backend 2>/dev/null || true

echo "恢复完成！biz-backend 已重启。"
