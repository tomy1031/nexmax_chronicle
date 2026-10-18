// 後処理：N8AO（環境遮蔽）→ 層状のかすみ（距離と高さ）→ ブルーム＋色調（露出・ACES・彩度・コントラスト・暖色・周辺減光）→ SMAA。
// 画質（render/quality.ts）で AO・ブルーム・SMAA を外せる（setQuality でその場で組み直す）。
import * as THREE from 'three'
import { BloomEffect, BlendFunction, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import type { QualitySettings } from './quality'

const gradeFrag = /* glsl */ `
uniform float gExposure;
uniform float gSaturation;
uniform float gContrast;
uniform float gVignette;
uniform vec3 gLift;
uniform vec3 gGain;

vec3 gRRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 gACES(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color = ACESInputMat * color;
  color = gRRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * gExposure / 0.6;
  c = gACES(c);
  // 知覚空間で色調整
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, gSaturation);
  g = (g - 0.5) * gContrast + 0.5;
  g = g * gGain + gLift * (1.0 - g);
  vec2 q = uv - 0.5;
  float vig = 1.0 - gVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);
  g *= vig;
  c = pow(clamp(g, 0.0, 1.0), vec3(2.2));
  outputColor = vec4(c, inputColor.a);
}
`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['gExposure', new THREE.Uniform(1.0)],
        ['gSaturation', new THREE.Uniform(1.27)],
        ['gContrast', new THREE.Uniform(1.1)],
        ['gVignette', new THREE.Uniform(0.32)],
        ['gLift', new THREE.Uniform(new THREE.Vector3(0.035, 0.018, 0.0))],
        ['gGain', new THREE.Uniform(new THREE.Vector3(1.05, 1.0, 0.94))],
      ]),
    })
  }

  set(name: 'gExposure' | 'gSaturation' | 'gContrast' | 'gVignette', v: number): void {
    ;(this.uniforms.get(name) as THREE.Uniform).value = v
  }
}

// ------------------------------------------------------------------ 層状のかすみ（空気遠近）

const hazeFrag = /* glsl */ `
uniform vec3 hCamPos;
uniform mat3 hCamRot;
uniform vec2 hTan;
uniform vec3 hNear;
uniform vec3 hFar;
uniform float hDensity;
uniform float hStart;
uniform float hFalloff;
uniform float hMax;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (depth >= 0.999999) {
    outputColor = inputColor;
    return;
  }
  float vz = getViewZ(depth);
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 vp = vec3(ndc * hTan, -1.0) * (-vz);
  float dist = length(vp);
  vec3 wp = hCamPos + hCamRot * vp;
  // 近くは澄んで、遠くほど（低いところほど）かすむ
  float d = max(dist - hStart, 0.0);
  float f = 1.0 - exp(-d * hDensity);
  float low = exp(-max(wp.y, 0.0) * hFalloff);
  float amt = clamp(f * mix(0.15, 1.0, low), 0.0, 1.0) * hMax;
  // 中景は暖かい金色のかすみ、遠景は空の青へ
  vec3 col = mix(hNear, hFar, smoothstep(90.0, 360.0, dist));
  outputColor = vec4(mix(inputColor.rgb, col, amt), inputColor.a);
}
`

export class HazeEffect extends Effect {
  private readonly camera: THREE.PerspectiveCamera
  private readonly rot = new THREE.Matrix3()

  constructor(camera: THREE.PerspectiveCamera) {
    super('HazeEffect', hazeFrag, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, THREE.Uniform>([
        ['hCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['hCamRot', new THREE.Uniform(new THREE.Matrix3())],
        ['hTan', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ['hNear', new THREE.Uniform(new THREE.Color(0.95, 0.88, 0.78))],
        ['hFar', new THREE.Uniform(new THREE.Color(0.56, 0.75, 0.98))],
        ['hDensity', new THREE.Uniform(0.0034)],
        ['hStart', new THREE.Uniform(60)],
        ['hFalloff', new THREE.Uniform(0.03)],
        ['hMax', new THREE.Uniform(0.7)],
      ]),
    })
    this.camera = camera
  }

  update(): void {
    const cam = this.camera
    const u = this.uniforms
    ;(u.get('hCamPos') as THREE.Uniform).value.setFromMatrixPosition(cam.matrixWorld)
    this.rot.setFromMatrix4(cam.matrixWorld)
    ;(u.get('hCamRot') as THREE.Uniform).value.copy(this.rot)
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / cam.zoom
    ;(u.get('hTan') as THREE.Uniform).value.set(ty * cam.aspect, ty)
  }
}

export type PostChain = {
  composer: EffectComposer
  grade: GradeEffect
  bloom: BloomEffect
  ao: N8AOPostPass | null
  setSize(w: number, h: number): void
  render(dt: number): void
  /** 画質を変える：パスを組み直す（エフェクト・色調の値はそのまま。AO・ブルーム・SMAA が無ければその処理ごと省く） */
  setQuality(q: QualitySettings): void
}

/**
 * 後処理の組み立て。画質で次のように変える（重い順）：
 * ・AO（N8AO）：高画質だけ。半透明の物をもう一度描く処理（transparencyAware）は使わない
 * ・ブルーム：省電力では入れない（強さ 0 にしても縮小・拡大の 17 回は描いてしまうので、パスから外す）
 * ・SMAA：高画質は HIGH、標準は MEDIUM、省電力は無し
 * かすみと色調はいつも 1 回の全画面処理にまとめる
 */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: QualitySettings): PostChain {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
  const renderPass = new RenderPass(scene, camera)
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 0.95,
    luminanceSmoothing: 0.35,
    intensity: 1.2,
    radius: 0.72,
  })
  const grade = new GradeEffect()
  const haze = new HazeEffect(camera)
  let ao: N8AOPostPass | null = null
  let fx: EffectPass | null = null
  let aa: EffectPass | null = null
  let key = ''
  /** 使わなくなったパスを捨てる（使い回すエフェクトは解放しない） */
  const drop = (p: EffectPass | null, keepEffects: boolean) => {
    if (!p) return
    // setEffects は protected：エフェクトの change の購読だけ外す（dispose でエフェクトまで解放されないように）
    if (keepEffects) (p as unknown as { setEffects(e: Effect[]): void }).setEffects([])
    p.dispose()
  }
  const chain: PostChain = {
    composer,
    grade,
    bloom,
    ao: null,
    setSize(w: number, h: number) {
      composer.setSize(w, h)
    },
    render(dt: number) {
      composer.render(dt)
    },
    setQuality(q: QualitySettings) {
      const k = `${q.ao ? 1 : 0}${q.aoHalfRes ? 1 : 0}|${q.level}|${q.bloom ? 1 : 0}|${q.smaa ?? '-'}`
      if (k === key) return
      key = k
      composer.removeAllPasses()
      composer.addPass(renderPass)
      if (q.ao) {
        const size = renderer.getSize(new THREE.Vector2())
        if (!ao) {
          ao = new N8AOPostPass(scene, camera, size.x, size.y)
          ao.configuration.aoRadius = 1.1
          ao.configuration.distanceFalloff = 1.0
          ao.configuration.intensity = 2.6
          ao.configuration.color = new THREE.Color('#2a160a')
          ao.configuration.gammaCorrection = false
          // 半透明の物を AO のためにもう一度描かない（毎フレーム 50 回ほどの描画と、その分の全画面処理が増えるため）
          ao.autoDetectTransparency = false
          ao.configuration.transparencyAware = false
        }
        ao.setQualityMode(q.level === 'high' ? 'Medium' : 'Performance')
        ao.configuration.halfRes = q.aoHalfRes
        composer.addPass(ao)
      }
      chain.ao = q.ao ? ao : null
      drop(fx, true)
      fx = new EffectPass(camera, ...(q.bloom ? [haze, bloom, grade] : [haze, grade]))
      composer.addPass(fx)
      drop(aa, false)
      aa = null
      if (q.smaa) {
        aa = new EffectPass(camera, new SMAAEffect({ preset: q.smaa === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM }))
        composer.addPass(aa)
      }
    },
  }
  chain.setQuality(q)
  return chain
}
