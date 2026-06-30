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
    width?: number
    height?: number
    sender: string
    timestamp: number
    clientMsgNo: string
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
                    result.push({
                        name: '图片',
                        size: 0,
                        sizeText: '',
                        url,
                        mime: 'image/',
                        isImage: true,
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

    const imageFiles = computed(() => allFiles.value.filter(f => f.isImage))
    const docFiles = computed(() => allFiles.value.filter(f => !f.isImage))

    return { allFiles, imageFiles, docFiles }
}
