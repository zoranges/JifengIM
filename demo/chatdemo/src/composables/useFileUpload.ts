import { ref, type Ref } from 'vue'
import { MessageContent, MessageImage, MessageText, Setting, Channel, WKSDK } from 'wukongimjssdk'
import APIClient from '../services/APIClient'

export function useFileUpload(to: Ref<Channel>, onSent?: () => void) {
    const fileInput = ref<HTMLInputElement | null>(null)
    const uploading = ref(false)
    const uploadProgress = ref(0)

    const makeImageContent = (file: File, fileUrl: string): Promise<MessageContent> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.src = URL.createObjectURL(file)
            img.onload = () => {
                const c = new MessageImage(undefined, img.naturalWidth, img.naturalHeight)
                c.url = fileUrl
                c.remoteUrl = fileUrl
                URL.revokeObjectURL(img.src)
                resolve(c)
            }
            img.onerror = () => {
                const c = new MessageImage(undefined, 0, 0)
                c.url = fileUrl
                c.remoteUrl = fileUrl
                resolve(c)
            }
        })
    }

    const chooseFile = () => {
        fileInput.value?.click()
    }

    const onFileChange = async (e: Event) => {
        const input = e.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return

        uploading.value = true
        uploadProgress.value = 0

        try {
            const formData = new FormData()
            formData.append('file', file)

            const apiURL = APIClient.shared.config.apiURL
            const resp = await fetch(`${apiURL}/file/upload`, {
                method: 'POST',
                body: formData,
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                throw new Error((err as any).message || `上传失败 (${resp.status})`)
            }

            const data = await resp.json()
            const fileUrl = data.url
            if (!fileUrl) throw new Error('上传返回缺少URL')

            const isImage = file.type.startsWith('image/')
            const content: MessageContent = isImage
                ? await makeImageContent(file, fileUrl)
                : new MessageText(`{file:${JSON.stringify({name: file.name, size: file.size, url: fileUrl, mime: file.type})}}`)

            const setting = Setting.fromUint8(0)
            WKSDK.shared().chatManager.send(content, to.value, setting)
            onSent?.()
        } catch (err: any) {
            alert('文件上传失败: ' + (err.message || '未知错误'))
        } finally {
            uploading.value = false
            uploadProgress.value = 0
            if (input) input.value = ''
        }
    }

    return { fileInput, uploading, uploadProgress, chooseFile, onFileChange }
}
