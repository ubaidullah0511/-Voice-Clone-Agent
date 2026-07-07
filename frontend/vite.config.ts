import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to all network interfaces, not just localhost -- lets you reach the dev server via the machine's LAN IP (e.g. from another device)
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/audio': 'http://127.0.0.1:8000',
      '/refs': 'http://127.0.0.1:8000',
    },
  },
})
