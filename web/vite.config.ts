import { defineConfig } from 'vite'

// GitHub Pages（/nexmax_chronicle/）でも動くよう相対パスで書き出す
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
