// 2026年 なんばの通行人（遊歩道を歩く人 pedestrians.ts）と NEXTMAKE の社員（officeStaff.ts）のおしゃべり
// （吹き出し・F の会話）。台詞は mob_lines_2026.json。
// 場面はフラグだけで決める：first（1726年へ行く前）／back（水門を直して戻ったあと。IDO に源兵衛の絵図の記録が増えている）。
// ステージ（stage.ts）は begin で作り、update・animate・interact・hints・dispose から呼ぶだけ。
import type * as THREE from 'three'
import type { Hint } from '../../ui/hud'
import type { StageRuntime } from '../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import type { Pedestrians } from './pedestrians'
import type { OfficeStaff } from './officeStaff'
import lines from './mob_lines_2026.json'

export const MOB_TABLE_2026 = lines as unknown as MobTable

/** 台詞のある通行人（pedestrians.ts の何人目か。南岸の 3 人・東の 1 人・北岸の 3 人） */
export const MOB_WALKERS_2026: ReadonlyArray<{ id: string; walker: number }> = [
  { id: 'w_student', walker: 0 },
  { id: 'w_tourist', walker: 1 },
  { id: 'w_office', walker: 2 },
  { id: 'w_granny', walker: 3 },
  { id: 'w_couple', walker: 4 },
  { id: 'w_techfan', walker: 6 },
  { id: 'w_photo', walker: 8 },
]

/** 台詞のある社員（officeStaff.ts の OFFICE_STAFF と同じ並び） */
export const MOB_STAFF_2026: readonly string[] = ['o_engineer', 'o_designer', 'o_planner']

/** 台詞の場面（フラグだけで決める） */
export function mobPhase2026(f: (name: string) => boolean): string {
  return f('gate_repaired') ? 'back' : 'first'
}

/** 頭の上（吹き出しの付け根）の高さ */
const HEAD = 1.8
const TALK_HINTS: Hint[] = [{ key: 'F', label: '話す' }]

export class MobTalk2026 {
  readonly talk: MobTalk

  constructor(peds: Pedestrians, host: HTMLElement | null, camera: THREE.Camera, staff: OfficeStaff | null = null) {
    const pos = peds.positions
    const speakers: MobSpeakerDef[] = []
    for (const m of MOB_WALKERS_2026) {
      const p = pos[m.walker]
      if (!p) continue
      speakers.push({
        id: m.id,
        anchor: (out) => {
          out.set(p.x, p.y + HEAD, p.z)
          return peds.group.visible
        },
        footY: () => 0,
        range: () => [2.6, 1.6],
        // 歩いている人なので、少し離れていても話しかけられる
        talkReach: 2.6,
      })
    }
    // オフィスの社員（止まっている。机の向こうからでも話せるよう少し遠くまで）
    if (staff) {
      MOB_STAFF_2026.forEach((id, i) => {
        const h = staff.heads[i]
        if (!h) return
        speakers.push({ id, anchor: (out) => (out.copy(h), true), footY: () => 0, range: () => [3.0, 1.6], talkReach: 2.3 })
      })
    }
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_2026, speakers, theme: '2026' })
  }

  /** プレイ中の毎フレーム。suspended はステージ側の「いまは出さない」（社長たちとの会話・IDO・到着の演出など） */
  update(dt: number, rt: StageRuntime, suspended: boolean): void {
    const cine = (rt as { readonly inCinematic?: boolean }).inCinematic === true
    this.talk.update(dt, rt.player.position, mobPhase2026((n) => rt.story.get(n)), suspended || rt.talking || cine)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F：近くの通行人と話す（話したら true）。社長・佐伯・IDO が近くにいないときだけ呼ぶ */
  interact(rt: StageRuntime): boolean {
    return this.talk.interact(rt, rt.player.position)
  }

  /** 通行人と話せるときのキー案内（いなければ null） */
  hints(rt: StageRuntime): Hint[] | null {
    return this.talk.canTalk(rt.player.position) ? TALK_HINTS : null
  }

  dispose(): void {
    this.talk.dispose()
  }
}
