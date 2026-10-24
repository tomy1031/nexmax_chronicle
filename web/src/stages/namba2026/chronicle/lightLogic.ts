// 9 章の夜（物語 v7.2）：かんばんの「江戸の朝」の光で、大きな影と戦う。そのしくみ（純粋なロジック。tests/namba2026Light.test.ts）。
// ・空き地のあちこちに IDO のかんばん（3 本）。ネクマックスが K でたたく・J でスイッチを引くと、かんばんの前の地面に
//   「江戸の朝」の光の輪が広がる（rise 秒で広がりきって、lit 秒ともる → cool 秒でまた使える）
// ・影は光の中では弱って動けない。大きな影は、ともっている光の輪には入らない（ふちへ押し出される）。
//   だから、影がかんばんの前に来たときに光らせる（広がりきった瞬間に輪の中にいたら「つかまえた」）
// ・つかまえた大きな影は、光が消えるまで動けない。J（クロー）で引きたおすと PULL_DAMAGE。K もきく
// ・大きな影の攻撃：近いと前足の叩きつけ（戦闘の赤い扇）、遠いと「影の手」（足もとに赤い輪 → windup 秒で下から手がのびる）

export type XZ = { x: number; z: number }

export const LIGHT_TUNING = {
  /** 光の輪が広がりきるまで（秒） */
  rise: 0.55,
  /** ともっている秒 */
  lit: 5.0,
  /** 消えてから、また使えるまで（秒） */
  cool: 2.5,
  /** 光の輪の半径（m） */
  radius: 2.0,
  /** つかまえる判定のゆとり（影の体の分。m） */
  catchPad: 0.55,
} as const

/** 大きな影 */
export const BIG_SHADOW = {
  hp: 9,
  /** クローで引きたおしたときの重さ（3 回で終わる） */
  pullDamage: 3,
  /** 引きたおされて、起き上がるまで（秒） */
  downSec: 1.6,
  /** 影の手：足もとの赤い輪から手がのびるまで（秒。子どもの物差し 1.2 秒以上） */
  handWindup: 1.45,
  /** 影の手の当たる半径（m） */
  handRadius: 1.15,
  /** 影の手を出す間（秒）と、出す距離（これより遠いとき） */
  handEvery: 6.5,
  handMinDist: 4.2,
  /** 社長の「今や！」のくり返しの間（秒） */
  shoutEvery: 4.0,
} as const

export type PostState = 'ready' | 'rising' | 'lit' | 'cool'

/** かんばん 1 本の光（ready → rising → lit → cool → ready） */
export class LightPostLogic {
  state: PostState = 'ready'
  t = 0

  /** 光をつける（使えるときだけ）。つけたら true */
  trigger(): boolean {
    if (this.state !== 'ready') return false
    this.state = 'rising'
    this.t = 0
    return true
  }

  /** 進める。広がりきった瞬間は 'lit'、消えた瞬間は 'off'、また使えるようになった瞬間は 'ready' を返す */
  update(dt: number): 'lit' | 'off' | 'ready' | null {
    this.t += dt
    const T = LIGHT_TUNING
    switch (this.state) {
      case 'rising':
        if (this.t >= T.rise) {
          this.state = 'lit'
          this.t = 0
          return 'lit'
        }
        return null
      case 'lit':
        if (this.t >= T.lit) {
          this.state = 'cool'
          this.t = 0
          return 'off'
        }
        return null
      case 'cool':
        if (this.t >= T.cool) {
          this.state = 'ready'
          this.t = 0
          return 'ready'
        }
        return null
      default:
        return null
    }
  }

  /** 光の輪の大きさ（0〜1）：広がる → 1 → 消えるときは最後の 0.6 秒で小さく */
  get level(): number {
    const T = LIGHT_TUNING
    if (this.state === 'rising') return easeOut(Math.min(1, this.t / T.rise))
    if (this.state === 'lit') return Math.min(1, (T.lit - this.t) / 0.6)
    return 0
  }

  /** ともっている（影が入れない・つかまえていられる） */
  get on(): boolean {
    return this.state === 'lit'
  }

  /** 残りの秒（ともっている間） */
  get left(): number {
    return this.state === 'lit' ? Math.max(0, LIGHT_TUNING.lit - this.t) : 0
  }

  /** また使えるまでの割合（0〜1。かんばんのランプの表示） */
  get charge(): number {
    if (this.state === 'ready') return 1
    if (this.state === 'cool') return Math.min(1, this.t / LIGHT_TUNING.cool)
    return 0
  }

  reset(): void {
    this.state = 'ready'
    this.t = 0
  }
}

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k)
}

/** 輪の中か（体のゆとり pad をふくむ） */
export function inRing(center: XZ, p: XZ, radius: number = LIGHT_TUNING.radius, pad: number = LIGHT_TUNING.catchPad): boolean {
  return Math.hypot(p.x - center.x, p.z - center.z) <= radius + pad
}

/** ともっている輪の中にいたら、ふちの外（margin）へ押し出した位置。外にいれば null */
export function pushOutOfRing(center: XZ, p: XZ, radius: number = LIGHT_TUNING.radius, margin = 0.35): XZ | null {
  const dx = p.x - center.x
  const dz = p.z - center.z
  const d = Math.hypot(dx, dz)
  const R = radius + margin
  if (d >= R) return null
  if (d < 1e-4) return { x: center.x + R, z: center.z }
  return { x: center.x + (dx / d) * R, z: center.z + (dz / d) * R }
}

/**
 * 社長が「こっちのかんばんや！」と教えるかんばん：使えるかんばんのうち、光の輪の真ん中が大きな影にいちばん近い物。
 * 使えるかんばんが無ければ -1
 */
export function bestPost(centers: readonly XZ[], ready: readonly boolean[], shadow: XZ): number {
  let best = -1
  let bd = Infinity
  centers.forEach((c, i) => {
    if (!ready[i]) return
    const d = Math.hypot(c.x - shadow.x, c.z - shadow.z)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}
