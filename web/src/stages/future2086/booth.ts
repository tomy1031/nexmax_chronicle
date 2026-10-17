// ソラの IDO VR 展示ブース：リング型のポータル（中に昔の大阪のホログラム）、操作卓、部品の作業台、
// 白いテント（IDO EXPO 2086 の垂れ幕）、配線、フライトケース、年表のホロ。
// setRift(0..1) で展示画面が「本物の裂け目」へ変わる（渦・光の筋・床の光の裂け目・吸い込まれる破片）。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { uTime } from '../../render/materials'
import { mulberry32 } from '../../render/noise'
import { F } from './layout'
import { NEON, cable, fbox, flightCase, neon, rod, type FCtx } from './kit2086'
import { hangingCloth, holoSign } from './festival'
import { paintIdoScreen } from './textures2086'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 展示画面のシェーダ

const screenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const screenFrag = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uRift;
uniform float uPower;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  // ホログラム：わずかに揺らぐ走査線
  vec2 uv = vUv + vec2(sin(vUv.y * 38.0 + uTime * 2.7) * 0.0025, 0.0);
  // 裂け目：中心へ渦を巻いて吸い込まれる
  float swirl = uRift * (1.0 - r) * 5.5 + uRift * uTime * 1.4;
  float cs = cos(swirl);
  float sn = sin(swirl);
  vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) * mix(1.0, 0.45 + 0.55 * r, uRift);
  uv = mix(uv, q * 0.5 + 0.5, uRift);
  vec3 tex = texture2D(map, uv).rgb;
  float scan = 0.84 + 0.16 * sin(vUv.y * 320.0 - uTime * 7.0);
  float band = smoothstep(0.96, 1.0, fract(vUv.y * 1.5 - uTime * 0.3)) * 0.35;
  vec3 holo = tex * (scan + band) * 1.55;
  float edge = smoothstep(0.82, 1.0, r);
  holo += vec3(0.25, 0.85, 1.6) * edge * 1.4;
  // 光の筋と、細かい破片（ガラスの欠片のように）
  float rays = pow(abs(sin(a * 6.0 + uTime * 2.2 + r * 9.0)), 10.0) * (1.0 - r);
  vec2 cell = floor(q * 9.0 + uTime * 0.6);
  float shard = step(0.86, h21(cell)) * (0.5 + 0.5 * sin(uTime * 6.0 + h21(cell + 3.1) * 20.0));
  float core = exp(-r * r * 5.0);
  vec3 rift = vec3(0.75, 0.92, 1.0) * core * 2.6 + vec3(0.45, 0.75, 1.8) * rays * 2.4 + vec3(0.8, 0.9, 1.6) * shard * (1.0 - r) * 1.4;
  vec3 col = holo * max(uPower, uRift) * (1.0 + 0.35 * uRift) + rift * uRift;
  gl_FragColor = vec4(col, mix(0.9, 1.0, uRift) * max(uPower, uRift));
}
`

const crackVert = screenVert
const crackFrag = /* glsl */ `
uniform float uTime;
uniform float uRift;
varying vec2 vUv;
float h11(float x) { return fract(sin(x * 91.7) * 4375.85); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.y += 0.85;
  float r = length(p);
  float a = atan(p.x, p.y);
  float glow = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float ang = (fi / 9.0 - 0.5) * 2.4 + (h11(fi) - 0.5) * 0.3;
    float wig = sin(r * (9.0 + fi) + fi * 3.0) * 0.06 + sin(r * 23.0 + fi) * 0.025;
    float d = abs(a - ang - wig) * r;
    float len = uRift * (1.2 + h11(fi + 7.0) * 1.0);
    float line = smoothstep(0.035, 0.0, d) * smoothstep(len, len - 0.25, r);
    glow += line;
  }
  float pool = exp(-r * r * 6.0) * uRift;
  float flick = 0.85 + 0.15 * sin(uTime * 13.0);
  vec3 col = vec3(0.6, 0.9, 1.0) * glow * 3.5 * flick + vec3(0.4, 0.75, 1.6) * pool * 2.5;
  float alpha = clamp(glow + pool, 0.0, 1.0) * step(0.001, uRift);
  gl_FragColor = vec4(col * alpha, alpha);
}
`

const shardVert = /* glsl */ `
uniform float uTime;
uniform float uRift;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vA;
void main() {
  float life = fract(aSeed.x + uTime * (0.25 + aSeed.y * 0.35));
  float ang = aSeed.z * 6.2832 + life * (3.0 + aSeed.w * 3.0);
  float rad = mix(4.2, 0.1, life);
  vec3 p = vec3(cos(ang) * rad, sin(ang) * rad, (1.0 - life) * (1.5 + aSeed.w * 2.5));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.05 + aSeed.y * 0.09) * uPixelRatio * (600.0 / -mv.z) * step(0.01, uRift);
  vA = uRift * smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.85, 1.0, life));
}
`
const shardFrag = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = abs(c.x) + abs(c.y);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(0.8, 0.95, 1.6) * 2.4 * vA, vA);
}
`

export type BoothParts = {
  screen: THREE.Mesh
  /** 0 = ホログラム、1 = 本物の裂け目 */
  setRift(v: number): void
  /** 展示の電源（0 = 消えている、1 = ついている） */
  setPower(v: number): void
  rift: number
  /** ポータルの中心と正面（ワールド） */
  center: THREE.Vector3
  normal: THREE.Vector3
  light: THREE.PointLight
}

export function buildBooth(c: FCtx, root: THREE.Group): BoothParts {
  const B = F.BOOTH
  const P = F.PORTAL
  const rng = mulberry32(2071)
  // ---- 台座（丸い低い台。縁が光る）
  c.b.add(new THREE.CylinderGeometry(B.r, B.r + 0.08, B.h, 48), c.fm.plastic, M(B.x, B.h / 2, B.z), { tint: '#f1f3f6' })
  c.b.add(new THREE.CylinderGeometry(B.r - 0.25, B.r - 0.25, 0.02, 48), c.fm.navyGloss, M(B.x, B.h + 0.005, B.z))
  c.b.add(new THREE.TorusGeometry(B.r + 0.02, 0.03, 6, 72), c.fm.glow, M(B.x, B.h - 0.03, B.z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
  c.b.add(new THREE.TorusGeometry(B.r - 0.3, 0.015, 6, 72), c.fm.glow, M(B.x, B.h + 0.02, B.z, Math.PI / 2, 0, 0), { tint: NEON.blue, cast: false })
  // 当たり判定（円を十字の箱で近似）
  c.col.floor(B.x - B.r * 0.92, B.x + B.r * 0.92, B.z - B.r * 0.4, B.z + B.r * 0.4, B.h, 0.3)
  c.col.floor(B.x - B.r * 0.4, B.x + B.r * 0.4, B.z - B.r * 0.92, B.z + B.r * 0.92, B.h, 0.3)
  c.col.floor(B.x - B.r * 0.7, B.x + B.r * 0.7, B.z - B.r * 0.7, B.z + B.r * 0.7, B.h, 0.3)

  // ---- リング型のポータル
  const center = v(P.x, P.y, P.z)
  const normal = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
  const ringM = (lx: number, ly: number, lz: number, rx = 0, ry = 0, rz = 0, s = 1) => {
    const m = new THREE.Matrix4().compose(v(lx, ly, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v(s, s, s))
    return new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, P.yaw, 0)), v(1, 1, 1)).multiply(m)
  }
  c.b.add(new THREE.TorusGeometry(P.r + 0.2, 0.27, 18, 80), c.fm.plastic, ringM(0, 0, 0), { tint: '#f4f6f9' })
  c.b.add(new THREE.TorusGeometry(P.r + 0.2, 0.2, 12, 80), c.fm.navyGloss, ringM(0, 0, -0.12))
  c.b.add(new THREE.TorusGeometry(P.r + 0.02, 0.05, 8, 80), c.fm.glow, ringM(0, 0, 0.05), { tint: NEON.cyan, cast: false })
  c.b.add(new THREE.TorusGeometry(P.r + 0.5, 0.025, 6, 96), c.fm.glow, ringM(0, 0, 0.1), { tint: NEON.blue, cast: false })
  // 金具（リングの外周に 12 個）
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const rr = P.r + 0.22
    c.b.add(rbox(0.32, 0.5, 0.7, 0.06), c.fm.darkMetal, ringM(Math.cos(a) * rr, Math.sin(a) * rr, 0, 0, 0, a + Math.PI / 2))
    c.b.add(new THREE.SphereGeometry(0.045, 8, 6), c.fm.glow, ringM(Math.cos(a) * (rr + 0.22), Math.sin(a) * (rr + 0.22), 0.3), { tint: i % 3 === 0 ? NEON.warm : NEON.cyan, cast: false })
  }
  // 足（台座へ斜めに）と下の機械の箱
  const baseY = B.h
  for (const s of [-1, 1]) {
    const a = ringM(s * (P.r * 0.72), -P.r * 0.72, 0)
    const top = new THREE.Vector3().setFromMatrixPosition(a)
    const foot = new THREE.Vector3().setFromMatrixPosition(ringM(s * (P.r + 0.55), -P.y + baseY, 0))
    rod(c.b, c.fm.metal, top, foot, 0.11)
    c.b.add(rbox(0.6, 0.18, 0.8, 0.05), c.fm.darkMetal, new THREE.Matrix4().compose(foot.clone().setY(baseY + 0.09), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, P.yaw, 0)), v(1, 1, 1)))
  }
  c.b.add(rbox(1.6, 0.55, 1.0, 0.1), c.fm.plastic, ringM(0, -P.y + baseY + 0.27, -0.05), { tint: '#eef1f5' })
  c.b.add(rbox(1.2, 0.08, 0.02, 0.01), c.fm.glow, ringM(0, -P.y + baseY + 0.4, 0.46), { tint: NEON.cyan, cast: false })
  {
    const p = new THREE.Vector3().setFromMatrixPosition(ringM(0, -P.y + baseY + 0.3, 0))
    c.col.box(p.x, p.y, p.z, 1.7, 0.6, 1.1, P.yaw)
    // 足の当たり判定
    for (const s of [-1, 1]) {
      const f = new THREE.Vector3().setFromMatrixPosition(ringM(s * (P.r + 0.3), -P.y + baseY + 1, 0))
      c.col.box(f.x, f.y, f.z, 0.4, 2, 0.6, P.yaw)
    }
  }
  // 展示画面
  const screenMat = new THREE.ShaderMaterial({
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    uniforms: { map: { value: paintIdoScreen() }, uTime, uRift: { value: 0 }, uPower: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
  const screen = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.01, 72), screenMat)
  screen.position.copy(center)
  screen.rotation.y = P.yaw
  screen.renderOrder = 4
  screen.name = 'idoScreen'
  root.add(screen)
  // 床の光の裂け目（ポータルの前）
  const crackMat = new THREE.ShaderMaterial({
    vertexShader: crackVert,
    fragmentShader: crackFrag,
    uniforms: { uTime, uRift: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), crackMat)
  crack.rotation.set(-Math.PI / 2, 0, P.yaw)
  crack.position.copy(center).addScaledVector(normal, 2.2).setY(B.h + 0.02)
  crack.renderOrder = 5
  crack.visible = false
  root.add(crack)
  // 吸い込まれる破片
  const N = 360
  const seeds = new Float32Array(N * 4)
  for (let i = 0; i < N * 4; i++) seeds[i] = rng()
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
  sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  const shardMat = new THREE.ShaderMaterial({
    vertexShader: shardVert,
    fragmentShader: shardFrag,
    uniforms: { uTime, uRift: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const shards = new THREE.Points(sg, shardMat)
  shards.position.copy(center)
  shards.rotation.y = P.yaw
  shards.frustumCulled = false
  shards.visible = false
  root.add(shards)
  // 光（数は固定：強さだけ変える）
  const light = new THREE.PointLight('#8fdcff', 0, 14, 2)
  light.position.copy(center).addScaledVector(normal, 1.0)
  root.add(light)
  c.lights.push({ pos: center.clone().addScaledVector(normal, 0.8), color: '#7fd8ff', intensity: 2.0, dist: 7 })

  // ---- 白いテント（ポータルの後ろ）と垂れ幕
  {
    const tz = B.z - 3.6
    const tx = B.x - 1.2
    const rot = P.yaw * 0.6
    const W = (lx: number, lz: number) => [tx + lx * Math.cos(rot) + lz * Math.sin(rot), tz - lx * Math.sin(rot) + lz * Math.cos(rot)] as const
    for (const [lx, lz] of [
      [-3.3, -1.4],
      [3.3, -1.4],
      [-3.3, 1.4],
      [3.3, 1.4],
    ] as const) {
      const [x, z] = W(lx, lz)
      const h = lz > 0 ? 3.6 : 3.2
      c.b.add(new THREE.CylinderGeometry(0.05, 0.06, h, 10), c.fm.metal, M(x, h / 2, z))
      c.col.box(x, h / 2, z, 0.14, h, 0.14)
    }
    // 屋根（ゆるい弧）
    // 弧の中心が真上に来るよう θ を π/2 のまわりに取り、X 軸（テントの幅の方向）の筒にする
    const R = 5.0
    const roof = new THREE.CylinderGeometry(R, R, 6.9, 24, 1, true, Math.PI / 2 - 0.36, 0.72)
    roof.rotateZ(Math.PI / 2)
    const [rx, rz] = W(0, 0)
    c.b.add(roof, c.fm.plastic, M(rx, 3.75 - R, rz, 0, rot, 0), { tint: '#fbfbf8' })
    c.b.add(roof, c.fm.navyGloss, M(rx, 3.72 - R, rz, 0, rot, 0, 0.995, 0.995, 0.995), { tint: '#ffffff', cast: false })
    const [vx, vz] = W(0, 1.95)
    hangingCloth(c, 'tent_ido', vx, 3.3, vz, 5.6, 1.4, rot, 0.25)
    // テントの下の照明
    neon(c, v(...xz(W(-3.2, 1.3), 3.55)), v(...xz(W(3.2, 1.3), 3.55)), 0.04, NEON.white)
  }

  // ---- 操作卓（ソラの作業場所）
  {
    const Cn = F.CONSOLE
    const rot = Cn.rot
    const at = (lx: number, ly: number, lz: number, rx = 0) => M(Cn.x + lx * Math.cos(rot) + lz * Math.sin(rot), ly, Cn.z - lx * Math.sin(rot) + lz * Math.cos(rot), rx, rot, 0)
    c.b.add(rbox(1.8, 0.9, 0.8, 0.06), c.fm.plastic, at(0, B.h + 0.45, 0), { tint: '#eef1f5' })
    c.b.add(rbox(1.84, 0.05, 0.84, 0.02), c.fm.navyGloss, at(0, B.h + 0.92, 0))
    // 卓の上の、手前へ傾いた低い画面 2 枚（向こうに立つソラの顔を隠さない高さ）
    const pr = c.fm.atlases.decal.get('panel_lines')
    for (const lx of [-0.45, 0.45]) {
      c.b.add(rbox(0.8, 0.05, 0.42, 0.02), c.fm.darkMetal, at(lx, B.h + 1.04, -0.16, -0.55))
      const g = new THREE.PlaneGeometry(0.74, 0.36)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pr.u0 + (pr.u1 - pr.u0) * uv.getX(i), pr.v0 + (pr.v1 - pr.v0) * uv.getY(i))
      g.rotateX(-Math.PI / 2)
      c.b.add(g, c.fm.screen, at(lx, B.h + 1.068, -0.16, -0.55), { cast: false })
    }
    // 光るキーボード
    c.b.add(new THREE.BoxGeometry(0.9, 0.015, 0.25), c.fm.glow, at(0, B.h + 0.955, 0.12), { tint: new THREE.Color(0.25, 0.7, 1.1), cast: false })
    const p = new THREE.Vector3().setFromMatrixPosition(at(0, B.h + 0.45, 0))
    c.col.box(p.x, p.y, p.z, 1.8, 0.9, 0.8, rot)
  }

  // ---- 部品の作業台
  {
    const T = F.PARTS_TABLE
    const rot = T.rot
    const at = (lx: number, ly: number, lz: number, ry = 0) => M(T.x + lx * Math.cos(rot) + lz * Math.sin(rot), ly, T.z - lx * Math.sin(rot) + lz * Math.cos(rot), 0, rot + ry, 0)
    c.b.add(rbox(2.0, 0.06, 0.9, 0.02), c.fm.plastic, at(0, 0.92, 0), { tint: '#f4f6f8' })
    for (const [lx, lz] of [
      [-0.9, -0.38],
      [0.9, -0.38],
      [-0.9, 0.38],
      [0.9, 0.38],
    ] as const)
      c.b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), c.fm.metal, at(lx, 0.45, lz))
    c.b.add(rbox(1.9, 0.04, 0.8, 0.01), c.fm.darkMetal, at(0, 0.3, 0))
    // 工具と部品
    c.b.add(rbox(0.5, 0.22, 0.28, 0.03), c.m.lacquerRed, at(-0.6, 1.06, -0.15, 0.2), { tint: '#ffffff' })
    for (let i = 0; i < 5; i++) c.b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), c.fm.metal, at(-0.1 + i * 0.12, 0.99, 0.25))
    for (let i = 0; i < 4; i++) c.b.add(new THREE.SphereGeometry(0.05, 10, 8), c.m.brass, at(0.3 + i * 0.1, 0.99, -0.25))
    // 古い腕のパーツ（ネクマックスの予備の腕：水色の玉の関節）
    for (let i = 0; i < 3; i++) c.b.add(new THREE.SphereGeometry(0.075 - i * 0.008, 14, 10), c.m.plain, at(0.55 + i * 0.13, 1.01, 0.12), { tint: '#7cc0f2' })
    c.b.add(new THREE.CapsuleGeometry(0.05, 0.22, 4, 10), c.m.plain, at(0.72, 1.0, 0.12, Math.PI / 2), { tint: '#6fb4ec' })
    // レンチ
    c.b.add(rbox(0.32, 0.02, 0.04, 0.005), c.fm.metal, at(-0.1, 0.965, -0.2, 0.5))
    const p = new THREE.Vector3().setFromMatrixPosition(at(0, 0.5, 0))
    c.col.box(p.x, p.y, p.z, 2.0, 1.0, 0.9, rot)
  }

  // ---- 配線（ポータル → 操作卓・発電機）
  {
    const base = new THREE.Vector3().setFromMatrixPosition(ringM(0.4, -P.y + B.h + 0.05, 0.3))
    const cn = v(F.CONSOLE.x, B.h + 0.04, F.CONSOLE.z)
    const gen = v(B.x - 3.2, 0.05, B.z + 3.8)
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 0.12
      cable(c, [base.clone().add(v(off, 0, 0)), base.clone().lerp(cn, 0.35).add(v(off + 0.3, 0, 0.2)), base.clone().lerp(cn, 0.7).add(v(off - 0.2, 0, -0.1)), cn.clone().add(v(off, 0, 0))], 0.035, k === 1 ? '#3a5fd8' : '#ffffff')
    }
    cable(c, [base.clone().add(v(-0.5, 0, 0)), v(B.x - 2.0, B.h + 0.04, B.z + 1.4), v(B.x - 2.9, 0.04, B.z + 3.0), gen.clone().add(v(0.2, 0, -0.4))], 0.05)
    // 発電機
    fbox(c, c.fm.plastic, gen.x, 0.45, gen.z, 1.1, 0.9, 0.8, { r: 0.08, tint: '#eef1f5' })
    for (const s of [-0.25, 0.25]) c.b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18), c.fm.darkMetal, M(gen.x + s, 0.6, gen.z + 0.41, Math.PI / 2, 0, 0))
    neon(c, v(gen.x - 0.5, 0.86, gen.z + 0.41), v(gen.x + 0.5, 0.86, gen.z + 0.41), 0.03, NEON.green)
    c.col.box(gen.x, 0.45, gen.z, 1.1, 0.9, 0.8)
  }

  // ---- フライトケース（IDO EXPO 2086）
  const ido = c.fm.atlases.decal.get('ido_logo')
  const nx = c.fm.atlases.decal.get('nexmax')
  const fr = c.fm.atlases.decal.get('fragile')
  // ポータルの左右と後ろに積む（正面＝広場側は空けて、リングとソラが見えるように）
  const loc = (lx: number, lz: number) => {
    const cs = Math.cos(P.yaw)
    const sn = Math.sin(P.yaw)
    return [P.x + lx * cs + lz * sn, P.z - lx * sn + lz * cs] as const
  }
  const caseAt = (lx: number, lz: number, y: number, w: number, h: number, d: number, rot: number, decal?: typeof ido) => {
    const [x, z] = loc(lx, lz)
    flightCase(c, x, y, z, w, h, d, P.yaw + rot, decal)
  }
  caseAt(-3.4, 0.6, 0, 1.3, 0.8, 0.8, 0.15, ido)
  caseAt(-3.3, 0.65, 0.8, 0.9, 0.55, 0.65, -0.1, fr)
  caseAt(-4.5, 1.9, 0, 1.0, 0.7, 0.7, 0.5, nx)
  caseAt(-2.6, -1.4, 0, 1.2, 0.75, 0.8, -0.2, ido)
  caseAt(3.6, -1.2, 0, 1.1, 0.8, 0.8, 0.1, ido)
  caseAt(4.6, 0.2, 0, 0.9, 0.6, 0.7, -0.3)
  flightCase(c, F.PARTS_TABLE.x + 1.8, 0, F.PARTS_TABLE.z - 0.9, 1.1, 0.7, 0.7, 0.2, ido)
  flightCase(c, F.PARTS_TABLE.x + 1.85, 0.7, F.PARTS_TABLE.z - 0.85, 0.8, 0.5, 0.6, 0.35)
  // 部品箱の山（一番上は NMClaw で引き寄せる：clawTargets2086）
  {
    const S = F.CRATE_STACK
    flightCase(c, S.x, 0, S.z, 1.4, 1.0, 1.0, 0.15, ido)
    flightCase(c, S.x + 0.05, 1.0, S.z + 0.05, 1.2, 0.9, 0.9, -0.1, fr)
    flightCase(c, S.x - 0.05, 1.9, S.z - 0.02, 1.0, 0.85, 0.85, 0.25)
    flightCase(c, S.x + 1.3, 0, S.z + 0.4, 1.0, 0.8, 0.8, 0.6, nx)
    flightCase(c, S.x - 1.2, 0, S.z - 0.5, 0.9, 1.1, 0.8, -0.3)
  }
  // 年表のホロ（ポータルの左）
  {
    const p = new THREE.Vector3().setFromMatrixPosition(ringM(-P.r - 1.9, 0.2, 0.3))
    holoSign(c, 'timeline', p.x, p.y, p.z, 2.4, P.yaw + 0.25)
    c.b.add(new THREE.CylinderGeometry(0.05, 0.07, p.y - 0.4, 8), c.fm.metal, M(p.x, (p.y - 0.4) / 2 + B.h * 0, p.z))
  }


  let rift = 0
  const parts: BoothParts = {
    screen,
    center,
    normal,
    light,
    get rift() {
      return rift
    },
    setRift(x: number) {
      rift = Math.min(1, Math.max(0, x))
      screenMat.uniforms.uRift.value = rift
      crackMat.uniforms.uRift.value = rift
      shardMat.uniforms.uRift.value = rift
      crack.visible = rift > 0.001
      shards.visible = rift > 0.001
      light.intensity = rift * 9
    },
    setPower(x: number) {
      screenMat.uniforms.uPower.value = Math.min(1, Math.max(0, x))
    },
  }
  return parts
}

function xz(p: readonly [number, number], y: number): [number, number, number] {
  return [p[0], y, p[1]]
}
