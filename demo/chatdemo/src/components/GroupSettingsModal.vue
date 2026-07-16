<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useGroupManager } from '../composables/useGroupManager';
import type { GroupMember } from '../services/bizTypes';

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ close: []; disbanded: []; memberKicked: [] }>();

const { currentGroup, renameGroup, kickMember, disbandGroup, fetchGroupInfo, getNickname } = useGroupManager();

const newName = ref('');
const members = ref<GroupMember[]>([]);
const saving = ref(false);

onMounted(async () => {
  await fetchGroupInfo(props.groupId);
  if (currentGroup.value) {
    newName.value = currentGroup.value.name;
    members.value = currentGroup.value.members || [];
  }
});

const onRename = async () => {
  if (!newName.value.trim() || newName.value.trim() === currentGroup.value?.name) return;
  saving.value = true;
  await renameGroup(props.groupId, newName.value.trim());
  saving.value = false;
};

const onKick = async (targetUid: string) => {
  if (!confirm(`确定将 ${getNickname(targetUid)} 移出群聊？`)) return;
  const ok = await kickMember(props.groupId, targetUid);
  if (ok) {
    members.value = members.value.filter(m => m.uid !== targetUid);
    emit('memberKicked');
  }
};

const onDisband = async () => {
  if (!confirm('确定解散该群？此操作不可撤销！')) return;
  const ok = await disbandGroup(props.groupId);
  if (ok) {
    emit('disbanded');
  }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h3>群设置</h3>

      <div class="section">
        <label>群名称</label>
        <div class="rename-row">
          <input type="text" v-model="newName" />
          <button class="btn-save" @click="onRename" :disabled="saving || newName.trim() === currentGroup?.name">
            {{ saving ? '保存中' : '保存' }}
          </button>
        </div>
      </div>

      <div class="section">
        <label>成员管理</label>
        <div class="member-list">
          <div class="member-item" v-for="m in members" :key="m.uid">
            <div class="member-name">
              {{ getNickname(m.uid) }}
              <span class="badge-owner" v-if="m.role === 1">群主</span>
            </div>
            <div class="member-uid">{{ m.uid }}</div>
            <button class="btn-kick" v-if="m.role !== 1" @click="onKick(m.uid)">移出</button>
          </div>
        </div>
      </div>

      <div class="danger-zone">
        <button class="btn-disband" @click="onDisband">解散群聊</button>
      </div>

      <button class="btn-cancel" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 1100;
}
.modal-card {
  width: 440px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
  background: var(--bg-card); border-radius: 12px; padding: 32px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
h3 { font-size: 20px; font-weight: 700; margin-bottom: 24px; text-align: center; color: var(--text); }
.section { margin-bottom: 20px; }
.section label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.rename-row { display: flex; gap: 8px; }
.rename-row input {
  flex: 1; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 14px; outline: none;
}
.rename-row input:focus { border-color: var(--primary); }
.btn-save {
  height: 40px; padding: 0 18px; border-radius: 8px; background: var(--primary); color: #fff;
  font-size: 13px; font-weight: 500; border: none; cursor: pointer; white-space: nowrap;
}
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.member-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.member-item {
  display: flex; align-items: center; justify-content: space-between; padding: 8px 12px;
  border-radius: 8px; background: var(--bg);
}
.member-name { font-size: 14px; font-weight: 500; color: var(--text); display: flex; align-items: center; gap: 6px; }
.member-uid { font-size: 11px; color: var(--text-muted); flex: 1; margin-left: 12px; }
.badge-owner { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fbbf24; color: #92400e; font-weight: 600; }
.btn-kick {
  height: 28px; padding: 0 12px; border-radius: 6px; background: transparent; color: #ef4444;
  border: 1px solid rgba(239,68,68,0.3); font-size: 12px; cursor: pointer; margin-left: 8px;
}
.btn-kick:hover { background: rgba(239,68,68,0.08); }
.danger-zone { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); }
.btn-disband {
  width: 100%; height: 44px; border-radius: 8px; background: #ef4444; color: #fff;
  font-size: 15px; font-weight: 600; border: none; cursor: pointer;
}
.btn-disband:hover { background: #dc2626; }
.btn-cancel {
  width: 100%; height: 40px; margin-top: 8px; border-radius: 8px; background: transparent;
  color: var(--text-muted); font-size: 13px; border: none; cursor: pointer;
}
.btn-cancel:hover { color: var(--text); }
</style>
