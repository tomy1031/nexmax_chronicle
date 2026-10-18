// NEXTMAKE のオフィスの社員（導入編 6-4・6-5：IDO のリリース前の空気を伝える人たち）。
// 歩く人（pedestrians.ts）と同じ軽い手続きモデル（丸い頭・服の胴）で、座っている人と立っている人。
// 1 人 = 1 メッシュ（頂点カラー）。ゆっくり体を揺らすだけ。吹き出しは mobTalk2026.ts。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type StaffDef = {
  id: string
  pos: THREE.Vector3
  /** 体の正面の向き（y 軸回りの角度。0 = -Z を向く） */
  yaw: number
  seated: boolean
  top: string
  bottom: string
  hair: string
  skin: string
  long?: boolean
}

/** 社員の配置（デスクは x -7・-5・-3、z 12.85（椅子 12.15）と 14.05（椅子 14.75）。カフェの前に 1 人） */
export const OFFICE_STAFF: StaffDef[] = [
  { id: 'o_engineer', pos: new THREE.Vector3(-5.0, 0, 12.15), yaw: Math.PI, seated: true, top: '#3a5a9a', bottom: '#2a3040', hair: '#1a1410', skin: '#f2c8a8' },
  { id: 'o_designer', pos: new THREE.Vector3(-3.0, 0, 14.75), yaw: 0, seated: true, top: '#e8a83a', bottom: '#3a4a6a', hair: '#5a3a22', skin: '#f6d4b8', long: true },
  { id: 'o_planner', pos: new THREE.Vector3(-14.0, 0, 15.25), yaw: -Math.PI / 2 - 0.3, seated: false, top: '#f2f0ea', bottom: '#4a4a50', hair: '#2a2622', skin: '#e8b892' },
]

function colored(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4): THREE.BufferGeometry {
  const out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k)
  out.applyMatrix4(m)
  const c = new THREE.Color(color)
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

const T = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz))

/** 1 人分の形（座っている人は腰を椅子の高さへ下げ、太ももを前へ、すねを下へ） */
function personGeometry(d: StaffDef): THREE.BufferGeometry {
  const s = 1.62 / 1.7
  const hs = 1.3
  const drop = d.seated ? 0.4 * s : 0
  const sph = new THREE.SphereGeometry(1, 14, 10)
  const cap = new THREE.CapsuleGeometry(1, 1, 4, 10)
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const p: THREE.BufferGeometry[] = []
  const y = (v: number) => v * s - drop
  p.push(colored(sph, d.skin, T(0, y(1.58), 0, 0.115 * s * hs, 0.13 * s * hs, 0.12 * s * hs)))
  p.push(colored(sph, d.hair, T(0, y(1.65), 0.02 * s, 0.124 * s * hs, 0.11 * s * hs, 0.128 * s * hs)))
  if (d.long) p.push(colored(cap, d.hair, T(0, y(1.5), 0.07 * s, 0.11 * s * hs, 0.08 * s, 0.07 * s)))
  for (const e of [-1, 1]) p.push(colored(sph, '#1a1410', T(e * 0.045 * s * hs, y(1.585), -0.142 * s, 0.014 * s, 0.02 * s, 0.01 * s)))
  p.push(colored(cap, d.skin, T(0, y(1.4), 0, 0.045 * s, 0.03 * s, 0.045 * s)))
  p.push(colored(cap, d.top, T(0, y(1.13), 0, 0.18 * s, 0.17 * s, 0.12 * s)))
  // 腕（座っている人は机の上へ前に出す、立っている人はマグカップを持つ）
  for (const e of [-1, 1]) {
    if (d.seated) {
      p.push(colored(cap, d.top, T(e * 0.2 * s, y(1.22), -0.12 * s, 0.05 * s, 0.13 * s, 0.05 * s, 0.9)))
      p.push(colored(sph, d.skin, T(e * 0.16 * s, y(1.06), -0.34 * s, 0.045 * s, 0.045 * s, 0.05 * s)))
    } else {
      p.push(colored(cap, d.top, T(e * 0.2 * s, y(1.14), 0, 0.05 * s, 0.15 * s, 0.05 * s)))
      p.push(colored(sph, d.skin, T(e * 0.205 * s, y(0.89), e > 0 ? -0.06 * s : 0, 0.045 * s, 0.05 * s, 0.045 * s)))
    }
  }
  if (!d.seated) p.push(colored(new THREE.CylinderGeometry(1, 1, 1, 10), '#e85a4a', T(0.21 * s, y(0.95), -0.1 * s, 0.04, 0.09, 0.04)))
  for (const e of [-1, 1]) {
    const lx = e * 0.085 * s
    if (d.seated) {
      // 太もも（前へ）・すね（下へ）・靴
      p.push(colored(cap, d.bottom, T(lx, y(0.88), -0.2 * s, 0.078 * s, 0.17 * s, 0.078 * s, Math.PI / 2)))
      p.push(colored(cap, d.bottom, T(lx, 0.25 * s, -0.42 * s, 0.07 * s, 0.17 * s, 0.07 * s)))
      p.push(colored(cube, '#2a2a2a', T(lx, 0.035, -0.46 * s, 0.1 * s, 0.07 * s, 0.21 * s)))
    } else {
      p.push(colored(cap, d.bottom, T(lx, y(0.46), 0, 0.078 * s, 0.3 * s, 0.078 * s)))
      p.push(colored(cube, '#2a2a2a', T(lx, 0.035, -0.04 * s, 0.1 * s, 0.07 * s, 0.21 * s)))
    }
  }
  return mergeGeometries(p, false) as THREE.BufferGeometry
}

export class OfficeStaff {
  readonly group = new THREE.Group()
  /** 頭の上（吹き出しの付け根）の位置 */
  readonly heads: THREE.Vector3[] = []
  private readonly bodies: THREE.Mesh[] = []
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  private t = Math.random() * 10

  constructor(defs: readonly StaffDef[] = OFFICE_STAFF) {
    this.group.name = 'office_staff'
    for (const d of defs) {
      const m = new THREE.Mesh(personGeometry(d), this.mat)
      m.castShadow = true
      m.position.copy(d.pos)
      m.rotation.y = d.yaw
      this.group.add(m)
      this.bodies.push(m)
      this.heads.push(new THREE.Vector3(d.pos.x, d.seated ? 1.55 : 1.92, d.pos.z))
    }
  }

  update(dt: number): void {
    this.t += dt
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]
      // 呼吸と、ときどき少し体をひねる（座っている人はキーボードを打つ小さな揺れ）
      b.scale.y = 1 + Math.sin(this.t * 2.1 + i * 1.7) * 0.006
      b.rotation.z = Math.sin(this.t * 0.7 + i) * 0.012
    }
  }
}
