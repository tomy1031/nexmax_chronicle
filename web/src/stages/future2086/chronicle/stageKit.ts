// 2086 年の本編（ChronicleFutureStage）で使う小さな部品：
// ・TimeBadge：右上の時計（夜 8時40分 → 41分の逃げきり。のこり時間の帯）
// ・SkyEvent：夜空が割れて黒い輪（オルム）が出る（emergence2086 の emergenceAt をそのまま使う。カメラは場面が決める）
// ・地面の高さ（NPC を床に立たせる）
import * as THREE from 'three'
import type { Physics } from '../../../player/physics'
import type { StageRuntime } from '../../../game/stage'
import type { OrumParts } from '../orum'
import type { SkyTear } from '../skyTear2086'
import { EMERGENCE_TIME, emergenceAt } from '../emergence2086'

export class TimeBadge {
  private readonly el: HTMLDivElement
  private readonly txt: HTMLDivElement
  private readonly bar: HTMLDivElement

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.style.cssText =
      'position:fixed;right:18px;top:96px;z-index:4;pointer-events:none;padding:8px 16px 10px;border-radius:16px;' +
      'background:rgba(20,10,46,0.82);border:2px solid rgba(255,120,200,0.75);box-shadow:0 0 18px rgba(255,80,180,0.4);' +
      "color:#fff;font-family:var(--ui-font,'M PLUS Rounded 1c',sans-serif);font-weight:800;text-align:center;opacity:0;transition:opacity 0.3s;"
    this.txt = document.createElement('div')
    this.txt.style.cssText = 'font-size:30px;letter-spacing:0.06em;font-variant-numeric:tabular-nums;'
    const track = document.createElement('div')
    track.style.cssText = 'height:6px;margin-top:6px;border-radius:3px;background:rgba(255,255,255,0.15);overflow:hidden;width:150px;'
    this.bar = document.createElement('div')
    this.bar.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#ff6fb8,#ffd36a);'
    track.appendChild(this.bar)
    this.el.append(this.txt, track)
    host.appendChild(this.el)
  }

  /** 表示（text：「8:40」など、left：のこりの割合 0..1） */
  set(text: string | null, left = 1): void {
    if (text === null) {
      this.el.style.opacity = '0'
      return
    }
    this.el.style.opacity = '1'
    this.txt.textContent = text
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, left)) * 100)}%`
  }

  dispose(): void {
    this.el.remove()
  }
}

/** 夜空が割れて、黒い輪が出る（約 11 秒）。done になったら終わり */
export class SkyEvent {
  private t = -1
  private readonly tear: SkyTear
  private readonly orum: OrumParts
  private shakes = 0
  /** 1 で通常、短くするときは 1.4 など */
  speed = 1

  constructor(tear: SkyTear, orum: OrumParts) {
    this.tear = tear
    this.orum = orum
  }

  start(speed = 1): void {
    this.t = 0
    this.speed = speed
    this.shakes = 0
    this.tear.reset()
    this.orum.setShow(0)
    this.orum.setTomorrow(1)
    this.orum.setDissolve(0)
  }

  get running(): boolean {
    return this.t >= 0 && this.t < EMERGENCE_TIME.release
  }

  get done(): boolean {
    return this.t >= EMERGENCE_TIME.release
  }

  /** すぐに割れきった空へ（途中から始めたとき） */
  finish(rt: StageRuntime): void {
    this.t = EMERGENCE_TIME.release
    this.tear.setFinal({ scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    this.orum.setShow(1)
    this.orum.setTomorrow(0.5)
    this.orum.setDissolve(0.3)
  }

  update(dt: number, rt: StageRuntime): void {
    if (this.t < 0) return
    this.tear.update(rt.camera)
    if (this.t >= EMERGENCE_TIME.release) return
    this.t += dt * this.speed
    const s = emergenceAt(this.t)
    this.tear.setCrack(s.crack)
    this.tear.setOpen(s.open)
    this.tear.setFlash(s.flash)
    if (s.sky > 0 && this.tear.invaded < 1) this.tear.setInvaded(s.sky, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    this.orum.setShow(s.show)
    this.orum.setTomorrow(Math.max(0.5, s.tomorrow))
    this.orum.setDissolve(s.dissolve)
    const marks = [...EMERGENCE_TIME.cracks, EMERGENCE_TIME.open]
    while (this.shakes < marks.length && this.t >= marks[this.shakes]) {
      rt.shake(this.shakes === marks.length - 1 ? 0.6 : 0.25)
      this.shakes++
    }
  }

  reset(): void {
    this.t = -1
    this.tear.reset()
  }
}

/** p の真下の床の高さ（見える当たり判定だけ。無ければ fallback） */
export function groundY(phys: Physics | null, p: THREE.Vector3, fallback = 0, from = 1.2): number {
  if (!phys) return fallback
  const o = new THREE.Vector3(p.x, p.y + from, p.z)
  const hit = phys.raycast(o, new THREE.Vector3(0, -1, 0), from + 3, undefined, true)
  return hit === null ? fallback : o.y - hit
}
