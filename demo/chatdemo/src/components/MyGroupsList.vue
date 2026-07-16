<script setup lang="ts">
import { onMounted } from 'vue'
import { Channel, ChannelTypeGroup } from 'wukongimjssdk'
import type { GroupInfo } from '../services/bizTypes'

const props = defineProps<{
  groups: GroupInfo[]
  uid: string
  loading?: boolean
}>()

const emit = defineEmits<{
  selectGroup: [groupId: string]
  refresh: []
  createGroup: []
  joinGroup: []
}>()

onMounted(() => {
  emit('refresh')
})

const selectGroup = (group: GroupInfo) => {
  emit('selectGroup', group.id)
}

const memberCountText = (group: GroupInfo) => {
  const n = group.member_count
  if (n !== undefined && n >= 0) return `${n} 人`
  if (group.members) return `${group.members.length} 人`
  return ''
}
</script>

<template>
  <div class="my-groups">
    <!-- Loading -->
    <div class="groups-empty" v-if="loading">
      <span>加载中...</span>
    </div>

    <!-- Empty -->
    <div class="groups-empty" v-else-if="!groups || groups.length === 0">
      <div class="empty-icon">
        <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 6" opacity="0.3"/>
          <path d="M16 22h16M16 28h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
        </svg>
      </div>
      <span>暂无加入的群聊</span>
      <span class="empty-hint">创建或加入一个群聊开始聊天</span>
    </div>

    <!-- Group list -->
    <div
      class="group-item"
      v-for="group in groups"
      :key="group.id"
      @click="selectGroup(group)"
    >
      <div class="group-avatar">
        <span>{{ group.name.charAt(0) }}</span>
      </div>
      <div class="group-info">
        <div class="group-name">{{ group.name }}</div>
        <div class="group-meta">
          <span class="group-member-count">{{ memberCountText(group) }}</span>
          <span class="group-role" v-if="group.owner_uid === uid">群主</span>
        </div>
      </div>
      <div class="group-arrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </div>

    <!-- Group actions -->
    <div class="group-actions" v-if="!loading">
      <button class="action-btn action-create" @click="emit('createGroup')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>创建群聊</span>
      </button>
      <button class="action-btn action-join" @click="emit('joinGroup')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13 12H3"/>
        </svg>
        <span>加入群聊</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.my-groups {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 8px;
}

.groups-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.6;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
  margin-bottom: 2px;
}

.group-item:hover {
  background: var(--bg-elevated);
}

.group-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  flex-shrink: 0;
}

.group-avatar span {
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.group-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.group-role {
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(79, 110, 247, 0.1);
  color: var(--primary);
  font-size: 11px;
  font-weight: 500;
}

.group-arrow {
  color: var(--text-muted);
  opacity: 0.4;
  flex-shrink: 0;
}

.group-item:hover .group-arrow {
  opacity: 0.8;
}

.group-actions {
  display: flex;
  gap: 8px;
  padding: 12px 8px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
}

.action-create {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
}

.action-create:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 110, 247, 0.35);
}

.action-join {
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.action-join:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--bg-elevated);
}
</style>
