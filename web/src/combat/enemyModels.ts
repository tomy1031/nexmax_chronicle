// 敵「欠け」の見た目（docs/中盤シナリオとワールド構成_v1.md §1・§4.1）。明日が喰われたところから湧く影のようなもの。
// 黒曜石のような体に、すみれ色と深紅のひびが脈打つ。ときどき部品が小さくずれる（欠けている感じ）。
// ・欠け虫（mite）：低い甲虫。6 本脚で走り、跳びかかる
// ・欠け盾（shield）：人の形。左手に六角の盾（時代の色の欠けた板）
// ・欠け重（brute）：大きな背中と太い腕。片目。両腕で叩きつける
// 形は箱・球・円柱だけ。材質は敵ごとに 1 組（当たったときの白い光を個別に出すため）。解放は dispose()。
import * as THREE from 'three'
import type { EnemyKind } from './combatLogic'
import { mergeChildMeshes } from '../render/mergeChildren'

/**
 * 時代ごとの差し色（盾の板・目の色）。robot：欠けに取り込まれた展示ロボット（欠け重の形に、丸い頭・アンテナ・
 * 胸の計器を足す。錨の番人「ミライ号」）。body：体の色（無ければ黒曜石）
 */
export type EnemyStyle = { panel: THREE.ColorRepresentation; trim: THREE.ColorRepresentation; eye: THREE.ColorRepresentation; body?: THREE.ColorRepresentation; robot?: boolean }

export const DEFAULT_ENEMY_STYLE: EnemyStyle = { panel: '#2a2440', trim: '#ff3d7a', eye: '#ff4fd8' }

let crackTex: THREE.CanvasTexture | null = null
/** ひびの模様（すべての敵で使い回す。解放しない小さなキャッシュ） */
function crackTexture(): THREE.CanvasTexture {
  if (crackTex) return crackTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  let s = 17
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    let x = rnd() * 256
    let y = rnd() * 256
    let a = rnd() * Math.PI * 2
    g.strokeStyle = `rgba(255,255,255,${0.55 + rnd() * 0.45})`
    g.lineWidth = 1 + rnd() * 2.4
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      a += (rnd() - 0.5) * 1.4
      x += Math.cos(a) * (8 + rnd() * 16)
      y += Math.sin(a) * (8 + rnd() * 16)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  crackTex = new THREE.CanvasTexture(c)
  crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping
  crackTex.colorSpace = THREE.SRGBColorSpace
  return crackTex
}

type Mats = { body: THREE.MeshStandardMaterial; panel: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial; eye: THREE.MeshBasicMaterial }

function makeMats(style: EnemyStyle): Mats {
  return {
    body: new THREE.MeshStandardMaterial({ color: style.body ?? '#16121f', roughness: 0.32, metalness: 0.55, emissive: new THREE.Color('#a33cff'), emissiveMap: crackTexture(), emissiveIntensity: 1.6 }),
    panel: new THREE.MeshStandardMaterial({ color: style.panel, roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(style.trim), emissiveMap: crackTexture(), emissiveIntensity: 1.2 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(style.trim).multiplyScalar(2.2), toneMapped: false }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(style.eye).multiplyScalar(3), toneMapped: false }),
  }
}

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
const ball = (r: number, m: THREE.Material, seg = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), m)
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), m)

/** 敵の姿と、毎フレームの動き（ポーズは状態と時間から決める） */
export class EnemyModel {
  readonly root = new THREE.Group()
  readonly kind: EnemyKind
  /** 盾（欠け盾だけ）。はがされたら root から外して飛ばす */
  shield: THREE.Object3D | null = null
  /** 装甲（欠け重だけ。setArmor で出し入れする） */
  private armor: THREE.Object3D | null = null
  /** 見た目の大きさ（倒れるときもこれを基準に縮む） */
  baseScale = 1
  /** クローの接続点・目印の高さ（足元から） */
  readonly chestY: number
  private readonly mats: Mats
  private readonly parts: { body: THREE.Object3D; legs: THREE.Object3D[]; armL?: THREE.Object3D; armR?: THREE.Object3D; head?: THREE.Object3D }
  private flash = 0
  private glitchT = 0
  private readonly jitter: THREE.Object3D[] = []
  private readonly extraMats: THREE.Material[] = []

  constructor(kind: EnemyKind, style: EnemyStyle = DEFAULT_ENEMY_STYLE) {
    this.kind = kind
    this.mats = makeMats(style)
    this.root.name = `kake_${kind}`
    const m = this.mats
    if (kind === 'mite') {
      const body = new THREE.Group()
      const shell = ball(0.34, m.body)
      shell.scale.set(1.1, 0.62, 1.35)
      shell.position.y = 0.32
      const head = ball(0.2, m.body)
      head.position.set(0, 0.3, -0.42)
      head.scale.set(1, 0.8, 0.9)
      const eyes = [-0.08, 0.08].map((x) => {
        const e = ball(0.045, m.eye, 8)
        e.position.set(x, 0.36, -0.58)
        return e
      })
      const ridge = box(0.06, 0.08, 0.7, m.glow)
      ridge.position.set(0, 0.53, 0.02)
      body.add(shell, head, ridge, ...eyes)
      const legs: THREE.Object3D[] = []
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Group()
          const seg = box(0.05, 0.05, 0.42, m.body)
          seg.position.z = -0.18
          seg.rotation.x = -0.6
          leg.add(seg)
          leg.position.set(side * 0.3, 0.3, -0.2 + i * 0.22)
          leg.rotation.y = side * (1.2 - i * 0.25)
          legs.push(leg)
          body.add(leg)
        }
      this.root.add(body)
      this.parts = { body, legs, head }
      this.jitter.push(head, ridge)
      this.chestY = 0.35
    } else if (kind === 'shield') {
      const body = new THREE.Group()
      const torso = cyl(0.26, 0.34, 0.7, m.body)
      torso.position.y = 1.0
      const hips = box(0.42, 0.18, 0.28, m.body)
      hips.position.y = 0.62
      const head = ball(0.2, m.body)
      head.position.y = 1.52
      const visor = box(0.3, 0.06, 0.06, m.eye)
      visor.position.set(0, 1.53, -0.18)
      body.add(torso, hips, head, visor)
      const legs = [-0.12, 0.12].map((x) => {
        const leg = new THREE.Group()
        const l = box(0.14, 0.6, 0.16, m.body)
        l.position.y = -0.3
        leg.add(l)
        leg.position.set(x, 0.6, 0)
        body.add(leg)
        return leg
      })
      const arm = (side: number) => {
        const a = new THREE.Group()
        const u = box(0.12, 0.62, 0.12, m.body)
        u.position.y = -0.3
        a.add(u)
        a.position.set(side * 0.38, 1.28, 0)
        body.add(a)
        return a
      }
      const armL = arm(-1)
      const armR = arm(1)
      // 盾：時代の色の欠けた六角の板（左手）
      const shield = new THREE.Group()
      const plate = cyl(0.55, 0.55, 0.07, m.panel, 6)
      plate.rotation.x = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 4, 6), m.glow)
      shield.add(plate, rim)
      shield.position.set(-0.12, -0.42, -0.34)
      armL.add(shield)
      this.shield = shield
      this.root.add(body)
      this.parts = { body, legs, armL, armR, head }
      this.jitter.push(head, visor)
      this.chestY = 1.05
    } else {
      const body = new THREE.Group()
      const back = box(1.3, 1.1, 0.95, m.body)
      back.position.y = 1.45
      back.rotation.x = 0.18
      const belly = box(0.9, 0.55, 0.7, m.body)
      belly.position.y = 0.85
      const head = ball(0.24, m.body)
      head.position.set(0, 1.78, -0.48)
      const eye = ball(0.09, m.eye, 10)
      eye.position.set(0, 1.8, -0.7)
      const spine = box(0.12, 0.2, 0.9, m.glow)
      spine.position.set(0, 2.05, 0.05)
      body.add(back, belly, head, eye, spine)
      const legs = [-0.32, 0.32].map((x) => {
        const leg = new THREE.Group()
        const l = cyl(0.17, 0.2, 0.75, m.body)
        l.position.y = -0.37
        leg.add(l)
        leg.position.set(x, 0.75, 0.05)
        body.add(leg)
        return leg
      })
      const arm = (side: number) => {
        const a = new THREE.Group()
        const u = cyl(0.17, 0.22, 0.9, m.body)
        u.position.y = -0.45
        const fist = box(0.42, 0.42, 0.42, m.body)
        fist.position.y = -1.0
        a.add(u, fist)
        a.position.set(side * 0.82, 1.75, -0.1)
        body.add(a)
        return a
      }
      const armL = arm(-1)
      const armR = arm(1)
      // 装甲：胸と両肩の板（はじくで割れる。装甲を持つ敵だけ見せる）
      const armor = new THREE.Group()
      const chest = box(1.0, 0.75, 0.12, m.panel)
      chest.position.set(0, 1.35, -0.55)
      chest.rotation.x = 0.18
      const trim = box(1.04, 0.05, 0.14, m.glow)
      trim.position.set(0, 1.0, -0.5)
      armor.add(chest, trim)
      for (const side of [-1, 1]) {
        const sh = box(0.5, 0.16, 0.6, m.panel)
        sh.position.set(side * 0.82, 1.92, -0.1)
        sh.rotation.z = side * -0.25
        armor.add(sh)
      }
      armor.visible = false
      body.add(armor)
      this.armor = armor
      if (style.robot) {
        // 展示ロボット：丸い頭（ガラスの覆い）・アンテナ・胸の計器
        head.scale.setScalar(1.5)
        head.position.set(0, 2.05, -0.3)
        eye.position.set(0, 2.08, -0.66)
        eye.scale.set(2.2, 0.8, 1)
        const dome = ball(0.42, new THREE.MeshStandardMaterial({ color: '#cfe6ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }))
        dome.position.copy(head.position)
        dome.scale.set(1, 0.85, 1)
        this.extraMats.push(dome.material as THREE.Material)
        for (const side of [-1, 1]) {
          const ant = cyl(0.025, 0.02, 0.5, m.body, 6)
          ant.position.set(side * 0.28, 2.45, -0.3)
          ant.rotation.z = side * -0.35
          const tip = ball(0.06, m.glow, 8)
          tip.position.set(side * 0.38, 2.7, -0.3)
          body.add(ant, tip)
          this.jitter.push(tip)
        }
        for (let i = 0; i < 3; i++) {
          const dial = cyl(0.07, 0.07, 0.04, m.eye, 12)
          dial.rotation.x = Math.PI / 2
          dial.position.set(-0.22 + i * 0.22, 1.18, -0.63)
          body.add(dial)
        }
        body.add(dome)
      }
      this.root.add(body)
      this.parts = { body, legs, armL, armR, head }
      this.jitter.push(head, spine)
      this.chestY = 1.4
    }
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.castShadow = true
    })
    // 同じ関節・同じ材質の部品をまとめる（ずれる部品と盾・装甲の板は残す）
    const keep = new Set<THREE.Object3D>(this.jitter)
    mergeChildMeshes(this.root, { keep, disposeOriginals: true })
  }

  /** 当たったときの白い光 */
  hit(): void {
    this.flash = 1
  }

  /** 装甲を見せる・隠す（欠け重だけ） */
  setArmor(on: boolean): void {
    if (this.armor) this.armor.visible = on
  }

  get armorShown(): boolean {
    return this.armor?.visible ?? false
  }

  /** 装甲の位置（割れたときの火花） */
  armorPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.armor ? (this.armor.children[0] as THREE.Object3D).getWorldPosition(out) : this.root.getWorldPosition(out)
  }

  /**
   * 毎フレームの姿。state は EnemyBrain の状態、st はその状態になってからの秒、speed は歩く速さ。
   * dying（0〜1）は倒れて砕けていく割合
   */
  animate(dt: number, t: number, state: string, st: number, speed: number, dying: number, windup: number): void {
    const p = this.parts
    const walk = Math.min(1, speed / 2.5)
    const cyc = t * (this.kind === 'mite' ? 18 : this.kind === 'shield' ? 9 : 5.5)
    p.body.position.set(0, 0, 0)
    p.body.rotation.set(0, 0, 0)
    if (this.kind === 'mite') {
      p.legs.forEach((l, i) => (l.rotation.x = Math.sin(cyc + i * 1.7) * 0.5 * walk))
      p.body.position.y = Math.abs(Math.sin(cyc)) * 0.04 * walk
      if (state === 'windup') {
        // 身を低くして、尻を上げる
        const k = Math.min(1, st / Math.max(0.01, windup))
        p.body.rotation.x = 0.25 * k
        p.body.position.y = -0.08 * k + Math.sin(t * 60) * 0.01 * k
      } else if (state === 'attack') p.body.rotation.x = -0.35
    } else {
      const swingLeg = Math.sin(cyc) * 0.55 * walk
      p.legs[0].rotation.x = swingLeg
      p.legs[1].rotation.x = -swingLeg
      p.body.position.y = Math.abs(Math.sin(cyc)) * 0.05 * walk
      const aL = p.armL as THREE.Object3D
      const aR = p.armR as THREE.Object3D
      if (this.kind === 'shield') {
        // 盾を前に構える
        aL.rotation.set(-1.1, 0, 0.15)
        aR.rotation.set(-swingLeg * 0.6, 0, -0.1)
        if (state === 'windup') {
          const k = Math.min(1, st / Math.max(0.01, windup))
          aR.rotation.set(-2.6 * k, 0, -0.2)
          p.body.rotation.x = -0.12 * k
        } else if (state === 'attack') {
          aR.rotation.set(-0.3, 0, -0.1)
          p.body.rotation.x = 0.25
        }
      } else {
        aL.rotation.set(-swingLeg * 0.4, 0, 0.15)
        aR.rotation.set(swingLeg * 0.4, 0, -0.15)
        if (state === 'windup') {
          // 両腕を高く振り上げる
          const k = Math.min(1, st / Math.max(0.01, windup))
          aL.rotation.set(-2.9 * k, 0, 0.2)
          aR.rotation.set(-2.9 * k, 0, -0.2)
          p.body.rotation.x = -0.2 * k
        } else if (state === 'attack' || (state === 'recover' && st < 0.4)) {
          aL.rotation.set(-0.9, 0, 0.1)
          aR.rotation.set(-0.9, 0, -0.1)
          p.body.rotation.x = 0.35
        }
      }
    }
    if (state === 'stagger') p.body.rotation.x = 0.3 * Math.exp(-st * 6)
    if (state === 'stunned') {
      p.body.rotation.z = Math.sin(t * 9) * 0.12
      p.body.rotation.x = 0.15
    }
    // 欠け：ときどき部品が小さくずれる
    this.glitchT -= dt
    if (this.glitchT <= 0) {
      this.glitchT = 0.06 + Math.random() * 0.5
      const on = Math.random() < 0.35
      for (const j of this.jitter) j.userData.g = on ? (Math.random() - 0.5) * 0.06 : 0
    }
    for (const j of this.jitter) j.position.x = (j.userData.base ??= j.position.x) + (j.userData.g ?? 0)
    // 光：ひびが脈打つ。当たると白く
    this.flash = Math.max(0, this.flash - dt * 6)
    const pulse = 1.4 + Math.sin(t * 4.2) * 0.4 + (state === 'windup' ? 1.5 : 0)
    this.mats.body.emissiveIntensity = pulse + this.flash * 6
    this.mats.body.emissive.setRGB(0.64 + this.flash * 0.36, 0.24 + this.flash * 0.76, 1)
    // 倒れる：沈みながら縮んで消える
    if (dying > 0) {
      const k = Math.min(1, dying)
      this.root.scale.setScalar(this.baseScale * Math.max(0.01, 1 - k * k))
      p.body.rotation.z = k * 0.6
    } else this.root.scale.setScalar(this.baseScale)
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    for (const m of Object.values(this.mats)) m.dispose()
    for (const m of this.extraMats) m.dispose()
  }
}
