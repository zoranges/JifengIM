<script setup lang="ts">
import { ref, computed } from 'vue'
import { Message } from 'wukongimjssdk'
import { useGroupFiles } from '../composables/useGroupFiles'
import {
    getCategories, getFileCategoryId, getCategoryCounts,
    createCategory, renameCategory, deleteCategory,
    moveFile, batchMoveFiles,
} from '../services/fileOrgStore'

const props = defineProps<{
    messages: Message[]
    channelName: string
    channelType: number
}>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const { allFiles, imageFiles, videoFiles, audioFiles, docFiles } = useGroupFiles(props.messages)

const channelType = computed(() => props.channelType)

// ---- Category state ----
const categories = ref(getCategories(props.channelName, channelType.value))
const fileCategoryId = ref<Record<string, string | null>>({})
const categoryCounts = ref<Record<string, number>>({})
const selectedCategoryId = ref<string | null>(null) // null = all files

const refreshStore = () => {
    categories.value = getCategories(props.channelName, channelType.value)
    categoryCounts.value = getCategoryCounts(props.channelName, channelType.value)
    const map: Record<string, string | null> = {}
    for (const f of allFiles.value) {
        map[f.clientMsgNo] = getFileCategoryId(props.channelName, channelType.value, f.clientMsgNo)
    }
    fileCategoryId.value = map
}

refreshStore()

// ---- Category management ----
const newCatName = ref('')
const showAddCategory = ref(false)
const renamingId = ref<string | null>(null)
const renameText = ref('')

const handleAddCategory = () => {
    const name = newCatName.value.trim()
    if (!name) return
    createCategory(props.channelName, channelType.value, name)
    newCatName.value = ''
    showAddCategory.value = false
    refreshStore()
}

const handleRenameStart = (id: string) => {
    renamingId.value = id
    const cat = categories.value.find(c => c.id === id)
    renameText.value = cat?.name || ''
}

const handleRenameConfirm = () => {
    if (!renamingId.value) return
    const name = renameText.value.trim()
    if (name) {
        renameCategory(props.channelName, channelType.value, renamingId.value, name)
        refreshStore()
    }
    renamingId.value = null
}

const handleDeleteCategory = (id: string) => {
    deleteCategory(props.channelName, channelType.value, id)
    if (selectedCategoryId.value === id) selectedCategoryId.value = null
    refreshStore()
}

// ---- Computed file lists ----
const filesInCategory = computed(() => {
    if (selectedCategoryId.value === '__images') return imageFiles.value
    if (selectedCategoryId.value === '__videos') return videoFiles.value
    if (selectedCategoryId.value === '__audios') return audioFiles.value
    if (selectedCategoryId.value === '__docs') return docFiles.value
    if (selectedCategoryId.value === null) {
        return allFiles.value.filter(f => !fileCategoryId.value[f.clientMsgNo])
    }
    const catId = selectedCategoryId.value
    return allFiles.value.filter(f => fileCategoryId.value[f.clientMsgNo] === catId)
})

const activeTabCount = computed(() => {
    if (selectedCategoryId.value === '__images') return imageFiles.value.length
    if (selectedCategoryId.value === '__videos') return videoFiles.value.length
    if (selectedCategoryId.value === '__audios') return audioFiles.value.length
    if (selectedCategoryId.value === '__docs') return docFiles.value.length
    if (selectedCategoryId.value === null) return allFiles.value.filter(f => !fileCategoryId.value[f.clientMsgNo]).length
    return categoryCounts.value[selectedCategoryId.value] || 0
})

// ---- Multi-select ----
const selectMode = ref(false)
const selectedFiles = ref<Set<string>>(new Set())

const toggleSelectMode = () => {
    selectMode.value = !selectMode.value
    selectedFiles.value = new Set()
}

const toggleFileSelect = (clientMsgNo: string) => {
    const next = new Set(selectedFiles.value)
    if (next.has(clientMsgNo)) next.delete(clientMsgNo)
    else next.add(clientMsgNo)
    selectedFiles.value = next
    if (next.size === 0) selectMode.value = false
}

const selectAll = () => {
    selectedFiles.value = new Set(filesInCategory.value.map(f => f.clientMsgNo))
}

const batchMoveTo = (categoryId: string | null) => {
    if (selectedFiles.value.size === 0) return
    batchMoveFiles(props.channelName, channelType.value, Array.from(selectedFiles.value), categoryId)
    selectedFiles.value = new Set()
    selectMode.value = false
    refreshStore()
}

// ---- File move dropdown ----
const moveMenuFile = ref<string | null>(null)

const toggleMoveMenu = (clientMsgNo: string) => {
    moveMenuFile.value = moveMenuFile.value === clientMsgNo ? null : clientMsgNo
}

const moveSingleFile = (clientMsgNo: string, categoryId: string | null) => {
    moveFile(props.channelName, channelType.value, clientMsgNo, categoryId)
    moveMenuFile.value = null
    refreshStore()
}

// ---- Preview ----
const previewUrl = ref('')
const preview = (url: string) => { previewUrl.value = url }
const closePreview = () => { previewUrl.value = '' }

// ---- Helpers ----
const fileCategory = (mime: string): string => {
    const m = mime.toLowerCase()
    if (m.includes('image')) return 'image'
    if (m.includes('video')) return 'video'
    if (m.includes('audio')) return 'audio'
    if (m.includes('pdf')) return 'pdf'
    if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return 'sheet'
    if (m.includes('presentation') || m.includes('powerpoint')) return 'slide'
    if (m.includes('word') || m.includes('document')) return 'doc'
    if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('compress') || m.includes('tar') || m.includes('gzip')) return 'archive'
    if (m.includes('text') || m.includes('json') || m.includes('xml') || m.includes('javascript') || m.includes('python') || m.includes('java')) return 'code'
    return 'file'
}

const fileIcon = (mime: string): string => {
    const map: Record<string, string> = {
        image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', sheet: '📊', slide: '📽️',
        doc: '📝', archive: '📦', code: '📜', file: '📎',
    }
    return map[fileCategory(mime)] || '📎'
}

const fileTypeLabel = (mime: string): string => {
    const map: Record<string, string> = {
        image: '图片', video: '视频', audio: '音频', pdf: 'PDF', sheet: '表格', slide: '演示',
        doc: '文档', archive: '压缩包', code: '代码', file: '文件',
    }
    return map[fileCategory(mime)] || '文件'
}

const categoryNameFor = (clientMsgNo: string): string => {
    const catId = fileCategoryId.value[clientMsgNo]
    if (!catId) return ''
    const cat = categories.value.find(c => c.id === catId)
    return cat?.name || ''
}

const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s

// Close move menu when clicking outside
const closeMoveMenu = () => { moveMenuFile.value = null }
if (typeof window !== 'undefined') {
    window.addEventListener('click', closeMoveMenu)
}
</script>

<template>
    <div class="files-panel">
        <div class="files-header">
            <h3>{{ channelName }} · 文件管理</h3>
            <button class="close-btn" @click="emit('close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>

        <div class="files-body">
            <!-- Category sidebar -->
            <div class="category-sidebar">
                <div class="category-list">
                    <div class="category-item" :class="{ active: selectedCategoryId === null }"
                        @click="selectedCategoryId = null; selectMode = false">
                        <span class="cat-icon">📁</span>
                        <span class="cat-name">全部文件</span>
                        <span class="cat-count">{{ allFiles.filter(f => !fileCategoryId[f.clientMsgNo]).length }}</span>
                    </div>
                    <div class="category-item" :class="{ active: selectedCategoryId === '__images' }"
                        @click="selectedCategoryId = '__images'; selectMode = false">
                        <span class="cat-icon">🖼️</span>
                        <span class="cat-name">图片</span>
                        <span class="cat-count">{{ imageFiles.length }}</span>
                    </div>
                    <div class="category-item" :class="{ active: selectedCategoryId === '__videos' }"
                        @click="selectedCategoryId = '__videos'; selectMode = false">
                        <span class="cat-icon">🎬</span>
                        <span class="cat-name">视频</span>
                        <span class="cat-count">{{ videoFiles.length }}</span>
                    </div>
                    <div class="category-item" :class="{ active: selectedCategoryId === '__audios' }"
                        @click="selectedCategoryId = '__audios'; selectMode = false">
                        <span class="cat-icon">🎵</span>
                        <span class="cat-name">音频</span>
                        <span class="cat-count">{{ audioFiles.length }}</span>
                    </div>
                    <div class="category-item" :class="{ active: selectedCategoryId === '__docs' }"
                        @click="selectedCategoryId = '__docs'; selectMode = false">
                        <span class="cat-icon">📄</span>
                        <span class="cat-name">文档</span>
                        <span class="cat-count">{{ docFiles.length }}</span>
                    </div>

                    <div class="cat-separator"></div>

                    <div v-for="cat in categories" :key="cat.id" class="category-item"
                        :class="{ active: selectedCategoryId === cat.id }"
                        @click="selectedCategoryId = cat.id; selectMode = false"
                        @contextmenu.prevent="handleRenameStart(cat.id)">

                        <template v-if="renamingId === cat.id">
                            <input class="rename-input" v-model="renameText" @keyup.enter="handleRenameConfirm"
                                @blur="handleRenameConfirm" @click.stop autofocus />
                        </template>
                        <template v-else>
                            <span class="cat-icon">🏷️</span>
                            <span class="cat-name">{{ truncate(cat.name, 8) }}</span>
                            <span class="cat-count">{{ categoryCounts[cat.id] || 0 }}</span>
                            <div class="cat-actions" @click.stop>
                                <button class="cat-action-btn" title="重命名" @click="handleRenameStart(cat.id)">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                </button>
                                <button class="cat-action-btn cat-action-del" title="删除分类" @click="handleDeleteCategory(cat.id)">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                    </svg>
                                </button>
                            </div>
                        </template>
                    </div>
                </div>

                <div class="category-add" v-if="showAddCategory">
                    <input class="add-input" v-model="newCatName" placeholder="分类名称"
                        @keyup.enter="handleAddCategory" @keyup.escape="showAddCategory = false" autofocus />
                    <button class="add-confirm" @click="handleAddCategory">✓</button>
                    <button class="add-cancel" @click="showAddCategory = false">✕</button>
                </div>
                <button class="add-cat-btn" v-else @click="showAddCategory = true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>新建分类</span>
                </button>
            </div>

            <!-- File content area -->
            <div class="file-content">
                <!-- Toolbar -->
                <div class="file-toolbar">
                    <span class="toolbar-title">
                        {{ selectedCategoryId === '__images' ? '图片' :
                           selectedCategoryId === '__docs' ? '文档' :
                           selectedCategoryId === null ? '全部文件' :
                           categories.find(c => c.id === selectedCategoryId)?.name || '文件' }}
                        <span class="toolbar-count">({{ activeTabCount }})</span>
                    </span>
                    <div class="toolbar-actions">
                        <button v-if="selectMode" class="toolbar-btn" @click="selectAll">全选</button>
                        <button v-if="selectMode && selectedFiles.size > 0" class="toolbar-btn toolbar-btn-primary"
                            @click="batchMoveTo(null)">移出分类</button>
                        <div v-if="selectMode && selectedFiles.size > 0 && categories.length > 0" class="batch-move-dropdown">
                            <button class="toolbar-btn toolbar-btn-primary">移至... ▾</button>
                            <div class="batch-move-menu">
                                <div v-for="cat in categories" :key="cat.id" class="batch-move-item"
                                    @click="batchMoveTo(cat.id)">
                                    {{ cat.name }}
                                </div>
                            </div>
                        </div>
                        <button class="toolbar-btn" @click="toggleSelectMode"
                            :class="{ active: selectMode }">
                            {{ selectMode ? '取消' : '选择' }}
                        </button>
                    </div>
                </div>

                <!-- Empty -->
                <div class="files-empty" v-if="activeTabCount === 0">
                    <span>暂无文件</span>
                </div>

                <!-- Image grid -->
                <div class="image-grid" v-if="selectedCategoryId === '__images' && activeTabCount > 0">
                    <div class="file-card image-card" v-for="f in filesInCategory" :key="f.clientMsgNo"
                        :class="{ 'file-selected': selectedFiles.has(f.clientMsgNo) }">
                        <div class="file-check" v-if="selectMode" @click="toggleFileSelect(f.clientMsgNo)">
                            <div class="checkbox" :class="{ checked: selectedFiles.has(f.clientMsgNo) }">
                                <svg v-if="selectedFiles.has(f.clientMsgNo)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            </div>
                        </div>
                        <div class="image-wrap" @click="selectMode ? toggleFileSelect(f.clientMsgNo) : preview(f.url)">
                            <img :src="f.url" loading="lazy" />
                        </div>
                        <div class="image-name" :title="f.name">{{ f.name }}</div>
                        <div class="image-meta">
                            <span class="image-sender">{{ f.sender }}</span>
                            <span class="image-size" v-if="f.width">{{ f.width }}×{{ f.height }}</span>
                            <div class="file-move-trigger" v-if="!selectMode" @click.stop="toggleMoveMenu(f.clientMsgNo)">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                            </div>
                        </div>
                        <div class="category-tag" v-if="categoryNameFor(f.clientMsgNo)">{{ categoryNameFor(f.clientMsgNo) }}</div>
                        <!-- Move menu -->
                        <div class="move-menu" v-if="moveMenuFile === f.clientMsgNo" @click.stop>
                            <div class="move-menu-item" @click="moveSingleFile(f.clientMsgNo, null)">
                                <span>无分类</span>
                            </div>
                            <div class="move-menu-item" v-for="cat in categories" :key="cat.id"
                                @click="moveSingleFile(f.clientMsgNo, cat.id)">
                                <span>{{ cat.name }}</span>
                                <span class="move-check" v-if="fileCategoryId[f.clientMsgNo] === cat.id">✓</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Doc list -->
                <div class="doc-list" v-if="(selectedCategoryId === '__docs' || selectedCategoryId === null || (selectedCategoryId && selectedCategoryId !== '__images')) && activeTabCount > 0">
                    <div class="file-card doc-item" v-for="f in filesInCategory" :key="f.clientMsgNo"
                        :class="{ 'file-selected': selectedFiles.has(f.clientMsgNo) }">
                        <div class="file-check" v-if="selectMode" @click="toggleFileSelect(f.clientMsgNo)">
                            <div class="checkbox" :class="{ checked: selectedFiles.has(f.clientMsgNo) }">
                                <svg v-if="selectedFiles.has(f.clientMsgNo)" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            </div>
                        </div>
                        <a :href="f.url" target="_blank" class="doc-link"
                            @click="selectMode ? (toggleFileSelect(f.clientMsgNo), $event.preventDefault()) : (f.isImage ? (preview(f.url), $event.preventDefault()) : null)">
                            <img v-if="f.isImage" :src="f.url" class="doc-thumb" loading="lazy" />
                            <span v-else class="doc-icon">{{ fileIcon(f.mime) }}</span>
                            <div class="doc-info">
                                <span class="doc-name">{{ truncate(f.name, 22) }}</span>
                                <span class="doc-meta">
                                    <span class="doc-type-tag">{{ fileTypeLabel(f.mime) }}</span>
                                    <template v-if="f.isImage && f.width"> · {{ f.width }}×{{ f.height }}</template>
                                    <template v-if="f.sizeText"> · {{ f.sizeText }}</template>
                                    <template v-if="f.sender"> · {{ f.sender }}</template>
                                </span>
                            </div>
                        </a>
                        <div class="doc-right">
                            <div class="category-tag" v-if="categoryNameFor(f.clientMsgNo)">{{ categoryNameFor(f.clientMsgNo) }}</div>
                            <div class="file-move-trigger" v-if="!selectMode" @click.stop="toggleMoveMenu(f.clientMsgNo)">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                            </div>
                        </div>
                        <!-- Move menu -->
                        <div class="move-menu" v-if="moveMenuFile === f.clientMsgNo" @click.stop>
                            <div class="move-menu-item" @click="moveSingleFile(f.clientMsgNo, null)">
                                <span>无分类</span>
                            </div>
                            <div class="move-menu-item" v-for="cat in categories" :key="cat.id"
                                @click="moveSingleFile(f.clientMsgNo, cat.id)">
                                <span>{{ cat.name }}</span>
                                <span class="move-check" v-if="fileCategoryId[f.clientMsgNo] === cat.id">✓</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Preview overlay -->
        <transition name="fade">
            <div class="preview-overlay" v-if="previewUrl" @click="closePreview">
                <img :src="previewUrl" @click.stop="" />
            </div>
        </transition>
    </div>
</template>

<style scoped>
.files-panel {
    width: 450px;
    flex-shrink: 0;
    background: var(--bg-card);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

/* ---- Header ---- */
.files-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg-card);
}

.files-header h3 {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
}

.close-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all 0.2s;
}

.close-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

/* ---- Layout ---- */
.files-body {
    flex: 1;
    display: flex;
    overflow: hidden;
}

/* ---- Category sidebar ---- */
.category-sidebar {
    width: 150px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--bg);
}

.category-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
}

.category-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    transition: all 0.15s ease;
    position: relative;
    margin-bottom: 2px;
}

.category-item:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.category-item.active {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark, #3d5ce5));
    color: #fff;
    box-shadow: 0 2px 8px rgba(79,110,247,0.25);
}

.category-item.active .cat-count {
    color: rgba(255,255,255,0.75);
    background: rgba(255,255,255,0.18);
}

.cat-icon {
    font-size: 15px;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
}

.cat-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}

.cat-count {
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

.cat-separator {
    height: 1px;
    background: var(--border);
    margin: 10px 6px;
}

.cat-actions {
    display: none;
    gap: 2px;
    position: absolute;
    right: 6px;
    background: var(--bg-card);
    border-radius: 6px;
    padding: 2px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.category-item:hover .cat-actions {
    display: flex;
}

.cat-action-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all 0.15s;
}

.cat-action-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.cat-action-del:hover {
    background: rgba(239,68,68,0.1);
    color: #ef4444;
}

.rename-input {
    flex: 1;
    height: 24px;
    padding: 0 6px;
    font-size: 12px;
    border: 2px solid var(--primary);
    border-radius: 6px;
    background: var(--bg-card);
    color: var(--text);
    outline: none;
    font-weight: 500;
}

/* ---- Add category ---- */
.category-add {
    display: flex;
    gap: 4px;
    padding: 8px 6px;
    border-top: 1px solid var(--border);
    background: var(--bg);
}

.add-input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    font-size: 12px;
    border: 2px solid var(--primary);
    border-radius: 7px;
    background: var(--bg-card);
    color: var(--text);
    outline: none;
}

.add-confirm, .add-cancel {
    width: 28px;
    height: 30px;
    border-radius: 7px;
    border: none;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
}

.add-confirm {
    background: var(--primary);
    color: #fff;
}

.add-confirm:hover {
    opacity: 0.9;
}

.add-cancel {
    background: var(--bg-elevated);
    color: var(--text-secondary);
}

.add-cancel:hover {
    background: var(--border);
}

.add-cat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    margin: 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    background: transparent;
    border: 1.5px dashed var(--border);
    cursor: pointer;
    transition: all 0.2s;
}

.add-cat-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: rgba(79,110,247,0.04);
}

/* ---- File content area ---- */
.file-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
}

/* ---- Toolbar ---- */
.file-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-card);
}

.toolbar-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}

.toolbar-count {
    font-weight: 400;
    color: var(--text-muted);
    margin-left: 2px;
}

.toolbar-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}

.toolbar-btn {
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    background: var(--bg);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.15s;
}

.toolbar-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
    border-color: var(--text-muted);
}

.toolbar-btn.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
}

.toolbar-btn-primary {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
}

.toolbar-btn-primary:hover {
    opacity: 0.9;
}

/* ---- Batch move ---- */
.batch-move-dropdown {
    position: relative;
}

.batch-move-menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 100;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    min-width: 130px;
    padding: 6px;
    backdrop-filter: blur(12px);
}

.batch-move-dropdown:hover .batch-move-menu {
    display: block;
}

.batch-move-item {
    padding: 7px 12px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
}

.batch-move-item:hover {
    background: var(--bg-elevated);
}

/* ---- File cards ---- */
.file-card {
    position: relative;
}

.file-selected {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
    border-radius: 10px;
}

.file-check {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
    cursor: pointer;
}

.checkbox {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(128,128,128,0.4);
    background: var(--bg-card);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.checkbox.checked {
    background: var(--primary);
    border-color: var(--primary);
    box-shadow: 0 2px 6px rgba(79,110,247,0.3);
}

.checkbox svg {
    width: 13px;
    height: 13px;
    fill: #fff;
}

/* ---- Move trigger ---- */
.file-move-trigger {
    opacity: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.15s;
}

.file-card:hover .file-move-trigger,
.image-card:hover .file-move-trigger {
    opacity: 1;
}

.file-move-trigger:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

/* ---- Category tag ---- */
.category-tag {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(79,110,247,0.1);
    color: var(--primary);
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.02em;
}

/* ---- Move menu ---- */
.move-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 100;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    min-width: 120px;
    padding: 6px;
    backdrop-filter: blur(12px);
}

.move-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
}

.move-menu-item:hover {
    background: var(--bg-elevated);
}

.move-check {
    color: var(--primary);
    font-weight: 700;
    font-size: 13px;
}

/* ---- Empty ---- */
.files-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
    font-size: 13px;
}

.files-empty::before {
    content: '📂';
    font-size: 40px;
    opacity: 0.3;
}

/* ---- Image grid ---- */
.image-grid {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    align-content: start;
}

.image-card {
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-card);
    border: 1px solid var(--border);
    transition: all 0.2s;
}

.image-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.image-wrap {
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
}

.image-wrap:hover {
    opacity: 0.9;
}

.image-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(transparent 60%, rgba(0,0,0,0.15));
    pointer-events: none;
}

.image-wrap img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
}

.image-name {
    padding: 6px 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--bg-card);
}

.image-meta {
    padding: 6px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
    position: relative;
    background: var(--bg-card);
}

.image-sender {
    font-size: 11px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-weight: 500;
}

.image-size {
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
}

/* ---- Doc list ---- */
.doc-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.doc-item {
    border-radius: 10px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    margin-bottom: 2px;
}

.doc-item:hover {
    background: var(--bg-card);
    border-color: var(--border);
}

.doc-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    text-decoration: none;
    color: inherit;
    flex: 1;
    min-width: 0;
    border-radius: 10px;
}

.doc-icon {
    font-size: 28px;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    border-radius: 8px;
}

.doc-thumb {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 8px;
    background: var(--bg);
}

.doc-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
}

.doc-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.doc-meta {
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.doc-type-tag {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--bg-elevated);
    font-size: 10px;
    color: var(--text-secondary);
    font-weight: 600;
    letter-spacing: 0.02em;
}

.doc-right {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 10px;
    flex-shrink: 0;
    position: relative;
}

/* ---- Preview overlay ---- */
.preview-overlay {
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

.preview-overlay img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 12px;
    cursor: default;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* ---- Scrollbar ---- */
.category-list::-webkit-scrollbar,
.image-grid::-webkit-scrollbar,
.doc-list::-webkit-scrollbar {
    width: 4px;
}

.category-list::-webkit-scrollbar-thumb,
.image-grid::-webkit-scrollbar-thumb,
.doc-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
}

.category-list::-webkit-scrollbar-thumb:hover,
.image-grid::-webkit-scrollbar-thumb:hover,
.doc-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
}
</style>
