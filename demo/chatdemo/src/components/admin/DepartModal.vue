<script setup lang="ts">
import { ref } from 'vue';
import { bizClient } from '../../services/bizClient';
import type { UserProfile } from '../../services/bizTypes';

const props = defineProps<{ user: UserProfile }>();
const emit = defineEmits<{ close: []; done: [] }>();

const loading = ref(false);
const error = ref('');
const transferLog = ref<any[]>([]);
const done = ref(false);

const submit = async () => {
  if (!confirm(`确定将「${props.user.name}（${props.user.uid}）」标记为离职？\n\n系统将自动：\n- 随机重置该用户密码\n- 转移其群主权限\n- 该用户将无法登录`)) return;
  loading.value = true; error.value = '';
  try {
    const result = await bizClient.departUser(props.user.uid);
    transferLog.value = result.transfer_log || [];
    done.value = true;
  } catch (err: any) {
    error.value = err.response?.data?.error || '操作失败';
  } finally { loading.value = false; }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>标记离职</h3>
        <button class="close-btn" @click="emit(done ? 'done' : 'close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="confirm-text">
          <p>即将将 <strong>{{ user.name }}</strong>（{{ user.uid }}）标记为离职状态。</p>
          <ul>
            <li>密码将被随机重置</li>
            <li>群主权限将自动转移</li>
            <li>该用户将无法登录系统</li>
          </ul>
        </div>

        <div class="transfer-log" v-if="done && transferLog.length > 0">
          <h4>群主转移结果</h4>
          <div v-for="item in transferLog" :key="item.group_id" class="log-item">
            <template v-if="item.action === 'transferred'">
              <span class="log-icon">↗</span>
              {{ item.group_name }}：群主已转移给 {{ item.new_owner }}
            </template>
            <template v-else>
              <span class="log-icon">✕</span>
              {{ item.group_name }}：无成员，已解散
            </template>
          </div>
        </div>
        <div class="transfer-log no-transfer" v-else-if="done">
          <p>该用户不是任何群的群主，无需转移。</p>
        </div>

        <p class="error-msg" v-if="error">{{ error }}</p>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit(done ? 'done' : 'close')">{{ done ? '关闭' : '取消' }}</button>
        <button class="btn-danger" v-if="!done" :disabled="loading" @click="submit">
          {{ loading ? '处理中...' : '确认标记离职' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1001; animation: fadeIn 0.15s; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card { width: 460px; max-width: 90vw; background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h3 { font-size: 18px; font-weight: 700; color: #dc2626; margin: 0; }
.close-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }
.close-btn:hover { background: #f3f4f6; color: #374151; }

.modal-body { padding: 16px 24px 0; }

.confirm-text { font-size: 14px; color: #374151; margin-bottom: 12px; line-height: 1.6; }
.confirm-text ul { padding-left: 18px; margin: 8px 0; }
.confirm-text li { font-size: 13px; color: #6b7280; padding: 2px 0; }

.transfer-log { background: #f7f8fa; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
.transfer-log.no-transfer { background: #f0fdf4; }
.transfer-log h4 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: #1a1d2e; }
.log-item { font-size: 13px; color: #374151; padding: 3px 0; display: flex; align-items: flex-start; gap: 6px; }
.log-icon { flex-shrink: 0; width: 18px; text-align: center; }
.no-transfer p { font-size: 13px; color: #16a34a; margin: 0; }

.error-msg { color: #ef4444; font-size: 13px; text-align: center; padding-top: 8px; }

.modal-footer { display: flex; gap: 8px; padding: 18px 24px; }
.btn-danger { flex: 1; height: 42px; border-radius: 8px; background: #dc2626; color: #fff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; }
.btn-danger:hover:not(:disabled) { background: #b91c1c; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { width: 80px; height: 42px; border-radius: 8px; background: #f3f4f6; color: #6b7280; font-size: 14px; border: none; cursor: pointer; }
.btn-cancel:hover { background: #e5e7ee; }

@media (prefers-color-scheme: dark) {
  .modal-card { background: #1a1d2e; }
  .confirm-text { color: #e8eaf0; }
  .transfer-log { background: #222640; }
  .transfer-log.no-transfer { background: #1c2e1c; }
  .transfer-log h4 { color: #e8eaf0; }
  .log-item { color: #9ca3af; }
  .btn-cancel { background: #2a2e42; color: #9ca3af; }
}
</style>
