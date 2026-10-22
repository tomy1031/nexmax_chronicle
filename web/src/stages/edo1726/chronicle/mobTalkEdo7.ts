// 7 章（1726年 仕掛け横丁）の町の人（townsfolk7.ts）と話す：近づくと頭の上に吹き出し、F で短い会話（台詞は mob_lines_v7.json）。
// 場面は段階から（storyEdo7.ts の edoMobPhase：day／night／morning）。夜は町の人がいない（group が隠れている）ので黙る。
// ステージは begin で作り、毎フレーム update・render を呼ぶだけ。源兵衛・おはる・書・箱など本来の F の相手を先に調べ、いなければ interact を呼ぶ。
import type * as THREE from 'three'
import type { Hint } from '../../../ui/hud'
import type { StageRuntime } from '../../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../../world/mobTalk'
import type { MobTable } from '../../../world/mobTalkLogic'
import type { Townsfolk } from './townsfolk7'
import { edoMobPhase, type EdoStep } from './storyEdo7'
import lines from './mob_lines_v7.json'

export const MOB_TABLE_EDO7 = lines as unknown as MobTable

const TALK_HINTS: Hint[] = [{ key: 'F', label: '話す' }]

export class MobTalkEdo7 {
  readonly talk: MobTalk
  /** 話者の番号 → 町の人の番号 */
  private readonly folkIndex: number[] = []
  private readonly folk: Townsfolk
  /** 話しかけた人（開発用：何人と話したか） */
  readonly talked = new Set<string>()

  constructor(folk: Townsfolk, host: HTMLElement | null, camera: THREE.Camera) {
    this.folk = folk
    const speakers: MobSpeakerDef[] = []
    folk.defs.forEach((d, i) => {
      if (!d.id) return
      this.folkIndex.push(i)
      speakers.push({
        id: d.id,
        // 夜（群れが隠れている）はいない
        anchor: (out) => folk.group.visible && (folk.head(i, out), true),
        footY: () => 0,
        range: () => [3.2, 1.6],
        talkReach: 2.3,
      })
    })
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_EDO7, speakers, theme: '1726' })
  }

  update(dt: number, rt: StageRuntime, step: EdoStep, suspended: boolean): void {
    this.talk.update(dt, rt.player.position, edoMobPhase(step), suspended || rt.talking || rt.inCinematic)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F：近くの町の人と話す（話したら true）。話しかけられた人は、ネクマックスの方を向く */
  interact(rt: StageRuntime): boolean {
    const p = rt.player.position
    const k = this.talk.nearestTalker(p)
    if (k < 0 || !this.talk.interact(rt, p)) return false
    this.folk.faceToward(this.folkIndex[k], p, 8)
    const id = this.folk.defs[this.folkIndex[k]].id
    if (id) this.talked.add(id)
    return true
  }

  hints(rt: StageRuntime): Hint[] | null {
    return this.talk.canTalk(rt.player.position) ? TALK_HINTS : null
  }

  debugInfo(): Record<string, unknown> {
    return { ...this.talk.debugInfo(), talked: [...this.talked] }
  }

  dispose(): void {
    this.talk.dispose()
  }
}
