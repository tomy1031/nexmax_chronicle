// スマホのタッチ操作：出すかどうかの判定・スティック・タッチの割り当て・キー案内の読み替え
import { describe, expect, it } from "vitest";
import { KEYBOARD_BINDINGS, TOUCH_BINDINGS, resolveActions, type ButtonAction } from "../src/player/inputActions";
import { TOUCH_TUNING, shouldUseTouch, stickVector, toTouchText, touchHintView } from "../src/player/touchLogic";
import { near } from "./helpers";

const PHONE = { param: null, coarse: true, hoverNone: true, touchPoints: 5 };
const PC = { param: null, coarse: false, hoverNone: false, touchPoints: 0 };

describe("touchLogic: タッチ操作を出すかどうか", () => {
  it("スマホ（主な入力が指・ホバーできない）だけ出す", () => {
    expect(shouldUseTouch(PHONE)).toBe(true);
    expect(shouldUseTouch(PC)).toBe(false);
  });

  it("タッチ画面つきの PC（主な入力がマウス）では出さない", () => {
    expect(shouldUseTouch({ ...PC, touchPoints: 10 })).toBe(false);
  });

  it("?touch=1 で強制的に出し、?touch=0 で強制的に消す", () => {
    expect(shouldUseTouch({ ...PC, param: "1" })).toBe(true);
    expect(shouldUseTouch({ ...PHONE, param: "0" })).toBe(false);
  });
});

describe("touchLogic: スティック", () => {
  const R = TOUCH_TUNING.stickRadius;

  it("中心付近の遊びの中では動かない", () => {
    const s = stickVector(R * TOUCH_TUNING.deadzone * 0.9, 0);
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.dash).toBe(false);
  });

  it("上へ倒すと前（y=+1）、右へ倒すと右（x=+1）", () => {
    const up = stickVector(0, -R);
    near(up.move.y, 1, "前");
    near(up.move.x, 0, "横");
    const right = stickVector(R, 0);
    near(right.move.x, 1, "右");
    near(right.move.y, 0, "縦");
  });

  it("半分だけ倒すと遅く歩ける（アナログ）", () => {
    const s = stickVector(0, -R * 0.55);
    expect(s.move.y).toBeGreaterThan(0.3);
    expect(s.move.y).toBeLessThan(0.7);
  });

  it("円の外へ出しても長さは 1 まで・ノブは円の中に収まる", () => {
    const s = stickVector(R * 3, R * 3);
    near(Math.hypot(s.move.x, s.move.y), 1, "長さ");
    near(Math.hypot(s.knobX, s.knobY), R, "ノブ");
  });

  it("大きく倒したときだけダッシュ", () => {
    expect(stickVector(0, -R).dash).toBe(false);
    expect(stickVector(0, -R * (TOUCH_TUNING.dashAt - 0.05)).dash).toBe(false);
    expect(stickVector(0, -R * (TOUCH_TUNING.dashAt + 0.05)).dash).toBe(true);
  });
});

describe("inputActions: タッチの割り当て", () => {
  const bindings = [...KEYBOARD_BINDINGS, ...TOUCH_BINDINGS];

  it("スティックの値がそのまま move になる", () => {
    const f = resolveActions({ down: new Set(), pressed: new Set(), analog: new Map([["touch:moveX", 0.3], ["touch:moveY", 0.6]]) }, bindings);
    near(f.move.x, 0.3, "x");
    near(f.move.y, 0.6, "y");
  });

  it("各ボタンが仕様どおりのアクションになる", () => {
    const table: Array<[string, ButtonAction]> = [
      ["touch:jump", "jump"],
      ["touch:dash", "dash"],
      ["touch:claw", "claw_fire"],
      ["touch:interact", "interact"],
      ["touch:lock", "lock_switch"],
      ["touch:armL", "select_left"],
      ["touch:menu", "menu"],
      ["touch:pause", "pause"],
    ];
    for (const [control, action] of table) {
      const f = resolveActions({ down: new Set([control]), pressed: new Set([control]) }, bindings);
      expect(f.pressed.has(action), `${control} → ${action}`).toBe(true);
    }
  });

  it("タッチとつないだキーボードを同時に使える", () => {
    const f = resolveActions({ down: new Set(["KeyW", "touch:dash"]), pressed: new Set(["Space"]) }, bindings);
    expect(f.move).toEqual({ x: 0, y: 1 });
    expect(f.held.has("dash")).toBe(true);
    expect(f.pressed.has("jump")).toBe(true);
  });

  it("PC の割り当て（キーボードだけ）ではタッチの control を無視する", () => {
    const f = resolveActions({ down: new Set(["touch:claw"]), pressed: new Set(["touch:claw"]), analog: new Map([["touch:moveY", 1]]) });
    expect(f.pressed.size).toBe(0);
    expect(f.move).toEqual({ x: 0, y: 0 });
  });
});

describe("touchLogic: キー案内 → タッチ", () => {
  const none = { canInteract: false, canSwitch: false };
  const START = [
    { key: "WASD", label: "移動" },
    { key: "↑↓←→", label: "カメラ" },
    { key: "Space", label: "ジャンプ" },
    { key: "Shift", label: "ダッシュ" },
    { key: "J", label: "つかむ" },
    { key: "Esc", label: "操作一覧" },
  ];

  it("開始時の案内はキー名を使わず、指の動きで言う", () => {
    const v = touchHintView(START, none);
    expect(v.hud).toEqual([
      { key: "スティック", label: "移動" },
      { key: "右側をなぞる", label: "カメラ" },
      { key: "大きく倒す", label: "ダッシュ" },
    ]);
    for (const h of v.hud) expect(h.key).not.toMatch(/^(WASD|Space|Shift|J|F|R|Esc|Tab)$|↑/);
  });

  it("J・Space の言葉はボタンの文字になる（照準・ワイヤーの状態で変わる）", () => {
    expect(touchHintView([{ key: "J", label: "飛びつく" }], none).labels.claw).toBe("飛びつく");
    expect(touchHintView([{ key: "J", label: "離す" }, { key: "↑↓←→", label: "カメラ" }], none).labels.claw).toBe("離す");
    expect(touchHintView([{ key: "Space", label: "離脱" }], none).labels.jump).toBe("離脱");
    const idle = touchHintView([], none).labels;
    expect(idle.claw).toBe("つかむ");
    expect(idle.jump).toBe("ジャンプ");
  });

  it("「話す」「切替」は使えるときだけ出す", () => {
    expect(touchHintView([], none).labels.interact).toBeNull();
    expect(touchHintView([], none).labels.lock).toBeNull();
    const v = touchHintView([{ key: "J", label: "つかむ" }, { key: "R", label: "対象を切替" }], { canInteract: true, canSwitch: true });
    expect(v.labels.interact).toBe("話す");
    expect(v.labels.lock).toBe("対象を切替");
    expect(v.hud).toEqual([]);
  });

  it("目的の説明の「J で…」をタッチの言い方にする", () => {
    expect(toTouchText("桟橋から照準を歯車へ向けて J でつかむ")).toBe("桟橋から照準を歯車へ向けて 「つかむ」をタップ");
    expect(toTouchText("舟が通り過ぎたら J で離す")).toBe("舟が通り過ぎたら 「離す」をタップ");
    expect(toTouchText("源兵衛が歯止めを入れている")).toBe("源兵衛が歯止めを入れている");
  });
});
