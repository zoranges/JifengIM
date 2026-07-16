<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { bizClient } from '../../services/bizClient';
import type { Department } from '../../services/bizTypes';

const emit = defineEmits<{ close: []; created: [] }>();

const name = ref('');
const password = ref('');
const showPassword = ref(false);
const department = ref('');
const position = ref('');
const role = ref('employee');
const loading = ref(false);
const error = ref('');
const departments = ref<Department[]>([]);
const nameRef = ref<HTMLInputElement | null>(null);

const nameError = ref('');
const pwdError = ref('');

onMounted(async () => {
  try { departments.value = await bizClient.listDepartments(); } catch {}
  nameRef.value?.focus();
});

const validateName = () => {
  if (!name.value.trim()) { nameError.value = '请输入姓名'; return false; }
  if (name.value.trim().length > 32) { nameError.value = '姓名不超过32个字符'; return false; }
  nameError.value = '';
  return true;
};

const validatePwd = () => {
  if (!password.value) { pwdError.value = '请输入密码'; return false; }
  if (password.value.length < 6) { pwdError.value = '密码至少6位'; return false; }
  pwdError.value = '';
  return true;
};

const submit = async () => {
  const vn = validateName();
  const vp = validatePwd();
  if (!vn || !vp) return;
  loading.value = true; error.value = '';
  try {
    await bizClient.createUser(name.value.trim(), password.value, department.value || '', position.value || '', role.value);
    emit('created');
  } catch (err: any) {
    error.value = err.response?.data?.error || '创建失败';
  } finally { loading.value = false; }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>新建用户</h3>
        <button class="close-btn" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="field">
        <label>姓名 <span class="required">*</span></label>
        <input ref="nameRef" v-model="name" placeholder="用户姓名" :disabled="loading" :class="{ 'input-error': nameError }" @input="nameError = ''" />
        <span class="field-error" v-if="nameError">{{ nameError }}</span>
      </div>

      <div class="field">
        <label>初始密码 <span class="required">*</span></label>
        <div class="pwd-wrap">
          <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="至少6位" :disabled="loading" :class="{ 'input-error': pwdError }" @input="pwdError = ''" />
          <button class="pwd-toggle" @click="showPassword = !showPassword" type="button">
            <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
        <span class="field-error" v-if="pwdError">{{ pwdError }}</span>
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
        <input v-model="position" placeholder="如：工程师" :disabled="loading" />
      </div>

      <div class="field">
        <label>角色</label>
        <select v-model="role" :disabled="loading">
          <option value="employee">员工</option>
          <option value="project_lead">项目负责人</option>
          <option value="admin">管理员</option>
        </select>
      </div>

      <p class="error-msg" v-if="error">{{ error }}</p>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('close')" :disabled="loading">取消</button>
        <button class="btn-primary" :disabled="loading" @click="submit">
          {{ loading ? '创建中...' : '创建用户' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1001; animation: fadeIn 0.15s; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card { width: 440px; max-width: 90vw; background: #fff; border-radius: 12px; padding: 0; box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }

.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h3 { font-size: 18px; font-weight: 700; color: #1a1d2e; margin: 0; }
.close-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }
.close-btn:hover { background: #f3f4f6; color: #374151; }

.field { padding: 0 24px; margin-top: 14px; }
.field label { display: block; font-size: 12px; font-weight: 500; color: #6b7280; margin-bottom: 5px; }
.required { color: #ef4444; }

.field input, .field select {
  width: 100%; height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid #e5e7ee;
  background: #f7f8fa; color: #1a1d2e; font-size: 14px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}

.field input:focus, .field select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: #fff; }
.input-error { border-color: #ef4444 !important; }

.pwd-wrap { position: relative; }
.pwd-wrap input { padding-right: 40px; }
.pwd-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: transparent; color: #9ca3af; border: none; cursor: pointer; }
.pwd-toggle:hover { color: #6b7280; }

.field-error { display: block; font-size: 11px; color: #ef4444; margin-top: 4px; }

.error-msg { color: #ef4444; font-size: 13px; text-align: center; padding: 8px 24px 0; }

.modal-footer { display: flex; gap: 8px; padding: 20px 24px; }
.btn-primary { flex: 1; height: 42px; border-radius: 8px; background: #1e3a5f; color: #fff; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: background 0.15s; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { width: 80px; height: 42px; border-radius: 8px; background: #f3f4f6; color: #6b7280; font-size: 14px; border: none; cursor: pointer; }
.btn-cancel:hover { background: #e5e7ee; }

@media (prefers-color-scheme: dark) {
  .modal-card { background: #1a1d2e; }
  .modal-header h3 { color: #e8eaf0; }
  .close-btn:hover { background: #2a2e42; }
  .field input, .field select { background: #222640; border-color: #2a2e42; color: #e8eaf0; }
  .field input:focus, .field select:focus { background: #222640; }
  .btn-cancel { background: #2a2e42; color: #9ca3af; }
}
</style>
