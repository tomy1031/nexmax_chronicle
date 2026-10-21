// 11章の夜明け：光の扉から裏側へ（オルムの心臓との初戦）。visuals 担当の部品（buildUraArena・OrmHeart・UraEnvSwitch・SHADE_STYLE）で組む。
// visuals 担当の UraBattle（chronicle/uraBattle.ts）ができたら、stage.ts はそちらを使う（これは代わり）。
//   1 入る（白くとぶ → 裏側の足場へ。うしろに夜明けの光の扉）
//   2 護衛：チャンダが心臓へ走る道を守る（影を K・J で追いはらう。影が近いとチャンダは止まる）
//   3 演出：刃が心臓をつく → すじが光をすう → 刃が折れる → 足に黒いもの
//   4 J でチャンダの足の黒いものを裂く（時空裂きの ura）
//   5 扉が閉じる前に帰る（残り時間。まにあわなければ、心臓の前からやり直し）
import * as THREE from 'three'
import type { StageRuntime, ObjectiveMark } from '../../game/stage'
import type { DialogueLine } from '../../game/dialogueQueue'
import type { ColliderList } from '../../world/colliders'
import type { EnemyHandle } from '../../combat/combatSystem'
import type { Hint } from '../../ui/hud'
import { buildUraArena, OrmHeart, SHADE_STYLE, UraEnvSwitch, type PersonCharacter, type UraArena } from '../../chronicle/visuals'
import type { SceneClock } from '../../chronicle/kit/clock'
import type { Walker } from '../../chronicle/kit/walker'
import type { Curtain } from '../../chronicle/kit/curtain'
import type { SlitHandle } from '../../chronicle/chrono'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type UraPhase = 'off' | 'enter' | 'escort' | 'strike' | 'caught' | 'escape' | 'done'

/** 扉が閉じるまでの秒数 */
export const URA_DOOR_SECONDS = 28

export type UraRunOpts = {
  chanda: PersonCharacter
  clock: SceneClock
  walker: Walker
  curtain: Curtain
  lines: (key: string) => DialogueLine[]
}

export class KhmerUra {
  readonly arena: UraArena
  phase: UraPhase = 'off'
  private heart: OrmHeart | null = null
  private env: UraEnvSwitch | null = null
  private door: SlitHandle | null = null
  private doorLeft = 0
  private legCut = false
  private skipped = false
  private readonly shades: EnemyHandle[] = []
  private timerEl: HTMLDivElement | null = null
  private chanda: PersonCharacter | null = null
  private readonly tmp = new THREE.Vector3()

  constructor(root: THREE.Object3D, colliders: ColliderList, origin: THREE.Vector3, quality: 'low' | 'medium' | 'high') {
    this.arena = buildUraArena(root, colliders, origin, { quality })
  }

  get active(): boolean {
    return this.phase !== 'off' && this.phase !== 'done'
  }

  /** 心臓（begin で作る：心臓は当たり判定を持たない） */
  begin(root: THREE.Object3D): void {
    if (this.heart) return
    this.heart = new OrmHeart(root, this.arena.heartAnchor, { veins: 5, anchors: this.arena.veinAnchors, size: 1 })
    this.heart.setPulse(1.1)
  }

  /** 心臓の前（チャンダが刃をつく所） */
  private strikePoint(): THREE.Vector3 {
    const c = this.arena.center
    const h = this.arena.heartAnchor
    return v(h.x, c.y, (c.z + h.z) / 2 + 1.5)
  }

  async run(rt: StageRuntime, o: UraRunOpts): Promise<'escaped'> {
    const { chanda, clock, walker, curtain, lines } = o
    this.chanda = chanda
    this.skipped = false
    this.legCut = false
    const A = this.arena
    // 1 入る
    this.phase = 'enter'
    rt.setControlLocked(true)
    await curtain.set(true, 0.7, '#fff6dc')
    this.env = new UraEnvSwitch({ scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    this.env.set(1)
    const face = Math.atan2(-(A.heartAnchor.x - A.entry.x), -(A.heartAnchor.z - A.entry.z))
    rt.claw.reset()
    rt.player.teleport(A.entry.clone(), face)
    rt.camRig.yaw = face
    rt.camRig.pitch = 0.22
    chanda.root.position.copy(A.entry).add(v(1.3, 0, -0.6))
    chanda.root.rotation.y = face
    chanda.setBlade('whole')
    chanda.setPose('guard')
    chanda.setRim('#9ab8ff', 0.8)
    this.door = rt.chrono.slit(A.doorAnchor, { tone: 'dawn', width: 3.2, height: 5.2, normal: v(Math.sin(face), 0, Math.cos(face)) })
    this.door.setOpen(1)
    rt.combat.enabled = true
    rt.combat.setCheckpoint(A.entry.clone(), face)
    await clock.wait(0.2)
    await curtain.set(false, 0.9, '#fff6dc')
    void rt.cinematic({ look: A.heartAnchor.clone(), from: A.entry.clone().add(v(-3, 3.2, 4)), inSec: 1.6, hold: Infinity, outSec: 1.2, fov: 50 })
    await rt.dialogue(lines('ura_enter'))
    rt.endCinematic()
    rt.setControlLocked(false)
    // 2 護衛
    this.phase = 'escort'
    const path = [A.platforms.find((p) => p.id === 'step1')?.center, A.platforms.find((p) => p.id === 'step2')?.center, A.platforms.find((p) => p.id === 'step3')?.center, A.center.clone(), this.strikePoint()].filter((p): p is THREE.Vector3 => !!p)
    this.spawnShade(rt, path[2] ?? A.center, 0)
    this.spawnShade(rt, A.center.clone().add(v(-3, 0, 1)), 0.6)
    let wave2 = false
    let pi = 0
    let walking = false
    while (pi < path.length && !this.skipped) {
      const near = this.shadeNear(chanda.root.position, 4.2)
      if (near && walking) {
        walker.stop(chanda)
        walking = false
        chanda.setPose('guard')
      }
      if (!near && !walking) {
        walking = true
        chanda.setPose('walk')
        const target = path[pi]
        void walker.walkTo(chanda, [target], 1.7).then(() => {
          if (walking && chanda.root.position.distanceTo(target) < 0.2) pi++
          walking = false
        })
      }
      if (!wave2 && pi >= 3) {
        wave2 = true
        this.spawnShade(rt, A.center.clone().add(v(3.2, 0, -2)), 0)
        this.spawnShade(rt, A.center.clone().add(v(-3.4, 0, -2.4)), 0.5)
        rt.say('チャンダ', 'アハハ！ まだいる！ はらって！', 2.4)
      }
      await clock.wait(0.15)
      if (clock.dead) return 'escaped'
    }
    walker.stop(chanda)
    this.clearShades(rt)
    // 3 刃が心臓をつく
    this.phase = 'strike'
    rt.setControlLocked(true)
    const sp = this.strikePoint()
    chanda.root.position.copy(sp)
    walker.face(chanda, A.heartAnchor)
    chanda.setPose('guard')
    void rt.cinematic({ look: A.heartAnchor.clone().add(v(0, -1, 0)), from: sp.clone().add(v(4.5, 2.2, 3.5)), inSec: 1.2, hold: Infinity, outSec: 1.0, fov: 48 })
    const lineP = rt.dialogue(lines('ura_strike'))
    await clock.wait(0.9)
    chanda.setPose('reach')
    rt.shake(0.4)
    const bladePos = chanda.root.position.clone().add(v(0, 1.0, 0)).addScaledVector(this.tmp.subVectors(A.heartAnchor, chanda.root.position).setY(0).normalize(), 0.7)
    this.heart?.absorb(bladePos, 2.2, 0)
    this.heart?.setPulse(2.2)
    await clock.wait(2.0)
    chanda.setBlade('broken')
    chanda.setPose('sad')
    rt.shake(0.6)
    await lineP
    // 4 足に黒いもの
    this.phase = 'caught'
    const feet = chanda.root.position.clone().add(v(0, 0.25, 0))
    const vein = this.heart?.veins.find((x) => x.alive)
    vein?.reachTo(feet, 0.8)
    await clock.wait(0.8)
    await rt.dialogue(lines('ura_caught'))
    rt.endCinematic()
    rt.setControlLocked(false)
    rt.chrono.add({
      id: 'khmer_ura_leg',
      kind: 'ura',
      label: 'チャンダの足の黒いもの',
      point: feet,
      radius: 0.8,
      enabled: true,
      noLineOfSight: true,
      range: 12,
      onAct: () => {
        this.legCut = true
        vein?.cut()
      },
    })
    await clock.until(() => this.legCut || this.skipped)
    rt.chrono.remove('khmer_ura_leg')
    if (!this.legCut) vein?.cut()
    // 5 扉が閉じる前に帰る
    rt.setControlLocked(true)
    chanda.setPose('idle')
    walker.face(chanda, rt.player.position)
    await rt.dialogue(lines('ura_save'))
    rt.setControlLocked(false)
    this.phase = 'escape'
    for (;;) {
      this.doorLeft = URA_DOOR_SECONDS
      this.showTimer(true)
      // 帰り道の影
      this.spawnShade(rt, path[2] ?? A.entry, 0.3)
      this.spawnShade(rt, path[1] ?? A.entry, 0.8)
      chanda.setPose('walk')
      void walker.walkTo(chanda, [...path.slice(0, -1).reverse(), A.entry.clone().add(v(0.8, 0, 0.4))], 2.4)
      const ok = await clock.until(() => this.skipped || this.atDoor(rt), URA_DOOR_SECONDS + 0.5)
      if (clock.dead) return 'escaped'
      if (ok) break
      // まにあわなかった：心臓の前からもう一度（光は減らない）
      this.clearShades(rt)
      await curtain.set(true, 0.5)
      rt.claw.reset()
      rt.player.teleport(sp.clone().add(v(0, 0, 2.2)), face)
      chanda.root.position.copy(sp)
      await curtain.set(false, 0.5)
      await rt.dialogue(lines('ura_retry'))
    }
    this.showTimer(false)
    this.clearShades(rt)
    // 出る（白くとぶ）。外へのテレポートと環境はステージがもどす
    this.phase = 'done'
    await curtain.set(true, 0.6, '#fff6dc')
    this.door?.close()
    this.door = null
    this.env?.set(0)
    this.env = null
    this.heart?.setPulse(0.6)
    chanda.setRim('#000000', 0)
    rt.combat.enabled = false
    return 'escaped'
  }

  private atDoor(rt: StageRuntime): boolean {
    const d = this.arena.doorAnchor
    const p = rt.player.position
    return Math.hypot(p.x - d.x, p.z - d.z) < 2.6 && Math.abs(p.y - (d.y - 2.2)) < 2.5
  }

  private spawnShade(rt: StageRuntime, at: THREE.Vector3, delay: number): void {
    const h = rt.combat.spawn('mite', at.clone(), { tag: 'ura', style: SHADE_STYLE, leash: 14, hidden: true })
    this.shades.push(h)
    const show = () => rt.combat.appear(h)
    if (delay <= 0) show()
    else setTimeout(show, delay * 1000)
  }

  private shadeNear(p: THREE.Vector3, r: number): boolean {
    for (const h of this.shades) if (h.alive && h.pos.distanceTo(p) < r) return true
    return false
  }

  private clearShades(rt: StageRuntime): void {
    for (const h of this.shades) if (h.alive) rt.combat.kill(h)
    this.shades.length = 0
  }

  private showTimer(on: boolean): void {
    if (on && !this.timerEl) {
      const el = document.createElement('div')
      el.style.cssText =
        'position:fixed;left:50%;top:13%;transform:translateX(-50%);font:800 22px "M PLUS Rounded 1c",system-ui,sans-serif;color:#fff4d0;background:rgba(60,30,10,0.55);padding:6px 18px;border-radius:14px;border:2px solid rgba(255,214,120,0.8);pointer-events:none;z-index:5;text-shadow:0 0 8px #ffb040;'
      document.body.appendChild(el)
      this.timerEl = el
    }
    if (!on && this.timerEl) {
      this.timerEl.remove()
      this.timerEl = null
    }
  }

  /** 毎フレーム（ステージの update から） */
  update(dt: number, rt: StageRuntime): void {
    if (this.phase === 'escape') {
      this.doorLeft = Math.max(0, this.doorLeft - dt)
      if (this.timerEl) this.timerEl.textContent = `光の扉が閉じるまで　${Math.ceil(this.doorLeft)}`
      this.door?.setOpen(Math.max(0.25, this.doorLeft / URA_DOOR_SECONDS))
    }
    // 落ちたら近い足場へ
    if (this.active && this.arena.isFallen(rt.player.position)) {
      rt.claw.reset()
      rt.player.teleport(this.arena.nearestTop(rt.player.position).clone().add(v(0, 0.2, 0)))
      rt.combat.health.damage?.(1)
    }
  }

  animate(dt: number, t: number): void {
    this.arena.update(dt, t)
    this.heart?.update(dt, t)
  }

  objective(): { title: string; sub: string } | null {
    switch (this.phase) {
      case 'escort':
        return { title: 'チャンダを心臓まで守る', sub: '影を K でたたき、J で引きよせる' }
      case 'caught':
        return { title: 'チャンダを助ける', sub: 'J で、足の黒いものを裂く' }
      case 'escape':
        return { title: '扉が閉じる前に帰る', sub: 'うしろの光の扉へ走る' }
      default:
        return null
    }
  }

  hints(): Hint[] | null {
    if (this.phase === 'escape') return [{ key: 'Shift', label: 'ダッシュ' }]
    return null
  }

  markers(out: ObjectiveMark[]): void {
    if (this.phase === 'escort' && this.chanda) out.push({ pos: this.chanda.root.position.clone().setY(this.chanda.root.position.y + 1.8), label: 'チャンダ' })
    if (this.phase === 'caught' && this.chanda) out.push({ pos: this.chanda.root.position.clone().setY(this.chanda.root.position.y + 0.6), label: '黒いもの' })
    if (this.phase === 'escape') out.push({ pos: this.arena.doorAnchor.clone(), label: '光の扉' })
  }

  /** 開発用：いまの段を片づける */
  devSkip(): void {
    this.skipped = true
    this.legCut = true
  }

  dispose(): void {
    this.showTimer(false)
    this.env?.set(0)
    this.heart?.dispose()
    this.arena.dispose()
  }
}
