// 後処理：N8AO（環境遮蔽）→ ブルーム＋色調（露出・ACES・彩度・コントラスト・暖色・周辺減光）→ SMAA。
import * as THREE from 'three'
import { BloomEffect, BlendFunction, Effect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing'
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
        ['gSaturation', new THREE.Uniform(1.22)],
        ['gContrast', new THREE.Uniform(1.1)],
        ['gVignette', new THREE.Uniform(0.32)],
        ['gLift', new THREE.Uniform(new THREE.Vector3(0.03, 0.015, 0.0))],
        ['gGain', new THREE.Uniform(new THREE.Vector3(1.03, 1.0, 0.96))],
      ]),
    })
  }

  set(name: 'gExposure' | 'gSaturation' | 'gContrast' | 'gVignette', v: number): void {
    ;(this.uniforms.get(name) as THREE.Uniform).value = v
  }
}

export type PostChain = {
  composer: EffectComposer
  grade: GradeEffect
  bloom: BloomEffect
  ao: N8AOPostPass | null
  setSize(w: number, h: number): void
  render(dt: number): void
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: QualitySettings): PostChain {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
  const size = renderer.getSize(new THREE.Vector2())
  composer.addPass(new RenderPass(scene, camera))
  let ao: N8AOPostPass | null = null
  if (q.ao) {
    ao = new N8AOPostPass(scene, camera, size.x, size.y)
    ao.setQualityMode(q.level === 'high' ? 'Medium' : 'Performance')
    ao.configuration.aoRadius = 1.1
    ao.configuration.distanceFalloff = 1.0
    ao.configuration.intensity = 2.6
    ao.configuration.color = new THREE.Color('#2a160a')
    ao.configuration.halfRes = q.aoHalfRes
    ao.configuration.gammaCorrection = false
    composer.addPass(ao)
  }
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 0.95,
    luminanceSmoothing: 0.35,
    intensity: q.bloom ? 1.1 : 0,
    radius: 0.72,
  })
  const grade = new GradeEffect()
  composer.addPass(new EffectPass(camera, bloom, grade))
  const smaa = new SMAAEffect({ preset: q.level === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM })
  composer.addPass(new EffectPass(camera, smaa))
  return {
    composer,
    grade,
    bloom,
    ao,
    setSize(w: number, h: number) {
      composer.setSize(w, h)
    },
    render(dt: number) {
      composer.render(dt)
    },
  }
}
