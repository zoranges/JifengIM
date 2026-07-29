<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { usePersonalFiles } from '../composables/usePersonalFiles';
import { authStore } from '../services/authStore';
import type { PersonalFile, FileCategory } from '../services/personalFileService';
import { getDownloadUrl } from '../services/personalFileService';

const pf = usePersonalFiles();
// 解构 refs 到顶层，确保模板中 v-if/:disabled 等指令正确解包
const {
  files, total, categories, counts, loading, uploadProgress, uploading,
  imageFiles, videoFiles, audioFiles, docFiles,
} = pf;

// ─── UI State ──────────────────────────────────────────────
const viewMode = ref<'grid' | 'list'>('grid');
const selectedCategoryId = ref<string | null>(null); // null = 全部
const searchQuery = ref('');
const previewUrl = ref('');
const ctxMenu = ref<{ x: number; y: number; fileId: string } | null>(null);
const renamingFile = ref<string | null>(null);
const renameText = ref('');
const movingFile = ref<string | null>(null);
const showNewCategory = ref(false);
const newCatName = ref('');
const renamingCategory = ref<string | null>(null);
const renameCatText = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

// ─── Derived ───────────────────────────────────────────────
const currentFiles = computed(() => {
  let list = files.value;
  if (selectedCategoryId.value === '__images') return imageFiles.value;
  if (selectedCategoryId.value === '__videos') return videoFiles.value;
  if (selectedCategoryId.value === '__audios') return audioFiles.value;
  if (selectedCategoryId.value === '__docs') return docFiles.value;
  if (selectedCategoryId.value) {
    list = files.value.filter(f => f.categoryId === selectedCategoryId.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(f => f.name.toLowerCase().includes(q));
  }
  return list;
});

const currentTitle = computed(() => {
  if (selectedCategoryId.value === '__images') return '图片';
  if (selectedCategoryId.value === '__videos') return '视频';
  if (selectedCategoryId.value === '__audios') return '音频';
  if (selectedCategoryId.value === '__docs') return '文档';
  if (selectedCategoryId.value) {
    return categories.value.find(c => c.id === selectedCategoryId.value)?.name || '文件';
  }
  return '全部文件';
});

const ctxFile = computed(() => {
  if (!ctxMenu.value) return null;
  return currentFiles.value.find(f => f.id === ctxMenu.value!.fileId) || null;
});

// ─── Load ───────────────────────────────────────────────────
onMounted(() => {
  pf.refresh();
});

// ─── Handlers ───────────────────────────────────────────────

function selectCategory(id: string | null) {
  selectedCategoryId.value = id;
  searchQuery.value = '';
}

function handleFileUpload() {
  fileInput.value?.click();
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  for (const file of Array.from(input.files)) {
    try { await pf.upload(file); } catch (err: any) { alert('上传失败: ' + err.message); }
  }
  input.value = ''; // 允许重复选择同一文件
}

// 拖拽上传
function onDragOver(e: DragEvent) { e.preventDefault(); }
function onDrop(e: DragEvent) {
  e.preventDefault();
  if (!e.dataTransfer?.files) return;
  for (const file of Array.from(e.dataTransfer.files)) {
    pf.upload(file).catch((err: Error) => alert('上传失败: ' + err.message));
  }
}

// 上下文菜单
function onContextMenu(e: MouseEvent, fileId: string) {
  e.preventDefault();
  ctxMenu.value = { x: e.clientX, y: e.clientY, fileId };
}
function closeCtxMenu() { ctxMenu.value = null; }

function downloadFile(fileId: string, filename: string) {
  const a = document.createElement('a');
  a.href = getDownloadUrl(fileId);
  a.download = filename;
  a.click();
}

function handleDownload() {
  const f = ctxFile.value;
  if (f) downloadFile(f.id, f.name);
  closeCtxMenu();
}

function handleRenameStart(fileId: string) {
  const f = pf.rawFile(fileId);
  if (f) {
    renamingFile.value = fileId;
    renameText.value = f.name;
  }
  closeCtxMenu();
}

function handleRenameConfirm() {
  if (!renamingFile.value) return;
  const name = renameText.value.trim();
  if (name) pf.rename(renamingFile.value, name).catch((e: Error) => alert(e.message));
  renamingFile.value = null;
}

function handleDelete() {
  const f = ctxFile.value;
  if (!f) { closeCtxMenu(); return; }
  if (!confirm(`确定删除「${f.name}」？此操作不可恢复。`)) { closeCtxMenu(); return; }
  pf.delete(f.id).catch((e: Error) => alert(e.message));
  closeCtxMenu();
}

function handleMoveTo(catId: string | null) {
  const f = ctxFile.value;
  if (f) pf.move(f.id, catId).catch((e: Error) => alert(e.message));
  movingFile.value = null;
  closeCtxMenu();
}

// 分类操作
function handleCreateCategory() {
  const name = newCatName.value.trim();
  if (!name) return;
  pf.createCategory(name).catch((e: Error) => alert(e.message));
  newCatName.value = '';
  showNewCategory.value = false;
}

function handleRenameCatStart(id: string) {
  renamingCategory.value = id;
  renameCatText.value = categories.value.find(c => c.id === id)?.name || '';
}

function handleRenameCatConfirm() {
  if (!renamingCategory.value) return;
  const name = renameCatText.value.trim();
  if (name) pf.renameCategory(renamingCategory.value, name).catch((e: Error) => alert(e.message));
  renamingCategory.value = null;
}

function handleDeleteCategory(id: string) {
  const cat = categories.value.find(c => c.id === id);
  if (!cat) return;
  if (!confirm(`删除分类「${cat.name}」？分类内的 ${cat.fileCount} 个文件将移回未分类。`)) return;
  pf.deleteCategory(id).catch((e: Error) => alert(e.message));
  if (selectedCategoryId.value === id) selectedCategoryId.value = null;
}

// ─── Helpers ────────────────────────────────────────────────

function fileIcon(mime: string): string {
  const map: Record<string, string> = {
    image: '🖼️', video: '🎬', audio: '🎵', doc: '📄',
  };
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m.includes('pdf')) return '📕';
  if (m.includes('zip') || m.includes('rar')) return '📦';
  return map.doc;
}

function fileTypeLabel(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return '图片';
  if (m.startsWith('video/')) return '视频';
  if (m.startsWith('audio/')) return '音频';
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('doc')) return '文档';
  if (m.includes('sheet') || m.includes('excel')) return '表格';
  return '文件';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Click outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', closeCtxMenu);
}
</script>

<template>
  <div class="pf-root" @dragover="onDragOver" @drop="onDrop">
    <!-- 隐藏的文件选择器 -->
    <input ref="fileInput" type="file" multiple style="display:none" @change="onFilesSelected" />

    <!-- 顶部栏 -->
    <div class="pf-header">
      <div class="pf-header-left">
        <h2>📁 我的文件</h2>
        <span class="pf-stat" v-if="counts.total > 0">
          共 {{ counts.total }} 个文件
          <template v-if="uploading">
            · 上传中 {{ uploadProgress }}%
          </template>
        </span>
      </div>
      <div class="pf-header-right">
        <div class="pf-search" v-if="viewMode !== undefined">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="pf-search-icon">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input v-model="searchQuery" placeholder="搜索文件名..." class="pf-search-input" />
          <button v-if="searchQuery" class="pf-search-clear" @click="searchQuery = ''">✕</button>
        </div>
        <button class="pf-view-btn" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格视图">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>
        </button>
        <button class="pf-view-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="列表视图">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><rect x="3" y="4" width="18" height="2" rx="1"/><rect x="3" y="11" width="18" height="2" rx="1"/><rect x="3" y="18" width="18" height="2" rx="1"/></svg>
        </button>
        <button type="button" class="pf-upload-btn" @click="handleFileUpload" :disabled="uploading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <span>上传文件</span>
        </button>
      </div>
    </div>

    <!-- 上传进度条 -->
    <div class="pf-progress-bar" v-if="uploading">
      <div class="pf-progress-fill" :style="{ width: uploadProgress + '%' }"></div>
    </div>

    <!-- 主体 -->
    <div class="pf-body">
      <!-- 左侧分类 -->
      <div class="pf-sidebar">
        <div class="pf-categories">
          <div class="pf-cat-item" :class="{ active: selectedCategoryId === null }" @click="selectCategory(null)">
            <span class="pf-cat-icon">📁</span>
            <span class="pf-cat-name">全部文件</span>
            <span class="pf-cat-count">{{ counts.total }}</span>
          </div>
          <div class="pf-cat-item" :class="{ active: selectedCategoryId === '__images' }" @click="selectCategory('__images')">
            <span class="pf-cat-icon">🖼️</span>
            <span class="pf-cat-name">图片</span>
            <span class="pf-cat-count">{{ counts.images }}</span>
          </div>
          <div class="pf-cat-item" :class="{ active: selectedCategoryId === '__videos' }" @click="selectCategory('__videos')">
            <span class="pf-cat-icon">🎬</span>
            <span class="pf-cat-name">视频</span>
            <span class="pf-cat-count">{{ counts.videos }}</span>
          </div>
          <div class="pf-cat-item" :class="{ active: selectedCategoryId === '__audios' }" @click="selectCategory('__audios')">
            <span class="pf-cat-icon">🎵</span>
            <span class="pf-cat-name">音频</span>
            <span class="pf-cat-count">{{ counts.audios }}</span>
          </div>
          <div class="pf-cat-item" :class="{ active: selectedCategoryId === '__docs' }" @click="selectCategory('__docs')">
            <span class="pf-cat-icon">📄</span>
            <span class="pf-cat-name">文档</span>
            <span class="pf-cat-count">{{ counts.docs }}</span>
          </div>

          <div class="pf-cat-sep"></div>

          <!-- 自定义分类 -->
          <div v-for="cat in categories.value" :key="cat.id" class="pf-cat-item"
               :class="{ active: selectedCategoryId === cat.id }"
               @click="selectCategory(cat.id)"
               @contextmenu.prevent="handleRenameCatStart(cat.id)">

            <template v-if="renamingCategory === cat.id">
              <input class="pf-cat-rename-input" v-model="renameCatText"
                     @keyup.enter="handleRenameCatConfirm"
                     @blur="handleRenameCatConfirm" @click.stop autofocus />
            </template>
            <template v-else>
              <span class="pf-cat-icon">🏷️</span>
              <span class="pf-cat-name">{{ cat.name }}</span>
              <span class="pf-cat-count">{{ cat.fileCount }}</span>
              <div class="pf-cat-actions" @click.stop>
                <button class="pf-cat-act" title="重命名" @click="handleRenameCatStart(cat.id)">✎</button>
                <button class="pf-cat-act pf-cat-act-del" title="删除" @click="handleDeleteCategory(cat.id)">✕</button>
              </div>
            </template>
          </div>
        </div>

        <!-- 新建分类 -->
        <div class="pf-new-cat" v-if="showNewCategory">
          <input class="pf-new-cat-input" v-model="newCatName" placeholder="分类名称"
                 @keyup.enter="handleCreateCategory" @keyup.escape="showNewCategory = false" autofocus />
          <button class="pf-new-cat-confirm" @click="handleCreateCategory">✓</button>
          <button class="pf-new-cat-cancel" @click="showNewCategory = false">✕</button>
        </div>
        <button class="pf-add-cat-btn" v-else @click="showNewCategory = true">
          <span>+ 新建分类</span>
        </button>
      </div>

      <!-- 右侧文件区 -->
      <div class="pf-content">
        <!-- 工具栏 -->
        <div class="pf-toolbar">
          <span class="pf-toolbar-title">{{ currentTitle }} <span class="pf-toolbar-count">({{ currentFiles.length }})</span></span>
        </div>

        <!-- Loading -->
        <div class="pf-empty" v-if="loading">
          <span>加载中...</span>
        </div>

        <!-- 空状态 -->
        <div class="pf-empty" v-else-if="currentFiles.length === 0 && !uploading">
          <span v-if="searchQuery">未找到匹配「{{ searchQuery }}」的文件</span>
          <span v-else>
            暂无文件
            <button class="pf-empty-upload" @click="handleFileUpload">上传第一个文件</button>
          </span>
        </div>

        <!-- 图片网格 -->
        <div class="pf-grid" v-else-if="viewMode === 'grid' && (selectedCategoryId === '__images' || selectedCategoryId === null)">
          <div class="pf-card pf-image-card" v-for="f in currentFiles.filter(x => x.fileType === 'image')" :key="f.id"
               @contextmenu="(e: MouseEvent) => onContextMenu(e, f.id)">
            <div class="pf-image-wrap" @click="previewUrl = f.url">
              <img :src="f.url" loading="lazy" />
            </div>
            <div class="pf-card-name" :title="f.name">{{ f.name }}</div>
            <div class="pf-card-meta">
              {{ f.sizeText }} · {{ f.uploaderName || f.uploaderUid }} · {{ formatDate(f.createdAt) }}
              <button class="pf-grid-download" title="下载" @click.stop="downloadFile(f.id, f.name)">↓</button>
            </div>
          </div>
        </div>

        <!-- 混合网格 (全部文件时非图片) 或 列表视图 -->
        <div class="pf-list" v-else-if="currentFiles.length > 0">
          <div class="pf-card pf-list-item" v-for="f in currentFiles" :key="f.id"
               :class="{ 'pf-renaming': renamingFile === f.id }"
               @contextmenu="(e: MouseEvent) => onContextMenu(e, f.id)">

            <!-- 缩略图 -->
            <a :href="f.url" target="_blank" class="pf-list-link"
               @click.prevent="f.fileType === 'image' ? previewUrl = f.url : window.open(f.url, '_blank')">
              <img v-if="f.fileType === 'image'" :src="f.url" class="pf-list-thumb" loading="lazy" />
              <span v-else class="pf-list-icon">{{ fileIcon(f.mimeType) }}</span>
              <div class="pf-list-info">
                <template v-if="renamingFile === f.id">
                  <input class="pf-rename-input" v-model="renameText"
                         @keyup.enter="handleRenameConfirm"
                         @blur="handleRenameConfirm"
                         @click.stop autofocus />
                </template>
                <template v-else>
                  <span class="pf-list-name">{{ f.name }}</span>
                </template>
                <span class="pf-list-meta">
                  <span class="pf-list-type">{{ fileTypeLabel(f.mimeType) }}</span>
                  · {{ f.sizeText }}
                  · {{ f.uploaderName || f.uploaderUid }}
                  · {{ formatDate(f.createdAt) }}
                  <span class="pf-list-cat" v-if="f.categoryId">
                    · {{ categories.value.find(c => c.id === f.categoryId)?.name || '' }}
                  </span>
                </span>
              </div>
            </a>

            <!-- 操作按钮 -->
            <div class="pf-item-actions">
              <button class="pf-item-act" title="下载" @click="downloadFile(f.id, f.name)">↓</button>
              <button class="pf-item-act" title="重命名" @click="handleRenameStart(f.id)">✎</button>
              <button class="pf-item-act" title="移动到" @click.stop="movingFile = f.id">
                ▾
                <div class="pf-move-menu" v-if="movingFile === f.id">
                  <div class="pf-move-item" @click="handleMoveTo(null)">无分类</div>
                  <div class="pf-move-item" v-for="cat in categories.value" :key="cat.id" @click="handleMoveTo(cat.id)">
                    {{ cat.name }}
                    <span v-if="f.categoryId === cat.id">✓</span>
                  </div>
                </div>
              </button>
              <button class="pf-item-act pf-item-act-danger" title="删除" @click="handleRenameStart(f.id); handleDelete()">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片预览 -->
    <transition name="fade">
      <div class="pf-preview-overlay" v-if="previewUrl" @click="previewUrl = ''">
        <img :src="previewUrl" @click.stop />
        <button class="pf-preview-close" @click="previewUrl = ''">✕</button>
      </div>
    </transition>

    <!-- 右键菜单 -->
    <div class="pf-ctx-menu" v-if="ctxMenu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <div class="pf-ctx-item" @click="handleDownload">
        <span>下载</span>
      </div>
      <div class="pf-ctx-item" @click="ctxFile && handleRenameStart(ctxFile.id)">
        <span>重命名</span>
      </div>
      <div class="pf-ctx-divider"></div>
      <div class="pf-ctx-item" @click="movingFile = ctxFile?.id || null">
        <span>移动到分类 ▸</span>
        <div class="pf-ctx-submenu" v-if="ctxFile && movingFile === ctxFile.id">
          <div class="pf-ctx-subitem" @click="handleMoveTo(null)">无分类</div>
          <div class="pf-ctx-subitem" v-for="cat in categories.value" :key="cat.id" @click="handleMoveTo(cat.id)">
            {{ cat.name }}
          </div>
        </div>
      </div>
      <div class="pf-ctx-divider"></div>
      <div class="pf-ctx-item pf-ctx-item-danger" @click="handleDelete">
        <span>删除</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pf-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

/* ─── Header ─────────────────── */
.pf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-card);
  gap: 16px;
  flex-wrap: wrap;
}

.pf-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pf-header-left h2 {
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.01em;
}

.pf-stat {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.pf-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pf-search {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px;
  height: 34px;
  transition: border-color 0.15s;
}

.pf-search:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(79,110,247,0.1);
}

.pf-search-icon { color: var(--text-muted); flex-shrink: 0; }

.pf-search-input {
  width: 160px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text);
  outline: none;
  font-weight: 500;
}

.pf-search-input::placeholder { color: var(--text-muted); }

.pf-search-clear {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  display: flex; align-items: center; justify-content: center;
}

.pf-view-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}

.pf-view-btn:hover, .pf-view-btn.active {
  background: var(--bg-elevated);
  color: var(--text);
  border-color: var(--text-muted);
}

.pf-upload-btn {
  display: flex; align-items: center; gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: none;
  background: #4f6ef7;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(79,110,247,0.3);
}

.pf-upload-btn:hover { background: #3d5ce5; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(79,110,247,0.4); }
.pf-upload-btn:disabled { background: #94a3b8; cursor: not-allowed; transform: none; box-shadow: none; }

/* ─── Progress ──────────────── */
.pf-progress-bar {
  height: 3px;
  background: var(--bg-elevated);
  flex-shrink: 0;
}

.pf-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

/* ─── Body ──────────────────── */
.pf-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ─── Sidebar ───────────────── */
.pf-sidebar {
  width: 190px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}

.pf-categories {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
}

.pf-cat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.15s;
  position: relative;
  margin-bottom: 2px;
}

.pf-cat-item:hover { background: var(--bg-elevated); color: var(--text); }

.pf-cat-item.active {
  background: linear-gradient(135deg, var(--primary), #3d5ce5);
  color: #fff;
  box-shadow: 0 2px 8px rgba(79,110,247,0.25);
}

.pf-cat-item.active .pf-cat-count {
  color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.18);
}

.pf-cat-icon { font-size: 15px; flex-shrink: 0; width: 20px; text-align: center; }

.pf-cat-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.pf-cat-count {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
  min-width: 18px;
  text-align: center;
}

.pf-cat-sep {
  height: 1px;
  background: var(--border);
  margin: 10px 6px;
}

.pf-cat-actions {
  display: none;
  gap: 2px;
  position: absolute;
  right: 6px;
  background: var(--bg-card);
  border-radius: 6px;
  padding: 2px;
}

.pf-cat-item:hover .pf-cat-actions { display: flex; }

.pf-cat-act {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.pf-cat-act:hover { background: var(--bg-elevated); color: var(--text); }
.pf-cat-act-del:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

.pf-cat-rename-input {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  border: 2px solid var(--primary);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}

/* ─── New category ─────────── */
.pf-new-cat {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid var(--border);
}

.pf-new-cat-input {
  flex: 1;
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  border: 2px solid var(--primary);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
}

.pf-new-cat-confirm, .pf-new-cat-cancel {
  width: 28px; height: 30px;
  border-radius: 7px;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.pf-new-cat-confirm { background: var(--primary); color: #fff; }
.pf-new-cat-cancel { background: var(--bg-elevated); color: var(--text-secondary); }

.pf-add-cat-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 10px;
  margin: 8px;
  border-radius: 8px;
  font-size: 12px; font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1.5px dashed var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.pf-add-cat-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* ─── Content ───────────────── */
.pf-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.pf-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-card);
}

.pf-toolbar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.pf-toolbar-count {
  font-weight: 400;
  color: var(--text-muted);
}

/* ─── Empty ─────────────────── */
.pf-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.pf-empty::before {
  content: '📂';
  font-size: 40px;
  opacity: 0.3;
}

.pf-empty-upload {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  text-decoration: underline;
}

/* ─── Grid ──────────────────── */
.pf-grid {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  align-content: start;
}

.pf-image-card {
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.pf-image-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

.pf-image-wrap {
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.pf-image-wrap img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.pf-card-name {
  padding: 6px 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-card-meta {
  padding: 4px 8px 8px;
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.pf-grid-download {
  margin-left: auto;
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
  opacity: 0;
}

.pf-image-card:hover .pf-grid-download { opacity: 1; }

.pf-grid-download:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

/* ─── List ──────────────────── */
.pf-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.pf-list-item {
  display: flex;
  align-items: center;
  border-radius: 10px;
  transition: all 0.15s;
  border: 1px solid transparent;
  margin-bottom: 2px;
  position: relative;
}

.pf-list-item:hover {
  background: var(--bg-card);
  border-color: var(--border);
}

.pf-list-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  text-decoration: none;
  color: inherit;
  flex: 1;
  min-width: 0;
}

.pf-list-thumb {
  width: 38px; height: 38px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: var(--bg);
}

.pf-list-icon {
  font-size: 28px;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg);
  border-radius: 8px;
  flex-shrink: 0;
}

.pf-list-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.pf-list-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-list-meta {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.pf-list-type {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-elevated);
  font-size: 10px;
  font-weight: 600;
}

.pf-list-cat {
  color: var(--primary);
  font-weight: 500;
}

.pf-rename-input {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border: 2px solid var(--primary);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  outline: none;
  width: 100%;
}

/* ─── Item actions ──────────── */
.pf-item-actions {
  display: flex;
  gap: 2px;
  padding-right: 8px;
  opacity: 0;
  transition: opacity 0.15s;
  position: relative;
}

.pf-list-item:hover .pf-item-actions { opacity: 1; }

.pf-item-act {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.pf-item-act:hover { background: var(--bg-elevated); color: var(--text); }
.pf-item-act-danger:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

.pf-move-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 50;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  min-width: 120px;
  padding: 6px;
}

.pf-move-item {
  padding: 7px 10px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}

.pf-move-item:hover { background: var(--bg-elevated); }

/* ─── Preview ───────────────── */
.pf-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  cursor: pointer;
}

.pf-preview-overlay img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 12px;
  cursor: default;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.pf-preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px; height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.15);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

/* ─── Context menu ──────────── */
.pf-ctx-menu {
  position: fixed;
  z-index: 3000;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
  padding: 6px;
  min-width: 140px;
}

.pf-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  border-radius: 7px;
  font-weight: 500;
  position: relative;
}

.pf-ctx-item:hover { background: var(--bg-elevated); color: var(--primary); }

.pf-ctx-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 8px;
}

.pf-ctx-item-danger:hover { background: rgba(239,68,68,0.08); color: #ef4444; }

.pf-ctx-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  z-index: 3100;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 6px;
  min-width: 120px;
}

.pf-ctx-subitem {
  padding: 7px 10px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
}

.pf-ctx-subitem:hover { background: var(--bg-elevated); }

/* ─── Scrollbar ─────────────── */
.pf-categories::-webkit-scrollbar,
.pf-grid::-webkit-scrollbar,
.pf-list::-webkit-scrollbar { width: 4px; }

.pf-categories::-webkit-scrollbar-thumb,
.pf-grid::-webkit-scrollbar-thumb,
.pf-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
