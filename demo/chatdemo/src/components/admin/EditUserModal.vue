<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { bizClient } from '../../services/bizClient';
import { authStore } from '../../services/authStore';
import type { UserProfile, Department } from '../../services/bizTypes';

const props = defineProps<{ user: UserProfile }>();
const emit = defineEmits<{ close: []; updated: [] }>();

const name = ref(props.user.name);
const department = ref(props.user.department);
const position = ref(props.user.position);
const role = ref(props.user.role);
const loading = ref(false);
const error = ref('');
const success = ref('');
const departments = ref<Department[]>([]);

// Password reset inline
const showResetPwd = ref(false);
const newPassword = ref('');
const showPassword = ref(false);
const resetLoading = ref(false);
const resetError = ref('');
const resetSuccess = ref('');
const nameRef = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  try { departments.value = await bizClient.listDepartments(); } catch {}
  nameRef.value?.focus();
});

const submit = async () => {
  if (!name.value.trim()) { error.value = '姓名不能为空'; return; }
  loading.value = true; error.value = ''; success.value = '';
  try {
    await bizClient.updateUser(props.user.uid, { name: name.value.trim(), department: department.value, position: position.value, role: role.value });
    success.value = '保存成功';
    setTimeout(() => emit('updated'), 600);
  } catch (err: any) {
    error.value = err.response?.data?.error || '更新失败';
  } finally { loading.value = false; }
};

const doResetPassword = async () => {
  if (!newPassword.value || newPassword.value.length < 6) {
    resetError.value = '密码至少6位';
    return;
  }
  resetLoading.value = true; resetError.value = ''; resetSuccess.value = '';
  try {
    await bizClient.resetUserPassword(props.user.uid, newPassword.value);
    resetSuccess.value = '密码已重置';
    newPassword.value = '';
  } catch (err: any) {
    resetError.value = err.response?.data?.error || '重置失败';
  } finally { resetLoading.value = false; }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>编辑用户</h3>
        <button class="close-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="uid-display">{{ user.uid }}</div>

      <div class="field">
        <label>姓名</label>
        <input ref="nameRef" v-model="name" :disabled="loading" />
      </div>

      <div class="field">
        <label>部门</label>
        <select v-model="department" :disabled="loading">
          <option value="">未分配</option>
          <option v-for="d in departments" :key="d.name" :value="d.name">{{ d.name }}</option>
        </select>
      </div>

      <div class="field">
        <label>职位</label>
        <input v-model="position" :disabled="loading" />
      </div>

      <div class="field">
        <label>角色</label>
        <select v-model="role" :disabled="loading">
          <option value="employee">员工</option>
          <option value="project_lead">项目负责人</option>
          <option value="admin">管理员</option>
          <option value="super_admin" v-if="authStore.role === 'super_admin'">超级管理员</option>
        </select>
      </div>

      <p class="error-msg" v-if="error">{{ error }}</p>
      <p class="success-msg" v-if="success">{{ success }}</p>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('close')" :disabled="loading">取消</button>
        <button class="btn-primary" :disabled="loading" @click="submit">
          {{ loading ? '保存中...' : '保存修改' }}
        </button>
      </div>

      <!-- Password Reset -->
      <div class="reset-section">
        <button class="btn-reset-toggle" @click="showResetPwd = !showResetPwd" v-if="!showResetPwd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          重置密码
        </button>

        <div class="reset-form" v-if="showResetPwd">
          <div class="pwd-wrap">
            <input :type="showPassword ? 'text' : 'password'" v-model="newPassword" placeholder="输入新密码（至少6位）" :disabled="resetLoading" />
            <button class="pwd-toggle" @click="showPassword = !showPassword" type="button">
              <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <p class="field-error" v-if="resetError">{{ resetError }}</p>
          <p class="field-success" v-if="resetSuccess">{{ resetSuccess }}</p>
          <div class="reset-actions">
            <button class="action-btn" @click="showResetPwd = false; resetError = ''; resetSuccess = ''; newPassword = ''">取消</button>
            <button class="action-btn confirm" :disabled="resetLoading" @click="doResetPassword">{{ resetLoading ? '重置中...' : '确认重置' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1001; animation: fadeIn 0.15s; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card { width: 440px; max-width: 90vw; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h3 { font-size: 18px; font-weight: 700; color: #1a1d2e; margin: 0; }
.close-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }
.close-btn:hover { background: #f3f4f6; color: #374151; }

.uid-display { text-align: center; font-family: monospace; font-size: 12px; color: #9ca3af; padding: 8px 24px; }

.field { padding: 0 24px; margin-top: 12px; }
.field label { display: block; font-size: 12px; font-weight: 500; color: #6b7280; margin-bottom: 5px; }

.field input, .field select {
  width: 100%; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 14px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}

.field input:focus, .field select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: #fff; }

.error-msg { color: #ef4444; font-size: 13px; text-align: center; padding: 8px 24px 0; }
.success-msg { color: #16a34a; font-size: 13px; text-align: center; padding: 8px 24px 0; }

.modal-footer { display: flex; gap: 8px; padding: 16px 24px; }
.btn-primary { flex: 1; height: 42px; border-radius: 8px; background: #1e3a5f; color: #fff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: background 0.15s; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { width: 80px; height: 42px; border-radius: 8px; background: #f3f4f6; color: #6b7280; font-size: 14px; border: none; cursor: pointer; }
.btn-cancel:hover { background: #e5e7ee; }

/* Password reset section */
.reset-section { border-top: 1px solid #f3f4f6; padding: 14px 24px 20px; }

.btn-reset-toggle {
  display: flex; align-items: center; gap: 6px; width: 100%; justify-content: center;
  padding: 10px; border-radius: 8px; background: #fef2f2; color: #dc2626;
  font-size: 13px; font-weight: 500; border: 1px solid #fecaca; cursor: pointer; transition: background 0.15s;
}

.btn-reset-toggle:hover { background: #fee2e2; }

.reset-form { margin-top: 8px; }

.pwd-wrap { position: relative; }
.pwd-wrap input {
  width: 100%; height: 40px; padding: 0 40px 0 12px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 14px; outline: none;
}

.pwd-toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }

.field-error { font-size: 11px; color: #ef4444; margin-top: 4px; }
.field-success { font-size: 11px; color: #16a34a; margin-top: 4px; }

.reset-actions { display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end; }
.action-btn { padding: 5px 12px; font-size: 12px; border-radius: 5px; border: 1px solid #e5e7ee; background: #f7f8fa; color: #374151; cursor: pointer; }
.action-btn.confirm { background: #dc2626; color: #fff; border-color: #dc2626; }
.action-btn.confirm:hover { background: #b91c1c; }
.action-btn.confirm:disabled { opacity: 0.5; cursor: not-allowed; }

@media (prefers-color-scheme: dark) {
  .modal-card { background: #1a1d2e; }
  .modal-header h3 { color: #e8eaf0; }
  .close-btn:hover { background: #2a2e42; }
  .field input, .field select, .pwd-wrap input { background: #222640; border-color: #2a2e42; color: #e8eaf0; }
  .field input:focus, .field select:focus { background: #222640; }
  .btn-cancel { background: #2a2e42; color: #9ca3af; }
  .reset-section { border-color: #2a2e42; }
  .btn-reset-toggle { background: #3b1c1c; border-color: #5c2020; }
}
</style>
