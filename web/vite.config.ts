import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { nexmaxPwa } from './scripts/vite-pwa-plugin.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// GitHub Pages（/nexmax_chronicle/）でも動くよう相対パスで書き出す
export default defineConfig({
  base: './',
  plugins: [nexmaxPwa()],
  define: {
    // タイトル画面の右下に出す版
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    // Service Worker（差分ダウンロード）が「最初に要るファイル」を知るため。書き出した後、プラグインが読んで消す
    manifest: true,
    rolldownOptions: {
      output: {
        // 変わりにくいライブラリを別のファイルに分ける。ゲームのコードを直しても、
        // 物理（Rapier、WASM 入りで大きい）・three.js・後処理は同じファイル名のままなので、もう一度ダウンロードしない
        codeSplitting: {
          groups: [
            { name: 'vendor-rapier', test: /node_modules[\\/]@dimforge[\\/]/, priority: 30 },
            { name: 'vendor-three', test: /node_modules[\\/]three[\\/]build[\\/]/, priority: 20 },
            { name: 'vendor-post', test: /node_modules[\\/](postprocessing|n8ao)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
