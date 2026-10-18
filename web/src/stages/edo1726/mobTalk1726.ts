// 1726年 仕掛け横丁の町人（townsfolk.ts）のうわさ話（吹き出し・F の会話）。台詞は mob_lines_1726.json（導入編 7-2）。
// 場面はフラグだけで決める（script.ts の mobPhase1726：town／ring／after）。ステージは begin で作り、毎フレーム呼ぶだけ。
import type * as THREE from 'three'
import type { Hint } from '../../ui/hud'
import type { StageRuntime } from '../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import type { Townsfolk } from './townsfolk'
import { mobPhase1726 } from './script'
import lines from './mob_lines_1726.json'

export const MOB_TABLE_1726 = lines as unknown as MobTable

const TALK_HINTS: Hint[] = [{ key: 'F', label: '話す' }]

export class MobTalk1726 {
  readonly talk: MobTalk
  /** 吹き出しを出した人（うわさを聞いた数。おはるが来る合図に使う） */
  private readonly heard = new Set<number>()

  constructor(folk: Townsfolk, host: HTMLElement | null, camera: THREE.Camera) {
    const speakers: MobSpeakerDef[] = []
    folk.defs.forEach((d, i) => {
      if (!d.id) return
      speakers.push({
        id: d.id,
        anchor: (out) => (folk.head(i, out), true),
        footY: () => 0,
        range: () => [3.2, 1.6],
        talkReach: 2.2,
      })
    })
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_1726, speakers, theme: '1726' })
  }

  /** 聞いたうわさの数（吹き出しを出した人の数） */
  get rumorsHeard(): number {
    return this.heard.size
  }

  update(dt: number, rt: StageRuntime, suspended: boolean): void {
    this.talk.update(dt, rt.player.position, mobPhase1726((n) => rt.story.get(n)), suspended || rt.talking || rt.inCinematic)
    for (const s of this.talk.director.slots) if (s.speaker >= 0) this.heard.add(s.speaker)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

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
