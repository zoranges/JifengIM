const STORAGE_KEY = 'wk_revoked_messages'

interface RevokedEntry {
    messageID?: string
    messageSeq: number
    revoker: string
}

interface ChannelRevokes {
    [clientMsgNo: string]: RevokedEntry
}

interface RevokeStore {
    [channelKey: string]: ChannelRevokes
}

function channelKey(channelID: string, channelType: number): string {
    return `${channelID}:${channelType}`
}

function loadStore(): RevokeStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return {}
}

function saveStore(store: RevokeStore): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch { /* ignore */ }
}

export function addRevokedMessage(
    channelID: string,
    channelType: number,
    clientMsgNo: string,
    messageID: string | undefined,
    messageSeq: number,
    revoker: string,
): void {
    const store = loadStore()
    const key = channelKey(channelID, channelType)
    if (!store[key]) store[key] = {}
    // Use messageID as fallback key to prevent empty-key overwrites when
    // multiple messages are revoked while user is in a different channel
    const entryKey = clientMsgNo || `mid:${messageID}` || `seq:${messageSeq}`
    store[key][entryKey] = { messageID, messageSeq, revoker }
    saveStore(store)
    console.log('[addRevokedMessage] key:', key, 'entryKey:', entryKey, 'messageID:', messageID, 'messageSeq:', messageSeq)
}

export function debugRevokeStore(): void {
    const store = loadStore()
    let cleaned = false
    for (const chKey of Object.keys(store)) {
        // Clean up old empty-string and "undefined"-keyed entries
        if (store[chKey]['undefined']) {
            delete store[chKey]['undefined']
            cleaned = true
        }
        if (store[chKey]['']) {
            delete store[chKey]['']
            cleaned = true
        }
    }
    if (cleaned) {
        saveStore(store)
    }
    console.log('[revokeStore] full store:', JSON.stringify(store, null, 2))
}

export function applyRevokes(messages: any[], channelID: string, channelType: number): void {
    const store = loadStore()
    const key = channelKey(channelID, channelType)
    const revoked = store[key]
    if (!revoked) {
        return
    }
    for (const m of messages) {
        // Match by clientMsgNo first, then by messageID, then by messageSeq
        const entry = revoked[m.clientMsgNo]
            || findEntryByMessageID(revoked, m.messageID)
            || findEntryByMessageSeq(revoked, m.messageSeq)
        if (entry) {
            if (!m.remoteExtra) {
                m.remoteExtra = {}
            }
            m.remoteExtra.revoke = true
            m.remoteExtra.revoker = entry.revoker
            if (!m.messageID && entry.messageID) {
                m.messageID = entry.messageID
            }
        }
    }
}

function findEntryByMessageID(revoked: ChannelRevokes, messageID: string): RevokedEntry | undefined {
    if (!messageID) return undefined
    for (const key of Object.keys(revoked)) {
        if (revoked[key].messageID === messageID) return revoked[key]
    }
    return undefined
}

function findEntryByMessageSeq(revoked: ChannelRevokes, messageSeq: number): RevokedEntry | undefined {
    if (!messageSeq) return undefined
    for (const key of Object.keys(revoked)) {
        if (revoked[key].messageSeq === messageSeq) return revoked[key]
    }
    return undefined
}
