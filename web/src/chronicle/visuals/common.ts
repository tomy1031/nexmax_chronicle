// v7 の共通の見た目で使う小さな道具：GLSL の雑音・カメラを向く板・解放・よく使う数学。
import * as THREE from 'three'
import { disposeObject3D } from '../../game/dispose'
import { OUTLINE } from '../../world/nexmax/materials'

/** 描画の高さ（画素）。シェル（game.ts）が resize のたびに入れている値を使い回す（粒の大きさを m で指定するため） */
export const VIEW_H = OUTLINE.viewportH

/** 値の雑音・fbm（2D と 3D）。シェーダの先頭に入れる */
export const NOISE_GLSL = /* glsl */ `
float cvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float cvHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float cvNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cvHash(i), cvHash(i + vec2(1.0, 0.0)), u.x), mix(cvHash(i + vec2(0.0, 1.0)), cvHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cvNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(cvHash3(i), cvHash3(i + vec3(1,0,0)), u.x), mix(cvHash3(i + vec3(0,1,0)), cvHash3(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(cvHash3(i + vec3(0,0,1)), cvHash3(i + vec3(1,0,1)), u.x), mix(cvHash3(i + vec3(0,1,1)), cvHash3(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float cvFbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * cvNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
/** ひびの線（セル雑音のふち）。0 = 線の上、1 = 離れている */
float cvCells(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  float d1 = 8.0; float d2 = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(cvHash3(i + g), cvHash3(i + g + 17.0), cvHash3(i + g + 41.0));
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
`

/**
 * カメラを向く板の頂点（ShaderMaterial の頂点シェーダで使う）。
 * 板の大きさは mesh.scale（x・y）。uRoll で画面の中で回す
 */
export const BILLBOARD_GLSL = /* glsl */ `
vec4 cvBillboard(vec3 pos, float roll) {
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  float cr = cos(roll); float sr = sin(roll);
  vec2 q = pos.xy * sc;
  c.xy += vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
  return c;
}
/** Y 軸だけ回してカメラを向く（立った切れ目など）。ワールド座標を返す */
vec3 cvBillboardY(vec3 pos) {
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  vec3 to = cameraPosition - c; to.y = 0.0;
  if (dot(to, to) < 1e-6) to = vec3(0.0, 0.0, 1.0);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), to));
  return c + right * pos.x * sc.x + vec3(0.0, pos.y * sc.y, 0.0);
}
`

/** 板 1 枚（1×1、中心が原点） */
let quadGeo: THREE.PlaneGeometry | null = null
export function unitQuad(): THREE.PlaneGeometry {
  if (!quadGeo) quadGeo = new THREE.PlaneGeometry(1, 1)
  return quadGeo
}

/** 部品の root をシーンから外して、配下の GPU 資源を解放する */
export function disposeRoot(root: THREE.Object3D): void {
  root.removeFromParent()
  disposeObject3D(root)
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const smooth = (x: number): number => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
export const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3)
export const easeIn = (x: number): number => Math.pow(clamp01(x), 3)
/** dt に強さ rate の指数の近づき（フレームレートによらない） */
export const approach = (cur: number, target: number, rate: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-rate * dt))

/** 決まった種の乱数（同じ種なら同じ並び） */
export function seeded(seed: number): () => number {
  let s = Math.floor(seed * 9973 + 1) % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** v を軸 axis のまわりに回すための、+Y を dir へ向ける四元数 */
const UP = new THREE.Vector3(0, 1, 0)
export function quatFromUp(dir: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromUnitVectors(UP, dir)
}

/** 色を明るさ k 倍にした新しい色（ブルームで光らせる色に） */
export function hot(c: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k)
}
