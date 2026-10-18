// 1726年 仕掛け横丁のからくり人形（導入編 7-1・7-3・7-5）。
// ・茶運び人形：赤い着物の小さな人形がお盆に茶碗をのせて、ことことと歩く。ぜんまいが切れると止まり、おはるが抱えて運ぶ
// ・工房の店先の人形 2 体：おじぎをする人形と、扇を振る人形（台の上で動き続ける）
// 黒い輪が出ると、すべてのからくりがいっせいに止まる（freeze）。部品は少ないメッシュ（root の下。解放はシェル）。
import * as THREE from 'three'

type Mats = { kimono: THREE.Material; kimono2: THREE.Material; face: THREE.Material; hair: THREE.Material; wood: THREE.Material; lacquer: THREE.Material; cup: THREE.Material; brass: THREE.Material }

function mats(): Mats {
  return {
    kimono: new THREE.MeshStandardMaterial({ color: '#c42a22', roughness: 0.7 }),
    kimono2: new THREE.MeshStandardMaterial({ color: '#2a4a8a', roughness: 0.7 }),
    face: new THREE.MeshStandardMaterial({ color: '#f6ead8', roughness: 0.45, emissive: new THREE.Color('#3a2a1a'), emissiveIntensity: 0.2 }),
    hair: new THREE.MeshStandardMaterial({ color: '#16100c', roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ color: '#a8733e', roughness: 0.65 }),
    lacquer: new THREE.MeshStandardMaterial({ color: '#2a120c', roughness: 0.3 }),
    cup: new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c8a050', roughness: 0.35, metalness: 0.7 }),
  }
}

/** 小さな人形の体（頭・髪・着物・袴の裾）。原点は足元。高さはおよそ h */
function dollBody(m: Mats, h: number, robe: THREE.Material): { root: THREE.Group; head: THREE.Group; armR: THREE.Group } {
  const root = new THREE.Group()
  const s = h / 0.38
  const robeGeo = new THREE.LatheGeometry(
    [
      [0.0, 0.0],
      [0.075, 0.0],
      [0.07, 0.1],
      [0.058, 0.2],
      [0.05, 0.24],
      [0.03, 0.255],
      [0.0, 0.26],
    ].map(([r, y]) => new THREE.Vector2(r * s, y * s)),
    14,
  )
  const robeM = new THREE.Mesh(robeGeo, robe)
  robeM.castShadow = true
  root.add(robeM)
  // 帯（金）
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.056 * s, 0.059 * s, 0.03 * s, 14), m.brass)
  obi.position.y = 0.17 * s
  root.add(obi)
  const head = new THREE.Group()
  head.position.y = 0.3 * s
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.052 * s, 14, 10), m.face)
  face.castShadow = true
  head.add(face)
  // 唐子の髪：おかっぱの髪と、頭の上の小さな丸い髷
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m.hair)
  hair.position.set(0, 0.004 * s, 0.006 * s)
  hair.rotation.x = 0.25
  head.add(hair)
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 8, 6), m.hair)
  top.position.set(0, 0.052 * s, 0.01 * s)
  head.add(top)
  // 目と紅
  for (const e of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006 * s, 6, 4), m.hair)
    eye.position.set(e * 0.018 * s, 0.002 * s, -0.049 * s)
    head.add(eye)
  }
  const lip = new THREE.Mesh(new THREE.SphereGeometry(0.004 * s, 6, 4), new THREE.MeshBasicMaterial({ color: '#c8281c' }))
  lip.position.set(0, -0.02 * s, -0.05 * s)
  head.add(lip)
  root.add(head)
  // 右腕（扇やおじぎ用。茶運び人形は両腕でお盆）
  const armR = new THREE.Group()
  armR.position.set(0.055 * s, 0.23 * s, 0)
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.014 * s, 0.07 * s, 3, 6), robe)
  arm.position.y = -0.04 * s
  armR.add(arm)
  root.add(armR)
  return { root, head, armR }
}

export class TeaDoll {
  readonly root = new THREE.Group()
  private readonly body: THREE.Group
  private readonly cup: THREE.Mesh
  private path: THREE.Vector3[] = []
  private i = 0
  speed = 0.5
  /** 'walk' 歩く・'stop' ぜんまいが切れて止まった・'carried' 抱えられている */
  mode: 'walk' | 'stop' | 'carried' = 'stop'
  frozen = false
  private t = Math.random() * 5
  private wind = 1
  private readonly tmp = new THREE.Vector3()
  /** 歩き終わったとき */
  onStop: (() => void) | null = null

  constructor() {
    const m = mats()
    const b = dollBody(m, 0.38, m.kimono)
    this.body = b.root
    this.root.add(this.body)
    // お盆と茶碗（前へ差し出す）
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 16), m.lacquer)
    tray.position.set(0, 0.215, -0.085)
    this.body.add(tray)
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.03, 12), m.cup)
    this.cup.position.set(0, 0.235, -0.085)
    this.body.add(this.cup)
    for (const e of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.06, 3, 6), m.kimono)
      a.rotation.x = Math.PI / 2 - 0.2
      a.position.set(e * 0.045, 0.22, -0.045)
      this.body.add(a)
    }
    this.root.name = 'tea_doll'
  }

  get position(): THREE.Vector3 {
    return this.root.position
  }

  walkPath(path: THREE.Vector3[], speed = 0.5): void {
    this.path = path.map((p) => p.clone())
    this.i = 1
    this.root.position.copy(this.path[0])
    this.speed = speed
    this.mode = 'walk'
    this.wind = 1
  }

  /** 抱えられる（毎フレーム carryAt で位置を渡す） */
  carry(): void {
    this.mode = 'carried'
  }

  carryAt(p: THREE.Vector3, yaw: number): void {
    this.root.position.copy(p)
    this.root.rotation.y = yaw
  }

  update(dt: number): void {
    if (this.frozen) {
      // 止まったまま、かすかに震える（ぜんまいが引っかかった）
      this.body.rotation.z = Math.sin(this.t * 40) * 0.01
      this.t += dt * 0.2
      return
    }
    this.t += dt
    if (this.mode === 'walk') {
      const target = this.path[this.i]
      if (!target) {
        this.mode = 'stop'
        this.onStop?.()
        return
      }
      this.tmp.subVectors(target, this.root.position)
      this.tmp.y = 0
      const d = this.tmp.length()
      // 最後の 1 m はぜんまいが切れかけてゆっくりに
      const last = this.i === this.path.length - 1
      this.wind = last ? Math.max(0.25, Math.min(1, d / 1.0)) : 1
      const step = this.speed * this.wind * dt
      if (d <= step) {
        this.root.position.copy(target)
        this.i++
      } else {
        this.root.position.addScaledVector(this.tmp, step / d)
        this.root.rotation.y = Math.atan2(-this.tmp.x, -this.tmp.z)
      }
      // ことこと：左右に揺れて、小さく上下
      const ph = this.t * 9 * this.wind
      this.body.rotation.z = Math.sin(ph) * 0.09 * this.wind
      this.body.position.y = Math.abs(Math.sin(ph)) * 0.012 * this.wind
      this.cup.position.y = 0.235 + Math.abs(Math.sin(ph)) * 0.002
    } else {
      this.body.rotation.z *= Math.max(0, 1 - dt * 6)
      this.body.position.y *= Math.max(0, 1 - dt * 6)
    }
  }
}

/** 工房の店先の台と、動く人形 2 体（おじぎ・扇） */
export class ShopDolls {
  readonly root = new THREE.Group()
  frozen = false
  private readonly bow: THREE.Group
  private readonly fanArm: THREE.Group
  private readonly fanHead: THREE.Group
  private t = 0

  constructor(pos: THREE.Vector3, yaw: number) {
    const m = mats()
    this.root.position.copy(pos)
    this.root.rotation.y = yaw
    // 台（低い縁台）
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.5), m.wood)
    top.position.y = 0.62
    top.castShadow = true
    top.receiveShadow = true
    this.root.add(top)
    for (const [x, z] of [
      [-0.44, -0.2],
      [0.44, -0.2],
      [-0.44, 0.2],
      [0.44, 0.2],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), m.wood)
      leg.position.set(x, 0.3, z)
      this.root.add(leg)
    }
    // おじぎ人形（腰から前へ倒れる）
    const a = dollBody(m, 0.42, m.kimono2)
    this.bow = new THREE.Group()
    // 腰（足元から 0.13 m）を軸にして倒れる
    this.bow.position.set(-0.25, 0.65 + 0.13, 0)
    a.root.position.y = -0.13
    this.bow.add(a.root)
    this.root.add(this.bow)
    // 扇人形（右腕で金の扇を振り、首をかしげる）
    const b = dollBody(m, 0.42, m.kimono)
    b.root.position.set(0.25, 0.65, 0)
    this.root.add(b.root)
    this.fanArm = b.armR
    this.fanHead = b.head
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12, 0, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: '#e8c060', roughness: 0.4, metalness: 0.4, side: THREE.DoubleSide }))
    fan.position.set(0, -0.1, -0.01)
    fan.rotation.z = -Math.PI / 2 - 0.35
    this.fanArm.add(fan)
  }

  update(dt: number): void {
    if (this.frozen) return
    this.t += dt
    // おじぎ：ゆっくり倒れて、少し止まって、戻る（からくりのカム）
    const c = (this.t * 0.55) % 1
    const k = c < 0.35 ? Math.sin((c / 0.35) * Math.PI * 0.5) : c < 0.55 ? 1 : c < 0.85 ? Math.cos(((c - 0.55) / 0.3) * Math.PI * 0.5) : 0
    this.bow.rotation.x = -0.75 * k
    this.fanArm.rotation.x = -1.2 - Math.sin(this.t * 3.2) * 0.45
    this.fanArm.rotation.z = 0.25
    this.fanHead.rotation.z = Math.sin(this.t * 1.6) * 0.18
  }
}
