import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const proxy = { '/api': 'http://127.0.0.1:8000' }

export default defineConfig({
  server: { proxy },
  preview: { proxy },
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
