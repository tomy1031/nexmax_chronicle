// 会話の顔（ui/future/speakerIcons.ts と chronicle/art.ts の V7_PORTRAITS）
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOWA_UNMASKED, V7_PORTRAITS } from '../src/chronicle/art'
import { NEXMAX_FACE_MOODS, dialogFaceName, isArtSource, nexmaxMood, speakerStyle } from '../src/ui/future/speakerIcons'

const web = resolve(__dirname, '..')
const publicPath = (url: string) => join(web, 'public', url.replace(/^\.\//, ''))

/** 台詞の JSON の話者名を全部集める */
function allSpeakers(): Set<string> {
  const names = new Set<string>()
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (!x || typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.speaker === 'string') names.add(o.speaker)
    Object.values(o).forEach(walk)
  }
  const visit = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) visit(p)
      else if (f.endsWith('.json')) walk(JSON.parse(readFileSync(p, 'utf8')))
    }
  }
  visit(join(web, 'src'))
  return names
}

describe('会話の顔の絵', () => {
  it('絵のファイルが全部ある（小さい webp）', () => {
    for (const url of [...Object.values(V7_PORTRAITS), TOWA_UNMASKED]) {
      const p = publicPath(url)
      expect(existsSync(p), url).toBe(true)
      expect(statSync(p).size, url).toBeLessThan(45 * 1024)
    }
  })

  it('おもな登場人物は全員イラスト（GLB を読まない）', () => {
    const cast = ['ネクマックス', 'ソラ', 'ソラ（8歳）', 'ソラ（通信）', 'マツイ社長', '佐伯', '佐伯（2068年）', '源兵衛', 'おはる', '量産型NEXMAX', '量産型NEXMAX No.33', 'トワのお母さん', '仮面の男', 'トワ', 'トワ（小さいころ）', 'チャンダ', 'チャンダのおばあさん', 'おふじ', '小さなロボット']
    for (const n of cast) expect(isArtSource(speakerStyle(n).source), n).toBe(true)
  })

  it('台詞に出てくる話者で、イラストの顔の人には、絵が渡される', () => {
    const given = new Set(Object.keys(V7_PORTRAITS).map((n) => speakerStyle(n).source))
    for (const n of allSpeakers()) {
      const s = speakerStyle(n).source
      if (isArtSource(s)) expect(given.has(s), n).toBe(true)
    }
  })

  it('番号つきの量産型・言いかえは同じ顔、仮面の男とトワは別（結末でトワだけ素顔に差しかわる）', () => {
    expect(speakerStyle('量産型NEXMAX No.112').source).toBe(speakerStyle('量産型NEXMAX').source)
    expect(speakerStyle('ソラ（通信）').source).toBe(speakerStyle('ソラ').source)
    expect(speakerStyle('ソラ（8歳）').source).not.toBe(speakerStyle('ソラ').source)
    expect(speakerStyle('仮面の男').source).not.toBe(speakerStyle('トワ').source)
    expect(speakerStyle('トワ').color).toBe(speakerStyle('仮面の男').color)
  })

  it('ネクマックスの表情の絵（# のあと）。名札の色は同じ', () => {
    for (const m of NEXMAX_FACE_MOODS) {
      const name = m === 'normal' ? 'ネクマックス' : `ネクマックス#${m}`
      expect(V7_PORTRAITS[name], name).toBeTruthy()
      expect(speakerStyle(name).color).toBe(speakerStyle('ネクマックス').color)
    }
    expect(speakerStyle('ネクマックス#happy').source).toBe('art:nexmax_happy')
    expect(speakerStyle('ネクマックス#nanika').source).toBe('art:nexmax')
    expect(dialogFaceName('ソラ', 'ありがとう！')).toBe('ソラ')
    expect(dialogFaceName('ネクマックス', 'えっ！？ ぼくのこと、知ってるの？')).toBe('ネクマックス#surprised')
    expect(dialogFaceName('ネクマックス', 'えっと……NEXTMAKE、かな？')).toBe('ネクマックス')
  })

  it('表情は控えめに（迷ったら「ふつう」）', () => {
    expect(nexmaxMood('うん。')).toBe('normal')
    expect(nexmaxMood('あった、中継アンテナ！')).toBe('normal')
    expect(nexmaxMood('やった！')).toBe('happy')
    expect(nexmaxMood('（ごめんね。ソラが待ってるんだ）')).toBe('worried')
    expect(nexmaxMood('わっ！')).toBe('surprised')
  })
})
