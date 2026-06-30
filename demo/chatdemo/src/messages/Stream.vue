<template>
    <div class="wk-markdown markdown-body" v-html="props.message.content?.text"></div>
</template>

<script setup lang="ts">
import type { Message } from 'wukongimjssdk'

const props = defineProps<{
    message: Message
}>()
</script>

<style scoped>

.wk-markdown {
    display: block;
    text-align: left;
    font-size: 14px;
    max-width: 320px;
    word-break: break-all;
    overflow-y: auto;
}




</style>