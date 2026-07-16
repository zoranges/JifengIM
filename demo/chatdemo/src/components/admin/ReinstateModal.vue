<script setup lang="ts">
import { ref } from 'vue';
import { bizClient } from '../../services/bizClient';
import type { UserProfile } from '../../services/bizTypes';

const props = defineProps<{ user: UserProfile }>();
const emit = defineEmits<{ close: []; done: [] }>();

const newPassword = ref('');
const showPassword = ref(false);
const loading = ref(false);
const error = ref('');
const pwdRef = ref<HTMLInputElement | null>(null);

const submit = async () => {
  if (!newPassword.value || newPassword.value.length < 6) { error.value = '密码至少6位'; return; }
  loading.value = true; error.value = '';
  try {
    await bizClient.reinstateUser(props.user.uid, newPassword.value);
    emit('done');
  } catch (err: any) {
    error.value = err.response?.data?.error || '恢复失败';
  } finally { loading.value = false; }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>恢复离职用户</h3>
        <button class="close-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <p class="info-text">恢复 「{{ user.name }}（{{ user.uid }}）」的访问权限，需设置新密码。</p>

        <div class="field">
          <label>新密码</label>
          <div class="pwd-wrap">
            <input ref="pwdRef" :type="showPassword ? 'text' : 'password'" v-model="newPassword" placeholder="至少6位" :disabled="loading" />
            <button class="pwd-toggle" @click="showPassword = !showPassword" type="button">
              <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <p class="error-msg" v-if="error">{{ error }}</p>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('close')" :disabled="loading">取消</button>
        <button class="btn-primary" :disabled="loading" @click="submit">
          {{ loading ? '处理中...' : '确认恢复' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1001; animation: fadeIn 0.15s; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card { width: 420px; max-width: 90vw; background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h3 { font-size: 18px; font-weight: 700; color: #16a34a; margin: 0; }
.close-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }
.close-btn:hover { background: #f3f4f6; color: #374151; }

.modal-body { padding: 16px 24px 0; }

.info-text { font-size: 14px; color: #6b7280; text-align: center; margin: 0 0 16px; }

.field { margin-bottom: 4px; }
.field label { display: block; font-size: 12px; font-weight: 500; color: #6b7280; margin-bottom: 5px; }

.pwd-wrap { position: relative; }
.pwd-wrap input {
  width: 100%; height: 40px; padding: 0 40px 0 12px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 14px; outline: none;
}

.pwd-wrap input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: #fff; }

.pwd-toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }

.error-msg { color: #ef4444; font-size: 13px; text-align: center; padding-top: 8px; }

.modal-footer { display: flex; gap: 8px; padding: 18px 24px; }
.btn-primary { flex: 1; height: 42px; border-radius: 8px; background: #16a34a; color: #fff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; }
.btn-primary:hover:not(:disabled) { background: #15803d; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { width: 80px; height: 42px; border-radius: 8px; background: #f3f4f6; color: #6b7280; font-size: 14px; border: none; cursor: pointer; }
.btn-cancel:hover { background: #e5e7ee; }

@media (prefers-color-scheme: dark) {
  .modal-card { background: #1a1d2e; }
  .pwd-wrap input { background: #222640; border-color: #2a2e42; color: #e8eaf0; }
  .pwd-wrap input:focus { background: #222640; }
  .btn-cancel { background: #2a2e42; color: #9ca3af; }
}
</style>
