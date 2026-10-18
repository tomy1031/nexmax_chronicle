// 2086年の広場の床：パールがかった大判タイル（目地は細く、ところどころ光の点）と、
// 床を流れるように曲がる光の道（芯の光る線＋ふわっとにじむ帯）。背景コンセプト案A。
import * as THREE from 'three'
import { mulberry32 } from '../../render/noise'
import type { FCtx } from './kit2086'

/** 大判タイル（1 枚のテクスチャに 4×4 枚。1 枚 ≒ 1.5m） */
function paintTiles(): THREE.CanvasTexture {
  const S = 1024
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const rng = mulberry32(2086)
  const n = 4
  const t = S / n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // ほんの少しずつ違う白（暖かい白〜青みの白）
      const k = rng()
      const r = 236 + Math.floor(k * 10)
      const g = 236 + Math.floor(rng() * 8)
      const b = 232 + Math.floor((1 - k) * 14)
      const gr = c.createLinearGradient(i * t, j * t, (i + 1) * t, (j + 1) * t)
      gr.addColorStop(0, `rgb(${r + 4},${g + 4},${b + 6})`)
      gr.addColorStop(1, `rgb(${r - 6},${g - 5},${b - 4})`)
      c.fillStyle = gr
      c.fillRect(i * t, j * t, t, t)
      // 石目（薄い斑）
      for (let s = 0; s < 40; s++) {
        c.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '190,196,206'},${0.04 + rng() * 0.05})`
        const x = i * t + rng() * t
        const y = j * t + rng() * t
        c.beginPath()
        c.ellipse(x, y, 6 + rng() * 26, 3 + rng() * 10, rng() * Math.PI, 0, Math.PI * 2)
        c.fill()
      }
    }
  }
  // 目地
  c.strokeStyle = 'rgba(120,132,150,0.75)'
  c.lineWidth = 4
  for (let i = 0; i <= n; i++) {
    c.beginPath()
    c.moveTo(i * t, 0)
    c.lineTo(i * t, S)
    c.moveTo(0, i * t)
    c.lineTo(S, i * t)
    c.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** にじむ帯（横方向に中央が明るいグラデーション） */
function paintHalo(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 4
  const c = cv.getContext('2d')!
  const g = c.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(0,0,0,1)')
  c.fillStyle = g
  c.fillRect(0, 0, 64, 4)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export type FloorKit = {
  tile: THREE.MeshStandardMaterial
  /** 曲がる光の道を 1 本 */
  path(pts: Array<[number, number]>, color: THREE.Color, opts?: { core?: number; halo?: number; y?: number }): void
}

export function createFloorKit(c: FCtx, root: THREE.Group): FloorKit {
  const tile = new THREE.MeshStandardMaterial({ map: paintTiles(), roughness: 0.34, metalness: 0.02, envMapIntensity: 1.1 })
  tile.name = 'f2086-plazaTile'
  const haloTex = paintHalo()
  const haloMats = new Map<string, THREE.MeshBasicMaterial>()
  const haloMat = (col: THREE.Color) => {
    const key = col.getHexString()
    let m = haloMats.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: haloTex, color: col.clone().multiplyScalar(0.45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
      m.name = 'f2086-floorHalo'
      haloMats.set(key, m)
    }
    return m
  }
  /** 床に寝かせた帯（中心線 pts、幅 w） */
  const strip = (pts: THREE.Vector3[], w: number, y: number): THREE.BufferGeometry => {
    const n = pts.length
    const pos = new Float32Array(n * 6)
    const uv = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      let nx = -(b.z - a.z)
      let nz = b.x - a.x
      const l = Math.hypot(nx, nz) || 1
      nx = (nx / l) * (w / 2)
      nz = (nz / l) * (w / 2)
      pos.set([p.x - nx, y, p.z - nz, p.x + nx, y, p.z + nz], i * 6)
      uv.set([0, i / (n - 1), 1, i / (n - 1)], i * 4)
    }
    const idx: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const k = i * 2
      // 上向きが表
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  return {
    tile,
    path(pts2, color, o = {}) {
      const y = o.y ?? 0.008
      const curve = new THREE.CatmullRomCurve3(pts2.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal')
      const pts = curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() / 0.3)))
      c.b.add(strip(pts, o.core ?? 0.09, y + 0.002), c.fm.glow, undefined, { tint: color, cast: false, receive: false })
      const halo = new THREE.Mesh(strip(pts, o.halo ?? 0.9, y), haloMat(color))
      halo.renderOrder = 1
      root.add(halo)
    },
  }
}
