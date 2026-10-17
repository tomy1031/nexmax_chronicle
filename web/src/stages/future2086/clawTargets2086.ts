// 2086年 時代博覧祭の「つかむNMClaw」の対象（操作マニュアル §6 チュートリアル 2・3）。
// ・pull_object：部品箱の山の一番上に置いた「共鳴レンズ」のケース（ソラが届かない）→ 手元へ引き寄せる
// ・pull_player：西の空中回廊の縁の街灯の金具 → 回廊の上へ
// ・swing_anchor：通りの上のアーチから下がる吊り輪 → 途切れた北の回廊を振り子で渡る
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { ColliderList } from '../../world/colliders'
import type { ClawTargetDef } from '../../player/clawLogic'
import type { MovableInput } from '../../player/clawSystem'
import { F, HOOK, SWING } from './layout'
import { NEON, type FCtx } from './kit2086'

export type FutureClawWorld = {
  targets: ClawTargetDef[]
  movables: MovableInput[]
  /** 物語が参照する ID */
  ids: { lens: string; hook: string; swing: string }
}

export const CLAW_IDS = { lens: 'ido_lens', hook: 'walkway_hook', swing: 'arch_ring' } as const

export function buildClawTargets2086(c: FCtx): FutureClawWorld {
  const targets: ClawTargetDef[] = []
  const movables: MovableInput[] = []

  // ---------------------------------------------------------- pull_object：共鳴レンズのケース
  {
    const S = F.CRATE_STACK
    const home = new THREE.Vector3(S.x - 0.05, 1.9 + 0.85, S.z - 0.02)
    const half = new THREE.Vector3(0.3, 0.2, 0.26)
    const sub: FCtx = { ...c, b: new Batch(), col: new ColliderList() }
    // 白いケース＋紺の帯＋上に光るレンズ（底の中心が原点）
    sub.b.add(rbox(0.6, 0.32, 0.52, 0.05), c.fm.plastic, M(0, 0.16, 0), { tint: '#ffffff' })
    sub.b.add(rbox(0.62, 0.06, 0.54, 0.02), c.fm.navyGloss, M(0, 0.2, 0))
    sub.b.add(new THREE.CylinderGeometry(0.15, 0.17, 0.06, 24), c.fm.metal, M(0, 0.35, 0))
    sub.b.add(new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.fm.glow, M(0, 0.37, 0), { tint: NEON.cyan, cast: false })
    for (const s of [-1, 1]) sub.b.add(rbox(0.05, 0.05, 0.22, 0.01), c.fm.darkMetal, M(s * 0.31, 0.22, 0))
    const object = sub.b.build(CLAW_IDS.lens)
    object.position.copy(home)
    object.rotation.y = 0.25
    c.root.add(object)
    const def: ClawTargetDef = {
      id: CLAW_IDS.lens,
      type: 'pull_object',
      label: '共鳴レンズのケース',
      point: home.clone().add(new THREE.Vector3(0, half.y + 0.05, 0)),
      radius: 0.4,
      enabled: true,
    }
    targets.push(def)
    movables.push({ def, object, half, home: home.clone() })
  }

  // ---------------------------------------------------------- pull_player：回廊の縁の金具
  targets.push({
    id: CLAW_IDS.hook,
    type: 'pull_player',
    label: '回廊の金具',
    point: HOOK.point.clone(),
    radius: 0.24,
    enabled: true,
    facing: new THREE.Vector3(1, 0, 0),
    landing: HOOK.landing.clone(),
    via: HOOK.via.clone(),
  })

  // ---------------------------------------------------------- swing_anchor：アーチの吊り輪
  targets.push({
    id: CLAW_IDS.swing,
    type: 'swing_anchor',
    label: 'アーチの吊り輪',
    point: SWING.anchor.clone(),
    radius: 0.35,
    enabled: true,
    ropeLength: SWING.rope,
    checkpoints: SWING.checkpoints.map((p) => p.clone()),
  })

  return { targets, movables, ids: { ...CLAW_IDS } }
}
