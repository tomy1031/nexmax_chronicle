// よろいの影獣（6 章）の戦いの見た目：突進の赤い帯・とびかかりのねらいの輪・衝撃の輪・気絶の星・土ぼこり・柱の「ここにぶつかる」印。
// すべて 1 つの group の下（ステージの root に足す）。絵はキャンバスで作り、dispose() で解放する。毎フレームの割り当ては無い。
import * as THREE from 'three'
import { makeCanvas } from '../../../render/textures'

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const [c, g] = makeCanvas(w, h)
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 突進の道すじの帯の絵（ふちの線と、向こうを指す矢じるし）。キャンバスの上が獣の側 */
function bandTexture(): THREE.CanvasTexture {
  const t = canvasTex(128, 256, (g) => {
    g.clearRect(0, 0, 128, 256)
    const gr = g.createLinearGradient(0, 0, 128, 0)
    gr.addColorStop(0, 'rgba(255,255,255,0.95)')
    gr.addColorStop(0.08, 'rgba(255,255,255,0.35)')
    gr.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    gr.addColorStop(0.92, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0.95)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 256)
    g.fillStyle = 'rgba(255,255,255,0.9)'
    for (let k = 0; k < 2; k++) {
      const y = 40 + k * 128
      g.beginPath()
      g.moveTo(24, y)
      g.lineTo(64, y + 44)
      g.lineTo(104, y)
      g.lineTo(104, y + 22)
      g.lineTo(64, y + 66)
      g.lineTo(24, y + 22)
      g.closePath()
      g.fill()
    }
  })
  t.wrapT = THREE.RepeatWrapping
  return t
}

/** やわらかい丸（土ぼこり） */
function puffTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)')
    gr.addColorStop(0.6, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
  })
}

/** 星（気絶） */
function starTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.translate(32, 32)
    g.fillStyle = '#fff3a0'
    g.strokeStyle = '#c87a10'
    g.lineWidth = 4
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 27
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    g.closePath()
    g.stroke()
    g.fill()
  })
}

/** 「！」の札（柱にぶつかる印） */
function bangTexture(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffd23f'
    g.beginPath()
    g.arc(32, 32, 29, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#3a2000'
    g.font = '900 46px "Hiragino Sans","Noto Sans JP",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('!', 32, 35)
  })
}

type Puff = { s: THREE.Sprite; vel: THREE.Vector3; life: number; t: number; size: number }

export class BeastFx {
  readonly group = new THREE.Group()
  // 突進の帯
  private readonly band: THREE.Mesh
  private readonly bandMat: THREE.MeshBasicMaterial
  private readonly bandTex: THREE.CanvasTexture
  // 地面の輪（とびかかりのねらい・柱の印）
  private readonly target: THREE.Mesh
  private readonly targetMat: THREE.MeshBasicMaterial
  private readonly pillarRing: THREE.Mesh
  private readonly pillarMat: THREE.MeshBasicMaterial
  private readonly bang: THREE.Sprite
  // 衝撃の輪（立ち上がる壁と、地面の輪）
  private readonly wave: THREE.Mesh
  private readonly waveMat: THREE.MeshBasicMaterial
  private readonly waveFloor: THREE.Mesh
  private readonly waveFloorMat: THREE.MeshBasicMaterial
  // 気絶の星
  private readonly stars: THREE.Sprite[] = []
  private readonly starMat: THREE.SpriteMaterial
  private starsOn = false
  private readonly starAt = new THREE.Vector3()
  // 土ぼこり
  private readonly puffs: Puff[] = []
  private readonly puffMat: THREE.SpriteMaterial
  private readonly mats: THREE.Material[] = []
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly texs: THREE.Texture[] = []
  private t = 0
  private bandLocked = false
  private targetLocked = false
  waveRadius = 0
  private waveOn = false

  constructor() {
    this.group.name = 'beast_fx'
    // 帯：+Z へのびる板（長さ 1、はば 1）。scale で長さ・はばを決める
    const bg = new THREE.PlaneGeometry(1, 1)
    bg.rotateX(-Math.PI / 2)
    bg.translate(0, 0, 0.5)
    this.bandTex = bandTexture()
    this.bandMat = new THREE.MeshBasicMaterial({ map: this.bandTex, color: new THREE.Color(1.6, 0.16, 0.1), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
    this.band = new THREE.Mesh(bg, this.bandMat)
    this.band.renderOrder = 4
    this.bandMat.polygonOffset = true
    this.bandMat.polygonOffsetFactor = -2
    this.bandMat.polygonOffsetUnits = -2
    this.band.visible = false
    this.band.frustumCulled = false
    // 地面の輪
    const rg = new THREE.RingGeometry(0.78, 1, 48)
    rg.rotateX(-Math.PI / 2)
    this.targetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.2, 0.9), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
    this.target = new THREE.Mesh(rg, this.targetMat)
    this.target.renderOrder = 4
    this.target.visible = false
    this.pillarMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.3), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
    this.pillarRing = new THREE.Mesh(rg, this.pillarMat)
    this.pillarRing.renderOrder = 4
    this.pillarRing.visible = false
    const bangTex = bangTexture()
    const bangMat = new THREE.SpriteMaterial({ map: bangTex, transparent: true, depthTest: false, toneMapped: false })
    this.bang = new THREE.Sprite(bangMat)
    this.bang.scale.setScalar(0.55)
    this.bang.renderOrder = 8
    this.bang.visible = false
    // 衝撃の輪
    const wg = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true)
    wg.translate(0, 0.5, 0)
    this.waveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 2.6), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    this.wave = new THREE.Mesh(wg, this.waveMat)
    this.wave.visible = false
    this.wave.renderOrder = 5
    this.wave.frustumCulled = false
    const wf = new THREE.RingGeometry(0.9, 1, 56)
    wf.rotateX(-Math.PI / 2)
    this.waveFloorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.4, 2.4), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
    this.waveFloor = new THREE.Mesh(wf, this.waveFloorMat)
    this.waveFloor.visible = false
    this.waveFloor.renderOrder = 5
    // 星
    const starTex = starTexture()
    this.starMat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, toneMapped: false })
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(this.starMat)
      s.scale.setScalar(0.34)
      s.visible = false
      this.stars.push(s)
      this.group.add(s)
    }
    // 土ぼこり
    const puffTex = puffTexture()
    this.puffMat = new THREE.SpriteMaterial({ map: puffTex, color: '#d8ccb8', transparent: true, depthWrite: false, opacity: 0.8 })
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(this.puffMat.clone())
      s.visible = false
      this.mats.push(s.material)
      this.puffs.push({ s, vel: new THREE.Vector3(), life: 0, t: 1, size: 1 })
      this.group.add(s)
    }
    this.group.add(this.band, this.target, this.pillarRing, this.bang, this.wave, this.waveFloor)
    this.mats.push(this.bandMat, this.targetMat, this.pillarMat, bangMat, this.waveMat, this.waveFloorMat, this.starMat, this.puffMat)
    this.geos.push(bg, rg, wg, wf)
    this.texs.push(this.bandTex, bangTex, starTex, puffTex)
  }

  /** 突進の帯を出す（from は獣の足元、(dx, dz) は向き、len は長さ、width ははば）。locked で向きが決まった（明るく点滅） */
  showBand(from: THREE.Vector3, dx: number, dz: number, len: number, width: number, locked: boolean): void {
    this.band.visible = true
    // 板の広場（高さ 0.06）でも石畳でも、床にうもれない高さ
    this.band.position.set(from.x, Math.max(from.y, 0.06) + 0.05, from.z)
    this.band.rotation.y = Math.atan2(dx, dz)
    this.band.scale.set(width, 1, Math.max(0.5, len))
    this.bandTex.repeat.set(1, Math.max(1, len / width) / 2)
    this.bandLocked = locked
  }

  hideBand(): void {
    this.band.visible = false
    this.bandMat.opacity = 0
  }

  /** 柱に「ここにぶつかる」の印（null で消す） */
  markPillar(at: THREE.Vector3 | null): void {
    this.pillarRing.visible = this.bang.visible = !!at
    if (!at) return
    this.pillarRing.position.set(at.x, 0.13, at.z)
    this.bang.position.set(at.x, at.y + 3.6, at.z)
  }

  /** とびかかりのねらいの輪（null で消す） */
  showTarget(at: THREE.Vector3 | null, radius = 1.6, locked = false): void {
    this.target.visible = !!at
    if (!at) return
    this.target.position.set(at.x, Math.max(at.y, 0.06) + 0.06, at.z)
    this.target.scale.setScalar(radius)
    this.targetLocked = locked
  }

  /** 衝撃の輪を始める（中心 at）。半径は waveRadius に入れて動かす */
  startWave(at: THREE.Vector3): void {
    this.waveOn = true
    this.waveRadius = 0.6
    this.wave.visible = this.waveFloor.visible = true
    this.wave.position.set(at.x, at.y + 0.02, at.z)
    this.waveFloor.position.set(at.x, Math.max(at.y, 0.06) + 0.06, at.z)
  }

  /** 衝撃の輪の半径・高さ・明るさ（stop で消す） */
  setWave(radius: number, height: number, alpha: number): void {
    this.waveRadius = radius
    this.wave.scale.set(radius, height, radius)
    this.waveFloor.scale.setScalar(radius)
    this.waveMat.opacity = alpha * 0.85
    this.waveFloorMat.opacity = alpha
  }

  stopWave(): void {
    this.waveOn = false
    this.wave.visible = this.waveFloor.visible = false
  }

  get waving(): boolean {
    return this.waveOn
  }

  /** 気絶の星（頭の上の点。null で消す） */
  setStars(at: THREE.Vector3 | null): void {
    this.starsOn = !!at
    if (at) this.starAt.copy(at)
    for (const s of this.stars) s.visible = this.starsOn
  }

  /** 土ぼこり（足元から n 個） */
  puff(at: THREE.Vector3, n = 6, spread = 0.8, size = 0.9): void {
    for (let k = 0; k < n; k++) {
      const p = this.puffs.find((q) => q.t >= q.life) ?? this.puffs[k % this.puffs.length]
      const a = Math.random() * Math.PI * 2
      p.s.position.set(at.x + Math.cos(a) * spread * 0.4, at.y + 0.2, at.z + Math.sin(a) * spread * 0.4)
      p.vel.set(Math.cos(a) * spread * 1.6, 0.6 + Math.random() * 0.8, Math.sin(a) * spread * 1.6)
      p.life = 0.6 + Math.random() * 0.4
      p.t = 0
      p.size = size * (0.7 + Math.random() * 0.6)
      p.s.visible = true
    }
  }

  update(dt: number): void {
    this.t += dt
    const t = this.t
    if (this.band.visible) {
      this.bandTex.offset.y = (this.bandTex.offset.y - dt * (this.bandLocked ? 2.4 : 0.9)) % 1
      this.bandMat.opacity = this.bandLocked ? 0.62 + 0.3 * (Math.sin(t * 26) > 0 ? 1 : 0) : 0.32 + 0.12 * Math.sin(t * 7)
    }
    if (this.target.visible) {
      this.targetMat.opacity = this.targetLocked ? 0.65 + 0.3 * (Math.sin(t * 24) > 0 ? 1 : 0) : 0.4 + 0.15 * Math.sin(t * 8)
      this.target.rotation.y += dt * 1.5
    }
    if (this.pillarRing.visible) {
      this.pillarMat.opacity = 0.55 + 0.35 * Math.sin(t * 14)
      this.pillarRing.scale.setScalar(0.7 + 0.15 * Math.sin(t * 7))
      this.bang.position.y += Math.sin(t * 9) * 0.004
    }
    if (this.starsOn) {
      for (let i = 0; i < this.stars.length; i++) {
        const a = t * 4.2 + (i / this.stars.length) * Math.PI * 2
        this.stars[i].position.set(this.starAt.x + Math.cos(a) * 0.55, this.starAt.y + Math.sin(a * 2) * 0.06, this.starAt.z + Math.sin(a) * 0.55)
      }
    }
    for (const p of this.puffs) {
      if (p.t >= p.life) continue
      p.t += dt
      const k = p.t / p.life
      p.s.position.addScaledVector(p.vel, dt)
      p.vel.multiplyScalar(Math.exp(-3 * dt))
      p.s.scale.setScalar(p.size * (0.5 + k))
      ;(p.s.material as THREE.SpriteMaterial).opacity = 0.75 * (1 - k)
      if (p.t >= p.life) p.s.visible = false
    }
  }

  /** 全部かくす（やられて戻ったとき・戦いのおわり） */
  clear(): void {
    this.hideBand()
    this.markPillar(null)
    this.showTarget(null)
    this.stopWave()
    this.setStars(null)
    for (const p of this.puffs) {
      p.t = p.life
      p.s.visible = false
    }
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const m of this.mats) m.dispose()
    for (const g of this.geos) g.dispose()
    for (const t of this.texs) t.dispose()
  }
}
