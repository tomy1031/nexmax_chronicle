import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 写真のテクスチャ（public/textures/<名前>/*_1k.jpg）には、KTX2 の版がそろっていること（render/pbrTextures.ts が先に読む）
const ROOT = join(__dirname, '../public/textures')
const sets = readdirSync(ROOT).filter((n) => statSync(join(ROOT, n)).isDirectory() && existsSync(join(ROOT, n, 'diff_1k.jpg')))

describe('写真のテクスチャの KTX2', () => {
  it('組がある', () => expect(sets.length).toBeGreaterThan(5))
  for (const n of sets) {
    it(`${n}：diff・arm・nor（1k と 512）の .ktx2 がある`, () => {
      for (const f of ['diff_1k.ktx2', 'arm_1k.ktx2', 'nor_1k.ktx2', 'nor_512.ktx2']) {
        const p = join(ROOT, n, f)
        expect(existsSync(p), p).toBe(true)
        expect(statSync(p).size).toBeGreaterThan(10_000)
      }
    })
  }
  it('KTX2 をほどくプログラム（basis）が public にある', () => {
    expect(existsSync(join(__dirname, '../public/basis/basis_transcoder.js'))).toBe(true)
    expect(existsSync(join(__dirname, '../public/basis/basis_transcoder.wasm'))).toBe(true)
  })
})
