// 町の人（モブ）の台詞の選び方（src/world/mobTalkLogic.ts）と、2086年・2026年の台詞の表・話す人の選び方のテスト。
// ・場面（morning / loop_morning / night）ごとの台詞、書いていない場面は元の場面を一字一句そのまま繰り返す
// ・吹き出しの出し方：近づくと 1 行、同時に最大 2 つ、出だしの間隔、言い終えたら離れるまで黙る、会話中は消える
import { describe, expect, it } from 'vitest'
import {
  MOB_DIRECTOR_DEFAULTS,
  MobTalkDirector,
  bubbleLinesFor,
  bubbleSeconds,
  hasTalk,
  resolvePhase,
  talkLinesFor,
  type MobTable,
} from '../src/world/mobTalkLogic'
import { MOB_SLOTS_2086, MOB_TABLE_2086, mobPhase2086, pickCrowdSpeakers } from '../src/stages/future2086/mobTalk2086'
import { MOB_TABLE_2026, MOB_WALKERS_2026, mobPhase2026 } from '../src/stages/namba2026/mobTalk2026'
import { UNIT_SPECS } from '../src/stages/future2086/units'

const TABLE: MobTable = {
  repeatOf: { loop_morning: 'morning', loop_morning2: 'loop_morning' },
  speakers: {
    a: { name: 'A', bubble: { morning: ['a1', 'a2'], night: ['an'] }, talk: { morning: [{ speaker: 'A', text: 'hi' }] } },
    b: { name: 'B', bubble: { morning: ['b1'], loop_morning2: ['b1', 'déjà'] } },
    c: { name: 'C', bubble: { morning: ['c1', 'c2', 'c3'] } },
  },
}
const IDS = ['a', 'b', 'c']

/** 吹き出しを出す前の待ち（startDelay）を飛ばした監督 */
function director(n = 3, cfg = {}): MobTalkDirector {
  const d = new MobTalkDirector(n, { startDelay: 0, ...cfg })
  d.setLines('morning', bubbleLinesFor(TABLE, IDS, 'morning'))
  return d
}

const FAR = Infinity
const REACH = [2.5, 2.5, 2.5]

function shown(d: MobTalkDirector): string[] {
  return d.slots.filter((s) => s.speaker >= 0).map((s) => s.text)
}

/** dt ずつ seconds 秒進める */
function run(d: MobTalkDirector, seconds: number, dist: number[], suspended = false, dt = 0.05): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) d.update(dt, dist, REACH, suspended)
}

describe('場面の台詞（resolvePhase）', () => {
  it('書いてある場面はそのまま、書いていない場面は repeatOf をたどって一字一句同じ台詞', () => {
    expect(resolvePhase(TABLE.speakers.a.bubble, 'morning', TABLE.repeatOf)).toEqual(['a1', 'a2'])
    expect(resolvePhase(TABLE.speakers.a.bubble, 'loop_morning', TABLE.repeatOf)).toBe(TABLE.speakers.a.bubble.morning)
    expect(resolvePhase(TABLE.speakers.a.bubble, 'loop_morning2', TABLE.repeatOf)).toBe(TABLE.speakers.a.bubble.morning)
    expect(resolvePhase(TABLE.speakers.b.bubble, 'loop_morning2', TABLE.repeatOf)).toEqual(['b1', 'déjà'])
  })
  it('どこにも無い場面は空（その場面では黙っている）', () => {
    expect(resolvePhase(TABLE.speakers.b.bubble, 'night', TABLE.repeatOf)).toEqual([])
    expect(resolvePhase(undefined, 'morning', TABLE.repeatOf)).toEqual([])
  })
  it('F の会話：その場面の会話が無ければ、次に言う吹き出しの 1 行を名前付きで', () => {
    expect(talkLinesFor(TABLE, 'a', 'morning', 0)).toEqual([{ speaker: 'A', text: 'hi' }])
    expect(talkLinesFor(TABLE, 'c', 'morning', 1)).toEqual([{ speaker: 'C', text: 'c2' }])
    expect(talkLinesFor(TABLE, 'c', 'morning', 4)).toEqual([{ speaker: 'C', text: 'c2' }])
    expect(talkLinesFor(TABLE, 'b', 'night', 0)).toEqual([])
    expect(hasTalk(TABLE, 'b', 'night')).toBe(false)
    expect(hasTalk(TABLE, 'a', 'night')).toBe(true)
  })
  it('表示秒数は文字数で決まり、上下限に収まる', () => {
    expect(bubbleSeconds('あ')).toBe(MOB_DIRECTOR_DEFAULTS.minDur)
    expect(bubbleSeconds('あ'.repeat(200))).toBe(MOB_DIRECTOR_DEFAULTS.maxDur)
    expect(bubbleSeconds('あ'.repeat(24))).toBeGreaterThan(bubbleSeconds('あ'.repeat(8)))
  })
})

describe('吹き出しの出し方（MobTalkDirector）', () => {
  it('ステージが始まってすぐは出さない（時代カードとかぶらない）', () => {
    const d = new MobTalkDirector(3)
    d.setLines('morning', bubbleLinesFor(TABLE, IDS, 'morning'))
    run(d, 1, [1, FAR, FAR])
    expect(shown(d)).toEqual([])
    run(d, MOB_DIRECTOR_DEFAULTS.startDelay, [1, FAR, FAR])
    expect(shown(d)).toEqual(['a1'])
  })
  it('範囲に入った人が 1 行目を言い、とどまると間をおいて 2 行目、言い終えたら離れるまで黙る', () => {
    const d = director()
    d.update(0.05, [1, FAR, FAR], REACH, false)
    expect(shown(d)).toEqual(['a1'])
    run(d, bubbleSeconds('a1') + 0.1, [1, FAR, FAR])
    expect(shown(d)).toEqual([])
    run(d, MOB_DIRECTOR_DEFAULTS.linger, [1, FAR, FAR])
    expect(shown(d)).toEqual(['a2'])
    run(d, 30, [1, FAR, FAR])
    expect(shown(d)).toEqual([])
    // 離れて、休みのあとにまた来ると、続き（台詞の先頭に戻って）から
    run(d, 1, [FAR, FAR, FAR])
    d.update(0.05, [1, FAR, FAR], REACH, false)
    expect(shown(d)).toEqual(['a1'])
  })
  it('離れてすぐ戻っても、休み（rest）の間は言わない', () => {
    const d = director(3, { rest: 6 })
    // b は 1 行だけ → 言い終えた
    d.update(0.05, [FAR, 1, FAR], REACH, false)
    expect(shown(d)).toEqual(['b1'])
    run(d, bubbleSeconds('b1') + 0.2, [FAR, 1, FAR])
    run(d, 0.5, [FAR, FAR, FAR])
    run(d, 2, [FAR, 1, FAR])
    expect(shown(d)).toEqual([])
    // 休みが明けると（戻ってきた訪問として）また言う
    let said = false
    for (let t = 0; t < 6; t += 0.05) {
      d.update(0.05, [FAR, 1, FAR], REACH, false)
      if (shown(d)[0] === 'b1') said = true
    }
    expect(said).toBe(true)
  })
  it('同時に見えるのは最大 2 つ、出だしは gap 秒あける、近い人から', () => {
    const d = director()
    d.update(0.05, [2, 1.5, 1], REACH, false)
    expect(shown(d)).toEqual(['c1'])
    run(d, MOB_DIRECTOR_DEFAULTS.gap * 0.5, [2, 1.5, 1])
    expect(shown(d)).toHaveLength(1)
    run(d, MOB_DIRECTOR_DEFAULTS.gap, [2, 1.5, 1])
    expect(shown(d)).toEqual(['c1', 'b1'])
    run(d, MOB_DIRECTOR_DEFAULTS.gap, [2, 1.5, 1])
    expect(shown(d)).toHaveLength(2)
    expect(d.slots.length).toBe(2)
  })
  it('範囲の外の人・台詞の無い人は言わない', () => {
    const d = director()
    run(d, 3, [3, FAR, 2.6])
    expect(shown(d)).toEqual([])
    d.setLines('night', bubbleLinesFor(TABLE, IDS, 'night'))
    run(d, 3, [FAR, 1, 1])
    expect(shown(d)).toEqual([])
  })
  it('会話・演出の間（suspended）は消え、終わってから少し待って再開する', () => {
    const d = director()
    d.update(0.05, [1, FAR, FAR], REACH, false)
    expect(shown(d)).toEqual(['a1'])
    d.update(0.05, [1, FAR, FAR], REACH, true)
    expect(shown(d)).toEqual([])
    run(d, 10, [1, FAR, FAR], true)
    expect(shown(d)).toEqual([])
    run(d, MOB_DIRECTOR_DEFAULTS.resumeDelay * 0.5, [1, FAR, FAR])
    expect(shown(d)).toEqual([])
    run(d, MOB_DIRECTOR_DEFAULTS.resumeDelay, [1, FAR, FAR])
    expect(shown(d)).toEqual(['a2'])
  })
  it('silence：F で話した相手はしばらく吹き出しを出さない', () => {
    const d = director()
    d.update(0.05, [1, FAR, FAR], REACH, false)
    d.silence(0, 20)
    expect(shown(d)).toEqual([])
    run(d, 15, [1, FAR, FAR])
    expect(shown(d)).toEqual([])
    run(d, 6, [1, FAR, FAR])
    expect(shown(d)).toHaveLength(1)
  })
  it('ループした朝（場面が変わる）は、最初の朝と同じ 1 行目から同じ順で言う', () => {
    const d = director()
    d.update(0.05, [FAR, FAR, 1], REACH, false)
    run(d, 20, [FAR, FAR, 1])
    expect(d.peek(2)).toBe(3)
    const first: string[] = []
    const record = (dd: MobTalkDirector, out: string[]) => {
      for (let t = 0; t < 40; t += 0.05) {
        dd.update(0.05, [FAR, FAR, 1], REACH, false)
        const s = shown(dd)[0]
        if (s && out[out.length - 1] !== s) out.push(s)
      }
    }
    const d1 = director()
    record(d1, first)
    d.setLines('loop_morning', bubbleLinesFor(TABLE, IDS, 'loop_morning'))
    expect(d.peek(2)).toBe(0)
    run(d, 2, [FAR, FAR, FAR])
    const again: string[] = []
    record(d, again)
    expect(again).toEqual(first)
    expect(again).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('2086年の場面（mobPhase2086）', () => {
  it('時間帯と周回数だけで決まる', () => {
    expect(mobPhase2086({ night: false, loopCount: 0 })).toBe('morning')
    expect(mobPhase2086({ night: false, loopCount: 1 })).toBe('loop_morning')
    expect(mobPhase2086({ night: false, loopCount: 3 })).toBe('loop_morning2')
    expect(mobPhase2086({ night: true, loopCount: 0 })).toBe('night')
    expect(mobPhase2086({ night: true, loopCount: 2 })).toBe('night')
  })
  it('2026年はフラグ（水門を直したか）で決まる', () => {
    expect(mobPhase2026(() => false)).toBe('first')
    expect(mobPhase2026((n) => n === 'gate_repaired')).toBe('back')
  })
})

describe('話す人の選び方（pickCrowdSpeakers）', () => {
  const spot = (x: number, z: number, role: string, child = false) => ({ pos: { x, z }, role, child })
  it('役が合う、いちばん近い、まだ選ばれていない人。子ども指定は子どもだけ', () => {
    const spots = [spot(0, 0, 'booth'), spot(0.5, 0, 'booth'), spot(0.2, 0, 'plaza'), spot(1, 0, 'plaza', true)]
    const r = pickCrowdSpeakers(spots, [
      { id: 'x', role: 'booth', near: [0.4, 0] },
      { id: 'y', role: 'booth', near: [0.4, 0] },
      { id: 'k', role: 'plaza', near: [0, 0], child: true },
      { id: 'p', role: 'plaza', near: [1, 0], child: false },
    ])
    expect(r.map((e) => [e.slot.id, e.index])).toEqual([
      ['x', 1],
      ['y', 0],
      ['k', 3],
      ['p', 2],
    ])
  })
  it('遠すぎる・合う人がいない枠は無し', () => {
    const r = pickCrowdSpeakers([spot(10, 10, 'booth')], [{ id: 'x', role: 'booth', near: [0, 0] }, { id: 'y', role: 'stage', near: [10, 10] }])
    expect(r).toEqual([])
  })
})

// ------------------------------------------------------------------ 台詞の表

const NEXMAX = 'ネクマックス'
const allBubbles = (t: MobTable) => Object.values(t.speakers).flatMap((s) => Object.values(s.bubble).flatMap((l) => l ?? []))
const allTalks = (t: MobTable) => Object.values(t.speakers).flatMap((s) => Object.values(s.talk ?? {}).flatMap((l) => l ?? []))

describe.each([
  ['2086', MOB_TABLE_2086],
  ['2026', MOB_TABLE_2026],
])('%s年の台詞の表', (_era, table) => {
  it('吹き出しは 40 字まで、会話の 1 行は 44 字まで、空の行は無い', () => {
    for (const l of allBubbles(table)) {
      expect(l.trim().length, l).toBeGreaterThan(0)
      expect([...l].length, l).toBeLessThanOrEqual(40)
    }
    for (const l of allTalks(table)) {
      expect(l.text.trim().length, l.text).toBeGreaterThan(0)
      expect([...l.text].length, l.text).toBeLessThanOrEqual(44)
    }
  })
  it('だれも「オルム」という名前を知らない', () => {
    for (const l of [...allBubbles(table), ...allTalks(table).map((x) => x.text)]) expect(l).not.toContain('オルム')
  })
  it('F の会話の話者名：町の人の行は表の name か連れ、ほかはネクマックス', () => {
    for (const s of Object.values(table.speakers)) for (const l of Object.values(s.talk ?? {}).flatMap((x) => x ?? [])) expect(l.speaker.length).toBeGreaterThan(0)
  })
})

describe('2086年：ループの朝は同じ台詞（ネクマックス以外は覚えていない）', () => {
  const t = MOB_TABLE_2086
  it('吹き出しの loop_morning は書かない（＝morning を一字一句繰り返す）か、書くなら morning と同じ', () => {
    for (const [id, s] of Object.entries(t.speakers)) {
      const lm = s.bubble.loop_morning
      if (lm) expect(lm, id).toEqual(s.bubble.morning)
      expect(resolvePhase(s.bubble, 'loop_morning', t.repeatOf), id).toEqual(s.bubble.morning ?? [])
    }
  })
  it('2 回目以降のループで既視感を足す人も、最初は morning と同じ台詞を同じ順で言う', () => {
    for (const [id, s] of Object.entries(t.speakers)) {
      const l2 = s.bubble.loop_morning2
      if (!l2) continue
      const m = s.bubble.morning ?? []
      expect(l2.slice(0, m.length), id).toEqual(m)
      expect(l2.length, id).toBe(m.length + 1)
    }
  })
  it('ループの朝の会話：町の人の最初の一言は morning と一字一句同じ（変わるのはネクマックスの返事から）', () => {
    for (const [id, s] of Object.entries(t.speakers)) {
      const lm = s.talk?.loop_morning
      if (!lm) continue
      const m = s.talk?.morning ?? []
      expect(lm[0], id).toEqual(m[0])
      expect(lm[0].speaker, id).not.toBe(NEXMAX)
      expect(lm.some((l) => l.speaker === NEXMAX), id).toBe(true)
    }
  })
  it('話す人の枠と量産型には、それぞれ朝の吹き出しがある。夜の台詞は夜も残る人（回廊の上・量産型）だけ', () => {
    const night = new Set([...MOB_SLOTS_2086.filter((s) => s.shout).map((s) => s.id), ...UNIT_SPECS.map((u) => u.id)])
    for (const s of MOB_SLOTS_2086) expect(t.speakers[s.id]?.bubble.morning?.length, s.id).toBeGreaterThan(0)
    for (const u of UNIT_SPECS) expect(t.speakers[u.id]?.bubble.morning?.length, u.id).toBeGreaterThan(0)
    for (const [id, s] of Object.entries(t.speakers)) if (s.bubble.night || s.talk?.night) expect(night.has(id), id).toBe(true)
  })
  it('IDO 展示の前の人たちが、IDO（写真・動画・記録から作った昔の町の VR）とソラのことを話す', () => {
    const ido = ['ido_wow', 'ido_expo', 'ido_sora', 'queue_kid', 'queue_parent'].flatMap((id) => t.speakers[id].bubble.morning ?? [])
    const text = ido.join('')
    expect(text).toContain('江戸')
    expect(text).toContain('1970年')
    expect(text).toContain('ソラ')
    expect(text).toContain('2026年')
    expect(text).toContain('23歳')
  })
})

describe('2026年の通行人', () => {
  it('台詞のある通行人はそれぞれ最初の場面の吹き出しがある', () => {
    for (const m of MOB_WALKERS_2026) expect(MOB_TABLE_2026.speakers[m.id]?.bubble.first?.length, m.id).toBeGreaterThan(0)
    expect(new Set(MOB_WALKERS_2026.map((m) => m.walker)).size).toBe(MOB_WALKERS_2026.length)
  })
  it('水門を直して戻ったあとは、書いた人だけ台詞が変わり、ほかは同じ', () => {
    const s = MOB_TABLE_2026.speakers
    expect(resolvePhase(s.w_office.bubble, 'back', MOB_TABLE_2026.repeatOf)).toEqual(s.w_office.bubble.first)
    expect(resolvePhase(s.w_couple.bubble, 'back', MOB_TABLE_2026.repeatOf).join('')).toContain('絵図')
  })
})
