<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PinnedMessage } from '../services/bizTypes'
import { MessageContentType } from 'wukongimjssdk'

const props = defineProps<{
  pinnedMessages: PinnedMessage[]
  getNickname: (uid: string) => string
  currentUid: string
  isOwner: boolean
}>()

const emit = defineEmits<{
  locate: [clientMsgNo: string]
  unpin: [msg: PinnedMessage]
}>()

const collapsed = ref(false)

const toggleCollapse = () => {
  collapsed.value = !collapsed.value
}

const preview = (msg: PinnedMessage): string => {
  if (msg.message_type === MessageContentType.image) return '[图片]'
  const text = msg.content_preview || ''
  if (text.startsWith('{file:')) {
    try {
      const inner = text.slice(6, text.lastIndexOf('}') + 1)
      const info = JSON.parse(inner)
      return `[文件] ${info.name || ''}`
    } catch { return '[文件]' }
  }
  if (text.startsWith('{voice:')) return '[语音]'
  return text.length > 50 ? text.slice(0, 50) + '...' : text
}

const canUnpin = (msg: PinnedMessage) => {
  return msg.pinned_by_uid === props.currentUid || props.isOwner
}
</script>

<template>
  <div class="pinned-card" v-if="pinnedMessages.length > 0">
    <div class="pinned-header" @click="toggleCollapse">
      <div class="pinned-header-left">
        <svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
        <span class="pinned-title">置顶消息</span>
        <span class="pinned-count">{{ pinnedMessages.length }} 条</span>
      </div>
      <svg class="collapse-arrow" :class="{ collapsed }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>
    <div class="pinned-list" v-if="!collapsed">
      <div
        class="pinned-item"
        v-for="msg in pinnedMessages"
        :key="msg.id"
        @click="emit('locate', msg.client_msg_no)"
      >
        <div class="pinned-item-body">
          <span class="pinned-sender">{{ getNickname(msg.from_uid) || msg.from_uid }}:</span>
          <span class="pinned-preview">{{ preview(msg) }}</span>
        </div>
        <button
          class="pinned-unpin-btn"
          v-if="canUnpin(msg)"
          @click.stop="emit('unpin', msg)"
          title="取消置顶"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pinned-card {
  margin: 8px 16px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  flex-shrink: 0;
}

.pinned-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.pinned-header:hover {
  background: var(--bg-elevated);
}

.pinned-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pin-icon {
  color: var(--primary);
}

.pinned-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.pinned-count {
  font-size: 11px;
  color: var(--text-muted);
}

.collapse-arrow {
  color: var(--text-muted);
  transition: transform 0.2s;
}

.collapse-arrow.collapsed {
  transform: rotate(-90deg);
}

.pinned-list {
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
}

.pinned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(0,0,0,0.03);
}

.pinned-item:last-child {
  border-bottom: none;
}

.pinned-item:hover {
  background: var(--bg-elevated);
}

.pinned-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.pinned-sender {
  color: var(--primary);
  font-weight: 600;
  flex-shrink: 0;
}

.pinned-preview {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-unpin-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
  opacity: 0;
  transition: all 0.15s;
}

.pinned-item:hover .pinned-unpin-btn {
  opacity: 0.6;
}

.pinned-unpin-btn:hover {
  opacity: 1 !important;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
</style>
