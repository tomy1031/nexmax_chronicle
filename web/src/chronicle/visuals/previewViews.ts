// プレビューの view（lamp・hands・slit・fx・ura・heart・shade）。preview.ts から必要なときに読む。
import * as THREE from 'three'
import { registerView, type ViewCtx } from './preview'
import { createPerson } from './person'
import { Lamp } from './lamp'
import { BlackHands } from './hands'

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ lamp

registerView('lamp', (c: ViewCtx) => {
  const towa = createPerson('towa')
  c.root.add(towa.root)
  towa.root.position.set(-0.9, 0, 0)
  const held = new Lamp(c.root, { dark: true })
  towa.holdLamp(held)
  const big = new Lamp(c.root, { dark: true, scale: 2.4, light: true })
  big.root.position.set(0.7, 1.35, 0)
  c.root.add(big.root)
  const warm = new Lamp(c.root, { dark: false, scale: 2.4 })
  warm.root.position.set(1.9, 1.35, 0)
  c.root.add(warm.root)
  // 台（つるす棒）
  const pole = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: '#5a4636' }))
  pole.position.set(1.3, 1.37, 0)
  c.root.add(pole)
  c.tag(v3(-0.9, 1.95, 0), 'トワ（ランプを持つ）')
  c.tag(v3(0.7, 1.45, 0), '黒い火（setDark(true)）')
  c.tag(v3(1.9, 1.45, 0), '朝の火（setDark(false)）')
  let walk = 0
  return {
    label: 'ランプ：黒い火とこぼれる影・朝の火・burst（われて朝の光）',
    night: true,
    cam: { pos: v3(0.4, 1.35, -3.6), look: v3(0.4, 1.0, 0), fov: 46 },
    update(dt, t) {
      towa.update(dt, walk)
      held.update(dt, t)
      big.update(dt, t)
      warm.update(dt, t)
    },
    actions: {
      burst: () => void big.burst(),
      burstHeld: () => void held.burst(),
      raise: () => towa.setPose(towa.pose === 'raiseLamp' ? 'idle' : 'raiseLamp'),
      walk: () => (walk = walk ? 0 : 1.4),
      reset: () => {
        big.reset()
        held.reset()
      },
    },
  }
})

// ------------------------------------------------------------------ hands

registerView('hands', (c: ViewCtx) => {
  const hands = new BlackHands(c.root)
  const target = v3(0, 0, 0)
  const kid = createPerson('towaChild')
  c.root.add(kid.root)
  kid.root.position.copy(target)
  let chasing = false
  const spawnAll = () => {
    hands.spawn('g1', v3(-4, 0, 3))
    hands.spawn('g2', v3(1.5, 0, 4.5))
    hands.spawn('s1', v3(4.5, 10, 5), { from: 'sky' })
  }
  spawnAll()
  c.tag(v3(-4, 5.4, 3), '地面のひびから（ground）')
  c.tag(v3(4.5, 11.6, 5), '空の黒い輪から（sky）')
  return {
    label: '黒い手：spawn・reachTo・slam（予告の円）・passThrough・cut・retract',
    night: true,
    cam: { pos: v3(0, 3.6, -11), look: v3(0.5, 3.0, 2.5), fov: 52 },
    update(dt, t) {
      if (chasing) target.set(Math.sin(t * 0.8) * 3, 0, Math.cos(t * 0.8) * 1.5)
      kid.root.position.copy(target)
      kid.update(dt, chasing ? 2 : 0)
      hands.update(dt, t)
    },
    actions: {
      slam: () => hands.slam('g2', v3(0.3, 0, 0.5)),
      reach: () => hands.reachTo('s1', v3(0.5, 1.0, 0), 1.2),
      pass: () => hands.passThrough('g1'),
      cut: () => hands.cut('g1'),
      cutSlam: () => hands.cut('g2'),
      retract: () => hands.retract('s1'),
      chase: () => {
        chasing = true
        hands.chase('g1', target, 4)
        hands.chase('s1', target, 5)
      },
      respawn: spawnAll,
    },
  }
})
