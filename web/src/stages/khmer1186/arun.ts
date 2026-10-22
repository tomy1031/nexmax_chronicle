// 大きなアルン（人の背より大きな青い石）。中で光がゆれる。
//   setGlow(k)：光の強さ（0〜2）／setDead()：力を使いはたして、ただの石に／crack()：ぴしっとひびが入る
//   setScars(k)：表面にうかぶ 900 本の黒い筋／releaseShard()：最後の光が七つのつぶになって小さなかけらへ集まり、土へ落ちる
// 形は 6 角の細長い結晶（LatheGeometry）。光は MeshStandardMaterial の onBeforeCompile で足す（影・霧はそのまま）。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { mulberry32 } from '../../render/noise'
import type { LightSpot } from '../../world/edo/kit'
import { softDot } from './fxKhmer'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function crackCanvas(): HTMLCanvasElement {
  const W = 256
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  const rng = mulberry32(77)
  g.strokeStyle = '#fff'
  g.lineCap = 'round'
  const branch = (x: number, y: number, dir: number, len: number, w: number, depth: number) => {
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, y)
    let cx = x
    let cy = y
    const steps = Math.max(3, Math.floor(len / 16))
    for (let i = 0; i < steps; i++) {
      cx += (rng() - 0.5) * 22
      cy += dir * (len / steps)
      g.lineTo(cx, cy)
      if (depth > 0 && rng() < 0.28) branch(cx, cy, dir, len * 0.4, w * 0.55, depth - 1)
    }
    g.stroke()
  }
  // 中ほど（正面）から上下へ走る大きなひび（u は回り、v は高さ）
  branch(W * 0.5, H * 0.52, -1, H * 0.46, 5, 2)
  branch(W * 0.5, H * 0.52, 1, H * 0.4, 4, 2)
  branch(W * 0.15, H * 0.4, -1, H * 0.2, 2.5, 1)
  return c
}

function scarCanvas(): HTMLCanvasElement {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  const rng = mulberry32(900)
  g.strokeStyle = '#fff'
  g.lineCap = 'round'
  // 900 本の細い筋（ななめに走る短い線）
  for (let i = 0; i < 900; i++) {
    const x = rng() * S
    const y = rng() * S
    const len = 14 + rng() * 34
    const a = -1.2 + rng() * 0.5
    g.globalAlpha = 0.55 + rng() * 0.45
    g.lineWidth = 0.8 + rng() * 1.2
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
    g.stroke()
  }
  g.globalAlpha = 1
  return c
}

/** 6 角の細長い結晶（高さ h、いちばん太い所の半径 r） */
export function crystalGeometry(h: number, r: number, seg = 6, seed = 5): THREE.BufferGeometry {
  const prof = [v(0, 0, 0), v(r * 0.78, h * 0.05, 0), v(r, h * 0.36, 0), v(r * 0.92, h * 0.68, 0), v(r * 0.52, h * 0.88, 0), v(0, h, 0)].map((p) => new THREE.Vector2(p.x, p.y))
  const g = new THREE.LatheGeometry(prof, seg)
  // 面ごとに少しずつ太さを変えて、自然な結晶に
  const rng = mulberry32(seed)
  const k = Array.from({ length: seg + 1 }, () => 0.86 + rng() * 0.26)
  k[seg] = k[0]
  const p = g.attributes.position as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const j = Math.round(uv.getX(i) * seg)
    p.setX(i, p.getX(i) * k[j])
    p.setZ(i, p.getZ(i) * k[j])
  }
  const flat = g.toNonIndexed()
  flat.computeVertexNormals()
  g.dispose()
  return flat
}

export type ShardOptions = {
  /** かけらが土へ落ちていく所（地面の高さ） */
  to?: THREE.Vector3
  /** 全体の長さの倍率（1 で約 6 秒） */
  speed?: number
}

export class Arun {
  readonly group = new THREE.Group()
  /** 石の中心（光の筋が集まる所） */
  readonly center = new THREE.Vector3()
  readonly mesh: THREE.Mesh
  /** 点光源の候補（シェルが近いものに割り当てる）。強さは setGlow で変わる */
  readonly light: LightSpot
  private readonly mat: THREE.MeshStandardMaterial
  private readonly u = {
    uGlow: { value: 1 },
    uDead: { value: 0 },
    uCrack: { value: 0 },
    uScars: { value: 0 },
    uFlash: { value: 0 },
    uCrackTex: { value: null as THREE.Texture | null },
    uScarTex: { value: null as THREE.Texture | null },
  }
  private readonly halo: THREE.Sprite
  private glow = 1
  private glowTarget = 1
  private dead = 0
  private deadTarget = 0
  private crackK = 0
  private crackT = -1
  private scars = 0
  private flash = 0
  // 最後の光（七つのつぶ → 小さなかけら → 土へ）
  private readonly motes: THREE.Sprite[] = []
  readonly shard: THREE.Mesh
  private readonly shardGlow: THREE.Sprite
  private readonly groundGlow: THREE.Sprite
  private shardT = -1
  private shardSpeed = 1
  private shardDone: (() => void) | null = null
  private readonly shardFrom = new THREE.Vector3()
  private readonly shardTo = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  /** base：台座の上の中心（石の底）、height：石の高さ */
  constructor(base: THREE.Vector3, height: number) {
    this.center.copy(base).setY(base.y + height * 0.5)
    const crackT = new THREE.CanvasTexture(crackCanvas())
    const scarT = new THREE.CanvasTexture(scarCanvas())
    for (const t of [crackT, scarT]) t.wrapS = THREE.RepeatWrapping
    this.u.uCrackTex.value = crackT
    this.u.uScarTex.value = scarT
    this.mat = new THREE.MeshStandardMaterial({ color: '#3a86e0', roughness: 0.18, metalness: 0.15, emissive: new THREE.Color('#1a6aff'), emissiveIntensity: 1 })
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u, { uTime })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAPos;\nvarying vec2 vAUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAPos = position;\nvAUv = uv;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime, uGlow, uDead, uCrack, uScars, uFlash;
          uniform sampler2D uCrackTex, uScarTex;
          varying vec3 vAPos;
          varying vec2 vAUv;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float scar = texture2D(uScarTex, vAUv * vec2(2.0, 1.0)).r * uScars;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.45, 0.5), uDead);
          diffuseColor.rgb *= 1.0 - scar * 0.85;
          float crk = texture2D(uCrackTex, vAUv).r * uCrack;
          diffuseColor.rgb *= 1.0 - crk * 0.7;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.85, uDead);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // 中でゆれる光：高さにそって流れる帯と、ゆっくりうねる明るさ
            float y = vAPos.y;
            float flow = sin(y * 3.2 - uTime * 1.7 + sin(vAPos.x * 3.0 + uTime * 0.8) * 1.2) * 0.5 + 0.5;
            float slow = sin(uTime * 0.9 + y * 0.8) * 0.5 + 0.5;
            vec3 vdir = normalize(vViewPosition);
            float facing = abs(dot(normalize(vNormal), vdir));
            float rim = pow(1.0 - facing, 2.0);
            float inner = 0.35 + flow * 0.45 + slow * 0.25;
            // 奥で光る芯：正面を向いた面の、石の中ほどの高さほど強く（ふちの面は青い結晶の色と照りを見せる）
            float core = pow(facing, 3.0) * exp(-pow((y - ${(height * 0.42).toFixed(3)}) / ${(height * 0.3).toFixed(3)}, 2.0));
            vec3 glowCol = mix(vec3(0.18, 0.5, 1.0), vec3(0.6, 0.9, 1.0), flow * rim);
            float live = (1.0 - uDead) * uGlow;
            totalEmissiveRadiance = (glowCol * (inner * 0.6 + rim * 0.7) + vec3(0.55, 0.85, 1.0) * core * (0.7 + slow * 0.3)) * 0.65 * live * (1.0 - scar * 0.8);
            // ひびの光（入った瞬間は白く光る）
            totalEmissiveRadiance += vec3(0.8, 0.95, 1.0) * crk * (uFlash * 4.0 + live * 0.6);
          }`,
        )
    }
    this.mat.customProgramCacheKey = () => 'khmer-arun'
    this.mesh = new THREE.Mesh(crystalGeometry(height, 0.62), this.mat)
    this.mesh.position.copy(base)
    this.mesh.rotation.y = 0.3
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.name = 'khmer_arun'
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#5ab8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }))
    this.halo.scale.set(4.2, 5.2, 1)
    this.halo.position.copy(this.center)
    this.halo.renderOrder = 6
    // 最後の光
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#bfe8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      s.scale.setScalar(0.42)
      s.visible = false
      s.renderOrder = 7
      this.motes.push(s)
      this.group.add(s)
    }
    this.shard = new THREE.Mesh(crystalGeometry(0.34, 0.08, 6, 11), new THREE.MeshStandardMaterial({ color: '#4a9cf0', roughness: 0.2, metalness: 0.1, emissive: new THREE.Color('#5ab8ff'), emissiveIntensity: 1.6 }))
    this.shard.visible = false
    this.shard.name = 'khmer_arun_shard'
    this.shardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#8ad0ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.shardGlow.scale.setScalar(1.2)
    this.shardGlow.visible = false
    this.groundGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#8ad0ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.groundGlow.scale.setScalar(2)
    this.groundGlow.visible = false
    this.group.add(this.mesh, this.halo, this.shard, this.shardGlow, this.groundGlow)
    this.group.name = 'khmer_arun_group'
    this.light = { pos: this.center.clone().add(v(-1.8, 0.4, 0)), color: '#6ac8ff', intensity: 2.2, dist: 12 }
    this.apply()
  }

  /** 光の強さ（0〜2）。instant でなければ 1 秒ほどでそこへ */
  setGlow(k: number, instant = false): void {
    this.glowTarget = Math.max(0, k)
    if (instant) {
      this.glow = this.glowTarget
      this.apply()
    }
  }

  get glowLevel(): number {
    return this.glow
  }

  /** 力を使いはたして、ただの石になる（2 秒ほどで光が消えて灰色の石に） */
  setDead(instant = false): void {
    this.deadTarget = 1
    this.glowTarget = 0
    if (instant) {
      this.dead = 1
      this.glow = 0
      this.apply()
    }
  }

  /** 生き返らせる（開発用・やり直し用） */
  revive(): void {
    this.deadTarget = 0
    this.dead = 0
    this.glowTarget = 1
    this.crackK = 0
    this.crackT = -1
    this.apply()
  }

  /** ぴしっとひびが入る（白く光ってから、ひびが残る） */
  crack(): void {
    this.crackT = 0
  }

  /** 表面の 900 本の黒い筋（0〜1） */
  setScars(k: number): void {
    this.scars = Math.max(0, Math.min(1, k))
    this.apply()
  }

  /**
   * 最後の光が七つのつぶになって石から出て、小さなかけらに集まり、かけらは土へ落ちて消える。
   * 終わると resolve。opts.to は落ちる土の位置（既定はアルンの前の床）
   */
  releaseShard(opts: ShardOptions = {}): Promise<void> {
    this.shardSpeed = opts.speed ?? 1
    this.shardFrom.copy(this.center).add(v(-1.5, -0.6, 0.3))
    this.shardTo.copy(opts.to ?? this.center.clone().add(v(-2.5, -this.center.y + 0.02, 0)))
    this.shardT = 0
    for (const m of this.motes) {
      m.visible = true
      m.position.copy(this.center)
    }
    return new Promise((res) => {
      this.shardDone = res
    })
  }

  /** かけらの演出の段階（-1：していない、0〜1：進み） */
  get shardProgress(): number {
    return this.shardT < 0 ? -1 : Math.min(1, this.shardT / 6.4)
  }

  /** かけらの今の位置（カメラの演出で追うため） */
  get shardPos(): THREE.Vector3 {
    return this.shard.position
  }

  update(dt: number): void {
    // 光の強さ・石になる
    const g0 = this.glow
    this.glow += (this.glowTarget - this.glow) * Math.min(1, dt * 1.6)
    if (Math.abs(this.glow - this.glowTarget) < 0.002) this.glow = this.glowTarget
    if (this.dead !== this.deadTarget) this.dead = Math.min(1, this.dead + dt * 0.5)
    if (this.crackT >= 0) {
      this.crackT += dt
      this.crackK = Math.min(1, this.crackT / 0.35)
      this.flash = Math.max(0, 1 - this.crackT / 1.2)
      if (this.crackT > 1.4) this.crackT = -1
    }
    if (this.glow !== g0 || this.dead > 0 || this.crackT >= 0 || this.flash > 0) this.apply()
    // ハローは弱く（強いと結晶の面が消えて、青い板に見える）
    this.halo.material.opacity = 0.2 * this.glow * (1 - this.dead) * (0.85 + 0.15 * Math.sin(uTime.value * 1.8))
    if (this.shardT >= 0) this.updateShard(dt)
  }

  private updateShard(dt: number): void {
    this.shardT += dt * this.shardSpeed
    const t = this.shardT
    const T = uTime.value
    // 0〜1.4 秒：七つのつぶが石から出て、まわりをまわる
    // 1.4〜2.6 秒：前の一点へ集まり、小さなかけらになる
    // 2.6〜3.6 秒：かけらが光る
    // 3.6〜5.4 秒：かけらが弧を描いて土へ落ちる／5.4〜6.4：土の中へ消える
    for (let i = 0; i < 7; i++) {
      const m = this.motes[i]
      const a = (i / 7) * Math.PI * 2 + T * 2.4
      if (t < 1.4) {
        const k = t / 1.4
        const r = 0.3 + k * 1.3
        m.position.set(this.center.x + Math.cos(a) * r, this.center.y + Math.sin(T * 3 + i) * 0.4 + k * 0.4, this.center.z + Math.sin(a) * r)
        m.visible = true
      } else if (t < 2.6) {
        const k = (t - 1.4) / 1.2
        const e = k * k * (3 - 2 * k)
        const r = 1.6 * (1 - e)
        this.tmp.set(this.center.x + Math.cos(a) * r, this.center.y + 0.4, this.center.z + Math.sin(a) * r)
        m.position.lerpVectors(this.tmp, this.shardFrom, e)
        m.scale.setScalar(0.42 * (1 - e * 0.6))
      } else m.visible = false
    }
    if (t >= 2.3 && t < 5.4) {
      this.shard.visible = true
      this.shardGlow.visible = true
      const grow = Math.min(1, (t - 2.3) / 0.4)
      this.shard.scale.setScalar(grow)
      this.shard.rotation.y += dt * 2
      if (t < 3.6) {
        this.shard.position.copy(this.shardFrom).add(this.tmp.set(0, -0.17 + Math.sin(T * 3) * 0.04, 0))
        this.shardGlow.material.opacity = 0.6 + 0.4 * Math.sin(T * 8)
      } else {
        const k = (t - 3.6) / 1.8
        const e = k * k
        this.shard.position.lerpVectors(this.shardFrom, this.shardTo, e)
        this.shard.position.y += Math.sin(k * Math.PI) * 2.2
        this.shard.position.y = Math.max(this.shard.position.y, this.shardTo.y + 0.17 * (1 - e))
        this.shardGlow.material.opacity = 0.8
      }
      this.shardGlow.position.copy(this.shard.position)
    }
    if (t >= 5.4) {
      // 土の中へ
      const k = Math.min(1, (t - 5.4) / 1.0)
      this.shard.visible = k < 1
      this.shard.position.copy(this.shardTo).setY(this.shardTo.y + 0.12 - k * 0.5)
      this.shard.scale.setScalar(1 - k * 0.7)
      this.shardGlow.visible = false
      this.groundGlow.visible = true
      this.groundGlow.position.copy(this.shardTo).setY(this.shardTo.y + 0.15)
      this.groundGlow.material.opacity = (1 - k) * 0.9
    }
    if (t >= 6.4) {
      this.shardT = -1
      this.shard.visible = false
      this.groundGlow.visible = false
      for (const m of this.motes) m.visible = false
      const done = this.shardDone
      this.shardDone = null
      done?.()
    }
  }

  private apply(): void {
    this.u.uGlow.value = this.glow
    this.u.uDead.value = this.dead
    this.u.uCrack.value = this.crackK
    this.u.uScars.value = this.scars
    this.u.uFlash.value = this.flash
    this.light.intensity = 2.2 * this.glow * (1 - this.dead)
    this.halo.visible = this.glow * (1 - this.dead) > 0.02
  }
}
