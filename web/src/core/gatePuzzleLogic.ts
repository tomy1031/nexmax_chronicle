// 1726年・からくり水門の協力パズル（仕様 §6.3 / P3 GatePrototype）。
// プレイヤーが大歯車を保持 → 源兵衛が歯止めを調整 → おはるが人（舟）の通過を見張る
// → 合図で離すと水門が安全に閉じる。
// 「操作しなければ進まないが、仲間がいないと成功しない」をロジックで表す。

export const GatePhase = {
  WAIT_GRAB: "WAIT_GRAB",
  ADJUSTING: "ADJUSTING",
  WAIT_SIGNAL: "WAIT_SIGNAL",
  DONE: "DONE",
} as const;
export type GatePhase = (typeof GatePhase)[keyof typeof GatePhase];

/** release() の結果 */
export const GateResult = {
  NONE: "NONE",
  TOO_EARLY: "TOO_EARLY",
  PERSON_IN_DANGER: "PERSON_IN_DANGER",
  SUCCESS: "SUCCESS",
} as const;
export type GateResult = (typeof GateResult)[keyof typeof GateResult];

export const ADJUST_TIME = 6.0; // 源兵衛が歯止めを調整する時間（保持が必要）
export const EARLY_KEEP = 0.5; // 早く離した時に残る調整の割合
export const BOAT_SPEED = 2.4; // 舟の速さ (m/s)。上流(+x)から下流(-x)へ
export const BOAT_SPAWN_X = 32.0; // 上流の屋根付き水路の奥（プレイヤーからは死角）
export const BOAT_DESPAWN_X = -42.0;
export const DANGER_MIN_X = 5.0; // この範囲に舟がいる間は堰板を下ろせない
export const DANGER_MAX_X = 24.0;
export const BOAT_PERIOD = 16.0; // 舟が来る間隔
export const FIRST_SIGNAL_BOAT_X = 21.0; // 調整完了の瞬間に必ず1艘いる（「待って」を学ぶため）
/** 最初の舟が出るまでの猶予（秒）。最初の grab 以降に減り始める。 */
export const FIRST_SPAWN_DELAY = 4.0;
/** 調整完了時に「合図の窓」として残っているとみなす、危険範囲の下端からの最小距離 (m) */
export const LINGER_MARGIN = 3.0;

export class GatePuzzleLogic {
  phase: GatePhase = GatePhase.WAIT_GRAB;
  progress = 0.0;
  holding = false;
  /** 各舟の x 座標 */
  boats: number[] = [];
  spawnTimer = FIRST_SPAWN_DELAY;

  grab(): void {
    this.holding = true;
    if (this.phase === GatePhase.WAIT_GRAB) {
      this.phase = GatePhase.ADJUSTING;
    }
  }

  /** 保持をやめた結果を返す。 */
  release(): GateResult {
    if (!this.holding) {
      return GateResult.NONE;
    }
    this.holding = false;
    switch (this.phase) {
      case GatePhase.ADJUSTING:
        this.progress *= EARLY_KEEP;
        this.phase = GatePhase.WAIT_GRAB;
        return GateResult.TOO_EARLY;
      case GatePhase.WAIT_SIGNAL:
        if (this.isDanger()) {
          return GateResult.PERSON_IN_DANGER;
        }
        this.phase = GatePhase.DONE;
        return GateResult.SUCCESS;
    }
    return GateResult.NONE;
  }

  /** 舟（人）が堰板の危険範囲にいるか。おはるはこれを見張って合図を出す。 */
  isDanger(): boolean {
    return this.boats.some((x) => x >= DANGER_MIN_X && x <= DANGER_MAX_X);
  }

  /** 調整が完了した瞬間に true を返す。 */
  tick(delta: number): boolean {
    let ratchetSet = false;
    // 先に舟を動かしてから完了を判定する（完了直後に「必ず1艘いる」を保証するため）
    if (this.phase !== GatePhase.DONE) {
      this.updateBoats(delta);
    }
    if (this.phase === GatePhase.ADJUSTING && this.holding) {
      this.progress = Math.min(1.0, this.progress + delta / ADJUST_TIME);
      if (this.progress >= 1.0) {
        this.phase = GatePhase.WAIT_SIGNAL;
        ratchetSet = true;
        this.ensureFirstSignalBoat();
      }
    }
    return ratchetSet;
  }

  private updateBoats(delta: number): void {
    // 描画側が boats 配列を参照し続けられるよう、新しい配列にせず同じ配列を書き換える
    let kept = 0;
    for (const x of this.boats) {
      const moved = x - BOAT_SPEED * delta;
      if (moved > BOAT_DESPAWN_X) {
        this.boats[kept++] = moved;
      }
    }
    this.boats.length = kept;
    if (this.phase === GatePhase.WAIT_GRAB && this.progress <= 0.0) {
      return; // 保持を始めるまでは舟を出さない
    }
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0.0) {
      this.boats.push(BOAT_SPAWN_X);
      this.spawnTimer = BOAT_PERIOD;
    }
  }

  private ensureFirstSignalBoat(): void {
    // 危険範囲の出口ぎりぎりの舟だけでは「待って」が一瞬で終わるので、しばらく残る舟を用意する
    const lingering = this.boats.some((x) => x >= DANGER_MIN_X + LINGER_MARGIN && x <= DANGER_MAX_X);
    if (!lingering) {
      this.boats.push(FIRST_SIGNAL_BOAT_X);
    }
    // 次の舟まで十分な間隔（合図の窓）を空ける
    this.spawnTimer = BOAT_PERIOD;
  }

  signalText(): string {
    switch (this.phase) {
      case GatePhase.WAIT_GRAB:
      case GatePhase.ADJUSTING:
        return "見張り中";
      case GatePhase.WAIT_SIGNAL:
        return this.isDanger() ? "待って！ 人がいる" : "今や！ 離して！";
      case GatePhase.DONE:
        return "安全確認よし";
    }
  }
}
