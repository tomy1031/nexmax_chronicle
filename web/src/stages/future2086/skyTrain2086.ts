// 空を走る透明なチューブ列車（背景コンセプト案A）。北の通りの上空を西から東へ大きく弧を描くガラスの管と、
// その中を走る白い 4 両の列車、ところどころの白い支柱。遠景なので影は落とさない。
import * as THREE from 'three'
import { M } from '../../render/batch'
import { NEON, type FCtx } from './kit2086'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function buildSkyTrain(c: FCtx, root: THREE.Group): void {
  const curve = new THREE.CatmullRomCurve3([v(-150, 30, 40), v(-90, 34, -14), v(-40, 37, -50), v(8, 38, -62), v(56, 37, -44), v(100, 34, -8), v(160, 30, 36)], false, 'centripetal')
  const R = 1.7
  // ガラスの管（内側も見えるように両面）
  const glass = new THREE.MeshStandardMaterial({ color: '#d8f1ff', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 })
  glass.name = 'f2086-tubeGlass'
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 260, R, 20, false), glass)
  tube.renderOrder = 3
  root.add(tube)
  // 管の縁の補強リング（白）と、下の光るレール
  const len = curve.getLength()
  for (let s = 6; s < len; s += 12) {
    const t = s / len
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan)
    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1))
    c.bf.add(new THREE.TorusGeometry(R + 0.06, 0.09, 6, 28), c.fm.farPanel, m, { tint: '#f6f8fb', cast: false })
  }
  const railPts = curve.getSpacedPoints(200).map((p) => p.clone().add(v(0, -R + 0.25, 0)))
  c.bf.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 260, 0.08, 6, false), c.fm.farGlow, undefined, { tint: NEON.cyan, cast: false })
  // 支柱（地面から管の下まで。広場の外だけ）
  for (const t of [0.08, 0.22, 0.4, 0.62, 0.8, 0.94]) {
    const p = curve.getPointAt(t)
    if (Math.abs(p.x) < 34 && p.z > -40) continue
    const h = p.y - R - 0.2
    c.bf.add(new THREE.CylinderGeometry(0.7, 1.3, h, 14), c.fm.farPanel, M(p.x, h / 2, p.z), { tint: '#f4f6f8', cast: false })
    c.bf.add(new THREE.BoxGeometry(R * 2.4, 0.5, 1.4), c.fm.farPanel, M(p.x, h, p.z, 0, Math.atan2(curve.getTangentAt(t).x, curve.getTangentAt(t).z), 0), { tint: '#f4f6f8', cast: false })
  }
  // 列車：白い車体＋水色の窓の帯（1 両分を作って 4 両並べる）
  const car = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.62, 7.2, 6, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.1 }))
  body.rotation.x = Math.PI / 2
  const bandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.5, 2.4) })
  car.add(body)
  for (const sx of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 6.4), bandMat)
    band.position.set(sx * R * 0.6, R * 0.12, 0)
    car.add(band)
  }
  const cars: THREE.Object3D[] = []
  for (let i = 0; i < 4; i++) {
    const cc = car.clone()
    root.add(cc)
    cars.push(cc)
  }
  const tmpQ = new THREE.Quaternion()
  const Z = new THREE.Vector3(0, 0, 1)
  let s0 = len * 0.3
  c.updaters.push((dt) => {
    s0 = (s0 + dt * 22) % (len + 80)
    for (let i = 0; i < cars.length; i++) {
      const s = s0 - i * 9.6
      const o = cars[i]
      if (s < 2 || s > len - 2) {
        o.visible = false
        continue
      }
      o.visible = true
      const t = s / len
      o.position.copy(curve.getPointAt(t))
      o.position.y -= R * 0.18
      tmpQ.setFromUnitVectors(Z, curve.getTangentAt(t))
      o.quaternion.copy(tmpQ)
    }
  })
}
