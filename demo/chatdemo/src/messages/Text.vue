<script setup lang="ts">
import { computed } from 'vue'
import type { Message, MessageContent } from 'wukongimjssdk'
import { highlightText } from '../services/utils'

const props = defineProps<{
    message: Message
    searchQuery?: string
}>()

const html = computed(() => {
    const text = props.message.content?.text || ''
    if (props.searchQuery) {
        return highlightText(text, props.searchQuery)
    }
    return text
})

const reply = computed(() => {
    return (props.message.content as any)?.reply
})

const replyText = computed(() => {
    const r = reply.value
    if (!r?.content) return ''
    const c = r.content as MessageContent
    return (c as any).conversationDigest || (c as any).text || ''
})

const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s
</script>

<template>
    <div class="reply-card" v-if="reply">
        <div class="reply-card-inner">
            <div class="reply-card-header">{{ reply.fromName || reply.fromUID }}</div>
            <div class="reply-card-body">{{ truncate(replyText, 60) }}</div>
        </div>
    </div>
    <div class="text" v-html="html"></div>
</template>

<style scoped>
.reply-card {
    margin-bottom: 6px;
}

.reply-card-inner {
    padding: 6px 10px;
    border-left: 3px solid var(--primary, #4f6ef7);
    background: rgba(79,110,247,0.06);
    border-radius: 0 6px 6px 0;
    max-width: 240px;
}

.reply-card-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--primary, #4f6ef7);
    margin-bottom: 2px;
}

.reply-card-body {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.text {
    text-align: left;
    font-size: 14px;
    max-width: 250px;
    word-break: break-all;
}
</style>
