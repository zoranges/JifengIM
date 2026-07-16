<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { CMDContent, Channel, ChannelInfo, ChannelTypePerson, ChannelTypeGroup, ConnectStatus, ConnectStatusListener, Conversation, ConversationAction, Message, WKSDK } from 'wukongimjssdk';
import { ConversationWrap } from './ConversationWrap';
import APIClient, { CMDType } from '../../services/APIClient';
import { addRevokedMessage } from '../../services/revokeStore';

const conversationWraps = ref<ConversationWrap[]>()
const selectedChannel = ref<Channel>()

// Filter to show only person-to-person conversations (groups go in the 群聊 tab)
const personConversations = computed(() => {
    return (conversationWraps.value || []).filter(c => c.channel.channelType === ChannelTypePerson)
})

const onSelectChannel = defineProps<{ onSelectChannel: (channel: Channel) => void }>()

const syncConversations = async () => {
    try {
        const remoteConversations = await WKSDK.shared().conversationManager.sync()
        console.log('[Conversation] sync result:', remoteConversations?.length || 0, 'conversations')
        if (remoteConversations && remoteConversations.length > 0) {
            conversationWraps.value = sortConversations(remoteConversations.map(c => new ConversationWrap(c)))
        } else {
            conversationWraps.value = []
        }
    } catch (e) {
        console.error('[Conversation] sync failed:', e)
    }
}

const connectStatusListener = async (status: ConnectStatus) => {
    if (status === ConnectStatus.Connected) {
        syncConversations()
    }
}

const cmdListener = (msg: Message) => {
    const cmdContent = msg.content as CMDContent
    if (cmdContent.cmd === CMDType.CMDTypeClearUnread) {
        const clearChannel = new Channel(cmdContent.param.channelID, cmdContent.param.channelType)
        clearConversationUnread(clearChannel)
    } else if (cmdContent.cmd === CMDType.CMDTypeMessageRevoke) {
        // Server broadcasts revoke CMD with empty param — sync extras to get actual revoke info
        const cmdChannel = msg.channel
        WKSDK.shared().chatManager.syncMessageExtras(cmdChannel, 0).then((extras: any[]) => {
            if (extras && extras.length > 0) {
                for (const extra of extras) {
                    if (extra.revoke === 1 || extra.revoke === true) {
                        const msgID = extra.message_id_str || (extra.message_id ? String(extra.message_id) : '')
                        addRevokedMessage(
                            cmdChannel.channelID,
                            cmdChannel.channelType,
                            '',
                            msgID,
                            extra.message_seq || 0,
                            extra.revoker || msg.fromUID,
                        )
                    }
                }
            }
        }).catch(() => { /* ignore */ })
    }
}

const conversationListener = (conversation: Conversation, action: ConversationAction) => {
    if (action === ConversationAction.add) {
        conversationWraps.value = [new ConversationWrap(conversation), ...(conversationWraps.value || [])]
    } else if (action === ConversationAction.update) {
        const index = conversationWraps.value?.findIndex(item => item.channel.channelID === conversation.channel.channelID && item.channel.channelType === conversation.channel.channelType)
        if (index !== undefined && index >= 0) {
            conversationWraps.value![index] = new ConversationWrap(conversation)
            conversationWraps.value = sortConversations()
        }
    } else if (action === ConversationAction.remove) {
        const index = conversationWraps.value?.findIndex(item => item.channel.channelID === conversation.channel.channelID && item.channel.channelType === conversation.channel.channelType)
        if (index !== undefined && index >= 0) {
            conversationWraps.value?.splice(index, 1)
        }
    }
}

const channelInfoListener = (channelInfo: ChannelInfo) => {
    conversationWraps.value = [...conversationWraps.value || []]
}

const clearConversationUnread = (channel: Channel) => {
    const conversation = WKSDK.shared().conversationManager.findConversation(channel)
    if (conversation) {
        conversation.unread = 0
        WKSDK.shared().conversationManager.notifyConversationListeners(conversation, ConversationAction.update)
    }
}

onMounted(async () => {
    WKSDK.shared().connectManager.addConnectStatusListener(connectStatusListener)
    WKSDK.shared().conversationManager.addConversationListener(conversationListener)
    WKSDK.shared().chatManager.addCMDListener(cmdListener)
    WKSDK.shared().channelManager.addListener(channelInfoListener)

    // Sync immediately if already connected (e.g., page refresh)
    if (WKSDK.shared().connectManager.status === ConnectStatus.Connected) {
        syncConversations()
    }
})

onUnmounted(() => {
    WKSDK.shared().conversationManager.removeConversationListener(conversationListener)
    WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener)
    WKSDK.shared().chatManager.removeCMDListener(cmdListener)
    WKSDK.shared().channelManager.removeListener(channelInfoListener)
})

const sortConversations = (conversations?: Array<ConversationWrap>) => {
    let newConversations = conversations;
    if (!newConversations) {
        newConversations = conversationWraps.value
    }
    if (!newConversations || newConversations.length <= 0) {
        return [];
    }
    let sortAfter = newConversations.sort((a, b) => {
        let aScore = a.timestamp;
        let bScore = b.timestamp;
        if (a.extra?.top === 1) {
            aScore += 1000000000000;
        }
        if (b.extra?.top === 1) {
            bScore += 1000000000000;
        }
        return bScore - aScore;
    });
    return sortAfter
}

const onSelectChannelClick = (channel: Channel) => {
    selectedChannel.value = channel
    if (onSelectChannel) {
        onSelectChannel.onSelectChannel(channel)
    }
    APIClient.shared.clearUnread(channel)
    clearConversationUnread(channel)
}

const getConversationItemCss = (conversationWrap: ConversationWrap) => {
    if (!selectedChannel.value) {
        return 'conversation-item'
    }
    if (selectedChannel.value.isEqual(conversationWrap.channel)) {
        return 'conversation-item selected'
    }
    return 'conversation-item'
}

const fetchChannelInfoIfNeed = (channel: Channel) => {
    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel)
    // Always fetch for group channels if we don't have biz-backend data yet.
    // The SDK's conversation sync may have cached IM-server channel info without
    // the group name from biz-backend.
    if (!channelInfo) {
        WKSDK.shared().channelManager.fetchChannelInfo(channel)
    } else if (channel.channelType === ChannelTypeGroup && !channelInfo.orgData?.groupName) {
        WKSDK.shared().channelManager.fetchChannelInfo(channel)
    }
}

const deleteConversation = async (e: Event, conversationWrap: ConversationWrap) => {
    e.stopPropagation()
    if (!confirm('确定删除此会话？')) return
    try {
        await APIClient.shared.deleteConversation(conversationWrap.channel)
        WKSDK.shared().conversationManager.removeConversation(conversationWrap.channel)
    } catch { /* ignore */ }
}

</script>

<template>
    <div class="conversations">
        <div :class="getConversationItemCss(conversationWrap)" v-for="conversationWrap in personConversations" :onClick="() => {
            onSelectChannelClick(conversationWrap.channel)
        }">
            {{ fetchChannelInfoIfNeed(conversationWrap.channel) }}
            <div class="item-content">
                <div class="left">
                    <div class="avatar person-avatar" v-if="conversationWrap.channel.channelType === ChannelTypePerson">
                        <span>{{ (conversationWrap.channelInfo?.title || conversationWrap.channel.channelID).charAt(0) }}</span>
                    </div>
                    <div class="avatar group-avatar" v-else>
                        <span>{{ (conversationWrap.channelInfo?.title || conversationWrap.channel.channelID).charAt(0) }}</span>
                    </div>
                </div>
                <div class="right">
                    <div class="right-row-1">
                        <div class="title">{{ conversationWrap.channelInfo?.title || conversationWrap.channel.channelID }}</div>
                        <div class="time">{{ conversationWrap.timestampString }}</div>
                    </div>
                    <div class="right-row-2">
                        <div class="last-msg">{{ conversationWrap.conversationDigest }}</div>
                        <div v-if="conversationWrap.unread > 0" class="badge">{{ conversationWrap.unread > 99 ? '99+' : conversationWrap.unread }}</div>
                    </div>
                </div>
                <button class="conv-delete-btn" @click="(e: Event) => deleteConversation(e, conversationWrap)" title="删除会话">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.conversations {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 8px;
}

.conversation-item {
    display: flex;
    padding: 12px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--transition);
    margin-bottom: 2px;
    position: relative;
}

.conversation-item:hover {
    background: var(--bg-elevated);
}

.conversation-item.selected {
    background: linear-gradient(135deg, rgba(79, 110, 247, 0.08), rgba(0, 212, 170, 0.06));
    border: 1px solid rgba(79, 110, 247, 0.15);
}

.item-content {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
}

.left {
    flex-shrink: 0;
}

.avatar {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-elevated);
}

.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.person-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #64748b, #475569);
}

.person-avatar span {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
}

.group-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--primary), var(--accent));
}

.group-avatar span {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
}

.right {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.right-row-1,
.right-row-2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
}

.time {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
}

.last-msg {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
}

.badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.conv-delete-btn {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
}

.conversation-item:hover .conv-delete-btn {
    opacity: 0.5;
}

.conv-delete-btn:hover {
    opacity: 1 !important;
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
}
</style>
