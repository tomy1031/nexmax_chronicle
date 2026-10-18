// 2086年 導入編（docs/シナリオ改訂案_導入編_v1.md の 1〜5 章）の物語の状態機械（src/stages/future2086/intro2086Story.ts）。
// シーン無しで、回想 → レンズの受け渡し → アンテナ → 約束 → 夜 → ループ → 気づき → 試み（順番自由）→ 打ち明け → QR → 2026年 を通す。
import { describe, expect, it } from "vitest";
import {
  ATTEMPTS,
  ATTEMPT_CHOICE,
  CONFRONT_TIMEOUT,
  EVADE_TIMEOUT,
  INTRO_OBJECTIVES,
  INTRO_STEPS,
  Intro2086Story,
  MORNING_EVENTS,
  introSpawn,
  introStartStep,
  type IntroEffect,
  type IntroStep,
} from "../src/stages/future2086/intro2086Story";
import table from "../src/stages/future2086/intro_2086.json";

type Dlg = Extract<IntroEffect, { kind: "dialogue" }>;
const story = (start?: IntroStep, loopCount = 0, flags: string[] = []) =>
  new Intro2086Story({ start, loopCount, flags: (n) => flags.includes(n) }).record();
const lastDlg = (e: IntroEffect[]) => e.filter((x): x is Dlg => x.kind === "dialogue").pop();
const has = (e: IntroEffect[], kind: IntroEffect["kind"]) => e.some((x) => x.kind === kind);

/** 待っている会話を最後まで聞く（続けて出た会話も、なくなるまで。選択肢や演出の待ちで止まる） */
function finish(s: Intro2086Story, max = 8): IntroEffect[] {
  const all: IntroEffect[] = [...s.drain()];
  for (let i = 0; i < max && s.pending; i++) {
    s.send({ kind: "dialogue_done", key: s.pending });
    all.push(...s.drain());
  }
  return all;
}

/** 1 周目を最後まで（夜の飲み込み → 朝）進める */
function playChapter1And2(s: Intro2086Story): IntroEffect[] {
  const all: IntroEffect[] = [];
  const pump = () => {
    const e = finish(s);
    all.push(...e);
    return e;
  };
  s.begin();
  pump();
  s.send({ kind: "fx_done", fx: "flashback" });
  pump();
  s.send({ kind: "zone", zone: "booth" });
  s.send({ kind: "interact", target: "sora" });
  pump();
  s.send({ kind: "claw", event: "object_arrived", targetId: "ido_lens" });
  pump();
  s.send({ kind: "interact", target: "sora", item: "lens" });
  pump();
  s.send({ kind: "claw", event: "arrived", targetId: "walkway_hook" });
  pump();
  s.send({ kind: "zone", zone: "far_platform" });
  pump();
  s.send({ kind: "interact", target: "antenna" });
  pump();
  s.send({ kind: "interact", target: "sora" });
  pump();
  s.send({ kind: "fx_done", fx: "night" });
  pump();
  for (let t = 0; t < 5; t += 0.5) s.send({ kind: "tick", dt: 0.5 });
  pump();
  s.send({ kind: "zone", zone: "south_gate" });
  pump();
  s.send({ kind: "fx_done", fx: "loop" });
  pump();
  return all;
}

describe("1章 祭りの朝", () => {
  it("回想から始まり、15年後の独白、ブースでソラが IDO を説明してから腕が落ちる", () => {
    const s = story();
    s.begin();
    const e0 = s.drain();
    expect(s.step).toBe("opening");
    expect(has(e0, "flashback")).toBe(true);
    expect(s.busy).toBe(true);
    s.send({ kind: "fx_done", fx: "flashback" });
    let e = s.drain();
    expect(s.step).toBe("go_booth");
    expect(lastDlg(e)!.lines[0].text).toContain("あれから15年");
    s.send({ kind: "dialogue_done", key: "opening_mono" });
    s.send({ kind: "zone", zone: "booth" });
    expect(s.step).toBe("talk_sora");
    s.drain();
    s.send({ kind: "interact", target: "sora" });
    e = s.drain();
    const d = lastDlg(e)!;
    expect(d.lines.slice(0, 2)).toEqual(table.morning_greet);
    expect(d.lines.some((l) => l.text.includes("記録の石標のQR"))).toBe(true);
    expect(has(e, "drop_arm")).toBe(false);
    s.send({ kind: "dialogue_done", key: d.key });
    e = s.drain();
    expect(has(e, "drop_arm")).toBe(true);
    expect(lastDlg(e)!.lines.some((l) => l.text === "最新型じゃなくても、私は君と作りたい。")).toBe(true);
  });

  it("レンズは J で取ったあと F でソラに渡す（持っていないと渡せない）。はめると展示が安定し、アンテナの頼みへ", () => {
    const s = story("fetch_lens");
    s.send({ kind: "claw", event: "object_arrived", targetId: "ido_lens" });
    expect(s.step).toBe("deliver_lens");
    expect(s.interactLabel("sora")).toBe("渡す");
    s.drain();
    s.send({ kind: "interact", target: "sora" });
    let e = s.drain();
    expect(lastDlg(e)!.key).toBe("lens_need");
    expect(has(e, "install_lens")).toBe(false);
    s.send({ kind: "dialogue_done", key: "lens_need" });
    s.send({ kind: "interact", target: "sora", item: "lens" });
    e = s.drain();
    expect(has(e, "install_lens")).toBe(true);
    expect(lastDlg(e)!.lines.some((l) => l.speaker === "体験客")).toBe(true);
    e = finish(s);
    expect(s.step).toBe("climb_hook");
    expect(e).toContainEqual({ kind: "focus", target: "hook", short: false });
  });

  it("アンテナで F：大画面に開場の映像、ソラの通信 →「そのとき、君にも IDO を体験させてあげる」の約束 → 夜へ", () => {
    const s = story("swing_gap");
    s.send({ kind: "zone", zone: "far_platform" });
    expect(s.step).toBe("fix_antenna");
    expect(s.canInteract("antenna")).toBe(true);
    s.drain();
    s.send({ kind: "interact", target: "antenna" });
    let e = s.drain();
    expect(has(e, "antenna_fixed")).toBe(true);
    expect(e).toContainEqual({ kind: "focus", target: "screen", short: false });
    finish(s);
    expect(s.step).toBe("return_booth");
    s.send({ kind: "interact", target: "sora" });
    e = s.drain();
    expect(lastDlg(e)!.lines.some((l) => l.text === "そのとき、君にもIDOを体験させてあげる。")).toBe(true);
    e = finish(s);
    expect(e).toContainEqual({ kind: "transition", to: "night", spawn: "night_plaza", sora: "night" });
  });
});

describe("2章 その夜", () => {
  it("ソラと歩いたあと空が裂け、避難して飲み込まれ、朝へ戻る（周回 1）", () => {
    const s = story();
    const all = playChapter1And2(s);
    expect(all.some((e) => e.kind === "sora" && e.spot === "follow")).toBe(true);
    expect(all).toContainEqual({ kind: "orum", action: "appear", short: false });
    expect(all).toContainEqual({ kind: "flag", name: "orum_seen" });
    expect(all).toContainEqual({ kind: "loop_count", value: 1 });
    expect(s.loopCount).toBe(1);
    expect(s.step).toBe("loop_cues");
    const flags = all.filter((e) => e.kind === "flag").map((e) => (e as Extract<IntroEffect, { kind: "flag" }>).name);
    expect(flags).toEqual(["festival_morning_seen", "lens_installed", "orum_seen"]);
  });

  it("避難が長引いても失敗にせず飲み込みへ", () => {
    const s = story("night_walk");
    s.send({ kind: "fx_done", fx: "night" });
    const st = new Intro2086Story({ start: "evade" }).record();
    for (let t = 0; t < EVADE_TIMEOUT + 1; t += 1) st.send({ kind: "tick", dt: 1 });
    expect(st.step).toBe("swallow");
  });
});

describe("3章 繰り返す朝", () => {
  it("毎朝、同じ時刻に街頭ビジョンと風船。1 回目のループでだけネクマックスが気づく", () => {
    const s0 = story("go_booth");
    s0.begin();
    s0.drain();
    for (let t = 0; t < MORNING_EVENTS.balloon + 8; t += 0.5) s0.send({ kind: "tick", dt: 0.5 });
    const e0 = s0.drain();
    expect(has(e0, "announce")).toBe(true);
    expect(has(e0, "balloon")).toBe(true);
    expect(e0.some((e) => e.kind === "say" && e.text.includes("19日"))).toBe(false);
    const s1 = story("loop_cues", 1);
    s1.begin();
    s1.drain();
    for (let t = 0; t < MORNING_EVENTS.balloon + 8; t += 0.5) s1.send({ kind: "tick", dt: 0.5 });
    const e1 = s1.drain();
    const says = e1.filter((e): e is Extract<IntroEffect, { kind: "say" }> => e.kind === "say");
    // 街頭ビジョンの言葉は毎朝同じ
    expect(says.find((x) => x.speaker === "街頭ビジョン")!.text).toBe(table.announce[0].text);
    expect(says.find((x) => x.speaker === "街頭ビジョン")!.text).toContain("10月18日");
    expect(says.some((x) => x.text.includes("19日のはず"))).toBe(true);
    expect(says.some((x) => x.text.includes("同じ街灯"))).toBe(true);
    expect(e1).toContainEqual({ kind: "focus", target: "balloon", short: true });
  });

  it("ソラは一字一句同じあいさつ。手伝うと言った瞬間に腕を受け止め、夜の話には初めて聞いた返事", () => {
    const s = story("loop_cues", 1);
    s.send({ kind: "interact", target: "sora" });
    let e = s.drain();
    const d = lastDlg(e)!;
    expect(d.lines.slice(0, 2)).toEqual(table.morning_greet);
    expect(d.lines[d.lines.length - 1].text).toContain("まかせて");
    s.send({ kind: "dialogue_done", key: d.key });
    e = s.drain();
    expect(has(e, "arm_catch")).toBe(true);
    const c = lastDlg(e)!;
    expect(c.lines.some((l) => l.text.includes("知ってた"))).toBe(true);
    expect(c.lines.some((l) => l.speaker === "ソラ" && l.text.includes("怖い夢、見たの？"))).toBe(true);
    s.send({ kind: "dialogue_done", key: c.key });
    e = s.drain();
    expect(s.step).toBe("attempts");
    expect(e).toContainEqual({ kind: "flag", name: "loop_noticed" });
    expect(s.objective().title).toBe("夜が来る前に、みんなを守る方法を試そう");
    expect(s.attemptItems()!.map((x) => x.done)).toEqual([false, false, false, false]);
  });
});

/** 試みの周：決めた試みの夜を通して、朝に戻るまで */
function runAttemptNight(s: Intro2086Story): IntroEffect[] {
  const all: IntroEffect[] = [];
  all.push(...finish(s));
  expect(s.step).toBe("night");
  s.send({ kind: "fx_done", fx: "night" });
  all.push(...s.drain());
  expect(s.step).toBe("attempt_night");
  expect(all).toContainEqual({ kind: "orum", action: "appear", short: true });
  const d = lastDlg(all)!;
  s.send({ kind: "dialogue_done", key: d.key });
  all.push(...s.drain());
  if (s.step === "confront") {
    expect(s.objective().title).toContain("クロー");
    s.send({ kind: "confront_shot" });
    all.push(...s.drain());
    expect(all.some((e) => e.kind === "confront_shot")).toBe(true);
    s.send({ kind: "dialogue_done", key: lastDlg(all)!.key });
    all.push(...s.drain());
  } else {
    const n = lastDlg(all)!;
    if (n.key !== "orum_swallow") {
      s.send({ kind: "dialogue_done", key: n.key });
      all.push(...s.drain());
    }
  }
  expect(s.step).toBe("swallow");
  s.send({ kind: "dialogue_done", key: "orum_swallow" });
  all.push(...s.drain());
  s.send({ kind: "fx_done", fx: "loop" });
  all.push(...s.drain());
  expect(s.step).toBe("wake");
  return all;
}

describe("4章 あらがう（順番は自由）", () => {
  it("非常警報 → 町の外 の順でも、2 つ目のあとに「変えられないの……？」と気づき、打ち明けられるようになる", () => {
    const s = story("attempts", 1);
    expect(s.alarmEnabled()).toBe(true);
    s.send({ kind: "claw", event: "connected", targetId: "alarm_lever" });
    let e = s.drain();
    expect(e).toContainEqual({ kind: "evacuate", on: true });
    expect(s.current).toBe("alarm");
    e = runAttemptNight(s);
    expect(e.some((x) => x.kind === "city_unravel")).toBe(true);
    expect(e).toContainEqual({ kind: "flag", name: "try_alarm" });
    expect(e).toContainEqual({ kind: "evacuate", on: false });
    let w = lastDlg(e)!;
    expect(w.lines.some((l) => l.text.includes("変えられないの"))).toBe(false);
    s.send({ kind: "dialogue_done", key: w.key });
    expect(s.step).toBe("attempts");
    expect(s.attemptItems()!.find((x) => x.id === "alarm")!.done).toBe(true);
    // ソラ：あいさつ（毎周同じ）→ 選択肢
    s.drain();
    s.send({ kind: "interact", target: "sora" });
    const g = lastDlg(s.drain())!;
    expect(g.lines).toEqual(table.morning_greet);
    s.send({ kind: "dialogue_done", key: g.key });
    const ch = s.drain().find((x) => x.kind === "choice") as Extract<IntroEffect, { kind: "choice" }>;
    expect(ch.id).toBe(ATTEMPT_CHOICE.id);
    expect(ch.options.map((o) => o.id)).toEqual(["escape", "confront", "none"]);
    s.send({ kind: "choice", id: ch.id, option: "escape" });
    finish(s);
    expect(s.step).toBe("escape_walk");
    s.send({ kind: "zone", zone: "south_gate" });
    e = s.drain();
    expect(has(e, "whiteout")).toBe(true);
    s.send({ kind: "fx_done", fx: "whiteout" });
    e = s.drain();
    expect(lastDlg(e)!.lines.some((l) => l.text === "この町から……出られない？")).toBe(true);
    e = runAttemptNight(s);
    w = lastDlg(e)!;
    expect(w.lines.some((l) => l.text === "ぼくには……未来は、変えられないの……？")).toBe(true);
    s.send({ kind: "dialogue_done", key: w.key });
    expect(s.despaired).toBe(true);
    expect(s.objective().title).toBe("ソラに打ち明けよう");
    // 打ち明けるが選べる（まだの試みも選べる）
    s.drain();
    s.send({ kind: "interact", target: "sora" });
    s.send({ kind: "dialogue_done", key: lastDlg(s.drain())!.key });
    const ch2 = s.drain().find((x) => x.kind === "choice") as Extract<IntroEffect, { kind: "choice" }>;
    expect(ch2.options.map((o) => o.id)).toEqual(["confide", "confront", "none"]);
  });

  it("運営本部で中止を頼む → ソラにも頼むと夜へ。夜はソラが一緒にいて、朝に「中止しても、だめなんだ……」", () => {
    const s = story("attempts", 1);
    expect(s.canInteract("hq")).toBe(true);
    s.send({ kind: "interact", target: "hq" });
    let e = s.drain();
    expect(lastDlg(e)!.lines.some((l) => l.speaker === "実行委員" && l.text.includes("予定どおり開催します"))).toBe(true);
    expect(lastDlg(e)!.lines.some((l) => l.speaker === "量産型ネクマックス")).toBe(true);
    s.send({ kind: "dialogue_done", key: "try_cancel_hq" });
    expect(s.objective().title).toBe("ソラにも中止を頼もう");
    s.send({ kind: "interact", target: "sora" });
    e = s.drain();
    const d = lastDlg(e)!;
    expect(d.lines.slice(0, 2)).toEqual(table.morning_greet);
    expect(d.lines.some((l) => l.text.includes("君がそこまで言うなら、夜は一緒にいよう"))).toBe(true);
    expect(s.current).toBe(null);
    e = runAttemptNight(s);
    expect(lastDlg(e)!.lines.some((l) => l.text === "中止しても、だめなんだ……。")).toBe(true);
    expect(e).toContainEqual({ kind: "flag", name: "try_cancel" });
  });

  it("立ち向かう夜：撃たなくても時間が来たら撃ってすり抜ける", () => {
    const s = story("attempts", 2);
    s.send({ kind: "interact", target: "sora" });
    s.send({ kind: "dialogue_done", key: lastDlg(s.drain())!.key });
    const ch = s.drain().find((x) => x.kind === "choice") as Extract<IntroEffect, { kind: "choice" }>;
    s.send({ kind: "choice", id: ch.id, option: "confront" });
    finish(s);
    s.send({ kind: "fx_done", fx: "night" });
    s.send({ kind: "dialogue_done", key: "orum_appear_short" });
    expect(s.step).toBe("confront");
    for (let t = 0; t < CONFRONT_TIMEOUT + 1; t += 1) s.send({ kind: "tick", dt: 1 });
    const e = s.drain();
    expect(e.some((x) => x.kind === "confront_shot")).toBe(true);
    expect(lastDlg(e)!.lines[0].text).toBe("クローが……すり抜ける！");
  });

  it("保存したフラグから試みの済みを戻す", () => {
    const s = story("attempts", 3, ["try_cancel", "try_confront"]);
    expect(s.attemptItems()!.filter((x) => x.done).map((x) => x.id)).toEqual(["cancel", "confront"]);
    expect(s.despaired).toBe(true);
    expect(s.alarmEnabled()).toBe(true);
  });
});

describe("5章 IDO で自分を調べる", () => {
  it("打ち明ける →「信じるよ」→ 石標の話 → 1970・1726 は短い映像だけ、2026 で鉱石が共鳴して 2026年へ", () => {
    const s = story("attempts", 3, ["try_cancel", "try_alarm"]);
    let travel: string | null = null;
    s.onRequestTravel = (era, spawn) => (travel = `${era}:${spawn}`);
    s.send({ kind: "interact", target: "sora" });
    s.send({ kind: "dialogue_done", key: lastDlg(s.drain())!.key });
    const ch = s.drain().find((x) => x.kind === "choice") as Extract<IntroEffect, { kind: "choice" }>;
    s.send({ kind: "choice", id: ch.id, option: "confide" });
    let e = s.drain();
    const c = lastDlg(e)!;
    expect(c.lines[0].text).toBe("……どうしたの？ 元気ないね。");
    expect(c.lines.some((l) => l.text === "君がそんな顔するの、初めて見た。……信じるよ。")).toBe(true);
    e = finish(s);
    expect(e).toContainEqual({ kind: "flag", name: "confided" });
    expect(s.step).toBe("records");
    expect(s.canInteract("stone_1970")).toBe(true);
    s.send({ kind: "interact", target: "stone_1970" });
    e = s.drain();
    expect(e).toContainEqual({ kind: "qr_scan", record: "expo1970" });
    expect(s.busy).toBe(true);
    s.send({ kind: "fx_done", fx: "qr" });
    e = finish(s);
    expect(e.some((x) => x.kind === "ore_glow")).toBe(false);
    expect(s.step).toBe("records");
    s.send({ kind: "interact", target: "stone_2026" });
    s.send({ kind: "fx_done", fx: "qr" });
    e = s.drain();
    expect(s.step).toBe("resonance");
    expect(e.some((x) => x.kind === "ore_glow")).toBe(true);
    expect(e).toContainEqual({ kind: "rift", open: true });
    expect(travel).toBeNull();
    e = finish(s);
    expect(e).toContainEqual({ kind: "flag", name: "ido_exhibit_used" });
    expect(travel).toBe("2026:present_start");
  });
});

describe("全体", () => {
  it("すべての段階に目標・到着地点があり、フラグから再開する段階が決まる", () => {
    for (const st of INTRO_STEPS) {
      expect(INTRO_OBJECTIVES[st]).toBeTruthy();
      expect(typeof introSpawn(st)).toBe("string");
    }
    const f = (on: string[]) => (n: string) => on.includes(n);
    expect(introStartStep(f([]))).toBe("opening");
    expect(introStartStep(f(["festival_morning_seen"]))).toBe("fetch_lens");
    expect(introStartStep(f(["festival_morning_seen", "lens_installed"]))).toBe("climb_hook");
    expect(introStartStep(f(["festival_morning_seen", "orum_seen"]))).toBe("loop_cues");
    expect(introStartStep(f(["festival_morning_seen", "orum_seen", "loop_noticed"]))).toBe("attempts");
    expect(introStartStep(f(["loop_noticed", "confided"]))).toBe("records");
    expect(introStartStep(f(["confided", "ido_exhibit_used"]))).toBe("returned");
    expect(ATTEMPTS.length).toBe(4);
  });

  it("台詞に「オルム」が出てこない・使う会話はすべて JSON にある", () => {
    for (const [k, v] of Object.entries(table)) {
      if (!Array.isArray(v)) continue;
      for (const l of v as Array<{ text: string }>) expect(l.text, k).not.toContain("オルム");
    }
    for (const o of Object.values(INTRO_OBJECTIVES)) expect(o.title + o.sub).not.toContain("オルム");
    const s = story();
    const all = playChapter1And2(s);
    for (const e of all) if (e.kind === "dialogue") expect(e.lines.length, e.key).toBeGreaterThan(0);
  });
});
