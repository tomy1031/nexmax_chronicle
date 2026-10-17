// 2086年 ナンバタウン「時代博覧祭」の物語の状態機械（src/stages/future2086/future2086Story.ts）のテスト。
// チュートリアル 1〜5（移動 → F 会話 → J 引き寄せ → J 金具 → 振り子 → 夜の回避 → IDO 展示）と、
// シーン 2〜5（祭りの朝・オルム・ループ・IDO の裂け目 → 2026年へ）の流れを、シーン無しで確かめる。
import { describe, expect, it } from "vitest";
import {
  EVADE_TIMEOUT,
  Future2086Story,
  IDO_CHOICE,
  OBJECTIVES,
  STORY_STEPS,
  spawnForStep,
  startStepFromFlags,
  type StoryEffect,
  type StoryStepId,
} from "../src/stages/future2086/future2086Story";
import table from "../src/stages/future2086/dialogue_2086.json";

type Kinds = StoryEffect["kind"];

function story(start?: StoryStepId): Future2086Story {
  return new Future2086Story({ start }).record();
}

function kinds(effects: StoryEffect[]): Kinds[] {
  return effects.map((e) => e.kind);
}

/** 出ている会話を最後まで聞いたことにする */
function finishDialogue(s: Future2086Story, effects: StoryEffect[]): void {
  const d = effects.filter((e): e is Extract<StoryEffect, { kind: "dialogue" }> => e.kind === "dialogue").pop();
  expect(d, "会話が出ていない").toBeTruthy();
  s.send({ kind: "dialogue_done", key: d!.key });
}

/** 祭りの朝の最初から、2026年への移動の要求までを通しで進める */
function playToTravel(s: Future2086Story): StoryEffect[] {
  const all: StoryEffect[] = [];
  const pump = () => {
    const e = s.drain();
    all.push(...e);
    return e;
  };
  s.begin();
  pump();
  s.send({ kind: "zone", zone: "booth" });
  pump();
  s.send({ kind: "interact", target: "sora" });
  finishDialogue(s, pump());
  s.send({ kind: "claw", event: "object_arrived", targetId: "ido_lens" });
  finishDialogue(s, pump());
  s.send({ kind: "claw", event: "arrived", targetId: "walkway_hook" });
  finishDialogue(s, pump());
  s.send({ kind: "zone", zone: "far_platform" });
  finishDialogue(s, pump());
  pump();
  s.send({ kind: "fx_done", fx: "night" });
  finishDialogue(s, pump());
  s.send({ kind: "zone", zone: "south_gate" });
  finishDialogue(s, pump());
  pump();
  s.send({ kind: "fx_done", fx: "loop" });
  finishDialogue(s, pump());
  s.send({ kind: "interact", target: "sora" });
  finishDialogue(s, pump());
  s.send({ kind: "interact", target: "ido_exhibit" });
  pump();
  s.send({ kind: "choice", id: IDO_CHOICE.id, option: IDO_CHOICE.correct });
  finishDialogue(s, pump());
  pump();
  return all;
}

describe("future2086Story", () => {
  it("祭りの朝：展示ブースへ着くとソラに話しかける段階になり、F で祭りの朝の会話（最新型じゃなくても…）", () => {
    const s = story();
    s.begin();
    expect(s.step).toBe("go_booth");
    expect(s.objective().title).toContain("ブース");
    s.drain();
    expect(s.send({ kind: "zone", zone: "plaza_center" })).toBe(false);
    expect(s.send({ kind: "zone", zone: "booth" })).toBe(true);
    expect(s.step).toBe("talk_sora");
    expect(s.canInteract("sora")).toBe(true);
    s.drain();
    expect(s.send({ kind: "interact", target: "sora" })).toBe(true);
    const e = s.drain();
    expect(kinds(e)).toContain("drop_arm");
    const d = e.find((x) => x.kind === "dialogue") as Extract<StoryEffect, { kind: "dialogue" }>;
    expect(d.key).toBe("prep_talk");
    expect(d.lines.some((l) => l.speaker === "ソラ" && l.text === "最新型じゃなくても、私は君と作りたい。")).toBe(true);
    // 量産型に軽くからかわれる
    expect(d.lines.some((l) => l.speaker === "量産型ネクマックス")).toBe(true);
    expect(s.busy).toBe(true);
    s.send({ kind: "dialogue_done", key: "prep_talk" });
    const after = s.drain();
    expect(after).toContainEqual({ kind: "flag", name: "festival_morning_seen" });
    expect(s.step).toBe("fetch_lens");
  });

  it("手の届かない部品を J で引き寄せる → 金具で回廊へ → 振り子で渡ると夜へ", () => {
    const s = story("fetch_lens");
    expect(s.objective().sub).toContain("J");
    // 別の対象では進まない
    expect(s.send({ kind: "claw", event: "object_arrived", targetId: "something_else" })).toBe(false);
    expect(s.send({ kind: "claw", event: "object_arrived", targetId: "ido_lens" })).toBe(true);
    expect(s.step).toBe("climb_hook");
    finishDialogue(s, s.drain());
    expect(s.send({ kind: "claw", event: "arrived", targetId: "walkway_hook" })).toBe(true);
    expect(s.step).toBe("swing_gap");
    finishDialogue(s, s.drain());
    // 回廊に上がっただけ（同じ側）では進まない
    expect(s.send({ kind: "zone", zone: "upper_walkway" })).toBe(false);
    expect(s.send({ kind: "zone", zone: "far_platform" })).toBe(true);
    expect(s.step).toBe("night");
    finishDialogue(s, s.drain());
    const e = s.drain();
    expect(e).toContainEqual({ kind: "transition", to: "night", spawn: "night_plaza", sora: "night" });
    expect(e).toContainEqual({ kind: "lock", on: true });
  });

  it("金具は回廊の範囲に入っただけでも進む（引き寄せ以外の方法で上がっても詰まない）", () => {
    const s = story("climb_hook");
    expect(s.send({ kind: "zone", zone: "upper_walkway" })).toBe(true);
    expect(s.step).toBe("swing_gap");
  });

  it("夜：オルムが現れ、会話のあと破片の回避。避難ゲートで飲み込み → ループの演出 → 祭りの朝", () => {
    const s = story("night");
    s.send({ kind: "fx_done", fx: "night" });
    let e = s.drain();
    expect(s.step).toBe("night_orum");
    expect(e).toContainEqual({ kind: "orum", action: "appear" });
    finishDialogue(s, e);
    e = s.drain();
    expect(s.step).toBe("evade");
    expect(e).toContainEqual({ kind: "flag", name: "orum_seen" });
    expect(e).toContainEqual({ kind: "debris", active: true });
    expect(e).toContainEqual({ kind: "sora", spot: "escape" });
    expect(e).toContainEqual({ kind: "lock", on: false });
    expect(s.objective().sub).toContain("Shift");
    // 当たってもよろけるだけ（失敗にしない）。台詞は続けて連打しない
    expect(s.send({ kind: "debris_hit" })).toBe(true);
    expect(s.send({ kind: "debris_hit" })).toBe(true);
    expect(s.step).toBe("evade");
    expect(s.debrisHits).toBe(2);
    expect(kinds(s.drain()).filter((k) => k === "say").length).toBe(1);
    s.send({ kind: "zone", zone: "south_gate" });
    e = s.drain();
    expect(s.step).toBe("swallow");
    expect(e).toContainEqual({ kind: "debris", active: false });
    expect(e).toContainEqual({ kind: "orum", action: "swallow" });
    finishDialogue(s, e);
    e = s.drain();
    expect(s.step).toBe("loop");
    expect(e).toContainEqual({ kind: "loop_count", value: 1 });
    expect(e).toContainEqual({ kind: "loop_fx", spawn: "loop_morning", sora: "booth" });
    s.send({ kind: "fx_done", fx: "loop" });
    e = s.drain();
    expect(s.step).toBe("loop_morning");
    expect(s.loopCount).toBe(1);
    expect((e.find((x) => x.kind === "dialogue") as Extract<StoryEffect, { kind: "dialogue" }>).key).toBe("loop_wake");
  });

  it("夜の回避が長引いても失敗にせず、時間が来たらループへ進む", () => {
    const s = story("night_orum");
    s.send({ kind: "fx_done", fx: "night" }); // night 以外では無視
    expect(s.step).toBe("night_orum");
    const s2 = story("night");
    s2.send({ kind: "fx_done", fx: "night" });
    finishDialogue(s2, s2.drain());
    expect(s2.step).toBe("evade");
    for (let t = 0; t < EVADE_TIMEOUT - 1; t += 0.5) s2.send({ kind: "tick", dt: 0.5 });
    expect(s2.step).toBe("evade");
    s2.send({ kind: "tick", dt: 1.5 });
    expect(s2.step).toBe("swallow");
  });

  it("ループ後のソラは同じあいさつを繰り返し（覚えているのはネクマックスだけ）、昔の記録を勧める", () => {
    const prep = table.prep_talk;
    const loop = table.loop_greet;
    expect(loop[0]).toEqual(prep[0]);
    expect(loop[1]).toEqual(prep[1]);
    expect(loop.some((l) => l.text.includes("君だけ昨日を覚えているなら、君のことを調べる方法があるかも"))).toBe(true);
    expect(loop.some((l) => l.text.includes("古い会社の記録"))).toBe(true);
    const s = story("loop_morning");
    expect(s.canInteract("ido_exhibit")).toBe(false);
    s.send({ kind: "interact", target: "sora" });
    finishDialogue(s, s.drain());
    expect(s.step).toBe("ido_exhibit");
    expect(s.drain()).toContainEqual({ kind: "sora", spot: "exhibit" });
  });

  it("IDO 展示：別の記録ではソラが 2026年を勧め、「NEXMAXの最初の記録／2026年・なんば」で鉱石が反応して 2026年へ", () => {
    const s = story("ido_exhibit");
    let travel: [string, string] | null = null;
    s.onRequestTravel = (era, spawn) => (travel = [era, spawn]);
    expect(s.canInteract("ido_exhibit")).toBe(true);
    expect(s.send({ kind: "interact", target: "ido_exhibit" })).toBe(true);
    let e = s.drain();
    const ch = e.find((x) => x.kind === "choice") as Extract<StoryEffect, { kind: "choice" }>;
    expect(ch.options.map((o) => o.label)).toContain("NEXMAXの最初の記録／2026年・なんば");
    // 選択中は F に反応しない
    expect(s.canInteract("ido_exhibit")).toBe(false);
    s.send({ kind: "choice", id: IDO_CHOICE.id, option: "expo1970" });
    finishDialogue(s, s.drain());
    expect(s.step).toBe("ido_exhibit");
    s.send({ kind: "interact", target: "ido_exhibit" });
    s.drain();
    s.send({ kind: "choice", id: IDO_CHOICE.id, option: IDO_CHOICE.correct });
    e = s.drain();
    expect(s.step).toBe("ido_resonance");
    expect(e).toContainEqual({ kind: "rift", open: true });
    expect(e.some((x) => x.kind === "ore_glow")).toBe(true);
    const d = e.find((x) => x.kind === "dialogue") as Extract<StoryEffect, { kind: "dialogue" }>;
    expect(d.lines.some((l) => l.text === "えっ、展示ってこんなにリアルなの？")).toBe(true);
    expect(travel).toBeNull();
    s.send({ kind: "dialogue_done", key: d.key });
    e = s.drain();
    expect(s.step).toBe("travel");
    expect(e).toContainEqual({ kind: "flag", name: "ido_exhibit_used" });
    expect(e).toContainEqual({ kind: "travel", to: "2026", spawn: "arrive_from_2086", cause: "ido_exhibit" });
    expect(travel).toEqual(["2026", "arrive_from_2086"]);
  });

  it("通しで遊ぶと、移動の要求は 1 回だけ・フラグは 3 つ・ループは 1 回", () => {
    const s = story();
    let calls = 0;
    s.onRequestTravel = () => calls++;
    const all = playToTravel(s);
    expect(s.step).toBe("travel");
    expect(calls).toBe(1);
    const flags = all.filter((e) => e.kind === "flag").map((e) => (e as Extract<StoryEffect, { kind: "flag" }>).name);
    expect(flags).toEqual(["festival_morning_seen", "orum_seen", "ido_exhibit_used"]);
    expect(s.loopCount).toBe(1);
    // 使った会話はすべて JSON にある（空の会話を出していない）
    for (const e of all) if (e.kind === "dialogue") expect(e.lines.length).toBeGreaterThan(0);
  });

  it("会話の終わりの知らせは、待っている会話のキーにだけ反応する", () => {
    const s = story("go_booth");
    s.send({ kind: "interact", target: "sora" });
    expect(s.send({ kind: "dialogue_done", key: "lens_thanks" })).toBe(false);
    expect(s.step).toBe("talk_sora");
    expect(s.send({ kind: "dialogue_done", key: "prep_talk" })).toBe(true);
    expect(s.step).toBe("fetch_lens");
  });

  it("途中のステップでソラに話しかけるとヒントの会話（進行は変わらない）", () => {
    for (const [step, key] of [
      ["fetch_lens", "sora_hint_lens"],
      ["climb_hook", "sora_hint_hook"],
      ["swing_gap", "sora_hint_swing"],
      ["ido_exhibit", "sora_hint_exhibit"],
    ] as const) {
      const s = story(step);
      s.send({ kind: "interact", target: "sora" });
      const d = s.drain().find((e) => e.kind === "dialogue") as Extract<StoryEffect, { kind: "dialogue" }>;
      expect(d.key).toBe(key);
      s.send({ kind: "dialogue_done", key });
      expect(s.step).toBe(step);
    }
    // 夜は話しかけられない
    expect(story("evade").canInteract("sora")).toBe(false);
  });

  it("すべてのステップに目標・到着地点があり、フラグから再開するステップが決まる", () => {
    for (const st of STORY_STEPS) {
      expect(OBJECTIVES[st]).toBeTruthy();
      expect(typeof spawnForStep(st)).toBe("string");
    }
    for (const st of ["go_booth", "talk_sora", "fetch_lens", "climb_hook", "swing_gap", "evade", "loop_morning", "ido_exhibit"] as const) {
      expect(OBJECTIVES[st].title.length).toBeGreaterThan(0);
    }
    const f = (on: string[]) => (n: string) => on.includes(n);
    expect(startStepFromFlags(f([]))).toBe("go_booth");
    expect(startStepFromFlags(f(["festival_morning_seen"]))).toBe("fetch_lens");
    expect(startStepFromFlags(f(["festival_morning_seen", "orum_seen"]))).toBe("loop_morning");
    expect(startStepFromFlags(f(["festival_morning_seen", "orum_seen", "ido_exhibit_used"]))).toBe("returned");
    expect(spawnForStep("returned")).toBe("arrive_from_2026");
    expect(spawnForStep("evade")).toBe("night_plaza");
  });

  it("onEffect のリスナーにも同じ演出が届く", () => {
    const got: Kinds[] = [];
    const s = new Future2086Story({ start: "talk_sora" });
    s.onEffect = (e) => got.push(e.kind);
    s.send({ kind: "interact", target: "sora" });
    expect(got).toEqual(["drop_arm", "dialogue"]);
  });
});
