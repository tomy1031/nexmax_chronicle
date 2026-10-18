// 祭りの人出：2086 年の明るい未来の服の人たち（ローポリのやわらかい人形をインスタンスで描く）。
// 形は crowdGeo.ts。素の体（全員）・髪型ごとの髪・上着の細部・外側の服・持ち物・ホロのコート・ホロの小物を
// それぞれ 1 つの InstancedMesh にし（付属品は持っている人だけ）、色・付属品の有無・ポーズは人ごとの色表（DataTexture）から
// 頂点シェーダで引く。光る線は同じシェーダの発光色（HDR・ブルーム）。影を落とすのは素の体だけ。
// 歩く人は脚と腕を振り（頂点シェーダで関節を回す）、立っている人は小さく揺れ、見回し、うちわをあおぎ、ペンライトを振る。
// 屋台の前・展示の前・ステージの前・回廊の上・北の通りに群れを置く。
// 夜（オルム）は広場の人がいなくなる（避難した）ことにして隠す。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { mulberry32, pick, range, type Rng } from '../../render/noise'
import type { ColliderList } from '../../world/colliders'
import { F } from './layout'
import { BIT, HAIR_STYLES, KIT, SK, SLOT, bodyGeo, gearGeo, hairGeo, holoCoatGeo, holoItemGeo, outerGeo, topGeo } from './crowdGeo'

type Role = 'stall' | 'stage' | 'booth' | 'plaza' | 'walkway' | 'street' | 'walker'

type Person = {
  pos: THREE.Vector3
  yaw: number
  h: number
  ph: number
  /** 歩く人：a ↔ b を往復（speed は m/s、t0 は位相） */
  walk?: { ax: number; az: number; bx: number; bz: number; speed: number; t0: number }
  /** 夜も残る（回廊の上・遠くの通り） */
  keepAtNight: boolean
  /** 導入編の演出で個別に隠す人の印（introProps2086.ts の INTRO_CROWD）。無ければ常に出る */
  tag?: string
  child: boolean
  role: Role
  /** 見た目の乱数（配置の乱数列は変えない） */
  seed: number
  outfitR: number
  skinR: number
  hairR: number
  style: number
  /** 歩きの脚の周期（rad/s） */
  freq: number
  flags: number
}

// ---------------------------------------------------------------- 色（sRGB）
const TOP_LIGHT = ['#f6f7fb', '#eceff5', '#dde8f6', '#e8e1f6', '#fbe6ee', '#e2f5ee', '#fff4dc', '#d3dae6']
const TOP_MID = ['#3d7fd9', '#e0566f', '#2fb39a', '#f2994a', '#6a5acd', '#f2c230', '#3a9fd1', '#c4508f']
const TOP_PASTEL = ['#9ccdf4', '#b6a5ee', '#f5a6c6', '#9be0c6', '#ffd387', '#a5e3ef', '#c9b8ff', '#b8e3a8']
const TOP_DARK = ['#1e2337', '#28304f', '#22386a', '#373b4b', '#17191f', '#47397a', '#1f4a5a']
const TOP_BRIGHT = ['#ff8a5c', '#ffcf3f', '#4fc3f7', '#7ee08a', '#ff6fa8', '#8a7dff', '#ffffff', '#5ee0d0']
const BOT_DARK = ['#1c2135', '#29314d', '#3a4767', '#2e3442', '#15171f', '#4a5a8c']
const BOT_LIGHT = ['#e8ebf1', '#c9ced9', '#d8ccb4', '#a9b6cc', '#f2efe8']
const SHOES = ['#f7f8fb', '#eef1f6', '#1f222c', '#a9bce0', '#f2cadb', '#d9f0e6', '#ffd9a0']
const SOLES = ['#ffffff', '#eef2f8', '#cfd6e2', '#2a2d38']
const SKIN = ['#f7dcc8', '#f1cdb0', '#e5b896', '#d29f7a', '#b07a55', '#8a5a3c', '#fae3d3']
const HAIR_NAT = ['#1b1517', '#2a1e1a', '#3b2a21', '#56392a', '#76503a', '#121318']
const HAIR_DYE = ['#63d2c3', '#f39bc2', '#b3a2f2', '#e8ecf4', '#78b6ff', '#ffd47e', '#ff8f7a']
const ACC = ['#28304f', '#f2f4f8', '#ff8fb8', '#5fc8e8', '#ffcf5a', '#7d6cf0', '#1c2032', '#e9e2f7']
const VEST = ['#27328a', '#d6304a', '#f4f4f8', '#1c2032', '#2a6fd6']
const DRONE = ['#f4f6fa', '#e8ecf3', '#dfe8f5']
const HOLO = ['#bfe9ff', '#ffd1ec', '#dcd0ff', '#d5fff3', '#ffffff']
/** 光る線（HDR・線形） */
const GLOW: ReadonlyArray<readonly [number, number, number]> = [
  [0.35, 2.4, 3.4], // シアン
  [0.35, 2.4, 3.4],
  [0.35, 2.4, 3.4],
  [3.4, 0.7, 2.0], // ピンク
  [3.4, 0.7, 2.0],
  [1.9, 0.9, 3.8], // バイオレット
  [1.9, 0.9, 3.8],
  [1.5, 3.2, 0.55], // ライム
  [2.4, 2.9, 3.6], // 白
]
const DARK = new THREE.Color('#17121a')

// ---------------------------------------------------------------- シェーダ
const P = (n: number) => n.toFixed(4)
const DEFS = `
#define C_HIP_Y ${P(SK.HIP_Y)}
#define C_LEG_X ${P(SK.LEG_X)}
#define C_KNEE_Y ${P(SK.KNEE_Y)}
#define C_SH_X ${P(SK.SH_X)}
#define C_SH_Y ${P(SK.SH_Y)}
#define C_ELB_Y ${P(SK.ELB_Y)}
#define C_NECK_Y ${P(SK.NECK_Y)}
`
const VERT_HEAD = /* glsl */ `
uniform sampler2D uCrowdPal;
uniform float uTime;
attribute vec3 aCrowd;
attribute float aPerson;
#ifdef CROWD_COLOR
varying vec3 vCrowdCol;
varying float vCrowdA;
varying float vCrowdIri;
varying float vCrowdGlow;
#endif
vec4 crowdPx(int s) { return texelFetch(uCrowdPal, ivec2(s, int(aPerson + 0.5)), 0); }
mat3 crowdRX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 crowdRY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 crowdRZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void crowdRot(inout vec3 p, inout vec3 n, mat3 R, vec3 pv) { p = R * (p - pv) + pv; n = R * n; }
void crowdXf(inout vec3 p, inout vec3 n) {
  vec4 a3 = crowdPx(${SLOT.A3});
  if (aCrowd.z > -0.5) {
    int fl = int(a3.z + 0.5);
    if (((fl >> int(aCrowd.z + 0.5)) & 1) == 0) { p = vec3(0.0); return; }
  }
  int limb = int(aCrowd.x + 0.5);
  if (limb == 0) return;
  vec4 a0 = crowdPx(${SLOT.A0});
  float ph = uTime * a0.x + a0.y;
  float sw = sin(ph);
  float cw = cos(ph);
  float hipL = a0.z * sw;
  if (limb <= 4) {
    bool left = limb <= 2;
    float sx = left ? -C_LEG_X : C_LEG_X;
    if (limb == 2 || limb == 4) {
      float kb = a0.z * 1.25 * max(0.0, left ? cw : -cw);
      crowdRot(p, n, crowdRX(-kb), vec3(sx, C_KNEE_Y, 0.0));
    }
    crowdRot(p, n, crowdRX(left ? hipL : -hipL), vec3(sx, C_HIP_Y, 0.0));
    return;
  }
  if (limb == 11) {
    float k = smoothstep(-0.08, 0.08, p.x);
    float f = clamp((C_HIP_Y - p.y) / 0.32, 0.0, 1.0);
    crowdRot(p, n, crowdRX(mix(hipL, -hipL, k) * 0.55 * f), vec3(0.0, C_HIP_Y, 0.0));
    return;
  }
  if (limb <= 8 || limb == 12) {
    vec4 a1 = crowdPx(${SLOT.A1});
    vec4 a2 = crowdPx(${SLOT.A2});
    vec4 a4 = crowdPx(${SLOT.A4});
    bool left = limb <= 6;
    float sx = left ? -C_SH_X : C_SH_X;
    float wave = sin(uTime * a2.w + a4.y);
    float idle = sin(uTime * 1.1 + a0.y * 1.7 + (left ? 0.0 : 1.9)) * a3.w;
    float swing = a0.z * 0.85 * sw;
    float shX = left ? (a1.x - swing + idle) : (a1.z + swing + idle);
    float shZ = left ? -(0.085 + a4.z) : (0.085 + a2.x + a2.y * wave);
    float elX = left ? a1.y + max(0.0, -swing) * 0.7 : a1.w + a2.z * wave + max(0.0, swing) * 0.7;
    if (limb == 6 || limb == 8 || limb == 12) {
      vec3 ep = vec3(sx, C_ELB_Y, 0.0);
      if (limb == 12) crowdRot(p, n, crowdRY(a3.x * wave), ep);
      crowdRot(p, n, crowdRX(elX + 0.1), ep);
    }
    crowdRot(p, n, crowdRZ(shZ) * crowdRX(shX), vec3(sx, C_SH_Y, 0.0));
    return;
  }
  if (limb == 9) {
    vec4 a4 = crowdPx(${SLOT.A4});
    vec3 np = vec3(0.0, C_NECK_Y, 0.0);
    p = (p - np) * a0.w + np;
    float turn = sin(uTime * 0.31 + a0.y * 2.3) * a3.y;
    float nod = a4.x + sin(uTime * 0.53 + a0.y) * 0.035 + abs(sw) * a0.z * 0.05;
    crowdRot(p, n, crowdRY(turn) * crowdRX(-nod), np);
    return;
  }
  if (limb == 10) {
    p.y += sin(uTime * 2.3 + a0.y) * 0.035;
    p.x += sin(uTime * 0.8 + a0.y * 1.3) * 0.025;
  }
}
`
const VERT_COLOR = /* glsl */ `
#ifdef CROWD_COLOR
{
  int cs = int(aCrowd.y + 0.5);
  vec4 cc = crowdPx(cs);
  vCrowdCol = cc.rgb;
  vCrowdA = cc.a;
  vCrowdIri = position.y * 2.4 + position.x * 1.7;
  vCrowdGlow = (cs == ${SLOT.GLOW_A} || cs == ${SLOT.GLOW_B}) ? 1.0 : 0.0;
}
#endif
`
const FRAG_HEAD = /* glsl */ `
varying vec3 vCrowdCol;
varying float vCrowdA;
varying float vCrowdIri;
varying float vCrowdGlow;
`

type CrowdMatOpts = { color?: boolean; rim?: number; holo?: boolean }

function crowdMaterial<T extends THREE.Material>(mat: T, key: string, palU: { value: THREE.Texture }, o: CrowdMatOpts): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCrowdPal = palU
    sh.uniforms.uTime = uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${o.color ? '#define CROWD_COLOR\n' : ''}${DEFS}${VERT_HEAD}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec3 cp = position; crowdXf(cp, objectNormal); }')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n{ vec3 cn = vec3(0.0, 1.0, 0.0); crowdXf(transformed, cn); }\n${VERT_COLOR}`)
    if (!o.color) return
    let frag = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= vCrowdCol;\n${o.holo ? 'diffuseColor.a *= vCrowdA;' : ''}`)
    if (o.rim) {
      frag = frag.replace(
        '#include <opaque_fragment>',
        `{ float fr = 1.0 - abs(dot(normal, normalize(vViewPosition))); outgoingLight += vCrowdCol * fr * fr * fr * ${o.rim.toFixed(3)}; }\n#include <opaque_fragment>`,
      )
    }
    if (o.holo) {
      frag = frag.replace(
        '#include <opaque_fragment>',
        `{
          float fr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
          vec3 rb = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + fr * 1.1 + vCrowdIri));
          outgoingLight = outgoingLight * 0.55 + rb * (0.22 + 0.95 * fr * fr) * mix(vec3(1.0), vCrowdCol, 0.5);
          diffuseColor.a = clamp(diffuseColor.a + fr * fr * 0.5, 0.0, 0.9);
        }
        #include <opaque_fragment>`,
      )
    }
    // 光る線：照明を使わず HDR の色そのもの（ブルームで光る）
    frag = frag.replace('#include <opaque_fragment>', 'if (vCrowdGlow > 0.5) { outgoingLight = vCrowdCol; diffuseColor.a = 1.0; }\n#include <opaque_fragment>')
    sh.fragmentShader = frag
  }
  mat.customProgramCacheKey = () => `crowd2086-${key}`
  return mat
}

/** 立っている人 1 人（読み取り専用。話しかけ・吹き出しの相手を選ぶため。mobTalk2086.ts） */
export type CrowdSpot = {
  /** 足元の位置 */
  readonly pos: Readonly<THREE.Vector3>
  /** 頭のてっぺんまでの高さ（m） */
  readonly top: number
  readonly role: Exclude<Role, 'walker'>
  readonly child: boolean
  /** 夜（オルム）も残る（回廊の上・北の通り）。それ以外は夜に隠れる */
  readonly keepAtNight: boolean
}

export type Crowd = {
  group: THREE.Group
  update(dt: number): void
  setNight(on: boolean): void
  /** 立っている人の一覧（歩く人は入れない。見た目・配置には関係しない読み取り専用の写し） */
  readonly standing: readonly CrowdSpot[]
  /** 印（tag）の付いた人を隠す・出す（導入編：リングの中の体験客・運営本部の実行委員など） */
  setHidden(tag: string, hidden: boolean): void
}

/** 導入編（docs/シナリオ改訂案_導入編_v1.md 1-2・4章）で足す人。配置の乱数列の最後に足すので、ほかの人の見た目・位置は変わらない */
export const INTRO_CROWD: ReadonlyArray<{ tag: string; x: number; y: number; z: number; yaw: number; role: Exclude<Role, 'walker'>; child?: boolean }> = [
  // リングの中で体験中の客（下の機械の箱の上に立つ。見回す）
  { tag: 'ring_visitor', x: F.PORTAL.x + Math.sin(F.PORTAL.yaw) * 0.3, y: 0.725, z: F.PORTAL.z + Math.cos(F.PORTAL.yaw) * 0.3, yaw: F.PORTAL.yaw + Math.PI, role: 'booth' },
  // 体験待ちの列（ブースの西の縁から南西へ）
  { tag: 'queue', x: -11.0, y: 0, z: 1.7, yaw: 2.6, role: 'street' },
  { tag: 'queue', x: -11.8, y: 0, z: 2.7, yaw: 2.6, role: 'street', child: true },
  { tag: 'queue', x: -12.6, y: 0, z: 3.6, yaw: 2.55, role: 'street' },
  { tag: 'queue', x: -13.3, y: 0, z: 4.5, yaw: 2.5, role: 'street' },
  // 南の入口の運営本部（テントの机の向こう。広場を向く）
  { tag: 'hq_staff', x: 6.4, y: 0, z: 17.6, yaw: 0, role: 'street' },
]

export function buildCrowd(root: THREE.Group, col: ColliderList | null): Crowd {
  const rng = mulberry32(8086)
  const people: Person[] = []
  type AddOpts = { y?: number; keep?: boolean; walk?: Person['walk']; child?: boolean; collide?: boolean; role?: Role }
  const add = (x: number, z: number, yaw: number, o: AddOpts = {}) => {
    // 配置の乱数列を以前と同じに保つため、1 人あたりちょうど 7 回引く
    const h = o.child ? range(rng, 1.0, 1.2) : range(rng, 1.5, 1.74)
    const ph = rng() * 10
    const seed = Math.floor(rng() * 0x7fffffff)
    const outfitR = rng()
    const skinR = rng()
    const hairR = rng()
    const style = Math.floor(rng() * HAIR_STYLES) % HAIR_STYLES
    const stride = 0.74 * (h / 1.65)
    people.push({
      pos: new THREE.Vector3(x, o.y ?? 0, z),
      yaw,
      h,
      ph,
      walk: o.walk,
      keepAtNight: !!o.keep,
      child: !!o.child,
      role: o.role ?? (o.walk ? 'walker' : 'plaza'),
      seed,
      outfitR,
      skinR,
      hairR,
      style,
      freq: o.walk ? (Math.PI * o.walk.speed) / stride : 0,
      flags: 0,
    })
    if (col && (o.collide ?? ((o.y ?? 0) < 1 && !o.walk))) col.box(x, 0.8, z, 0.42, 1.6, 0.42)
  }
  const look = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z)) + range(rng, -0.35, 0.35)
  const group2 = (cx: number, cz: number, n: number, r: number, tx: number, tz: number, o: { y?: number; keep?: boolean; role?: Role } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2
      const rr = Math.sqrt(rng()) * r
      const x = cx + Math.cos(a) * rr
      const z = cz + Math.sin(a) * rr
      add(x, z, look(x, z, tx, tz), { ...o, child: rng() < 0.15 })
    }
  }
  // 屋台の前（列）
  for (const z of F.STALLS.zs) group2(F.STALLS.x - F.STALLS.d / 2 - 1.6, z + range(rng, -0.6, 0.6), 3, 0.9, F.STALLS.x, z, { role: 'stall' })
  // ステージの前（観客）
  group2((F.STAGE.x0 + F.STAGE.x1) / 2 - 0.4, F.STAGE.z1 + 2.6, 7, 1.8, (F.STAGE.x0 + F.STAGE.x1) / 2, (F.STAGE.z0 + F.STAGE.z1) / 2, { role: 'stage' })
  // 展示の前（少し離れて見物）
  group2(F.BOOTH.x + 4.6, F.BOOTH.z + 5.6, 3, 1.0, F.PORTAL.x, F.PORTAL.z, { role: 'booth' })
  // 広場の中のあちこち（2〜3 人の連れ）
  for (const [x, z] of [
    [-3.2, 12.2],
    [9.6, 4.8],
    [-1.0, -10.6],
    [10.4, -3.8],
    [-12.6, 6.4],
    [9.2, 13.2],
  ] as const) group2(x, z, 2 + Math.floor(rng() * 2), 0.7, x + range(rng, -3, 3), z + range(rng, -3, 3), { role: 'plaza' })
  // 回廊の上（手すりに沿って）
  for (let z = 8; z > -14; z -= 2.6) if (rng() < 0.7) add(F.WALK_W.x1 - 0.7 - rng() * 0.6, z, -Math.PI / 2 + range(rng, -0.6, 0.6), { y: F.WALK_Y, keep: true, collide: false, role: 'walkway' })
  for (let x = -14; x < 19; x += 2.4) {
    if (x > F.GAP.x0 - 1.2 && x < F.GAP.x1 + 1.2) continue
    if (rng() < 0.6) add(x, F.WALK_N.z1 - 0.7 - rng() * 0.8, Math.PI + range(rng, -0.6, 0.6), { y: F.WALK_Y, keep: true, collide: false, role: 'walkway' })
  }
  // 北の通り（遠く・多く）
  for (let i = 0; i < 34; i++) {
    const z = range(rng, -24, -66)
    const x = range(rng, F.STREET.x0 + 0.8, F.STREET.x1 - 0.8)
    add(x, z, rng() < 0.5 ? 0 : Math.PI, { keep: true, collide: false, role: 'street' })
  }
  // 歩く人（広場の南側・北の回廊の下・通りを往復）
  const walkers: Array<[number, number, number, number]> = [
    [-6, 12.6, 12, 12.6],
    [12, 10.8, -4, 10.8],
    [-3.5, -11.6, 6.5, -11.6],
    [-1.5, -14, -1.5, -40],
    [2.5, -42, 2.5, -16],
    [-4, 16.5, 7, 9.5],
  ]
  walkers.forEach(([ax, az, bx, bz], i) => add(ax, az, 0, { walk: { ax, az, bx, bz, speed: range(rng, 0.9, 1.25), t0: i * 3.7 }, collide: false }))
  // 導入編で足す人（印付き。最後に足す）
  for (const x of INTRO_CROWD) {
    add(x.x, x.z, x.yaw, { y: x.y, role: x.role, child: x.child, collide: x.y < 0.5 })
    people[people.length - 1].tag = x.tag
  }
  const hiddenTags = new Set<string>()

  // ---------------------------------------------------------------- 見た目（色表）
  const N = people.length
  const W = SLOT.COUNT
  const pal = new Float32Array(W * N * 4)
  const tmp = new THREE.Color()
  const put = (i: number, slot: number, r: number, g: number, b: number, a = 1) => {
    const o = (i * W + slot) * 4
    pal[o] = r
    pal[o + 1] = g
    pal[o + 2] = b
    pal[o + 3] = a
  }
  const putC = (i: number, slot: number, hex: string | THREE.Color, a = 1) => {
    if (typeof hex === 'string') tmp.set(hex)
    else tmp.copy(hex)
    put(i, slot, tmp.r, tmp.g, tmp.b, a)
  }
  const chance = (r: Rng, p: number) => r() < p
  for (let i = 0; i < N; i++) {
    const p = people[i]
    const r = mulberry32(p.seed)
    const kid = p.child
    let fl = 0
    const on = (b: number) => {
      fl |= 1 << b
    }
    const skin = SKIN[Math.floor(p.skinR * SKIN.length) % SKIN.length]
    const hair = p.hairR < 0.26 ? pick(r, HAIR_DYE) : pick(r, HAIR_NAT)
    // 服の型
    const u = p.outfitR
    type Kind = 'hoodie' | 'jacket' | 'tee' | 'holo' | 'happi' | 'sport'
    const kind: Kind = kid ? (u < 0.38 ? 'hoodie' : u < 0.78 ? 'tee' : u < 0.9 ? 'happi' : 'holo') : u < 0.22 ? 'hoodie' : u < 0.42 ? 'jacket' : u < 0.58 ? 'tee' : u < 0.73 ? 'holo' : u < 0.84 ? 'happi' : 'sport'
    const tone = r()
    const lightTone = tone < 0.4
    let top = kid ? pick(r, r() < 0.5 ? TOP_BRIGHT : TOP_PASTEL) : lightTone ? pick(r, TOP_LIGHT) : tone < 0.62 ? pick(r, TOP_PASTEL) : tone < 0.8 ? pick(r, TOP_MID) : pick(r, TOP_DARK)
    let top2 = top
    // 上が明るければ下は濃く（白ずくめのマネキンにしない）
    let bottom = lightTone || tone < 0.62 ? (r() < 0.78 ? pick(r, BOT_DARK) : pick(r, BOT_LIGHT)) : r() < 0.5 ? pick(r, BOT_LIGHT) : pick(r, BOT_DARK)
    let shortSleeve = false
    let sportSleeve = ''
    let shorts = chance(r, kid ? 0.55 : 0.22)
    const gA = pick(r, GLOW)
    let gB = pick(r, GLOW)
    if (gB === gA) gB = GLOW[(GLOW.indexOf(gA) + 3) % GLOW.length]
    let acc = pick(r, ACC)
    const holoTint = pick(r, HOLO)
    switch (kind) {
      case 'hoodie':
        on(BIT.HOOD)
        top2 = r() < 0.5 ? top : pick(r, lightTone ? TOP_DARK : TOP_LIGHT)
        if (chance(r, 0.55)) on(BIT.ZIP)
        if (chance(r, 0.4)) on(BIT.SLEEVE)
        break
      case 'jacket':
        on(BIT.COLLAR)
        top = r() < 0.55 ? pick(r, TOP_LIGHT) : r() < 0.6 ? pick(r, TOP_PASTEL) : pick(r, TOP_MID)
        top2 = r() < 0.7 ? pick(r, TOP_DARK) : '#ffffff'
        bottom = r() < 0.75 ? pick(r, BOT_DARK) : pick(r, BOT_LIGHT)
        if (chance(r, 0.5)) {
          on(BIT.COAT)
          if (chance(r, 0.6)) on(BIT.COATTRIM)
        }
        if (chance(r, 0.6)) on(BIT.ZIP)
        if (chance(r, 0.3)) on(BIT.SLEEVE)
        shorts = false
        break
      case 'tee':
        shortSleeve = true
        top = kid ? top : r() < 0.35 ? pick(r, TOP_LIGHT) : r() < 0.6 ? pick(r, TOP_PASTEL) : pick(r, TOP_BRIGHT)
        top2 = top
        shorts = chance(r, kid ? 0.6 : 0.42)
        if (chance(r, 0.3)) on(BIT.CHEST)
        break
      case 'holo':
        on(BIT.HOLOCOAT)
        top = r() < 0.5 ? pick(r, TOP_LIGHT) : pick(r, TOP_DARK)
        top2 = top
        shortSleeve = chance(r, 0.4)
        bottom = r() < 0.3 ? pick(r, BOT_LIGHT) : pick(r, BOT_DARK)
        break
      case 'happi':
        on(BIT.VEST)
        acc = pick(r, VEST)
        top = acc === '#f4f4f8' ? pick(r, r() < 0.5 ? TOP_DARK : TOP_MID) : r() < 0.7 ? '#f7f8fb' : pick(r, TOP_PASTEL)
        top2 = top
        shortSleeve = chance(r, 0.6)
        bottom = r() < 0.7 ? pick(r, BOT_DARK) : '#f2efe8'
        break
      case 'sport':
        on(BIT.COLLAR)
        on(BIT.ZIP)
        on(BIT.SLEEVE)
        on(BIT.LEGLINE)
        top = r() < 0.5 ? pick(r, TOP_DARK) : pick(r, TOP_LIGHT)
        top2 = top
        bottom = r() < 0.6 ? pick(r, BOT_DARK) : top
        sportSleeve = r() < 0.6 ? pick(r, r() < 0.5 ? TOP_MID : TOP_PASTEL) : ''
        shorts = false
        break
    }
    // 小物
    if (chance(r, kid ? 0.2 : 0.3)) on(BIT.VISOR)
    else if (chance(r, 0.12)) on(BIT.PHONES)
    if (chance(r, kid ? 0.55 : 0.24) && kind !== 'holo') on(BIT.BACKPACK)
    if (chance(r, p.role === 'walker' ? 0.4 : 0.06) && p.role !== 'stage') on(BIT.DRONE)
    if (chance(r, 0.5)) on(BIT.SOLES)
    if (!shorts && chance(r, 0.16)) on(BIT.LEGLINE)
    if (kind !== 'holo' && kind !== 'happi' && chance(r, 0.1)) on(BIT.CHEST)

    // ポーズ（役ごと）
    let lShX = range(r, -0.03, 0.06)
    let lElX = range(r, 0.05, 0.25)
    let rShX = range(r, -0.03, 0.06)
    let rElX = range(r, 0.05, 0.25)
    let rShZ = 0
    let waveZ = 0
    let waveX = 0
    let waveF = 0
    let waveP = 0
    let twist = 0
    let headTurn = p.walk ? 0.12 : range(r, 0.12, 0.45)
    let pitch = range(r, -0.04, 0.06)
    let lShZ = 0
    const role = p.role
    const item = r()
    if (role === 'stage' && item < 0.62) {
      // ペンライトを頭の上で振る（みんなの拍がそろう）
      on(BIT.PENLIGHT)
      rShX = range(r, 2.55, 2.9)
      rElX = range(r, 0.1, 0.35)
      rShZ = range(r, 0.05, 0.2)
      waveZ = range(r, 0.28, 0.4)
      waveF = 6.6
      waveP = range(r, -0.25, 0.25)
      headTurn = 0.06
      pitch = -0.12
    } else if ((role === 'stage' && item < 0.85) || ((role === 'stall' || role === 'booth' || role === 'plaza' || role === 'walkway' || role === 'street') && item < 0.17)) {
      // ホロうちわ：顔の前であおぐ
      on(BIT.UCHIWA)
      rShX = range(r, 0.45, 0.65)
      rElX = range(r, 1.75, 2.05)
      rShZ = -0.05
      twist = range(r, 0.45, 0.7)
      waveF = range(r, 6.5, 8.5)
      waveP = r() * 6.28
      waveX = 0.06
    } else if ((role === 'stall' || role === 'booth' || role === 'plaza' || role === 'walkway') && item < 0.31) {
      // 空中の画面を見る（左手で操作）
      on(BIT.SCREEN)
      lShX = range(r, 0.45, 0.6)
      lElX = range(r, 1.1, 1.3)
      lShZ = -0.03
      pitch = range(r, 0.28, 0.38)
      headTurn = 0.05
    } else if (!p.walk && item < 0.45) {
      // 話している：片手を少し上げる
      rElX = range(r, 0.5, 0.9)
      rShX = range(r, 0.1, 0.25)
      waveX = 0.18
      waveF = range(r, 2.2, 3.2)
      waveP = r() * 6.28
    }
    const idle = p.walk ? 0 : range(r, 0.02, 0.05)
    p.flags = fl
    const kidHead = kid ? 1.24 : 1
    // 色
    putC(i, SLOT.TOP, top)
    putC(i, SLOT.TOP2, top2)
    putC(i, SLOT.BOTTOM, bottom)
    putC(i, SLOT.SHIN, shorts ? (kid || r() < 0.6 ? skin : pick(r, BOT_DARK)) : bottom)
    putC(i, SLOT.SHOE, pick(r, SHOES))
    putC(i, SLOT.SOLE, pick(r, SOLES))
    putC(i, SLOT.SKIN, skin)
    putC(i, SLOT.HAIR, hair)
    putC(i, SLOT.ARM_LO, shortSleeve ? skin : sportSleeve || top)
    putC(i, SLOT.ACC, acc)
    putC(i, SLOT.DARK, DARK)
    putC(i, SLOT.DRONE, pick(r, DRONE))
    put(i, SLOT.GLOW_A, gA[0], gA[1], gA[2])
    put(i, SLOT.GLOW_B, gB[0], gB[1], gB[2])
    putC(i, SLOT.HOLO, holoTint, range(r, 0.3, 0.42))
    // 動き
    put(i, SLOT.A0, p.freq, p.ph, p.walk ? 0.42 : 0, kidHead)
    put(i, SLOT.A1, lShX, lElX, rShX, rElX)
    put(i, SLOT.A2, rShZ, waveZ, waveX, waveF)
    put(i, SLOT.A3, twist, headTurn, fl, idle)
    put(i, SLOT.A4, pitch, waveP, lShZ, 0)
  }
  const palTex = new THREE.DataTexture(pal, W, N, THREE.RGBAFormat, THREE.FloatType)
  palTex.minFilter = THREE.NearestFilter
  palTex.magFilter = THREE.NearestFilter
  palTex.generateMipmaps = false
  palTex.needsUpdate = true
  const palU = { value: palTex as THREE.Texture }

  // ---------------------------------------------------------------- インスタンス
  const bodyMat = crowdMaterial(new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide }), 'body', palU, { color: true, rim: 0.22 })
  const holoMat = crowdMaterial(
    new THREE.MeshStandardMaterial({ roughness: 0.18, metalness: 0.1, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
    'holo',
    palU,
    { color: true, holo: true },
  )
  const depthMat = crowdMaterial(new THREE.MeshDepthMaterial(), 'depth', palU, {})
  const distMat = crowdMaterial(new THREE.MeshDistanceMaterial(), 'dist', palU, {})

  type Part = { mesh: THREE.InstancedMesh; idx: Int32Array }
  const parts: Part[] = []
  const mk = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, idx: number[], shadow: boolean) => {
    geo.setAttribute('aPerson', new THREE.InstancedBufferAttribute(new Float32Array(idx), 1))
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, idx.length))
    m.count = idx.length
    m.name = name
    m.frustumCulled = false
    m.castShadow = shadow
    m.receiveShadow = mat === bodyMat
    if (shadow) {
      m.customDepthMaterial = depthMat
      m.customDistanceMaterial = distMat
    }
    parts.push({ mesh: m, idx: Int32Array.from(idx) })
    return m
  }
  // 全員：素の体（影を落とすのはこれだけ）と髪型ごとの髪。付属品は持っている人だけのメッシュ
  const all = people.map((_, i) => i)
  const having = (mask: number) => all.filter((i) => (people[i].flags & mask) !== 0)
  mk('crowd-body', bodyGeo(), bodyMat, all, true)
  for (let st = 0; st < HAIR_STYLES; st++) {
    mk(
      `crowd-hair${st}`,
      hairGeo(st),
      bodyMat,
      all.filter((i) => people[i].style === st),
      false,
    )
  }
  mk('crowd-top', topGeo(), bodyMat, having(KIT.top), false)
  mk('crowd-outer', outerGeo(), bodyMat, having(KIT.outer), false)
  mk('crowd-gear', gearGeo(), bodyMat, having(KIT.gear), false)
  mk('crowd-holocoat', holoCoatGeo(), holoMat, having(KIT.holoCoat), false)
  mk('crowd-holoitem', holoItemGeo(), holoMat, having(KIT.holoItem), false)
  const group = new THREE.Group()
  group.name = 'crowd'
  for (const pt of parts) group.add(pt.mesh)
  root.add(group)

  // ---------------------------------------------------------------- 毎フレーム：体の位置と向き（関節はシェーダ）
  const mats = new Float32Array(N * 16)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler(0, 0, 0, 'YXZ')
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  let night = false
  const write = () => {
    const t = uTime.value
    for (let i = 0; i < N; i++) {
      const p = people[i]
      let visible = (!night || p.keepAtNight) && !(p.tag && hiddenTags.has(p.tag))
      let yaw = p.yaw + Math.sin(t * 0.7 + p.ph) * 0.05
      let pitch = 0
      let roll = Math.sin(t * 0.9 + p.ph * 1.3) * 0.012
      pos.copy(p.pos)
      const s0 = p.h / SK.TOP
      if (p.walk) {
        const w = p.walk
        const len = Math.hypot(w.bx - w.ax, w.bz - w.az)
        const d = ((t + w.t0) * w.speed) % (len * 2)
        const fwd = d < len
        const k = fwd ? d / len : 2 - d / len
        pos.set(w.ax + (w.bx - w.ax) * k, 0, w.az + (w.bz - w.az) * k)
        const dx = (w.bx - w.ax) * (fwd ? 1 : -1)
        const dz = (w.bz - w.az) * (fwd ? 1 : -1)
        yaw = Math.atan2(-dx, -dz)
        const ph = t * p.freq + p.ph
        pos.y += (1 - Math.abs(Math.sin(ph))) * 0.028 * s0
        roll = Math.sin(ph) * 0.025
        pitch = -0.05
        if (night) visible = false
      }
      const s = visible ? s0 : 0
      q.setFromEuler(e.set(pitch, yaw, roll, 'YXZ'))
      scl.set(s, s, s)
      m.compose(pos, q, scl)
      m.toArray(mats, i * 16)
    }
    for (const pt of parts) {
      const arr = pt.mesh.instanceMatrix.array as Float32Array
      const idx = pt.idx
      for (let k = 0; k < idx.length; k++) {
        const src = idx[k] * 16
        const dst = k * 16
        for (let j = 0; j < 16; j++) arr[dst + j] = mats[src + j]
      }
      pt.mesh.instanceMatrix.needsUpdate = true
    }
  }
  write()
  const standing: CrowdSpot[] = []
  for (const p of people) {
    if (p.walk || p.role === 'walker') continue
    standing.push({ pos: p.pos.clone(), top: p.pos.y + p.h * (p.child ? 1.04 : 1), role: p.role, child: p.child, keepAtNight: p.keepAtNight })
  }
  return {
    group,
    standing,
    update(dt: number) {
      void dt
      write()
    },
    setNight(on: boolean) {
      night = on
      write()
    },
    setHidden(tag: string, hidden: boolean) {
      if (hidden) hiddenTags.add(tag)
      else hiddenTags.delete(tag)
      write()
    },
  }
}
