import { ref, type Ref } from 'vue'
import { MessageContent, MessageImage, MessageText, Setting, Channel, WKSDK } from 'wukongimjssdk'
import APIClient from '../services/APIClient'

const makeImageContent = (file: File, fileUrl: string): Promise<MessageContent> => {
    return new Promise((resolve) => {
        const attachName = (c: MessageImage) => {
            const origEncode = c.encodeJSON.bind(c)
            c.encodeJSON = () => ({ ...origEncode(), name: file.name })
        }
        const img = new Image()
        img.src = URL.createObjectURL(file)
        img.onload = () => {
            const c = new MessageImage(undefined, img.naturalWidth, img.naturalHeight)
            c.url = fileUrl
            c.remoteUrl = fileUrl
            attachName(c)
            URL.revokeObjectURL(img.src)
            resolve(c)
        }
        img.onerror = () => {
            const c = new MessageImage(undefined, 0, 0)
            c.url = fileUrl
            c.remoteUrl = fileUrl
            attachName(c)
            resolve(c)
        }
    })
}

const uploadFile = (file: File, onProgress?: (pct: number) => void, onXHR?: (xhr: XMLHttpRequest) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
        const formData = new FormData()
        formData.append('file', file)
        const apiURL = APIClient.shared.config.apiURL
        const xhr = new XMLHttpRequest()
        if (onXHR) onXHR(xhr)
        xhr.upload.addEventListener('progress', (ev) => {
            if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100))
        })
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText).url || '') }
                catch { reject(new Error('解析上传响应失败')) }
            } else {
                reject(new Error(`上传失败 (${xhr.status})`))
            }
        })
        xhr.addEventListener('error', () => reject(new Error('网络错误')))
        xhr.addEventListener('abort', () => reject(new Error('上传取消')))
        xhr.open('POST', `${apiURL}/file/upload`)
        xhr.send(formData)
    })
}

export function useFileUpload(to: Ref<Channel>, onSent?: () => void) {
    const fileInput = ref<HTMLInputElement | null>(null)
    const uploading = ref(false)
    const uploadProgress = ref(0)
    let currentXHR: XMLHttpRequest | null = null

    const cancelUpload = () => {
        if (currentXHR) {
            currentXHR.abort()
            currentXHR = null
        }
        uploading.value = false
        uploadProgress.value = 0
    }

    const uploadAndSendFile = async (file: File) => {
        uploading.value = true
        uploadProgress.value = 0
        try {
            const fileUrl = await uploadFile(file, (pct) => { uploadProgress.value = pct }, (xhr) => { currentXHR = xhr })
            if (!fileUrl) throw new Error('上传返回缺少URL')

            const isImage = file.type.startsWith('image/')
            const content: MessageContent = isImage
                ? await makeImageContent(file, fileUrl)
                : new MessageText(`{file:${JSON.stringify({name: file.name, size: file.size, url: fileUrl, mime: file.type})}}`)

            const setting = Setting.fromUint8(0)
            WKSDK.shared().chatManager.send(content, to.value, setting)
            onSent?.()
        } catch (err: any) {
            throw err
        } finally {
            uploading.value = false
            uploadProgress.value = 0
            currentXHR = null
        }
    }

    const chooseFile = () => {
        fileInput.value?.click()
    }

    const onFileChange = async (e: Event) => {
        const input = e.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return
        try {
            await uploadAndSendFile(file)
        } catch (err: any) {
            if (err.message !== '上传取消') {
                alert('文件上传失败: ' + (err.message || '未知错误'))
            }
        } finally {
            if (input) input.value = ''
        }
    }

    return { fileInput, uploading, uploadProgress, chooseFile, onFileChange, uploadAndSendFile, cancelUpload }
}
