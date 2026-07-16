<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import APIClient from '../services/APIClient';
import { authStore } from '../services/authStore';
import type { AuthResponse } from '../services/bizTypes';

const router = useRouter();
const uid = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

onMounted(() => {
  if (authStore.isAuthenticated) {
    router.push('/chat');
  }
});

const submit = async () => {
  if (loading.value) return;
  error.value = '';

  if (!uid.value.trim()) { error.value = '请输入UID'; return; }
  if (!password.value) { error.value = '请输入密码'; return; }

  loading.value = true;
  try {
    const res = await axios.post('/api/biz/auth/login', { uid: uid.value.trim(), password: password.value });
    const data: AuthResponse = res.data;
    authStore.login(data.uid, data.name, data.token, data.im_token);
    try {
      const meRes = await axios.get('/api/biz/auth/me', { headers: authStore.authHeaders });
      authStore.setProfile(meRes.data);
    } catch { /* use defaults */ }
    APIClient.shared.config.apiURL = '';
    router.push('/chat');
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message || '请求失败';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
            <path d="M9 16l5 5 9-10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1>极速通</h1>
        <p class="subtitle">企业即时通讯平台</p>
      </div>

      <div class="field">
        <label>UID</label>
        <input type="text" placeholder="输入UID" v-model="uid" :disabled="loading" @keyup.enter="submit" />
      </div>

      <div class="field">
        <label>密码</label>
        <input type="password" placeholder="输入密码" v-model="password" :disabled="loading" @keyup.enter="submit" />
      </div>

      <div class="error-msg" v-if="error">{{ error }}</div>

      <button class="btn-login" :class="{ loading }" :disabled="loading" @click="submit">
        <span class="spinner" v-if="loading"></span>
        <span>{{ loading ? '处理中' : '登  录' }}</span>
      </button>

      <div class="footer-hint">账号由管理员分配，如有疑问请联系管理员</div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f2f4f7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.login-card {
  width: 380px;
  max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  padding: 44px 40px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
}

.brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  color: #1e3a5f;
}

.brand-icon svg {
  width: 100%;
  height: 100%;
}

h1 {
  font-size: 22px;
  font-weight: 700;
  color: #1a1d2e;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 13px;
  color: #9ca3af;
  letter-spacing: 1px;
}

.field {
  margin-bottom: 18px;
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

.field input::placeholder {
  color: #c4c8d0;
}

.error-msg {
  text-align: center;
  font-size: 13px;
  color: #ef4444;
  padding: 4px 0 12px;
}

.btn-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
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
  letter-spacing: 4px;
  transition: background 0.2s, transform 0.1s, opacity 0.2s;
}

.btn-login:hover:not(:disabled) {
  background: #2d5a8e;
}

.btn-login:active:not(:disabled) {
  transform: scale(0.99);
}

.btn-login:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.footer-hint {
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 20px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .login-page {
    background: #0f1119;
  }

  .login-card {
    background: #1a1d2e;
    box-shadow: 0 2px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04);
  }

  h1 {
    color: #e8eaf0;
  }

  .field label {
    color: #9ca3af;
  }

  .field input {
    color: #e8eaf0;
    background: #222640;
    border-color: #2a2e42;
  }

  .field input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
    background: #222640;
  }

  .brand-icon {
    color: #3b82f6;
  }

  .btn-login {
    background: #3b82f6;
  }

  .btn-login:hover:not(:disabled) {
    background: #60a5fa;
  }
}
</style>
