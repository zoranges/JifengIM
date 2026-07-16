const STORAGE_PREFIX = 'wk_my_docs_'

export interface SavedFile {
    clientMsgNo: string
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
    savedAt: number
}

function storeKey(uid: string): string {
    return `${STORAGE_PREFIX}${uid}`
}

export function getMyDocs(uid: string): SavedFile[] {
    try {
        const raw = localStorage.getItem(storeKey(uid))
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return []
}

export function saveToMyDocs(uid: string, file: SavedFile): void {
    const docs = getMyDocs(uid)
    if (docs.some(f => f.clientMsgNo === file.clientMsgNo)) return // already saved
    docs.push(file)
    try { localStorage.setItem(storeKey(uid), JSON.stringify(docs)) } catch { /* ignore */ }
}

export function removeFromMyDocs(uid: string, clientMsgNo: string): void {
    const docs = getMyDocs(uid).filter(f => f.clientMsgNo !== clientMsgNo)
    try { localStorage.setItem(storeKey(uid), JSON.stringify(docs)) } catch { /* ignore */ }
}

export function isInMyDocs(uid: string, clientMsgNo: string): boolean {
    return getMyDocs(uid).some(f => f.clientMsgNo === clientMsgNo)
}
