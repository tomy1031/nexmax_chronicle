// プレビューの view（lamp・hands・slit・fx・ura・heart・shade）。preview.ts から必要なときに読む。
import * as THREE from 'three'
import { registerView, type ViewCtx } from './preview'
import { createPerson } from './person'
import { Lamp } from './lamp'
import { BlackHands } from './hands'
import { SlitFx, type Slit } from './slit'
import { FreezeFx, SlashFx } from './chronoFx'
import { buildUraArena, UraEnvSwitch } from './ura'
import { OrmHeart } from './heart'
import { ColliderList } from '../../world/colliders'
import { EnemyModel } from '../../combat/enemyModels'
import { ShadeWisps, SHADE_STYLE, BIG_SHADE_STYLE, ARMORED_SHADE_STYLE } from './shade'

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

// ------------------------------------------------------------------ slit

registerView('slit', (c: ViewCtx) => {
  const fx = new SlitFx(c.root)
  const toCam = v3(0, 0, -1)
  let seam: Slit = fx.seam(v3(-3.2, 1.6, 0), { normal: toCam, width: 1.0, height: 2.4 })
  let rift: Slit = fx.open(v3(-1.1, 1.6, 0), toCam, 1.1, 2.6)
  const bill: Slit = fx.open(v3(1.0, 1.5, 0.5), null, 0.7, 2.0)
  let dawn: Slit = fx.dawnDoor(v3(3.6, 2.2, 1), toCam, 2.0, 4.0)
  c.tag(v3(-3.2, 3.0, 0), 'ゆらぎ（seam）')
  c.tag(v3(-1.1, 3.1, 0), '切れ目（open）')
  c.tag(v3(1.0, 2.7, 0.5), 'カメラを向く切れ目')
  c.tag(v3(3.6, 4.5, 1), '夜明けの光の扉（dawn）')
  const kid = createPerson('towaChild')
  kid.root.position.set(0.2, 0, -1.2)
  kid.root.rotation.y = Math.PI
  c.root.add(kid.root)
  let cam: THREE.Camera | undefined
  return {
    label: '切れ目：ゆらぎ → 開く → 閉じる・夜明けの光の扉・いくつでも同時に',
    night: true,
    cam: { pos: v3(0.2, 1.7, -7.6), look: v3(0.2, 1.7, 0.5), fov: 50 },
    update(dt, t) {
      cam = cam ?? (c.camera as THREE.Camera)
      fx.update(dt, t, cam)
      kid.update(dt, 0)
    },
    actions: {
      open: () => seam.open(1.0),
      close: () => fx.closeAll(),
      stable: () => rift.setStability(1),
      widen: () => rift.setWidth(2.0, 0.6),
      again: () => {
        seam = fx.seam(v3(-3.2, 1.6, 0), { normal: toCam, width: 1.0, height: 2.4 })
        rift = fx.open(v3(-1.1, 1.6, 0), toCam, 1.1, 2.6)
        dawn = fx.dawnDoor(v3(3.6, 2.2, 1), toCam, 2.0, 4.0)
      },
    },
  }
  void bill
  void dawn
})

// ------------------------------------------------------------------ fx（止める・裂く）

registerView('fx', (c: ViewCtx) => {
  const freeze = new FreezeFx(c.root)
  const slash = new SlashFx(c.root)
  // 回る歯車（止める的）
  const gear = new THREE.Group()
  const gm = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.6, roughness: 0.4 })
  gear.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 24), gm))
  for (let i = 0; i < 12; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), gm)
    const a = (i / 12) * Math.PI * 2
    tooth.position.set(Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78)
    tooth.rotation.y = -a
    gear.add(tooth)
  }
  gear.rotation.x = Math.PI / 2
  gear.position.set(-1.4, 1.6, 0)
  c.root.add(gear)
  // 落ちる石（止める的）
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: '#8a8a92', roughness: 0.9 }))
  stone.position.set(1.4, 3, 0)
  c.root.add(stone)
  let frozen: 'gear' | 'stone' | null = null
  let remain = 0
  const total = 4
  let vy = 0
  const target = (w: 'gear' | 'stone') => (w === 'gear' ? gear.position : stone.position)
  const doFreeze = (w: 'gear' | 'stone') => {
    frozen = w
    remain = total
    freeze.show(target(w), w === 'gear' ? 1.1 : 0.75, total)
  }
  c.tag(v3(-1.4, 2.7, 0), '止める（歯車）')
  c.tag(v3(1.4, 4.0, 0), '止める（落ちる石）')
  return {
    label: '止める：青い時計の輪と残りの弧・カチカチの粒 ／ 裂く：光る線が左右に開く',
    night: true,
    cam: { pos: v3(0, 1.9, -6), look: v3(0, 1.8, 0), fov: 50 },
    update(dt, t) {
      if (frozen !== 'gear') gear.rotation.y += dt * 1.6
      if (frozen !== 'stone') {
        vy -= 9.8 * dt
        stone.position.y += vy * dt
        stone.rotation.x += dt * 2
        if (stone.position.y < 0.45) {
          stone.position.y = 3.4
          vy = 0
        }
      }
      if (frozen) {
        remain -= dt
        freeze.set(remain)
        if (remain <= 0) {
          frozen = null
          freeze.hide()
        }
      }
      freeze.update(dt, t)
      slash.update(dt)
    },
    actions: {
      freeze: () => doFreeze('gear'),
      freezeStone: () => doFreeze('stone'),
      slash: () => slash.play(v3(0, 1.8, 0), { angle: 0.7, length: 2.4 }),
      slashGold: () => slash.play(v3(0, 1.8, 0), { angle: -0.5, length: 3, color: '#ffd27a' }),
      thaw: () => {
        frozen = null
        freeze.hide()
      },
    },
  }
})

// ------------------------------------------------------------------ ura（裏側）

registerView('ura', (c: ViewCtx) => {
  const col = new ColliderList()
  const arena = buildUraArena(c.root, col, v3(0, 0, 0), { quality: 'medium' })
  const heart = new OrmHeart(c.root, arena.heartAnchor, { anchors: arena.veinAnchors, veins: 5 })
  const slits = new SlitFx(c.root)
  const door = slits.dawnDoor(arena.doorAnchor, v3(0, 0, -1), 2.2, 4.2)
  const sw = new UraEnvSwitch({ scene: c.scene, sky: c.env.sky, sun: c.env.sun, hemi: c.env.hemi, post: c.env.post })
  sw.set(1)
  const chanda = createPerson('chanda')
  chanda.root.position.copy(arena.entry).add(v3(0.8, 0, -0.5))
  chanda.root.rotation.y = 0
  chanda.setPose('guard')
  chanda.setRim('#8fb4ff', 0.6)
  c.root.add(chanda.root)
  c.ground.visible = false
  let k = 1
  let want = 1
  c.tag(arena.heartAnchor.clone().add(v3(0, 3.4, 0)), 'オルムの心臓')
  c.tag(arena.entry.clone().add(v3(0, 2.2, 0)), '入口（entry）')
  return {
    label: `裏側：浮いた石の足場 ${arena.platforms.length} 個（当たり判定 ${col.items.length}）・遠くの崩れたかたち・落ちる粒・URA_ENV`,
    night: true,
    noGround: true,
    cam: { pos: arena.entry.clone().add(v3(1.8, 2.6, 5.5)), look: arena.center.clone().add(v3(0, 2.5, -6)), fov: 58 },
    update(dt, t) {
      k += (want - k) * (1 - Math.exp(-dt * 2))
      sw.set(k)
      arena.update(dt, t)
      heart.update(dt, t)
      slits.update(dt, t, c.camera)
      chanda.update(dt, 0)
    },
    actions: {
      surface: () => (want = 0),
      ura: () => (want = 1),
      closeDoor: () => door.close(),
    },
  }
})

// ------------------------------------------------------------------ heart（オルムの心臓）

registerView('heart', (c: ViewCtx) => {
  const col = new ColliderList()
  const arena = buildUraArena(c.root, col, v3(0, 0, 0), { quality: 'low' })
  const heart = new OrmHeart(c.root, arena.heartAnchor, { anchors: arena.veinAnchors, veins: 6 })
  const sw = new UraEnvSwitch({ scene: c.scene, sky: c.env.sky, sun: c.env.sun, hemi: c.env.hemi, post: c.env.post })
  sw.set(1)
  c.ground.visible = false
  const blade = arena.center.clone().add(v3(1.5, 1.2, -6))
  let next = 0
  return {
    label: 'オルムの心臓：脈・光をすうすじ（absorb）・すじを裂く（cut）・金のひび（crack）・くずれる（shatter）',
    night: true,
    noGround: true,
    cam: { pos: arena.center.clone().add(v3(4, 4, 6)), look: arena.heartAnchor.clone().add(v3(0, -1, 0)), fov: 55 },
    update(dt, t) {
      sw.set(1)
      arena.update(dt, t)
      heart.update(dt, t)
    },
    actions: {
      absorb: () => heart.absorb(blade, 3),
      cut: () => {
        heart.veins[next % heart.veins.length].cut()
        next++
        heart.setPulse(1.1 + next * 0.25)
      },
      crack: () => heart.crack(0.6),
      shatter: () => void heart.shatter(),
      reach: () => heart.veins[0].reachTo(arena.entry.clone().add(v3(0, 2, 0)), 2),
    },
  }
})

// ------------------------------------------------------------------ shade（影の敵の色と、けむりのすそ）

registerView('shade', (c: ViewCtx) => {
  const wisps = new ShadeWisps(c.root)
  const list: { m: EnemyModel; pos: THREE.Vector3; scale: number; label: string }[] = []
  const add = (kind: 'mite' | 'shield' | 'brute', style: typeof SHADE_STYLE, x: number, scale: number, label: string) => {
    const m = new EnemyModel(kind, style)
    m.baseScale = scale
    m.root.scale.setScalar(scale)
    m.root.position.set(x, 0, 0)
    c.root.add(m.root)
    list.push({ m, pos: m.root.position, scale: scale * (kind === 'mite' ? 0.6 : kind === 'brute' ? 1.5 : 1), label })
    c.tag(v3(x, (kind === 'brute' ? 2.9 : kind === 'mite' ? 0.9 : 1.9) * scale + 0.2, 0), label)
  }
  add('mite', SHADE_STYLE, -3.4, 1, '小さな影（SHADE_STYLE）')
  add('shield', SHADE_STYLE, -1.4, 1, '影（SHADE_STYLE）')
  add('shield', ARMORED_SHADE_STYLE, 0.6, 1, 'よろいの影（ARMORED）')
  add('brute', BIG_SHADE_STYLE, 3.4, 1.3, '大きな影（BIG_SHADE_STYLE）')
  const towa = createPerson('towa')
  towa.root.position.set(-5.6, 0, 1.2)
  towa.root.rotation.y = Math.PI * 0.85
  const lamp = new Lamp(c.root)
  towa.holdLamp(lamp)
  towa.setPose('raiseLamp')
  c.root.add(towa.root)
  return {
    label: '影の敵：既存の敵の形に SHADE_STYLE などの色 ＋ ShadeWisps（足もとの黒いけむり・紫の粒）',
    night: true,
    cam: { pos: v3(-0.6, 2.2, -8.5), look: v3(-0.4, 1.2, 0), fov: 50 },
    update(dt, t) {
      for (const e of list) e.m.animate(dt, t, 'idle', t, 0, 0, 0.6)
      wisps.sync(list.map((e, i) => ({ id: 'e' + i, pos: e.pos, model: { baseScale: e.scale } })))
      wisps.update(dt)
      towa.update(dt, 0)
      lamp.update(dt, t)
    },
    actions: {
      poof: () => {
        const e = list.shift()
        if (!e) return
        wisps.poof(e.pos, e.scale)
        e.m.root.removeFromParent()
      },
    },
  }
})
