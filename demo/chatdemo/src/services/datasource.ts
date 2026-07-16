import { Channel, ChannelInfo, SyncOptions, WKSDK } from "wukongimjssdk"
import APIClient from "./APIClient"
import { authStore } from "./authStore"



export function initDataSource() {

    // 同步自己业务端的频道消息列表
    WKSDK.shared().config.provider.syncMessagesCallback = async (channel: Channel, opts: SyncOptions) => {
        const resultMessages = await APIClient.shared.syncMessages(channel, opts)
        return resultMessages
    }

    // 同步自己业务端的最近会话列表
    WKSDK.shared().config.provider.syncConversationsCallback = async () => {
        const resultConversations = await APIClient.shared.syncConversations()
        return resultConversations
    }

    // 获取频道信息
    WKSDK.shared().config.provider.channelInfoCallback = async (channel: Channel) => {
        let title = channel.channelID.substring(0, 1).toUpperCase()
        let orgData: Record<string, any> = {}

        // Fetch group metadata from biz backend for group channels
        if (channel.channelType === 2) {
            try {
                const resp = await fetch(`/api/biz/groups/${channel.channelID}`, { headers: authStore.authHeaders })
                if (resp.ok) {
                    const group = await resp.json()
                    title = group.name || title
                    const nicknames: Record<string, string> = {}
                    if (group.members) {
                        for (const m of group.members) {
                            if (m.nickname) nicknames[m.uid] = m.nickname
                        }
                    }
                    orgData = {
                        groupName: group.name,
                        ownerUID: group.owner_uid,
                        memberNicknames: nicknames,
                    }
                }
            } catch { /* fallback to default */ }
        }

        // For person channels, fetch the other user's name
        if (channel.channelType === 1) {
            try {
                const resp = await fetch(`/api/biz/members/directory/${channel.channelID}`, { headers: authStore.authHeaders })
                if (resp.ok) {
                    const user = await resp.json()
                    title = user.name || title
                    orgData = { peerName: user.name, peerDept: user.department, peerRole: user.role }
                }
            } catch { /* fallback to default */ }
        }

        let channelInfo: ChannelInfo = {
            title: title,
            logo: '',
            mute: false,
            top: false,
            orgData: orgData,
            online: false,
            lastOffline: 0,
            channel: channel
        }
        return channelInfo
    }

    // 同步频道订阅者（成员列表）
    WKSDK.shared().config.provider.syncSubscribersCallback = async (channel: Channel, version: number) => {
        const resp = await APIClient.shared.get('/channel/subscribers', {
            param: { channel_id: channel.channelID, channel_type: channel.channelType }
        })
        const items = (resp as any[]) || []
        return items.map((item: any) => ({
            uid: item.uid || item,
            channel: channel,
            version: version + 1,
            isDeleted: false,
            role: item.role || 0,
            status: item.status || 0,
        }))
    }

    // 同步消息扩展信息（已读回执等）
    WKSDK.shared().config.provider.syncMessageExtraCallback = async (channel: Channel, extraVersion: number, limit: number) => {
        const resp = await APIClient.shared.post('/channel/messageextra/sync', {
            login_uid: WKSDK.shared().config.uid,
            channel_id: channel.channelID,
            channel_type: channel.channelType,
            extra_version: extraVersion,
            limit: limit,
        })
        return (resp && resp.message_extras) ? resp.message_extras : []
    }

    // 消息已读回执
    WKSDK.shared().config.provider.messageReadedCallback = async (channel: Channel, messages: any[]) => {
        if (!messages || messages.length === 0) return
        await APIClient.shared.post('/channel/messageReaded', {
            login_uid: WKSDK.shared().config.uid,
            channel_id: channel.channelID,
            channel_type: channel.channelType,
            client_msg_nos: messages.map((m: any) => m.clientMsgNo),
        })
    }


}