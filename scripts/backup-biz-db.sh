#!/usr/bin/env bash
# biz-backend SQLite 数据库自动备份脚本
# 使用 sqlite3 .backup 安全备份 WAL 模式数据库
# 保留策略: 24小时级 + 7天级 + 4周级
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_PATH="$ROOT_DIR/docker/biz-data/biz.db"
BACKUP_DIR="$ROOT_DIR/docker/biz-data/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_HOURLY=24
RETENTION_DAILY=7
RETENTION_WEEKLY=4

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# --- 备份 ---
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/biz_$TIMESTAMP.db"

if [ ! -f "$DB_PATH" ]; then
    log "ERROR: 数据库文件不存在: $DB_PATH"
    exit 1
fi

log "开始备份: $BACKUP_FILE"
if sqlite3 "$DB_PATH" ".backup $BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"; then
    # 压缩
    gzip -f "$BACKUP_FILE"
    log "备份完成: ${BACKUP_FILE}.gz ($(du -h ${BACKUP_FILE}.gz | cut -f1))"
else
    log "ERROR: 备份失败"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# --- 清理旧备份 ---
cleanup() {
    local pattern="$1" keep="$2" label="$3"
    local files=($(ls -1t "$BACKUP_DIR"/${pattern} 2>/dev/null))
    local count=${#files[@]}
    if [ "$count" -gt "$keep" ]; then
        for ((i=keep; i<count; i++)); do
            log "清理${label}备份: $(basename ${files[$i]})"
            rm -f "${files[$i]}"
        done
    fi
}

# 按文件名中的日期分组处理
HOURLY_FILES=($(ls -1t "$BACKUP_DIR"/biz_*.db.gz 2>/dev/null))
TOTAL=${#HOURLY_FILES[@]}

if [ "$TOTAL" -gt "$RETENTION_HOURLY" ]; then
    # 保留最近 24 个（每小时），对于更早的，每天只保留 1 个，每周只保留 1 个
    for ((i=RETENTION_HOURLY; i<TOTAL; i++)); do
        FILE="${HOURLY_FILES[$i]}"
        BASENAME=$(basename "$FILE")
        DATE_PART=$(echo "$BASENAME" | grep -oP '\d{8}')
        if [ -z "$DATE_PART" ]; then continue; fi

        # 周日保留为周级
        DAY_OF_WEEK=$(date -d "$DATE_PART" +%u 2>/dev/null || echo "0")

        # 检查该天是否已有日级备份
        DAY_FILES=($(ls -1t "$BACKUP_DIR"/biz_${DATE_PART}_*.db.gz 2>/dev/null))

        if [ "$DAY_OF_WEEK" = "7" ]; then
            # 周日: 检查是否已有周级备份
            WEEK_FILES=($(ls -1t "$BACKUP_DIR"/biz_${DATE_PART}_*.db.gz 2>/dev/null))
            WEEK_COUNT=${#WEEK_FILES[@]}
            if [ "$WEEK_COUNT" -le 1 ]; then
                continue  # 保留第一个作为周级
            fi
        elif [ "${#DAY_FILES[@]}" -le 1 ]; then
            continue  # 每天保留第一个作为日级
        fi

        log "清理过期备份: $BASENAME"
        rm -f "$FILE"
    done
fi

# 最终: 超过 4 周的周级备份也删除
OLD_WEEKLY=($(ls -1t "$BACKUP_DIR"/biz_*.db.gz 2>/dev/null))
if [ "${#OLD_WEEKLY[@]}" -gt 60 ]; then
    for ((i=60; i<${#OLD_WEEKLY[@]}; i++)); do
        log "清理超旧备份: $(basename ${OLD_WEEKLY[$i]})"
        rm -f "${OLD_WEEKLY[$i]}"
    done
fi

log "备份完成. 当前备份数: $(ls -1 "$BACKUP_DIR"/biz_*.db.gz 2>/dev/null | wc -l)"
log "备份目录大小: $(du -sh "$BACKUP_DIR" | cut -f1)"
