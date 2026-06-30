<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from 'wukongimjssdk'
import { formatFileSize, highlightText } from '../services/utils'

const props = defineProps<{
    message: Message
    searchQuery?: string
}>()

const displayName = computed(() => {
    if (props.searchQuery && fileName.value) {
        return highlightText(fileName.value, props.searchQuery)
    }
    return fileName.value || '未知文件'
})

const content = props.message.content

// Try to parse file info from message text
const fileInfo = computed(() => {
    const text = content?.text || ''
    // Format: {file:{...}} - extract inner JSON by tracking brace depth
    const prefix = '{file:'
    const idx = text.indexOf(prefix)
    if (idx !== -1) {
        try {
            const inner = text.slice(idx + prefix.length)
            let depth = 0, end = -1
            for (let i = 0; i < inner.length; i++) {
                if (inner[i] === '{') depth++
                else if (inner[i] === '}') {
                    depth--
                    if (depth === 0) { end = i + 1; break }
                }
            }
            if (end !== -1) {
                return JSON.parse(inner.slice(0, end))
            }
        } catch { /* ignore */ }
    }
    return null
})

const fileName = computed(() => fileInfo.value?.name || '')
const fileSize = computed(() => fileInfo.value?.size || 0)
const fileUrl = computed(() => fileInfo.value?.url || '')
const fileMime = computed(() => fileInfo.value?.mime || '')

const fileType = computed(() => {
    if (!fileMime.value) return 'file'
    if (fileMime.value.startsWith('image/')) return 'image'
    if (fileMime.value.startsWith('video/')) return 'video'
    if (fileMime.value.startsWith('audio/')) return 'audio'
    if (fileMime.value === 'application/pdf') return 'pdf'
    if (fileMime.value.includes('word') || fileMime.value.includes('document')) return 'doc'
    if (fileMime.value.includes('spreadsheet') || fileMime.value.includes('excel')) return 'xls'
    if (fileMime.value.includes('zip') || fileMime.value.includes('rar') || fileMime.value.includes('tar')) return 'archive'
    if (fileMime.value.startsWith('text/')) return 'text'
    return 'file'
})

const typeIcon = computed(() => {
    const icons: Record<string, string> = {
        pdf: '📕',
        doc: '📘',
        xls: '📊',
        archive: '📦',
        audio: '🎵',
        video: '🎬',
        image: '🖼️',
        text: '📄',
        file: '📎',
    }
    return icons[fileType.value] || '📎'
})

const typeLabel = computed(() => {
    const labels: Record<string, string> = {
        pdf: 'PDF',
        doc: '文档',
        xls: '表格',
        archive: '压缩包',
        audio: '音频',
        video: '视频',
        image: '图片',
        text: '文本',
        file: '文件',
    }
    return labels[fileType.value] || '文件'
})


const preview = () => {
    if (fileUrl.value) {
        window.open(fileUrl.value, '_blank')
    }
}

const download = () => {
    if (fileUrl.value && fileName.value) {
        const a = document.createElement('a')
        a.href = fileUrl.value
        a.download = fileName.value
        a.click()
    }
}
</script>

<template>
    <div class="file-card" v-if="fileInfo">
        <div class="file-icon">{{ typeIcon }}</div>
        <div class="file-info">
            <div class="file-name" v-html="displayName"></div>
            <div class="file-meta">
                <span class="file-type-badge">{{ typeLabel }}</span>
                <span class="file-size">{{ formatFileSize(fileSize) }}</span>
            </div>
        </div>
        <div class="file-actions">
            <button class="file-btn preview-btn" @click="preview" title="预览">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            </button>
            <button class="file-btn download-btn" @click="download" title="下载">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped>
.file-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    min-width: 240px;
    max-width: 320px;
}

.file-icon {
    font-size: 32px;
    flex-shrink: 0;
}

.file-info {
    flex: 1;
    min-width: 0;
}

.file-name {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4px;
}

.file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-type-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(79,110,247,0.2);
    color: #93a8fd;
    font-weight: 500;
}

.file-size {
    font-size: 11px;
    opacity: 0.6;
}

.file-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.file-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.file-btn:hover {
    background: rgba(255,255,255,0.12);
    color: #fff;
}

.preview-btn:hover {
    border-color: var(--primary, #4f6ef7);
    background: rgba(79,110,247,0.15);
}

.download-btn:hover {
    border-color: var(--accent, #00d4aa);
    background: rgba(0,212,170,0.15);
}
</style>
