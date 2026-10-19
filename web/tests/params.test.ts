// URL パラメータ（game/params.ts）と会話の待ち行列（game/dialogueQueue.ts）
import { describe, expect, it } from "vitest";
import { parseGameParams } from "../src/game/params";
import { DialogueQueue, lineDuration } from "../src/game/dialogueQueue";
import d2026 from "../src/data/dialogue_2026.json";
import d1726 from "../src/data/dialogue_1726.json";
import { DialogueDB } from "../src/core/dialogue";
import { nambaBeat } from "../src/stages/namba2026/script";
import { StoryState } from "../src/core/storyFlags";

describe("parseGameParams", () => {
  it("stage / spawn / flags / continue を読み、不正な stage は null", () => {
    const p = parseGameParams("?stage=2026&spawn=present_ido&flags=met_matsui,%20gate_repaired,,loop_count=2&continue&nohud");
    expect(p.stage).toBe("2026");
    expect(p.spawn).toBe("present_ido");
    expect(p.flags).toEqual(["met_matsui", "gate_repaired", "loop_count=2"]);
    expect(p.continue).toBe(true);
    expect(p.nohud).toBe(true);
    expect(p.newGame).toBe(false);
    expect(parseGameParams("?stage=1999").stage).toBe(null);
    expect(parseGameParams("").flags).toEqual([]);
    expect(parseGameParams("?shot=05").shot).toBe("05");
  });

  it("タイトル画面は、開始の指定が無いときだけ", () => {
    expect(parseGameParams("").title).toBe(true);
    expect(parseGameParams("?quality=low&fps=30").title).toBe(true);
    expect(parseGameParams("?stage=1970").title).toBe(false);
    expect(parseGameParams("?continue").title).toBe(false);
    expect(parseGameParams("?notitle").title).toBe(false);
  });
});

describe("DialogueQueue", () => {
  it("文字数で表示時間が決まり（上下限あり）、自動で次へ進む", () => {
    expect(lineDuration("あ")).toBeCloseTo(2.4);
    expect(lineDuration("あ".repeat(200))).toBeCloseTo(6.5);
    const q = new DialogueQueue([
      { speaker: "A", text: "一行目" },
      { speaker: "B", text: "二行目" },
    ]);
    expect(q.current).toBe(null);
    expect(q.start()?.speaker).toBe("A");
    expect(q.tick(1)).toBe(null);
    expect(q.tick(5)?.speaker).toBe("B");
    expect(q.done).toBe(false);
    expect(q.advance()).toBe(null);
    expect(q.done).toBe(true);
    expect(q.tick(1)).toBe(null);
  });

  it("空の会話はすぐ終わる", () => {
    const q = new DialogueQueue([]);
    expect(q.start()).toBe(null);
    expect(q.done).toBe(true);
  });
});

describe("dialogue_2026.json / dialogue_1726.json", () => {
  const db26 = new DialogueDB(d2026);
  const db17 = new DialogueDB(d1726);

  it("全キーに speaker と text がある", () => {
    for (const db of [db26, db17]) {
      for (const k of db.keys()) {
        const lines = db.lines(k);
        expect(lines.length, k).toBeGreaterThan(0);
        for (const l of lines) {
          expect(l.speaker.length, k).toBeGreaterThan(0);
          expect(l.text.length, k).toBeGreaterThan(0);
        }
      }
    }
  });

  it("2026年の進行で使う会話はすべて揃っている（全フラグの組み合わせ）", () => {
    const names = ["met_matsui", "met_saeki", "gate_repaired", "genbei_story_told", "fixture_made", "drawing_confirmed"];
    for (let mask = 0; mask < 1 << names.length; mask++) {
      const s = new StoryState();
      names.forEach((n, i) => s.set(n, (mask & (1 << i)) !== 0));
      for (const actor of ["matsui", "saeki", "ido"] as const) {
        const b = nambaBeat(actor, (n) => s.get(n));
        expect(db26.has(b.dialogue), `${actor} mask=${mask} → ${b.dialogue}`).toBe(true);
      }
    }
  });

  it("仕様の台詞（§5.1・§5.3・§10）と佐伯の台詞が入っている", () => {
    const all = db26.keys().flatMap((k) => db26.lines(k).map((l) => l.text));
    // 導入編の改訂（docs/シナリオ改訂案_導入編_v1.md 6-2・6-6）：社長のほうから気づく／こっちの IDO が帰る手がかり
    expect(all).toContain("もしかして……君、ネクマックス？");
    expect(all.some((t) => t.includes("こっちのIDOが帰る手がかりになるかもしれん"))).toBe(true);
    expect(all).toContain("できることが一つ増えたな。");
    expect(all.some((t) => t.includes("ここだけなら、今の道具で直せます。"))).toBe(true);
    expect(db17.lines("genbei_first_meet")[0].text).toBe("お前、また来たんか！");
  });
});
