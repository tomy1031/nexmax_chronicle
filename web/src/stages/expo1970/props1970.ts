// 1970年 万博の動く小物：拾える物（部品・時のかけら）、欠けの裂け目、壊れた壁の破片、錨の糸。
// どれも stage の root の下に置くので、形・材質はシェルが移動のときに解放する。
import * as THREE from 'three'
import { mergeChildMeshes } from '../../render/mergeChildren'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 拾える物（近づくと拾う）。part：はじく腕の部品（銀と青い光）／shard：時のかけら（金色の結晶） */
export class Pickup {
  readonly root = new THREE.Group()
  readonly pos: THREE.Vector3
  collected = false
  /** 拾えるか（部品は話を聞くまで出さない、など） */
  active = true
  private readonly item = new THREE.Group()
  private readonly ring: THREE.Mesh
  private readonly glowMat: THREE.MeshBasicMaterial
  private popT = -1

  constructor(kind: 'part' | 'shard', pos: THREE.Vector3) {
    this.pos = pos.clone()
    this.root.position.copy(pos)
    this.root.add(this.item)
    this.item.position.y = 0.9
    const color = kind === 'part' ? '#5ad8ff' : '#ffd86a'
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.9 })
    if (kind === 'part') {
      const metal = new THREE.MeshStandardMaterial({ color: '#d6dbe2', roughness: 0.3, metalness: 0.8 })
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 24), metal)
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), this.glowMat)
      core.rotation.x = Math.PI / 2
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), metal)
      box.position.y = -0.14
      this.item.add(coil, core, box)
    } else {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: '#ffe8a0', roughness: 0.15, metalness: 0.3, emissive: new THREE.Color('#ffb020'), emissiveIntensity: 1.6 }))
      crystal.scale.set(0.8, 1.4, 0.8)
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), this.glowMat)
      this.item.add(crystal, inner)
    }
    this.item.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }))
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.04
    this.root.add(this.ring)
  }

  near(p: THREE.Vector3, r = 1.2): boolean {
    return this.active && !this.collected && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r && Math.abs(p.y - this.pos.y) < 1.6
  }

  collect(): void {
    if (this.collected) return
    this.collected = true
    this.popT = 0
  }

  /** 拾った状態にする（セーブから） */
  hide(): void {
    this.collected = true
    this.root.visible = false
  }

  update(dt: number, t: number): void {
    this.root.visible = this.active && (!this.collected || this.popT >= 0)
    if (!this.root.visible) return
    this.item.rotation.y += dt * 1.6
    this.item.position.y = 0.9 + Math.sin(t * 2.2 + this.pos.x) * 0.08
    const k = 0.5 + 0.5 * Math.sin(t * 3)
    ;(this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + k * 0.4
    this.ring.scale.setScalar(1 + k * 0.15)
    if (this.popT >= 0) {
      this.popT += dt
      const u = this.popT / 0.5
      this.item.position.y = 0.9 + u * 1.2
      this.item.scale.setScalar(Math.max(0.01, 1 + u * 0.6 - u * u * 1.6))
      ;(this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - u)
      if (u >= 1) {
        this.popT = -1
        this.root.visible = false
      }
    }
  }
}

/** 欠けの裂け目：黒い結晶のかたまりと、すみれ色の光（敵が湧く所。追い払うと縮んで消える） */
export class KakeRift {
  readonly root = new THREE.Group()
  private shown = 0
  private target = 0
  private readonly mat: THREE.MeshStandardMaterial

  constructor(pos: THREE.Vector3, size = 1) {
    this.root.position.copy(pos)
    this.mat = new THREE.MeshStandardMaterial({ color: '#120c1c', roughness: 0.2, metalness: 0.6, emissive: new THREE.Color('#a33cff'), emissiveIntensity: 1.2 })
    let s = Math.floor(pos.x * 13 + pos.z * 7) >>> 0
    const rnd = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647)
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + rnd() * 0.3, 0), this.mat)
      const a = rnd() * Math.PI * 2
      const r = rnd() * 0.7
      m.position.set(Math.cos(a) * r * size, (0.3 + rnd() * 0.5) * size, Math.sin(a) * r * size)
      m.scale.set(0.6 * size, (1.2 + rnd() * 1.4) * size, 0.6 * size)
      m.rotation.set(rnd() * 0.5, rnd() * 3, rnd() * 0.5)
      m.castShadow = true
      this.root.add(m)
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3 * size, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a2cff').multiplyScalar(1.4), transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false }))
    glow.rotation.x = -Math.PI / 2
    glow.position.y = 0.05
    this.root.add(glow)
    mergeChildMeshes(this.root, { disposeOriginals: true })
    this.root.visible = false
  }

  show(on: boolean, instant = false): void {
    this.target = on ? 1 : 0
    if (instant) this.shown = this.target
  }

  update(dt: number, t: number): void {
    this.shown += Math.sign(this.target - this.shown) * Math.min(Math.abs(this.target - this.shown), dt * 1.5)
    this.root.visible = this.shown > 0.01
    if (!this.root.visible) return
    this.root.scale.setScalar(this.shown)
    this.mat.emissiveIntensity = 1 + Math.sin(t * 5 + this.root.position.x) * 0.5
  }
}

/** 壊れた壁の破片（飛び散って落ち、消える） */
export class Debris {
  readonly root = new THREE.Group()
  private readonly parts: Array<{ m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }> = []
  private t = -1

  constructor() {
    this.root.visible = false
  }

  burst(at: THREE.Vector3, normal: THREE.Vector3, width: number, height: number, color = '#cfc8ba'): void {
    for (const p of this.parts) p.m.removeFromParent()
    this.parts.length = 0
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    const side = v(-normal.z, 0, normal.x)
    for (let i = 0; i < 26; i++) {
      const s = 0.15 + Math.random() * 0.35
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.6 + Math.random()), s * 0.5), mat)
      m.position.copy(at).addScaledVector(side, (Math.random() - 0.5) * width).add(v(0, (Math.random() - 0.5) * height, 0))
      m.castShadow = true
      this.root.add(m)
      const vel = normal.clone().multiplyScalar(-(2 + Math.random() * 4)).addScaledVector(side, (Math.random() - 0.5) * 4)
      vel.y = 2 + Math.random() * 4
      this.parts.push({ m, v: vel, w: v(Math.random() * 8, Math.random() * 8, Math.random() * 8) })
    }
    this.root.visible = true
    this.t = 0
  }

  update(dt: number): void {
    if (this.t < 0) return
    this.t += dt
    for (const p of this.parts) {
      p.v.y -= 14 * dt
      p.m.position.addScaledVector(p.v, dt)
      if (p.m.position.y < 0.1) {
        p.m.position.y = 0.1
        p.v.multiplyScalar(0.4)
        p.v.y = Math.abs(p.v.y) * 0.3
      }
      p.m.rotation.x += p.w.x * dt
      p.m.rotation.y += p.w.y * dt
      if (this.t > 2.2) p.m.scale.multiplyScalar(Math.max(0, 1 - dt * 2.5))
    }
    if (this.t > 3.4) {
      this.t = -1
      this.root.visible = false
    }
  }
}

/** 錨の糸：黒い輪から結び目まで垂れる黒い糸（震える）と、結び目の光 */
export class AnchorThread {
  readonly root = new THREE.Group()
  private readonly line: THREE.Mesh
  private readonly knot: THREE.Mesh
  private readonly knotMat: THREE.MeshStandardMaterial
  private readonly top: THREE.Vector3
  private readonly bottom: THREE.Vector3
  private readonly curve: THREE.CatmullRomCurve3
  private readonly pts: THREE.Vector3[]
  private tension = 0
  private fade = 1

  constructor(top: THREE.Vector3, bottom: THREE.Vector3) {
    this.top = top.clone()
    this.bottom = bottom.clone()
    this.pts = Array.from({ length: 7 }, (_, i) => top.clone().lerp(bottom, i / 6))
    this.curve = new THREE.CatmullRomCurve3(this.pts)
    this.line = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 32, 0.06, 6, false), new THREE.MeshStandardMaterial({ color: '#100a18', roughness: 0.3, emissive: new THREE.Color('#7a2cff'), emissiveIntensity: 0.8, transparent: true }))
    this.knotMat = new THREE.MeshStandardMaterial({ color: '#140c20', roughness: 0.25, metalness: 0.4, emissive: new THREE.Color('#c04cff'), emissiveIntensity: 1.4, transparent: true })
    this.knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 64, 8), this.knotMat)
    this.knot.position.copy(bottom)
    this.root.add(this.line, this.knot)
  }

  /** 引っぱられている強さ（0〜1：支えている間に震える） */
  setTension(k: number): void {
    this.tension = k
  }

  /** ほどけていく（1 → 0 で消える） */
  setFade(k: number): void {
    this.fade = k
  }

  update(dt: number, t: number): void {
    this.root.visible = this.fade > 0.01
    if (!this.root.visible) return
    for (let i = 1; i < this.pts.length - 1; i++) {
      const w = Math.sin((i / 6) * Math.PI)
      const a = 0.12 + this.tension * 0.35
      this.pts[i].copy(this.top).lerp(this.bottom, i / 6)
      this.pts[i].x += Math.sin(t * (3 + this.tension * 14) + i * 1.3) * a * w
      this.pts[i].z += Math.cos(t * (2.6 + this.tension * 12) + i) * a * w
    }
    const old = this.line.geometry
    this.line.geometry = new THREE.TubeGeometry(this.curve, 32, 0.06 * (0.4 + 0.6 * this.fade), 6, false)
    old.dispose()
    ;(this.line.material as THREE.MeshStandardMaterial).opacity = this.fade
    this.knotMat.opacity = this.fade
    this.knot.rotation.y += dt * (0.6 + this.tension * 4)
    this.knot.rotation.x = Math.sin(t * 1.3) * 0.3
    this.knotMat.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.4 + this.tension * 1.5
    this.knot.scale.setScalar(0.6 + 0.4 * this.fade)
  }

  dispose(): void {
    this.line.geometry.dispose()
  }
}

/**
 * 帰っていく光：欠けを倒した・錨がほどけたときに、吸われていた可能性が光の粒になって持ち主のところへ帰る
 * （docs/中盤シナリオとワールド構成_v1.md §1.5）。使い回しの光の玉が、ふわりと浮いてから弧を描いて飛ぶ。
 */
export class ReturnLights {
  readonly root = new THREE.Group()
  private readonly items: Array<{ m: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; lift: number }> = []
  private next = 0
  private readonly tmp = new THREE.Vector3()

  constructor(n = 14) {
    const geo = new THREE.SphereGeometry(0.16, 12, 8)
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a0').multiplyScalar(2.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      const m = new THREE.Mesh(geo, mat)
      m.visible = false
      m.frustumCulled = false
      this.root.add(m)
      this.items.push({ m, from: new THREE.Vector3(), to: new THREE.Vector3(), t: -1, dur: 1, lift: 2 })
    }
  }

  /** at から to へ（to が遠ければ空へ消えていく） */
  send(at: THREE.Vector3, to: THREE.Vector3, delay = 0): void {
    const it = this.items[this.next]
    this.next = (this.next + 1) % this.items.length
    it.from.copy(at)
    it.to.copy(to)
    it.t = -delay
    it.dur = Math.min(3.2, 1.2 + at.distanceTo(to) / 18)
    it.lift = 1.5 + Math.random() * 1.5
    it.m.visible = false
  }

  update(dt: number, t: number): void {
    for (const it of this.items) {
      if (it.t === -1 && !it.m.visible) continue
      it.t += dt
      if (it.t < 0) continue
      const u = Math.min(1, it.t / it.dur)
      const e = u * u * (3 - 2 * u)
      this.tmp.lerpVectors(it.from, it.to, e)
      this.tmp.y += Math.sin(Math.PI * u) * (it.lift + it.from.distanceTo(it.to) * 0.15)
      it.m.position.copy(this.tmp)
      it.m.visible = true
      const mat = it.m.material as THREE.MeshBasicMaterial
      mat.opacity = Math.min(1, it.t * 4) * (1 - Math.max(0, (u - 0.8) / 0.2))
      it.m.scale.setScalar(1 + Math.sin(t * 12 + it.from.x) * 0.15)
      if (u >= 1) {
        it.t = -1
        it.m.visible = false
      }
    }
  }
}

/** 元に戻った展示ロボット「ミライ号」（錨をほどいたあと、電気の館の入口で来場者にあいさつしている） */
export function buildMiraiFigure(): THREE.Group {
  const g = new THREE.Group()
  const silver = new THREE.MeshStandardMaterial({ color: '#d6dce4', roughness: 0.3, metalness: 0.75 })
  const dark = new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.5, metalness: 0.4 })
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe8ff').multiplyScalar(1.8), toneMapped: false })
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(geo, m)
    o.position.set(x, y, z)
    o.scale.set(sx, sy, sz)
    o.castShadow = true
    g.add(o)
    return o
  }
  add(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 20), silver, 0, 0.75, 0)
  add(new THREE.CylinderGeometry(0.5, 0.55, 0.25, 20), dark, 0, 0.12, 0)
  add(new THREE.SphereGeometry(0.36, 20, 14), silver, 0, 1.55, 0)
  add(new THREE.BoxGeometry(0.42, 0.08, 0.04), glow, 0, 1.58, -0.33)
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), glow, -0.14 + i * 0.14, 0.95, -0.44).rotation.x = Math.PI / 2
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.08, 0.5, 3, 8), dark, s * 0.56, 0.85, 0).rotation.z = s * 0.25
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), dark, s * 0.2, 1.95, 0).rotation.z = s * -0.35
    add(new THREE.SphereGeometry(0.05, 8, 6), glow, s * 0.27, 2.14, 0)
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), new THREE.MeshStandardMaterial({ color: '#cfe6ff', roughness: 0.05, transparent: true, opacity: 0.3 })).translateY(1.6))
  return g
}

/** 展示案内の板（設計者の名前が消えている／戻っている、の 2 枚を切り替える） */
export class Plaque {
  readonly root = new THREE.Group()
  private readonly before: THREE.Mesh
  private readonly after: THREE.Mesh

  constructor() {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.7, roughness: 0.35 }))
    post.position.y = 0.55
    post.castShadow = true
    this.root.add(post)
    this.before = this.board(null)
    this.after = this.board('北條')
    this.root.add(this.before, this.after)
    this.setNamed(false)
  }

  private board(name: string | null): THREE.Mesh {
    const W = 512
    const H = 340
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d') as CanvasRenderingContext2D
    g.fillStyle = '#f4f1ea'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#f07a2a'
    g.fillRect(0, 0, W, 70)
    g.fillStyle = '#fff'
    g.font = '800 44px "M PLUS Rounded 1c", "Hiragino Sans", sans-serif'
    g.textBaseline = 'middle'
    g.fillText('ミライ号', 24, 37)
    g.fillStyle = '#24345e'
    g.font = '700 26px "M PLUS Rounded 1c", "Hiragino Sans", sans-serif'
    const lines = ['毎朝「おはようございます」と', 'あいさつし、今日の予定を', '読み上げる家庭用ロボットの試作']
    lines.forEach((l, i) => g.fillText(l, 24, 112 + i * 40))
    g.font = '700 26px "M PLUS Rounded 1c", "Hiragino Sans", sans-serif'
    g.fillText('設計：', 24, 290)
    if (name) g.fillText(`${name}（電気の館 技術班）`, 104, 290)
    else {
      // 名前の欄だけ、インクが抜けたように白い
      g.fillStyle = 'rgba(255,255,255,0.95)'
      g.fillRect(100, 270, 160, 40)
      g.fillStyle = '#24345e'
      g.fillText('（電気の館 技術班）', 268, 290)
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
    m.position.y = 1.35
    m.rotation.x = -0.2
    return m
  }

  setNamed(on: boolean): void {
    this.before.visible = !on
    this.after.visible = on
  }
}
