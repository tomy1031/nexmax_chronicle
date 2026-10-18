// 2086年 時代博覧祭の「ここを見て」のカメラ（シェルの rt.cinematic に渡す CineShot）の表。
// 物語（future2086Story）が { kind: 'focus', target } を出すと、アダプタがこの表からショットを作って再生する。
// ・lens：箱の山の一番上の共鳴レンズのケース（低い位置から山の高さを見せ、ゆっくりケースへ寄る）
// ・hook：西の回廊の縁の街灯の金具
// ・ring：西の回廊 → 途切れた北の回廊 → アーチから下がる光る輪へパン（振り子の軌道を点線で見せる）
// ・sky ：夜の広場から空へ見上げる（空が裂けて正体不明の存在が出てくる演出 emergence2086.ts が使う）
// ・street：南の入口の街頭ビジョン（毎朝の日付とニュース）　・balloon：子どもの風船が同じ街灯に引っかかる
// short（2 回目以降・時間が経ったときの見せ直し）は、パンを省いて短く、飛ばせるショットにする。
import * as THREE from 'three'
import type { CineShot } from '../../game/cinematic'
import { mulberry32 } from '../../render/noise'
import { uTime } from '../../render/materials'
import { F, HOOK, SWING } from './layout'
import { INTRO_LAYOUT } from './introProps2086'

export type FocusId = 'lens' | 'hook' | 'ring' | 'sky' | 'antenna' | 'screen' | 'street' | 'balloon' | 'exhibit' | 'install'

export const FOCUS_IDS: readonly FocusId[] = ['lens', 'hook', 'ring', 'sky', 'antenna', 'screen', 'street', 'balloon', 'exhibit', 'install']

export type FocusContext = {
  /** プレイヤーの足元 */
  player: THREE.Vector3
  /** 共鳴レンズのケースのいまの位置（動かせる物なので） */
  lens: THREE.Vector3
  /** ソラの足元（sky で二人を手前に入れる） */
  sora?: THREE.Vector3
  /** 短い版（パンなし・飛ばせる） */
  short: boolean
  /** exhibit：読んでいる石標の足元 */
  stone?: THREE.Vector3
}

/** 目印の色（照準が黄色に変わる＝ねらえる、に合わせた金色） */
export const FOCUS_MARK_COLOR = '#ffd447'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 目印の札（プレイヤーに見せる日本語） */
export const FOCUS_LABELS: Record<FocusId, string | null> = {
  lens: '共鳴レンズのケース',
  hook: '回廊の金具',
  ring: '光る輪',
  sky: null,
  antenna: '中継アンテナ',
  screen: null,
  street: null,
  balloon: null,
  exhibit: null,
  install: null,
}

function timing(short: boolean, hold: number): Pick<CineShot, 'inSec' | 'hold' | 'outSec' | 'skippable'> {
  return short ? { inSec: 1.1, hold: Math.min(hold, 1.6), outSec: 1.0, skippable: true } : { inSec: 2.0, hold, outSec: 1.6, skippable: false }
}

/** 表：id → ショットを作る関数（呼ぶたびに新しい Vector3 を作るので、受け取った側が動かしてよい） */
const BASE_SHOTS: Record<'lens' | 'hook' | 'ring' | 'sky', (c: FocusContext) => CineShot> = {
  lens: (c) => {
    const mark = c.lens.clone().add(v(0, 0.38, 0))
    const near = { from: v(-9.0, 3.4, -9.5), look: c.lens.clone().add(v(0, -0.15, 0)) }
    return {
      ...timing(c.short, 3.2),
      // 低い位置から箱の山の高さを見せて、ケースへゆっくり寄る
      from: c.short ? near.from : v(-10.3, 2.2, -11.2),
      look: c.short ? near.look : c.lens.clone().add(v(0, -0.7, 0)),
      fromTo: c.short ? undefined : near.from,
      lookTo: c.short ? undefined : near.look,
      panSec: 3.4,
      fov: 50,
      marker: { pos: mark, label: FOCUS_LABELS.lens!, color: FOCUS_MARK_COLOR },
    }
  },
  hook: (c) => {
    const p = HOOK.point
    const near = { from: v(-11.6, 4.4, -0.8), look: v(p.x - 0.4, p.y - 0.5, p.z) }
    return {
      ...timing(c.short, 3.0),
      // 広場から回廊を見上げて、縁の街灯の金具へクレーンのように寄る
      from: c.short ? near.from : v(-10.4, 1.8, 0.2),
      look: c.short ? near.look : v(p.x, p.y - 1.1, p.z),
      fromTo: c.short ? undefined : near.from,
      lookTo: c.short ? undefined : near.look,
      panSec: 3.0,
      fov: 52,
      marker: { pos: p.clone(), label: FOCUS_LABELS.hook!, color: FOCUS_MARK_COLOR },
    }
  },
  ring: (c) => {
    const a = SWING.anchor
    // 終わり：アーチの正面から。左右に途切れた回廊の端、上に光る輪、その間に振り子の軌道
    const end = { from: v(-1.2, 6.4, -3.6), look: v(0.3, a.y - 2.5, a.z) }
    return {
      ...timing(c.short, 4.2),
      // 西の回廊から北の端へ、途切れた橋をたどって、アーチの光る輪へ
      from: c.short ? end.from : v(-17.4, F.WALK_Y + 2.4, -1.6),
      look: c.short ? end.look : v(-15.6, F.WALK_Y + 1.0, -16.5),
      fromTo: c.short ? undefined : end.from,
      lookTo: c.short ? undefined : end.look,
      panSec: 4.2,
      fov: 55,
      marker: { pos: a.clone(), label: FOCUS_LABELS.ring!, color: FOCUS_MARK_COLOR },
    }
  },
  sky: (c) => {
    const O = F.ORUM
    const center = v(O.x, O.y, O.z)
    // 二人（ネクマックスとソラ）の間の少し後ろ、低い位置から見上げる
    const mid = c.sora ? c.player.clone().lerp(c.sora, 0.5) : c.player.clone()
    const dir = v(center.x - mid.x, 0, center.z - mid.z).normalize()
    // 二人の頭と肩が画面の下に入るよう、すぐ後ろの低い位置から
    const from = mid.clone().addScaledVector(dir, -3.7).add(v(-dir.z * 0.2, 0.55, dir.x * 0.2))
    return {
      inSec: c.short ? 1.2 : 1.8,
      hold: Infinity,
      outSec: 1.7,
      panSec: c.short ? 1.6 : 3.0,
      from,
      // 広場の向こう（低い）から空の裂け目へ見上げる
      look: mid.clone().addScaledVector(dir, 30).setY(5.5),
      lookTo: center.clone().setY(O.y * 0.87),
      fromTo: from.clone().add(v(0, -0.25, 0)).addScaledVector(dir, 0.5),
      fov: 60,
      letterbox: true,
    }
  },
}

export const FOCUS_SHOTS: Record<FocusId, (c: FocusContext) => CineShot> = {
  ...BASE_SHOTS,
  // 北の回廊の東の端の中継アンテナ（渡り終えたところで短く）
  antenna: (): CineShot => {
    const A = INTRO_LAYOUT.antenna
    return {
      inSec: 1.2,
      hold: 1.6,
      outSec: 1.1,
      skippable: true,
      from: v(A.x - 3.6, A.y + 2.3, A.z + 4.6),
      look: v(A.x, A.y + 1.2, A.z),
      fov: 50,
      marker: { pos: v(A.x, A.y + 1.4, A.z + 0.2), label: FOCUS_LABELS.antenna!, color: FOCUS_MARK_COLOR },
    }
  },
  // 会場の大画面に開場の映像（広場から見上げる。下に観客）
  screen: (c: FocusContext): CineShot => {
    const S = INTRO_LAYOUT.screen
    return {
      inSec: c.short ? 1.2 : 1.8,
      hold: 2.6,
      outSec: 1.6,
      from: v(S.x - 4.5, 3.0, S.z + 15.5),
      look: v(S.x, S.y - 2.6, S.z),
      lookTo: v(S.x, S.y - 0.5, S.z),
      fromTo: v(S.x - 4.0, 3.1, S.z + 14.6),
      panSec: 3.5,
      fov: 46,
    }
  },
  // 毎朝の街頭ビジョン：正面の少し下から、日付の文字が読める近さへゆっくり寄る
  street: (c: FocusContext): CineShot => {
    const S = INTRO_LAYOUT.street
    const n = v(Math.sin(INTRO_LAYOUT.streetYaw), 0, Math.cos(INTRO_LAYOUT.streetYaw))
    const center = v(S.x, 3.3, S.z)
    const from = center.clone().addScaledVector(n, 5.2).setY(1.7)
    return {
      inSec: c.short ? 1.0 : 1.6,
      hold: c.short ? 2.0 : 3.0,
      outSec: 1.2,
      from,
      look: center.clone().setY(3.1),
      fromTo: center.clone().addScaledVector(n, 4.1).setY(1.95),
      lookTo: center.clone().setY(3.2),
      panSec: 4.0,
      fov: 46,
    }
  },
  // 子どもの風船が同じ街灯に引っかかる（毎朝。手を離れて昇り、同じ腕に引っかかるまで）
  balloon: (c: FocusContext): CineShot => {
    const L = INTRO_LAYOUT.lamp
    // 街灯の南東 4m ほどから見上げる：手を離れた風船が昇って、同じ腕に引っかかる
    return { inSec: c.short ? 0.8 : 1.0, hold: 3.6, outSec: 1.0, from: v(L.x + 2.4, 1.7, L.z + 3.6), look: v(L.x + 0.1, 2.2, L.z + 1.6), lookTo: v(L.x + 0.55, 4.2, L.z), panSec: 3.0, fov: 52 }
  },
  // 共鳴レンズをリングにはめる：リングの正面から、上のレンズと澄んでいく映像
  install: (c: FocusContext): CineShot => {
    const P = F.PORTAL
    const n = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
    const side = v(n.z, 0, -n.x)
    const from = v(P.x, 2.3, P.z).addScaledVector(n, 6.2).addScaledVector(side, -1.2)
    return { inSec: c.short ? 1.0 : 1.5, hold: 2.4, outSec: 1.3, from, look: v(P.x, P.y + 1.4, P.z), lookTo: v(P.x, P.y + 1.0, P.z), fromTo: from.clone().addScaledVector(n, -0.9), panSec: 3.0, fov: 52 }
  },
  // 石標の QR を読む：プレイヤーの斜め後ろから、石標とリング
  exhibit: (c: FocusContext): CineShot => {
    const P = F.PORTAL
    const st = c.stone ?? INTRO_LAYOUT.stones.stone_2026
    const fr = INTRO_LAYOUT.stoneFront
    const side = v(fr.z, 0, -fr.x)
    const from = st.clone().addScaledVector(fr, 3.1).addScaledVector(side, 1.6).add(v(0, 1.75, 0))
    const look = v(P.x, 1.75, P.z).lerp(st.clone().setY(1.0), 0.35)
    return { inSec: 1.3, hold: Infinity, outSec: 1.3, from, look, lookTo: v(P.x, 2.1, P.z).lerp(st.clone().setY(1.0), 0.15), panSec: 3.2, fov: 54 }
  },
}

export function focusShot(id: FocusId, c: FocusContext): CineShot {
  return FOCUS_SHOTS[id](c)
}

// ------------------------------------------------------------------ 振り子の軌道の点線（ring のショットの間だけ）

const arcVert = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uPixelRatio;
attribute float aK;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = smoothstep(uReveal, uReveal - 0.04, aK);
  // 先へ流れる光
  float run = 0.6 + 0.4 * smoothstep(0.12, 0.0, abs(fract(aK * 1.0 - uTime * 0.45) - 0.5) - 0.38);
  gl_PointSize = (7.0 + 5.0 * run) * uPixelRatio * (24.0 / max(4.0, -mv.z));
  vA = on * run;
}
`
const arcFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.15, d);
  float a = core * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.4 + core * 1.6), a);
}
`

/** 吊り輪の振り子の軌道（西の端 → 輪の下をくぐる弧 → 東の回廊へ飛び移る）を光る点線で見せる。
 *  描き終わったら、光る玉（ネクマックスの代わり）がロープで輪からぶら下がって軌道をたどる */
export class SwingArcPreview {
  readonly group = new THREE.Group()
  private readonly points: THREE.Points
  private readonly runner: THREE.Mesh
  private readonly rope: THREE.Line
  private readonly path: THREE.Vector3[]
  /** 振り子の区間（path の番号） */
  private readonly swingFrom: number
  private readonly swingTo: number
  private readonly u: { uTime: { value: number }; uReveal: { value: number }; uPixelRatio: { value: number }; uColor: { value: THREE.Color }; uOpacity: { value: number } }
  private t = 0
  private fade = 1
  private readonly tmp = new THREE.Vector3()

  constructor(parent: THREE.Object3D, color: THREE.ColorRepresentation = FOCUS_MARK_COLOR) {
    const pts: THREE.Vector3[] = []
    const a = SWING.anchor
    const R = SWING.rope
    const west = SWING.checkpoints[0]
    // 西の回廊の端から輪へ飛びつく線
    const swing0 = -0.95
    const start = v(a.x + Math.sin(swing0) * R, a.y - Math.cos(swing0) * R, a.z)
    for (let i = 0; i <= 6; i++) pts.push(west.clone().add(v(0, 0.9, 0)).lerp(start, i / 6))
    this.swingFrom = pts.length - 1
    // 振り子の弧
    const swing1 = 0.95
    for (let i = 1; i <= 26; i++) {
      const th = swing0 + ((swing1 - swing0) * i) / 26
      pts.push(v(a.x + Math.sin(th) * R, a.y - Math.cos(th) * R, a.z))
    }
    this.swingTo = pts.length - 1
    // 飛び移り（放物線）
    const rel = pts[pts.length - 1].clone()
    const land = v(SWING.checkpoints[1].x + 1.6, F.WALK_Y + 0.4, a.z)
    for (let i = 1; i <= 10; i++) {
      const k = i / 10
      const p = rel.clone().lerp(land, k)
      p.y += Math.sin(k * Math.PI) * 1.2
      pts.push(p)
    }
    this.path = pts
    const rng = mulberry32(7)
    const pos = new Float32Array(pts.length * 3)
    const ks = new Float32Array(pts.length)
    pts.forEach((p, i) => {
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y + (rng() - 0.5) * 0.01
      pos[i * 3 + 2] = p.z
      ks[i] = i / (pts.length - 1)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aK', new THREE.BufferAttribute(ks, 1))
    this.u = { uTime, uReveal: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } }
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({ vertexShader: arcVert, fragmentShader: arcFrag, uniforms: this.u, transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false }),
    )
    this.points.frustumCulled = false
    this.points.renderOrder = 985
    // 光る玉とロープ
    const hot = new THREE.Color(color).multiplyScalar(2.2)
    this.runner = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshBasicMaterial({ color: hot, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }))
    this.runner.renderOrder = 986
    this.runner.visible = false
    const rg = new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()])
    this.rope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: hot, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false, toneMapped: false }))
    this.rope.renderOrder = 986
    this.rope.frustumCulled = false
    this.rope.visible = false
    this.group.name = 'swing_arc_preview'
    this.group.add(this.points, this.rope, this.runner)
    parent.add(this.group)
  }

  /** delay 秒待ってから、reveal 秒で端から端まで描き、その後は玉が軌道をたどる（period 秒で 1 回） */
  update(dt: number, delay = 4.2, reveal = 1.8, period = 3.0): void {
    this.t += dt
    this.u.uReveal.value = Math.min(1.05, Math.max(0, (this.t - delay) / reveal) * 1.05)
    this.u.uOpacity.value = this.fade
    const after = this.t - delay - reveal
    const on = after > 0 && this.fade > 0.02
    this.runner.visible = on
    if (!on) {
      this.rope.visible = false
      return
    }
    // 振り子はゆっくり・飛び移りは速く見えるよう、少しためてから進む
    const k = Math.min(1, (after % (period + 0.6)) / period)
    const f = k * (this.path.length - 1)
    const i = Math.min(this.path.length - 2, Math.floor(f))
    this.tmp.lerpVectors(this.path[i], this.path[i + 1], f - i)
    this.runner.position.copy(this.tmp)
    ;(this.runner.material as THREE.MeshBasicMaterial).opacity = this.fade
    const swinging = i >= this.swingFrom && i < this.swingTo
    this.rope.visible = swinging
    if (swinging) {
      const pa = this.rope.geometry.attributes.position as THREE.BufferAttribute
      pa.setXYZ(1, this.tmp.x, this.tmp.y, this.tmp.z)
      pa.needsUpdate = true
      ;(this.rope.material as THREE.LineBasicMaterial).opacity = 0.9 * this.fade
    }
  }

  /** 消えていく（0..1） */
  setFade(x: number): void {
    this.fade = Math.min(1, Math.max(0, x))
  }

  /** カメラが戻り始めたら少しずつ消す */
  fadeOut(dt: number, rate = 2.5): void {
    this.setFade(this.fade - dt * rate)
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const o of [this.points, this.runner, this.rope]) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
  }
}
