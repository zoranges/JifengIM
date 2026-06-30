<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from 'wukongimjssdk'
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
</script>

<template>
    <div class="text" v-html="html"></div>
</template>

<style scoped>
.text {
    text-align: left;
    font-size: 14px;
    max-width: 250px;
    word-break: break-all;
}
</style>
