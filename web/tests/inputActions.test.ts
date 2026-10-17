// 入力 → ゲーム内操作（アクション）の対応と、方向キーのカメラ加速（操作マニュアル v1.1 §2・§8.1）
import { describe, expect, it } from "vitest";
import {
  BUTTON_ACTIONS,
  KEYBOARD_BINDINGS,
  controlsFor,
  DEFAULT_LOOK,
  createLookState,
  resolveActions,
  stepLook,
  type Binding,
  type RawInput,
} from "../src/player/inputActions";
import { near } from "./helpers";

const raw = (down: string[], pressed: string[] = []): RawInput => ({ down: new Set(down), pressed: new Set(pressed) });

describe("inputActions: キーボードの割り当て", () => {
  it("WASD は move（カメラ基準：y=前、x=右）", () => {
    expect(resolveActions(raw(["KeyW"])).move).toEqual({ x: 0, y: 1 });
    expect(resolveActions(raw(["KeyS"])).move).toEqual({ x: 0, y: -1 });
    expect(resolveActions(raw(["KeyA"])).move).toEqual({ x: -1, y: 0 });
    expect(resolveActions(raw(["KeyD"])).move).toEqual({ x: 1, y: 0 });
  });

  it("斜め入力でも move の長さは 1 を超えない", () => {
    const m = resolveActions(raw(["KeyW", "KeyD"])).move;
    near(Math.hypot(m.x, m.y), 1, "斜めの長さ");
    near(m.x, Math.SQRT1_2, "x");
    near(m.y, Math.SQRT1_2, "y");
  });

  it("逆方向の同時押しは打ち消し合う", () => {
    expect(resolveActions(raw(["KeyW", "KeyS"])).move).toEqual({ x: 0, y: 0 });
  });

  it("方向キーはカメラ（look）専用で、移動には使わない", () => {
    const f = resolveActions(raw(["ArrowUp", "ArrowLeft"]));
    expect(f.look).toEqual({ x: -1, y: 1 });
    expect(f.move).toEqual({ x: 0, y: 0 });
    expect(resolveActions(raw(["ArrowRight", "ArrowDown"])).look).toEqual({ x: 1, y: -1 });
  });

  it("各キーが仕様どおりのアクションになる", () => {
    const table: Array<[string, string]> = [
      ["Space", "jump"],
      ["ShiftLeft", "dash"],
      ["ShiftRight", "dash"],
      ["KeyF", "interact"],
      ["KeyJ", "claw_fire"],
      ["KeyK", "attack"],
      ["KeyR", "lock_switch"],
      ["KeyQ", "select_left"],
      ["KeyE", "select_right"],
      ["KeyG", "open_hub"],
      ["Tab", "menu"],
      ["Escape", "pause"],
    ];
    for (const [code, action] of table) {
      const f = resolveActions(raw([code], [code]));
      expect(f.pressed.has(action as never), `${code} → ${action}`).toBe(true);
      expect(f.held.has(action as never), `${code} は held にも入る`).toBe(true);
    }
  });

  it("押しっぱなしは held だけで、pressed は押した瞬間だけ", () => {
    const f = resolveActions(raw(["KeyJ", "ShiftLeft"]));
    expect(f.held.has("claw_fire")).toBe(true);
    expect(f.pressed.has("claw_fire")).toBe(false);
    expect(f.held.has("dash")).toBe(true);
  });

  it("すべてのボタンアクションにキーが割り当てられている", () => {
    for (const a of BUTTON_ACTIONS) {
      expect(controlsFor(a).length, `${a} の割り当て`).toBeGreaterThan(0);
    }
    expect(controlsFor("move")).toEqual(["KeyW", "KeyS", "KeyD", "KeyA"]);
  });

  it("マウスの入力は割り当てに含まれない", () => {
    for (const b of KEYBOARD_BINDINGS) {
      expect(b.control.toLowerCase()).not.toMatch(/mouse|click|button/);
    }
  });

  it("割り当てを足すだけで別の入力機器（ゲームコントローラー）を使える", () => {
    const pad: Binding[] = [
      ...KEYBOARD_BINDINGS,
      { action: "jump", control: "pad:0" },
      { action: "claw_fire", control: "pad:5" },
      { action: "move", control: "pad:axis0", axis: "x", scale: 1 },
      { action: "move", control: "pad:axis1", axis: "y", scale: -1 },
    ];
    const f = resolveActions(
      { down: new Set(["pad:5"]), pressed: new Set(["pad:0"]), analog: new Map([["pad:axis0", 0.5], ["pad:axis1", -0.5]]) },
      pad,
    );
    expect(f.pressed.has("jump")).toBe(true);
    expect(f.held.has("claw_fire")).toBe(true);
    near(f.move.x, 0.5, "スティックの x");
    near(f.move.y, 0.5, "スティックの y（上が負）");
  });
});

describe("inputActions: 方向キーのカメラ（なめらか・加速）", () => {
  it("押し始めはゆっくり、押し続けると最大速度に近づく", () => {
    const s = createLookState();
    const first = stepLook(s, { x: 1, y: 0 }, 1 / 60).dYaw;
    let last = first;
    for (let i = 0; i < 90; i++) last = stepLook(s, { x: 1, y: 0 }, 1 / 60).dYaw;
    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(first * 3);
    near(last * 60, DEFAULT_LOOK.yawSpeed, "1.5 秒後はほぼ最大の角速度", 0.05);
  });

  it("離すとすぐ止まる", () => {
    const s = createLookState();
    for (let i = 0; i < 60; i++) stepLook(s, { x: 0, y: 1 }, 1 / 60);
    let d = 1;
    for (let i = 0; i < 30; i++) d = stepLook(s, { x: 0, y: 0 }, 1 / 60).dPitch;
    expect(Math.abs(d)).toBeLessThan(1e-4);
    expect(s.holdTime).toBe(0);
  });

  it("上キーで pitch が正（上を見る）、左キーで yaw が負", () => {
    const s = createLookState();
    const r = stepLook(s, { x: -1, y: 1 }, 0.1);
    expect(r.dPitch).toBeGreaterThan(0);
    expect(r.dYaw).toBeLessThan(0);
  });
});
