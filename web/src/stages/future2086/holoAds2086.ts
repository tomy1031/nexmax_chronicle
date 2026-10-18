// 2086年の建物の前に浮かぶ立体ホログラム広告（背景コンセプト案B：金魚・たこ焼き・招き猫）。
// 画像は public/textures/holo2086/*.webp（黒＝透明として加算合成）。下に小さな投影機と光の円錐を置き、
// ゆっくり漂い・走査線・ときどきのちらつきで「投影されている」ように見せる。
import * as THREE from 'three'
import { M } from '../../render/batch'
import { uTime } from '../../render/materials'
import { NEON, type FCtx } from './kit2086'

type AdDef = {
  name: 'goldfish' | 'takoyaki' | 'maneki'
  /** 中心 */
  pos: [number, number, number]
  /** 正面の向き（0 = +Z） */
  yaw: number
  size: number
  /** 横に泳ぐ（金魚） */
  swim?: number
  tint: [number, number, number]
}

const ADS: AdDef[] = [
  // 西の建物の上（IDO 展示の奥）：大きな金魚が泳ぐ
  { name: 'goldfish', pos: [-16.4, 17.2, -4.5], yaw: Math.PI / 2, size: 10.5, swim: 2.2, tint: [1.25, 1.1, 1.1] },
  // 東の建物（屋台の上）：招き猫とたこ焼き
  { name: 'maneki', pos: [17.2, 15.6, 11.5], yaw: -Math.PI / 2, size: 8.5, tint: [1.2, 1.1, 1.2] },
  { name: 'takoyaki', pos: [17.0, 13.4, -9.5], yaw: -Math.PI / 2 + 0.25, size: 8.0, tint: [1.25, 1.12, 1.0] },
]

const vert = /* glsl */ `
varying vec2 vUv;
varying float vH;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vH = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const frag = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uSeed;
uniform vec3 uTint;
uniform float uGain;
varying vec2 vUv;
varying float vH;
float hash(float x) { return fract(sin(x * 91.7 + uSeed) * 43758.5); }
void main() {
  // ときどき横にずれる（グリッチ）
  float band = floor(vUv.y * 24.0);
  float g = step(0.985, hash(floor(uTime * 6.0) + band * 0.37)) * (hash(band + uTime) - 0.5) * 0.04;
  vec3 c = texture2D(uMap, vUv + vec2(g, 0.0)).rgb;
  // 走査線と、上へ流れる明るい帯
  float scan = 0.82 + 0.18 * sin(vH * 46.0 - uTime * 7.0);
  float sweep = smoothstep(0.0, 0.08, 0.08 - abs(fract(vUv.y * 0.6 - uTime * 0.22) - 0.5) * 0.16) * 0.5;
  float flicker = 0.92 + 0.08 * sin(uTime * 23.0 + uSeed) * sin(uTime * 3.1);
  c *= uTint * uGain * scan * flicker;
  c += c * sweep;
  // 縁を少しだけ消す（四角い板の端が見えないように）
  vec2 e = smoothstep(vec2(0.0), vec2(0.06), vUv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - vUv);
  c *= e.x * e.y;
  // 白い建物の前でも見えるように、明るさを不透明度にした「乗算済みアルファ」で重ねる（黒は透明）
  float a = clamp(max(c.r, max(c.g, c.b)) * 1.15, 0.0, 0.92);
  gl_FragColor = vec4(c, a);
}
`

export function buildHoloAds(c: FCtx, root: THREE.Group): void {
  const loader = new THREE.TextureLoader()
  const group = new THREE.Group()
  group.name = 'holoAds'
  root.add(group)
  const coneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 1.4), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  coneMat.name = 'f2086-holoCone'
  const items: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; def: AdDef; ph: number }> = []
  ADS.forEach((def, i) => {
    const tex = loader.load(`./textures/holo2086/${def.name}.webp`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uMap: { value: tex }, uTime, uSeed: { value: i * 7.3 }, uTint: { value: new THREE.Vector3(...def.tint) }, uGain: { value: 1.0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    })
    mat.name = 'f2086-holoAd-' + def.name
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size), mat)
    mesh.position.set(...def.pos)
    mesh.rotation.y = def.yaw
    mesh.renderOrder = 5
    mesh.frustumCulled = false
    group.add(mesh)
    items.push({ mesh, base: mesh.position.clone(), def, ph: i * 1.7 })
    // 投影機（建物の床板の縁に載る小さな台）と光の円錐
    const fx = Math.sin(def.yaw)
    const fz = Math.cos(def.yaw)
    const px = def.pos[0] - fx * 0.6
    const pz = def.pos[2] - fz * 0.6
    const py = def.pos[1] - def.size * 0.5 - 0.9
    c.b.add(new THREE.CylinderGeometry(0.42, 0.5, 0.3, 18), c.fm.plastic, M(px, py, pz), { tint: '#f4f7fa' })
    c.b.add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 18), c.fm.glow, M(px, py + 0.17, pz), { tint: NEON.cyan, cast: false })
    const coneH = def.size * 0.45
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(def.size * 0.32, 0.3, coneH, 20, 1, true), coneMat)
    cone.position.set(px, py + 0.2 + coneH / 2, pz)
    cone.renderOrder = 4
    group.add(cone)
  })
  c.updaters.push((_dt, t) => {
    for (const it of items) {
      const s = it.def.swim ?? 0
      it.mesh.position.copy(it.base)
      it.mesh.position.y += Math.sin(t * 0.8 + it.ph) * 0.25
      if (s > 0) {
        // 金魚：正面に沿って左右へゆっくり泳ぎ、尾びれ側へ少し傾く
        const k = Math.sin(t * 0.35 + it.ph)
        it.mesh.position.x += Math.cos(it.def.yaw) * k * s
        it.mesh.position.z -= Math.sin(it.def.yaw) * k * s
        it.mesh.rotation.z = Math.sin(t * 1.6 + it.ph) * 0.05
      } else it.mesh.rotation.z = Math.sin(t * 0.9 + it.ph) * 0.015
    }
  })
}
