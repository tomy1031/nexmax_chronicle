// 手続き的な空（グラデーション＋太陽＋やわらかい積雲）。表示用ドームと IBL 用 PMREM を同じシェーダで作る。
import * as THREE from 'three'
import { uTime } from './materials'

export type SkyPalette = {
  zenith: THREE.ColorRepresentation
  upper: THREE.ColorRepresentation
  horizon: THREE.ColorRepresentation
  warm: THREE.ColorRepresentation
  ground: THREE.ColorRepresentation
  haze: THREE.ColorRepresentation
  cloudLit: THREE.ColorRepresentation
  cloudShade: THREE.ColorRepresentation
}

export const EDO_SKY: SkyPalette = {
  zenith: '#1f5fcf',
  upper: '#3f8fea',
  horizon: '#a9d4f6',
  warm: '#ffd9a8',
  ground: '#8a6a4c',
  haze: '#cfe0ee',
  cloudLit: '#fff6ea',
  cloudShade: '#a9b6cf',
}

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const frag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith, uUpper, uHorizon, uWarm, uGround, uHaze, uCloudLit, uCloudShade;
uniform float uTime;
uniform float uGroundMode;
uniform float uSunStrength;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sunDot = max(dot(d, uSunDir), 0.0);
  // 空のグラデーション
  vec3 col = mix(uHorizon, uUpper, smoothstep(0.0, 0.28, h));
  col = mix(col, uZenith, smoothstep(0.25, 0.9, h));
  // 太陽側の地平は暖色
  float warmAmt = pow(sunDot, 3.0) * (1.0 - smoothstep(0.0, 0.5, h));
  col = mix(col, uWarm, warmAmt * 0.65);
  // 雲（地平付近に積雲）
  if (h > 0.0) {
    vec2 p = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float n = fbm(p);
    float band = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.35, 0.75, h));
    float dens = smoothstep(0.52, 0.72, n + band * 0.12 - 0.04) * band;
    // 太陽方向へのずらしで自己影
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.08;
    float n2 = fbm(p + toSun);
    float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
    vec3 cloud = mix(uCloudShade, uCloudLit, lit);
    cloud += uWarm * pow(sunDot, 6.0) * 0.6;
    // 底は少し暗く
    cloud *= mix(0.85, 1.08, smoothstep(0.45, 0.7, n));
    col = mix(col, cloud, dens);
  }
  // 太陽
  col += uWarm * (pow(sunDot, 12.0) * 0.35 + pow(sunDot, 120.0) * 0.8) * uSunStrength;
  col += vec3(1.0, 0.9, 0.75) * smoothstep(0.9993, 0.9997, sunDot) * 25.0 * uSunStrength;
  // 地平線より下
  if (h < 0.0) {
    vec3 below = mix(uHaze, uGround, uGroundMode);
    col = mix(uHorizon, below, smoothstep(0.0, 0.08, -h));
  }
  gl_FragColor = vec4(col, 1.0);
}
`

export function makeSkyMaterial(pal: SkyPalette, sunDir: THREE.Vector3, groundMode: 0 | 1): THREE.ShaderMaterial {
  const c = (v: THREE.ColorRepresentation) => new THREE.Color(v)
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uZenith: { value: c(pal.zenith) },
      uUpper: { value: c(pal.upper) },
      uHorizon: { value: c(pal.horizon) },
      uWarm: { value: c(pal.warm) },
      uGround: { value: c(pal.ground) },
      uHaze: { value: c(pal.haze) },
      uCloudLit: { value: c(pal.cloudLit) },
      uCloudShade: { value: c(pal.cloudShade) },
      uTime: uTime,
      uGroundMode: { value: groundMode },
      uSunStrength: { value: 1 },
    },
  })
}

export function createSkyDome(pal: SkyPalette, sunDir: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), makeSkyMaterial(pal, sunDir, 0))
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  mesh.name = 'sky'
  return mesh
}

/** 空から IBL 用の環境マップを作る（地面側は暖かい照り返し色）。 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, pal: SkyPalette, sunDir: THREE.Vector3): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = new THREE.Scene()
  const mat = makeSkyMaterial(pal, sunDir, 1)
  mat.uniforms.uSunStrength.value = 0.25
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat)
  scene.add(mesh)
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 200)
  pmrem.dispose()
  mesh.geometry.dispose()
  mat.dispose()
  return rt.texture
}

/** HDRI（public/hdri/*.hdr）から IBL 用の環境マップを作る。失敗時は null。 */
export async function loadHDRIEnvironment(renderer: THREE.WebGLRenderer, url: string): Promise<THREE.Texture | null> {
  try {
    const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js')
    const hdr = await new HDRLoader().loadAsync(url)
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const rt = pmrem.fromEquirectangular(hdr)
    pmrem.dispose()
    hdr.dispose()
    return rt.texture
  } catch (e) {
    console.warn('[sky] HDRI を読めないので手続きの空で IBL を作ります', e)
    return null
  }
}
