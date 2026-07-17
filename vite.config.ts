import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
