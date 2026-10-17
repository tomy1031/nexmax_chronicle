// シーン構築側が登録する当たり判定の記述（物理エンジン非依存）。player/physics.ts が Rapier に変換する。
import * as THREE from 'three'

export type BoxCollider = {
  kind: 'box'
  center: THREE.Vector3
  half: THREE.Vector3
  rotY: number
  /** 斜面など X 軸回りの傾き */
  rotX?: number
  rotZ?: number
  /** 見えない壁（水への落下防止・プレイ範囲）。プレイヤーは止めるが、視線・カメラ・置いた物は通す */
  invisible?: boolean
}

export class ColliderList {
  readonly items: BoxCollider[] = []

  /** 中心と全寸法で箱を登録 */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, rotX = 0, rotZ = 0): void {
    this.items.push({
      kind: 'box',
      center: new THREE.Vector3(cx, cy, cz),
      half: new THREE.Vector3(sx / 2, sy / 2, sz / 2),
      rotY,
      rotX,
      rotZ,
    })
  }

  /** 上面の高さと XZ 範囲で床を登録（厚さ thick は下方向） */
  floor(x0: number, x1: number, z0: number, z1: number, top: number, thick = 1): void {
    this.box((x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2, Math.abs(x1 - x0), thick, Math.abs(z1 - z0))
  }

  /** 見えない壁（XZ の線分に沿って） */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, thick = 0.3): void {
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    this.box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, len, y1 - y0, thick, -Math.atan2(dz, dx))
    this.items[this.items.length - 1].invisible = true
  }
}
