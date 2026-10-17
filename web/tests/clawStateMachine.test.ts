// ClawStateMachine のユニットテスト（Godot 版 tests/run_tests.gd の claw: 14件を移植）
import { describe, expect, it } from "vitest";
import {
  ClawEvent,
  ClawState,
  ClawStateMachine,
  GRAB_TIME,
  RELEASE_TIME,
} from "../src/core/clawStateMachine";
import { near } from "./helpers";

/** 構え→つかみ→HOLDING まで進めた状態機械を返す。 */
function clawInHolding(): ClawStateMachine {
  const sm = new ClawStateMachine();
  sm.beginAim();
  sm.tryGrab(true);
  sm.tick(GRAB_TIME + 0.01, true);
  return sm;
}

describe("ClawStateMachine", () => {
  it("claw: 初期状態は IDLE / タイマー0 / busyでない", () => {
    const sm = new ClawStateMachine();
    expect(sm.state, "初期状態は IDLE").toBe(ClawState.IDLE);
    near(sm.timer, 0.0, "タイマーは0");
    expect(sm.isBusy(), "初期状態は busy でない").toBe(false);
  });

  it("claw: stateName が全状態の名前を返す", () => {
    expect(ClawStateMachine.stateName(ClawState.IDLE)).toBe("IDLE");
    expect(ClawStateMachine.stateName(ClawState.AIMING)).toBe("AIMING");
    expect(ClawStateMachine.stateName(ClawState.GRABBING)).toBe("GRABBING");
    expect(ClawStateMachine.stateName(ClawState.HOLDING)).toBe("HOLDING");
    expect(ClawStateMachine.stateName(ClawState.RELEASING)).toBe("RELEASING");
  });

  it("claw: beginAim は IDLE からのみ AIMING にできる", () => {
    let sm = new ClawStateMachine();
    expect(sm.beginAim(), "IDLE から beginAim は成功").toBe(true);
    expect(sm.state, "beginAim 後は AIMING").toBe(ClawState.AIMING);
    expect(sm.beginAim(), "AIMING 中の beginAim は失敗").toBe(false);
    // 他の状態からは構えられない
    sm = new ClawStateMachine();
    sm.beginAim();
    sm.tryGrab(true);
    expect(sm.state, "前提: GRABBING").toBe(ClawState.GRABBING);
    expect(sm.beginAim(), "GRABBING 中の beginAim は失敗").toBe(false);
    expect(sm.state, "GRABBING のまま").toBe(ClawState.GRABBING);
    sm = clawInHolding();
    expect(sm.beginAim(), "HOLDING 中の beginAim は失敗").toBe(false);
    expect(sm.state, "HOLDING のまま").toBe(ClawState.HOLDING);
    sm.release();
    expect(sm.beginAim(), "RELEASING 中の beginAim は失敗").toBe(false);
    expect(sm.state, "RELEASING のまま").toBe(ClawState.RELEASING);
  });

  it("claw: endAim は AIMING からのみ IDLE に戻れる", () => {
    let sm = new ClawStateMachine();
    expect(sm.endAim(), "IDLE での endAim は失敗").toBe(false);
    expect(sm.state, "IDLE のまま").toBe(ClawState.IDLE);
    sm.beginAim();
    expect(sm.endAim(), "AIMING からの endAim は成功").toBe(true);
    expect(sm.state, "IDLE に戻る").toBe(ClawState.IDLE);
    // つかみ中・保持中は構えをやめても状態を変えない
    sm = new ClawStateMachine();
    sm.beginAim();
    sm.tryGrab(true);
    expect(sm.endAim(), "GRABBING 中の endAim は失敗").toBe(false);
    expect(sm.state, "GRABBING のまま").toBe(ClawState.GRABBING);
    sm = clawInHolding();
    expect(sm.endAim(), "HOLDING 中の endAim は失敗").toBe(false);
    expect(sm.state, "HOLDING のまま").toBe(ClawState.HOLDING);
    sm.release();
    expect(sm.endAim(), "RELEASING 中の endAim は失敗").toBe(false);
    expect(sm.state, "RELEASING のまま").toBe(ClawState.RELEASING);
  });

  it("claw: 対象なしの tryGrab は失敗して AIMING のまま", () => {
    const sm = new ClawStateMachine();
    sm.beginAim();
    expect(sm.tryGrab(false), "対象なしの tryGrab は失敗").toBe(false);
    expect(sm.state, "失敗しても AIMING のまま").toBe(ClawState.AIMING);
    expect(sm.isBusy(), "失敗後は busy でない").toBe(false);
    // 失敗しても構えは続けられ、対象が見つかればすぐつかめる
    expect(sm.tryGrab(true), "その後、対象ありなら成功").toBe(true);
    expect(sm.state, "GRABBING へ").toBe(ClawState.GRABBING);
  });

  it("claw: tryGrab は AIMING 中かつ対象ありのときだけ成功", () => {
    let sm = new ClawStateMachine();
    expect(sm.tryGrab(true), "構えていない（IDLE）ときは対象があっても失敗").toBe(false);
    expect(sm.state, "IDLE のまま").toBe(ClawState.IDLE);
    sm.beginAim();
    expect(sm.tryGrab(true), "AIMING + 対象ありで成功").toBe(true);
    expect(sm.state, "GRABBING").toBe(ClawState.GRABBING);
    near(sm.timer, GRAB_TIME, "タイマーは GRAB_TIME");
    expect(sm.tryGrab(true), "GRABBING 中の再 tryGrab は失敗").toBe(false);
    sm = clawInHolding();
    expect(sm.tryGrab(true), "HOLDING 中の tryGrab は失敗").toBe(false);
    expect(sm.state, "HOLDING のまま").toBe(ClawState.HOLDING);
  });

  it("claw: GRABBING は GRAB_TIME 経過で HOLDING になり HOLD_STARTED を1回返す", () => {
    let sm = new ClawStateMachine();
    sm.beginAim();
    sm.tryGrab(true);
    // GRAB_TIME(0.18) に満たない tick では GRABBING のまま
    expect(sm.tick(0.1, true), "0.1s では NONE").toBe(ClawEvent.NONE);
    expect(sm.state, "0.1s では GRABBING").toBe(ClawState.GRABBING);
    // 累計で GRAB_TIME を超えたら HOLDING
    expect(sm.tick(0.1, true), "累計0.2sで HOLD_STARTED").toBe(ClawEvent.HOLD_STARTED);
    expect(sm.state, "HOLDING になる").toBe(ClawState.HOLDING);
    // イベントは1回だけ
    expect(sm.tick(0.1, true), "2回目の tick は NONE").toBe(ClawEvent.NONE);
    // 1フレームで大きく進んでも HOLDING になる
    sm = new ClawStateMachine();
    sm.beginAim();
    sm.tryGrab(true);
    expect(sm.tick(1.0, true), "大きな delta でも HOLD_STARTED").toBe(ClawEvent.HOLD_STARTED);
    expect(sm.state, "HOLDING").toBe(ClawState.HOLDING);
    // 構えを離していても（aimHeld=false）GRABBING は進行して HOLDING になる
    sm = new ClawStateMachine();
    sm.beginAim();
    sm.tryGrab(true);
    expect(sm.tick(1.0, false), "aimHeld=false でも HOLD_STARTED").toBe(ClawEvent.HOLD_STARTED);
    expect(sm.state, "HOLDING").toBe(ClawState.HOLDING);
  });

  it("claw: HOLDING は構えを離しても時間が経っても維持される", () => {
    const sm = clawInHolding();
    expect(sm.state, "前提: HOLDING").toBe(ClawState.HOLDING);
    for (let i = 0; i < 30; i++) {
      expect(sm.tick(1.0, false), "保持中の tick は NONE").toBe(ClawEvent.NONE);
    }
    expect(sm.state, "構えを離して長時間経っても HOLDING（再クリックで離すまで維持）").toBe(ClawState.HOLDING);
    expect(sm.isBusy(), "保持中は busy").toBe(true);
  });

  it("claw: release は HOLDING / GRABBING からのみ RELEASING にできる", () => {
    let sm = new ClawStateMachine();
    expect(sm.release(), "IDLE での release は失敗").toBe(false);
    expect(sm.state, "IDLE のまま").toBe(ClawState.IDLE);
    sm.beginAim();
    expect(sm.release(), "AIMING での release は失敗").toBe(false);
    expect(sm.state, "AIMING のまま").toBe(ClawState.AIMING);
    // GRABBING からの強制解除は可能
    sm.tryGrab(true);
    expect(sm.release(), "GRABBING からの release は成功").toBe(true);
    expect(sm.state, "RELEASING").toBe(ClawState.RELEASING);
    near(sm.timer, RELEASE_TIME, "タイマーは RELEASE_TIME");
    expect(sm.release(), "RELEASING 中の release は失敗").toBe(false);
    // HOLDING からの release
    sm = clawInHolding();
    expect(sm.release(), "HOLDING からの release は成功").toBe(true);
    expect(sm.state, "RELEASING").toBe(ClawState.RELEASING);
    near(sm.timer, RELEASE_TIME, "タイマーは RELEASE_TIME");
  });

  it("claw: RELEASING 完了時 aimHeld で AIMING / IDLE に分かれ RELEASE_FINISHED", () => {
    // 構えを続けている → AIMING に戻る
    let sm = clawInHolding();
    sm.release();
    expect(sm.tick(0.05, true), "RELEASE_TIME 未満では NONE").toBe(ClawEvent.NONE);
    expect(sm.state, "RELEASING のまま").toBe(ClawState.RELEASING);
    expect(sm.tick(0.2, true), "RELEASE_FINISHED").toBe(ClawEvent.RELEASE_FINISHED);
    expect(sm.state, "aimHeld=true なら AIMING").toBe(ClawState.AIMING);
    // 構えを離している → IDLE に戻る
    sm = clawInHolding();
    sm.release();
    expect(sm.tick(0.3, false), "RELEASE_FINISHED").toBe(ClawEvent.RELEASE_FINISHED);
    expect(sm.state, "aimHeld=false なら IDLE").toBe(ClawState.IDLE);
    // 2回目の tick ではイベントが出ない
    expect(sm.tick(0.3, false), "完了後は NONE").toBe(ClawEvent.NONE);
  });

  it("claw: 1周 IDLE→AIMING→GRABBING→HOLDING→RELEASING→IDLE", () => {
    const sm = new ClawStateMachine();
    expect(sm.state, "IDLE").toBe(ClawState.IDLE);
    expect(sm.beginAim(), "構える").toBe(true);
    expect(sm.state, "AIMING").toBe(ClawState.AIMING);
    expect(sm.tryGrab(true), "つかむ").toBe(true);
    expect(sm.state, "GRABBING").toBe(ClawState.GRABBING);
    expect(sm.tick(GRAB_TIME, true), "保持開始").toBe(ClawEvent.HOLD_STARTED);
    expect(sm.state, "HOLDING").toBe(ClawState.HOLDING);
    expect(sm.release(), "離す").toBe(true);
    expect(sm.state, "RELEASING").toBe(ClawState.RELEASING);
    expect(sm.tick(RELEASE_TIME, false), "解除完了").toBe(ClawEvent.RELEASE_FINISHED);
    expect(sm.state, "IDLE に戻る").toBe(ClawState.IDLE);
    // もう一周できる（失敗後すぐ再挑戦可能）
    expect(sm.beginAim(), "2周目も構えられる").toBe(true);
    expect(sm.tryGrab(true), "2周目もつかめる").toBe(true);
  });

  it("claw: tick は IDLE / AIMING では何も起こさない", () => {
    const sm = new ClawStateMachine();
    expect(sm.tick(10.0, false), "IDLE の tick は NONE").toBe(ClawEvent.NONE);
    expect(sm.state, "IDLE のまま").toBe(ClawState.IDLE);
    sm.beginAim();
    expect(sm.tick(10.0, true), "AIMING の tick は NONE").toBe(ClawEvent.NONE);
    expect(sm.state, "AIMING のまま").toBe(ClawState.AIMING);
  });

  it("claw: isBusy は GRABBING / HOLDING / RELEASING のとき true", () => {
    const sm = new ClawStateMachine();
    expect(sm.isBusy(), "IDLE は busy でない").toBe(false);
    sm.beginAim();
    expect(sm.isBusy(), "AIMING は busy でない").toBe(false);
    sm.tryGrab(true);
    expect(sm.isBusy(), "GRABBING は busy").toBe(true);
    sm.tick(1.0, true);
    expect(sm.isBusy(), "HOLDING は busy").toBe(true);
    sm.release();
    expect(sm.isBusy(), "RELEASING は busy").toBe(true);
    sm.tick(1.0, false);
    expect(sm.isBusy(), "IDLE に戻れば busy でない").toBe(false);
  });

  it("claw: reset で IDLE / タイマー0 に戻る", () => {
    const sm = clawInHolding();
    sm.reset();
    expect(sm.state, "reset で IDLE").toBe(ClawState.IDLE);
    near(sm.timer, 0.0, "reset でタイマー0");
    expect(sm.beginAim(), "reset 後は構えられる").toBe(true);
  });
});
