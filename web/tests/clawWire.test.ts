// ワイヤー式NMClawの状態遷移（対象の種類ごと）・決まった曲線・振り子（操作マニュアル v1.1 §1.1・§2.2・§8.3〜8.4）
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ClawEvent, ClawState, ClawStateMachine, MISS_TIME } from "../src/core/clawStateMachine";
import {
  CLAW_TUNING,
  Pendulum,
  SWING_TUNING,
  WireClaw,
  arcPosition,
  quadThrough,
  zipPosition,
  type ClawTargetDef,
  type ClawTargetType,
  type WireEvent,
} from "../src/player/clawLogic";
import { near } from "./helpers";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const def = (type: ClawTargetType, extra: Partial<ClawTargetDef> = {}): ClawTargetDef => ({
  id: type,
  type,
  label: type,
  point: v(0, 2, -5),
  radius: 0.3,
  enabled: true,
  ...extra,
});

/** 何秒か進めて、出たイベントを集める */
function run(w: WireClaw, seconds: number, step = 1 / 60): WireEvent[] {
  const out: WireEvent[] = [];
  for (let t = 0; t < seconds; t += step) out.push(...w.tick(step));
  return out;
}
const kinds = (evs: WireEvent[]) => evs.map((e) => e.kind);

describe("ClawStateMachine.fire（追加分：J で射出）", () => {
  it("対象ありで GRABBING → 届くと HOLD_STARTED", () => {
    const c = new ClawStateMachine();
    expect(c.fire(true, 0.2)).toBe(true);
    expect(c.state).toBe(ClawState.GRABBING);
    expect(c.tick(0.1, false)).toBe(ClawEvent.NONE);
    expect(c.tick(0.11, false)).toBe(ClawEvent.HOLD_STARTED);
    expect(c.isConnected()).toBe(true);
  });

  it("対象なしは空振り（RELEASING）で、戻ると IDLE", () => {
    const c = new ClawStateMachine();
    expect(c.fire(false)).toBe(true);
    expect(c.state).toBe(ClawState.RELEASING);
    near(c.timer, MISS_TIME, "空振りの時間");
    expect(c.tick(MISS_TIME + 0.01, false)).toBe(ClawEvent.RELEASE_FINISHED);
    expect(c.state).toBe(ClawState.IDLE);
  });

  it("接続中・伸びている途中は射出できない", () => {
    const c = new ClawStateMachine();
    c.fire(true, 0.1);
    expect(c.fire(true)).toBe(false);
    c.tick(0.2, false);
    expect(c.fire(true)).toBe(false);
  });
});

describe("WireClaw: 共通", () => {
  it("待機中に対象なしで J → 空振り → 短い戻りだけで待機に戻る", () => {
    const w = new WireClaw();
    expect(kinds(w.press(null, 0))).toEqual(["missed"]);
    expect(w.phase).toBe("miss");
    const evs = run(w, 0.5);
    expect(kinds(evs)).toEqual(["retracted"]);
    expect(w.phase).toBe("idle");
  });

  it("伸びている途中の J は無視（連打で壊れない）", () => {
    const w = new WireClaw();
    w.press(def("hold_mechanism"), 6);
    expect(w.phase).toBe("firing");
    expect(w.press(def("hold_mechanism"), 6)).toEqual([]);
    expect(w.phase).toBe("firing");
  });

  it("届くまでの時間は距離 ÷ ワイヤー速度", () => {
    const w = new WireClaw();
    w.press(def("hold_mechanism"), 6.8);
    near(w.duration, 6.8 / CLAW_TUNING.wireSpeed, "伸びる時間");
    expect(w.wireOut).toBeCloseTo(0, 5);
    w.tick(w.duration / 2);
    expect(w.wireOut).toBeGreaterThan(0.4);
    expect(w.wireOut).toBeLessThan(0.6);
  });

  it("reset で即座に待機へ", () => {
    const w = new WireClaw();
    w.press(def("swing_anchor"), 5);
    run(w, 0.5);
    w.reset();
    expect(w.phase).toBe("idle");
    expect(w.base.state).toBe(ClawState.IDLE);
  });
});

describe("WireClaw: pull_object（物がこちらへ）", () => {
  it("射出 → 接続 → 手元へ飛んでくる → 持つ → J で置く → 戻る", () => {
    const w = new WireClaw();
    const t = def("pull_object");
    expect(kinds(w.press(t, 5))).toEqual(["fired"]);
    let evs = run(w, 0.2);
    expect(kinds(evs)).toContain("connected");
    expect(w.phase).toBe("reeling");
    near(w.duration, Math.max(0.28, 5 / CLAW_TUNING.pullSpeed), "引き寄せ時間");
    evs = run(w, 0.6);
    expect(kinds(evs)).toContain("object_arrived");
    expect(w.phase).toBe("carrying");
    expect(w.isConnected()).toBe(true);
    expect(kinds(w.press(null, 0))).toEqual(["dropped"]);
    expect(w.phase).toBe("retracting");
    expect(kinds(run(w, 0.3))).toEqual(["retracted"]);
    expect(w.phase).toBe("idle");
  });

  it("持っている間は Space で離脱しない（ジャンプに使う）", () => {
    const w = new WireClaw();
    w.press(def("pull_object"), 2);
    run(w, 1);
    expect(w.phase).toBe("carrying");
    expect(w.jump().consumed).toBe(false);
    expect(w.phase).toBe("carrying");
  });
});

describe("WireClaw: pull_player（自分が向こうへ）", () => {
  it("接続 → 引き寄せ → 到着で自動的に外れる", () => {
    const w = new WireClaw();
    w.press(def("pull_player"), 6);
    run(w, 0.25);
    expect(w.phase).toBe("zipping");
    expect(w.isWireMoving()).toBe(true);
    const evs = run(w, 1.2);
    expect(kinds(evs)).toEqual(["arrived", "retracted"]);
    expect(w.phase).toBe("idle");
  });

  it("引き寄せ中の Space は勢いを残して離脱", () => {
    const w = new WireClaw();
    w.press(def("pull_player"), 6);
    run(w, 0.3);
    const r = w.jump();
    expect(r.consumed).toBe(true);
    expect(r.events).toEqual([{ kind: "detached", target: expect.objectContaining({ type: "pull_player" }), byJump: true }]);
    expect(w.phase).toBe("retracting");
  });
});

describe("WireClaw: swing_anchor（ぶら下がり）", () => {
  it("接続するとぶら下がり、Space で勢いを残して離脱", () => {
    const w = new WireClaw();
    w.press(def("swing_anchor"), 8);
    run(w, 0.4);
    expect(w.phase).toBe("swinging");
    run(w, 3);
    expect(w.phase).toBe("swinging");
    const r = w.jump();
    expect(r.consumed).toBe(true);
    expect(kinds(r.events)).toEqual(["detached"]);
  });

  it("ぶら下がり中の J でも離脱（byJump=false）", () => {
    const w = new WireClaw();
    w.press(def("swing_anchor"), 8);
    run(w, 0.4);
    expect(w.press(null, 0)).toEqual([{ kind: "detached", target: expect.objectContaining({ type: "swing_anchor" }), byJump: false }]);
  });
});

describe("WireClaw: hold_mechanism（その場で保持）", () => {
  it("接続すると保持し続け、もう一度 J で外す（長押し不要）", () => {
    const w = new WireClaw();
    w.press(def("hold_mechanism"), 4);
    run(w, 0.2);
    expect(w.phase).toBe("holding");
    run(w, 10);
    expect(w.phase).toBe("holding");
    expect(w.jump().consumed).toBe(false);
    expect(kinds(w.press(null, 0))).toEqual(["released"]);
    run(w, 0.5);
    expect(w.phase).toBe("idle");
  });
});

describe("決まった曲線", () => {
  it("quadThrough は始点・中間点（via）・終点を通る", () => {
    const a = v(0, 0, 0);
    const via = v(2, 5, 1);
    const b = v(4, 3, 2);
    expect(quadThrough(a, via, b, 0).distanceTo(a)).toBeLessThan(1e-9);
    expect(quadThrough(a, via, b, 0.5).distanceTo(via)).toBeLessThan(1e-9);
    expect(quadThrough(a, via, b, 1).distanceTo(b)).toBeLessThan(1e-9);
  });

  it("zipPosition は着地点で終わる（手すりを越える via を通る）", () => {
    const d = def("pull_player", { landing: v(6, 4, 7), via: v(6, 5.6, 6) });
    const start = v(3, 0, 5);
    expect(zipPosition(start, d, 0).distanceTo(start)).toBeLessThan(1e-9);
    expect(zipPosition(start, d, 1).distanceTo(v(6, 4, 7))).toBeLessThan(1e-9);
    // 途中は着地点より高い
    expect(zipPosition(start, d, 0.6).y).toBeGreaterThan(4);
  });

  it("arcPosition は山なりで、両端は from / to", () => {
    const a = v(0, 0, 0);
    const b = v(4, 0, 0);
    expect(arcPosition(a, b, 0, 1).distanceTo(a)).toBeLessThan(1e-9);
    expect(arcPosition(a, b, 1, 1).distanceTo(b)).toBeLessThan(1e-9);
    near(arcPosition(a, b, 0.5, 1).y, 1, "真ん中で lift の高さ");
  });
});

describe("振り子", () => {
  const anchor = v(0, 6, 0);

  it("遠くでつないでもワイヤーを巻き取ってロープの長さになる", () => {
    const p = new Pendulum(anchor, 4, v(0, 0.9, -7), v(0, 0, 0));
    for (let i = 0; i < 240; i++) p.step(1 / 60, v(0, 0, 0));
    expect(p.pos.distanceTo(anchor)).toBeLessThanOrEqual(4 + 1e-6);
    near(p.length, 4, "巻き取り後の長さ");
  });

  it("入力なしなら反対側まで振れて、振れ幅はあまり増えない", () => {
    const p = new Pendulum(anchor, 4, anchor.clone().add(v(0, -4 * Math.cos(0.8), -4 * Math.sin(0.8))), v(0, 0, 0));
    let maxZ = -Infinity;
    let maxAngle = 0;
    for (let i = 0; i < 180; i++) {
      p.step(1 / 60, v(0, 0, 0));
      maxZ = Math.max(maxZ, p.pos.z);
      maxAngle = Math.max(maxAngle, p.angle());
    }
    expect(maxZ).toBeGreaterThan(2);
    expect(maxAngle).toBeLessThan(0.85);
  });

  it("進む向きに入力すると振れ幅が大きくなる（揺らす）", () => {
    const run2 = (pump: boolean) => {
      const p = new Pendulum(anchor, 4, anchor.clone().add(v(0, -4 * Math.cos(0.5), -4 * Math.sin(0.5))), v(0, 0, 0));
      let maxAngle = 0;
      for (let i = 0; i < 300; i++) {
        const dir = pump ? v(0, 0, Math.sign(p.vel.z) || 1) : v(0, 0, 0);
        p.step(1 / 60, dir);
        maxAngle = Math.max(maxAngle, p.angle());
      }
      return maxAngle;
    };
    expect(run2(true)).toBeGreaterThan(run2(false) + 0.3);
  });

  it("振れ幅は上限（SWING_TUNING.maxAngle）を超えない", () => {
    const p = new Pendulum(anchor, 4, anchor.clone().add(v(0, -4, 0)), v(0, 0, 30));
    for (let i = 0; i < 120; i++) {
      p.step(1 / 60, v(0, 0, 1));
      expect(p.angle()).toBeLessThanOrEqual(SWING_TUNING.maxAngle + 1e-6);
    }
  });

  it("離脱の速度は勢いを残して上向きに少し足される", () => {
    const p = new Pendulum(anchor, 4, anchor.clone().add(v(0, -4, 0)), v(0, 0, 6));
    const r = p.releaseVelocity();
    expect(r.z).toBeGreaterThan(6);
    expect(r.y).toBeGreaterThan(2);
  });
});
