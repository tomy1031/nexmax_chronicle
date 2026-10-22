// 物語 v7.1：QR は物語の鍵。かんばん（IDO の石標）の板に、遠くからでも「QR だ」とわかる大きな QR を貼る。
// 読むときは、板の前に光る大きな QR（ホログラム）がうかんで、ネクマックスの目から光が当たり、読み取りの線が走る。
// 石が共鳴すると、QR のまわりが金色にふるえて、かんばんの絵が本物の景色につながる（kanbanSurge.ts・HUD の IDO パネル）。
import * as THREE from 'three'
import { makeCanvas } from '../../../render/textures'
import { drawQR } from '../artwork'
import type { IdoMarker } from '../ido'

const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif'

/** 板に貼る QR の絵（白い紙・太い QR・下に小さく「IDO で昔を見る」） */
function plateQr(seed: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(256, 300)
  g.fillStyle = '#f6f2e6'
  g.fillRect(0, 0, 256, 300)
  g.strokeStyle = '#1d6fd8'
  g.lineWidth = 10
  g.strokeRect(5, 5, 246, 290)
  drawQR(g, 30, 26, 196, seed, '#111111', '#f6f2e6')
  g.fillStyle = '#1d4f9c'
  g.font = `900 30px ${GOTHIC}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('IDO で 昔を見る', 128, 268)
  return c
}

/** うかぶ QR（暗い地に光る QR）。読み取るときだけ */
function holoQr(seed: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(256, 256)
  g.clearRect(0, 0, 256, 256)
  drawQR(g, 28, 28, 200, seed, '#d8fbff', 'rgba(10,60,90,0.55)')
  g.strokeStyle = 'rgba(160,240,255,0.95)'
  g.lineWidth = 6
  for (const [x, y, sx, sy] of [
    [8, 8, 1, 1],
    [248, 8, -1, 1],
    [8, 248, 1, -1],
    [248, 248, -1, -1],
  ]) {
    g.beginPath()
    g.moveTo(x, y + sy * 40)
    g.lineTo(x, y)
    g.lineTo(x + sx * 40, y)
    g.stroke()
  }
  return c
}

/** かんばんの板の向き（ido.ts と同じ：正面 = (sin y, 0, cos y)、板は後ろへ少し傾く） */
function plateRotation(yaw: number): THREE.Euler {
  const tilt = Math.atan2(0.18, 1.15)
  return new THREE.Euler(-tilt, yaw, 0, 'YXZ')
}

export class KanbanQr {
  readonly group = new THREE.Group()
  private readonly holo: THREE.Mesh
  private readonly holoMat: THREE.MeshBasicMaterial
  private readonly line: THREE.Mesh
  private readonly lineMat: THREE.MeshBasicMaterial
  private readonly mats: THREE.Material[] = []
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly texs: THREE.Texture[] = []
  private readonly up = new THREE.Vector3()
  private readonly center = new THREE.Vector3()
  private level = 0
  private target = 0
  private resonance = 0
  private t = 0

  /** markers：QR を貼るかんばん（yaw は KANBAN の向き）。holoOn：うかぶ QR を出すかんばん */
  constructor(markers: ReadonlyArray<{ marker: IdoMarker; yaw: number; seed: number }>, holoOn: { marker: IdoMarker; yaw: number; seed: number }) {
    this.group.name = 'kanban_qr'
    const g = new THREE.PlaneGeometry(0.46, 0.54)
    this.geos.push(g)
    for (const m of markers) {
      const tex = new THREE.CanvasTexture(plateQr(m.seed))
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18 })
      const mesh = new THREE.Mesh(g, mat)
      const rot = plateRotation(m.yaw)
      const nrm = new THREE.Vector3(0, 0, 1).applyEuler(rot)
      const up = new THREE.Vector3(0, 1, 0).applyEuler(rot)
      mesh.position.copy(m.marker.plate).addScaledVector(nrm, 0.012).addScaledVector(up, 0.07)
      mesh.rotation.copy(rot)
      this.group.add(mesh)
      this.mats.push(mat)
      this.texs.push(tex)
    }
    // うかぶ QR：板の前、少し上（目の高さ）。カメラからもよく見える大きさ
    const ht = new THREE.CanvasTexture(holoQr(holoOn.seed))
    ht.colorSpace = THREE.SRGBColorSpace
    this.holoMat = new THREE.MeshBasicMaterial({ map: ht, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(1.4, 1.8, 2.0) })
    const hg = new THREE.PlaneGeometry(0.86, 0.86)
    this.holo = new THREE.Mesh(hg, this.holoMat)
    const rot = new THREE.Euler(0, holoOn.yaw, 0)
    const front = new THREE.Vector3(Math.sin(holoOn.yaw), 0, Math.cos(holoOn.yaw))
    this.center.copy(holoOn.marker.plate).addScaledVector(front, 0.36).setY(holoOn.marker.plate.y + 0.72)
    this.holo.position.copy(this.center)
    this.holo.rotation.copy(rot)
    this.holo.visible = false
    this.holo.renderOrder = 7
    this.up.set(0, 1, 0)
    this.lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.8), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const lg = new THREE.PlaneGeometry(0.95, 0.04)
    this.line = new THREE.Mesh(lg, this.lineMat)
    this.line.rotation.copy(rot)
    this.line.visible = false
    this.line.renderOrder = 8
    this.group.add(this.holo, this.line)
    this.mats.push(this.holoMat, this.lineMat)
    this.geos.push(hg, lg)
    this.texs.push(ht)
  }

  /** うかぶ QR の中心（目からの光の行き先） */
  get holoCenter(): THREE.Vector3 {
    return this.center
  }

  /** うかぶ QR を出す（0〜1） */
  setHolo(v: number): void {
    this.target = v
  }

  /** 石が共鳴している（0〜1：金色にふるえる） */
  setResonance(v: number): void {
    this.resonance = v
  }

  update(dt: number): void {
    this.t += dt
    this.level += (this.target - this.level) * Math.min(1, dt * 6)
    const on = this.level > 0.01
    this.holo.visible = this.line.visible = on
    if (!on) return
    const r = this.resonance
    const wob = r * 0.025 * Math.sin(this.t * 40)
    this.holo.position.copy(this.center).addScaledVector(this.up, Math.sin(this.t * 2) * 0.03 + wob)
    this.holo.scale.setScalar(0.6 + 0.4 * this.level + r * 0.12)
    this.holoMat.opacity = this.level * (0.85 + 0.15 * Math.sin(this.t * 12))
    this.holoMat.color.setRGB(1.4 + r * 1.4, 1.8 + r * 0.6, 2.0 - r * 1.2)
    const k = Math.sin(this.t * 3.4)
    this.line.position.copy(this.holo.position).addScaledVector(this.up, k * 0.38 * this.holo.scale.y)
    this.lineMat.opacity = this.level * 0.9
  }

  dispose(): void {
    for (const m of this.mats) m.dispose()
    for (const g of this.geos) g.dispose()
    for (const t of this.texs) t.dispose()
  }
}
