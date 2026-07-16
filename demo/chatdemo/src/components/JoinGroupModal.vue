<script setup lang="ts">
import { ref } from 'vue';
import { bizClient } from '../services/bizClient';
import { useGroupManager } from '../composables/useGroupManager';
import type { GroupInfo } from '../services/bizTypes';

const emit = defineEmits<{
  close: [];
  joined: [groupId: string];
}>();

const { joinGroup, loading, error } = useGroupManager();

const searchId = ref('');
const nickname = ref('');
const searchedGroup = ref<GroupInfo | null>(null);
const searching = ref(false);

const onSearch = async () => {
  if (!searchId.value.trim()) return;
  searching.value = true;
  searchedGroup.value = null;
  error.value = '';
  try {
    searchedGroup.value = await bizClient.searchGroup(searchId.value.trim());
  } catch (e: any) {
    error.value = e?.response?.data?.error || '群组不存在';
  } finally {
    searching.value = false;
  }
};

const onJoin = async () => {
  if (!searchedGroup.value || !nickname.value.trim()) return;
  const ok = await joinGroup(searchedGroup.value.id, nickname.value.trim());
  if (ok) {
    emit('joined', searchedGroup.value.id);
  }
};
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h3>加入群聊</h3>
      <div class="search-row">
        <input type="text" placeholder="输入群ID搜索" v-model="searchId" @keyup.enter="onSearch" />
        <button class="btn-search" @click="onSearch" :disabled="searching || !searchId.trim()">
          {{ searching ? '搜索中' : '搜索' }}
        </button>
      </div>

      <div class="result-card" v-if="searchedGroup">
        <div class="group-avatar">{{ searchedGroup.name.charAt(0) }}</div>
        <div class="group-info">
          <div class="group-name">{{ searchedGroup.name }}</div>
          <div class="group-meta">{{ searchedGroup.member_count }} 人</div>
        </div>
      </div>

      <div class="field" v-if="searchedGroup">
        <label>我的群昵称</label>
        <input type="text" placeholder="输入您的真实姓名" v-model="nickname" />
      </div>

      <p class="error-msg" v-if="error">{{ error }}</p>

      <button class="btn-primary" v-if="searchedGroup" :disabled="loading || !nickname.trim()" @click="onJoin">
        {{ loading ? '加入中...' : '加入群聊' }}
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
  width: 420px; max-width: 90vw; background: var(--bg-card); border-radius: 12px;
  padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
h3 { font-size: 20px; font-weight: 700; margin-bottom: 20px; text-align: center; color: var(--text); }
.search-row { display: flex; gap: 8px; margin-bottom: 16px; }
.search-row input {
  flex: 1; height: 44px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 14px; outline: none;
}
.search-row input:focus { border-color: var(--primary); }
.btn-search {
  height: 44px; padding: 0 20px; border-radius: 8px; background: var(--primary); color: #fff;
  font-size: 14px; font-weight: 500; border: none; cursor: pointer; white-space: nowrap;
}
.btn-search:disabled { opacity: 0.5; cursor: not-allowed; }
.result-card {
  display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--bg);
  border-radius: 10px; border: 1px solid var(--border); margin-bottom: 16px;
}
.group-avatar {
  width: 48px; height: 48px; border-radius: 12px; background: var(--primary);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; flex-shrink: 0;
}
.group-name { font-size: 16px; font-weight: 600; color: var(--text); }
.group-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.field input {
  width: 100%; height: 44px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 14px; outline: none;
}
.field input:focus { border-color: var(--primary); }
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
