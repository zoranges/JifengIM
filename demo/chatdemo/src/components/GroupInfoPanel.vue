<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useGroupManager } from '../composables/useGroupManager';
import { authStore } from '../services/authStore';
import APIClient from '../services/APIClient';
import type { GroupMember } from '../services/bizTypes';

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ close: []; openSettings: []; invite: [] }>();

const uid = authStore.uid;
const { currentGroup, memberNicknames, groupOwnerUid, isOwner, fetchGroupInfo, setNickname, leaveGroup, getNickname } = useGroupManager();

const members = ref<GroupMember[]>([]);
const onlineMembers = reactive(new Set<string>());
let onlineTimer: ReturnType<typeof setInterval> | null = null;
const editingNickname = ref(false);
const newNickname = ref('');

const fetchOnlineStatus = async () => {
    const uids = members.value.map(m => m.uid)
    if (uids.length === 0) return
    try {
        const statuses = await APIClient.shared.post('/user/onlinestatus', uids) as Array<{uid: string, device_flag: number, online: number}>
        onlineMembers.clear()
        if (statuses) {
            for (const s of statuses) {
                if (s.online === 1) onlineMembers.add(s.uid)
            }
        }
    } catch { /* keep previous */ }
}

const startOnlinePolling = () => {
    stopOnlinePolling()
    fetchOnlineStatus()
    onlineTimer = setInterval(fetchOnlineStatus, 15000)
}

const stopOnlinePolling = () => {
    if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null }
    onlineMembers.clear()
}

const sortedMembers = computed(() => {
    const list = [...members.value]
    list.sort((a, b) => {
        // owner first
        if (a.role === 1) return -1
        if (b.role === 1) return 1
        // online first
        const aOnline = onlineMembers.has(a.uid) ? 1 : 0
        const bOnline = onlineMembers.has(b.uid) ? 1 : 0
        return bOnline - aOnline
    })
    return list
})

onMounted(async () => {
  await fetchGroupInfo(props.groupId);
  if (currentGroup.value?.members) {
    members.value = currentGroup.value.members;
  }
  startOnlinePolling();
});

onUnmounted(() => {
    stopOnlinePolling()
})

watch(() => props.groupId, async (newId) => {
  if (newId) {
    await fetchGroupInfo(newId);
    if (currentGroup.value?.members) {
      members.value = currentGroup.value.members;
    }
    startOnlinePolling();
  }
});

const onSaveNickname = async () => {
  if (!newNickname.value.trim()) return;
  const ok = await setNickname(props.groupId, newNickname.value.trim());
  if (ok) {
    editingNickname.value = false;
    newNickname.value = '';
    await fetchGroupInfo(props.groupId);
    if (currentGroup.value?.members) {
      members.value = currentGroup.value.members;
    }
  }
};

const onLeave = async () => {
  if (!confirm('确定退出该群？')) return;
  const ok = await leaveGroup(props.groupId);
  if (ok) emit('close');
};
</script>

<template>
  <div class="panel">
    <div class="panel-header">
      <h3>群信息</h3>
      <button class="close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="panel-body" v-if="currentGroup">
      <div class="group-hero">
        <div class="hero-avatar">{{ currentGroup.name.charAt(0) }}</div>
        <div class="hero-name">{{ currentGroup.name }}</div>
        <div class="hero-id">ID: {{ currentGroup.id }}</div>
        <div class="hero-room" v-if="(currentGroup as any).room_number">房间号: {{ (currentGroup as any).room_number }}</div>
      </div>

      <div class="section">
        <div class="section-title">
          <span>成员 ({{ members.length }})</span>
          <span class="online-summary" v-if="onlineMembers.size > 0">{{ onlineMembers.size }} 在线</span>
          <div class="title-actions">
            <button class="link-btn" v-if="isOwner" @click="emit('invite')">邀请成员</button>
            <button class="link-btn" v-if="isOwner" @click="emit('openSettings')">管理</button>
          </div>
        </div>

        <div class="member-list">
          <div class="member-item" v-for="m in sortedMembers" :key="m.uid">
            <div class="member-avatar" :class="{ online: onlineMembers.has(m.uid) }">
              {{ getNickname(m.uid).charAt(0) || m.uid.charAt(0) }}
              <span class="status-dot" :class="onlineMembers.has(m.uid) ? 'online' : 'offline'"></span>
            </div>
            <div class="member-info">
              <div class="member-name">
                {{ getNickname(m.uid) }}
                <span class="owner-badge" v-if="m.role === 1">群主</span>
                <span class="me-badge" v-if="m.uid === uid">我</span>
              </div>
              <div class="member-uid">
                {{ m.uid }}
                <span class="status-text" :class="onlineMembers.has(m.uid) ? 'online' : 'offline'">
                  {{ onlineMembers.has(m.uid) ? '在线' : '离线' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">我的群昵称</div>
        <div v-if="!editingNickname">
          <div class="nickname-display">
            <span>{{ memberNicknames[uid] || '(未设置)' }}</span>
            <button class="link-btn" @click="editingNickname = true; newNickname = memberNicknames[uid] || ''">修改</button>
          </div>
        </div>
        <div class="edit-row" v-else>
          <input type="text" v-model="newNickname" placeholder="输入昵称" @keyup.enter="onSaveNickname" />
          <button class="btn-small" @click="onSaveNickname">保存</button>
          <button class="btn-small btn-ghost" @click="editingNickname = false">取消</button>
        </div>
      </div>

      <div class="section actions">
        <button class="btn-danger" v-if="!isOwner" @click="onLeave">退出群聊</button>
        <span class="hint" v-else>群主不能直接退出，请在设置中解散群</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  width: 320px; flex-shrink: 0; background: var(--bg-card); border-left: 1px solid var(--border);
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.panel-header h3 { font-size: 15px; font-weight: 600; color: var(--text); }
.close-btn {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; border: none; background: transparent; color: var(--text-muted); cursor: pointer;
}
.close-btn:hover { background: var(--bg-elevated); color: var(--text); }
.panel-body { flex: 1; overflow-y: auto; padding: 20px; }
.group-hero { text-align: center; margin-bottom: 24px; }
.hero-avatar {
  width: 64px; height: 64px; border-radius: 16px; background: var(--primary);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 700; margin: 0 auto 12px;
}
.hero-name { font-size: 18px; font-weight: 700; color: var(--text); }
.hero-id { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.hero-room { font-size: 13px; color: var(--text); margin-top: 2px; font-weight: 500; }
.title-actions { display: flex; gap: 8px; }
.section { margin-bottom: 20px; }
.section-title { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px; }
.link-btn { font-size: 12px; color: var(--primary); background: none; border: none; cursor: pointer; }
.link-btn:hover { text-decoration: underline; }
.member-list { display: flex; flex-direction: column; gap: 8px; }
.member-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; }
.member-item:hover { background: var(--bg-elevated); }
.member-avatar {
  width: 36px; height: 36px; border-radius: 50%; background: var(--bg-elevated);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0;
  position: relative;
}
.member-avatar.online {
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
}
.status-dot {
  position: absolute; bottom: -1px; right: -1px;
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid var(--bg-card);
}
.status-dot.online { background: #22c55e; }
.status-dot.offline { background: #9ca3af; }
.member-name { font-size: 14px; font-weight: 500; color: var(--text); display: flex; align-items: center; gap: 6px; }
.member-uid { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.status-text { font-size: 10px; font-weight: 500; }
.status-text.online { color: #22c55e; }
.status-text.offline { color: #9ca3af; }
.online-summary { font-size: 11px; font-weight: 500; color: #22c55e; margin-left: 4px; }
.owner-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fbbf24; color: #92400e; font-weight: 600; }
.me-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--primary); color: #fff; }
.nickname-display { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; font-size: 14px; color: var(--text); }
.edit-row { display: flex; gap: 8px; }
.edit-row input {
  flex: 1; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 13px; outline: none;
}
.edit-row input:focus { border-color: var(--primary); }
.btn-small {
  height: 36px; padding: 0 14px; border-radius: 6px; background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 500; border: none; cursor: pointer; white-space: nowrap;
}
.btn-ghost { background: transparent; color: var(--text-muted); }
.btn-ghost:hover { color: var(--text); }
.actions { text-align: center; }
.btn-danger {
  width: 100%; height: 40px; border-radius: 8px; background: transparent; color: #ef4444;
  border: 1px solid rgba(239,68,68,0.3); font-size: 14px; cursor: pointer;
}
.btn-danger:hover { background: rgba(239,68,68,0.08); }
.hint { font-size: 12px; color: var(--text-muted); }
</style>
