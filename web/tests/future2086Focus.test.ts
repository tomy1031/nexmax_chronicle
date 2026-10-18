// 2086年のチュートリアルのカメラ（story の focus）と、夜空が割れる演出（emergence2086.ts）の純粋なロジック。
// ・レンズ・金具・吊り輪のステップに入るとカメラで目標を見せ、ソラの説明が続く
// ・進まないまま FOCUS_REPLAY_SEC 経つと短い版で見せ直す（会話中は数えない）
// ・「オルム」という名前は 2086年の台詞・目標に出さない
import { describe, expect, it } from "vitest";
import { FOCUS_REPLAY_SEC, Future2086Story, OBJECTIVES, STEP_HINTS, type StoryEffect, type StoryStepId } from "../src/stages/future2086/future2086Story";
import { EMERGENCE_CUES, EMERGENCE_TIME, emergenceAt, splitByCue } from "../src/stages/future2086/emergence2086";
import table from "../src/stages/future2086/dialogue_2086.json";

type Focus = Extract<StoryEffect, { kind: "focus" }>;
type Dlg = Extract<StoryEffect, { kind: "dialogue" }>;

const story = (start?: StoryStepId, loopCount = 0) => new Future2086Story({ start, loopCount }).record();
const focusOf = (e: StoryEffect[]) => e.filter((x): x is Focus => x.kind === "focus");
const lastDialogue = (e: StoryEffect[]) => e.filter((x): x is Dlg => x.kind === "dialogue").pop();

describe("チュートリアルのカメラ（focus）", () => {
  it("祭りの朝の会話のあと、レンズのケースを映してソラが取り方を説明する", () => {
    const s = story("talk_sora");
    s.send({ kind: "interact", target: "sora" });
    s.drain();
    s.send({ kind: "dialogue_done", key: "prep_talk" });
    const e = s.drain();
    expect(s.step).toBe("fetch_lens");
    expect(focusOf(e)).toEqual([{ kind: "focus", target: "lens", short: false }]);
    // カメラの直後に説明の会話（J・照準の話）
    const iF = e.findIndex((x) => x.kind === "focus");
    const iD = e.findIndex((x) => x.kind === "dialogue");
    expect(iD).toBeGreaterThan(iF);
    const d = lastDialogue(e)!;
    expect(d.key).toBe("tut_lens");
    expect(d.lines.some((l) => l.text.includes("J"))).toBe(true);
  });

  it("レンズのお礼のあとに金具、回廊に上がると光る輪を映す", () => {
    const s = story("fetch_lens");
    s.send({ kind: "claw", event: "object_arrived", targetId: "ido_lens" });
    expect(focusOf(s.drain())).toEqual([]);
    s.send({ kind: "dialogue_done", key: "lens_thanks" });
    let e = s.drain();
    expect(focusOf(e)).toEqual([{ kind: "focus", target: "hook", short: false }]);
    expect(lastDialogue(e)!.key).toBe("tut_hook");
    s.send({ kind: "zone", zone: "upper_walkway" });
    e = s.drain();
    expect(s.step).toBe("swing_gap");
    expect(focusOf(e)).toEqual([{ kind: "focus", target: "ring", short: false }]);
    expect(lastDialogue(e)!.key).toBe("walkway_up");
  });

  it("進まないまま時間が経つと、短い版で見せ直してヒントを言う（会話中は数えない）", () => {
    const s = story("climb_hook");
    s.drain();
    for (let t = 0; t < FOCUS_REPLAY_SEC - 1; t += 0.5) s.send({ kind: "tick", dt: 0.5 });
    expect(focusOf(s.drain())).toEqual([]);
    s.send({ kind: "tick", dt: 1.5 });
    const e = s.drain();
    expect(focusOf(e)).toEqual([{ kind: "focus", target: "hook", short: true }]);
    expect(lastDialogue(e)!.key).toBe("sora_hint_hook");
    // ヒントの会話が終わるまでは数えない
    for (let t = 0; t < FOCUS_REPLAY_SEC * 2; t += 1) s.send({ kind: "tick", dt: 1 });
    expect(focusOf(s.drain())).toEqual([]);
    s.send({ kind: "dialogue_done", key: "sora_hint_hook" });
    for (let t = 0; t < FOCUS_REPLAY_SEC + 1; t += 1) s.send({ kind: "tick", dt: 1 });
    expect(focusOf(s.drain()).length).toBe(1);
    expect(s.step).toBe("climb_hook");
  });

  it("ソラに話しかけてヒントを聞くと、見せ直しの時計は戻る。ステップが進めば数え直し", () => {
    const s = story("swing_gap");
    for (let t = 0; t < FOCUS_REPLAY_SEC - 5; t += 1) s.send({ kind: "tick", dt: 1 });
    s.send({ kind: "interact", target: "sora" });
    s.send({ kind: "dialogue_done", key: "sora_hint_swing" });
    expect(s.idleTime).toBe(0);
    for (let t = 0; t < 10; t += 1) s.send({ kind: "tick", dt: 1 });
    expect(focusOf(s.drain())).toEqual([]);
  });

  it("夜や他のステップでは見せ直さない。ループの後は短い版", () => {
    const s = story("evade");
    for (let t = 0; t < 30; t += 1) s.send({ kind: "tick", dt: 1 });
    expect(focusOf(s.drain())).toEqual([]);
    const l = story("talk_sora", 1);
    l.send({ kind: "interact", target: "sora" });
    l.send({ kind: "dialogue_done", key: "prep_talk" });
    expect(focusOf(l.drain())).toEqual([{ kind: "focus", target: "lens", short: true }]);
  });
});

describe("名前を知らない（オルムを出さない）", () => {
  it("2086年の台詞・目標・キー案内に「オルム」が出てこない", () => {
    for (const [k, v] of Object.entries(table)) {
      if (!Array.isArray(v)) continue;
      for (const l of v as Array<{ speaker: string; text: string }>) expect(l.text, k).not.toContain("オルム");
    }
    for (const o of Object.values(OBJECTIVES)) expect(o.title + o.sub).not.toContain("オルム");
    for (const h of Object.values(STEP_HINTS)) for (const x of h) expect(x.label).not.toContain("オルム");
  });

  it("出現の会話は「空が割れる」「正体不明の存在」で、合図（cue）が付いている", () => {
    const lines = table.orum_appear as Array<{ speaker: string; text: string; cue?: string }>;
    expect(lines.some((l) => l.text.includes("割れてる"))).toBe(true);
    expect(lines.some((l) => l.speaker === "都市システム" && l.text.includes("正体不明の存在"))).toBe(true);
    for (const l of lines) if (l.cue) expect(EMERGENCE_CUES[l.cue], l.cue).toBeTypeOf("number");
  });
});

describe("夜空が割れる演出の進み（emergenceAt・splitByCue）", () => {
  it("亀裂は段階的に広がって 1 に届き、開く瞬間に空の色が一気に変わる", () => {
    const T = EMERGENCE_TIME;
    expect(emergenceAt(0).crack).toBe(0);
    expect(emergenceAt(T.cracks[0] - 0.01).crack).toBe(0);
    let prev = 0;
    for (let t = 0; t < T.open; t += 0.05) {
      const c = emergenceAt(t).crack;
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = c;
    }
    expect(emergenceAt(T.open - 0.01).crack).toBeCloseTo(1, 1);
    expect(emergenceAt(T.open - 0.01).sky).toBe(0);
    expect(emergenceAt(T.open + 0.5).sky).toBe(1);
    expect(emergenceAt(T.open + 1).open).toBe(1);
  });

  it("閃光は亀裂・開く瞬間に強く、すぐ収まる", () => {
    const T = EMERGENCE_TIME;
    expect(emergenceAt(T.open + 0.02).flash).toBeGreaterThan(1);
    expect(emergenceAt(T.open + 0.9).flash).toBeLessThan(0.05);
    expect(emergenceAt(1).flash).toBe(0);
  });

  it("黒い環は虚無が開いてから押し出て広がり、終わりには明日の街が消えかけている", () => {
    const T = EMERGENCE_TIME;
    expect(emergenceAt(T.emerge - 0.01).show).toBe(0);
    expect(emergenceAt(T.emerge + T.emergeDur).show).toBeCloseTo(1, 5);
    const end = emergenceAt(T.end);
    expect(end.tomorrow).toBeLessThan(0.7);
    expect(end.dissolve).toBeGreaterThan(0.2);
    expect(T.end - T.cracks[0]).toBeGreaterThan(10);
    expect(T.end - T.cracks[0]).toBeLessThan(14);
  });

  it("会話の行を合図ごとに分ける（合図の無い行は前に続く）", () => {
    const c = splitByCue([
      { speaker: "A", text: "1" },
      { speaker: "B", text: "2", cue: "crack" },
      { speaker: "C", text: "3" },
      { speaker: "D", text: "4", cue: "alarm" },
    ]);
    expect(c.map((x) => x.cue)).toEqual(["calm", "crack", "alarm"]);
    expect(c[1].lines.map((l) => l.text)).toEqual(["2", "3"]);
    expect(Object.keys(c[1].lines[0])).toEqual(["speaker", "text"]);
  });
});
