// 物語 v2.3 の目標（core/storyDirector.ts）と 2026年の進行（stages/namba2026/script.ts）
import { describe, expect, it } from "vitest";
import { edoObjective, presentObjective, storyObjective, futureObjective } from "../src/core/storyDirector";
import { StoryState } from "../src/core/storyFlags";
import { matsuiSpot, nambaArrivalSpawn, nambaBeat } from "../src/stages/namba2026/script";
import { travelRule } from "../src/game/travel";

describe("storyObjective（v2.3）", () => {
  it("2026年：マツイ社長 → 佐伯 → IDO → 帰還後の報告 → 固定具 → 2086年へ", () => {
    const s = new StoryState();
    const f = (n: string) => s.get(n);
    expect(presentObjective(f).target).toBe("matsui");
    s.set("met_matsui", true);
    expect(presentObjective(f).target).toBe("saeki");
    s.set("met_saeki", true);
    // 導入編 6-6：腕を直したあと、表のマツイ社長に帰る方法を相談してから石標へ
    expect(presentObjective(f).target).toBe("matsui");
    s.set("ido_hint_heard", true);
    expect(presentObjective(f).target).toBe("ido_markers");
    s.set("ido_qr_used", true);
    s.set("gate_repaired", true);
    s.set("genbei_drawing_found", true);
    expect(presentObjective(f).target).toBe("matsui");
    expect(presentObjective(f).title).toContain("源兵衛");
    s.set("genbei_story_told", true);
    expect(presentObjective(f).target).toBe("saeki");
    s.set("fixture_made", true);
    s.timeline.confirmDrawing();
    expect(presentObjective(f).target).toBe("ido");
    expect(presentObjective(f).title).toContain("2086");
  });

  it("1726年：水門を直すまでは歯車、直したら帰還地点", () => {
    const s = new StoryState();
    const f = (n: string) => s.get(n);
    expect(edoObjective(f).target).toBe("gate_gear");
    s.set("gate_repaired", true);
    expect(edoObjective(f).target).toBe("return_point");
  });

  it("2086年の既定の目標と、未定義の時代", () => {
    const s = new StoryState();
    const f = (n: string) => s.get(n);
    expect(futureObjective(f).target).toBe("festival");
    s.set("festival_morning_seen", true);
    expect(futureObjective(f).target).toBe("exhibit");
    expect(storyObjective(2086, f).target).toBe("exhibit");
    expect(storyObjective(0, f).target).toBe("");
    for (const era of [1726, 2026, 2086]) expect(storyObjective(era, f).title.length).toBeGreaterThan(0);
  });
});

describe("2026年の進行（nambaBeat）", () => {
  /** 会話を最後まで聞いたとして、beat のフラグを反映する */
  const play = (s: StoryState, actor: "matsui" | "saeki" | "ido") => {
    const b = nambaBeat(actor, (n) => s.get(n));
    for (const fl of b.set ?? []) s.set(fl, true);
    if (b.confirmDrawing) s.timeline.confirmDrawing();
    return b;
  };

  it("初回：佐伯や IDO を先に調べても進行は崩れず、社長 → 佐伯 → IDO の順で 1726年へ", () => {
    const s = new StoryState();
    expect(matsuiSpot((n) => s.get(n))).toBe("entrance");
    expect(nambaArrivalSpawn((n) => s.get(n))).toBe("present_start");
    expect(play(s, "saeki").dialogue).toBe("saeki_stranger");
    expect(play(s, "ido").travel).toBeUndefined();
    const m = play(s, "matsui");
    expect(m.dialogue).toBe("matsui_first");
    expect(m.matsuiTo).toBe("lab");
    expect(s.get("met_matsui")).toBe(true);
    expect(matsuiSpot((n) => s.get(n))).toBe("lab");
    expect(play(s, "ido").travel).toBeUndefined();
    expect(play(s, "matsui").dialogue).toBe("matsui_lead");
    const sa = play(s, "saeki");
    expect(sa.dialogue).toBe("saeki_first");
    expect(sa.matsuiTo).toBe("ido");
    expect(s.get("met_saeki")).toBe(true);
    expect(matsuiSpot((n) => s.get(n))).toBe("ido");
    expect(play(s, "saeki").dialogue).toBe("saeki_repeat");
    // 導入編 6-6：石標は、表の社長に相談するまで「社長に聞いてみよう」だけ。相談すると社長がついて歩き、
    // 石標 A（NEXTMAKE の前）・B は昔の町を見るだけ、C（古い路地の奥）で 1726年へ
    expect(play(s, "ido").dialogue).toBe("ido_ask_matsui");
    const hint = play(s, "matsui");
    expect(hint.dialogue).toBe("matsui_ido_hint");
    expect(hint.follow).toBe(true);
    expect(s.get("ido_hint_heard")).toBe(true);
    const a = play(s, "ido");
    expect(a.panel).toBe("old1926");
    expect(a.travel).toBeUndefined();
    const ido = play(s, "ido_c");
    expect(ido.panel).toBe("karakuri");
    expect(ido.travel).toEqual({ to: "1726", cause: "ido_qr", spawn: "arrive" });
    expect(s.get("ido_qr_used")).toBe(true);
    // 規則でも許される移動
    expect(travelRule("2026", ido.travel!, (n) => s.get(n)).ok).toBe(true);
  });

  it("帰還：IDO の前の社長に報告 → ラボで佐伯の固定具 → 絵図の記録が確定して 2086年へ", () => {
    const s = new StoryState();
    s.applyFlagList(["met_matsui", "met_saeki", "ido_qr_used", "gate_repaired", "genbei_drawing_found"]);
    expect(nambaArrivalSpawn((n) => s.get(n))).toBe("present_ido");
    expect(matsuiSpot((n) => s.get(n))).toBe("ido");
    expect(play(s, "ido").panel).toBe("record");
    expect(play(s, "saeki").dialogue).toBe("saeki_return_early");
    const m = play(s, "matsui");
    expect(m.dialogue).toBe("matsui_return");
    expect(m.matsuiTo).toBe("lab");
    expect(matsuiSpot((n) => s.get(n))).toBe("lab");
    expect(play(s, "matsui").dialogue).toBe("matsui_lab_wait");
    expect(s.get("drawing_confirmed")).toBe(false);
    const sa = play(s, "saeki");
    expect(sa.dialogue).toBe("saeki_fixture");
    expect(sa.matsuiTo).toBe("ido");
    expect(matsuiSpot((n) => s.get(n))).toBe("ido");
    expect(s.get("fixture_made")).toBe(true);
    expect(s.get("drawing_confirmed")).toBe(true);
    expect(s.timeline.future_route_open).toBe(true);
    const ido = play(s, "ido");
    expect(ido.panel).toBe("return");
    expect(ido.travel?.to).toBe("2086");
    expect(travelRule("2026", ido.travel!, (n) => s.get(n)).ok).toBe(true);
    expect(play(s, "matsui").dialogue).toBe("matsui_sendoff");
  });
});
