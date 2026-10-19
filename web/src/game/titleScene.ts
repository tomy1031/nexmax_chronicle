// タイトル画面の 3D の背景：夜明け（アルン）の空の下、光る台の上に立つネクマックスと、うしろで回る時空の輪。
// 遠くに町の影、足もとから光の粒が昇る。シェルの scene・camera・ネクマックスをそのまま使い、dispose() で元に戻す。
import * as THREE from 'three'
import type { StageEnvironment } from './stage'
import type { Character } from '../world/characters'
import { applyRigOreGlow } from '../player/poseDriver'

/** 夜明けの空（上は夜の名残の藍、地平は朝の金） */
export const TITLE_ENVIRONMENT: StageEnvironment = {
  sky: {
    zenith: '#151a52',
    upper: '#3d3f98',
    horizon: '#ffb08a',
    warm: '#ffd27a',
    ground: '#231c33',
    haze: '#d9a2b6',
    cloudLit: '#ffd8b4',
    cloudShade: '#5e4f8a',
  },
  // ネクマックスのうしろ（カメラの向こう）の低い朝日：縁が光る
  sunDir: new THREE.Vector3(0.42, 0.12, -0.9),
  sunColor: '#ffc58a',
  sunIntensity: 3.2,
  hemi: { sky: '#8f9cf0', ground: '#4a3048', intensity: 0.85 },
  hdri: null,
  envIntensity: 0.9,
  fog: { color: '#b98aa6', density: 0.0028 },
  grade: { exposure: 1.02, saturation: 1.18, contrast: 1.1, vignette: 0.5 },
  bloom: { intensity: 1.5, threshold: 0.78 },
  haze: { near: '#f0c0b0', far: '#8c84c8', density: 0.004, start: 20, falloff: 0.03, max: 0.55 },
}

const MOTES = 160

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class TitleScene {
  readonly root = new THREE.Group()
  /** カメラが見る点（ネクマックスの少し上） */
  readonly focus = new THREE.Vector3(0, 0.95, 0)
  private readonly rings: THREE.Object3D[] = []
  private readonly motes: THREE.Points
  private readonly moteSpeed: Float32Array
  private readonly nexmax: Character
  private t = 0

  constructor(nexmax: Character) {
    this.nexmax = nexmax
    this.root.name = 'title'
    // 地面と台
    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 48), new THREE.MeshStandardMaterial({ color: '#2b2340', roughness: 0.92, metalness: 0.05 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.root.add(ground)
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.16, 48), new THREE.MeshStandardMaterial({ color: '#3a3f62', roughness: 0.35, metalness: 0.75 }))
    deck.position.y = 0.08
    deck.receiveShadow = true
    deck.castShadow = true
    this.root.add(deck)
    const glow = (color: THREE.ColorRepresentation, k: number) => new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: k, roughness: 0.6 })
    for (const [r, w, c, k] of [
      [1.42, 0.025, '#7fe6ff', 2.2],
      [1.66, 0.018, '#ffcf6a', 2.6],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 96), glow(c, k))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.165
      this.root.add(ring)
    }
    // うしろの時空の輪（IDO の輪）：大きな金の輪・内側の青い輪・目盛りの輪
    const halo = new THREE.Group()
    halo.position.set(0, 1.0, -0.9)
    this.root.add(halo)
    const gold = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.028, 12, 128), glow('#ffc861', 3.2))
    halo.add(gold)
    const blue = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.013, 8, 128, Math.PI * 1.55), glow('#6fdcff', 2.6))
    halo.add(blue)
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.14, 0.02), glow('#ffe2a0', 2.2), 36)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
      m.compose(new THREE.Vector3(Math.sin(-a) * 1.28, Math.cos(a) * 1.28, 0), q, new THREE.Vector3(1, i % 3 === 0 ? 1.6 : 1, 1))
      ticks.setMatrixAt(i, m)
    }
    halo.add(ticks)
    this.rings.push(gold, blue, ticks)
    // 遠くの町の影（ナンバタウン）
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#1d1830', roughness: 1 }), 70)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 70; i++) {
      // カメラの向こう側（-z）の半円に並べる
      const a = -Math.PI * 0.95 + rnd() * Math.PI * 0.9
      const d = 170 + rnd() * 90
      const h = 10 + Math.pow(rnd(), 2) * 55
      const w = 8 + rnd() * 14
      m.compose(new THREE.Vector3(Math.cos(a) * d, h / 2, Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI), new THREE.Vector3(w, h, w))
      city.setMatrixAt(i, m)
    }
    this.root.add(city)
    // 光の粒（足もとから昇って、上で消える）
    const pos = new Float32Array(MOTES * 3)
    const col = new Float32Array(MOTES * 3)
    this.moteSpeed = new Float32Array(MOTES)
    const cA = new THREE.Color('#ffd27a')
    const cB = new THREE.Color('#8fe8ff')
    for (let i = 0; i < MOTES; i++) {
      const a = rnd() * Math.PI * 2
      const r = 0.6 + rnd() * 3.4
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = rnd() * 4
      pos[i * 3 + 2] = Math.sin(a) * r - 0.5
      const c = rnd() < 0.65 ? cA : cB
      col.set([c.r, c.g, c.b], i * 3)
      this.moteSpeed[i] = 0.12 + rnd() * 0.3
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }),
    )
    this.motes.frustumCulled = false
    this.root.add(this.motes)
  }

  /** ネクマックスを台の上へ（カメラの方を向く） */
  place(): void {
    const n = this.nexmax
    n.root.position.set(0, 0.16, 0)
    n.root.rotation.y = Math.PI - 0.32
    n.root.scale.setScalar(1)
    n.setAim(null)
    n.setPose('idle')
  }

  /** 毎フレーム。カメラはゆっくり左右に回る。横長の画面ではネクマックスを右に寄せる（左はロゴとメニュー）。縦長では真ん中で少し引く */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.t += dt
    const t = this.t
    this.rings[0].rotation.z = t * 0.12
    this.rings[1].rotation.z = -t * 0.32
    this.rings[2].rotation.z = t * 0.05
    const p = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute
    const a = p.array as Float32Array
    for (let i = 0; i < MOTES; i++) {
      let y = a[i * 3 + 1] + this.moteSpeed[i] * dt
      if (y > 4.2) y -= 4.2
      a[i * 3 + 1] = y
    }
    p.needsUpdate = true
    this.nexmax.update(dt, 0)
    // 胸の鉱石がゆっくり脈打つ
    applyRigOreGlow(this.nexmax, 0.55 + 0.45 * Math.sin(t * 1.6))
    const portrait = camera.aspect < 1
    const yaw = Math.sin(t * 0.09) * 0.32
    const dist = portrait ? 5.6 : 3.7
    camera.fov = portrait ? 50 : 38
    camera.position.set(Math.sin(yaw) * dist, 1.05 + Math.sin(t * 0.13) * 0.06, Math.cos(yaw) * dist)
    // 見る点をカメラの左へずらすと、ネクマックスは画面の右へ寄る
    const side = portrait ? 0 : 0.95
    camera.lookAt(this.focus.x - Math.cos(yaw) * side, this.focus.y + (portrait ? 0.55 : 0.12), this.focus.z + Math.sin(yaw) * side)
    camera.updateProjectionMatrix()
  }
}
