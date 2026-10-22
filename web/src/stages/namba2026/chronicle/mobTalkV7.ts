// 物語 v7.1 の 2026年 なんば：町の人（遊歩道を歩く人・NEXTMAKE の社員）と F で話す（吹き出しと短い会話）。
// 共有の world/mobTalk.ts をそのまま使う（前の版の mobTalk2026.ts と同じ形）。台詞は mob_lines_v7.json。
// 場面は段階から決める：after（影獣のあと＝6 章。「さっきの、なんやったん？」・立てたばかりのかんばんと QR）／
// dusk（9 章の夕方の路地とほこら）／dawn（9 章の朝）。影獣と戦う前・防衛戦の夜は話さない（ステージが suspended にする）。
import type * as THREE from 'three'
import type { Hint } from '../../../ui/hud'
import type { StageRuntime } from '../../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../../world/mobTalk'
import type { MobTable } from '../../../world/mobTalkLogic'
import type { Pedestrians } from '../pedestrians'
import type { OfficeStaff } from '../officeStaff'
import type { NambaV7Step } from './storyNamba'
import lines from './mob_lines_v7.json'

export const MOB_TABLE_V7 = lines as unknown as MobTable

/** 台詞のある通行人（pedestrians.ts の何人目か。南岸の 3 人・路地の口の東の 1 人・北岸の 3 人） */
export const MOB_WALKERS_V7: ReadonlyArray<{ id: string; walker: number }> = [
  { id: 'w_student', walker: 0 },
  { id: 'w_tourist', walker: 1 },
  { id: 'w_office', walker: 2 },
  { id: 'w_granny', walker: 3 },
  { id: 'w_couple', walker: 4 },
  { id: 'w_techfan', walker: 6 },
  { id: 'w_photo', walker: 8 },
]

/** 台詞のある社員（officeStaff.ts の OFFICE_STAFF と同じ並び） */
export const MOB_STAFF_V7: readonly string[] = ['o_engineer', 'o_designer', 'o_planner']

/** 台詞の場面（段階だけで決める） */
export function mobPhaseV7(step: NambaV7Step): string {
  switch (step) {
    case 'arrive':
      return 'before'
    case 'shrine_talk':
    case 'defense':
      return 'dusk'
    case 'return':
      return 'dawn'
    default:
      return 'after'
  }
}

const HEAD = 1.8
const TALK_HINTS: Hint[] = [{ key: 'F', label: '話す' }]

export class MobTalkV7 {
  readonly talk: MobTalk

  constructor(peds: Pedestrians, host: HTMLElement | null, camera: THREE.Camera, staff: OfficeStaff | null, _root?: THREE.Object3D) {
    const pos = peds.positions
    const speakers: MobSpeakerDef[] = []
    for (const m of MOB_WALKERS_V7) {
      const p = pos[m.walker]
      if (!p) continue
      speakers.push({
        id: m.id,
        anchor: (out) => {
          out.set(p.x, p.y + HEAD, p.z)
          return peds.group.visible && (peds.group.children[m.walker]?.visible ?? true)
        },
        footY: () => 0,
        range: () => [2.6, 1.6],
        talkReach: 2.6,
      })
    }
    if (staff) {
      MOB_STAFF_V7.forEach((id, i) => {
        const h = staff.heads[i]
        if (!h) return
        speakers.push({ id, anchor: (out) => (out.copy(h), true), footY: () => 0, range: () => [3.0, 1.6], talkReach: 2.3 })
      })
    }
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_V7, speakers, theme: '2026' })
  }

  /** プレイ中の毎フレーム。suspended はステージ側の「いまは出さない」 */
  update(dt: number, rt: StageRuntime, step: NambaV7Step, suspended: boolean): void {
    const cine = (rt as { readonly inCinematic?: boolean }).inCinematic === true
    this.talk.update(dt, rt.player.position, mobPhaseV7(step), suspended || rt.talking || cine)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F：近くの町の人と話す（話したら true） */
  interact(rt: StageRuntime): boolean {
    return this.talk.interact(rt, rt.player.position)
  }

  hints(rt: StageRuntime): Hint[] | null {
    return this.talk.canTalk(rt.player.position) ? TALK_HINTS : null
  }

  dispose(): void {
    this.talk.dispose()
  }
}
