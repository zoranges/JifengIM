<script setup lang="ts">
import { ref } from 'vue'
import type { Message } from 'wukongimjssdk'

const props = defineProps<{
    message: Message
}>()

const content = props.message.content
const url = content?.url || content?.remoteUrl || ''

const loaded = ref(false)
const error = ref(false)
const fullscreen = ref(false)

const toggleFullscreen = () => {
    if (loaded.value && !error.value) {
        fullscreen.value = !fullscreen.value
    }
}
</script>

<template>
    <div class="image-msg">
        <div v-if="!url" class="image-placeholder">[图片]</div>
        <template v-else>
            <div v-if="!loaded && !error" class="image-loading">
                <span class="loading-spinner"></span>
            </div>
            <img
                :src="url"
                :class="{ loaded: loaded, error: error }"
                @load="loaded = true"
                @error="error = true"
                @click="toggleFullscreen"
            />
            <div v-if="error" class="image-placeholder">[图片加载失败]</div>
        </template>
        <div v-if="fullscreen" class="image-fullscreen" @click="fullscreen = false">
            <img :src="url" />
        </div>
    </div>
</template>

<style scoped>
.image-msg {
    max-width: 280px;
    position: relative;
}

.image-msg img {
    max-width: 100%;
    max-height: 320px;
    border-radius: 8px;
    cursor: pointer;
    display: none;
    object-fit: cover;
}

.image-msg img.loaded {
    display: block;
}

.image-msg img.error {
    display: none;
}

.image-loading {
    width: 200px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.05);
    border-radius: 8px;
}

.loading-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(0,0,0,0.1);
    border-top-color: var(--primary, #4f6ef7);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.image-placeholder {
    padding: 12px 16px;
    color: var(--text-muted, #999);
    font-size: 13px;
}

.image-fullscreen {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.image-fullscreen img {
    max-width: 90vw;
    max-height: 90vh;
    display: block;
    border-radius: 4px;
}
</style>
