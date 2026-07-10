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

const VIDEO_EXTS = new Set(['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', '3gp', 'mpg', 'mpeg', 'ogv', 'ts'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff', 'aif', 'ape'])
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'])

const fileType = computed(() => {
    const mime = fileMime.value?.toLowerCase() || ''
    const ext = fileName.value.split('.').pop()?.toLowerCase() || ''

    if (mime.startsWith('image/') || IMAGE_EXTS.has(ext)) return 'image'
    if (mime.startsWith('video/') || VIDEO_EXTS.has(ext)) return 'video'
    if (mime.startsWith('audio/') || AUDIO_EXTS.has(ext)) return 'audio'
    if (mime === 'application/pdf') return 'pdf'
    if (mime.includes('word') || mime.includes('document')) return 'doc'
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xls'
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return 'archive'
    if (mime.startsWith('text/')) return 'text'
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
    background: var(--bg);
    border: 1px solid var(--border);
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
    color: var(--text);
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
    background: rgba(79,110,247,0.15);
    color: var(--primary, #4f6ef7);
    font-weight: 600;
}

.file-size {
    font-size: 11px;
    color: var(--text-muted);
}

.file-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.file-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    color: #fff;
}

.preview-btn {
    background: var(--primary, #4f6ef7);
}

.preview-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 10px rgba(79,110,247,0.4);
}

.download-btn {
    background: var(--accent, #00d4aa);
}

.download-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 10px rgba(0,212,170,0.4);
}
</style>
