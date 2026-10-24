// 物語 v7 の 2086 年：町の人（祭りの人出）と量産型NEXMAXのおしゃべり（吹き出し・F の会話）。台詞は mob_lines_v7.json。
// 前の版（mobTalk2086.ts）と同じく、共有の world/mobTalk.ts を使う。話す人の選び方（MOB_SLOTS_2086・pickCrowdSpeakers）もそのまま。
// ・場面（mobPhaseV7）は時間帯とフラグだけで決める：
//   day1（1 度目の 10月18日）／loop（くり返しの朝。書かなければ day1 を一字一句そのまま＝同じ人が同じことを言う）／
//   changed（10 章で昔が変わったあと。中庭のほこらが「ずっと前から」ある）／evening（夕方）／night（夜）／epilogue（10月19日）
// ・物語の先は言わない（トワ・オルム・時を裂く爪の名前は出さない）
import * as THREE from 'three'
import type { Hint } from '../../../ui/hud'
import type { StageRuntime } from '../../../game/stage'
import type { Flags } from '../../../chronicle/progress'
import { MobTalk, type MobSpeakerDef } from '../../../world/mobTalk'
import type { MobTable } from '../../../world/mobTalkLogic'
import { MOB_SLOTS_2086, pickCrowdSpeakers } from '../mobTalk2086'
import type { FutureScene } from '../scene'
import { UNIT_HEIGHT, type Units } from '../units'
import lines from './mob_lines_v7.json'

export const MOB_TABLE_V7 = lines as unknown as MobTable

/** 場面（時間帯 part：morning | evening | night） */
export function mobPhaseV7(f: Flags, part: string): string {
  if (part === 'night') return 'night'
  if (f('v7_ending')) return 'epilogue'
  if (part === 'evening') return 'evening'
  if (f('v7_back2')) return 'changed'
  if (f('v7_rewind1')) return 'loop'
  return 'day1'
}

const R_DEFAULT: readonly [number, number] = [2.6, 1.6]
const R_WALK_DAY: readonly [number, number] = [2.8, 1.4]
const R_WALK_NIGHT: readonly [number, number] = [4.8, 6.5]
const R_STALL_UNIT: readonly [number, number] = [3.0, 1.6]

export class MobTalkV7 {
  readonly talk: MobTalk

  constructor(fs: FutureScene, extraUnits: Units[], host: HTMLElement | null, camera: THREE.Camera) {
    const night = () => fs.timeOfDay === 'night'
    const speakers: MobSpeakerDef[] = []
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
    // 会場で働く量産型NEXMAX（店番は台の向こうなので少し遠くまで）
    for (const u of [...fs.units.list, ...extraUnits.flatMap((x) => x.list)]) {
      const root = u.ch.root
      const stall = /^unit_(takoyaki|soba|ame|kingyo|keychain)$/.test(u.spec.id)
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
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_V7, speakers, theme: '2086' })
  }

  /** プレイ中の毎フレーム。suspended：場面の中（操作を止めている・会話を待っている） */
  update(dt: number, rt: StageRuntime, phase: string, suspended: boolean): void {
    this.talk.update(dt, rt.player.position, phase, suspended || rt.talking || rt.inCinematic)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F：近くの町の人と話す（話したら true） */
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
