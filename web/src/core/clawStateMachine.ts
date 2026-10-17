// NMClaw の内部状態（仕様 §5.3）。
// IDLE → AIMING → GRABBING → HOLDING → RELEASING → IDLE
// 描画にも入力にも依存しない純粋なロジックなので、そのままユニットテストで検証できる。

export const ClawState = {
  IDLE: "IDLE",
  AIMING: "AIMING",
  GRABBING: "GRABBING",
  HOLDING: "HOLDING",
  RELEASING: "RELEASING",
} as const;
export type ClawState = (typeof ClawState)[keyof typeof ClawState];

/** tick が返す、状態遷移のお知らせ */
export const ClawEvent = {
  NONE: "NONE",
  HOLD_STARTED: "HOLD_STARTED",
  RELEASE_FINISHED: "RELEASE_FINISHED",
} as const;
export type ClawEvent = (typeof ClawEvent)[keyof typeof ClawEvent];

export const GRAB_TIME = 0.18;
export const RELEASE_TIME = 0.15;
/** 対象のない場所へ射出したときの「伸びて戻る」時間（操作マニュアル v1.1 §1.2：体力は減らない） */
export const MISS_TIME = 0.36;

export class ClawStateMachine {
  state: ClawState = ClawState.IDLE;
  timer = 0.0;

  /** 状態名（仕様の claw_state 表記）。状態の値そのものが名前なのでそのまま返す。 */
  static stateName(s: ClawState): string {
    return s;
  }

  beginAim(): boolean {
    if (this.state === ClawState.IDLE) {
      this.state = ClawState.AIMING;
      return true;
    }
    return false;
  }

  endAim(): boolean {
    if (this.state === ClawState.AIMING) {
      this.state = ClawState.IDLE;
      return true;
    }
    return false;
  }

  /** 構え中の左クリック。対象がなければ失敗（不発）。 */
  tryGrab(hasTarget: boolean): boolean {
    if (this.state === ClawState.AIMING && hasTarget) {
      this.state = ClawState.GRABBING;
      this.timer = GRAB_TIME;
      return true;
    }
    return false;
  }

  /**
   * 操作マニュアル v1.1 の射出（J を 1 回押す。構え・長押しは不要）。
   * 対象があれば GRABBING（ワイヤーが届くまで travelTime 秒）、無ければ空振りの戻り動作（RELEASING）。
   * 旧仕様の beginAim → tryGrab と同じ状態を通るので、tick / release はそのまま使える。
   */
  fire(hasTarget: boolean, travelTime: number = GRAB_TIME, missTime: number = MISS_TIME): boolean {
    if (this.state !== ClawState.IDLE && this.state !== ClawState.AIMING) {
      return false;
    }
    if (hasTarget) {
      this.state = ClawState.GRABBING;
      this.timer = travelTime;
    } else {
      this.state = ClawState.RELEASING;
      this.timer = missTime;
    }
    return true;
  }

  /** 対象につながっている（保持中）か */
  isConnected(): boolean {
    return this.state === ClawState.HOLDING;
  }

  /** 保持中の左クリック、または対象側からの強制解除。 */
  release(): boolean {
    if (this.state === ClawState.HOLDING || this.state === ClawState.GRABBING) {
      this.state = ClawState.RELEASING;
      this.timer = RELEASE_TIME;
      return true;
    }
    return false;
  }

  isBusy(): boolean {
    return (
      this.state === ClawState.GRABBING ||
      this.state === ClawState.HOLDING ||
      this.state === ClawState.RELEASING
    );
  }

  /** 毎フレーム呼ぶ。aimHeld は構えボタンを押し続けているか（解除完了後の戻り先を決める）。 */
  tick(delta: number, aimHeld: boolean): ClawEvent {
    switch (this.state) {
      case ClawState.GRABBING:
        this.timer -= delta;
        if (this.timer <= 0.0) {
          this.state = ClawState.HOLDING;
          return ClawEvent.HOLD_STARTED;
        }
        break;
      case ClawState.RELEASING:
        this.timer -= delta;
        if (this.timer <= 0.0) {
          this.state = aimHeld ? ClawState.AIMING : ClawState.IDLE;
          return ClawEvent.RELEASE_FINISHED;
        }
        break;
    }
    return ClawEvent.NONE;
  }

  reset(): void {
    this.state = ClawState.IDLE;
    this.timer = 0.0;
  }
}
