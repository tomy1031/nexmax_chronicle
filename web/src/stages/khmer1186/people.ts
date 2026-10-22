// 村の人。本編とプレビューは createKhmerVillagers()（chronicle/visuals の createPerson('khmerVillager')）の本物の人の形を使う。
// Villagers・PlaceholderPerson は舞台の確認用の「仮の箱」（立ち位置を見るだけ。本編・プレビューでは隠す）。立ち位置は layout.ts の VILLAGERS・NPC。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createPerson, type PersonCharacter } from '../../chronicle/visuals'
import { VILLAGERS, type Spot, type VillagerSpot } from './layout'

/**
 * 本物の人の形で見せる村人（多いと重いので、目につく所だけ。ほかは出さない）。みんな F で話せる（mobTalkKhmer.ts・mob_lines_v7.json）。
 * 村の広場の子どもたち・料理の人・村のおじいさん・池のほとりの見張り・水の上の家の人・ナーガの橋の番人・象使い・お寺の人たち
 */
export const SHOWN_VILLAGERS = ['kid1', 'kid2', 'kid3', 'cook1', 'elder', 'watch2', 'fisher2', 'bridge1', 'mahout', 'monk1', 'monk2', 'temple1']

export type KhmerVillager = { id: string; ch: PersonCharacter; spot: VillagerSpot }

/** 村人（本物の人の形・軽い作り・色ちがい）を立ち位置に立たせて返す。root に足すのと update・dispose は呼ぶ側で */
export function createKhmerVillagers(): KhmerVillager[] {
  const out: KhmerVillager[] = []
  VILLAGERS.forEach((s, i) => {
    if (!SHOWN_VILLAGERS.includes(s.id)) return
    const kid = s.role === 'kid'
    const ch = createPerson('khmerVillager', { variant: i, female: i % 2 === 0, lite: true, height: kid ? 1.1 : s.role === 'monk' ? 1.6 : 1.55 })
    ch.root.position.copy(s.pos)
    ch.root.rotation.y = s.yaw
    ch.setPose(kid ? 'wave' : s.role === 'monk' ? 'pray' : s.role === 'sit' ? 'kneel' : 'idle')
    out.push({ id: s.id, ch, spot: s })
  })
  return out
}

const ROLE_COLOR: Record<VillagerSpot['role'], string> = {
  stand: '#3a6ab0',
  cook: '#b8402c',
  carry: '#2f8a4a',
  kid: '#e8a030',
  fish: '#5a4ab0',
  monk: '#f08a1a',
  sit: '#8a5a9a',
}

/** 人の形の仮の箱（高さ 1：足もとが原点）。体・頭・かみ */
function personGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.38, 0.62, 0.24)
  body.translate(0, 0.62, 0)
  const skirt = new THREE.CylinderGeometry(0.2, 0.26, 0.34, 8)
  skirt.translate(0, 0.17, 0)
  const head = new THREE.SphereGeometry(0.15, 10, 8)
  head.translate(0, 1.07, 0)
  const parts = [body, skirt, head].map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    n.deleteAttribute('uv')
    return n
  })
  const g = mergeGeometries(parts, false) as THREE.BufferGeometry
  g.computeVertexNormals()
  return g
}

export class Villagers {
  readonly mesh: THREE.InstancedMesh
  readonly spots: VillagerSpot[]

  constructor(spots: VillagerSpot[] = VILLAGERS) {
    this.spots = spots
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
    this.mesh = new THREE.InstancedMesh(personGeometry(), mat, spots.length)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.name = 'khmer_villagers_placeholder'
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const c = new THREE.Color()
    spots.forEach((s, i) => {
      const h = s.role === 'kid' ? 1.05 : s.role === 'sit' ? 1.15 : 1.55
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw)
      m.compose(s.pos, q, new THREE.Vector3(h, s.role === 'sit' ? h * 0.7 : h, h))
      this.mesh.setMatrixAt(i, m)
      this.mesh.setColorAt(i, c.set(ROLE_COLOR[s.role]))
    })
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.mesh.computeBoundingSphere()
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on
  }
}

/** チャンダ・おばあさんの仮の箱（立ち位置を見るため）。setSpot で動かす */
export class PlaceholderPerson {
  readonly group = new THREE.Group()

  constructor(kind: 'chanda' | 'grandma') {
    const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })
    const h = kind === 'chanda' ? 1.3 : 1.45
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, h * 0.55, 0.26), mat(kind === 'chanda' ? '#d8402c' : '#7a4a9a'))
    body.position.y = h * 0.48
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, h * 0.3, 8), mat(kind === 'chanda' ? '#e8b84a' : '#f2ece0'))
    skirt.position.y = h * 0.15
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat('#a8704a'))
    head.position.y = h * 0.86
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(kind === 'chanda' ? '#1a1410' : '#d8d8d8'))
    hair.position.y = h * 0.88
    this.group.add(body, skirt, head, hair)
    if (kind === 'chanda') {
      // 刃（アルンから切り出した、青い刃）
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 4), new THREE.MeshStandardMaterial({ color: '#7ac8ff', emissive: new THREE.Color('#3a9aff'), emissiveIntensity: 0.8, roughness: 0.2 }))
      blade.position.set(0.3, h * 0.55, -0.1)
      blade.rotation.x = -0.4
      this.group.add(blade)
    } else {
      // 杖
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), mat('#6a4a28'))
      staff.position.set(0.3, 0.65, 0)
      this.group.add(staff)
    }
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    this.group.name = `khmer_${kind}_placeholder`
  }

  setSpot(s: Spot): void {
    this.group.position.copy(s.pos)
    this.group.rotation.y = s.yaw
  }
}
