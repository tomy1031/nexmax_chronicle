// 「時を裂く爪」（7 章で源兵衛がひと晩でつくる、クローの先にはめる部品）と、石とかけらの音の波形（画面の上）。
// ・TimeClawProp：真ちゅうの歯車の輪に、青いかけらの爪が 3 本。小さな針の目もり（setCharge で針が進む）。
//   7 章（朝日で針が少しだけ動く）・10 章（360 年分の朝日で目もりがいっぱい）で使える
// ・ResonanceWave：背中の石とかけらの音の波（2 本）。近づくほど波がそろい、重なると光る（7 章の木の箱・ほこらの錠前）
import * as THREE from 'three'
import { gearGeometry } from './parts'
import { shardGeometry, shardMaterial, softGlowTexture } from './workshop'

export class TimeClawProp {
  readonly root = new THREE.Group()
  private readonly needle: THREE.Mesh
  private readonly shardMat: THREE.MeshStandardMaterial
  private readonly glow: THREE.Sprite
  private readonly ring: THREE.Mesh
  private charge = 0
  private chargeWant = 0
  private glowK = 0
  private t = 0

  constructor() {
    const brass = new THREE.MeshStandardMaterial({ color: '#c8963c', roughness: 0.32, metalness: 0.9 })
    const dark = new THREE.MeshStandardMaterial({ color: '#2a1c14', roughness: 0.4 })
    const face = new THREE.MeshStandardMaterial({ color: '#f2e8d0', roughness: 0.6 })
    this.shardMat = shardMaterial()
    // 歯車の輪（クローの手首にはまる）
    this.ring = new THREE.Mesh(gearGeometry(0.06, 0.02, 14), brass)
    this.root.add(this.ring)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), dark)
    hub.rotation.x = Math.PI / 2
    this.root.add(hub)
    // 爪（青いかけら 3 本。前 = -Z へ）
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      const arm = new THREE.Group()
      arm.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.01)
      arm.rotation.set(-Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0)
      const s = new THREE.Mesh(shardGeometry(0.09), this.shardMat)
      s.rotation.set(0, Math.PI / 2, a)
      s.position.z = -0.045
      arm.add(s)
      this.root.add(arm)
    }
    // 針の目もり（上に小さな丸い文字盤）
    const dial = new THREE.Group()
    dial.position.set(0, 0.085, 0.0)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 18), face)
    disc.rotation.x = Math.PI / 2
    dial.add(disc)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 5, 18), brass)
    dial.add(rim)
    // 目もり（左下から右下まで 270°）
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 1.25 - (i / 8) * Math.PI * 1.5
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.006, 0.002), dark)
      tick.position.set(Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.006)
      tick.rotation.z = a - Math.PI / 2
      dial.add(tick)
    }
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.02, 0.002), new THREE.MeshBasicMaterial({ color: '#d8302a' }))
    this.needle.geometry.translate(0, 0.009, 0)
    this.needle.position.z = -0.007
    dial.add(this.needle)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), brass)
    stem.position.y = -0.03
    dial.add(stem)
    this.root.add(dial)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#6ab8ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    this.glow.position.z = -0.06
    this.glow.scale.setScalar(0.35)
    this.root.add(this.glow)
    this.root.name = 'time_claw'
    this.setCharge(0, true)
  }

  /** 針の目もり（0〜1）。instant でその場で、でなければゆっくり進む */
  setCharge(k: number, instant = false): void {
    this.chargeWant = Math.max(0, Math.min(1, k))
    if (instant) this.charge = this.chargeWant
  }

  get chargeValue(): number {
    return this.charge
  }

  /** 爪の光（0〜1） */
  setGlow(k: number): void {
    this.glowK = k
  }

  update(dt: number): void {
    this.t += dt
    this.charge += (this.chargeWant - this.charge) * Math.min(1, dt * 1.2)
    this.needle.rotation.z = Math.PI * 0.75 - this.charge * Math.PI * 1.5
    this.shardMat.emissiveIntensity = 0.6 + this.glowK * (2 + Math.sin(this.t * 6))
    ;(this.glow.material as THREE.SpriteMaterial).opacity = this.glowK * 0.8
    this.ring.rotation.z += dt * (0.5 + this.glowK * 4)
  }
}

/** 石とかけらの音の波形（画面の上のまんなか）。k：そろい具合（0〜1） */
export class ResonanceWave {
  private readonly el: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private k = 0
  private want = 0
  private shown = 0
  private t = 0

  constructor(host: HTMLElement) {
    this.el = document.createElement('canvas')
    this.el.width = 360
    this.el.height = 90
    this.el.style.cssText = 'position:absolute;left:50%;top:76px;transform:translateX(-50%);width:360px;height:90px;pointer-events:none;opacity:0;transition:opacity 0.4s;z-index:3;border-radius:14px;background:rgba(10,20,44,0.55);'
    this.g = this.el.getContext('2d') as CanvasRenderingContext2D
    host.appendChild(this.el)
  }

  /** 出す（k はそろい具合 0〜1）。null で隠す */
  set(k: number | null): void {
    if (k === null) {
      this.want = 0
      return
    }
    this.want = 1
    this.k = Math.max(0, Math.min(1, k))
  }

  update(dt: number): void {
    this.t += dt
    this.shown += (this.want - this.shown) * Math.min(1, dt * 6)
    this.el.style.opacity = this.shown.toFixed(2)
    if (this.shown < 0.02) return
    const g = this.g
    const W = this.el.width
    const H = this.el.height
    g.clearRect(0, 0, W, H)
    g.font = '700 12px "M PLUS Rounded 1c", sans-serif'
    g.fillStyle = 'rgba(200,230,255,0.85)'
    g.fillText('背中の石', 12, 18)
    g.fillText('青いかけら', W - 80, 18)
    const match = this.k
    // 2 本の波：近づくほど速さと位相がそろう
    const wave = (phase: number, freq: number, color: string, width: number) => {
      g.strokeStyle = color
      g.lineWidth = width
      g.beginPath()
      for (let x = 0; x <= W - 24; x += 3) {
        const u = x / (W - 24)
        const y = H / 2 + 6 + Math.sin(u * Math.PI * 2 * freq + phase) * 20 * (0.6 + 0.4 * Math.sin(this.t * 4))
        if (x === 0) g.moveTo(12 + x, y)
        else g.lineTo(12 + x, y)
      }
      g.stroke()
    }
    const base = this.t * 6
    wave(base, 3, 'rgba(110,200,255,0.95)', 3)
    wave(base + (1 - match) * 2.4, 3 + (1 - match) * 1.6, `rgba(255,${Math.round(200 + 55 * match)},120,0.9)`, 2)
    if (match > 0.92) {
      g.fillStyle = 'rgba(255,255,255,0.9)'
      g.font = '800 14px "M PLUS Rounded 1c", sans-serif'
      g.fillText('同じ音！', W / 2 - 28, 18)
    }
  }

  dispose(): void {
    this.el.remove()
  }
}
