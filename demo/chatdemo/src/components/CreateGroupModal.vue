<script setup lang="ts">
import { ref } from 'vue';
import { useGroupManager } from '../composables/useGroupManager';

const emit = defineEmits<{
  close: [];
  created: [groupId: string];
}>();

const { createGroup, loading, error } = useGroupManager();

const groupName = ref('');
const nickname = ref('');

const onSubmit = async () => {
  if (!groupName.value.trim() || !nickname.value.trim()) return;
  const result = await createGroup(groupName.value.trim(), nickname.value.trim());
  if (result) {
    alert(`群聊创建成功！\n房间号：${result.room_number}`);
    emit('created', result.group_id);
  }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h3>创建群聊</h3>
      <div class="field">
        <label>群名称</label>
        <input type="text" placeholder="输入项目组名称" v-model="groupName" :disabled="loading" />
      </div>
      <div class="field">
        <label>我的群昵称</label>
        <input type="text" placeholder="输入您的真实姓名" v-model="nickname" :disabled="loading" />
      </div>
      <div class="hint">群ID将自动生成，创建后您将自动成为群主</div>
      <p class="error-msg" v-if="error">{{ error }}</p>
      <button class="btn-primary" :disabled="loading || !groupName.trim() || !nickname.trim()" @click="onSubmit">
        {{ loading ? '创建中...' : '创建群聊' }}
      </button>
      <button class="btn-cancel" @click="emit('close')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-card {
  width: 400px; max-width: 90vw; background: var(--bg-card); border-radius: 12px;
  padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
h3 { font-size: 20px; font-weight: 700; margin-bottom: 24px; text-align: center; color: var(--text); }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.field input {
  width: 100%; height: 44px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 14px; outline: none;
  transition: border-color 0.2s;
}
.field input:focus { border-color: var(--primary); }
.hint { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; text-align: center; }
.error-msg { color: #ef4444; font-size: 13px; margin-bottom: 12px; text-align: center; }
.btn-primary {
  width: 100%; height: 44px; border-radius: 8px; background: var(--primary); color: #fff;
  font-size: 15px; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s;
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel {
  width: 100%; height: 40px; margin-top: 8px; border-radius: 8px; background: transparent;
  color: var(--text-muted); font-size: 13px; border: none; cursor: pointer;
}
.btn-cancel:hover { color: var(--text); }
</style>
