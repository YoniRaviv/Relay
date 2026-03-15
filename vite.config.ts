import 'dotenv/config'
import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { version } from './package.json'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            sourcemap: 'hidden',
            rollupOptions: {
              external: (id) => {
                const externals = ['better-sqlite3', 'electron-store', '@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', 'simple-git', 'electron-updater', '@sentry/electron']
                return externals.some(ext => id === ext || id.startsWith(ext + '/'))
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
    sentryVitePlugin({
      org: 'relay-app',
      project: 'relay',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: `relay@${version}` },
      sourcemaps: { assets: ['./dist/**'] },
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
})
