<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { authStore } from '../services/authStore';
import type { UserProfile } from '../services/bizTypes';

const router = useRouter();

const profile = ref<UserProfile | null>(null);
const isPresetPassword = ref(false);

onMounted(async () => {
  try {
    const res = await axios.get('/api/biz/auth/me', { headers: authStore.authHeaders });
    profile.value = res.data;
    isPresetPassword.value = !!res.data.preset_password;
    authStore.setProfile(res.data);
  } catch { /* ignore */ }
});

// Name editing
const editingName = ref(false);
const newName = ref(authStore.name);
const nameSaving = ref(false);
const nameError = ref('');

// Password change
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordSaving = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

const startEditName = () => {
  newName.value = authStore.name;
  editingName.value = true;
  nameError.value = '';
};

const cancelEditName = () => {
  editingName.value = false;
  nameError.value = '';
};

const saveName = async () => {
  if (!newName.value.trim()) { nameError.value = '名称不能为空'; return; }
  nameSaving.value = true;
  nameError.value = '';
  try {
    const res = await axios.put('/api/biz/auth/profile',
      { name: newName.value.trim() },
      { headers: authStore.authHeaders }
    );
    authStore.updateName(res.data.name);
    editingName.value = false;
  } catch (err: any) {
    nameError.value = err.response?.data?.error || '更新失败';
  } finally {
    nameSaving.value = false;
  }
};

const changePassword = async () => {
  passwordError.value = '';
  passwordSuccess.value = false;
  if (!isPresetPassword.value && !oldPassword.value) { passwordError.value = '请输入原密码'; return; }
  if (!newPassword.value || newPassword.value.length < 6) { passwordError.value = '新密码至少6位'; return; }
  if (newPassword.value !== confirmPassword.value) { passwordError.value = '两次密码不一致'; return; }

  passwordSaving.value = true;
  try {
    const body: Record<string, string> = { new_password: newPassword.value };
    if (!isPresetPassword.value) body.old_password = oldPassword.value;
    await axios.put('/api/biz/auth/password', body, { headers: authStore.authHeaders });
    isPresetPassword.value = false;
    passwordSuccess.value = true;
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err: any) {
    passwordError.value = err.response?.data?.error || '修改失败';
  } finally {
    passwordSaving.value = false;
  }
};

const roleLabel = computed(() => {
  const map: Record<string, string> = { super_admin: '超级管理员', admin: '管理员', project_lead: '项目负责人', employee: '员工' };
  return map[authStore.role] || authStore.role;
});

const goBack = () => router.push('/chat');
</script>

<template>
  <div class="profile-page">
    <div class="profile-card">
      <div class="profile-header">
        <button class="back-btn" @click="goBack" title="返回">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1>个人信息</h1>
      </div>

      <!-- UID (read-only) -->
      <div class="info-section">
        <label>UID</label>
        <div class="info-value uid-value">{{ authStore.uid }}</div>
        <p class="info-hint">UID 是系统识别你的唯一依据，不可更改</p>
      </div>

      <!-- Display name (editable) -->
      <div class="info-section">
        <label>用户名称</label>
        <div class="name-row" v-if="!editingName">
          <span class="info-value">{{ authStore.name || authStore.uid }}</span>
          <button class="edit-btn" @click="startEditName">编辑</button>
        </div>
        <div class="name-edit" v-else>
          <input
            v-model="newName"
            type="text"
            placeholder="输入用户名称"
            :disabled="nameSaving"
            @keyup.enter="saveName"
          />
          <div class="name-edit-actions">
            <button class="save-name-btn" :disabled="nameSaving" @click="saveName">
              {{ nameSaving ? '保存中...' : '保存' }}
            </button>
            <button class="cancel-btn" @click="cancelEditName" :disabled="nameSaving">取消</button>
          </div>
          <p class="error-text" v-if="nameError">{{ nameError }}</p>
        </div>
      </div>

      <!-- Department / Position / Role (read-only) -->
      <div class="info-section">
        <label>部门</label>
        <div class="info-value">{{ authStore.department || '未分配' }}</div>
      </div>

      <div class="info-section">
        <label>职位</label>
        <div class="info-value">{{ authStore.position || '未设置' }}</div>
      </div>

      <div class="info-section">
        <label>角色</label>
        <div class="info-value">
          <span class="role-badge" :class="'role-' + authStore.role">{{ roleLabel }}</span>
        </div>
      </div>

      <!-- Password change -->
      <div class="divider"></div>
      <h2>修改密码</h2>

      <div class="field" v-if="!isPresetPassword">
        <label>原密码</label>
        <input type="password" v-model="oldPassword" placeholder="输入原密码" />
      </div>
      <p class="info-hint" v-if="isPresetPassword">首次登录，无需输入原密码</p>

      <div class="field">
        <label>新密码</label>
        <input type="password" v-model="newPassword" placeholder="至少6位" />
      </div>

      <div class="field">
        <label>确认新密码</label>
        <input type="password" v-model="confirmPassword" placeholder="再次输入新密码" />
      </div>

      <p class="error-text" v-if="passwordError">{{ passwordError }}</p>
      <p class="success-text" v-if="passwordSuccess">密码修改成功</p>

      <button class="change-pwd-btn" :disabled="passwordSaving" @click="changePassword">
        {{ passwordSaving ? '修改中...' : '修改密码' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f4f7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.profile-card {
  width: 420px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 12px;
  padding: 36px 40px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.profile-header h1 {
  font-size: 20px;
  font-weight: 700;
  color: #1a1d2e;
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #f7f8fa;
  color: #6b7280;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #e5e7ee;
  color: #1a1d2e;
}

.info-section {
  margin-bottom: 20px;
}

.info-section label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 6px;
}

.info-value {
  font-size: 15px;
  font-weight: 600;
  color: #1a1d2e;
}

.uid-value {
  font-family: monospace;
  background: #f7f8fa;
  padding: 6px 12px;
  border-radius: 6px;
  display: inline-block;
  font-size: 14px;
}

.info-hint {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.edit-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 6px;
  background: transparent;
  color: #1e3a5f;
  border: 1px solid #1e3a5f;
  cursor: pointer;
  transition: all 0.15s;
}

.edit-btn:hover {
  background: #1e3a5f;
  color: #fff;
}

.name-edit input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  font-size: 14px;
  color: #1a1d2e;
  background: #f7f8fa;
  border: 1px solid #e5e7ee;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.name-edit input:focus {
  border-color: #1e3a5f;
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.08);
  background: #fff;
}

.name-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.save-name-btn {
  padding: 6px 16px;
  border-radius: 6px;
  background: #1e3a5f;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.save-name-btn:hover:not(:disabled) {
  background: #2d5a8e;
}

.save-name-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  padding: 6px 16px;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  border: 1px solid #e5e7ee;
  cursor: pointer;
}

.cancel-btn:hover {
  background: #f7f8fa;
}

.divider {
  height: 1px;
  background: #e5e7ee;
  margin: 24px 0;
}

h2 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1d2e;
  margin-bottom: 16px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 6px;
}

.field input {
  display: block;
  width: 100%;
  height: 44px;
  padding: 0 14px;
  font-size: 14px;
  color: #1a1d2e;
  background: #f7f8fa;
  border: 1px solid #e5e7ee;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field input:focus {
  border-color: #1e3a5f;
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.08);
  background: #fff;
}

.error-text {
  color: #ef4444;
  font-size: 13px;
  margin-top: 4px;
}

.success-text {
  color: #22c55e;
  font-size: 13px;
  margin-top: 4px;
}

.role-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.role-super_admin {
  background: #fef2f2;
  color: #dc2626;
}

.role-admin {
  background: #eff6ff;
  color: #2563eb;
}

.role-project_lead {
  background: #fefce8;
  color: #ca8a04;
}

.role-employee {
  background: #f0fdf4;
  color: #16a34a;
}

.change-pwd-btn {
  display: block;
  width: 100%;
  height: 46px;
  margin-top: 8px;
  background: #1e3a5f;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s, opacity 0.2s;
}

.change-pwd-btn:hover:not(:disabled) {
  background: #2d5a8e;
}

.change-pwd-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .profile-page {
    background: #0f1119;
  }

  .profile-card {
    background: #1a1d2e;
    box-shadow: 0 2px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04);
  }

  .profile-header h1, h2 {
    color: #e8eaf0;
  }

  .info-section label, .field label {
    color: #9ca3af;
  }

  .info-value {
    color: #e8eaf0;
  }

  .uid-value {
    background: #222640;
  }

  .field input, .name-edit input {
    color: #e8eaf0;
    background: #222640;
    border-color: #2a2e42;
  }

  .field input:focus, .name-edit input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
    background: #222640;
  }

  .edit-btn {
    color: #3b82f6;
    border-color: #3b82f6;
  }

  .edit-btn:hover {
    background: #3b82f6;
    color: #fff;
  }

  .save-name-btn, .change-pwd-btn {
    background: #3b82f6;
  }

  .save-name-btn:hover:not(:disabled), .change-pwd-btn:hover:not(:disabled) {
    background: #60a5fa;
  }

  .cancel-btn {
    border-color: #2a2e42;
    color: #9ca3af;
  }

  .cancel-btn:hover {
    background: #222640;
  }

  .back-btn {
    background: #222640;
    color: #9ca3af;
  }

  .back-btn:hover {
    background: #2a2e42;
    color: #e8eaf0;
  }

  .divider {
    background: #2a2e42;
  }
}
</style>
