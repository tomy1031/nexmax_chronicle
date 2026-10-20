// ほこらの防衛戦（物語 v7 の 9 章の夜）の考え方。純粋なロジック（テストする）。見た目は shrine.ts の setDamage(k)。
// ・ほこらの体力（HUD の上の横長のゲージ）。影が箱にとびかかる・屋根で暴れると減る。0 になったら失敗（ボスの前からやり直し）
// ・影は 3 方向（屋根・路地の口・トンネル路地）から、2 波。2 波しのぐと社長が「江戸の朝」を映す → 小さな影はにげる → 大きな影
// ・体力は欠けた見た目（k = 1 - 体力/最大）に直して setDamage へ。夜明けまで守れば勝ち（大きな影を引きたおす）

export type DefenseDir = 'north' | 'south' | 'roof'

/** 影がほこらにすること（体力をいくつ減らすか） */
export const SHRINE_HITS = {
  /** 箱にとびかかる（小さな影） */
  leap: 1,
  /** 屋根の上で暴れる（1 秒ごと） */
  roofTick: 1,
  /** 大きな影の叩きつけ */
  slam: 3,
} as const

export const SHRINE_HP = 20

export type WaveSpawn = { dir: DefenseDir; kind: 'mite' | 'shield'; count: number; delay: number }
export type DefenseWave = { id: string; spawns: readonly WaveSpawn[] }

/** 2 波の中身（delay は波が始まってからの秒） */
export const DEFENSE_WAVES: readonly DefenseWave[] = [
  {
    id: 'wave1',
    spawns: [
      { dir: 'north', kind: 'mite', count: 2, delay: 0 },
      { dir: 'roof', kind: 'mite', count: 1, delay: 3 },
      { dir: 'south', kind: 'mite', count: 2, delay: 6 },
      { dir: 'roof', kind: 'mite', count: 1, delay: 10 },
    ],
  },
  {
    id: 'wave2',
    spawns: [
      { dir: 'south', kind: 'mite', count: 2, delay: 0 },
      { dir: 'north', kind: 'shield', count: 1, delay: 2 },
      { dir: 'roof', kind: 'mite', count: 2, delay: 5 },
      { dir: 'north', kind: 'mite', count: 2, delay: 8 },
      { dir: 'roof', kind: 'mite', count: 1, delay: 12 },
    ],
  },
]

/** 波 1 本の影の数 */
export function waveCount(w: DefenseWave): number {
  return w.spawns.reduce((s, x) => s + x.count, 0)
}

/** いま出す影（t は波が始まってからの秒、done は出し終えた spawns の数）。出す物の添字を返す */
export function dueSpawns(w: DefenseWave, t: number, done: number): number[] {
  const out: number[] = []
  for (let i = done; i < w.spawns.length; i++) {
    if (w.spawns[i].delay <= t) out.push(i)
    else break
  }
  return out
}

/** 防衛戦の段階 */
export type DefenseStage = 'idle' | 'wave1' | 'wave2' | 'projection' | 'bigShadow' | 'won' | 'lost'

/** ほこらの体力 */
export class ShrineGuard {
  readonly max: number
  private hp: number
  constructor(max = SHRINE_HP) {
    this.max = max
    this.hp = max
  }

  get value(): number {
    return this.hp
  }

  /** 0〜1 の残り（HUD のゲージ） */
  get ratio(): number {
    return this.hp / this.max
  }

  /** 欠けた見た目（shrine.setDamage に渡す） */
  get damage(): number {
    return 1 - this.ratio
  }

  get broken(): boolean {
    return this.hp <= 0
  }

  /** 影にやられた。減ったあとの体力を返す */
  hit(n: number): number {
    if (n <= 0) return this.hp
    this.hp = Math.max(0, this.hp - n)
    return this.hp
  }

  /** ボスの前からやり直す（体力を戻す） */
  reset(hp = this.max): void {
    this.hp = Math.max(0, Math.min(this.max, hp))
  }
}

/** ゲージの色の段階（緑・黄・赤） */
export function guardLevel(ratio: number): 'ok' | 'warn' | 'danger' {
  return ratio > 0.6 ? 'ok' : ratio > 0.3 ? 'warn' : 'danger'
}

/**
 * 見た目の段階（shrine.ts の setDamage が使うしきい値と同じ）：爪あと → 戸が外れる → 屋根の銅板が落ちる → 丸窓が割れる
 */
export function damageStage(k: number): 0 | 1 | 2 | 3 | 4 {
  return k >= 0.85 ? 4 : k >= 0.65 ? 3 : k >= 0.45 ? 2 : k > 0.12 ? 1 : 0
}
