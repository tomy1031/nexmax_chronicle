// 物理（Rapier）の WebAssembly を、JS の中の文字（base64）から、別の .wasm ファイルに出す（ビルドのときだけ）。
// @dimforge/rapier3d-compat は WASM を base64 の文字で JS に埋めこんでいる（4.3 MB。gzip で 1.65 MB）。
// 別のファイルにすると、ダウンロードが約 3 割へり（gzip の WASM）、ブラウザは文字をほどかずに、届きながら翻訳できる（compileStreaming）。
// 初期化の関数は、もともと URL を受け取れる（wasm-bindgen の module_or_path）ので、base64 の文字を、出したファイルの URL に置きかえるだけ。
import type { Plugin } from 'vite'

const RAPIER_RE = /@dimforge[\\/]rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/
/** 埋めこまれた WASM（"AGFzbQ" は WASM の先頭 \0asm の base64）を読む式（うしろの .buffer ごと置きかえる） */
const EMBED_RE = /[A-Za-z_$][\w$]*\.toByteArray\("(AGFzbQ[A-Za-z0-9+/=]+)"\)(\.buffer)?/

export function rapierWasmFile(): Plugin {
  return {
    name: 'nexmax-rapier-wasm',
    apply: 'build',
    transform(code, id) {
      if (!RAPIER_RE.test(id)) return null
      const m = EMBED_RE.exec(code)
      if (!m) {
        this.warn('Rapier の埋めこみの WASM が見つかりません（版が変わった？）。そのまま使います')
        return null
      }
      const ref = this.emitFile({ type: 'asset', name: 'rapier3d.wasm', source: Buffer.from(m[1], 'base64') })
      return { code: code.replace(m[0], `new URL(import.meta.ROLLUP_FILE_URL_${ref})`), map: null }
    },
  }
}
