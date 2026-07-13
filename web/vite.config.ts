import path from "node:path"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from "vite"

const defaultManagerProxyTarget = "http://127.0.0.1:5311"

function getManagerProxyTarget(env: Record<string, string | undefined>) {
  const raw = env.VITE_MANAGER_API_TARGET?.trim() ?? ""
  if (!raw) {
    return defaultManagerProxyTarget
  }

  return raw.replace(/\/+$/, "")
}

export function createViteConfig(
  configEnv: ConfigEnv,
  env?: Record<string, string | undefined>,
): UserConfig {
  const resolvedEnv = env ?? { ...loadEnv(configEnv.mode, process.cwd(), ""), ...process.env }

  return {
    base: configEnv.command === "build" ? "/admin/" : "/",
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/manager": {
          target: getManagerProxyTarget(resolvedEnv),
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'vendor-ui'
            if (id.includes('recharts')) return 'vendor-chart'
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('react-intl') || id.includes('react')) return 'vendor-react'
          },
        },
      },
    },
  }
}

export default defineConfig((configEnv) => createViteConfig(configEnv))
