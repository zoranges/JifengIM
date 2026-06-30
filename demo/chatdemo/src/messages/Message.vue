<script setup lang="ts">

import { computed } from 'vue'
import { Message, MessageContentType } from 'wukongimjssdk';
import Text from './Text.vue'
import CustomMessage from './CustomMessage.vue'
import { orderMessage } from '../customessage'
import Stream from './Stream.vue';
import ImageMsg from './Image.vue';
import FileCard from './FileCard.vue';

const props = defineProps<{
    message: Message
    searchQuery?: string
}>()

const contentType = props.message.content.contentType
const streamOn = props.message.setting.streamOn

const isFileMessage = computed(() => {
    if (contentType !== MessageContentType.text) return false
    const text = props.message.content?.text || ''
    return text.startsWith('{file:')
})

</script>

<template>
    <div>
        <Stream :message="$props.message" v-if="streamOn"></Stream>
        <FileCard :message="$props.message" :searchQuery="searchQuery" v-else-if="isFileMessage"></FileCard>
        <Text :message="$props.message" :searchQuery="searchQuery" v-else-if="contentType === MessageContentType.text"></Text>
        <ImageMsg :message="$props.message" v-else-if="contentType === MessageContentType.image"></ImageMsg>
        <CustomMessage :message="$props.message" v-else-if="contentType === orderMessage" ></CustomMessage>
    </div>
</template>