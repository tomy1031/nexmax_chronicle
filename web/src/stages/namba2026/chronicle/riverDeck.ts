// 物語 v7.1 の 6 章：NEXTMAKE の前の「水辺の広場」（南岸から水路へ張り出した板の広場）と、影獣がぶつかる柱。
// ・板の床（すこし色のちがう板をならべる）・水の中の杭・ふちの低い金属の柵（当たり判定は street.ts の見えない壁）
// ・工事の鉄柱（黄と黒のしま）2 本と、看板の柱（「IDO ひろば」の札）1 本。当たり判定つき
// 街灯 3 本と吊り輪の門の柱は、もとの町の物をそのまま柱に使う（layoutV7.ts の PILLARS）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { makeCanvas } from '../../../render/textures'
import { N } from '../layout'
import { box, boxAB, cyl, type NCtx } from '../kit'
import { DECK, PILLARS } from './layoutV7'

const ROUND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif'

/** 板の広場を組み立てる（床・杭・柵・新しい柱） */
export function buildRiverDeck(c: NCtx): void {
  const { x0, x1, z0 } = DECK
  const zBank = N.CANAL_S - 0.02
  const top = 0.06
  // 床：水路に平行な板（幅 0.3m）。少しずつ色を変える
  const planks = Math.round((zBank - z0) / 0.3)
  const pw = (zBank - z0) / planks
  for (let i = 0; i < planks; i++) {
    const za = z0 + i * pw
    const tint = ['#b48a5e', '#a87e54', '#bc9466', '#a27850'][i % 4]
    boxAB(c, x0, x1, top - 0.08, top, za + 0.012, za + pw - 0.012, c.m.woodPlain, { tint, cast: false, r: 0.008 })
  }
  // 板のすき間の下（暗い）と、ふちの化粧板
  boxAB(c, x0, x1, top - 0.2, top - 0.075, z0, zBank, c.m.paint, { tint: '#2a2018', cast: false })
  boxAB(c, x0 - 0.06, x1 + 0.06, top - 0.32, top + 0.02, z0 - 0.06, z0, c.m.woodPlain, { tint: '#6a4a2e' })
  for (const x of [x0, x1]) boxAB(c, x - 0.06, x + 0.06, top - 0.32, top + 0.02, z0, zBank, c.m.woodPlain, { tint: '#6a4a2e' })
  c.col.floor(x0, x1, z0, zBank + 0.02, top, 0.4)
  // 水の中の杭
  for (let x = x0 + 0.4; x <= x1 - 0.39; x += 3.2) cyl(c, x, N.WL - 1.4, top - 0.2, z0 + 0.35, 0.16, c.m.woodPlain, { tint: '#4a3624', seg: 10 })
  for (const x of [x0 + 0.4, x1 - 0.4]) cyl(c, x, N.WL - 1.4, top - 0.2, (z0 + zBank) / 2, 0.16, c.m.woodPlain, { tint: '#4a3624', seg: 10 })
  // ふちの柵（黒い金属の柱と 2 本の横棒）
  const railH = 0.95
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / 1.6))
    const rot = -Math.atan2(bz - az, bx - ax)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      box(c, ax + (bx - ax) * t, top + railH / 2, az + (bz - az) * t, 0.06, railH, 0.06, c.m.metal, { tint: '#2a2d33' })
    }
    for (const y of [railH, railH * 0.5]) c.b.add(rbox(len, 0.05, 0.05, 0.01), c.m.metal, M((ax + bx) / 2, top + y, (az + bz) / 2, 0, rot, 0), { tint: y === railH ? '#c8a050' : '#2a2d33' })
  }
  rail(x0 + 0.05, zBank, x0 + 0.05, z0 + 0.05)
  rail(x0 + 0.05, z0 + 0.05, x1 - 0.05, z0 + 0.05)
  rail(x1 - 0.05, z0 + 0.05, x1 - 0.05, zBank)
  // 新しい柱（工事の鉄柱・看板の柱）
  for (const p of PILLARS) {
    if (p.kind === 'steel' && p.id !== 'frame') steelPillar(c, p.pos.x, p.pos.z, top)
    else if (p.kind === 'sign') signPillar(c, p.pos.x, p.pos.z, top)
  }
}

/** 工事の鉄柱：黄と黒のしまの角柱（上に赤い回転灯）。足元にコンクリートの重り */
function steelPillar(c: NCtx, x: number, z: number, y0: number): void {
  const h = 3.2
  boxAB(c, x - 0.38, x + 0.38, y0, y0 + 0.22, z - 0.38, z + 0.38, c.m.concrete, { tint: '#b8b4ac' })
  const seg = 0.32
  for (let y = y0 + 0.22, i = 0; y < y0 + h - 0.01; y += seg, i++) {
    boxAB(c, x - 0.15, x + 0.15, y, Math.min(y0 + h, y + seg), z - 0.15, z + 0.15, c.m.paint, { tint: i % 2 ? '#1c1c1c' : '#f2c21c', r: 0.005 })
  }
  cyl(c, x, y0 + h, y0 + h + 0.18, z, 0.09, c.m.plastic, { tint: '#e8341c', seg: 10 })
  c.col.box(x, y0 + h / 2, z, 0.3, h, 0.3)
  c.lights.push({ pos: new THREE.Vector3(x, y0 + h + 0.1, z), color: '#ff5a3a', intensity: 0.9, dist: 4 })
}

/** 看板の柱：細い丸い柱の上に「IDO ひろば」の札（絵はアトラスに入れず、この柱だけのキャンバス） */
function signPillar(c: NCtx, x: number, z: number, y0: number): void {
  const h = 3.0
  cyl(c, x, y0, y0 + 0.2, z, 0.2, c.m.metal, { tint: '#2a2d33', r1: 0.14, seg: 12 })
  cyl(c, x, y0 + 0.2, y0 + h, z, 0.09, c.m.metal, { tint: '#3a5a8a', seg: 10 })
  c.col.box(x, y0 + h / 2, z, 0.26, h, 0.26)
  const [cv, g] = makeCanvas(256, 160)
  const gr = g.createLinearGradient(0, 0, 0, 160)
  gr.addColorStop(0, '#1f6fd0')
  gr.addColorStop(1, '#14509c')
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 160)
  g.strokeStyle = '#ffffff'
  g.lineWidth = 6
  g.strokeRect(6, 6, 244, 148)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `900 52px ${ROUND}`
  g.fillText('IDO', 128, 52)
  g.font = `800 34px ${ROUND}`
  g.fillText('みずべ ひろば', 128, 112)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 })
  for (const s of [0, Math.PI]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.68), mat)
    m.position.set(x, y0 + h - 0.1, z)
    m.rotation.y = s + 0.35
    m.position.x += Math.sin(m.rotation.y) * 0.03
    m.position.z += Math.cos(m.rotation.y) * 0.03
    c.root.add(m)
  }
  box(c, x, y0 + h - 0.1, z, 1.14, 0.72, 0.04, c.m.metal, { rotY: 0.35, tint: '#2a2d33' })
}
