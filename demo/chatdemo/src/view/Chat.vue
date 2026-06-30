<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import APIClient from '../services/APIClient'
import { avatarUrl } from '../services/utils'
import { useRouter } from 'vue-router'
import {
    WKSDK, Channel, ChannelTypePerson, ChannelTypeGroup, MessageStatus,
    ConnectionInfo,
} from 'wukongimjssdk'
import { ConnectStatus } from 'wukongimjssdk'
import type { ConnectStatusListener } from 'wukongimjssdk'
import Conversation from '../components/Conversation/index.vue'
import MessageUI from '../messages/Message.vue'
import { useMarkdown } from '../composables/useMarkdown'
import { useFileUpload } from '../composables/useFileUpload'
import { useChatMessages } from '../composables/useChatMessages'
import GroupFilesPanel from './GroupFiles.vue'

useMarkdown()

const router = useRouter()
const chatRef = ref<HTMLElement | null>(null)
const showSettingPanel = ref(false)
const title = ref('')
const sidebarVisible = ref(true)
const showFilesPanel = ref(false)

const channelID = ref('')
const p2p = ref(true)
const to = ref(new Channel('', 0))
const placeholder = ref('请输入对方登录名')

const uid = router.currentRoute.value.query.uid as string || undefined
const token = router.currentRoute.value.query.token as string || 'token111'

title.value = `${uid || ''} (未连接)`

const {
    messages, displayMessages, text, msgInputPlaceholder,
    pulldowning, pulldownFinished,
    isComposing, hasHandled,
    setupListeners, teardownListeners,
    pullLast, handleScroll, scrollBottom,
    onSend: _onSend, onCustomMessageSend: _onCustomMessageSend,
    isFirstInGroup, isLastInGroup, formatMsgTime,
    addSystemEvent, isSystemMessage,
    searchQuery, searchVisible, showFilesOnly,
    toggleSearch, toggleFilesOnly,
    members, onlineCount,
    clearMessages,
} = useChatMessages(to, uid || '', chatRef)

const { fileInput, uploading, uploadProgress, chooseFile: _chooseFile, onFileChange: _onFileChange } = useFileUpload(to, scrollBottom)

const chooseFile = () => {
    if (!to.value || to.value.channelID.trim() === '') {
        showSettingPanel.value = true
        return
    }
    _chooseFile()
}
const onFileChange = (e: Event) => {
    if (!to.value || to.value.channelID.trim() === '') {
        showSettingPanel.value = true
        return
    }
    return _onFileChange(e)
}

let connectStatusListener!: ConnectStatusListener

onMounted(() => {
    if (APIClient.shared.config.apiURL === undefined) {
        WKSDK.shared().connectManager.disconnect()
        router.push({ path: '/' })
        return
    }
    APIClient.shared.get('/route', {
        param: { uid: router.currentRoute.value.query.uid },
    }).then((res: any) => {
        let addr = res.wss_addr
        if (!addr || addr === '') {
            addr = res.ws_addr
        }
        connectIM(addr)
    }).catch((err: any) => {
        console.error('route error:', err)
    })
})

const connectIM = (addr: string) => {
    const config = WKSDK.shared().config
    if (uid && token) {
        config.uid = uid
        config.token = token
    }
    config.addr = addr
    config.sendCountOfEach = 100000
    WKSDK.shared().config = config

    connectStatusListener = (status: ConnectStatus, _reasonCode?: number, connectionInfo?: ConnectionInfo) => {
        if (status === ConnectStatus.Connected) {
            if (connectionInfo) {
                title.value = `${uid || ''} (已连接 · 节点${connectionInfo.nodeId})`
            } else {
                title.value = `${uid || ''} (已连接)`
            }
        } else {
            title.value = `${uid || ''} (已断开)`
        }
    }
    WKSDK.shared().connectManager.addConnectStatusListener(connectStatusListener)

    setupListeners()
    WKSDK.shared().connect()
}

onUnmounted(() => {
    WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener)
    teardownListeners()
    WKSDK.shared().disconnect()
})

const chatP2pClick = (v: any) => {
    p2p.value = v.target.checked
    placeholder.value = p2p.value ? '请输入对方登录名' : '请输入群组ID'
}
const chatGroupClick = (v: any) => {
    p2p.value = !v.target.checked
    placeholder.value = p2p.value ? '请输入对方登录名' : '请输入群组ID'
}

const settingClick = () => {
    showSettingPanel.value = !showSettingPanel.value
}
const settingOKClick = () => {
    if (p2p.value) {
        to.value = new Channel(channelID.value, ChannelTypePerson)
    } else {
        to.value = new Channel(channelID.value, ChannelTypeGroup)
    }
    if (!p2p.value) {
        APIClient.shared.joinChannel(to.value.channelID, to.value.channelType, WKSDK.shared().config.uid || '')
    }
    const conversation = WKSDK.shared().conversationManager.findConversation(to.value)
    if (!conversation) {
        WKSDK.shared().conversationManager.createEmptyConversation(to.value)
    }
    showSettingPanel.value = false
    clearMessages()
    pullLast()
    addSystemEvent(`你邀请 ${channelID.value} 加入了会话`)
}
const onSelectChannel = (channel: Channel) => {
    to.value = channel
    channelID.value = channel.channelID
    p2p.value = channel.channelType === ChannelTypePerson
    showSettingPanel.value = false
    clearMessages()
    pullLast()
    addSystemEvent(`你加入了与 ${channel.channelID} 的会话`)
}

const logout = () => {
    WKSDK.shared().connectManager.disconnect()
    router.push({ path: '/' })
}

const onEnter = () => {
    if (hasHandled.value || isComposing.value) return
    onSend()
}
const onKeydown = (_e: any) => {
    if (!isComposing.value) { hasHandled.value = false; return }
    hasHandled.value = true
}

const onSend = () => {
    if (!to.value || to.value.channelID === '') {
        showSettingPanel.value = true
        return
    }
    _onSend()
}
const onCustomMessageSend = () => {
    if (!to.value || to.value.channelID.trim() === '') {
        showSettingPanel.value = true
        return
    }
    _onCustomMessageSend()
}

const toggleSidebar = () => {
    sidebarVisible.value = !sidebarVisible.value
}

const toggleFilesPanel = () => {
    showFilesPanel.value = !showFilesPanel.value
    if (showFilesPanel.value) {
        showFilesOnly.value = false
    }
}
</script>
<template>
    <div class="chat">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <button class="icon-btn" @click="toggleSidebar" title="会话列表">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 12h18M3 6h18M3 18h18" />
                    </svg>
                </button>
                <span class="brand">疾风即时</span>
            </div>
            <div class="header-center">
                <div class="connection-badge" :class="{ connected: title.includes('已连接') }">
                    <span class="dot"></span>
                    <span class="status-text">{{ title }}</span>
                </div>
            </div>
            <div class="header-right">
                <button class="icon-btn" :class="{ active: showFilesPanel }" @click="toggleFilesPanel" title="文件管理" v-if="to.channelID">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                </button>
                <button class="icon-btn" :class="{ active: searchVisible }" @click="toggleSearch" title="搜索" v-if="to.channelID">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                </button>
                <button class="chat-btn" @click="settingClick">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span class="chat-target">
                        {{ to.channelID ? `${p2p ? '单聊' : '群聊'} · ${to.channelID}` : '新建会话' }}
                        <template v-if="to.channelID && !p2p && members.size > 0">
                            · {{ onlineCount }}在线 · {{ members.size }}人
                        </template>
                    </span>
                </button>
                <button class="icon-btn logout-btn" @click="logout" title="退出">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                </button>
            </div>
        </header>

        <!-- Body -->
        <div class="body">
            <!-- Sidebar -->
            <transition name="slide">
                <aside class="sidebar" v-if="sidebarVisible">
                    <div class="sidebar-header">
                        <h3>会话列表</h3>
                    </div>
                    <Conversation :onSelectChannel="onSelectChannel" />
                </aside>
            </transition>

            <!-- Chat area -->
            <main class="chat-main" :class="{ expanded: !sidebarVisible }">
                <!-- Empty state -->
                <div class="empty-state" v-if="!to.channelID">
                    <div class="empty-icon">
                        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="40" cy="40" r="38" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.3"/>
                            <path d="M28 35h24M28 45h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
                        </svg>
                    </div>
                    <h2>疾风即时</h2>
                    <p>选择一个会话或创建新会话开始聊天</p>
                </div>

                <!-- Search bar -->
                <div class="search-bar" v-if="to.channelID && searchVisible">
                    <input
                        v-model="searchQuery"
                        placeholder="搜索聊天记录..."
                        class="search-input"
                        autofocus
                    />
                    <span class="search-count" v-if="searchQuery && displayMessages.length !== messages.length">
                        {{ displayMessages.length }} 条结果
                    </span>
                </div>

                <!-- Messages -->
                <div class="message-list" v-on:scroll="handleScroll" ref="chatRef" v-if="to.channelID">
                    <div class="load-more" v-if="pulldowning">加载中...</div>
                    <template v-for="(m, i) in displayMessages" :key="m.clientMsgNo">
                        <div class="msg-time-divider" v-if="i === 0 || (m.timestamp - displayMessages[i-1].timestamp) > 300">{{ formatMsgTime(m.timestamp) }}</div>
                        <div class="msg-system" v-if="isSystemMessage(m)">
                            <span>{{ m.content?.text }}</span>
                        </div>
                        <div class="msg-row" v-else :class="{ 'msg-sent': m.send, 'msg-first': isFirstInGroup(i), 'msg-last': isLastInGroup(i) }" :id="m.clientMsgNo">
                            <div class="msg-avatar" v-if="!m.send">
                                <img :src="avatarUrl(m.fromUID)" />
                            </div>
                            <div class="msg-body" :class="{ 'msg-body-sent': m.send }">
                                <div class="msg-sender" v-if="!m.send && isFirstInGroup(i)">{{ m.fromUID }}</div>
                                <div class="msg-bubble" :class="{ 'bubble-sent': m.send, 'bubble-recv': !m.send }">
                                    <div class="msg-status" v-if="m.send && m.status === MessageStatus.Wait">
                                        <span class="sending-dots"><i>.</i><i>.</i><i>.</i></span>
                                    </div>
                                    <MessageUI :message="m" :searchQuery="searchQuery" />
                                </div>
                                <div class="msg-time" v-if="m.send && m.status === MessageStatus.Fail">发送失败</div>
                            </div>
                            <div class="msg-avatar" v-if="m.send">
                                <img :src="avatarUrl(m.fromUID)" />
                            </div>
                        </div>
                    </template>
                </div>

                <!-- Input area -->
                <div class="input-area" v-if="to.channelID">
                    <div class="upload-bar" v-if="uploading">
                        <span class="upload-text">上传中...</span>
                    </div>
                    <div class="input-row">
                        <input
                            type="file"
                            ref="fileInput"
                            style="display:none"
                            @change="onFileChange"
                            accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,text/plain"
                        />
                        <button class="attach-btn" @click="chooseFile" :disabled="uploading" title="发送文件或图片">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                            </svg>
                        </button>
                        <input
                            :placeholder="msgInputPlaceholder"
                            v-model="text"
                            @keyup.enter="onEnter"
                            @keydown.enter="onKeydown"
                            @compositionstart="isComposing = true"
                            @compositionend="isComposing = false"
                        />
                        <button class="send-btn" @click="onSend">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </main>

            <!-- File management panel -->
            <GroupFilesPanel
                v-if="to.channelID && showFilesPanel"
                :messages="messages"
                :channelName="to.channelID"
                @close="showFilesPanel = false"
            />
        </div>

        <!-- Setting modal -->
        <transition name="modal">
            <div class="modal-overlay" v-if="showSettingPanel" @click="settingClick">
                <div class="modal-card" @click.stop="">
                    <h3>发起会话</h3>
                    <div class="switch-row">
                        <button class="switch-btn" :class="{ active: p2p }" @click="p2p = true">单聊</button>
                        <button class="switch-btn" :class="{ active: !p2p }" @click="p2p = false">群聊</button>
                    </div>
                    <input :placeholder="placeholder" class="modal-input" v-model="channelID" />
                    <button class="modal-ok" @click="settingOKClick">开始聊天</button>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
/* ===== Layout ===== */
.chat {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow: hidden;
}

/* ===== Header ===== */
.header {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    z-index: 100;
    flex-shrink: 0;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.brand {
    font-size: 17px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.header-center {
    display: flex;
    align-items: center;
}

.connection-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-elevated);
    font-size: 13px;
    color: var(--text-muted);
}

.connection-badge .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    transition: background var(--transition);
}

.connection-badge.connected .dot {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.connection-badge.connected {
    color: var(--text);
}

.header-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.icon-btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.icon-btn:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.icon-btn.active {
    background: var(--primary);
    color: #fff;
}

.icon-btn svg {
    width: 20px;
    height: 20px;
}

.chat-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 16px;
    border-radius: 20px;
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.chat-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 110, 247, 0.35);
}

/* ===== Body ===== */
.body {
    flex: 1;
    display: flex;
    overflow: hidden;
    height: calc(100vh - 60px);
}

/* ===== Sidebar ===== */
.sidebar {
    width: 300px;
    flex-shrink: 0;
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
}

.sidebar-header {
    padding: 20px 20px 12px;
    flex-shrink: 0;
}

.sidebar-header h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
}

/* ===== Chat main ===== */
.chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    position: relative;
}

.chat-main.expanded {
    /* full width when sidebar hidden */
}

/* ===== Empty state ===== */
.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
}

.empty-icon {
    width: 80px;
    height: 80px;
    color: var(--text-muted);
    margin-bottom: 8px;
}

.empty-state h2 {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.empty-state p {
    font-size: 14px;
    color: var(--text-muted);
}

/* ===== Message list ===== */
.message-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.load-more {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    padding: 12px;
}

/* ===== Search bar ===== */
.search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.search-input {
    flex: 1;
    height: 38px;
    padding: 0 14px;
    border-radius: var(--radius);
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text);
    outline: none;
    transition: all var(--transition);
}

.search-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.1);
}

.search-count {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
}

/* ===== Message row ===== */
.msg-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    max-width: 78%;
    animation: msgIn 0.25s ease-out;
    padding: 0 16px;
}

.msg-row.msg-sent {
    align-self: flex-end;
    flex-direction: row-reverse;
}

.msg-row.msg-first {
    margin-top: 8px;
}

.msg-row:not(.msg-first) {
    margin-top: 2px;
}

.msg-row.msg-last {
    margin-bottom: 6px;
}

@keyframes msgIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Time divider */
.msg-time-divider {
    text-align: center;
    font-size: 11px;
    color: var(--text-muted);
    padding: 12px 0 6px;
    letter-spacing: 0.5px;
}

/* System message */
.msg-system {
    text-align: center;
    padding: 6px 16px;
    animation: msgIn 0.25s ease-out;
}
.msg-system span {
    display: inline-block;
    background: var(--bg-elevated);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 14px;
    border-radius: 12px;
    letter-spacing: 0.5px;
}

/* Avatar */
.msg-avatar {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-elevated);
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.msg-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Sender name */
.msg-sender {
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 3px;
    margin-left: 4px;
    letter-spacing: 0.3px;
}

.msg-body {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    min-width: 0;
}

.msg-body-sent {
    align-items: flex-end;
}

/* ===== Bubbles ===== */
.msg-bubble {
    padding: 9px 14px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
    position: relative;
}

.bubble-recv {
    background: var(--bg-card);
    color: var(--text);
    border-radius: 6px 18px 18px 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.04);
    border: 1px solid rgba(0,0,0,0.04);
}

/* Grouped: first received message has top-left corner */
.msg-first .bubble-recv,
.msg-first.msg-last .bubble-recv {
    border-radius: 18px 18px 18px 6px;
}

/* Grouped: middle received messages */
.msg-row:not(.msg-first):not(.msg-last) .bubble-recv {
    border-radius: 6px 18px 18px 6px;
}

/* Grouped: last received message has bottom-left corner */
.msg-last:not(.msg-first) .bubble-recv {
    border-radius: 6px 18px 18px 18px;
}

.bubble-sent {
    background: #e8edf2;
    color: #1a1d2e;
    border-radius: 18px 6px 18px 18px;
}

/* Grouped: first sent message */
.msg-first .bubble-sent,
.msg-first.msg-last .bubble-sent {
    border-radius: 18px 18px 6px 18px;
}

/* Grouped: middle sent messages */
.msg-row:not(.msg-first):not(.msg-last) .bubble-sent {
    border-radius: 18px 6px 6px 18px;
}

/* Grouped: last sent message */
.msg-last:not(.msg-first) .bubble-sent {
    border-radius: 18px 6px 18px 18px;
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
    .bubble-recv {
        background: var(--bg-card);
        border-color: rgba(255,255,255,0.04);
    }

    .bubble-sent {
        background: #2a3348;
        color: #e8eaf0;
    }
}

.msg-status {
    font-size: 11px;
    opacity: 0.7;
    margin-bottom: 2px;
}

.sending-dots i {
    animation: blink 1.2s infinite;
    font-style: normal;
    letter-spacing: 1px;
}

.sending-dots i:nth-child(2) { animation-delay: 0.2s; }
.sending-dots i:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.8; }
}

.msg-time {
    font-size: 11px;
    color: #ef4444;
    padding: 2px 4px 0;
}

/* ===== Input area ===== */
.input-area {
    padding: 12px 20px;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg);
    border-radius: var(--radius-xl);
    padding: 4px 4px 4px 20px;
    border: 1px solid var(--border);
    transition: all var(--transition);
}

.input-row:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.1);
}

.input-row input {
    flex: 1;
    height: 42px;
    font-size: 14px;
    color: var(--text);
    background: transparent;
    border: none;
    outline: none;
}

.send-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
    flex-shrink: 0;
}

.send-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(79, 110, 247, 0.4);
}

.send-btn svg {
    width: 18px;
    height: 18px;
}

.attach-btn {
    width: 42px;
    height: 42px;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
    flex-shrink: 0;
}

.attach-btn:hover:not(:disabled) {
    color: var(--primary);
    background: var(--bg-elevated);
}

.attach-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.upload-bar {
    display: flex;
    align-items: center;
    padding: 4px 0 8px;
}

.upload-text {
    font-size: 12px;
    color: var(--text-muted);
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* ===== Modal ===== */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-card {
    width: 380px;
    max-width: 90vw;
    background: var(--bg-card);
    border-radius: var(--radius-xl);
    padding: 32px;
    box-shadow: var(--shadow-lg);
}

.modal-card h3 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 24px;
    text-align: center;
}

.switch-row {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    background: var(--bg);
    border-radius: var(--radius);
    padding: 4px;
}

.switch-btn {
    flex: 1;
    height: 40px;
    border-radius: calc(var(--radius) - 2px);
    font-size: 14px;
    font-weight: 500;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.switch-btn.active {
    background: var(--bg-card);
    color: var(--primary);
    box-shadow: var(--shadow-sm);
    font-weight: 600;
}

.modal-input {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border-radius: var(--radius);
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 14px;
    color: var(--text);
    outline: none;
    transition: all var(--transition);
    margin-bottom: 20px;
}

.modal-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(79, 110, 247, 0.1);
}

.modal-ok {
    width: 100%;
    height: 48px;
    border-radius: var(--radius);
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.modal-ok:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(79, 110, 247, 0.4);
}

/* ===== Transitions ===== */
.slide-enter-active,
.slide-leave-active {
    transition: all 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
    width: 0;
    opacity: 0;
}

.modal-enter-active,
.modal-leave-active {
    transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from .modal-card,
.modal-leave-to .modal-card {
    transform: scale(0.9) translateY(20px);
}
</style>
