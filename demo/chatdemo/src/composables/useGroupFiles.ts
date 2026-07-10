import { computed } from 'vue'
import { Message, MessageContentType } from 'wukongimjssdk'
import { formatFileSize } from '../services/utils'

export interface FileItem {
    name: string
    size: number
    sizeText: string
    url: string
    mime: string
    isImage: boolean
    fileType: 'image' | 'video' | 'audio' | 'doc'
    width?: number
    height?: number
    sender: string
    timestamp: number
    clientMsgNo: string
}

// 视频/音频常见扩展名，用于 MIME 缺失时的兜底判断
const VIDEO_EXTS = new Set(['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', '3gp', 'mpg', 'mpeg', 'ogv', 'ts'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff', 'aif', 'ape', 'mid', 'midi'])
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'])

function detectFileType(mime: string, filename: string): 'image' | 'video' | 'audio' | 'doc' {
    const m = mime.toLowerCase()
    if (m.startsWith('image/')) return 'image'
    if (m.startsWith('video/')) return 'video'
    if (m.startsWith('audio/')) return 'audio'

    // MIME 不标准时通过扩展名兜底
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (IMAGE_EXTS.has(ext)) return 'image'
    if (VIDEO_EXTS.has(ext)) return 'video'
    if (AUDIO_EXTS.has(ext)) return 'audio'
    return 'doc'
}

function fileNameFromUrl(url: string): string {
    try {
        const path = url.split('?')[0].split('#')[0]
        const seg = path.substring(path.lastIndexOf('/') + 1)
        return decodeURIComponent(seg)
    } catch {
        return ''
    }
}

function parseFilePayload(text: string): { name: string; size: number; url: string; mime: string } | null {
    try {
        const prefix = '{file:'
        const idx = text.indexOf(prefix)
        if (idx === -1) return null
        // Extract JSON object: {file:{...}} -> need inner {...} only
        const inner = text.slice(idx + prefix.length)
        // Find matching closing brace by tracking depth
        let depth = 0
        let end = -1
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === '{') depth++
            else if (inner[i] === '}') {
                depth--
                if (depth === 0) { end = i + 1; break }
            }
        }
        if (end === -1) return null
        const jsonStr = inner.slice(0, end)
        const meta = JSON.parse(jsonStr)
        if (!meta.url) return null
        return {
            name: meta.name || '文件',
            size: meta.size || 0,
            url: meta.url || '',
            mime: meta.mime || '',
        }
    } catch (_) {
        return null
    }
}

export function useGroupFiles(messages: Message[]) {
    const allFiles = computed<FileItem[]>(() => {
        const result: FileItem[] = []
        for (const m of messages) {
            try {
                if (m.contentType === MessageContentType.image) {
                    const c = (m as any).content
                    const url = c?.url || c?.remoteUrl || ''
                    if (!url) continue
                    // Prefer the original filename carried in the payload; fall
                    // back to the URL's last segment for legacy images sent
                    // before filenames were persisted, then to a generic label.
                    const name = c?.name || c?.contentObj?.name || fileNameFromUrl(url) || '图片'
                    result.push({
                        name,
                        size: 0,
                        sizeText: '',
                        url,
                        mime: 'image/',
                        isImage: true,
                        fileType: 'image',
                        width: c?.width || 0,
                        height: c?.height || 0,
                        sender: m.fromUID || '',
                        timestamp: m.timestamp,
                        clientMsgNo: m.clientMsgNo,
                    })
                } else {
                    const text = (m as any).content?.text || ''
                    const file = parseFilePayload(text)
                    if (file && file.url) {
                        result.push({
                            ...file,
                            sizeText: file.size ? formatFileSize(file.size) : '',
                            isImage: false,
                            fileType: detectFileType(file.mime || '', file.name || ''),
                            sender: m.fromUID || '',
                            timestamp: m.timestamp,
                            clientMsgNo: m.clientMsgNo,
                        })
                    }
                }
            } catch (_) { /* skip malformed message */ }
        }
        result.reverse()
        return result
    })

    const imageFiles = computed(() => allFiles.value.filter(f => f.fileType === 'image'))
    const videoFiles = computed(() => allFiles.value.filter(f => f.fileType === 'video'))
    const audioFiles = computed(() => allFiles.value.filter(f => f.fileType === 'audio'))
    const docFiles = computed(() => allFiles.value.filter(f => f.fileType === 'doc'))

    return { allFiles, imageFiles, videoFiles, audioFiles, docFiles }
}
