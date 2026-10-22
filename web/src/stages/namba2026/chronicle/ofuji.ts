// おふじさんの仮の姿（物語 v7 の 9 章）。おはるの家の、ずっとあとの子ども。年をとったおばあさんで、毎年ほこらの錠前の
// ぜんまいを巻き、窓をふいて箱を守っている。人の形は visuals 担当の createPerson('ofuji') ができたら差しかえる。
// 白髪のおだんご・丸いめがね・あずき色のカーディガンに白いかっぽう着・紺のもんぺ。少し背中を丸めた、やさしい姿。
// 形は Character と同じ（setPose / update）。'crank' でかがんで、右手で錠前の鍵を回す。
import * as THREE from 'three'
import type { Character, Pose } from '../../../world/characters'

export type PersonLike = Omit<Character, 'name'> & { name: string }

export function createOfujiPlaceholder(height = 1.42): PersonLike {
  const s = height / 1.42
  const root = new THREE.Group()
  root.name = 'ofuji'
  const body = new THREE.Group()
  root.add(body)
  const mat = (color: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough })
  const skin = mat('#f0c8aa', 0.6)
  const hair = mat('#e6e2dc', 0.7)
  const cardigan = mat('#8a3a4a')
  const apron = mat('#f6f2ea')
  const monpe = mat('#2a3450')
  const shoes = mat('#3a2e28')
  const glass = new THREE.MeshStandardMaterial({ color: '#c8a050', roughness: 0.3, metalness: 0.6 })
  const sph = new THREE.SphereGeometry(1, 18, 12)
  const cap = new THREE.CapsuleGeometry(1, 1, 4, 12)
  const boxG = new THREE.BoxGeometry(1, 1, 1)
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x * s, y * s, z * s)
    o.scale.set(sx * s, sy * s, sz * s)
    o.castShadow = true
    o.receiveShadow = true
    parent.add(o)
    return o
  }
  // 脚（もんぺ）と靴
  for (const e of [-1, 1]) {
    add(body, cap, monpe, e * 0.07, 0.36, 0, 0.07, 0.22, 0.07)
    add(body, boxG, shoes, e * 0.07, 0.035, -0.03, 0.09, 0.07, 0.2)
  }
  // 上半身（腰から上をまとめて傾ける）
  const torso = new THREE.Group()
  torso.position.set(0, 0.66 * s, 0)
  body.add(torso)
  add(torso, cap, cardigan, 0, 0.24, 0, 0.15, 0.14, 0.11)
  // かっぽう着（前の白い布）
  add(torso, cap, apron, 0, 0.18, -0.025, 0.145, 0.17, 0.1)
  add(torso, boxG, apron, 0, -0.02, -0.07, 0.24, 0.24, 0.03)
  // 頭・白髪・おだんご・めがね・目と口
  const head = new THREE.Group()
  head.position.set(0, 0.55 * s, -0.02 * s)
  torso.add(head)
  add(head, sph, skin, 0, 0, 0, 0.1, 0.11, 0.1)
  add(head, sph, hair, 0, 0.035, 0.015, 0.108, 0.095, 0.105)
  add(head, sph, hair, 0, 0.08, 0.09, 0.055, 0.05, 0.05)
  for (const e of [-1, 1]) {
    const ring = add(head, new THREE.TorusGeometry(1, 0.18, 6, 16), glass, e * 0.038, 0.0, -0.094, 0.026)
    ring.rotation.y = 0
    add(head, sph, mat('#2a1a14', 0.3), e * 0.038, 0.0, -0.097, 0.009, 0.006, 0.004)
    // ほお（赤み）
    add(head, sph, mat('#f0a090', 0.7), e * 0.055, -0.035, -0.08, 0.018, 0.012, 0.008)
  }
  add(head, boxG, glass, 0, 0.0, -0.096, 0.02, 0.004, 0.004)
  add(head, sph, mat('#a85a4a', 0.6), 0, -0.05, -0.092, 0.018, 0.006, 0.006)
  // 腕（肩の関節で回す）
  const arms: THREE.Group[] = []
  for (const e of [-1, 1]) {
    const sh = new THREE.Group()
    sh.position.set(e * 0.16 * s, 0.34 * s, 0)
    torso.add(sh)
    add(sh, cap, cardigan, 0, -0.12, 0, 0.042, 0.1, 0.042)
    add(sh, cap, apron, 0, -0.26, -0.01, 0.038, 0.06, 0.038)
    add(sh, sph, skin, 0, -0.36, -0.01, 0.035)
    arms.push(sh)
  }
  const hand = new THREE.Object3D()
  hand.position.set(0, -0.36 * s, -0.01 * s)
  arms[1].add(hand)
  let pose: Pose = 'idle'
  let t = Math.random() * 10
  let lean = 0
  return {
    name: 'ofuji',
    root,
    placeholder: true,
    height,
    handAnchor: hand,
    setPose(p: Pose) {
      pose = p
    },
    setAim() {},
    update(dt: number, speed: number) {
      t += dt
      const crank = pose === 'crank'
      const wave = pose === 'wave'
      // かがむ（ぜんまいを巻く）・ふだんは少し背中を丸める
      const want = crank ? 0.42 : 0.12
      lean += (want - lean) * Math.min(1, dt * 4)
      torso.rotation.x = -lean
      body.position.y = (crank ? -0.06 : 0) * s
      const breath = Math.sin(t * 1.8)
      torso.scale.set(1, 1 + breath * 0.008, 1)
      head.rotation.x = lean * 0.5
      const walk = Math.min(1, speed / 1.5)
      body.position.y += Math.abs(Math.sin(t * 7)) * 0.025 * walk
      if (crank) {
        // 右手を前へ出して小さく回す（鍵を巻く）、左手は箱にそえる
        arms[1].rotation.set(1.25 + Math.sin(t * 6) * 0.08, 0, -0.15 + Math.cos(t * 6) * 0.1)
        arms[0].rotation.set(1.0, 0, 0.2)
      } else if (wave) {
        arms[1].rotation.set(0, 0, -2.4 + Math.sin(t * 8) * 0.3)
        arms[0].rotation.set(0, 0, 0.08)
      } else {
        const sw = Math.sin(t * 7) * 0.35 * walk
        arms[1].rotation.set(sw - 0.1, 0, -0.08)
        arms[0].rotation.set(-sw - 0.1, 0, 0.08)
      }
    },
  }
}
