// IDO の石標（NEXTMAKE がテスト中の歴史案内）：石の標識の斜めの面にブロンズの板（QR・IDO の文字）。
// 近づくと足元にやわらかい光の輪が出る。読むときはネクマックスの目から板へ光の帯（スキャン）が伸び、
// 板の上を光の線が上下に走る（QR を読み取っている）。町に 3 本（導入編 6-6：A・B・C）。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { mapUV } from './signs'
import type { NCtx } from './kit'

export type IdoMarker = {
  /** 板の中心（ワールド） */
  plate: THREE.Vector3
  /** 足元の中心 */
  base: THREE.Vector3
  /** 板の正面の向き（水平の単位ベクトル。読む人が立つ側） */
  front: THREE.Vector3
  /** 光の輪の強さ（0〜1、近いと 1） */
  setNear(v: number): void
  /** 遠くからでも分かる弱い光（社長に教わった石標の印。0〜1） */
  setBeacon(v: number): void
  /** スキャンの光（from は目の位置、強さ 0 で消える） */
  setScan(from: THREE.Vector3 | null, strength: number): void
  /** 鉱石の反応（板が光る 0〜1） */
  setSurge(v: number): void
  update(dt: number, t: number): void
}

/** 足元の光の輪のテクスチャ（3 本で使い回す。root 配下のメッシュが持つのでシェルが解放する） */
let ringTexCache: THREE.CanvasTexture | null = null
function ringTexture(): THREE.CanvasTexture {
  if (ringTexCache && ringTexCache.image) return ringTexCache
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
  ringTexCache = t
  return t
}

/**
 * 石標を 1 本建てる。p は足元の中心、rotY は板の向き（0 = 南 +Z を向く、π = 北 -Z）。
 * 当たり判定は軸に沿った箱なので、rotY は 0 か π にする
 */
export function buildIdo(c: NCtx, p: THREE.Vector3, rotY = 0, plateId = 'ido_plate'): IdoMarker {
  const front = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY))
  const toWorld = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1))
  // 台石・本体（花崗岩）。正面（ローカル +Z）が少し後ろへ傾いた記念碑のような形
  c.b.add(rbox(1.15, 0.16, 0.85, 0.03), c.m.stone, M(p.x, 0.08, p.z, 0, rotY, 0), { texM: 1, tint: '#d8d2c8' })
  const shape = new THREE.Shape()
  shape.moveTo(-0.28, 0)
  shape.lineTo(0.3, 0)
  shape.lineTo(0.12, 1.15)
  shape.lineTo(-0.2, 1.22)
  shape.lineTo(-0.28, 1.12)
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 })
  // 断面の x（前後）を z へ：正面が +Z を向くように Y 回りに回してから、石標の向きへ
  body.rotateY(-Math.PI / 2)
  body.translate(0.4, 0.16, 0)
  body.applyMatrix4(toWorld)
  c.b.add(body, c.m.stone, undefined, { texM: 0.9, tint: '#c8c2b8' })
  c.col.box(p.x, 0.65, p.z, 0.9, 1.3, 0.7)
  // ブロンズの板（正面）
  const tilt = Math.atan2(0.18, 1.15)
  const nrmL = new THREE.Vector3(0, 0.18, 1.15).normalize()
  const plateL = new THREE.Vector3(0, 0.16 + 0.7, 0.3 - 0.18 * (0.7 / 1.15)).addScaledVector(nrmL, 0.03)
  const plateC = plateL.clone().applyMatrix4(toWorld)
  const nrm = nrmL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
  const geo = mapUV(new THREE.PlaneGeometry(0.56, 0.75), c.signs.get(plateId))
  const plateMat = new THREE.MeshStandardMaterial({ map: c.signMat.map, roughness: 0.38, metalness: 0.55, emissiveMap: c.signMat.map, emissive: new THREE.Color('#000000'), envMapIntensity: 1.2 })
  const plate = new THREE.Mesh(geo, plateMat)
  plate.position.copy(plateC)
  plate.rotation.set(-tilt, rotY, 0, 'YXZ')
  plate.receiveShadow = true
  c.root.add(plate)
  // 板の縁（ブロンズの枠）
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.81, 0.03), new THREE.MeshStandardMaterial({ color: '#6a4a26', metalness: 0.7, roughness: 0.4 }))
  frame.position.copy(plateC).addScaledVector(nrm, -0.018)
  frame.rotation.copy(plate.rotation)
  frame.castShadow = true
  c.root.add(frame)
  // 読み取りの光の線（板の上を上下に走る）
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const scanLine = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.035), lineMat)
  scanLine.rotation.copy(plate.rotation)
  scanLine.visible = false
  scanLine.renderOrder = 7
  c.root.add(scanLine)
  const plateUp = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
  // 足元の光の輪
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: new THREE.Color(0.6, 1.4, 2.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.copy(p).addScaledVector(front, 0.9)
  ring.position.y = 0.035
  ring.renderOrder = 3
  c.root.add(ring)
  // スキャンの光の帯（目 → 板）
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
  let beacon = 0
  let beaconNow = 0
  let scan = 0
  let scanT = 0
  let surge = 0
  const tmp = new THREE.Vector3()
  return {
    plate: plateC,
    base: p.clone(),
    front,
    setNear(v) {
      near = v
    },
    setBeacon(v) {
      beacon = v
    },
    setScan(from, strength) {
      scan = strength
      if (!from || strength <= 0.001) {
        beam.visible = false
        return
      }
      beam.visible = true
      // 円錐の頂点を目に、底面を板へ
      tmp.subVectors(plateC, from)
      const len = tmp.length()
      beam.position.copy(plateC)
      beam.lookAt(from)
      beam.scale.set(0.34, 0.26, len)
    },
    setSurge(v) {
      surge = v
    },
    update(dt, t) {
      nearNow += (near - nearNow) * Math.min(1, dt * 4)
      beaconNow += (beacon - beaconNow) * Math.min(1, dt * 2)
      const lit = Math.max(nearNow, beaconNow * 0.42)
      ringMat.opacity = lit * (0.55 + 0.25 * Math.sin(t * 3)) + surge * 0.6
      ring.scale.setScalar(1 + Math.sin(t * 2) * 0.03 + surge * 0.4)
      beamMat.opacity = scan * (0.32 + 0.12 * Math.sin(t * 20))
      // 読み取りの線：板の上を往復する
      if (scan > 0.01) {
        scanT += dt
        const k = Math.sin(scanT * 4.2) * 0.34
        scanLine.visible = true
        scanLine.position.copy(plateC).addScaledVector(plateUp, k).addScaledVector(nrm, 0.012)
        lineMat.opacity = scan * 0.95
      } else if (scanLine.visible) {
        scanLine.visible = false
        scanT = 0
      }
      const e = Math.max(scan * 0.35, surge, beaconNow * 0.08)
      plateMat.emissive.setRGB(0.9 * e, 0.75 * e, 0.45 * e)
    },
  }
}
