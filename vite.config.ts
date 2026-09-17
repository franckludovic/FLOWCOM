import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/buffer-api': {
        target: 'https://api.buffer.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/buffer-api/, '')
      }
    }
  }
})
