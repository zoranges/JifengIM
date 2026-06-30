<script setup lang="ts">
import { Message } from 'wukongimjssdk'
import { useGroupFiles, type FileItem } from '../composables/useGroupFiles'
import { ref } from 'vue'

const props = defineProps<{
    messages: Message[]
    channelName: string
}>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const { allFiles, imageFiles, docFiles } = useGroupFiles(props.messages)
const previewUrl = ref('')
const tab = ref<'images' | 'docs'>('images')

const preview = (url: string) => { previewUrl.value = url }
const closePreview = () => { previewUrl.value = '' }

const fileCategory = (mime: string): string => {
    const m = mime.toLowerCase()
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
    const cat = fileCategory(mime)
    const map: Record<string, string> = {
        video: '🎬',
        audio: '🎵',
        pdf: '📕',
        sheet: '📊',
        slide: '📽️',
        doc: '📝',
        archive: '📦',
        code: '📜',
        file: '📎',
    }
    return map[cat] || '📎'
}

const fileTypeLabel = (mime: string): string => {
    const cat = fileCategory(mime)
    const map: Record<string, string> = {
        video: '视频',
        audio: '音频',
        pdf: 'PDF',
        sheet: '表格',
        slide: '演示',
        doc: '文档',
        archive: '压缩包',
        code: '代码',
        file: '文件',
    }
    return map[cat] || '文件'
}

const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s
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

        <div class="files-summary" v-if="allFiles.length > 0">
            <span>{{ allFiles.length }} 个文件</span>
            <span class="summary-divider">|</span>
            <span>{{ docFiles.length }} 个文档</span>
            <span class="summary-divider">|</span>
            <span>{{ imageFiles.length }} 张图片</span>
        </div>

        <div class="files-tabs">
            <button :class="{ active: tab === 'images' }" @click="tab = 'images'">
                图片 · {{ imageFiles.length }}
            </button>
            <button :class="{ active: tab === 'docs' }" @click="tab = 'docs'">
                文件 · {{ docFiles.length }}
            </button>
        </div>

        <div class="files-empty" v-if="tab === 'images' && imageFiles.length === 0">
            <span>暂无图片</span>
        </div>
        <div class="files-empty" v-if="tab === 'docs' && docFiles.length === 0">
            <span>暂无文件</span>
        </div>

        <!-- Image grid -->
        <div class="image-grid" v-if="tab === 'images' && imageFiles.length > 0">
            <div class="image-card" v-for="f in imageFiles" :key="f.clientMsgNo" @click="preview(f.url)">
                <img :src="f.url" loading="lazy" />
                <div class="image-meta">
                    <span class="image-sender">{{ f.sender }}</span>
                    <span class="image-size" v-if="f.width">{{ f.width }}×{{ f.height }}</span>
                </div>
            </div>
        </div>

        <!-- Doc list -->
        <div class="doc-list" v-if="tab === 'docs' && docFiles.length > 0">
            <div class="doc-item" v-for="f in docFiles" :key="f.clientMsgNo">
                <a :href="f.url" target="_blank" class="doc-link">
                    <span class="doc-icon">{{ fileIcon(f.mime) }}</span>
                    <div class="doc-info">
                        <span class="doc-name">{{ truncate(f.name, 26) }}</span>
                        <span class="doc-meta">
                            <span class="doc-type-tag">{{ fileTypeLabel(f.mime) }}</span>
                            <template v-if="f.sizeText"> · {{ f.sizeText }}</template>
                            <template v-if="f.sender"> · {{ f.sender }}</template>
                        </span>
                    </div>
                </a>
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
    width: 330px;
    flex-shrink: 0;
    background: var(--bg-card);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.files-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 12px;
    flex-shrink: 0;
}

.files-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
}

.close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.close-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.files-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px 12px;
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
}

.summary-divider {
    opacity: 0.3;
}

.files-tabs {
    display: flex;
    gap: 4px;
    padding: 0 16px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.files-tabs button {
    flex: 1;
    height: 34px;
    border-radius: var(--radius);
    font-size: 12px;
    font-weight: 500;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all var(--transition);
}

.files-tabs button.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
}

.files-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
}

/* Image grid */
.image-grid {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    align-content: start;
}

.image-card {
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-elevated);
    cursor: pointer;
    transition: all var(--transition);
}

.image-card:hover {
    transform: scale(1.03);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.image-card img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
}

.image-meta {
    padding: 6px 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
}

.image-sender {
    font-size: 10px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.image-size {
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
}

/* Doc list */
.doc-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
}

.doc-item {
    border-radius: var(--radius);
    transition: all var(--transition);
}

.doc-item:hover {
    background: var(--bg-elevated);
}

.doc-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    text-decoration: none;
    color: inherit;
}

.doc-icon {
    font-size: 26px;
    flex-shrink: 0;
    width: 36px;
    text-align: center;
}

.doc-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.doc-name {
    font-size: 13px;
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
    gap: 4px;
    flex-wrap: wrap;
}

.doc-type-tag {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-elevated);
    font-size: 10px;
    color: var(--text-secondary);
    font-weight: 500;
}

/* Preview overlay */
.preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    cursor: pointer;
}

.preview-overlay img {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: var(--radius);
    cursor: default;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
