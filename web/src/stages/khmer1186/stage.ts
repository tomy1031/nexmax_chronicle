// 1186年 クメールの都・アルンの寺（物語 v7 の 11 章）。
// いまは仮の広場：時代キー '1186' がシェルで通るか（移動・環境・セーブ）を確かめるためのもの。本編の舞台は khmer1186/ の担当が組み立てる。
import * as THREE from 'three'
import { ColliderList } from '../../world/colliders'
import { EDO_SKY } from '../../render/sky'
import { ERA_KHMER } from '../../core/eras'
import type { Hint } from '../../ui/hud'
import type { SpawnPoint, Stage, StageEnvironment, StageRuntime, StageWorld } from '../../game/stage'

const KHMER_SKY = { ...EDO_SKY, zenith: '#3f7fd8', upper: '#78a9ea', horizon: '#f2dcae', warm: '#ffd38a', haze: '#ead9b8' }

export class KhmerStage implements Stage {
  readonly key = '1186' as const
  readonly era = ERA_KHMER
  readonly label = '1186年　クメールの都・アルンの寺'
  readonly subtitle = '900年前のカンボジア'
  readonly environment: StageEnvironment = {
    sky: KHMER_SKY,
    sunDir: new THREE.Vector3(-0.4, 0.75, -0.3).normalize(),
    hdri: null,
    envIntensity: 0.8,
    fog: { color: KHMER_SKY.haze, density: 0.004 },
  }

  async load(): Promise<StageWorld> {
    const root = new THREE.Group()
    root.name = 'khmer1186_placeholder'
    const col = new ColliderList()
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#c79a63', roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    root.add(floor)
    col.floor(-30, 30, -30, 30, 0, 1)
    col.wall(-28, -28, 28, -28, -1, 6)
    col.wall(28, -28, 28, 28, -1, 6)
    col.wall(28, 28, -28, 28, -1, 6)
    col.wall(-28, 28, -28, -28, -1, 6)
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 1), new THREE.MeshStandardMaterial({ color: '#3fa8ff', emissive: new THREE.Color('#2a7fff'), emissiveIntensity: 1.4, roughness: 0.3 }))
    stone.position.set(0, 2, -10)
    stone.scale.set(1, 1.5, 1)
    root.add(stone)
    return { root, colliders: col, claw: { targets: [], movables: [] }, lights: [] }
  }

  spawn(): SpawnPoint {
    return { pos: new THREE.Vector3(0, 0, 6), facing: 0, camYaw: 0, camPitch: 0.25 }
  }

  begin(rt: StageRuntime): void {
    rt.save('arrive')
  }

  revealed(rt: StageRuntime): void {
    rt.say('システム', '1186年 アルンの寺（仮の広場）。舞台は準備中です。')
  }

  update(): void {}
  animate(): void {}
  interact(): boolean {
    return false
  }
  hints(): Hint[] | null {
    return null
  }
  objective(): { title: string; sub: string } {
    return { title: '900年前のカンボジア', sub: '舞台は準備中' }
  }
  dispose(): void {}
}
