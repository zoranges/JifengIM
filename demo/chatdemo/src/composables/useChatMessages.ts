import { computed, nextTick, onUnmounted, reactive, ref, watch, type Ref } from 'vue'
import {
    Message, MessageText, MessageContent, MessageStatus, Channel,
    ChannelTypePerson, ChannelTypeGroup, PullMode, Setting, WKSDK,
    WKEvent, WKEventListener, MessageContentType, Reply, Mention,
} from 'wukongimjssdk'
import type { SendackPacket } from 'wukongimjssdk'
import { CustomMessage, orderMessage } from '../customessage'
import APIClient from '../services/APIClient'
import { addRevokedMessage, applyRevokes, debugRevokeStore } from '../services/revokeStore'
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

    // Reply state
    const replyingTo = ref<Message | null>(null)
    const setReplyingTo = (msg: Message) => { replyingTo.value = msg }
    const cancelReply = () => { replyingTo.value = null }

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

    const syncMembersFromSDK = () => {
        const channel = to.value
        if (!channel.channelID || channel.channelType !== ChannelTypeGroup) return
        const subscribers = WKSDK.shared().channelManager.getSubscribes(channel)
        if (subscribers && subscribers.length > 0) {
            for (const s of subscribers) {
                if (s.uid) members.add(s.uid)
            }
        }
    }

    const startOnlinePolling = () => {
        stopOnlinePolling()
        // Use SDK's native subscriber sync (calls syncSubscribersCallback provider)
        WKSDK.shared().channelManager.syncSubscribes(to.value).then(() => {
            syncMembersFromSDK()
            fetchOnlineStatus()
        })
        onlinePollTimer = setInterval(() => {
            WKSDK.shared().channelManager.syncSubscribes(to.value).then(() => {
                syncMembersFromSDK()
                fetchOnlineStatus()
            })
        }, 15000)
        subscriberChangeListener = () => {
            syncMembersFromSDK()
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
    const searchMatchCount = ref(0)

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
            const result: any[] = []
            msgs.forEach((m) => {
                const text = getMsgText(m)
                if (text.toLowerCase().includes(q)) {
                    (m as any).__searchMatch = true
                    result.push(m)
                }
            })
            searchMatchCount.value = result.length
            return result
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

    let messageListener: any
    let cmdRevokeListener: any
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

    // Dedupe incoming pages against messages already in the list.
    // Match by clientMsgNo first; fall back to messageSeq for server-origin
    // messages that lack a stable clientMsgNo.
    const dedupeAgainstExisting = (incoming: Message[]): Message[] => {
        const seenClient = new Set<string>()
        const seenSeq = new Set<number>()
        for (const m of messages.value) {
            if (m.clientMsgNo) seenClient.add(m.clientMsgNo)
            if (m.messageSeq) seenSeq.add(m.messageSeq)
        }
        const result: Message[] = []
        for (const m of incoming) {
            if (m.clientMsgNo && seenClient.has(m.clientMsgNo)) continue
            if (m.messageSeq && seenSeq.has(m.messageSeq)) continue
            if (m.clientMsgNo) seenClient.add(m.clientMsgNo)
            if (m.messageSeq) seenSeq.add(m.messageSeq)
            result.push(m)
        }
        return result
    }

    const pullLast = async () => {
        pulldowning.value = true
        pulldownFinished.value = false
        debugRevokeStore()
        try {
            const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
                limit: 2000, startMessageSeq: 0, endMessageSeq: 0,
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
            const fresh = dedupeAgainstExisting(msgs)
            if (fresh.length > 0) {
                fresh.forEach((m) => { messages.value.push(m) })
                applyRevokes(messages.value, to.value.channelID, to.value.channelType)
                messages.value = [...messages.value]
            }
        } finally {
            pulldowning.value = false
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
        pulldowning.value = true
        try {
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
            if (msgs.length === 0) pulldownFinished.value = true
            const fresh = dedupeAgainstExisting(msgs)
            if (fresh.length > 0) {
                fresh.reverse().forEach((m) => { messages.value.unshift(m) })
                applyRevokes(messages.value, to.value.channelID, to.value.channelType)
                messages.value = [...messages.value]
            }
        } finally {
            pulldowning.value = false
        }
        nextTick(() => {
            const chat = chatRef.value
            const firstMsgEl = document.getElementById(firstMsg.clientMsgNo)
            if (firstMsgEl) chat!.scrollTop = firstMsgEl.offsetTop
        })
    }

    // 拉取全部历史消息 — 用于文件面板等需要全量数据的场景
    const syncingAll = ref(false)
    const syncAllMessages = async () => {
        if (syncingAll.value) return
        if (messages.value.length === 0) {
            await pullLast()
        }
        syncingAll.value = true
        try {
            let round = 0
            const maxRounds = 50 // 安全上限，防止无限循环
            while (messages.value.length > 0 && round < maxRounds) {
                const firstMsg = messages.value[0]
                if (firstMsg.messageSeq <= 1) break
                const limit = 30
                const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
                    limit, startMessageSeq: firstMsg.messageSeq - 1, endMessageSeq: 0,
                    pullMode: PullMode.Down,
                })
                if (!msgs || msgs.length === 0) break
                for (const m of msgs) {
                    if (m.setting.streamOn) {
                        renderStreamText(m)
                        if (m.streamText && m.streamText.length > 0) {
                            const htmlText = await marked.parse(m.streamText)
                            m.content = new MessageText(htmlText)
                        }
                    }
                }
                const fresh = dedupeAgainstExisting(msgs)
                if (fresh.length === 0) break
                fresh.reverse().forEach((m) => { messages.value.unshift(m) })
                applyRevokes(messages.value, to.value.channelID, to.value.channelType)
                messages.value = [...messages.value]
                round++
            }
            pulldownFinished.value = true
        } finally {
            syncingAll.value = false
        }
    }

    const handleScroll = () => {
        const chat = chatRef.value
        if (!chat || pulldowning.value) return
        const targetScrollTop = chat.scrollTop
        if (targetScrollTop <= 250 && !pulldownFinished.value) {
            pullDown()
        }
    }

    const expireSeconds = ref(0) // 0 = never expire

    const onSend = async () => {
        if (!text.value || text.value.trim() === '') {
            return
        }
        const setting = Setting.fromUint8(0)
        if (to.value && to.value.channelID !== '') {
            const content: MessageContent = new MessageText(text.value)
            if (replyingTo.value) {
                const reply = new Reply()
                reply.messageID = replyingTo.value.messageID || ''
                reply.messageSeq = replyingTo.value.messageSeq || 0
                reply.fromUID = replyingTo.value.fromUID || ''
                reply.fromName = replyingTo.value.fromUID || ''
                reply.content = replyingTo.value.content
                content.reply = reply
                replyingTo.value = null
            }
            // 解析 @提及：@所有人 或 @成员UID
            const mentionMatches = text.value.match(/@(\S+)/g)
            if (mentionMatches) {
                const mention = new Mention()
                const mentionedUIDs: string[] = []
                for (const m of mentionMatches) {
                    const target = m.slice(1) // 去掉 @ 前缀
                    if (target === '所有人') {
                        mention.all = true
                    } else {
                        mentionedUIDs.push(target)
                    }
                }
                if (mentionedUIDs.length > 0) {
                    mention.uids = mentionedUIDs
                }
                if (mention.all || mentionedUIDs.length > 0) {
                    content.mention = mention
                }
            }
            const connInfo = WKSDK.shared().connectManager.connectionInfo
            const startTs = Date.now()
            console.log(`[SEND] ▶ 发送消息 channel=${to.value.channelID} channelType=${to.value.channelType} text="${text.value.substring(0, 50)}" connected=${WKSDK.shared().connectManager.isConnected} nodeId=${connInfo?.nodeId || '?'} startTs=${startTs}`)
            if (expireSeconds.value > 0) {
                const packet = WKSDK.shared().chatManager.getSendPacketWithOptions(content, to.value, { setting, noPersist: false, reddot: true })
                packet.expire = expireSeconds.value
                const localMsg = Message.fromSendPacket(packet, content)
                messages.value.push(localMsg)
                console.log(`[SEND] sendSendPacket expire=${expireSeconds.value}s clientSeq=${packet.clientSeq} clientMsgNo=${packet.clientMsgNo}`)
                WKSDK.shared().chatManager.sendSendPacket(packet)
                expireSeconds.value = 0
            } else {
                // 使用 send() 的返回值（含 clientSeq），SDK 通过 notifyMessageListeners 自动推送消息
                const sentMsg = await WKSDK.shared().chatManager.send(content, to.value, setting)
                console.log(`[SEND] send() 完成: clientSeq=${sentMsg.clientSeq} clientMsgNo=${sentMsg.clientMsgNo} messageID=${sentMsg.messageID || '-'} messageSeq=${sentMsg.messageSeq || '-'}`)
            }
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

    const handleRevokeCMD = async (msg: Message) => {
        console.log('[handleRevokeCMD] ===== CMD消息到达 =====')
        console.log('[handleRevokeCMD] msg:', {
            messageID: msg.messageID,
            messageSeq: msg.messageSeq,
            fromUID: msg.fromUID,
            channelID: msg.channel?.channelID,
            channelType: msg.channel?.channelType,
            contentType: (msg as any).contentType,
            content: (msg as any).content,
            timestamp: msg.timestamp,
        })
        const cmdContent = (msg as any).content
        const cmdObj = cmdContent?.contentObj || cmdContent
        console.log('[handleRevokeCMD] cmdObj:', cmdObj)
        if (cmdObj?.cmd !== 'messageRevoke') {
            console.log('[handleRevokeCMD] 非 messageRevoke CMD，跳过。cmd=', cmdObj?.cmd)
            return
        }

        const cmdChannel = msg.channel
        const revokerUID = msg.fromUID
        const targetID = cmdObj?.param?.message_id
        const targetSeq = cmdObj?.param?.message_seq

        console.log('[handleRevokeCMD] 撤回CMD, targetID:', targetID, 'targetSeq:', targetSeq, 'revoker:', revokerUID, 'channel:', cmdChannel?.channelID)
        console.log('[handleRevokeCMD] 当前视图消息数:', messages.value.length)

        // First try direct match if server included target info
        if (targetID || targetSeq) {
            let found = false
            for (const m of messages.value) {
                if ((targetID && m.messageID === targetID) || (targetSeq && m.messageSeq === targetSeq)) {
                    m.remoteExtra.revoke = true
                    m.remoteExtra.revoker = revokerUID
                    addRevokedMessage(m.channel.channelID, m.channel.channelType, m.clientMsgNo, m.messageID, m.messageSeq, revokerUID)
                    messages.value = [...messages.value]
                    found = true
                    break
                }
            }
            if (found) return
        }

        // Server doesn't include target info in CMD broadcast — sync message extras
        console.log('[cmdRevokeListener] syncing message extras for channel:', cmdChannel.channelID)
        try {
            const extras = await WKSDK.shared().chatManager.syncMessageExtras(cmdChannel, 0)
            console.log('[cmdRevokeListener] synced extras count:', extras?.length)
            if (extras && extras.length > 0) {
                for (const extra of extras) {
                    if (extra.revoke === 1 || extra.revoke === true) {
                        const extraMsgID = extra.message_id_str || (extra.message_id ? String(extra.message_id) : '')
                        const extraMsgSeq = extra.message_seq
                        const extraRevoker = extra.revoker || revokerUID
                        console.log('[cmdRevokeListener] found revoked extra - msgID:', extraMsgID, 'seq:', extraMsgSeq)
                        // Apply to current view
                        for (const m of messages.value) {
                            if ((extraMsgID && m.messageID === extraMsgID) || (extraMsgSeq && m.messageSeq === extraMsgSeq)) {
                                if (!m.remoteExtra.revoke) {
                                    m.remoteExtra.revoke = true
                                    m.remoteExtra.revoker = extraRevoker
                                    addRevokedMessage(m.channel.channelID, m.channel.channelType, m.clientMsgNo, m.messageID, m.messageSeq, extraRevoker)
                                    messages.value = [...messages.value]
                                }
                            }
                        }
                        // Persist for future loads even if message not in current view
                        addRevokedMessage(cmdChannel.channelID, cmdChannel.channelType, '', extraMsgID, extraMsgSeq || 0, extraRevoker)
                    }
                }
            }
        } catch (e) {
            console.error('[cmdRevokeListener] syncMessageExtras failed:', e)
        }
    }

    const setupListeners = () => {
        cmdRevokeListener = (msg: Message) => { handleRevokeCMD(msg) }
        WKSDK.shared().chatManager.addCMDListener(cmdRevokeListener)

        messageListener = (msg: Message) => {
            if (!to.value.isEqual(msg.channel)) return

            console.log(`[RECV] ← 收到消息 channel=${msg.channel?.channelID} fromUID=${msg.fromUID} messageID=${msg.messageID} messageSeq=${msg.messageSeq} clientMsgNo=${msg.clientMsgNo || '-'} timestamp=${msg.timestamp}`)
            if (msg.clientMsgNo && messages.value.some(m => m.clientMsgNo === msg.clientMsgNo)) {
                const existing = messages.value.find(m => m.clientMsgNo === msg.clientMsgNo)
                console.log(`[RECV] 去重: 已有 clientMsgNo=${msg.clientMsgNo}, existing messageID=${existing?.messageID} new messageID=${msg.messageID}`)
                if (existing && !existing.messageID && msg.messageID) {
                    existing.messageID = msg.messageID
                    existing.messageSeq = msg.messageSeq
                    console.log(`[RECV] 更新本地消息: clientMsgNo=${msg.clientMsgNo} → messageID=${msg.messageID} messageSeq=${msg.messageSeq}`)
                    messages.value = [...messages.value]
                }
                return
            }
            messages.value.push(msg)
            console.log(`[RECV] 新增消息到列表: clientMsgNo=${msg.clientMsgNo || '-'} 当前列表长度=${messages.value.length}`)
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
            const reasonMessages: Record<number, string> = {
                0: '发送失败',
                4: '已被对方拉黑',
                13: '对方未允许陌生人消息',
                22: '发送太频繁，请稍后',
                23: '该用户不存在',
            }
            console.log(`[ACK] ← Sendack: clientSeq=${ack.clientSeq} reasonCode=${ack.reasonCode} messageID=${ack.messageID || '-'} messageSeq=${ack.messageSeq || '-'} clientMsgNo=${(ack as any).clientMsgNo || '-'} reason="${reasonMessages[ack.reasonCode] || (ack.reasonCode === 1 ? '成功' : '未知')}"`)
            let matched = false
            messages.value.forEach((m) => {
                if (m.clientSeq === ack.clientSeq) {
                    matched = true
                    if (ack.reasonCode === 1) {
                        m.status = MessageStatus.Normal
                        console.log(`[ACK] ✓ 消息状态更新为成功: clientSeq=${ack.clientSeq} messageID=${ack.messageID} messageSeq=${ack.messageSeq}`)
                    } else {
                        m.status = MessageStatus.Fail
                        ;(m as any).failReason = reasonMessages[ack.reasonCode] || '发送失败'
                        console.warn(`[ACK] ✗ 消息发送失败: clientSeq=${ack.clientSeq} reasonCode=${ack.reasonCode} reason="${(m as any).failReason}"`)
                    }
                    return
                }
            })
            if (!matched) {
                console.warn(`[ACK] ⚠ 未找到匹配消息: clientSeq=${ack.clientSeq} reasonCode=${ack.reasonCode} — 当前列表中clientSeq列表=[${messages.value.map(m => m.clientSeq).join(',')}] clientMsgNo列表=[${messages.value.map(m => m.clientMsgNo).join(',')}]`)
            }
        }
        WKSDK.shared().chatManager.addMessageStatusListener(messageStatusListener)
    }

    const teardownListeners = () => {
        WKSDK.shared().chatManager.removeCMDListener(cmdRevokeListener)
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

    const isSearchMatch = (m: Message) => (m as any).__searchMatch === true

    // Calendar
    const showCalendar = ref(false)
    const toggleCalendar = () => { showCalendar.value = !showCalendar.value }

    const scrollToDate = (dateStr: string) => {
        showCalendar.value = false
        const chat = chatRef.value
        if (!chat) return
        const target = messages.value.find(m => {
            if (!m.timestamp || !m.clientMsgNo) return false
            const d = new Date(m.timestamp * 1000)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            return key === dateStr
        })
        if (target?.clientMsgNo) {
            nextTick(() => {
                const el = document.getElementById(target.clientMsgNo!)
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    el.classList.add('date-jump-highlight')
                    setTimeout(() => el.classList.remove('date-jump-highlight'), 2000)
                }
            })
        }
    }

    const clearMessages = () => {
        messages.value = []
        members.clear()
    }

    return {
        messages, displayMessages, text, pulldowning, pulldownFinished,
        msgInputPlaceholder, streamNo, isComposing, hasHandled,
        setupListeners, teardownListeners,
        pullLast, pullDown, syncAllMessages, syncingAll, handleScroll, scrollBottom,
        onSend, onCustomMessageSend,
        isFirstInGroup, isLastInGroup, formatMsgTime,
        addSystemEvent, isSystemMessage,
        searchQuery, searchVisible, showFilesOnly,
        toggleSearch, toggleFilesOnly,
        members, onlineCount,
        clearMessages,
        searchMatchCount, isSearchMatch,
        replyingTo, setReplyingTo, cancelReply,
        showCalendar, toggleCalendar, scrollToDate,
        expireSeconds,
    }
}
