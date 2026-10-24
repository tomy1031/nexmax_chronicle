// 9 章の夜（物語 v7.2）：空き地の IDO のかんばん（3 本）と、「江戸の朝」の光の輪。しくみは lightLogic.ts。
// ・かんばん：細い柱の上に IDO の画面（ふだんは IDO と QR。光らせると江戸の朝の景色）、柱の横にスイッチの箱
//   （黄色いレバー＝J でつかんで引く・箱をたたく＝K。上の小さなランプ：緑＝使える・赤＝ためている）
// ・光の輪：かんばんの前の地面に、朝日の格子の光だまり・ふちの光の幕・かんばんからの光の円すい
// ・使えるかんばんの前には、うすい点線の輪（ここに影が来たら光らせる）。社長が教えるかんばんは明るく、
//   大きな影が輪の中にいるときは、点線が金色にまたたく（「今や！」）
// 静かな部品（柱・台・箱）はシーンの Batch に積み（当たり判定も）、動く部品（画面・レバー・ランプ・輪）はこの group。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { ClawTargetDef } from '../../../player/clawLogic'
import { makeCanvas } from '../../../render/textures'
import { box, cyl, type NCtx } from '../kit'
import { drawQR } from '../artwork'
import { drawMarkWhite } from './brandArt'
import { paintEdoMorning } from './recordArt'
import { LIGHT_TUNING, LightPostLogic, type PostState } from './lightLogic'

export type LightPostDef = {
  id: string
  /** 柱の足もと */
  pos: THREE.Vector3
  /** 画面の向き（正面 = (sin yaw, 0, cos yaw)） */
  yaw: number
}

const ringVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
// 板のふち（半径 1）＝ 光の輪の半径 × 1.25。光は R_IN の中
const ringFrag = /* glsl */ `
uniform float uLevel;
uniform float uZone;
uniform float uNow;
uniform float uTime;
varying vec2 vUv;
const float R_IN = 0.8;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float rr = R_IN * uLevel;
  // 光だまり（朝日が格子窓を通った縞）
  float pool = smoothstep(rr, rr - 0.25, r) * step(0.001, uLevel);
  float lattice = 0.7 + 0.3 * step(0.5, fract((p.x + p.y * 0.35) * 7.0));
  float edge = exp(-pow((r - rr) / 0.035, 2.0)) * step(0.001, uLevel);
  vec3 col = vec3(1.0, 0.7, 0.36) * pool * lattice * 0.5 + vec3(1.35, 0.98, 0.5) * edge * 0.9;
  // 使えるかんばんの前の点線の輪（ここに影が来たら光らせる）。uNow：影が中にいる（金色にまたたく）
  float ang = atan(p.y, p.x);
  float dash = step(0.45, fract(ang * 6.0 / 3.14159 + uTime * 0.25));
  float ring = exp(-pow((r - R_IN) / 0.022, 2.0)) * dash;
  float blink = 0.6 + 0.4 * sin(uTime * 12.0);
  vec3 zc = mix(vec3(0.55, 0.85, 1.0), vec3(1.4, 1.1, 0.4) * blink, uNow);
  col += zc * ring * uZone * (1.0 - uLevel);
  // 影が中にいるときは、輪の中もうっすら金色
  col += vec3(1.0, 0.8, 0.3) * smoothstep(R_IN, R_IN - 0.3, r) * 0.12 * uNow * uZone * blink * (1.0 - uLevel);
  gl_FragColor = vec4(col, 1.0);
}
`

const curtainVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const curtainFrag = /* glsl */ `
uniform float uLevel;
uniform float uTime;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 1.8);
  float rays = 0.65 + 0.35 * sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.x * 23.0 - uTime * 1.3);
  gl_FragColor = vec4(vec3(1.2, 0.95, 0.55) * fade * rays * 0.5 * uLevel, 1.0);
}
`

type Post = {
  def: LightPostDef
  logic: LightPostLogic
  front: THREE.Vector3
  center: THREE.Vector3
  /** スイッチの箱（K の当たり・J の的） */
  switchAt: THREE.Vector3
  claw: ClawTargetDef
  lever: THREE.Group
  leverT: number
  lamp: THREE.Mesh
  screenLit: THREE.Mesh
  ring: THREE.Mesh
  ringU: { uLevel: { value: number }; uZone: { value: number }; uNow: { value: number }; uTime: { value: number } }
  curtain: THREE.Mesh
  curtainU: { uLevel: { value: number }; uTime: { value: number } }
  cone: THREE.Mesh
  zone: number
  now: number
  zoneWant: number
  nowWant: number
}

/** ふだんの画面（IDO の文字・QR・NEXTMAKE の印。夜は青白く光る） */
function paintIdleScreen(): HTMLCanvasElement {
  const [c, g] = makeCanvas(256, 192)
  const gr = g.createLinearGradient(0, 0, 0, 192)
  gr.addColorStop(0, '#0d2040')
  gr.addColorStop(1, '#16345e')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 192)
  g.fillStyle = '#9fe0ff'
  g.font = '900 54px "Hiragino Sans","Noto Sans JP",sans-serif'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText('IDO', 18, 52)
  g.font = '700 17px "Hiragino Sans","Noto Sans JP",sans-serif'
  g.fillStyle = '#e8f6ff'
  g.fillText('むかしの景色', 20, 100)
  g.fillText('江戸の朝', 20, 124)
  drawQR(g, 150, 30, 86, 31, '#0d2040', '#e8f6ff')
  drawMarkWhite(g, 40, 160, 34)
  g.strokeStyle = '#9fe0ff'
  g.lineWidth = 4
  g.strokeRect(2, 2, 252, 188)
  return c
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export class LightPosts {
  readonly group = new THREE.Group()
  private readonly posts: Post[] = []
  private armed = false
  private readonly idleTex: THREE.CanvasTexture
  private readonly litTex: THREE.CanvasTexture
  private readonly owned: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = []

  /** 静かな部品を c（Batch・当たり判定）へ積み、動く部品を group に作る */
  constructor(c: NCtx, defs: readonly LightPostDef[]) {
    this.group.name = 'v7_light_posts'
    this.idleTex = new THREE.CanvasTexture(paintIdleScreen())
    this.idleTex.colorSpace = THREE.SRGBColorSpace
    this.litTex = new THREE.CanvasTexture(paintEdoMorning(384, 288, 7))
    this.litTex.colorSpace = THREE.SRGBColorSpace
    const screenGeo = new THREE.PlaneGeometry(0.84, 0.63)
    const idleMat = new THREE.MeshStandardMaterial({ map: this.idleTex, emissiveMap: this.idleTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.35, name: 'v7_post_screen' })
    const litMat = new THREE.MeshBasicMaterial({ map: this.litTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const ringGeo = new THREE.PlaneGeometry(2, 2)
    const R = LIGHT_TUNING.radius
    const curtainGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true)
    curtainGeo.translate(0, 0.5, 0)
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true)
    const leverMat = new THREE.MeshStandardMaterial({ color: '#f2c84b', roughness: 0.4, metalness: 0.2 })
    const knobMat = new THREE.MeshStandardMaterial({ color: '#d8281c', roughness: 0.35 })
    const coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    this.owned.push(this.idleTex, this.litTex, screenGeo, idleMat, ringGeo, curtainGeo, coneGeo, leverMat, knobMat)
    defs.forEach((d, i) => {
      const front = v(Math.sin(d.yaw), 0, Math.cos(d.yaw))
      const side = v(Math.cos(d.yaw), 0, -Math.sin(d.yaw))
      const p = d.pos
      // 台・柱・画面の枠（静か）
      c.b.add(rbox(0.5, 0.14, 0.42, 0.02), c.m.concrete, M(p.x, 0.07, p.z, 0, d.yaw, 0), { tint: '#c8c4bc' })
      cyl(c, p.x, 0.14, 1.62, p.z, 0.045, c.m.metal, { tint: '#2a2f38', seg: 10 })
      const scr = v(p.x, 1.9, p.z).addScaledVector(front, 0.05)
      c.b.add(rbox(0.94, 0.73, 0.07, 0.02), c.m.metal, M(scr.x - front.x * 0.04, scr.y, scr.z - front.z * 0.04, -0.12, d.yaw, 0), { tint: '#e8ecf2' })
      c.col.box(p.x, 0.9, p.z, 0.36, 1.8, 0.36)
      // スイッチの箱（柱の横）
      const sw = v(p.x, 0.95, p.z).addScaledVector(side, 0.17).addScaledVector(front, 0.02)
      box(c, sw.x, sw.y, sw.z, 0.2, 0.28, 0.14, c.m.paint, { tint: '#3a4a64', rotY: d.yaw })
      // 画面（ふだん）と、光らせたときの江戸の朝（上にかさねる）
      const screen = new THREE.Mesh(screenGeo, idleMat)
      screen.position.copy(scr).addScaledVector(front, 0.001)
      screen.rotation.set(-0.12, d.yaw, 0, 'YXZ')
      const lit = new THREE.Mesh(screenGeo, litMat.clone())
      lit.position.copy(scr).addScaledVector(front, 0.006)
      lit.rotation.copy(screen.rotation)
      lit.renderOrder = 5
      this.owned.push(lit.material as THREE.Material)
      // レバー（箱の前から、黄色い取っ手）
      const lever = new THREE.Group()
      lever.position.copy(sw).addScaledVector(front, 0.08)
      lever.rotation.y = d.yaw
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), leverMat)
      arm.position.y = 0.11
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), knobMat)
      knob.position.y = 0.22
      lever.add(arm, knob)
      this.owned.push(arm.geometry, knob.geometry)
      // ランプ（箱の上）
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: '#4dff7a', toneMapped: false }))
      lamp.position.copy(sw).setY(sw.y + 0.18)
      this.owned.push(lamp.geometry, lamp.material as THREE.Material)
      // 光の輪（地面）・ふちの光の幕・かんばんからの光の円すい
      const center = p.clone().addScaledVector(front, R + 0.35).setY(0)
      const ringU = { uLevel: { value: 0 }, uZone: { value: 0 }, uNow: { value: 0 }, uTime }
      const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }))
      ring.rotation.x = -Math.PI / 2
      ring.position.copy(center).setY(0.035)
      ring.scale.setScalar(R / 0.8)
      ring.renderOrder = 4
      ring.frustumCulled = false
      const curtainU = { uLevel: { value: 0 }, uTime }
      const curtain = new THREE.Mesh(curtainGeo, new THREE.ShaderMaterial({ uniforms: curtainU, vertexShader: curtainVert, fragmentShader: curtainFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }))
      curtain.position.copy(center)
      curtain.scale.set(R, 1.3, R)
      curtain.renderOrder = 5
      curtain.visible = false
      // 円すい：とがった先（+Y）を画面へ、底を光の輪へ
      const cone = new THREE.Mesh(coneGeo, coneMat.clone())
      const dir = scr.clone().sub(center)
      const len = dir.length()
      cone.position.copy(center).lerp(scr, 0.5)
      cone.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize())
      cone.scale.set(R * 0.85, len, R * 0.85)
      cone.renderOrder = 5
      cone.visible = false
      this.owned.push(ring.material as THREE.Material, curtain.material as THREE.Material, cone.material as THREE.Material)
      // J の的（スイッチのレバー）
      const claw: ClawTargetDef = {
        id: `${d.id}_switch`,
        type: 'hold_mechanism',
        label: 'かんばんのスイッチ',
        point: sw.clone().addScaledVector(front, 0.12).setY(sw.y + 0.15),
        radius: 0.3,
        enabled: false,
        noLineOfSight: true,
        range: 13,
      }
      this.group.add(screen, lit, lever, lamp, ring, curtain, cone)
      this.posts.push({ def: d, logic: new LightPostLogic(), front, center, switchAt: sw, claw, lever, leverT: 0, lamp, screenLit: lit, ring, ringU, curtain, curtainU, cone, zone: 0, now: 0, zoneWant: 0, nowWant: 0 })
      void i
    })
    this.setArmed(false)
  }

  get count(): number {
    return this.posts.length
  }

  /** 光の輪の真ん中（地面） */
  center(i: number): THREE.Vector3 {
    return this.posts[i].center
  }

  /** スイッチの箱の位置（K の当たり） */
  switchAt(i: number): THREE.Vector3 {
    return this.posts[i].switchAt
  }

  /** かんばんの画面の上（目印を出す所） */
  top(i: number): THREE.Vector3 {
    const p = this.posts[i].def.pos
    return v(p.x, 2.35, p.z)
  }

  /** J の的（スイッチ）。ステージが claw.targets に足す */
  get clawTargets(): ClawTargetDef[] {
    return this.posts.map((p) => p.claw)
  }

  indexOfClaw(def: ClawTargetDef): number {
    return this.posts.findIndex((p) => p.claw === def)
  }

  state(i: number): PostState {
    return this.posts[i].logic.state
  }

  logic(i: number): LightPostLogic {
    return this.posts[i].logic
  }

  /** 使えるようにする（社長が「江戸の朝」を送ったあと）。false で全部消して使えなくする */
  setArmed(on: boolean): void {
    this.armed = on
    for (const p of this.posts) {
      p.claw.enabled = on
      if (!on) p.logic.reset()
      p.zoneWant = 0
      p.nowWant = 0
    }
  }

  get isArmed(): boolean {
    return this.armed
  }

  /** 社長が教えるかんばん（best。-1 でなし）と、影がその輪の中にいる（now） */
  setHint(best: number, now: boolean): void {
    this.posts.forEach((p, i) => {
      const ready = this.armed && p.logic.state === 'ready'
      p.zoneWant = ready ? (i === best ? 1 : 0.35) : 0
      p.nowWant = ready && i === best && now ? 1 : 0
    })
  }

  /** 光らせる（使えるときだけ）。光らせたら true */
  trigger(i: number): boolean {
    const p = this.posts[i]
    if (!this.armed || !p) return false
    if (!p.logic.trigger()) return false
    p.leverT = 0.001
    return true
  }

  /** 進める。広がりきった・消えた・また使えるようになった、を返す */
  update(dt: number, t: number): Array<{ i: number; ev: 'lit' | 'off' | 'ready' }> {
    const out: Array<{ i: number; ev: 'lit' | 'off' | 'ready' }> = []
    this.posts.forEach((p, i) => {
      const ev = p.logic.update(dt)
      if (ev) out.push({ i, ev })
      const k = p.logic.level
      p.ringU.uLevel.value = k
      p.zone += (p.zoneWant - p.zone) * Math.min(1, dt * 6)
      p.now += (p.nowWant - p.now) * Math.min(1, dt * 10)
      p.ringU.uZone.value = p.zone
      p.ringU.uNow.value = p.now
      p.curtainU.uLevel.value = k
      p.curtain.visible = k > 0.01
      p.curtain.scale.set(LIGHT_TUNING.radius * Math.max(0.05, k) * 0.98, 1.3, LIGHT_TUNING.radius * Math.max(0.05, k) * 0.98)
      const cm = p.cone.material as THREE.MeshBasicMaterial
      cm.opacity = 0.13 * k * (0.9 + 0.1 * Math.sin(t * 7 + i))
      p.cone.visible = k > 0.01
      ;(p.screenLit.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 1.4)
      // ランプ：緑＝使える・白＝光っている・赤＝ためている（ためるほど黄色へ）
      const lm = p.lamp.material as THREE.MeshBasicMaterial
      if (!this.armed) lm.color.setRGB(0.15, 0.2, 0.25)
      else if (p.logic.state === 'ready') lm.color.setRGB(0.3, 1.6, 0.5).multiplyScalar(0.8 + 0.2 * Math.sin(t * 5 + i))
      else if (p.logic.state === 'cool') lm.color.setRGB(1.5, 0.25 + p.logic.charge * 0.9, 0.1)
      else lm.color.setRGB(1.6, 1.4, 1.0)
      // レバー：引くと下へたおれて、もどる
      if (p.leverT > 0) {
        p.leverT += dt
        const a = p.leverT < 0.15 ? p.leverT / 0.15 : Math.max(0, 1 - (p.leverT - 0.6) / 0.4)
        p.lever.rotation.set(-a * 1.2, p.def.yaw, 0, 'YXZ')
        if (p.leverT > 1.0) {
          p.leverT = 0
          p.lever.rotation.set(0, p.def.yaw, 0)
        }
      }
    })
    return out
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.owned.length = 0
  }
}

/** 空き地の 3 本の置き場所（足もと・画面の向き）。layoutV7.ts の LOT の中。光の輪は前へ 2.35 m */
export function lightPostSpots(): LightPostDef[] {
  return [
    // 北西：路地の口の西、ビールケースのとなり（光の輪は、ほこらの前の北東）
    { id: 'v7_post_nw', pos: v(14.55, 0, 20.3), yaw: 0.6 },
    // 東：物置の南のかど（光の輪は、空き地の東）
    { id: 'v7_post_e', pos: v(20.55, 0, 25.6), yaw: -Math.PI / 2 - 0.2 },
    // 南西：長屋の前、大きな木の東（光の輪は、ほこらの前の南東）
    { id: 'v7_post_sw', pos: v(13.4, 0, 27.15), yaw: 2.45 },
  ]
}
