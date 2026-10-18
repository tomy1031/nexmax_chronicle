// 1970年 万博の進み方（src/stages/expo1970/story1970.ts）：フラグからの段階・目標、錨をほどく合図、番人の増援。
import { describe, expect, it } from 'vitest'
import { EXPO_PARTS, UNRAVEL, UnravelLogic, bossWaves, expoObjective, expoSpawn, expoStep, michiSpot, partsCount, shardCount } from '../src/stages/expo1970/story1970'
import { STORY_BOOL_FLAGS } from '../src/core/storyFlags'

const flags = (...on: string[]) => (n: string) => on.includes(n)

describe('1970年の段階', () => {
  it('フラグの順に進む（部品は 3 つそろうまで parts）', () => {
    expect(expoStep(flags())).toBe('arrive')
    expect(expoStep(flags('expo_arrived'))).toBe('first_fight')
    expect(expoStep(flags('expo_arrived', 'expo_first_fight'))).toBe('meet_michi')
    expect(expoStep(flags('met_michi'))).toBe('to_bench')
    expect(expoStep(flags('met_michi', 'expo_bench', 'expo_part_bamboo'))).toBe('parts')
    expect(expoStep(flags('expo_bench', 'expo_part_bamboo', 'expo_part_ropeway', 'expo_part_swarm'))).toBe('assemble')
    expect(expoStep(flags('impact_claw_got'))).toBe('tower')
    expect(expoStep(flags('impact_claw_got', 'expo_boss_down'))).toBe('unravel')
    expect(expoStep(flags('expo_anchor_cleared'))).toBe('farewell')
    expect(expoStep(flags('expo_anchor_cleared', 'expo_farewell'))).toBe('done')
  })

  it('ミチの居場所と、再開の到着地点', () => {
    expect(michiSpot('first_fight')).toBe('hidden')
    expect(michiSpot('parts')).toBe('bench')
    expect(michiSpot('unravel')).toBe('tower')
    expect(expoSpawn('parts')).toBe('workbench')
    expect(expoSpawn('done')).toBe('return')
  })

  it('部品の目標は、残りの場所を出す', () => {
    const f = flags('expo_bench', 'expo_part_swarm')
    expect(partsCount(f)).toBe(1)
    const o = expoObjective('parts', f)
    expect(o.title).toContain('1/3')
    expect(o.sub).toContain('放電コイル')
    expect(o.sub).not.toContain('試作の爪')
  })

  it('塔：壁を割る前・登る・番人', () => {
    expect(expoObjective('tower', flags()).title).toContain('ひび割れた壁')
    expect(expoObjective('tower', flags('expo_wall_broken')).title).toContain('登ろう')
    expect(expoObjective('tower', flags('expo_wall_broken'), { onDeck: true, bossAlive: true }).title).toContain('番人')
  })

  it('使うフラグはすべて StoryState に登録してある', () => {
    const used = ['expo_arrived', 'expo_first_fight', 'met_michi', 'expo_bench', 'impact_claw_got', 'expo_wall_broken', 'expo_boss_down', 'expo_anchor_cleared', 'expo_farewell', 'expo_child_saved', 'expo_hat_returned', 'compass_built', 'expo_reported', ...EXPO_PARTS.map((p) => p.flag)]
    for (const f of used) expect(STORY_BOOL_FLAGS as readonly string[], f).toContain(f)
    expect(shardCount(flags('expo_shard_capsule', 'expo_shard_tower'))).toBe(2)
  })
})

describe('錨をほどく', () => {
  const run = (u: UnravelLogic, sec: number) => {
    const out: Array<string | null> = []
    for (let t = 0; t < sec; t += 0.05) out.push(u.tick(0.05))
    return out
  }

  it('待ってのあいだに離すと早すぎ、今！ で離すと成功', () => {
    const u = new UnravelLogic()
    u.grab()
    expect(u.signal).toBe('wait')
    run(u, 0.5)
    expect(u.release()).toBe('early')
    expect(u.done).toBe(0)
    u.grab()
    const ev = run(u, UNRAVEL.waits[0] + 0.1)
    expect(ev).toContain('go')
    expect(u.signal).toBe('go')
    expect(u.release()).toBe('success')
    expect(u.done).toBe(1)
  })

  it('今！ を逃すと、また待ってに戻る。3 回成功でほどける', () => {
    const u = new UnravelLogic()
    u.grab()
    const ev = run(u, UNRAVEL.waits[0] + UNRAVEL.goSec + 0.2)
    expect(ev).toContain('missed')
    expect(u.signal).toBe('wait')
    for (let i = 0; i < UNRAVEL.need; i++) {
      u.grab()
      while (u.signal !== 'go') u.tick(0.05)
      expect(u.release()).toBe('success')
    }
    expect(u.finished).toBe(true)
    expect(u.progress).toBe(1)
    u.grab()
    expect(u.holding).toBe(false)
  })
})

describe('錨の番人', () => {
  it('体力 2/3・1/3 を切ると欠け虫を呼ぶ', () => {
    expect(bossWaves(24, 24)).toBe(0)
    expect(bossWaves(16, 24)).toBe(1)
    expect(bossWaves(8, 24)).toBe(2)
    expect(bossWaves(0, 24)).toBe(2)
  })
})
