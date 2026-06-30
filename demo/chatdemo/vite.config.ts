import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/chatdemo',
  server: {
    fs: { strict: false },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-im': ['wukongimjssdk'],
          'vendor-md': ['marked', 'marked-highlight', 'highlight.js'],
        },
      },
    },
  },
})
