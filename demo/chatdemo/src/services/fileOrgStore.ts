const STORAGE_PREFIX = 'wk_file_org_'

export interface FileCategory {
    id: string
    name: string
    order: number
}

interface FileOrgData {
    categories: FileCategory[]
    fileToCategory: Record<string, string> // clientMsgNo -> categoryId
}

function storeKey(channelID: string, channelType: number): string {
    return `${STORAGE_PREFIX}${channelID}_${channelType}`
}

function load(channelID: string, channelType: number): FileOrgData {
    try {
        const raw = localStorage.getItem(storeKey(channelID, channelType))
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { categories: [], fileToCategory: {} }
}

function save(channelID: string, channelType: number, data: FileOrgData): void {
    try {
        localStorage.setItem(storeKey(channelID, channelType), JSON.stringify(data))
    } catch { /* ignore */ }
}

export function getCategories(channelID: string, channelType: number): FileCategory[] {
    const data = load(channelID, channelType)
    data.categories.sort((a, b) => a.order - b.order)
    return data.categories
}

export function getFileCategoryId(channelID: string, channelType: number, clientMsgNo: string): string | null {
    const data = load(channelID, channelType)
    return data.fileToCategory[clientMsgNo] || null
}

export function getFileIdsInCategory(channelID: string, channelType: number, categoryId: string): Set<string> {
    const data = load(channelID, channelType)
    const ids = new Set<string>()
    for (const [msgNo, catId] of Object.entries(data.fileToCategory)) {
        if (catId === categoryId) ids.add(msgNo)
    }
    return ids
}

export function getCategoryCounts(channelID: string, channelType: number): Record<string, number> {
    const data = load(channelID, channelType)
    const counts: Record<string, number> = {}
    for (const cat of data.categories) {
        counts[cat.id] = 0
    }
    for (const catId of Object.values(data.fileToCategory)) {
        counts[catId] = (counts[catId] || 0) + 1
    }
    return counts
}

export function createCategory(channelID: string, channelType: number, name: string): FileCategory {
    const data = load(channelID, channelType)
    const maxOrder = data.categories.reduce((max, c) => Math.max(max, c.order), 0)
    const cat: FileCategory = {
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name,
        order: maxOrder + 1,
    }
    data.categories.push(cat)
    save(channelID, channelType, data)
    return cat
}

export function renameCategory(channelID: string, channelType: number, categoryId: string, name: string): void {
    const data = load(channelID, channelType)
    const cat = data.categories.find(c => c.id === categoryId)
    if (cat) {
        cat.name = name
        save(channelID, channelType, data)
    }
}

export function deleteCategory(channelID: string, channelType: number, categoryId: string): void {
    const data = load(channelID, channelType)
    data.categories = data.categories.filter(c => c.id !== categoryId)
    for (const key of Object.keys(data.fileToCategory)) {
        if (data.fileToCategory[key] === categoryId) {
            delete data.fileToCategory[key]
        }
    }
    save(channelID, channelType, data)
}

export function moveFile(channelID: string, channelType: number, clientMsgNo: string, categoryId: string | null): void {
    const data = load(channelID, channelType)
    if (categoryId) {
        data.fileToCategory[clientMsgNo] = categoryId
    } else {
        delete data.fileToCategory[clientMsgNo]
    }
    save(channelID, channelType, data)
}

export function batchMoveFiles(channelID: string, channelType: number, clientMsgNos: string[], categoryId: string | null): void {
    const data = load(channelID, channelType)
    for (const msgNo of clientMsgNos) {
        if (categoryId) {
            data.fileToCategory[msgNo] = categoryId
        } else {
            delete data.fileToCategory[msgNo]
        }
    }
    save(channelID, channelType, data)
}
