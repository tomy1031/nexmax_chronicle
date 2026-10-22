// 戦闘の純粋なロジック（src/combat/combatLogic.ts）：体力・連続攻撃・回避・当たり判定・敵の行動。
import { describe, expect, it } from 'vitest'
import { ATTACK_STEPS, AttackCombo, COMBAT_TUNING, Dodge, ENEMY_STATS, EnemyBrain, PlayerHealth, angleTo, inArc, type ComboEvent } from '../src/combat/combatLogic'

const run = (c: AttackCombo, seconds: number, dt = 1 / 60) => {
  const ev: ComboEvent[] = []
  for (let t = 0; t < seconds; t += dt) ev.push(...c.tick(dt))
  return ev
}

describe('体力', () => {
  it('当たると減り、無敵の間は減らない。0 で倒れる', () => {
    const h = new PlayerHealth(3)
    expect(h.damage(1)).toBe('hit')
    expect(h.damage(1)).toBe('ignored')
    h.tick(COMBAT_TUNING.invulnSec + 0.01)
    expect(h.damage(5)).toBe('dead')
    expect(h.hp).toBe(0)
    h.heal(2)
    expect(h.hp).toBe(0)
    h.refill()
    expect(h.hp).toBe(3)
  })
})

describe('連続攻撃', () => {
  it('K 1 回で 1 段だけ振って終わる', () => {
    const c = new AttackCombo()
    expect(c.press()).toEqual([{ kind: 'swing', step: 0 }])
    const ev = run(c, 1)
    expect(ev.filter((e) => e.kind === 'hit')).toEqual([{ kind: 'hit', step: 0 }])
    expect(ev[ev.length - 1]).toEqual({ kind: 'end' })
    expect(c.busy).toBe(false)
  })

  it('振っている間に押すと次の段へつながり、3 段で止まる', () => {
    const c = new AttackCombo()
    c.press()
    const ev: ComboEvent[] = []
    for (let i = 0; i < 120; i++) {
      // 3 段目が始まるころまで押し続ける（その後は押さない）
      if (i % 6 === 0 && i < 36) c.press()
      ev.push(...c.tick(1 / 60))
    }
    expect(ev.filter((e) => e.kind === 'hit').map((e) => (e as { step: number }).step)).toEqual([0, 1, 2])
    expect(c.busy).toBe(false)
  })

  it('踏み込みは当たりの間だけ', () => {
    const c = new AttackCombo()
    c.press()
    expect(c.lunge).toBe(0)
    run(c, ATTACK_STEPS[0].windup + 0.01)
    expect(c.lunge).toBe(ATTACK_STEPS[0].lunge)
  })
})

describe('回避', () => {
  it('入力の向きへ短く滑り、始めは当たらない。続けては出せない', () => {
    const d = new Dodge()
    expect(d.press(0, -2, 0)).toBe(true)
    expect([d.dirX, d.dirZ]).toEqual([0, -1])
    expect(d.invulnerable).toBe(true)
    expect(d.press(1, 0, 0)).toBe(false)
    d.tick(COMBAT_TUNING.dodge.sec)
    expect(d.active).toBe(false)
    expect(d.press(1, 0, 0)).toBe(false)
    d.tick(COMBAT_TUNING.dodge.cooldown)
    expect(d.press(1, 0, 0)).toBe(true)
  })

  it('入力が無ければ後ろへ下がる', () => {
    const d = new Dodge()
    d.press(0, 0, 0)
    // facing 0 の前は -Z。後ろは +Z
    expect(d.dirZ).toBeCloseTo(1)
  })
})

describe('当たり判定', () => {
  it('前の扇の中だけ当たる（相手の大きさの分ゆるめる）', () => {
    // facing 0 の前は -Z
    expect(inArc(0, 0, 0, 0, -1.5, 1.75, 1)).toBe(true)
    expect(inArc(0, 0, 0, 0, 1.5, 1.75, 1)).toBe(false)
    expect(inArc(0, 0, 0, 0, -2.2, 1.75, 1)).toBe(false)
    expect(inArc(0, 0, 0, 0, -2.2, 1.75, 1, 0.5)).toBe(true)
    expect(inArc(0, 0, 0, 1.5, -0.2, 1.75, 1)).toBe(false)
    expect(angleTo(0, 0, -1)).toBeCloseTo(0)
    expect(Math.abs(angleTo(0, 0, 1))).toBeCloseTo(Math.PI)
  })
})

describe('敵の行動', () => {
  const step = (b: EnemyBrain, dist: number, seconds: number, dt = 1 / 30) => {
    const out = []
    for (let t = 0; t < seconds; t += dt) out.push(b.update(dt, { dist, leashed: true, passive: false }))
    return out
  }

  it('気づいたら追いかけ、近づいたら溜めてから攻撃する', () => {
    const b = new EnemyBrain('shield')
    step(b, 20, 0.5)
    expect(b.state).toBe('idle')
    const o = step(b, 8, 0.2)
    expect(b.state).toBe('chase')
    expect(o[o.length - 1].move).toBe('toward')
    const a = step(b, 1.5, 2)
    expect(a.filter((x) => x.strike).length).toBe(1)
  })

  it('盾は正面の攻撃を防ぐ。はがすか後ろからなら当たる', () => {
    const b = new EnemyBrain('shield')
    expect(b.hurt(1, 0.3, true)).toBe('blocked')
    expect(b.hp).toBe(ENEMY_STATS.shield.hp)
    expect(b.hurt(1, 0.3, false)).toBe('hurt')
    b.dropShield()
    expect(b.state).toBe('stunned')
    expect(b.hurt(1, 0.3, true)).toBe('hurt')
  })

  it('はじくの衝撃は盾ごと吹き飛ばす', () => {
    const b = new EnemyBrain('shield')
    expect(b.hurt(1, 0.5, true, true)).toBe('hurt')
    expect(b.shield).toBe(false)
  })

  it('気絶の間は攻撃しない。体力が 0 で倒れる', () => {
    const b = new EnemyBrain('mite')
    b.stun(1)
    const o = step(b, 1, 0.9)
    expect(o.some((x) => x.strike)).toBe(false)
    expect(b.hurt(5, 0.3, true)).toBe('killed')
    expect(b.alive).toBe(false)
  })

  it('装甲ははじくでしか割れず、割れるとしばらく無防備。時間がたつと戻る', () => {
    const b = new EnemyBrain('brute')
    b.setArmored(true)
    expect(b.hurt(2, 0.3, false)).toBe('blocked')
    expect(b.hp).toBe(ENEMY_STATS.brute.hp)
    expect(b.hurt(2, 1, true, true)).toBe('hurt')
    expect(b.armor).toBe(false)
    expect(b.hp).toBe(ENEMY_STATS.brute.hp - 1)
    expect(b.state).toBe('stunned')
    expect(b.hurt(2, 0.3, true)).toBe('hurt')
    step(b, 1.5, COMBAT_TUNING.armorDownSec + 0.1)
    expect(b.armor).toBe(true)
    expect(b.hurt(2, 0.3, false)).toBe('blocked')
  })

  it('住みかから離れすぎたら戻る', () => {
    const b = new EnemyBrain('mite')
    step(b, 5, 0.2)
    expect(b.state).toBe('chase')
    const o = b.update(1 / 30, { dist: 5, leashed: false, passive: false })
    expect(b.state).toBe('idle')
    expect(o.move).toBe('home')
  })
})

describe('子ども向けの敵の数値', () => {
  it('どの敵も、構え（溜め）が見えてから当たるまで 1.2 秒以上・当たりはハート 1 つ', () => {
    for (const s of Object.values(ENEMY_STATS)) {
      expect(s.windup, s.name).toBeGreaterThanOrEqual(1.2)
      expect(s.damage, s.name).toBe(1)
    }
  })
  it('敵ごとの数値の上書き（共有の ENEMY_STATS は変えない）', () => {
    const b = new EnemyBrain('brute', 1, { windup: 1.6, hp: 20 })
    expect(b.stats.windup).toBe(1.6)
    expect(b.hp).toBe(20)
    expect(ENEMY_STATS.brute.windup).toBeLessThan(1.6)
  })
})

describe('投げた板（よろいの影獣）', () => {
  it('装甲があっても通り、しばらく動けなくなる', () => {
    const b = new EnemyBrain('brute', 1)
    b.setArmored(true)
    const hp = b.hp
    expect(b.hurt(1, 0.3, true)).toBe('blocked')
    expect(b.hurtThrough(2, 2.4)).toBe('hurt')
    expect(b.hp).toBe(hp - 2)
    expect(b.state).toBe('stunned')
    expect(b.armor).toBe(true)
  })

  it('体力が尽きれば倒れる', () => {
    const b = new EnemyBrain('mite', 1)
    expect(b.hurtThrough(99, 1)).toBe('killed')
    expect(b.alive).toBe(false)
  })
})
