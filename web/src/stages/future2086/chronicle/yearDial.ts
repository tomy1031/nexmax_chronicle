// ソラのわっか（IDO のリング）の年代ダイヤル（物語 v7 の 8 章から現れる。2027 年にマツイ社長がつけた機能）。
// リングの右下に腕で取りつけた丸いダイヤル：回る目もりの輪・年の小窓・石の音と記録の音がそろうと光る外の輪。
// ・setDial(visible)：出す／しまう（ぽんと現れる）　・setYear(y)：目もりが回り、小窓の年が変わる　・setMatch(k)：そろうと光る
import * as THREE from 'three'
import { F } from '../layout'
import { additive, canvasTexture, font, softDotTexture } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type YearDial3D = {
  group: THREE.Group
  /** ダイヤルの中心（ワールド。カメラで寄る所） */
  center: THREE.Vector3
  /** ダイヤルの正面（ワールドの向き） */
  normal: THREE.Vector3
  readonly visible: boolean
  setDial(visible: boolean, instant?: boolean): void
  setYear(y: number): void
  setMatch(k: number): void
  update(dt: number): void
}

function paintTicks(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const R = w / 2
  g.fillStyle = '#16245c'
  g.beginPath()
  g.arc(cx, cy, R - 2, 0, Math.PI * 2)
  g.fill()
  // 100 本の目もり（10 本ごとに長い）と、年代の数字
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2
    const big = i % 10 === 0
    g.strokeStyle = big ? '#ffe08a' : '#8fe6ff'
    g.lineWidth = big ? 6 : 3
    const r0 = R * (big ? 0.72 : 0.8)
    g.beginPath()
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0)
    g.lineTo(cx + Math.sin(a) * R * 0.92, cy - Math.cos(a) * R * 0.92)
    g.stroke()
  }
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, Math.round(R * 0.11))
  const labels = ['2086', '1970', '2026', '1726', '1186', '1500', '1900', '1632', '2050', '1300']
  labels.forEach((t, i) => {
    const a = (i / 10) * Math.PI * 2
    g.save()
    g.translate(cx + Math.sin(a) * R * 0.58, cy - Math.cos(a) * R * 0.58)
    g.rotate(a)
    g.fillText(t, 0, 0)
    g.restore()
  })
  g.fillStyle = '#26346e'
  g.beginPath()
  g.arc(cx, cy, R * 0.42, 0, Math.PI * 2)
  g.fill()
}

function paintYear(g: CanvasRenderingContext2D, w: number, h: number, year: number, k: number): void {
  g.clearRect(0, 0, w, h)
  g.fillStyle = '#0a1636'
  g.beginPath()
  g.roundRect(4, 4, w - 8, h - 8, 22)
  g.fill()
  g.strokeStyle = k > 0.95 ? '#ffe08a' : '#8fe6ff'
  g.lineWidth = 6
  g.stroke()
  g.fillStyle = k > 0.95 ? '#fff3c4' : '#dff6ff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, Math.round(h * 0.58))
  g.fillText(`${year}年`, w / 2, h * 0.54)
}

export function buildYearDial(root: THREE.Group): YearDial3D {
  const P = F.PORTAL
  const ring = new THREE.Matrix4().compose(v(P.x, P.y, P.z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), P.yaw), v(1, 1, 1))
  const normal = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
  // リングの右下（正面から見て）に腕で取りつける
  const local = v(P.r + 0.62, -1.05, 0.32)
  const center = local.clone().applyMatrix4(ring)
  const group = new THREE.Group()
  group.name = 'year_dial'
  group.position.copy(center)
  group.rotation.y = P.yaw
  root.add(group)
  const inner = new THREE.Group()
  group.add(inner)

  const white = new THREE.MeshStandardMaterial({ color: '#f4f6f9', roughness: 0.35, metalness: 0.05 })
  const navy = new THREE.MeshStandardMaterial({ color: '#26346e', roughness: 0.25, metalness: 0.3 })
  const brass = new THREE.MeshStandardMaterial({ color: '#d6a84e', roughness: 0.3, metalness: 0.85 })
  // 腕（リングの外周 → ダイヤル）
  const armFrom = v(P.r + 0.2, -0.75, 0.0).applyMatrix4(ring)
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), white)
  {
    const a = armFrom.clone().sub(center)
    const len = a.length()
    arm.scale.y = len
    arm.position.copy(center).add(armFrom).multiplyScalar(0.5).sub(center)
    arm.quaternion.setFromUnitVectors(v(0, 1, 0), a.normalize())
    // group の回転を打ち消してワールドの向きにする
    arm.position.applyAxisAngle(v(0, 1, 0), -P.yaw)
    arm.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), -P.yaw))
  }
  inner.add(arm)
  // 台（白い円盤）・回る目もりの輪・中央のつまみ
  const R = 0.42
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.08, 0.12, 40), white)
  base.rotation.x = Math.PI / 2
  inner.add(base)
  const tickTex = canvasTexture(512, 512, paintTicks, 8)
  const ticks = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: tickTex, emissiveMap: tickTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.7, roughness: 0.4 }))
  ticks.position.z = 0.065
  inner.add(ticks)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 24), brass)
  knob.rotation.x = Math.PI / 2
  knob.position.z = 0.1
  inner.add(knob)
  for (let i = 0; i < 12; i++) {
    // つまみのぎざぎざ（つまみの軸＝ローカル y に沿う）
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), brass)
    const a = (i / 12) * Math.PI * 2
    g.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14)
    knob.add(g)
  }
  // 上の印（▼）
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), navy)
  pointer.rotation.z = Math.PI
  pointer.position.set(0, R + 0.1, 0.07)
  inner.add(pointer)
  // 年の小窓（ダイヤルの下）
  const yc = document.createElement('canvas')
  yc.width = 512
  yc.height = 160
  const yg = yc.getContext('2d') as CanvasRenderingContext2D
  const yearTex = new THREE.CanvasTexture(yc)
  yearTex.colorSpace = THREE.SRGBColorSpace
  const yearWin = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.2), new THREE.MeshBasicMaterial({ map: yearTex, toneMapped: false, transparent: true }))
  yearWin.position.set(0, -R - 0.2, 0.07)
  inner.add(yearWin)
  const winBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.06), white)
  winBack.position.set(0, -R - 0.2, 0.03)
  inner.add(winBack)
  // そろうと光る外の輪・後光
  const glowMat = additive(new THREE.Color(1.6, 1.3, 0.5), 0)
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.07, 0.025, 8, 48), glowMat)
  glowRing.position.z = 0.07
  inner.add(glowRing)
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), additive(new THREE.Color(0.9, 1.0, 1.6), 0, softDotTexture()))
  halo.position.z = 0.02
  halo.renderOrder = 4
  inner.add(halo)
  const idle = additive(new THREE.Color(0.35, 1.3, 2.2), 0.8)
  const idleRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.07, 0.012, 6, 48), idle)
  idleRing.position.z = 0.068
  inner.add(idleRing)
  inner.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })

  let shown = false
  let k = 0
  let target = 0
  let year = 2086
  let match = 0
  const redraw = () => {
    paintYear(yg, yc.width, yc.height, year, match)
    yearTex.needsUpdate = true
  }
  redraw()
  group.visible = false
  inner.scale.setScalar(0.001)
  return {
    group,
    center: center.clone(),
    normal,
    get visible() {
      return shown
    },
    setDial(vis: boolean, instant = false) {
      shown = vis
      target = vis ? 1 : 0
      if (instant) k = target
      group.visible = vis || k > 0.001
    },
    setYear(y: number) {
      year = Math.round(y)
      // 100 年で 1 回り
      ticks.rotation.z = (year / 100) * Math.PI * 2
      knob.rotation.y = year * 0.35
      redraw()
    },
    setMatch(m: number) {
      const changed = (m > 0.95) !== (match > 0.95)
      match = m
      glowMat.opacity = m
      ;(halo.material as THREE.MeshBasicMaterial).opacity = m * 0.55
      if (changed) redraw()
    },
    update(dt: number) {
      k += (target - k) * Math.min(1, dt * 7)
      const s = k < 0.001 ? 0.001 : k * (1 + 0.12 * Math.sin(k * Math.PI))
      inner.scale.setScalar(s)
      group.visible = shown || k > 0.01
      idle.opacity = 0.5 + 0.3 * Math.sin(performance.now() * 0.004)
    },
  }
}
