<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { bizClient } from '../services/bizClient'
import { authStore } from '../services/authStore'
import type { UserProfile } from '../services/bizTypes'

const emit = defineEmits<{
  (e: 'directChat', uid: string): void
}>()

const members = ref<UserProfile[]>([])
const departments = ref<string[]>([])
const selectedDept = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    members.value = await bizClient.getMemberDirectory()
    const deptSet = new Set(members.value.map(m => m.department).filter(Boolean))
    departments.value = Array.from(deptSet).sort()
  } catch { /* ignore */ }
  loading.value = false
})

const filteredMembers = computed(() => {
  if (!selectedDept.value) return members.value
  return members.value.filter(m => m.department === selectedDept.value)
})

const roleLabel = (r: string) => {
  const map: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', project_lead: '项目负责人', employee: '员工' }
  return map[r] || r
}

const selectDept = (d: string) => { selectedDept.value = d }

const chatWith = (uid: string) => emit('directChat', uid)
</script>

<template>
  <div class="enterprise-members">
    <div class="em-header">
      <h2>企业通讯录</h2>
      <span class="em-count">{{ members.length }} 人</span>
    </div>

    <div class="dept-filter" v-if="departments.length > 0">
      <button :class="{ active: !selectedDept }" @click="selectDept('')">全部</button>
      <button v-for="d in departments" :key="d" :class="{ active: selectedDept === d }" @click="selectDept(d)">{{ d }}</button>
    </div>

    <div class="em-list" v-if="!loading">
      <div class="member-card" v-for="m in filteredMembers" :key="m.uid" @click="chatWith(m.uid)">
        <div class="member-avatar" :class="{ me: m.uid === authStore.uid }">{{ m.name.charAt(0) }}</div>
        <div class="member-info">
          <div class="member-name">
            {{ m.name }}
            <span v-if="m.uid === authStore.uid" class="me-tag">我</span>
          </div>
          <div class="member-meta">
            <span class="member-dept" v-if="m.department">{{ m.department }}</span>
            <span class="member-pos" v-if="m.position">{{ m.position }}</span>
            <span class="role-tag" :class="'role-' + m.role">{{ roleLabel(m.role) }}</span>
          </div>
        </div>
        <div class="member-action" title="发消息">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>
      <div class="em-empty" v-if="filteredMembers.length === 0">暂无成员</div>
    </div>
    <div class="em-loading" v-else>加载中...</div>
  </div>
</template>

<style scoped>
.enterprise-members {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.em-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 16px 16px 12px;
}

.em-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1d2e;
  margin: 0;
}

.em-count {
  font-size: 12px;
  color: #9ca3af;
}

.dept-filter {
  display: flex;
  gap: 6px;
  padding: 0 16px 12px;
  flex-wrap: wrap;
}

.dept-filter button {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid #e5e7ee;
  background: #f7f8fa;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}

.dept-filter button.active {
  background: #1e3a5f;
  color: #fff;
  border-color: #1e3a5f;
}

.em-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.member-card:hover {
  background: #f7f8fa;
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e5e7ee;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.member-avatar.me {
  background: #dbeafe;
  color: #2563eb;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: #1a1d2e;
  display: flex;
  align-items: center;
  gap: 6px;
}

.me-tag {
  font-size: 10px;
  color: #2563eb;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.member-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  flex-wrap: wrap;
}

.member-dept, .member-pos {
  font-size: 11px;
  color: #9ca3af;
}

.role-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.role-super_admin { background: #fef2f2; color: #dc2626; }
.role-admin { background: #eff6ff; color: #2563eb; }
.role-project_lead { background: #fefce8; color: #ca8a04; }
.role-employee { background: #f0fdf4; color: #16a34a; }

.member-action {
  color: #9ca3af;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.member-card:hover .member-action {
  opacity: 1;
}

.em-empty, .em-loading {
  text-align: center;
  color: #9ca3af;
  padding: 40px 0;
  font-size: 14px;
}

@media (prefers-color-scheme: dark) {
  .em-header h2 { color: #e8eaf0; }
  .dept-filter button { background: #222640; border-color: #2a2e42; color: #9ca3af; }
  .dept-filter button.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .member-card:hover { background: #222640; }
  .member-avatar { background: #2a2e42; color: #9ca3af; }
  .member-avatar.me { background: #1e3a5f; color: #60a5fa; }
  .member-name { color: #e8eaf0; }
  .role-tag { opacity: 0.9; }
}
</style>
