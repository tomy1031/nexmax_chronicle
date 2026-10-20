// 人物を道に沿って歩かせる（何人でも同時に）。1726 年のステージの walkTo / updateWalkers を共通にしたもの。
// モデルは -Z が正面（yaw = atan2(-dx, -dz)）。歩いている間は update(dt, speed) に速さを渡すと歩きの揺れが出る。
import * as THREE from 'three'

export type WalkerBody = { root: THREE.Object3D }

type Walk = { ch: WalkerBody; path: THREE.Vector3[]; i: number; speed: number; face: THREE.Vector3 | null; done: () => void }

/** 向き（ヨー）：p から to を見る */
export function faceYaw(p: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(-(to.x - p.x), -(to.z - p.z))
}

export class Walker {
  private readonly walks: Walk[] = []
  private readonly tmp = new THREE.Vector3()

  /** 道に沿って歩かせる（着いたら face の方を向いて resolve）。歩いている人をまた歩かせると、前の歩きは終わったことにする */
  walkTo(ch: WalkerBody, path: readonly THREE.Vector3[], speed = 1.6, face: THREE.Vector3 | null = null): Promise<void> {
    this.stop(ch)
    return new Promise((done) => {
      this.walks.push({ ch, path: [ch.root.position.clone(), ...path.map((p) => p.clone())], i: 1, speed, face: face ? face.clone() : null, done })
    })
  }

  /** 歩いているのをやめる（その場で止まる） */
  stop(ch: WalkerBody): void {
    const i = this.walks.findIndex((w) => w.ch === ch)
    if (i < 0) return
    const w = this.walks[i]
    this.walks.splice(i, 1)
    w.done()
  }

  /** 歩いている速さ（歩いていなければ 0） */
  speedOf(ch: WalkerBody): number {
    for (let i = 0; i < this.walks.length; i++) if (this.walks[i].ch === ch) return this.walks[i].speed
    return 0
  }

  /** すぐに向きを変える */
  face(ch: WalkerBody, to: THREE.Vector3): void {
    ch.root.rotation.y = faceYaw(ch.root.position, to)
  }

  /** なめらかに向きを変える（毎フレーム呼ぶ） */
  turnToward(ch: WalkerBody, to: THREE.Vector3, dt: number, rate = 6): void {
    this.turn(ch, to.x - ch.root.position.x, to.z - ch.root.position.z, dt, rate)
  }

  update(dt: number): void {
    for (let k = this.walks.length - 1; k >= 0; k--) {
      const w = this.walks[k]
      const target = w.path[w.i]
      this.tmp.subVectors(target, w.ch.root.position)
      const d = Math.hypot(this.tmp.x, this.tmp.z)
      const step = w.speed * dt
      if (d <= step) {
        w.ch.root.position.copy(target)
        w.i++
        if (w.i >= w.path.length) {
          this.walks.splice(k, 1)
          if (w.face) w.ch.root.rotation.y = faceYaw(w.ch.root.position, w.face)
          w.done()
        }
      } else {
        w.ch.root.position.x += (this.tmp.x / d) * step
        w.ch.root.position.z += (this.tmp.z / d) * step
        w.ch.root.position.y += this.tmp.y * Math.min(1, step / d)
        this.turn(w.ch, this.tmp.x, this.tmp.z, dt, 9)
      }
    }
  }

  /** 全員止める（場面の打ち切り） */
  clear(): void {
    const all = this.walks.splice(0)
    for (const w of all) w.done()
  }

  private turn(ch: WalkerBody, vx: number, vz: number, dt: number, rate: number): void {
    if (Math.hypot(vx, vz) < 0.05) return
    const want = Math.atan2(-vx, -vz)
    let d = want - ch.root.rotation.y
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    ch.root.rotation.y += d * Math.min(1, rate * dt)
  }
}
