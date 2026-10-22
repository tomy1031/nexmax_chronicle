// よろいの影獣（物語 v7.1 の 6 章）の決まりごと。three.js に依存しない純粋なロジック（tests/namba2026Beast.test.ts）。
// 勝ち方は 4 つの手順で、いつも目標の欄に出す：
//   ① 突進をよけて、柱にぶつけよう（赤い帯の予告 → 横へよける → 柱にぶつかると気絶して、よろいの板が 1 枚ゆるむ）
//   ② ゆるんだ板を J で引きはがそう（ゆるんでいないと、がっちりはじかれる）
//   ③ 板を J で投げ返そう（当たると大ダメージ・大きくひるむ）
//   ④ よろいがなくなったら K でパンチ！（おこって速くなり、とびかかりの衝撃の輪を使う。輪はジャンプでよける）
// 子どもの物差し：予告から当たりまで 1.2 秒以上・当たりはハート 1 つ・ボット並みの正確さがなくても勝てる。

/** 数値（秒・m・m/s） */
export const BEAST_TUNING = {
  /** 体力（投げた板 3 枚で 6、のこり 8 はパンチ 2 回分ほど） */
  hp: 14,
  throwDamage: 2,
  /** 体の大きさ（欠け重の 1.35 倍）。当たりの半径 */
  scale: 1.35,
  bodyR: 1.0,
  /** 歩いて近づく速さ（よろいがある／おこった） */
  stalkSpeed: [1.7, 2.5] as const,
  /** 近づく時間（このあと突進・とびかかり） */
  stalkSec: [2.2, 1.3] as const,
  /** ひっかき：この近さで構える。構え（溜め）・届く距離（scale 前）・扇・吹っ飛ばし */
  scratch: { near: 3.3, windup: 1.3, hitRange: 2.35, hitArc: 1.15, knock: 7, cooldown: 2.0 },
  /** 突進：前足で地面をかく予告の長さ、帯が止まる（向きが決まる）のは走り出す何秒前か、速さ、最長、吹っ飛ばし */
  charge: { paw: [1.6, 1.35] as const, lockBefore: [0.8, 0.65] as const, speed: [12, 13] as const, accel: 0.25, maxLen: 18, knock: 9, minRun: 1.6 },
  /** 柱にぶつかった：気絶の秒・板がゆるむ秒 */
  crash: { stun: 3.6, loose: 4.2 },
  /** 柱以外（壁・行き止まり）で止まった・走りきった：ふり返るまで */
  miss: { bonk: 1.1, skid: 0.9 },
  /** とびかかり：構え・ねらいが決まるのは跳ぶ何秒前か・空中・衝撃の輪の速さと大きさ・高さ・吹っ飛ばし */
  pounce: { windup: 1.35, lockBefore: 0.55, air: 0.75, ringSpeed: 4.2, ringMax: 5.5, ringBand: 0.4, ringHeight: 0.22, landR: 1.7, knock: 7 },
  /** よろいがなくなっておこる（ほえる）秒 */
  roar: 1.4,
  /** 佐伯さんをつかむ：おこってから何秒後か（または体力がこの数以下）・はなすまで */
  grab: { after: 7, hpAtMost: 4, hold: 12 },
  /** 照準の吸い付きの倍率（正面へきちんと向けないと選ばれない）と、ねらう点の高さ（腰。ふつうのカメラの高さで合う） */
  aimCone: 0.5,
  aimY: 1.0,
  /** 柱以外で 2 回はずれたら、ヒント */
  hintAfterMisses: 2,
}

export type PillarDisc = { x: number; z: number; r: number }

/**
 * 突進の道すじ（from から単位ベクトル d の向きへ len）で、最初にぶつかる柱。bodyR は獣の当たりの半径。
 * 柱の中心までの横のずれが（柱の太さ＋bodyR）より小さければ当たり。戻り値の d は、ぶつかるまでに進む距離
 */
export function firstPillarOnPath(fx: number, fz: number, dx: number, dz: number, len: number, pillars: readonly PillarDisc[], bodyR: number): { i: number; d: number } | null {
  let best: { i: number; d: number } | null = null
  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i]
    const rx = p.x - fx
    const rz = p.z - fz
    const along = rx * dx + rz * dz
    if (along < 0) continue
    const lat = Math.abs(rx * dz - rz * dx)
    const R = p.r + bodyR
    if (lat >= R) continue
    const d = Math.max(0, along - Math.sqrt(R * R - lat * lat))
    if (d > len) continue
    if (!best || d < best.d) best = { i, d }
  }
  return best
}

/** 突進が、その位置のプレイヤーに当たるか（獣の前の体の幅の中）。along は獣の前への距離、lat は横のずれ */
export function chargeHits(along: number, lat: number, bodyR: number, playerR = 0.35): boolean {
  return along > -0.3 && along < bodyR + 0.55 && Math.abs(lat) < bodyR * 0.85 + playerR
}

/** とびかかりの衝撃の輪が、いまの半径 r のとき、中心から dist にいるプレイヤーに当たるか（跳んでいれば当たらない） */
export function ringHits(r: number, dist: number, airborne: number, t = BEAST_TUNING.pounce): boolean {
  return Math.abs(dist - r) < t.ringBand && airborne < t.ringHeight
}

/** 予告の向きが決まったか（帯がプレイヤーを追うのをやめる） */
export function telegraphLocked(t: number, dur: number, lockBefore: number): boolean {
  return t >= dur - lockBefore
}

export type BeastMove = 'scratch' | 'charge' | 'pounce'

/**
 * 近づいたあとの次の動き。よろいがある間は突進が中心（柱にぶつけるのが勝ち方）。近すぎれば、ひっかく。
 * おこったら、とびかかりと突進をかわりばんこ（ひっかいたあとは、かならず大きな動き。lastBig は前の大きな動き）
 */
export function nextMove(o: { armored: boolean; dist: number; scratchReady: boolean; last: BeastMove | null; lastBig?: BeastMove | null }): BeastMove {
  const afterScratch = !o.armored && o.last === 'scratch'
  if (o.scratchReady && !afterScratch && o.dist < BEAST_TUNING.scratch.near) return 'scratch'
  if (o.armored) return 'charge'
  return (o.lastBig ?? o.last) === 'pounce' ? 'charge' : 'pounce'
}

/** いまの手順（目標の欄・ヒント） */
export type BeastStep = 'charge' | 'strip' | 'throw' | 'punch' | 'rescue'

export function beastStep(s: { plates: number; loose: boolean; holding: boolean; grabbed: boolean }): BeastStep {
  if (s.grabbed) return 'rescue'
  if (s.holding) return 'throw'
  if (s.plates <= 0) return 'punch'
  if (s.loose) return 'strip'
  return 'charge'
}

/** 目標の欄（子どもにわかる一言と、そのやり方） */
export function beastObjective(step: BeastStep, plates: number, misses = 0): { title: string; sub: string } {
  const left = `よろい あと ${plates} 枚`
  switch (step) {
    case 'charge':
      return misses >= BEAST_TUNING.hintAfterMisses
        ? { title: '① 突進をよけて、柱にぶつけよう', sub: `柱の前で待って、赤い帯が光ったら横へ（Shift）！（${left}）` }
        : { title: '① 突進をよけて、柱にぶつけよう', sub: `赤い帯が光ったら、横へよける（Shift でダッシュ）（${left}）` }
    case 'strip':
      return { title: '② ゆるんだ板を J で引きはがそう', sub: `光ってガタガタしている板。獣の正面を向いて J（${left}）` }
    case 'throw':
      return { title: '③ 板を J で投げ返そう', sub: '獣の方を向いて J。当たると大ダメージ！' }
    case 'punch':
      return { title: '④ K でパンチ！', sub: 'よろいがなくなった！ 3 回目のパンチが強い。紫の輪はジャンプ（Space）でよける' }
    case 'rescue':
      return { title: '佐伯さんを助けよう', sub: '佐伯さんをつかんだ影の腕に、J' }
  }
}

/** 体力のゲージの名前（よろいの残りを ■ で）。0 枚なら名前だけ */
export function beastBossName(plates: number, total = 3): string {
  if (plates <= 0) return 'よろいの影獣'
  return 'よろいの影獣　よろい ' + '■'.repeat(plates) + '□'.repeat(Math.max(0, total - plates))
}
