import { computed, nextTick, onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import {
    Message, MessageText, MessageContent, MessageStatus, Channel,
    ChannelTypePerson, ChannelTypeGroup, PullMode, Setting, WKSDK,
    WKEvent, WKEventListener, MessageContentType,
} from 'wukongimjssdk'
import type { SendackPacket } from 'wukongimjssdk'
import { CustomMessage, orderMessage } from '../customessage'
import APIClient from '../services/APIClient'
import { useMarkdown } from './useMarkdown'

const { marked } = useMarkdown()

export function useChatMessages(to: Ref<Channel>, uid: string, chatRef: Ref<HTMLElement | null>) {
    const messages = ref<Message[]>([])
    const text = ref('')
    const pulldowning = ref(false)
    const pulldownFinished = ref(false)
    const msgInputPlaceholder = ref('输入消息...')
    const streamNo = ref<string>()
    const isComposing = ref(false)
    const hasHandled = ref(false)

    // Member tracking for group chats
    const members = reactive(new Set<string>())

    // Online status tracking
    const onlineCount = ref(0)
    const onlineMembers = reactive(new Set<string>())
    let onlinePollTimer: ReturnType<typeof setInterval> | null = null
    let subscriberChangeListener: any = null

    const fetchOnlineStatus = async () => {
        const uids = Array.from(members)
        if (uids.length === 0) {
            onlineCount.value = 0
            onlineMembers.clear()
            return
        }
        try {
            const statuses = await APIClient.shared.post('/user/onlinestatus', uids) as Array<{uid: string, device_flag: number, online: number}>
            onlineMembers.clear()
            if (statuses && statuses.length > 0) {
                const seen = new Set<string>()
                for (const s of statuses) {
                    if (s.online === 1 && !seen.has(s.uid)) {
                        seen.add(s.uid)
                        onlineMembers.add(s.uid)
                    }
                }
                onlineCount.value = seen.size
            } else {
                onlineCount.value = 0
            }
        } catch {
            // Keep previous count on error
        }
    }

    const startOnlinePolling = () => {
        stopOnlinePolling()
        fetchOnlineStatus()
        onlinePollTimer = setInterval(fetchOnlineStatus, 15000)
        subscriberChangeListener = () => {
            fetchOnlineStatus()
        }
        WKSDK.shared().channelManager.addSubscriberChangeListener(subscriberChangeListener)
    }

    const stopOnlinePolling = () => {
        if (onlinePollTimer) {
            clearInterval(onlinePollTimer)
            onlinePollTimer = null
        }
        if (subscriberChangeListener) {
            WKSDK.shared().channelManager.removeSubscriberChangeListener(subscriberChangeListener)
            subscriberChangeListener = null
        }
        onlineCount.value = 0
        onlineMembers.clear()
    }

    // Watch for channel changes to start/stop polling
    watch(to, (newChannel) => {
        if (newChannel.channelID && newChannel.channelType === ChannelTypeGroup) {
            members.add(uid)
            startOnlinePolling()
        } else {
            stopOnlinePolling()
        }
    }, { immediate: true })

    // Search & filter
    const searchQuery = ref('')
    const searchVisible = ref(false)
    const showFilesOnly = ref(false)

    const getMsgText = (m: Message): string => {
        const content = (m as any).content
        if (!content) return ''
        return content.conversationDigest || content.text || content.url || ''
    }

    const displayMessages = computed(() => {
        let msgs = messages.value
        if (showFilesOnly.value) {
            msgs = msgs.filter(m => {
                const text = getMsgText(m)
                return text.startsWith('{file:') || m.contentType === MessageContentType.image
            })
        }
        if (searchQuery.value.trim()) {
            const q = searchQuery.value.toLowerCase()
            msgs = msgs.filter(m => {
                const text = getMsgText(m)
                return text.toLowerCase().includes(q)
            })
        }
        return msgs
    })

    const toggleSearch = () => {
        searchVisible.value = !searchVisible.value
        if (!searchVisible.value) {
            searchQuery.value = ''
            showFilesOnly.value = false
        }
    }

    const toggleFilesOnly = () => {
        showFilesOnly.value = !showFilesOnly.value
    }

    let msgCount = 0
    let messageListener: any
    let messageStatusListener: any
    let eventListener: WKEventListener

    const renderStreamText = (m: any) => {
        const eventMeta = m.eventMeta
        if (eventMeta && eventMeta.events && eventMeta.events.length > 0) {
            for (const ek of eventMeta.events) {
                if (ek.event_key === 'main' || eventMeta.events.length === 1) {
                    const snapshot = ek.snapshot
                    if (snapshot && snapshot.kind === 'text' && snapshot.text) {
                        m.streamText = snapshot.text
                        return
                    }
                }
            }
        }
    }

    const scrollBottom = () => {
        const chat = chatRef.value
        if (chat) {
            nextTick(() => {
                chat.scrollTop = chat.scrollHeight
            })
        }
    }

    const pullLast = async () => {
        pulldowning.value = true
        pulldownFinished.value = false
        const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
            limit: 15, startMessageSeq: 0, endMessageSeq: 0,
            pullMode: PullMode.Up,
        })
        for (const m of msgs) {
            if (m.setting.streamOn) {
                renderStreamText(m)
                if (m.streamText && m.streamText.length > 0) {
                    const htmlText = await marked.parse(m.streamText)
                    m.content = new MessageText(htmlText)
                }
            }
        }
        pulldowning.value = false
        if (msgs && msgs.length > 0) {
            msgs.forEach((m) => { messages.value.push(m) })
        }
        scrollBottom()
    }

    const pullDown = async () => {
        if (messages.value.length === 0) return
        const firstMsg = messages.value[0]
        if (firstMsg.messageSeq === 1) {
            pulldownFinished.value = true
            return
        }
        const limit = 15
        const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
            limit, startMessageSeq: firstMsg.messageSeq - 1, endMessageSeq: 0,
            pullMode: PullMode.Down,
        })
        for (const m of msgs) {
            if (m.setting.streamOn) {
                renderStreamText(m)
                if (m.streamText && m.streamText.length > 0) {
                    const htmlText = await marked.parse(m.streamText)
                    m.content = new MessageText(htmlText)
                }
            }
        }
        if (msgs.length < limit) pulldownFinished.value = true
        if (msgs && msgs.length > 0) {
            msgs.reverse().forEach((m) => { messages.value.unshift(m) })
        }
        nextTick(() => {
            const chat = chatRef.value
            const firstMsgEl = document.getElementById(firstMsg.clientMsgNo)
            if (firstMsgEl) chat!.scrollTop = firstMsgEl.offsetTop
        })
    }

    const handleScroll = () => {
        const chat = chatRef.value
        if (!chat || pulldowning.value) return
        const targetScrollTop = chat.scrollTop
        if (targetScrollTop <= 250 && !pulldownFinished.value) {
            pulldowning.value = true
            pullDown()
        }
    }

    const onSend = () => {
        if (!text.value || text.value.trim() === '') {
            msgCount++
            text.value = `${msgCount}`
        }
        const setting = Setting.fromUint8(0)
        if (to.value && to.value.channelID !== '') {
            const content: MessageContent = new MessageText(text.value)
            WKSDK.shared().chatManager.send(content, to.value, setting)
            text.value = ''
        }
        scrollBottom()
    }

    const onCustomMessageSend = () => {
        const customMessage = new CustomMessage()
        const timestamp = new Date().getTime()
        customMessage.orderNo = `${timestamp}`
        customMessage.title = '可可柠檬鲜美奶茶'
        customMessage.num = 1
        customMessage.price = 18
        customMessage.imgUrl = 'https://img1.baidu.com/it/u=3855634790,2542680254&fm=253&fmt=auto&app=138&f=JPEG?w=750&h=496'
        WKSDK.shared().chatManager.send(customMessage, to.value)
        scrollBottom()
    }

    const setupListeners = () => {
        messageListener = (msg: Message) => {
            if (!to.value.isEqual(msg.channel)) return
            if (msg.clientMsgNo && messages.value.some(m => m.clientMsgNo === msg.clientMsgNo)) return
            messages.value.push(msg)
            if (msg.fromUID && to.value.channelType === ChannelTypeGroup) {
                members.add(msg.fromUID)
            }
            scrollBottom()
        }
        WKSDK.shared().chatManager.addMessageListener(messageListener)

        eventListener = async (event: WKEvent) => {
            if (!event.dataJson) return
            const pushData = event.dataJson
            const clientMsgNo = pushData.client_msg_no
            if (!clientMsgNo) return
            for (const message of messages.value) {
                if (message.clientMsgNo !== clientMsgNo) continue
                if (event.type === 'stream.delta') {
                    const payload = pushData.payload
                    if (payload && payload.kind === 'text' && payload.delta) {
                        message.streamText = (message.streamText || '') + payload.delta
                        const htmlText = await marked.parse(message.streamText)
                        message.content = new MessageText(htmlText || '')
                    }
                } else if (event.type === 'stream.close' || event.type === 'stream.error' || event.type === 'stream.cancel') {
                    const payload = pushData.payload
                    const snapshotText = payload?.snapshot?.kind === 'text' ? (payload.snapshot.text as string) : ''
                    if (snapshotText) {
                        message.streamText = snapshotText
                        const htmlText = await marked.parse(message.streamText)
                        message.content = new MessageText(htmlText || '')
                    }
                } else if (event.type === 'stream.finish') {
                    (message as any).completed = true
                }
                messages.value = [...messages.value]
                nextTick(() => { scrollBottom() })
                break
            }
        }
        WKSDK.shared().eventManager.addEventListener(eventListener)

        messageStatusListener = (ack: SendackPacket) => {
            messages.value.forEach((m) => {
                if (m.clientSeq === ack.clientSeq) {
                    m.status = ack.reasonCode === 1 ? MessageStatus.Normal : MessageStatus.Fail
                    return
                }
            })
        }
        WKSDK.shared().chatManager.addMessageStatusListener(messageStatusListener)
    }

    const teardownListeners = () => {
        WKSDK.shared().chatManager.removeMessageListener(messageListener)
        WKSDK.shared().chatManager.removeMessageStatusListener(messageStatusListener)
        WKSDK.shared().eventManager.removeEventListener(eventListener)
        stopOnlinePolling()
    }

    const isFirstInGroup = (i: number) => {
        const list = displayMessages.value
        if (i === 0) return true
        return list[i].send !== list[i - 1].send || list[i].fromUID !== list[i - 1].fromUID
    }

    const isLastInGroup = (i: number) => {
        const list = displayMessages.value
        if (i === list.length - 1) return true
        return list[i].send !== list[i + 1].send || list[i].fromUID !== list[i + 1].fromUID
    }

    const formatMsgTime = (ts: number) => {
        if (!ts) return ''
        const d = new Date(ts * 1000)
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        if (d.toDateString() === now.toDateString()) {
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`
        }
        return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const addSystemEvent = (text: string) => {
        const msg = new Message()
        msg.content = new MessageText(text)
        msg.timestamp = Date.now() / 1000
        msg.fromUID = ''
        ;(msg as any).isSystem = true
        ;(msg as any).clientMsgNo = 'sys-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
        messages.value.push(msg)
        scrollBottom()
    }

    const isSystemMessage = (m: Message) => (m as any).isSystem === true

    const clearMessages = () => {
        messages.value = []
        members.clear()
    }

    return {
        messages, displayMessages, text, pulldowning, pulldownFinished,
        msgInputPlaceholder, streamNo, isComposing, hasHandled,
        setupListeners, teardownListeners,
        pullLast, pullDown, handleScroll, scrollBottom,
        onSend, onCustomMessageSend,
        isFirstInGroup, isLastInGroup, formatMsgTime,
        addSystemEvent, isSystemMessage,
        searchQuery, searchVisible, showFilesOnly,
        toggleSearch, toggleFilesOnly,
        members, onlineCount,
        clearMessages,
    }
}
