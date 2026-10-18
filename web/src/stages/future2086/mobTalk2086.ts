// 2086年 時代博覧祭の町の人（モブ）と量産型ネクマックスのおしゃべり（吹き出し・F の会話）。台詞は mob_lines_2086.json。
// ・話す人：祭りの人出（crowd.ts の立っている人）から、道・屋台・IDO 展示の前・入口・回廊の上の人を選ぶ（MOB_SLOTS_2086）＋
//   会場で働く量産型（units.ts）。見た目・配置はそのまま（台詞を足すだけ）
// ・場面（mobPhase2086）は物語のステップではなく、時間帯（夜か）と周回数（StoryState.loop_count）だけで決める：
//   morning（最初の朝）／loop_morning（ループした朝＝同じ台詞）／loop_morning2（2 回目以降）／night（夜。残っている人だけ）
// ・夜は広場の人が避難していなくなる（crowd.ts と同じ）。回廊の上の人は下へ向かって叫ぶ（範囲を広く）
// アダプタ（game/future2086Adapter.ts）は begin で作り、update・animate・interact・hints・dispose から呼ぶだけ。
import * as THREE from 'three'
import type { Hint } from '../../ui/hud'
import type { StageRuntime } from '../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import type { CrowdSpot } from './crowd'
import type { FutureScene } from './scene'
import { UNIT_HEIGHT } from './units'
import lines from './mob_lines_2086.json'

export const MOB_TABLE_2086 = lines as unknown as MobTable

/** 話す人の選び方：役（crowd.ts）と、だいたいの場所（x, z）。いちばん近い、まだ選ばれていない人 */
export type MobSlot2086 = {
  id: string
  role: CrowdSpot['role']
  near: readonly [number, number]
  /** 子どもに限る（見つからなければその枠は無し） */
  child?: boolean
  /** near からこの距離（m）までの人だけ */
  maxDist?: number
  /** 回廊の上：夜は下の広場へ叫ぶ（範囲を広く） */
  shout?: boolean
}

export const MOB_SLOTS_2086: readonly MobSlot2086[] = [
  // IDO 展示の前（体験帰り・見物・ソラを知る人）と、VR の列に並ぶ親子
  { id: 'ido_wow', role: 'booth', near: [-4.8, 4.5] },
  { id: 'ido_expo', role: 'booth', near: [-4.1, 3.5] },
  { id: 'ido_sora', role: 'booth', near: [-3.8, 3.4] },
  { id: 'queue_kid', role: 'plaza', near: [-12.2, 6.2], child: true },
  { id: 'queue_parent', role: 'plaza', near: [-12.4, 6.5] },
  // 南の入口のそば
  { id: 'entrance_elder', role: 'plaza', near: [-3.6, 11.6] },
  { id: 'entrance_tourist', role: 'plaza', near: [-3.1, 12.0] },
  { id: 'couple', role: 'plaza', near: [9.0, 13.5] },
  // 北のアーチの下（空を見上げる子ども・実行委員）
  { id: 'sky_kid', role: 'plaza', near: [-1.0, -10.2], child: true },
  { id: 'staff', role: 'plaza', near: [-0.9, -11.2] },
  // 屋台・ステージのあたり
  { id: 'clock_worker', role: 'plaza', near: [9.3, 4.2] },
  { id: 'candy_kids', role: 'plaza', near: [10.1, -3.7], child: true },
  { id: 'stall_local', role: 'stall', near: [12.7, -6.2] },
  { id: 'vlogger', role: 'stall', near: [12.4, 3.0] },
  { id: 'stage_fan', role: 'stage', near: [12.0, -7.5] },
  // 回廊の上（朝は回廊を通るとき、夜は下へ叫ぶ）
  { id: 'walk_view', role: 'walkway', near: [-15.8, 2.8], shout: true },
  { id: 'walk_photo', role: 'walkway', near: [-15.8, -7.6], shout: true },
  { id: 'walk_north', role: 'walkway', near: [-14.0, -16.0], shout: true },
]

/** 立っている人から枠ごとに 1 人選ぶ（純粋な計算。枠の順に、いちばん近い、まだ選ばれていない人） */
export function pickCrowdSpeakers(
  spots: ReadonlyArray<{ pos: { x: number; z: number }; role: string; child: boolean }>,
  slots: readonly MobSlot2086[] = MOB_SLOTS_2086,
): Array<{ slot: MobSlot2086; index: number }> {
  const taken = new Set<number>()
  const out: Array<{ slot: MobSlot2086; index: number }> = []
  for (const slot of slots) {
    let best = -1
    let bd = slot.maxDist ?? 3
    spots.forEach((s, i) => {
      if (taken.has(i) || s.role !== slot.role || (slot.child !== undefined && s.child !== slot.child)) return
      const d = Math.hypot(s.pos.x - slot.near[0], s.pos.z - slot.near[1])
      if (d <= bd) {
        bd = d
        best = i
      }
    })
    if (best < 0) continue
    taken.add(best)
    out.push({ slot, index: best })
  }
  return out
}

/**
 * 台詞の場面。物語のステップに依存させない（シナリオを書き直しても使えるように）：
 * 夜なら night、そうでなければ周回数で morning → loop_morning → loop_morning2
 */
export function mobPhase2086(s: { night: boolean; loopCount: number }): string {
  if (s.night) return 'night'
  if (s.loopCount >= 2) return 'loop_morning2'
  return s.loopCount >= 1 ? 'loop_morning' : 'morning'
}

const R_DEFAULT: readonly [number, number] = [2.6, 1.6]
const R_WALK_DAY: readonly [number, number] = [2.8, 1.4]
const R_WALK_NIGHT: readonly [number, number] = [4.8, 6.5]
const R_STALL_UNIT: readonly [number, number] = [3.0, 1.6]

/** 2086 年のおしゃべり（アダプタから使う形） */
export class MobTalk2086 {
  readonly talk: MobTalk
  private readonly fs: FutureScene

  constructor(fs: FutureScene, host: HTMLElement | null, camera: THREE.Camera) {
    this.fs = fs
    const night = () => fs.timeOfDay === 'night'
    const speakers: MobSpeakerDef[] = []
    // 祭りの人出から
    const spots = fs.crowd.standing
    for (const { slot, index } of pickCrowdSpeakers(spots, MOB_SLOTS_2086)) {
      const s = spots[index]
      speakers.push({
        id: slot.id,
        anchor: (out) => {
          if (!s.keepAtNight && night()) return false
          out.set(s.pos.x, s.top + 0.16, s.pos.z)
          return true
        },
        footY: () => s.pos.y,
        range: slot.shout ? (ph) => (ph === 'night' ? R_WALK_NIGHT : R_WALK_DAY) : () => R_DEFAULT,
        talkReach: 2.1,
      })
    }
    // 会場で働く量産型ネクマックス（店番は台の向こうなので少し遠くまで）
    for (const u of fs.units.list) {
      const root = u.ch.root
      const stall = /^unit_(takoyaki|soba|ame|kingyo)$/.test(u.spec.id)
      speakers.push({
        id: u.spec.id,
        anchor: (out) => {
          out.copy(root.position)
          out.y += UNIT_HEIGHT + 0.2
          return root.visible
        },
        footY: () => root.position.y,
        range: () => (stall ? R_STALL_UNIT : R_DEFAULT),
        talkReach: stall ? 2.7 : 2.2,
      })
    }
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_2086, speakers, theme: '2086' })
  }

  /**
   * プレイ中の毎フレーム。suspended はステージ側の「いまは出さない」（会話待ち・選択肢・演出・操作の固定など）。
   * シェルの会話（rt.talking）とカメラの演出（rt.inCinematic があれば）の間もここで止める
   */
  update(dt: number, rt: StageRuntime, suspended: boolean): void {
    const cine = (rt as { readonly inCinematic?: boolean }).inCinematic === true
    const phase = mobPhase2086({ night: this.fs.timeOfDay === 'night', loopCount: rt.story.loop_count })
    this.talk.update(dt, rt.player.position, phase, suspended || rt.talking || cine)
  }

  /** 毎フレーム（animate から。カメラが動いた後） */
  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F：近くの町の人と話す（話したら true）。ソラ・展示が近くにいないときだけ呼ぶ */
  interact(rt: StageRuntime): boolean {
    return this.talk.interact(rt, rt.player.position)
  }

  /** キー案内に「F：話す」を足す（話せる人が近いときだけ） */
  hints(base: Hint[], rt: StageRuntime): Hint[] {
    return this.talk.withTalkHint(base, rt.player.position)
  }

  debugInfo(): Record<string, unknown> {
    return this.talk.debugInfo()
  }

  dispose(): void {
    this.talk.dispose()
  }
}
