// IDO マーカー：水路の柵の前に立つ石の標識。斜めの面にブロンズの板（QR・IDO の文字）。
// 近づくと足元にやわらかい光の輪が出る。読むときはネクマックスの手から板へ光の帯（スキャン）が伸びる。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { mapUV } from './signs'
import { N } from './layout'
import type { NCtx } from './kit'

export type IdoMarker = {
  /** 板の中心（ワールド） */
  plate: THREE.Vector3
  /** 足元の中心 */
  base: THREE.Vector3
  /** 光の輪の強さ（0〜1、近いと 1） */
  setNear(v: number): void
  /** スキャンの光（from は手の位置、強さ 0 で消える） */
  setScan(from: THREE.Vector3 | null, strength: number): void
  /** 鉱石の反応（板が光る 0〜1） */
  setSurge(v: number): void
  update(dt: number, t: number): void
}

export function buildIdo(c: NCtx): IdoMarker {
  const p = N.IDO
  // 台石・本体（花崗岩）。正面（+Z）が少し後ろへ傾いた記念碑のような形
  c.b.add(rbox(1.15, 0.16, 0.85, 0.03), c.m.stone, M(p.x, 0.08, p.z), { texM: 1, tint: '#d8d2c8' })
  const shape = new THREE.Shape()
  shape.moveTo(-0.28, 0)
  shape.lineTo(0.3, 0)
  shape.lineTo(0.12, 1.15)
  shape.lineTo(-0.2, 1.22)
  shape.lineTo(-0.28, 1.12)
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 })
  // 断面の x（前後）を z へ：正面が +Z を向くように Y 回りに回す
  body.rotateY(-Math.PI / 2)
  body.translate(p.x + 0.4, 0.16, p.z)
  c.b.add(body, c.m.stone, undefined, { texM: 0.9, tint: '#c8c2b8' })
  c.col.box(p.x, 0.65, p.z, 0.9, 1.3, 0.7)
  // ブロンズの板（正面）
  const nrm = new THREE.Vector3(0, 0.18, 1.15).normalize()
  const plateC = new THREE.Vector3(p.x, 0.16 + 0.7, p.z + 0.3 - 0.18 * (0.7 / 1.15)).addScaledVector(nrm, 0.03)
  const geo = mapUV(new THREE.PlaneGeometry(0.56, 0.75), c.signs.get('ido_plate'))
  const plateMat = new THREE.MeshStandardMaterial({ map: c.signMat.map, roughness: 0.38, metalness: 0.55, emissiveMap: c.signMat.map, emissive: new THREE.Color('#000000'), envMapIntensity: 1.2 })
  const plate = new THREE.Mesh(geo, plateMat)
  plate.position.copy(plateC)
  plate.rotation.set(-Math.atan2(0.18, 1.15), 0, 0)
  plate.receiveShadow = true
  c.root.add(plate)
  // 板の縁（ブロンズの枠）
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.81, 0.03), new THREE.MeshStandardMaterial({ color: '#6a4a26', metalness: 0.7, roughness: 0.4 }))
  frame.position.copy(plateC).addScaledVector(nrm, -0.018)
  frame.rotation.copy(plate.rotation)
  frame.castShadow = true
  c.root.add(frame)
  // 足元の光の輪
  const ringTex = (() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const g = cv.getContext('2d') as CanvasRenderingContext2D
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(0.55, 'rgba(255,255,255,0.0)')
    gr.addColorStop(0.75, 'rgba(255,255,255,0.9)')
    gr.addColorStop(0.82, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, color: new THREE.Color(0.6, 1.4, 2.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.set(p.x, 0.035, p.z + 0.9)
  ring.renderOrder = 3
  c.root.add(ring)
  // スキャンの光の帯（手 → 板）
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const beamGeo = new THREE.ConeGeometry(1, 1, 24, 1, true)
  beamGeo.translate(0, -0.5, 0)
  beamGeo.rotateX(-Math.PI / 2)
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.visible = false
  beam.renderOrder = 6
  beam.frustumCulled = false
  c.root.add(beam)
  let near = 0
  let nearNow = 0
  let scan = 0
  let surge = 0
  const tmp = new THREE.Vector3()
  return {
    plate: plateC,
    base: p.clone(),
    setNear(v) {
      near = v
    },
    setScan(from, strength) {
      scan = strength
      if (!from || strength <= 0.001) {
        beam.visible = false
        return
      }
      beam.visible = true
      // 円錐の頂点を手に、底面を板へ
      tmp.subVectors(plateC, from)
      const len = tmp.length()
      beam.position.copy(plateC)
      beam.lookAt(from)
      beam.scale.set(0.34, 0.24, len)
    },
    setSurge(v) {
      surge = v
    },
    update(dt, t) {
      nearNow += (near - nearNow) * Math.min(1, dt * 4)
      ringMat.opacity = nearNow * (0.55 + 0.25 * Math.sin(t * 3)) + surge * 0.6
      ring.scale.setScalar(1 + Math.sin(t * 2) * 0.03 + surge * 0.4)
      beamMat.opacity = scan * (0.32 + 0.12 * Math.sin(t * 20))
      const e = Math.max(scan * 0.35, surge)
      plateMat.emissive.setRGB(0.9 * e, 0.75 * e, 0.45 * e)
    },
  }
}
