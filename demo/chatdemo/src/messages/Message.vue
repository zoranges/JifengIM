<script setup lang="ts">

import { computed, ref } from 'vue'
import { Message, MessageContentType, MessageStatus } from 'wukongimjssdk';
import Text from './Text.vue'
import CustomMessage from './CustomMessage.vue'
import { orderMessage } from '../customessage'
import Stream from './Stream.vue';
import ImageMsg from './Image.vue';
import FileCard from './FileCard.vue';
import APIClient from '../services/APIClient';
import { addRevokedMessage } from '../services/revokeStore';

const props = defineProps<{
    message: Message
    searchQuery?: string
    isGroup?: boolean
    isPinned?: boolean
}>()

const emit = defineEmits<{
    (e: 'reply', msg: Message): void
    (e: 'pin', msg: Message): void
    (e: 'unpin', msg: Message): void
}>()

const contentType = props.message.content?.contentType
const streamOn = props.message.setting?.streamOn

const isFileMessage = computed(() => {
    if (contentType !== MessageContentType.text) return false
    const text = props.message.content?.text || ''
    return text.startsWith('{file:')
})

const voiceInfo = computed(() => {
    const text = props.message.content?.text || ''
    if (!text.startsWith('{voice:')) return null
    try {
        return JSON.parse(text.slice(7, text.lastIndexOf('}') + 1)) as { url: string, duration: number }
    } catch {
        return null
    }
})

const revoked = computed(() => {
    const isRevoked = props.message.remoteExtra?.revoke === true
    if (isRevoked) {
        console.log('[Message.vue] REVOKED msg - messageID:', props.message.messageID, 'remoteExtra:', JSON.stringify(props.message.remoteExtra))
    }
    return isRevoked
})

const canRevoke = computed(() => {
    if (revoked.value) return false
    if (!props.message.send) return false
    if (props.message.status !== 1) return false // MessageStatus.Normal
    const now = Date.now() / 1000
    const elapsed = now - props.message.timestamp
    return elapsed < 120 // 2 minutes
})

const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

const handleContextMenu = (e: MouseEvent) => {
    if (revoked.value) return
    e.preventDefault()
    contextMenuPos.value = { x: e.clientX, y: e.clientY }
    showContextMenu.value = true
}

const handleReply = () => {
    showContextMenu.value = false
    emit('reply', props.message)
}

const closeContextMenu = () => {
    showContextMenu.value = false
}

const readReceipt = computed(() => {
    const extra = props.message.remoteExtra
    if (!extra) return ''
    if (extra.readedCount && extra.readedCount > 0) {
        return `${extra.readedCount}人已读`
    }
    if (extra.readed) return '已读'
    return ''
})

const isEdited = computed(() => {
    return props.message.remoteExtra?.isEdit === true
})

const mentionInfo = computed(() => {
    const mention = (props.message.content as any)?.mention
    if (!mention) return null
    if (mention.all) return { label: '@所有人', isMe: false }
    if (mention.uids && mention.uids.length > 0) {
        const uid = (window as any).__WK_UID__ || ''
        if (mention.uids.includes(uid)) return { label: '@你', isMe: true }
        return { label: `@${mention.uids[0]}`, isMe: false }
    }
    return null
})

const handleRevoke = async () => {
    showContextMenu.value = false
    try {
        await APIClient.shared.revokeMessage(
            props.message.channel,
            props.message.messageID,
            props.message.messageSeq,
        )
        props.message.remoteExtra.revoke = true
        props.message.remoteExtra.revoker = props.message.fromUID
        addRevokedMessage(
            props.message.channel.channelID,
            props.message.channel.channelType,
            props.message.clientMsgNo,
            props.message.messageID,
            props.message.messageSeq,
            props.message.fromUID,
        )
    } catch { /* ignore */ }
}

const handlePin = () => {
    showContextMenu.value = false
    emit('pin', props.message)
}

const handleUnpin = () => {
    showContextMenu.value = false
    emit('unpin', props.message)
}

// Close menu on click outside
if (typeof window !== 'undefined') {
    window.addEventListener('click', closeContextMenu)
}

</script>

<template>
    <div @contextmenu="handleContextMenu">
        <div class="revoked-msg" v-if="revoked">
            <span class="revoked-text">消息已撤回</span>
        </div>
        <template v-else>
            <Stream :message="$props.message" v-if="streamOn"></Stream>
            <div class="voice-msg" v-else-if="voiceInfo">
                <button class="voice-play-btn" @click="(e) => { const a = (e.target as HTMLElement).querySelector('audio') as HTMLAudioElement; a?.play() }">
                    <audio :src="voiceInfo.url" preload="metadata"></audio>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="5,3 19,12 5,21"/></svg>
                </button>
                <span class="voice-duration">{{ voiceInfo.duration }}"</span>
            </div>
            <FileCard :message="$props.message" :searchQuery="searchQuery" v-else-if="isFileMessage"></FileCard>
            <Text :message="$props.message" :searchQuery="searchQuery" v-else-if="contentType === MessageContentType.text"></Text>
            <ImageMsg :message="$props.message" v-else-if="contentType === MessageContentType.image"></ImageMsg>
            <CustomMessage :message="$props.message" v-else-if="contentType === orderMessage" ></CustomMessage>
            <div class="msg-meta" v-if="isEdited || readReceipt || mentionInfo || isPinned">
                <span class="msg-mention" v-if="mentionInfo" :class="{ 'mention-me': mentionInfo.isMe }">{{ mentionInfo.label }}</span>
                <span class="msg-edited" v-if="isEdited">已编辑</span>
                <span class="msg-pinned" v-if="isPinned" title="已置顶">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                    </svg>
                    已置顶
                </span>
                <span class="msg-read-receipt" v-if="readReceipt">{{ readReceipt }}</span>
            </div>
        </template>

        <!-- Context menu -->
        <div class="context-menu" v-if="showContextMenu" :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }" @click.stop>
            <button class="context-menu-item" @click="handleReply">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="9 17 4 12 9 7"/>
                    <path d="M20 18v-2a4 4 0 00-4-4H4"/>
                </svg>
                <span>回复</span>
            </button>
            <button class="context-menu-item" v-if="isGroup && !isPinned" @click="handlePin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                </svg>
                <span>置顶</span>
            </button>
            <button class="context-menu-item" v-if="isGroup && isPinned" @click="handleUnpin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                </svg>
                <span>取消置顶</span>
            </button>
            <button class="context-menu-item" v-if="canRevoke" @click="handleRevoke">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                <span>撤回</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.revoked-msg {
    padding: 6px 12px;
    font-size: 12px;
    opacity: 0.5;
    font-style: italic;
    user-select: none;
}

.context-menu {
    position: fixed;
    z-index: 9999;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    padding: 4px;
    min-width: 120px;
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.context-menu-item:hover {
    background: var(--bg-elevated);
    color: var(--primary);
}

.msg-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
    font-size: 11px;
    user-select: none;
}

.msg-edited {
    color: var(--text-muted);
    opacity: 0.6;
}

.msg-pinned {
    color: var(--primary);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    opacity: 0.8;
}

.msg-read-receipt {
    color: var(--text-muted);
    opacity: 0.55;
}

.msg-mention {
    color: var(--primary);
    font-weight: 600;
}

.msg-mention.mention-me {
    background: rgba(79, 110, 247, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
}

.voice-msg {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 120px;
}

.voice-play-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--primary);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.voice-play-btn:hover {
    transform: scale(1.08);
}

.voice-duration {
    font-size: 13px;
    color: var(--text-secondary);
}
</style>
