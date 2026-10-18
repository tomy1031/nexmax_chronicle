// 佐伯ミチ（19 歳・電気の館の見習い技術員）の手続きモデル（public/models/michi.glb が無いときに使う）。
// 1970年の夏：黒髪のおかっぱ（前髪）にオレンジのヘアバンド、空色の作業ジャケット（オレンジの襟・袖まくり）、
// 紺のキュロット、白い運動靴。腰に懐中電灯、左手にノート。
// 関節（腰・肩・ひざ）で歩き・手振り・作業・合図（懐中電灯を空へ向ける）を作る。
import * as THREE from 'three'
import type { Character, Pose } from '../../world/characters'
import { mergeChildMeshes } from '../../render/mergeChildren'

export type MichiCharacter = Character & {
  /** 懐中電灯の光（色。null で消す）。合図のときに使う */
  setLight(color: THREE.ColorRepresentation | null): void
  /** 左手のノートを見せる・しまう */
  showNotebook(on: boolean): void
}

export function createMichi(height = 1.56): MichiCharacter {
  const s = height / 1.56
  const root = new THREE.Group()
  root.name = 'michi'
  const body = new THREE.Group()
  body.scale.setScalar(s)
  root.add(body)
  const mats: THREE.Material[] = []
  const mat = (color: string, rough = 0.75, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra })
    mats.push(m)
    return m
  }
  const skin = mat('#f3cdb0', 0.6)
  const hair = mat('#16110e', 0.45)
  const jacket = mat('#7cc4e8', 0.7)
  const collar = mat('#f07a2a', 0.6)
  const culotte = mat('#24345e', 0.85)
  const shoe = mat('#f4f2ec', 0.6)
  const band = mat('#f07a2a', 0.5)
  const metal = mat('#c9ced4', 0.3, { metalness: 0.7 })
  const geos: THREE.BufferGeometry[] = []
  const sph = new THREE.SphereGeometry(1, 18, 12)
  const cap = new THREE.CapsuleGeometry(1, 1, 4, 10)
  const cube = new THREE.BoxGeometry(1, 1, 1)
  const cylG = new THREE.CylinderGeometry(1, 1, 1, 12)
  geos.push(sph, cap, cube, cylG)
  const part = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.scale.set(sx, sy, sz)
    o.castShadow = true
    parent.add(o)
    return o
  }
  // 腰（全体を上下させる）
  const hips = new THREE.Group()
  hips.position.y = 0.78
  body.add(hips)
  // 脚（ひざ下まで紺のキュロット、その下は肌、白い靴）
  const leg = (side: number) => {
    const g = new THREE.Group()
    g.position.set(side * 0.08, 0, 0)
    hips.add(g)
    part(g, cap, culotte, 0, -0.17, 0, 0.075, 0.14, 0.075)
    const knee = new THREE.Group()
    knee.position.y = -0.38
    g.add(knee)
    part(knee, cap, skin, 0, -0.17, 0, 0.045, 0.14, 0.045)
    part(knee, cube, shoe, 0, -0.37, -0.03, 0.09, 0.07, 0.2)
    return { g, knee }
  }
  const legL = leg(-1)
  const legR = leg(1)
  part(hips, cap, culotte, 0, -0.02, 0, 0.15, 0.06, 0.1)
  // 胴（ジャケット）・襟・ベルトと懐中電灯
  const chest = new THREE.Group()
  chest.position.y = 0.02
  hips.add(chest)
  part(chest, cap, jacket, 0, 0.26, 0, 0.145, 0.16, 0.1)
  part(chest, cube, collar, 0, 0.47, -0.04, 0.2, 0.04, 0.1).rotation.x = 0.3
  part(chest, cube, mat('#2a2a2a', 0.5), 0, 0.06, 0, 0.3, 0.035, 0.21)
  const torch = new THREE.Group()
  torch.position.set(0.16, 0.05, -0.02)
  chest.add(torch)
  part(torch, cylG, metal, 0, -0.05, 0, 0.025, 0.14, 0.025)
  // 名札
  part(chest, cube, mat('#ffffff', 0.5), -0.07, 0.33, -0.1, 0.06, 0.035, 0.01)
  // 腕（肩から。ひじから先は肌）
  const arm = (side: number) => {
    const g = new THREE.Group()
    g.position.set(side * 0.19, 0.42, 0)
    chest.add(g)
    part(g, cap, jacket, 0, -0.1, 0, 0.048, 0.08, 0.048)
    const elbow = new THREE.Group()
    elbow.position.y = -0.24
    g.add(elbow)
    part(elbow, cap, skin, 0, -0.1, 0, 0.038, 0.08, 0.038)
    const hand = new THREE.Group()
    hand.position.y = -0.24
    elbow.add(hand)
    part(hand, sph, skin, 0, 0, 0, 0.04, 0.045, 0.035)
    return { g, elbow, hand }
  }
  const armL = arm(-1)
  const armR = arm(1)
  // 頭（おかっぱ・前髪・ヘアバンド・目）
  const head = new THREE.Group()
  head.position.y = 0.58
  chest.add(head)
  part(head, cylG, skin, 0, 0.02, 0, 0.04, 0.08, 0.04)
  part(head, sph, skin, 0, 0.15, 0, 0.1, 0.115, 0.105)
  part(head, sph, hair, 0, 0.18, 0.012, 0.112, 0.105, 0.115)
  part(head, cylG, hair, 0, 0.12, 0.01, 0.118, 0.13, 0.12)
  part(head, cube, hair, 0, 0.215, -0.085, 0.19, 0.06, 0.04)
  const hb = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.012, 6, 24, Math.PI), band)
  geos.push(hb.geometry)
  hb.position.set(0, 0.22, 0.0)
  hb.rotation.set(0, Math.PI / 2, 0)
  hb.scale.set(1, 1, 1.05)
  head.add(hb)
  for (const e of [-1, 1]) part(head, sph, mat('#1a1410', 0.3), e * 0.036, 0.15, -0.097, 0.011, 0.016, 0.006)
  // ノート（左手）
  const notebook = new THREE.Group()
  part(notebook, cube, mat('#c84a2a', 0.7), 0, 0, 0, 0.13, 0.17, 0.02)
  part(notebook, cube, mat('#f4f0e6', 0.8), 0.003, 0, -0.012, 0.12, 0.16, 0.006)
  notebook.position.set(0, -0.06, -0.04)
  notebook.rotation.set(-0.4, 0.2, 0)
  armL.hand.add(notebook)
  // 懐中電灯の光（右手に持ち替えたとき）
  const lightGroup = new THREE.Group()
  armR.hand.add(lightGroup)
  part(lightGroup, cylG, metal, 0, -0.02, 0, 0.026, 0.16, 0.026)
  const lens = part(lightGroup, cylG, mat('#ffffff', 0.2, { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }), 0, -0.11, 0, 0.034, 0.02, 0.034)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  mats.push(beamMat)
  const beamGeo = new THREE.ConeGeometry(0.9, 9, 20, 1, true)
  beamGeo.translate(0, -4.5, 0)
  geos.push(beamGeo)
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.position.y = -0.12
  beam.castShadow = false
  lightGroup.add(beam)
  lightGroup.visible = false
  const handAnchor = new THREE.Object3D()
  armR.hand.add(handAnchor)
  // 同じ関節・同じ材質の部品をまとめる（光るレンズと光の円すいは残す）
  mergeChildMeshes(root, { keep: new Set([lens, beam]) })

  let pose: Pose = 'idle'
  let t = Math.random() * 10
  let walk = 0
  return {
    name: 'michi',
    root,
    placeholder: true,
    height,
    handAnchor,
    setPose(p: Pose) {
      pose = p
    },
    setAim() {},
    setLight(color) {
      if (color === null) {
        lightGroup.visible = false
        torch.visible = true
        return
      }
      lightGroup.visible = true
      torch.visible = false
      beamMat.color.set(color)
      ;(lens.material as THREE.MeshStandardMaterial).emissive.set(color)
      ;(lens.material as THREE.MeshStandardMaterial).emissiveIntensity = 3
    },
    showNotebook(on) {
      notebook.visible = on
    },
    update(dt: number, speed: number) {
      t += dt
      const moving = speed > 0.25
      walk += dt * (moving ? 5 + speed * 2 : 0)
      const k = Math.min(1, speed / 3)
      const sw = moving ? Math.sin(walk) * (0.45 + 0.35 * k) : 0
      const breath = Math.sin(t * 2.1)
      hips.position.y = 0.78 + (moving ? Math.abs(Math.cos(walk)) * 0.03 : breath * 0.004)
      hips.rotation.set(0, moving ? Math.sin(walk) * 0.08 : 0, 0)
      chest.rotation.set(moving ? 0.06 * k : 0, moving ? -Math.sin(walk) * 0.1 : 0, Math.sin(t * 0.8) * 0.012)
      head.rotation.set(0, 0, 0)
      legL.g.rotation.set(sw, 0, 0)
      legR.g.rotation.set(-sw, 0, 0)
      legL.knee.rotation.set(moving ? Math.max(0, -Math.sin(walk + 0.6)) * 0.9 : 0, 0, 0)
      legR.knee.rotation.set(moving ? Math.max(0, Math.sin(walk + 0.6)) * 0.9 : 0, 0, 0)
      armL.g.rotation.set(-sw * 0.8, 0, -0.08)
      armR.g.rotation.set(sw * 0.8, 0, 0.08)
      armL.elbow.rotation.set(-0.25, 0, 0)
      armR.elbow.rotation.set(-0.25, 0, 0)
      if (!moving) {
        if (pose === 'wave') {
          armR.g.rotation.set(0, 0, 2.5 + Math.sin(t * 7) * 0.25)
          armR.elbow.rotation.set(0, 0, 0.4)
          head.rotation.z = 0.08
        } else if (pose === 'hold') {
          // 懐中電灯を空へ（合図）
          armR.g.rotation.set(-2.9, 0, 0.25)
          armR.elbow.rotation.set(0, 0, 0)
          head.rotation.x = -0.45
          chest.rotation.x = -0.08
        } else if (pose === 'crank') {
          // 作業台でいじる
          const c = Math.sin(t * 3)
          armL.g.rotation.set(-1.0 + c * 0.1, 0.2, 0)
          armR.g.rotation.set(-1.1 - c * 0.1, -0.2, 0)
          armL.elbow.rotation.set(-0.7, 0, 0)
          armR.elbow.rotation.set(-0.7, 0, 0)
          chest.rotation.x = 0.22
          head.rotation.x = 0.35
        } else {
          // ノートを胸の前に（左手）
          armL.g.rotation.set(-0.5, 0.25, -0.05)
          armL.elbow.rotation.set(-1.2, 0, 0)
          head.rotation.y = Math.sin(t * 0.5) * 0.12
        }
      }
    },
    // 解放はステージの root と一緒にシェルがする（材質・形は root の下）
  } as MichiCharacter
}
