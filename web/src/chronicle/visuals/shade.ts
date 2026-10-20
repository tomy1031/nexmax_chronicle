// トワのランプからこぼれる影（物語 6・7・9・10・11 章）の、戦闘の敵の色と飾り。
// combat/ には手を入れず、既存の敵の見た目（combat/enemyModels.ts の EnemyStyle）に渡す色だけを作る。
// 形で足りない「けむりのようなすそ」は ShadeWisps（敵の位置に毎フレーム合わせて、足もとから黒いけむり・紫の粒を出す）。
//   rt.combat.spawn('shield', pos, { style: SHADE_STYLE })
//   const wisps = new ShadeWisps(root); 毎フレーム wisps.sync(rt.combat.alive('shade')); wisps.update(dt)
//   倒したとき（onEnemyDefeated）に wisps.poof(e.pos, e.model.baseScale)
import * as THREE from 'three'
import type { EnemyStyle } from '../../combat/enemyModels'
import { Particles } from './particles'
import { disposeRoot } from './common'

/** 小さな影（トワのランプからこぼれる影）：黒〜紫の体、うすい藤色に光る目 */
export const SHADE_STYLE: EnemyStyle = { panel: '#1c1028', trim: '#a05cff', eye: '#f2d8ff', body: '#0c0812' }

/** 大きな影（9 章のボス・寺の階段の影）：少し赤みの紫、金色に光る目 */
export const BIG_SHADE_STYLE: EnemyStyle = { panel: '#2a1236', trim: '#d04cff', eye: '#ffc95a', body: '#0a060f' }

/** 鉄の板をよろいにした影（6 章：よろいの影獣）：板は鉄の灰色 */
export const ARMORED_SHADE_STYLE: EnemyStyle = { panel: '#6a6e7a', trim: '#a05cff', eye: '#f2d8ff', body: '#0c0812' }

/** からくりにのりうつった影（7 章：時の鐘人形のまわりの手下）：板は古い木の色 */
export const KARAKURI_SHADE_STYLE: EnemyStyle = { panel: '#6a4a2a', trim: '#b060ff', eye: '#f2d8ff', body: '#0c0812' }

/** 影のけむりの色（ほかの演出でも使える） */
export const SHADE_SMOKE = '#160b22'
export const SHADE_GLOW = '#a05cff'

/** sync に渡せる形（combat の EnemyHandle をそのまま渡せる） */
export type WispTarget = { readonly id: string; readonly pos: THREE.Vector3; readonly alive?: boolean; readonly kind?: string; readonly model?: { baseScale: number; root?: THREE.Object3D } }

type Wisp = { pos: THREE.Vector3; scale: number; acc: number; seen: boolean; ref: THREE.Vector3 | null }

/** 影の敵の足もとのけむり（すそ）と紫の粒。すべての敵で描画 2 回 */
export class ShadeWisps {
  readonly root = new THREE.Group()
  private readonly smoke: Particles
  private readonly glow: Particles
  private readonly list = new Map<string, Wisp>()
  private readonly tmp = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  /** けむりの量（1 = ふつう。スマホで減らすなら 0.5） */
  density = 1

  constructor(parent: THREE.Object3D, o: { max?: number } = {}) {
    this.root.name = 'shadeWisps'
    parent.add(this.root)
    this.smoke = new Particles({ max: o.max ?? 600, shape: 'smoke', additive: false, renderOrder: 3 })
    this.glow = new Particles({ max: Math.round((o.max ?? 600) * 0.6), shape: 'soft', additive: true, renderOrder: 4 })
    this.root.add(this.smoke.points, this.glow.points)
  }

  /** 1 体を追う（pos は毎フレーム読む）。scale：体の大きさ（欠け虫 0.6・欠け盾 1・欠け重 1.6 くらい） */
  track(id: string, pos: THREE.Vector3, scale = 1): void {
    const w = this.list.get(id)
    if (w) {
      w.ref = pos
      w.scale = scale
      return
    }
    this.list.set(id, { pos: pos.clone(), scale, acc: Math.random(), seen: true, ref: pos })
  }

  untrack(id: string): void {
    this.list.delete(id)
  }

  /** 敵の一覧に合わせる（いないものは外す）。combat.alive(tag) をそのまま渡せる */
  sync(targets: readonly WispTarget[]): void {
    for (const w of this.list.values()) w.seen = false
    for (const t of targets) {
      if (t.alive === false) continue
      const base = t.model?.baseScale ?? 1
      const k = t.kind === 'mite' ? 0.6 : t.kind === 'brute' ? 1.5 : 1
      this.track(t.id, t.pos, base * k)
      const w = this.list.get(t.id)
      if (w) w.seen = true
    }
    for (const [id, w] of this.list) if (!w.seen) this.list.delete(id)
  }

  /** 影が消える（倒したとき・裂かれたとき）：黒いけむりと紫の粒がはじける */
  poof(at: THREE.Vector3, scale = 1): void {
    this.tmp.copy(at).y += 0.6 * scale
    this.smoke.burst(Math.round(22 * scale), this.tmp, 2.4 * scale, { life: 1.1, size: 0.35 * scale, grow: 2.4, color: SHADE_SMOKE, alpha: 0.75, drag: 2, gravity: -0.6 }, 0.6, 0.4 * scale)
    this.glow.burst(Math.round(24 * scale), this.tmp, 3 * scale, { life: 0.8, size: 0.08 * scale, color: new THREE.Color(SHADE_GLOW).multiplyScalar(2), drag: 2.5, gravity: -0.4 })
  }

  update(dt: number): void {
    if (dt > 0) {
      for (const w of this.list.values()) {
        if (w.ref) w.pos.copy(w.ref)
        const s = w.scale
        w.acc += dt * 26 * s * this.density
        while (w.acc >= 1) {
          w.acc -= 1
          // すそ：足もとのまわりから、外へ広がって少し上がる黒いけむり
          const a = Math.random() * Math.PI * 2
          const r = (0.25 + Math.random() * 0.25) * s
          this.tmp.set(w.pos.x + Math.cos(a) * r, w.pos.y + 0.08 + Math.random() * 0.25 * s, w.pos.z + Math.sin(a) * r)
          this.v.set(Math.cos(a) * 0.5 * s, 0.2 + Math.random() * 0.4, Math.sin(a) * 0.5 * s)
          this.smoke.emit(this.tmp, this.v, { life: 0.9 + Math.random() * 0.6, size: (0.18 + Math.random() * 0.12) * s, grow: 2.2, color: Math.random() < 0.3 ? '#2a1440' : SHADE_SMOKE, alpha: 0.6, drag: 1.6, gravity: -0.3, fadeIn: 0.2 })
          // 体からたちのぼる、うすい紫のもや（夜でも見える）
          if (Math.random() < 0.45) {
            this.tmp.set(w.pos.x + (Math.random() - 0.5) * 0.5 * s, w.pos.y + (0.3 + Math.random() * 1.0) * s, w.pos.z + (Math.random() - 0.5) * 0.5 * s)
            this.v.set((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2)
            this.glow.emit(this.tmp, this.v, { life: 1.1, size: 0.22 * s, grow: 2, color: '#6a30a0', alpha: 0.22, drag: 1, gravity: -0.2 })
          }
          if (Math.random() < 0.18) this.glow.emit(this.tmp, this.v, { life: 0.8, size: 0.05 * s, color: new THREE.Color(SHADE_GLOW).multiplyScalar(2), drag: 1.5, gravity: -0.4 })
        }
      }
    }
    this.smoke.update(dt)
    this.glow.update(dt)
  }

  get count(): number {
    return this.list.size
  }

  dispose(): void {
    this.list.clear()
    this.smoke.dispose()
    this.glow.dispose()
    disposeRoot(this.root)
  }
}
