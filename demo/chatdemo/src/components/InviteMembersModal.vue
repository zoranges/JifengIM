<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { bizClient } from '../services/bizClient';
import type { UserProfile } from '../services/bizTypes';

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ close: []; invited: [] }>();

const members = ref<UserProfile[]>([]);
const departments = ref<string[]>([]);
const selectedDept = ref('');
const selectedUids = ref<Set<string>>(new Set());
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    members.value = await bizClient.getMemberDirectory();
    const deptSet = new Set(members.value.map(m => m.department).filter(Boolean));
    departments.value = Array.from(deptSet).sort();
  } catch { /* ignore */ }
});

const filteredMembers = computed(() => {
  if (!selectedDept.value) return members.value;
  return members.value.filter(m => m.department === selectedDept.value);
});

const toggleSelect = (uid: string) => {
  const next = new Set(selectedUids.value);
  if (next.has(uid)) next.delete(uid); else next.add(uid);
  selectedUids.value = next;
};

const invite = async () => {
  if (selectedUids.value.size === 0) { error.value = '请选择要邀请的成员'; return; }
  loading.value = true;
  error.value = '';
  try {
    await bizClient.inviteMembers(props.groupId, Array.from(selectedUids.value));
    emit('invited');
  } catch (err: any) {
    error.value = err.response?.data?.error || '邀请失败';
  } finally { loading.value = false; }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h3>邀请成员加入</h3>

      <div class="dept-bar">
        <button :class="{ active: !selectedDept }" @click="selectedDept = ''">全部</button>
        <button v-for="d in departments" :key="d" :class="{ active: selectedDept === d }" @click="selectedDept = d">{{ d }}</button>
      </div>

      <div class="member-list">
        <div class="member-row" v-for="m in filteredMembers" :key="m.uid" @click="toggleSelect(m.uid)">
          <div class="checkbox" :class="{ checked: selectedUids.has(m.uid) }">
            <svg v-if="selectedUids.has(m.uid)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <span class="m-name">{{ m.name }}</span>
          <span class="m-dept" v-if="m.department">{{ m.department }}</span>
        </div>
        <div class="empty" v-if="filteredMembers.length === 0">暂无可邀请的成员</div>
      </div>

      <p class="error-msg" v-if="error">{{ error }}</p>
      <div class="actions">
        <span class="sel-count">已选 {{ selectedUids.size }} 人</span>
        <button class="btn-primary" :disabled="loading || selectedUids.size === 0" @click="invite">
          {{ loading ? '邀请中...' : '邀请' }}
        </button>
        <button class="btn-cancel" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed } from 'vue';
export default { name: 'InviteMembersModal' };
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-card {
  width: 460px; max-width: 90vw; max-height: 80vh; display: flex; flex-direction: column;
  background: #fff; border-radius: 12px; padding: 28px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
h3 { font-size: 18px; font-weight: 700; margin: 0 0 16px; text-align: center; color: #1a1d2e; }
.dept-bar { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.dept-bar button {
  padding: 4px 10px; border-radius: 12px; font-size: 12px;
  border: 1px solid #e5e7ee; background: #f7f8fa; color: #6b7280; cursor: pointer;
}
.dept-bar button.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }

.member-list { flex: 1; overflow-y: auto; margin-bottom: 16px; }
.member-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 8px;
  border-radius: 8px; cursor: pointer; transition: background 0.15s;
}
.member-row:hover { background: #f7f8fa; }
.checkbox {
  width: 20px; height: 20px; border-radius: 4px; border: 2px solid #d1d5db;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: #1e3a5f;
}
.checkbox.checked { background: #1e3a5f; border-color: #1e3a5f; color: #fff; }
.m-name { font-size: 14px; color: #1a1d2e; flex: 1; }
.m-dept { font-size: 11px; color: #9ca3af; }

.empty { text-align: center; color: #9ca3af; padding: 30px 0; font-size: 14px; }
.error-msg { color: #ef4444; font-size: 13px; text-align: center; margin-bottom: 8px; }
.actions { display: flex; align-items: center; gap: 8px; }
.sel-count { font-size: 12px; color: #9ca3af; margin-right: auto; }
.btn-primary {
  padding: 8px 24px; border-radius: 8px; background: #1e3a5f; color: #fff;
  font-size: 14px; font-weight: 600; border: none; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel {
  padding: 8px 16px; border-radius: 8px; background: transparent;
  color: #6b7280; font-size: 13px; border: none; cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .modal-card { background: #1a1d2e; }
  h3 { color: #e8eaf0; }
  .dept-bar button { background: #222640; border-color: #2a2e42; color: #9ca3af; }
  .dept-bar button.active { background: #3b82f6; }
  .member-row:hover { background: #222640; }
  .m-name { color: #e8eaf0; }
  .btn-cancel { color: #9ca3af; }
}
</style>
