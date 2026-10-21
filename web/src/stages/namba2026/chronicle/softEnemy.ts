// 敵 1 体ごとの攻撃の数値を、子ども向けにゆるめる（共有の ENEMY_STATS はそのまま）。
// 遊びやすさの物差し：攻撃の構え（溜め）が見えてから当たるまで、ゲームの時間で 1.2 秒以上。
// 欠け重の溜めは 0.95 秒・欠け虫は 0.45 秒・欠け盾は 0.6 秒なので、ここでのばす。当たりも軽く（ハート 1 つ）
import type { EnemyHandle } from '../../../combat/combatSystem'
import type { EnemyStats } from '../../../combat/combatLogic'

/** この敵だけの数値を変える */
export function softenEnemy(h: EnemyHandle, o: Partial<EnemyStats>): void {
  const b = h.brain as unknown as { stats: EnemyStats }
  b.stats = { ...b.stats, ...o }
}

/** 子ども向けの溜め（秒）と当たり */
export const KID_WINDUP = 1.25
export const KID_DAMAGE = 1

/** 構えを 1.2 秒より長く・当たりをハート 1 つに */
export function kidEnemy<T extends EnemyHandle>(h: T): T {
  softenEnemy(h, { windup: Math.max(KID_WINDUP, h.brain.stats.windup), damage: Math.min(KID_DAMAGE, h.brain.stats.damage) })
  return h
}
