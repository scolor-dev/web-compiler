import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  // YoWASP resolves its split LLVM modules with `new URL(`./${name}`,
  // import.meta.url)`. Pre-bundling moves that expression into Vite's shared
  // dependency directory and makes the generated glob include unrelated files.
  optimizeDeps: { exclude: ['@yowasp/clang'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
