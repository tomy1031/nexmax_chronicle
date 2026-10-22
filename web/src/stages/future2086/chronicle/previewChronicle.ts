// future-preview.html の chronicle=1（物語 v7 の舞台の確認）：固定カメラと、仕掛けの状態をクエリで決める。
//   cam=clocktower|clocknight|climb|clocktop|under_entrance|underground|under_room|building|courtyard|shrine|course|site_top|stall|dial|bench|street
//   variant=building|courtyard   ghost=1（変わる瞬間の重ね：building → courtyard）   box=1（箱が開く）
//   clock=20:40（文字盤）  sweep=0..4（黒い手の予告の帯）  hook=0..5（次につかむ金具。climb の既定は 2）  skyseam=1（12 章の空のゆらぎ）
//   loop=2（街頭ビジョンの何度目）
//   ura=1（裏側の足場）  freeze=1（大歯車を止める）  toolbox=drop|freeze  dial=1&year=2026&match=0..1&panel=1（年代ダイヤル）
import * as THREE from 'three'
import type { Hud } from '../../../ui/hud'
import type { NexmaxCharacter } from '../../../world/nexmax/nexmaxModel'
import type { Character } from '../../../world/characters'
import type { FutureScene } from '../scene'
import type { TimeOfDay } from '../fmaterials'
import type { ChronicleAdditions } from './additions'
import { BENCH, KEY_STALL, SITE, TOWER, UNDER } from './layoutChronicle'
import { YearDialLogic } from './yearDialLogic'
import { YearDialPanel } from './yearDialPanel'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type ChronicleCam = {
  pos: THREE.Vector3
  look: THREE.Vector3
  fov: number
  time?: TimeOfDay
  /** ネクマックスの立ち位置（face の方を向く） */
  nexmax?: { pos: THREE.Vector3; face: THREE.Vector3; pose?: string }
  /** ソラの立ち位置（null で隠す） */
  sora?: { pos: THREE.Vector3; face: THREE.Vector3; pose?: string } | null
  variant?: 'building' | 'courtyard'
  title?: string
  sub?: string
}

export const CHRONICLE_CAMS: Record<string, ChronicleCam> = {
  clocktower: {
    pos: v(-0.6, 1.5, 6.5),
    look: v(6.6, 12.4, -21.9),
    fov: 60,
    nexmax: { pos: v(0.9, 0, 3.4), face: v(7.5, 0, -21.9) },
    title: '時計台',
    sub: '北の通りの入口。てっぺんにトワが立つ',
  },
  clocknight: {
    pos: v(0.2, 1.3, 8.0),
    look: v(8.0, 15.0, -24.0),
    fov: 66,
    time: 'night',
    nexmax: { pos: v(1.2, 0, 4.6), face: v(7.5, 0, -21.9) },
    sora: { pos: v(2.6, 0, 5.4), face: v(7.5, 0, -21.9) },
    title: '時計台（夜 8時40分）',
    sub: 'オルムの輪のすぐ手前に、てっぺんの足場',
  },
  climb: {
    // 2 段目の足場より高い所から（下からだと、足場の床にネクマックスと上の金具が隠れる）
    pos: v(-2.6, 10.5, -29.0),
    look: v(5.4, 11.5, -21.8),
    fov: 60,
    // 2 段目の足場（上面 y=7.4）に立つ
    nexmax: { pos: v(4.95, 7.4, -22.4), face: v(9, 7.4, -22.4) },
    sora: null,
    title: '時計台をのぼる',
    sub: '西の壁の金具 6 個と、とちゅうの足場',
  },
  clocktop: {
    pos: v(8.4, 21.7, -25.2),
    look: v(1.0, 6.0, 8.0),
    fov: 64,
    nexmax: { pos: TOWER.towa.pos.clone(), face: v(1.5, 0, 6) },
    sora: null,
    title: '時計台のてっぺん',
    sub: 'トワが立つ所から広場を見下ろす',
  },
  under_entrance: {
    pos: v(-0.6, 1.75, -19.6),
    look: v(-4.6, 0.6, -28.0),
    fov: 60,
    nexmax: { pos: v(-3.0, 0, -22.6), face: v(-4.4, 0, -27) },
    sora: null,
    title: '祭りの地下通路の入口',
  },
  underground: {
    pos: v(-1.3, -2.55, -32.4),
    look: v(-5.0, -3.6, -40.5),
    fov: 66,
    nexmax: { pos: v(-3.3, UNDER.floorY, -36.8), face: v(-6.4, UNDER.floorY, -38.8) },
    sora: { pos: UNDER.sora.pos.clone(), face: v(-3.6, UNDER.floorY, -40) },
    title: '地下通路',
    sub: '天井の穴から黒い手が出てくる所',
  },
  under_room: {
    pos: v(-1.6, -2.5, -38.6),
    look: v(-10.6, -3.9, -40.2),
    fov: 64,
    nexmax: { pos: UNDER.hide.pos.clone(), face: v(-6.4, UNDER.floorY, -38.8) },
    sora: null,
    title: '小さな地下の部屋',
    sub: 'ネクマックスがかくれる所',
  },
  building: {
    pos: v(-3.4, 1.6, -40.2),
    look: v(12.0, 15.0, -46.5),
    fov: 72,
    variant: 'building',
    nexmax: { pos: v(2.6, 0, -39.4), face: v(SITE.kanban.pos.x, 0, SITE.kanban.pos.z) },
    sora: { pos: v(1.8, 0, -38.0), face: v(10, 0, -45) },
    title: 'NEXTMAKE 新館（はじめの歴史）',
    sub: '前に 60 年前の石のかんばん',
  },
  courtyard: {
    pos: v(17.4, 2.1, -41.6),
    look: v(9.6, 2.2, -46.6),
    fov: 64,
    variant: 'courtyard',
    nexmax: { pos: v(12.0, 0, -42.4), face: SITE.shrine.pos.clone() },
    sora: { pos: v(13.4, 0, -41.2), face: SITE.shrine.pos.clone() },
    title: 'NEXTMAKE の中庭（ほこらを守った歴史）',
  },
  shrine: {
    pos: v(12.9, 1.5, -44.3),
    look: v(9.2, 1.25, -46.1),
    fov: 48,
    variant: 'courtyard',
    nexmax: { pos: v(11.3, 0, -45.2), face: SITE.shrine.pos.clone() },
    sora: null,
    title: '時の神さまのほこら',
  },
  course: {
    pos: v(20.2, 6.4, -37.6),
    look: v(12.6, 2.8, -47.6),
    fov: 64,
    variant: 'courtyard',
    nexmax: { pos: v(15.7, 0, -43.6), face: SITE.seam.clone() },
    sora: { pos: SITE.toolbox.hand.clone().setY(SITE.toolbox.deck.h), face: v(14, 0, -44) },
    title: '中庭の練習（止める・裂く）',
  },
  site_top: {
    pos: v(-2.0, 30.0, -27.0),
    look: v(15.0, 0.0, -46.0),
    fov: 60,
    variant: 'courtyard',
    title: '跡地を上から',
  },
  stall: {
    pos: v(9.2, 1.55, 8.6),
    look: v(15.0, 1.4, 11.8),
    fov: 52,
    nexmax: { pos: KEY_STALL.buy.clone(), face: v(KEY_STALL.x, 0, KEY_STALL.z) },
    sora: { pos: KEY_STALL.buy.clone().add(v(-0.2, 0, 1.0)), face: v(KEY_STALL.x, 0, KEY_STALL.z) },
    title: '星のキーホルダーの屋台',
  },
  dial: {
    pos: v(-4.7, 1.75, 0.2),
    // ダイヤルの実際の位置のあたり（リングの開口と操作部をいっしょに）
    look: v(-6.88, 1.4, -3.38),
    fov: 52,
    nexmax: { pos: v(-5.6, 0.18, -1.6), face: v(-6.9, 0, -3.4) },
    // ソラは本編と同じ展示の前（操作卓のそば。ダイヤルの前に立たない）
    sora: { pos: v(-5.0, 0.18, -1.65), face: v(-2, 0, 2) },
    title: 'ソラのわっかの年代ダイヤル',
  },
  bench: {
    pos: v(-8.0, 1.45, 11.2),
    look: v(-13.0, 0.7, 15.4),
    fov: 50,
    nexmax: { pos: BENCH.pos.clone(), face: v(1.5, 0, 1.5), pose: 'idle' },
    sora: null,
    title: 'ひとりのベンチ',
  },
  street: {
    pos: v(0.9, 2.0, 13.4),
    look: v(-1.4, 3.1, 7.4),
    fov: 50,
    title: '街頭ビジョン',
  },
}

export type ChroniclePreviewCtx = {
  urlp: URLSearchParams
  fs: FutureScene
  ch: ChronicleAdditions
  hud: Hud
  ui: HTMLElement
  nexmax: NexmaxCharacter
  sora: Character
  cam: ChronicleCam
  camName: string
  street?: { setNews(n: { date?: string; headline?: string; sub?: string; ticker?: string; loop?: number }): void }
}

/** クエリに合わせて仕掛けの状態を決める。毎フレームの更新を返す */
export function setupChroniclePreview(x: ChroniclePreviewCtx): { update(dt: number): void } {
  const { urlp, ch, cam, camName } = x
  if (cam.title) x.hud.setObjective(cam.title, cam.sub ?? '')
  // 時計（既定：昼 10:00、夜 20:40）
  const clock = (urlp.get('clock') ?? (cam.time === 'night' || urlp.get('time') === 'night' ? '20:40' : '10:00')).split(':').map(Number)
  ch.tower.setTime(clock[0] ?? 10, clock[1] ?? 0)
  if (urlp.has('sweep')) ch.course.setSweepWarn(Number(urlp.get('sweep')))
  ch.tower.setNextHook(urlp.has('hook') ? Number(urlp.get('hook')) : camName === 'climb' ? 0 : null)
  if (urlp.has('skyseam')) ch.tower.setSkySeam(Number(urlp.get('skyseam')))
  if (urlp.has('breach')) ch.underground.breach(Number(urlp.get('breach')))
  if (x.street) {
    const loop = Number(urlp.get('loop') ?? 0)
    if (loop || urlp.has('news')) x.street.setNews({ date: '今日は 2086年10月18日', headline: 'お祭りの一日目です', sub: '天気：一日中晴れ　☀　夜はお祭りの明かりを楽しもう', loop })
  }
  // 跡地の姿（カメラの既定 → クエリ）。ghost=1 なら building で始めて、少ししてから courtyard へ重ねて切り替える
  const variant = (urlp.get('variant') as 'building' | 'courtyard' | null) ?? cam.variant ?? 'building'
  const ghost = urlp.get('ghost') === '1'
  ch.site.setVariant(ghost ? (variant === 'building' ? 'courtyard' : 'building') : variant)
  if (urlp.get('box') === '1') void ch.site.shrine.openBox()
  if (urlp.has('doors')) ch.site.shrine.openDoors(Number(urlp.get('doors')))
  if (urlp.has('pulse')) ch.site.shrine.setLockPulse(Number(urlp.get('pulse')))
  if (urlp.has('sun')) ch.site.shrine.setSunbeam(Number(urlp.get('sun')))
  if (urlp.has('ura')) ch.site.setUra(Number(urlp.get('ura')))
  ch.site.setSeam(urlp.has('seam') ? Number(urlp.get('seam')) : 0.8)
  if (urlp.get('freeze') === '1') ch.site.gear.freeze(true)
  if (urlp.get('toolbox') === 'drop' || urlp.get('toolbox') === 'freeze') ch.site.toolbox.drop()
  if (urlp.has('sold')) for (let i = 0; i < Number(urlp.get('sold')); i++) ch.stall.takeOne()
  if (urlp.has('surge')) ch.site.kanban.setSurge(Number(urlp.get('surge')))
  // 年代ダイヤル（3D と画面）
  let panel: YearDialPanel | null = null
  const logic = new YearDialLogic({ start: Number(urlp.get('year') ?? 2086), target: Number(urlp.get('target') ?? 2026) })
  if (urlp.get('dial') === '1' || camName === 'dial') {
    ch.dial.setDial(true, true)
    ch.dial.setYear(logic.year)
    const m = urlp.has('match') ? Number(urlp.get('match')) : logic.match
    ch.dial.setMatch(m)
    if (urlp.get('panel') !== '0') {
      panel = new YearDialPanel(x.ui)
      panel.show({ year: logic.year, sub: 'NEXTMAKE 前のかんばんの記録' })
      panel.setMatch(m)
      panel.setDetune(urlp.has('match') ? (1 - m) * 0.6 : logic.detune)
    }
  }
  let t = 0
  let frozeTool = false
  return {
    update(dt: number) {
      t += dt
      panel?.update(dt)
      ch.course.update(dt)
      if (ghost && t > 1.2 && t - dt <= 1.2) void ch.site.ghostSwap(variant, Number(urlp.get('ghostSec') ?? 4))
      if (urlp.get('toolbox') === 'freeze' && !frozeTool && t > 0.25) {
        frozeTool = true
        ch.site.toolbox.freeze(true)
      }
    },
  }
}
