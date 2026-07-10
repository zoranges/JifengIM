import { Channel, ChannelInfo, SyncOptions, WKSDK } from "wukongimjssdk"
import APIClient from "./APIClient"



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
        // 这里仅做演示，实际应该是请求自己业务端的接口，然后返回自己业务端的频道信息，然后填充ChannelInfo,这样在UI的各处就可以很容易的获取到频道的业务信息
        let channelInfo: ChannelInfo = {
            title: channel.channelID.substring(0, 1).toUpperCase(),
            logo: `https://api.dicebear.com/9.x/adventurer/svg?seed=${channel.channelID}&radius=50&backgroundType=gradientLinear&backgroundColor=ffd5dc`,
            mute: false, // 是否免打扰
            top: false, // 是否置顶
            orgData: {}, // 自己独有的业务数据可以放到这里
            online: false, // 是否在线
            lastOffline: 0, // 最后离线时间
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