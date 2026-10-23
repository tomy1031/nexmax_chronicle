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
  const none = { interact: null, canSwitch: false, attack: false };
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
    // 照準の案内が優先されて F が無くても、その場で反応するものがあれば出す
    const v = touchHintView([{ key: "J", label: "つかむ" }, { key: "R", label: "対象を切替" }], { interact: "話す", canSwitch: true, attack: false });
    expect(v.labels.interact).toBe("話す");
    expect(v.labels.lock).toBe("対象を切替");
    expect(v.hud).toEqual([]);
  });

  it("戦いのある場面では「パンチ」ボタンを出す（K の案内が無くても）。ふだんは出さない", () => {
    expect(touchHintView([], none).labels.attack).toBeNull();
    expect(touchHintView([], { ...none, attack: true }).labels.attack).toBe("パンチ");
    expect(touchHintView([{ key: "K", label: "攻撃" }, { key: "Shift", label: "回避" }], { ...none, attack: true }).hud).toEqual([{ key: "大きく倒す", label: "回避" }]);
  });

  it("目的の「K でパンチ！」「K：攻撃」をタッチの言い方にする", () => {
    expect(toTouchText("よろいがなくなった！ K でパンチ！")).toBe("よろいがなくなった！ 「パンチ」をタップ！");
    expect(toTouchText("近づいて K：攻撃")).toBe("近づいて 「パンチ」で攻撃");
    expect(toTouchText("横へよける（Shift でダッシュ）")).toBe("横へよける（スティックを大きく倒してダッシュ）");
    expect(toTouchText("輪にぶら下がったら、WASD で前へこいで、向こう岸の上で Space！")).toBe("輪にぶら下がったら、スティックで前へこいで、向こう岸の上で 「ジャンプ」！");
    expect(toTouchText("← → でダイヤルを回して")).toBe("スティックを左右に倒してダイヤルを回して");
    expect(touchHintView([{ key: "← →", label: "回す" }], none).hud).toEqual([{ key: "スティック左右", label: "回す" }]);
  });

  it("話すボタンの言葉は案内（会話の「次へ」・選択肢の「決定」・ステージの言葉）に従う", () => {
    expect(touchHintView([{ key: "F", label: "次へ" }], none).labels.interact).toBe("次へ");
    expect(touchHintView([{ key: "F", label: "IDO の QR を読む" }], none).labels.interact).toBe("IDO の QR を読む");
    const choice = touchHintView([{ key: "W／S", label: "選ぶ" }, { key: "F", label: "決定" }], none);
    expect(choice.labels.interact).toBe("決定");
    expect(choice.hud).toEqual([{ key: "スティック上下", label: "選ぶ" }]);
    expect(touchHintView([{ key: "A/D", label: "揺らす" }], none).hud).toEqual([{ key: "スティック左右", label: "揺らす" }]);
  });

  it("目的の説明の「J で…」をタッチの言い方にする", () => {
    expect(toTouchText("桟橋から照準を歯車へ向けて J でつかむ")).toBe("桟橋から照準を歯車へ向けて 「つかむ」をタップ");
    expect(toTouchText("舟が通り過ぎたら J で離す")).toBe("舟が通り過ぎたら 「離す」をタップ");
    expect(toTouchText("源兵衛が歯止めを入れている")).toBe("源兵衛が歯止めを入れている");
  });

  it("目的の補足の「KEY：言葉」をタッチの言い方にする", () => {
    expect(toTouchText("WASD：移動　↑↓←→：カメラ　Space：ジャンプ")).toBe("左側をなぞって移動　右側をなぞってカメラ　「ジャンプ」");
    expect(toTouchText("ソラの近くで F：話す")).toBe("ソラの近くで 「話す」");
    expect(toTouchText("北の端のアーチ　J：ぶら下がる　A/D：揺らす　Space：離脱")).toBe("北の端のアーチ　「ぶら下がる」　スティックを左右に倒して揺らす　「離脱」");
    expect(toTouchText("赤い輪に破片が落ちる　Shift：ダッシュ　Space：ジャンプ")).toBe("赤い輪に破片が落ちる　スティックを大きく倒してダッシュ　「ジャンプ」");
    expect(toTouchText("ラボの作業台で F")).toBe("ラボの作業台でボタンをタップ");
    expect(toTouchText("IDOマーカーの光で F")).toBe("IDOマーカーの光でボタンをタップ");
  });

  it("台詞の「KEY で…」をタッチの言い方にする（英字の途中には当てない）", () => {
    expect(toTouchText("照準を合わせて J で引き寄せてみて。")).toBe("照準を合わせて 「つかむ」で引き寄せてみて。");
    expect(toTouchText("吊り輪にぶら下がって、A と D で勢いをつけて、Space で飛んで！")).toBe("吊り輪にぶら下がって、スティックを左右に倒して勢いをつけて、「ジャンプ」で飛んで！");
    expect(toTouchText("展示のリングの前で F を押すと、記録を選べるよ。")).toBe("展示のリングの前で 画面のボタンを押すと、記録を選べるよ。");
    expect(toTouchText("この石の標識が IDO や。F で QR を読んでみ。")).toBe("この石の標識が IDO や。画面のボタンで QR を読んでみ。");
    expect(toTouchText("水路沿いの石の標識……IDOを調べてみて。近づいて F や。")).toBe("水路沿いの石の標識……IDOを調べてみて。近づいて ボタンを押すんや。");
    expect(toTouchText("IDO の QR を読む")).toBe("IDO の QR を読む");
  });
});
