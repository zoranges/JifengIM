<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import APIClient from '../services/APIClient'
import { useRouter } from 'vue-router'
import {
    WKSDK, Channel, ChannelTypePerson, ChannelTypeGroup, MessageStatus,
    ConnectionInfo, Mention, MessageText, Setting, MessageContentType,
} from 'wukongimjssdk'
import type { Message } from 'wukongimjssdk'

// Local constants to prevent tree-shaking of MessageStatus (used in template)
const MsgStatusWait = MessageStatus.Wait
const MsgStatusFail = MessageStatus.Fail
import { ConnectStatus } from 'wukongimjssdk'
import type { ConnectStatusListener } from 'wukongimjssdk'
import Conversation from '../components/Conversation/index.vue'
import MessageUI from '../messages/Message.vue'
import { useMarkdown } from '../composables/useMarkdown'
import { useFileUpload } from '../composables/useFileUpload'
import { useChatMessages } from '../composables/useChatMessages'
import GroupFilesPanel from './GroupFiles.vue'
import PersonalFiles from './PersonalFiles.vue'
import CalendarPanel from '../components/Calendar.vue'
import CreateGroupModal from '../components/CreateGroupModal.vue'
import JoinGroupModal from '../components/JoinGroupModal.vue'
import GroupInfoPanel from '../components/GroupInfoPanel.vue'
import GroupSettingsModal from '../components/GroupSettingsModal.vue'
import MyGroupsList from '../components/MyGroupsList.vue'
import InviteMembersModal from '../components/InviteMembersModal.vue'
import PinnedMessagesCard from '../components/PinnedMessagesCard.vue'
import { useGroupManager } from '../composables/useGroupManager'
import { usePermission } from '../composables/usePermission'
import { bizClient } from '../services/bizClient'
import { authStore } from '../services/authStore'
import type { PinnedMessage } from '../services/bizTypes'

useMarkdown()

const router = useRouter()
const chatRef = ref<HTMLElement | null>(null)
const showSettingPanel = ref(false)
const title = ref('')
const sidebarVisible = ref(true)
const showFilesPanel = ref(false)

// Voice recording
const recording = ref(false)
let mediaRecorder: MediaRecorder | null = null

let audioChunks: Blob[] = []

const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        mediaRecorder = new MediaRecorder(stream)
        audioChunks = []
        mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data) }
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop())
            if (audioChunks.length === 0) return
            const blob = new Blob(audioChunks, { type: 'audio/webm' })
            const formData = new FormData()
            formData.append('file', blob, 'voice.webm')
            try {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', `${APIClient.shared.config.apiURL}/file/upload`)
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText)
                            const url = data.url
                            if (url) {
                                const msgText = new MessageText(`{voice:${JSON.stringify({url, duration: Math.round(blob.size / 4000)})}}`)
                                WKSDK.shared().chatManager.send(msgText, to.value, Setting.fromUint8(0))
                                scrollBottom()
                            }
                        } catch { /* ignore */ }
                    }
                }
                xhr.send(formData)
            } catch { /* ignore */ }
        }
        mediaRecorder.start()
        recording.value = true
    } catch {
        alert('无法获取麦克风权限')
    }
}

const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
    }
    recording.value = false
}

const channelID = ref('')
const p2p = ref(true)
const to = ref(new Channel('', 0))
const placeholder = ref('请输入对方登录名')

const uid = authStore.uid
const token = authStore.imToken

// Sidebar tab
const sidebarTab = ref<'conversations' | 'groups' | 'files'>('conversations')

// Group management
const showCreateGroup = ref(false)
const showJoinGroup = ref(false)
const showGroupInfo = ref(false)
const showGroupSettings = ref(false)
const groupManager = useGroupManager()
const { getNickname, myGroups, fetchMyGroups } = groupManager
const { isAdmin, canCreateGroup } = usePermission()

// Invite members
const showInviteModal = ref(false)
const inviteTargetGroupId = ref('')

// Direct chat
const onDirectChat = (targetUid: string) => {
  const channel = new Channel(targetUid, ChannelTypePerson)
  onSelectChannel(channel)
}

const refreshMyGroups = () => {
  if (authStore.isAuthenticated) fetchMyGroups()
}

const onSelectGroupFromList = (groupId: string) => {
  const channel = new Channel(groupId, ChannelTypeGroup)
  onSelectChannel(channel)
}

// Pinned messages
const pinnedMessages = ref<PinnedMessage[]>([])
const isPinnedSet = computed(() => {
  const set = new Set<string>()
  for (const p of pinnedMessages.value) set.add(p.client_msg_no)
  return set
})

const fetchPinnedMessages = async () => {
  if (!to.value.channelID || p2p.value) {
    pinnedMessages.value = []
    return
  }
  try {
    pinnedMessages.value = await bizClient.getPinnedMessages(to.value.channelID)
  } catch {
    pinnedMessages.value = []
  }
}

const getMessagePreview = (msg: Message): string => {
  const content = msg.content
  if (!content) return ''
  if (content.contentType === MessageContentType.image) return '[图片]'
  const text = (content as any).text || ''
  if (text.startsWith('{file:')) return '[文件]'
  if (text.startsWith('{voice:')) return '[语音]'
  return text.substring(0, 100)
}

const handlePinMessage = async (msg: Message) => {
  try {
    await bizClient.pinMessage(to.value.channelID, {
      message_id: msg.clientMsgNo,
      message_seq: msg.messageSeq,
      client_msg_no: msg.clientMsgNo,
      content_preview: getMessagePreview(msg),
      message_type: msg.content?.contentType || 0,
      from_uid: msg.fromUID,
    })
    await fetchPinnedMessages()
  } catch (err: any) {
    alert(err?.response?.data?.error || '置顶失败')
  }
}

const handleUnpinMessage = async (msg: Message | PinnedMessage) => {
  const messageId = 'client_msg_no' in msg ? (msg as PinnedMessage).client_msg_no : (msg as Message).clientMsgNo
  try {
    await bizClient.unpinMessage(to.value.channelID, messageId)
    await fetchPinnedMessages()
  } catch (err: any) {
    alert(err?.response?.data?.error || '取消置顶失败')
  }
}

const handleLocatePinned = (clientMsgNo: string) => {
  scrollToMessage(clientMsgNo)
}

const userDisplayName = computed(() => authStore.name || authStore.uid)

const channelDisplayName = computed(() => {
    if (!to.value.channelID) return ''
    // Group channels: prefer group manager name
    if (!p2p.value && groupManager.currentGroup.value?.name) {
        return groupManager.currentGroup.value.name
    }
    // Try SDK channel info title (populated by biz-backend via channelInfoCallback)
    const ci = WKSDK.shared().channelManager.getChannelInfo(to.value)
    if (ci?.title) return ci.title
    // Person channels: return peer name from orgData
    if (p2p.value && ci?.orgData?.peerName) return ci.orgData.peerName
    // Fallback for person channels
    if (p2p.value) return '用户'
    // Fallback for group channels
    return '群聊'
})

// Keep title in sync with userDisplayName
const updateTitle = (status: string) => { title.value = `${userDisplayName.value} ${status}` }
watch(userDisplayName, () => {
  // Preserve current status when name changes
  const currentStatus = title.value.includes('(') ? title.value.slice(title.value.indexOf('(')) : '(未连接)'
  title.value = `${userDisplayName.value} ${currentStatus}`
})
updateTitle('(未连接)')

const {
    messages, displayMessages, text, msgInputPlaceholder,
    pulldowning, pulldownFinished,
    isComposing, hasHandled,
    setupListeners, teardownListeners,
    pullLast, syncAllMessages, syncingAll, handleScroll, scrollBottom,
    onSend: _onSend, onCustomMessageSend: _onCustomMessageSend,
    isFirstInGroup, isLastInGroup, formatMsgTime,
    addSystemEvent, isSystemMessage,
    searchQuery, searchVisible, showFilesOnly,
    toggleSearch, toggleFilesOnly,
    members, onlineCount,
    clearMessages,
    searchMatchCount,
    replyingTo, setReplyingTo, cancelReply,
    showCalendar, toggleCalendar, scrollToDate,
    expireSeconds,
} = useChatMessages(to, authStore.uid, chatRef)

const { fileInput, uploading, uploadProgress, chooseFile: _chooseFile, onFileChange: _onFileChange, uploadAndSendFile, cancelUpload } = useFileUpload(to, scrollBottom)

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
    if (!authStore.isAuthenticated) {
        WKSDK.shared().connectManager.disconnect()
        router.push({ path: '/' })
        return
    }
    if (authStore.status === 'departed') {
        alert('账号已标记为离职状态，无法进入聊天')
        WKSDK.shared().connectManager.disconnect()
        authStore.logout()
        router.push({ path: '/' })
        return
    }
    APIClient.shared.get('/route', {
        param: { uid: authStore.uid },
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

    connectStatusListener = (status: ConnectStatus, reasonCode?: number, connectionInfo?: ConnectionInfo) => {
        const statusNames: Record<number, string> = {
            [ConnectStatus.Disconnect]: '已断开',
            [ConnectStatus.Connected]: '已连接',
            [ConnectStatus.Connecting]: '连接中',
            [ConnectStatus.ConnectFail]: '连接失败',
            [ConnectStatus.ConnectKick]: '被踢出',
        }
        const now = new Date().toISOString()
        console.log(`[CONN] 连接状态变化: status=${status}(${statusNames[status] || '未知'}) reasonCode=${reasonCode ?? '-'} nodeId=${connectionInfo?.nodeId ?? '-'} time=${now}`)
        if (status === ConnectStatus.Connected) {
            if (connectionInfo) {
                title.value = `${userDisplayName.value} (已连接 · 节点${connectionInfo.nodeId})`
                console.log(`[CONN] ✓ 已连接到节点${connectionInfo.nodeId}`)
            } else {
                title.value = `${userDisplayName.value} (已连接)`
                console.log(`[CONN] ✓ 已连接 (无connectionInfo)`)
            }
            refreshMyGroups()
        } else if (status === ConnectStatus.Disconnect) {
            title.value = `${userDisplayName.value} (已断开)`
            console.warn(`[CONN] ✗ 连接断开 reasonCode=${reasonCode}`)
        } else if (status === ConnectStatus.ConnectFail) {
            title.value = `${userDisplayName.value} (连接失败)`
            console.error(`[CONN] ✗ 连接失败 reasonCode=${reasonCode}`)
        } else if (status === ConnectStatus.ConnectKick) {
            title.value = `${userDisplayName.value} (被踢出)`
            console.warn(`[CONN] ✗ 被踢出 reasonCode=${reasonCode}`)
        } else {
            title.value = `${userDisplayName.value} (${statusNames[status] || status})`
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
        APIClient.shared.joinChannel(to.value.channelID, to.value.channelType, WKSDK.shared().config.authStore.uid)
    }
    const conversation = WKSDK.shared().conversationManager.findConversation(to.value)
    if (!conversation) {
        WKSDK.shared().conversationManager.createEmptyConversation(to.value)
    }
    showSettingPanel.value = false
    clearMessages()
    pullLast()
    const peerName = WKSDK.shared().channelManager.getChannelInfo(to.value)?.title || channelID.value
    addSystemEvent(`你邀请 ${peerName} 加入了会话`)
}
const onSelectChannel = (channel: Channel) => {
    to.value = channel
    channelID.value = channel.channelID
    p2p.value = channel.channelType === ChannelTypePerson
    showSettingPanel.value = false
    clearMessages()
    pullLast()

    // 清除该会话的未读计数（无论从会话列表还是群聊列表进入）
    const conv = WKSDK.shared().conversationManager.findConversation(channel)
    if (conv && conv.unread > 0) {
      conv.unread = 0
      WKSDK.shared().conversationManager.notifyConversationListeners(conv, 2/*update*/)
    }
    // 通知服务器已读
    APIClient.shared.clearUnread(channel).catch(() => {})

    if (channel.channelType === ChannelTypeGroup) {
        groupManager.fetchGroupInfo(channel.channelID)
        fetchPinnedMessages()
        addSystemEvent(`你进入了群聊`)
    } else {
        const name = WKSDK.shared().channelManager.getChannelInfo(channel)?.title || channel.channelID
        addSystemEvent(`你加入了与 ${name} 的会话`)
    }
}

// 当前频道收到新消息时立即标记已读（避免在聊天中未读继续累积）
const currentChannelUnreadListener = (conv: any, action: any) => {
  if (!to.value.channelID || !to.value.channelType) return
  if (conv.channel?.channelID === to.value.channelID &&
      conv.channel?.channelType === to.value.channelType) {
    if (conv.unread > 0) {
      conv.unread = 0
      WKSDK.shared().conversationManager.notifyConversationListeners(conv, 2/*update*/)
      APIClient.shared.clearUnread(to.value).catch(() => {})
    }
  }
}

const logout = () => {
    WKSDK.shared().connectManager.disconnect()
    authStore.logout()
    router.push({ path: '/' })
}

const onPaste = async (e: ClipboardEvent) => {
    if (!to.value || to.value.channelID.trim() === '') return
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
            e.preventDefault()
            const file = items[i].getAsFile()
            if (!file) continue
            try {
                await uploadAndSendFile(file)
                scrollBottom()
            } catch (err: any) {
                if (err.message !== '上传取消') {
                    alert('图片上传失败: ' + (err.message || '未知错误'))
                }
            }
            break
        }
    }
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
    // Clear draft before sending
    const conv = WKSDK.shared().conversationManager.findConversation(to.value)
    if (conv && conv.remoteExtra) conv.remoteExtra.draft = ''
    _onSend()
}

// Draft save/restore
let draftSaving = false
let oldChannel = ''
watch(to, (channel) => {
    // Save draft of previous channel
    if (oldChannel && oldChannel !== channel.channelID) {
        const oldConv = WKSDK.shared().conversationManager.findConversation(new Channel(oldChannel, to.value.channelType))
        if (oldConv && oldConv.remoteExtra && text.value.trim()) {
            oldConv.remoteExtra.draft = text.value
        }
    }
    // Restore draft of new channel
    if (channel.channelID) {
        const conv = WKSDK.shared().conversationManager.findConversation(channel)
        text.value = (conv?.remoteExtra?.draft) || ''
    } else {
        text.value = ''
    }
    oldChannel = channel.channelID || ''
}, { immediate: true })

watch(text, (val) => {
    if (!to.value?.channelID) return
    const conv = WKSDK.shared().conversationManager.findConversation(to.value)
    if (conv && conv.remoteExtra) {
        conv.remoteExtra.draft = val || ''
    }
})
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
        // 打开文件面板时自动拉取全部消息，确保文件分类列表完整
        syncAllMessages()
    }
}

const scrollToMessage = (clientMsgNo: string) => {
    nextTick(() => {
        const el = document.getElementById(clientMsgNo)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('date-jump-highlight')
            setTimeout(() => el.classList.remove('date-jump-highlight'), 2000)
        }
    })
}

const locateAndClearSearch = (clientMsgNo: string) => {
    searchQuery.value = ''
    nextTick(() => {
        const el = document.getElementById(clientMsgNo)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('date-jump-highlight')
            setTimeout(() => el.classList.remove('date-jump-highlight'), 2000)
        }
    })
}

const formatMsgTimeFull = (ts: number): string => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// @ mention
const showMentionMenu = ref(false)
const insertMention = (label: string) => {
    text.value = text.value + label + ' '
    showMentionMenu.value = false
}

// ─── 未读计数 (事件驱动，维护本地 Map) ───────────────
const totalUnread = ref(0)
const conversationsUnread = ref(0)  // 单聊未读
const groupsUnread = ref(0)         // 群聊未读

// channelKey → { channelType, unread }
const unreadMap = new Map<string, { channelType: number; unread: number }>()

const channelKey = (ch: any): string => `${ch.channelID}:${ch.channelType}`

const recalcUnread = () => {
  let convUnread = 0
  let grpUnread = 0
  for (const { channelType, unread } of unreadMap.values()) {
    if (channelType === 1) convUnread += unread
    else if (channelType === 2) grpUnread += unread
  }
  totalUnread.value = convUnread + grpUnread
  conversationsUnread.value = convUnread
  groupsUnread.value = grpUnread
  document.title = totalUnread.value > 0 ? `(${totalUnread.value > 99 ? '99+' : totalUnread.value}) 极速通` : '极速通'
}

// 会话变更时实时更新 unreadMap
const unreadConvListener = (conv: any, action: any) => {
  const key = channelKey(conv.channel)
  if (action === 0/*remove*/) {
    unreadMap.delete(key)
  } else {
    unreadMap.set(key, {
      channelType: conv.channel?.channelType || 1,
      unread: (conv as any).unread || 0,
    })
  }
  recalcUnread()
}

// 启动时从 SDK 拉取已有会话填充 map
const initUnreadMap = async () => {
  try {
    const all: any[] = await (WKSDK.shared().conversationManager as any).sync?.() || []
    for (const c of all) {
      unreadMap.set(channelKey(c.channel), {
        channelType: c.channel?.channelType || 1,
        unread: (c as any).unread || 0,
      })
    }
    recalcUnread()
  } catch { /* SDK sync may not be available, use listener-driven updates */ }
}

onMounted(() => {
  WKSDK.shared().conversationManager.addConversationListener(unreadConvListener)
  WKSDK.shared().conversationManager.addConversationListener(currentChannelUnreadListener)
  // 连接后拉取初始数据
  setTimeout(() => initUnreadMap(), 800)
})

onUnmounted(() => {
  WKSDK.shared().conversationManager.removeConversationListener(unreadConvListener)
})


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
                    <span class="unread-badge" v-if="totalUnread > 0">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
                </button>
                <span class="brand">极速通</span>
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
                <button class="icon-btn" :class="{ active: showCalendar }" @click="toggleCalendar" title="日历" v-if="to.channelID">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                </button>
                <button class="icon-btn" :class="{ active: showGroupInfo }" @click="showGroupInfo = !showGroupInfo" title="群信息" v-if="to.channelID && !p2p">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
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
                        {{ to.channelID ? `${p2p ? '单聊' : '群聊'} · ${channelDisplayName}` : '新建会话' }}
                        <template v-if="to.channelID && !p2p && members.size > 0">
                            · {{ onlineCount }}在线 · {{ members.size }}人
                        </template>
                    </span>
                </button>
                <button class="icon-btn" @click="router.push('/profile')" title="个人信息">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                </button>
                <button class="icon-btn admin-btn" v-if="isAdmin" @click="router.push('/admin')" title="管理后台">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
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
                        <div class="sidebar-tabs">
                            <button
                                class="sidebar-tab"
                                :class="{ active: sidebarTab === 'conversations' }"
                                @click="sidebarTab = 'conversations'"
                            >会话<span class="tab-badge" v-if="conversationsUnread > 0">{{ conversationsUnread > 99 ? '99+' : conversationsUnread }}</span></button>
                            <button
                                class="sidebar-tab"
                                :class="{ active: sidebarTab === 'groups' }"
                                @click="sidebarTab = 'groups'; refreshMyGroups()"
                            >群聊<span class="tab-badge" v-if="groupsUnread > 0">{{ groupsUnread > 99 ? '99+' : groupsUnread }}</span></button>
                            <button
                                class="sidebar-tab"
                                :class="{ active: sidebarTab === 'files' }"
                                @click="sidebarTab = 'files'"
                            >文件</button>
                        </div>
                        <button class="admin-entry-btn" v-if="isAdmin" @click="router.push('/admin')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                            </svg>
                            <span>管理后台</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="admin-arrow">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </button>
                    </div>
                    <Conversation :onSelectChannel="onSelectChannel" v-if="sidebarTab === 'conversations'" />
                    <MyGroupsList
                        v-else-if="sidebarTab === 'groups'"
                        :groups="myGroups"
                        :uid="authStore.uid"
                        :loading="groupManager.loading.value"
                        @selectGroup="onSelectGroupFromList"
                        @refresh="refreshMyGroups"
                        @createGroup="showCreateGroup = true"
                        @joinGroup="showJoinGroup = true"
                    />
                </aside>
            </transition>

            <!-- Chat area -->
            <main class="chat-main" :class="{ expanded: !sidebarVisible }">
                <!-- Personal files -->
                <PersonalFiles v-if="sidebarTab === 'files'" />
                <template v-else>
                <!-- Empty state -->
                <div class="empty-state" v-if="!to.channelID">
                    <div class="empty-icon">
                        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="40" cy="40" r="38" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.3"/>
                            <path d="M28 35h24M28 45h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
                        </svg>
                    </div>
                    <h2>极速通</h2>
                    <p>选择一个会话或创建新会话开始聊天</p>
                </div>

                <!-- Search bar -->
                <div class="search-bar" v-if="to.channelID && searchVisible">
                    <div class="search-input-wrap">
                        <input
                            v-model="searchQuery"
                            placeholder="搜索聊天记录..."
                            class="search-input"
                            autofocus
                        />
                        <button class="search-clear-btn" v-if="searchQuery" @click="searchQuery = ''" title="清除搜索">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <span class="search-count" v-if="searchQuery">
                        {{ searchMatchCount }} 条结果
                    </span>
                </div>

                <!-- Pinned messages card (group only) -->
                <PinnedMessagesCard
                    v-if="to.channelID && !p2p"
                    :pinnedMessages="pinnedMessages"
                    :getNickname="getNickname"
                    :currentUid="authStore.uid"
                    :isOwner="groupManager.isOwner.value"
                    @locate="handleLocatePinned"
                    @unpin="handleUnpinMessage"
                />

                <!-- Messages -->
                <div class="message-list" v-on:scroll="handleScroll" ref="chatRef" v-if="to.channelID">
                    <div class="load-more" v-if="pulldowning">加载中...</div>
                    <template v-for="(m, i) in displayMessages" :key="m.clientMsgNo">
<div class="msg-time-divider" v-if="i === 0 || (m.timestamp - displayMessages[i-1].timestamp) > 300">{{ formatMsgTime(m.timestamp) }}</div>
                        <div class="msg-system" v-if="isSystemMessage(m)">
                            <span>{{ m.content?.text }}</span>
                        </div>
                        <div class="msg-row" v-else :class="{
                            'msg-sent': m.send,
                            'msg-first': isFirstInGroup(i),
                            'msg-last': isLastInGroup(i),
                            'search-match': m.__searchMatch,
                        }" :id="m.clientMsgNo">
                            <div class="msg-avatar msg-avatar-recv" v-if="!m.send">
                                <span>{{ getNickname(m.fromUID).charAt(0) || m.fromUID.charAt(0) }}</span>
                            </div>
                            <div class="msg-body" :class="{ 'msg-body-sent': m.send }">
                                <div class="msg-sender" v-if="!m.send">{{ getNickname(m.fromUID) }}</div>
                                <div class="msg-bubble" :class="{ 'bubble-sent': m.send, 'bubble-recv': !m.send }">
                                    <div class="msg-status" v-if="m.send && m.status === MsgStatusWait">
                                        <span class="sending-dots"><i>.</i><i>.</i><i>.</i></span>
                                    </div>
                                    <MessageUI :message="m" :searchQuery="searchQuery" :isGroup="!p2p" :isPinned="isPinnedSet.has(m.clientMsgNo)" @reply="setReplyingTo" @pin="handlePinMessage" @unpin="(msg: Message) => handleUnpinMessage(msg)" />
                                </div>
                                <div class="msg-time msg-fail" v-if="m.send && m.status === MsgStatusFail">{{ m.failReason || '发送失败' }}</div>
                            </div>
                            <div class="search-locate-bar" v-if="m.__searchMatch && searchQuery" @click="locateAndClearSearch(m.clientMsgNo)">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                                </svg>
                                <span>定位到聊天位置</span>
                                <span class="search-locate-time">{{ formatMsgTimeFull(m.timestamp) }}</span>
                            </div>
                            <div class="msg-avatar msg-avatar-sent" v-if="m.send">
                                <span>{{ getNickname(m.fromUID).charAt(0) || m.fromUID.charAt(0) }}</span>
                            </div>
                        </div>
                    </template>
                </div>

                <!-- Input area -->
                <div class="input-area" v-if="to.channelID">
                    <div class="upload-bar" v-if="uploading">
                        <span class="upload-text">上传中 {{ uploadProgress }}%</span>
                        <div class="upload-progress-track"><div class="upload-progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
                        <button class="upload-cancel-btn" @click="cancelUpload" title="取消上传">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="reply-bar" v-if="replyingTo">
                        <div class="reply-bar-content">
                            <span class="reply-bar-label">回复 {{ getNickname(replyingTo.fromUID) }}:</span>
                            <span class="reply-bar-text">{{ (replyingTo.content as any)?.conversationDigest || (replyingTo.content as any)?.text || '' }}</span>
                        </div>
                        <button class="reply-bar-close" @click="cancelReply" title="取消回复">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
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
                        <!-- @mention button (group only) -->
                        <div class="mention-wrap" v-if="!p2p">
                            <button class="attach-btn mention-btn" @click="showMentionMenu = !showMentionMenu" title="@提及">
                                <span style="font-weight:700;font-size:18px;">@</span>
                            </button>
                            <div class="mention-menu" v-if="showMentionMenu" @click.stop>
                                <button class="mention-item" @click="insertMention('@所有人 ')">
                                    <span class="mention-icon">@</span>
                                    <span>所有人</span>
                                </button>
                                <div class="mention-divider" v-if="members.size > 0"></div>
                                <button class="mention-item" v-for="mUid in Array.from(members)" :key="mUid" @click="insertMention('@'+mUid+' ')">
                                    <span class="mention-icon">@</span>
                                    <span>{{ getNickname(mUid) }}</span>
                                </button>
                            </div>
                        </div>
                        <!-- Expire selector (disabled) -->
                        <input
                            :placeholder="msgInputPlaceholder"
                            v-model="text"
                            @keyup.enter="onEnter"
                            @keydown.enter="onKeydown"
                            @compositionstart="isComposing = true"
                            @compositionend="isComposing = false"
                            @paste="onPaste"
                        />
                        <button class="voice-btn" :class="{ recording: recording }" @mousedown.prevent="startRecording" @mouseup.prevent="stopRecording" @touchstart.prevent="startRecording" @touchend.prevent="stopRecording" title="按住录音">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                        </button>
                        <button class="send-btn" @click="onSend">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </button>
                    </div>
                </div>
                </template>
            </main>

            <!-- File management panel -->
            <GroupFilesPanel
                v-if="to.channelID && showFilesPanel"
                :messages="messages"
                :channelName="to.channelID"
                :channelType="to.channelType"
                :uid="authStore.uid"
                :groupName="channelDisplayName"
                @close="showFilesPanel = false"
                @locate="scrollToMessage"
            />

        </div>

        <!-- Setting modal: new session -->
        <transition name="modal">
            <div class="modal-overlay" v-if="showSettingPanel" @click="settingClick">
                <div class="modal-card" @click.stop="">
                    <h3>发起会话</h3>
                    <div class="switch-row">
                        <button class="switch-btn" :class="{ active: p2p }" @click="p2p = true">单聊</button>
                        <button class="switch-btn" :class="{ active: !p2p }" @click="p2p = false">群聊</button>
                    </div>
                    <input :placeholder="placeholder" class="modal-input" v-model="channelID" v-if="p2p" />
                    <div class="group-actions" v-if="!p2p">
                        <button class="modal-ok" v-if="canCreateGroup" @click="showSettingPanel = false; showCreateGroup = true">创建群聊</button>
                        <button class="modal-secondary" @click="showSettingPanel = false; showJoinGroup = true">加入群聊</button>
                        <p class="hint-text" v-if="!canCreateGroup">普通员工无法创建群聊，请联系项目负责人</p>
                    </div>
                    <button class="modal-ok" v-if="p2p" @click="settingOKClick">开始聊天</button>
                </div>
            </div>
        </transition>

        <!-- Create group modal -->
        <CreateGroupModal v-if="showCreateGroup" @close="showCreateGroup = false" @created="(groupId: string) => {
            showCreateGroup = false;
            to = new Channel(groupId, ChannelTypeGroup);
            channelID = groupId;
            p2p = false;
            showSettingPanel = false;
            APIClient.shared.joinChannel(groupId, ChannelTypeGroup, WKSDK.shared().config.authStore.uid);
            const conv = WKSDK.shared().conversationManager.findConversation(to);
            if (!conv) WKSDK.shared().conversationManager.createEmptyConversation(to);
            clearMessages();
            pullLast();
            addSystemEvent('群聊已创建，你邀请大家加入吧');
        }" />

        <!-- Join group modal -->
        <JoinGroupModal v-if="showJoinGroup" @close="showJoinGroup = false" @joined="(groupId: string) => {
            showJoinGroup = false;
            to = new Channel(groupId, ChannelTypeGroup);
            channelID = groupId;
            p2p = false;
            showSettingPanel = false;
            const conv = WKSDK.shared().conversationManager.findConversation(to);
            if (!conv) WKSDK.shared().conversationManager.createEmptyConversation(to);
            clearMessages();
            pullLast();
            addSystemEvent('你加入了群聊');
        }" />

        <!-- Group info panel -->
        <GroupInfoPanel v-if="to.channelID && !p2p && showGroupInfo" :groupId="to.channelID" :key="to.channelID"
            @close="showGroupInfo = false"
            @openSettings="showGroupSettings = true"
            @invite="inviteTargetGroupId = to.channelID; showInviteModal = true"
            @directChat="(targetUid: string) => { showGroupInfo = false; onDirectChat(targetUid) }" />

        <!-- Invite members modal -->
        <InviteMembersModal v-if="showInviteModal" :groupId="inviteTargetGroupId"
            @close="showInviteModal = false; inviteTargetGroupId = ''"
            @invited="showInviteModal = false; inviteTargetGroupId = ''" />

        <!-- Group settings modal -->
        <GroupSettingsModal v-if="showGroupSettings" :groupId="to.channelID"
            @close="showGroupSettings = false"
            @disbanded="showGroupSettings = false; showGroupInfo = false; to = new Channel('', 0); channelID = ''; clearMessages()"
            @memberKicked="() => {}" />

        <!-- Calendar panel -->
        <CalendarPanel
            :visible="showCalendar"
            :messages="messages"
            @select="scrollToDate"
            @close="showCalendar = false"
        />
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
    color: var(--primary);
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
    position: relative;
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

.admin-btn {
    color: #2563eb;
}

.hint-text {
    font-size: 12px;
    color: #9ca3af;
    text-align: center;
    margin-top: 8px;
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
    padding: 16px 16px 8px;
    flex-shrink: 0;
}

.sidebar-tabs {
    display: flex;
    gap: 4px;
    background: var(--bg);
    border-radius: var(--radius);
    padding: 3px;
}

.sidebar-tab {
    flex: 1;
    height: 34px;
    border-radius: calc(var(--radius) - 2px);
    font-size: 13px;
    font-weight: 500;
    background: transparent;
    color: var(--text-secondary);
    border: none;
    cursor: pointer;
    transition: all var(--transition);
}

.sidebar-tab.active {
    background: var(--bg-card);
    color: var(--primary);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
}

.sidebar-tab:hover:not(.active) {
    color: var(--text);
}

.tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    margin-left: 4px;
    vertical-align: middle;
}

.admin-entry-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 44px;
    margin-top: 10px;
    padding: 0 14px;
    border-radius: 10px;
    background: linear-gradient(135deg, #1e3a5f, #2563eb);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all var(--transition);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.admin-entry-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);
}

.admin-entry-btn .admin-arrow {
    margin-left: auto;
    opacity: 0.7;
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
    color: var(--primary);
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

.search-input-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
}

.search-input {
    width: 100%;
    height: 38px;
    padding: 0 34px 0 14px;
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

.search-clear-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.15);
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
}

.search-clear-btn:hover {
    background: rgba(0,0,0,0.25);
    color: var(--text);
}

/* Search match locate bar */
.search-locate-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(79, 110, 247, 0.1);
    color: var(--primary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
    align-self: center;
}

.msg-row.search-match:hover .search-locate-bar {
    opacity: 1;
}

.search-locate-bar:hover {
    background: var(--primary);
    color: #fff;
}

.search-locate-time {
    color: var(--text-muted);
    margin-left: 4px;
    font-weight: 400;
}

.search-locate-bar:hover .search-locate-time {
    color: rgba(255, 255, 255, 0.7);
}

.msg-row.search-match .msg-bubble {
    box-shadow: 0 0 0 2px rgba(79, 110, 247, 0.3);
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
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
}

.msg-avatar span {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
}

.msg-avatar-recv {
    background: #64748b;
}

.msg-avatar-sent {
    background: var(--primary);
}

.msg-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Sender name */
.msg-sender {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 4px;
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

/* Grouped: first received message (top-left sharp, pointing to avatar above) */
.msg-first .bubble-recv,
.msg-first.msg-last .bubble-recv {
    border-radius: 6px 18px 18px 18px;
}

/* Grouped: middle received messages (both left corners sharp) */
.msg-row:not(.msg-first):not(.msg-last) .bubble-recv {
    border-radius: 6px 18px 18px 6px;
}

/* Grouped: last received message (bottom-left sharp) */
.msg-last:not(.msg-first) .bubble-recv {
    border-radius: 18px 18px 18px 6px;
}

.bubble-sent {
    background: #e8edf2;
    color: #1a1d2e;
    border-radius: 18px 6px 18px 18px;
}

/* Grouped: first sent message (top-right sharp, pointing to avatar above) */
.msg-first .bubble-sent,
.msg-first.msg-last .bubble-sent {
    border-radius: 18px 6px 18px 18px;
}

/* Grouped: middle sent messages (both right corners sharp) */
.msg-row:not(.msg-first):not(.msg-last) .bubble-sent {
    border-radius: 18px 6px 6px 18px;
}

/* Grouped: last sent message (bottom-right sharp) */
.msg-last:not(.msg-first) .bubble-sent {
    border-radius: 18px 18px 6px 18px;
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

.expire-select {
    height: 34px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
}

.expire-select:focus,
.expire-select:hover {
    border-color: var(--primary);
    color: var(--text);
}

.voice-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
}

.voice-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
}

.voice-btn.recording {
    background: #ef4444;
    border-color: #ef4444;
    color: #fff;
    animation: voicePulse 1s infinite;
}

@keyframes voicePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
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

.reply-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin-bottom: 4px;
    background: rgba(79,110,247,0.06);
    border-left: 3px solid var(--primary);
    border-radius: 0 8px 8px 0;
}

.reply-bar-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.reply-bar-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--primary);
}

.reply-bar-text {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.reply-bar-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
}

.reply-bar-close:hover {
    background: var(--bg-elevated);
    color: var(--text);
}

.upload-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0 8px;
}

.upload-text {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
}

.upload-progress-track {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
    max-width: 200px;
}

.upload-progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 2px;
    transition: width 0.3s ease;
}

.upload-cancel-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
}

.upload-cancel-btn:hover {
    background: #ef4444;
    color: #fff;
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

.modal-secondary {
    width: 100%;
    height: 48px;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 500;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all var(--transition);
}

.modal-secondary:hover {
    border-color: var(--primary);
    color: var(--primary);
}

.group-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
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

/* Date jump highlight */
:global(.date-jump-highlight) {
    animation: dateJumpPulse 0.6s ease-in-out 3;
}

@keyframes dateJumpPulse {
    0%, 100% { background: transparent; }
    50% { background: rgba(79, 110, 247, 0.12); border-radius: 8px; }
}

/* Unread badge on sidebar toggle */
.unread-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

/* @mention */
.mention-wrap {
    position: relative;
}

.mention-menu {
    position: absolute;
    bottom: 44px;
    left: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    padding: 4px;
    min-width: 140px;
    z-index: 100;
}

.mention-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    color: var(--text);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
}

.mention-item:hover {
    background: var(--bg-elevated);
    color: var(--primary);
}

.mention-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 12px;
}

.mention-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
