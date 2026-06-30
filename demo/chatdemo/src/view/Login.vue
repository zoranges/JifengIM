<script setup lang="ts">
import { ref } from 'vue'
import APIClient from '../services/APIClient'
import { useRouter } from "vue-router";
import { WKSDK } from 'wukongimjssdk';
const router = useRouter();

const getUrlParam = (name: string) => {
  var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
  var r = window.location.search.substr(1).match(reg);
  if (r != null) return unescape(r[2]);
  return null;
}

var apiurl = getUrlParam("apiurl")

if (!apiurl) {
  apiurl = ""
} else {
  if (apiurl.endsWith("/")) {
    apiurl = apiurl.substring(0, apiurl.length - 1)
  }
}

// Preload Chat chunk in background while user fills login form
import('../view/Chat.vue')

const username = ref('')
const password = ref('')
const loading = ref(false)

const login = () => {
  if (loading.value) return
  loading.value = true
  APIClient.shared.config.apiURL = apiurl || ''
  APIClient.shared.post('/user/token', {
    uid: username.value,
    token: password.value || "default111111",
    device_flag: 1,
    device_level: 0,
  }).then((res) => {
    router.push({ path: '/chat', query: { uid: username.value, token: password.value } })
  }).catch((err) => {
    alert(err.msg)
    loading.value = false
  })
}

</script>
<template>
  <div class="login-page">
    <!-- Left panel -->
    <div class="left-panel">
      <div class="dot-grid"></div>
      <div class="left-content">
        <div class="brand-mark">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="44" height="44" rx="12" stroke="currentColor" stroke-width="2" opacity="0.6"/>
            <path d="M14 24l7 7 13-14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h1>疾风即时</h1>
        <p class="tagline">企业级即时通讯平台</p>
        <div class="features">
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>端到端加密传输</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>亿级消息吞吐</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>私有化部署</span>
          </div>
        </div>
      </div>
      <div class="left-footer">
        <span class="version-text">SDK v{{ WKSDK.shared().config.sdkVersion }}</span>
      </div>
    </div>

    <!-- Right panel -->
    <div class="right-panel">
      <div class="form-wrapper">
        <h2>登录</h2>
        <p class="form-sub">请输入您的账号信息</p>

        <div class="field">
          <label>账号</label>
          <input type="text" placeholder="输入用户ID" v-model="username" :disabled="loading" />
        </div>

        <div class="field">
          <label>密码</label>
          <input type="password" placeholder="输入密码" v-model="password" :disabled="loading" />
        </div>

        <button class="btn-login" :class="{ loading }" :disabled="loading" v-on:click="login">
          <span class="spinner" v-if="loading"></span>
          <span>{{ loading ? '登录中' : '登  录' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  height: 100vh;
  display: flex;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

/* ========= Left panel ========= */
.left-panel {
  width: 480px;
  flex-shrink: 0;
  background: #141827;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  color: #fff;
  padding: 60px 56px;
}

.dot-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.3) 100%);
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.3) 100%);
}

.left-panel::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.1) 70%, transparent);
}

.left-content {
  position: relative;
  z-index: 1;
  text-align: center;
}

.brand-mark {
  width: 56px;
  height: 56px;
  margin: 0 auto 24px;
  color: rgba(255,255,255,0.9);
}

.brand-mark svg {
  width: 100%;
  height: 100%;
}

.left-panel h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 4px;
  margin-bottom: 8px;
  color: #fff;
}

.tagline {
  font-size: 13px;
  color: rgba(255,255,255,0.45);
  letter-spacing: 2px;
  margin-bottom: 48px;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: rgba(255,255,255,0.55);
  letter-spacing: 1px;
}

.feature-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  flex-shrink: 0;
}

.left-footer {
  position: absolute;
  bottom: 32px;
  z-index: 1;
}

.version-text {
  font-size: 11px;
  color: rgba(255,255,255,0.2);
  letter-spacing: 1px;
}

/* ========= Right panel ========= */
.right-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafbfc;
}

.form-wrapper {
  width: 360px;
  max-width: 86vw;
}

.form-wrapper h2 {
  font-size: 22px;
  font-weight: 600;
  color: #1a1d2e;
  margin-bottom: 6px;
  letter-spacing: 1px;
}

.form-sub {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 36px;
}

.field {
  margin-bottom: 20px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.field input {
  display: block;
  width: 100%;
  height: 46px;
  padding: 0 16px;
  font-size: 14px;
  color: #1a1d2e;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field input:focus {
  border-color: #141827;
  box-shadow: 0 0 0 3px rgba(20, 24, 39, 0.08);
}

.field input::placeholder {
  color: #c4c8d0;
}

.btn-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 48px;
  margin-top: 12px;
  background: #141827;
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
  background: #1f2539;
}

.btn-login:active:not(:disabled) {
  transform: scale(0.99);
}

.btn-login:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-login.loading {
  letter-spacing: 2px;
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

.field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .right-panel {
    background: #0f1119;
  }

  .form-wrapper h2 {
    color: #e8eaf0;
  }

  .field label {
    color: #9ca3af;
  }

  .field input {
    color: #e8eaf0;
    background: #1a1d2e;
    border-color: #2a2e42;
  }

  .field input:focus {
    border-color: #4f6ef7;
    box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.12);
  }

  .field input::placeholder {
    color: #5c6070;
  }

  .btn-login {
    background: #e8eaf0;
    color: #141827;
  }

  .btn-login:hover:not(:disabled) {
    background: #fff;
  }

  .btn-login .spinner {
    border-color: rgba(20, 24, 39, 0.2);
    border-top-color: #141827;
  }
}

/* Narrow screen */
@media (max-width: 700px) {
  .left-panel {
    display: none;
  }
}
</style>
