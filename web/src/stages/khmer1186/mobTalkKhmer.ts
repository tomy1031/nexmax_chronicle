// 11 章（1186年 アルンの寺と村）の村の人（people.ts の createKhmerVillagers）と話す：近づくと頭の上に吹き出し、F で短い会話（mob_lines_v7.json）。
// 場面は段階とまりから（storyKhmer.ts の khmerMobPhase）。夜は村の人がいないので黙る。話しかけた人はネクマックスの方を向く。
// ステージは begin で作り、毎フレーム update・render を呼ぶだけ。チャンダ・おばあさん・鏡の台など本来の F の相手を先に調べ、いなければ interact を呼ぶ。
import type * as THREE from 'three'
import type { Hint } from '../../ui/hud'
import type { StageRuntime } from '../../game/stage'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import type { KhmerVillager } from './people'
import lines from './mob_lines_v7.json'

export const MOB_TABLE_KHMER = lines as unknown as MobTable

const TALK_HINTS: Hint[] = [{ key: 'F', label: '話す' }]

/** 頭の上（吹き出しの付け根）の高さ：立っている人・子ども・すわっている人 */
function headHeight(v: KhmerVillager): number {
  return v.spot.role === 'kid' ? 1.4 : v.spot.role === 'sit' ? 1.15 : 1.9
}

export class MobTalkKhmer {
  readonly talk: MobTalk
  private readonly villagers: KhmerVillager[]
  /** 話しかけた人（開発用） */
  readonly talked = new Set<string>()

  /** present()：村の人がいま出ているか（夜は false） */
  constructor(villagers: KhmerVillager[], host: HTMLElement | null, camera: THREE.Camera, present: () => boolean) {
    this.villagers = villagers
    const speakers: MobSpeakerDef[] = villagers.map((v) => ({
      id: v.id,
      anchor: (out) => {
        if (!present()) return false
        const p = v.ch.root.position
        out.set(p.x, p.y + headHeight(v), p.z)
        return true
      },
      footY: () => v.ch.root.position.y,
      range: () => [3.4, 1.8],
      talkReach: 2.4,
    }))
    this.talk = new MobTalk({ host, camera, table: MOB_TABLE_KHMER, speakers, theme: '1186' })
  }

  update(dt: number, rt: StageRuntime, phase: string, suspended: boolean): void {
    this.talk.update(dt, rt.player.position, phase, suspended || rt.talking || rt.inCinematic)
  }

  render(dt: number): void {
    this.talk.render(dt)
  }

  /** F の相手になる村の人（いなければ null） */
  nearest(rt: StageRuntime): KhmerVillager | null {
    const k = this.talk.nearestTalker(rt.player.position)
    return k >= 0 ? this.villagers[k] : null
  }

  /** F：近くの村の人と話す（話したら true）。face：話しかけた人をネクマックスへ向ける */
  interact(rt: StageRuntime, face: (v: KhmerVillager) => void): boolean {
    const v = this.nearest(rt)
    if (!v || !this.talk.interact(rt, rt.player.position)) return false
    face(v)
    this.talked.add(v.id)
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
