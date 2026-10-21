// 2026年 なんば（物語 v7 の 6・9 章）の進み方（stages/namba2026/chronicle/storyNamba.ts）と、
// 場面（stage.ts・defenseDirector.ts）が使う会話のキー・フラグがそろっていることを、シーン無しで確かめる。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KANBAN_RECORD,
  NAMBA_V7_LINE_KEYS,
  NAMBA_V7_STEPS,
  STEP_SPAWN,
  STEP_TIME,
  combatStep,
  nambaV7Objective,
  nambaV7Step,
  stepMusic,
  type NambaV7Step,
} from "../src/stages/namba2026/chronicle/storyNamba";
import { V7_SPAWNS } from "../src/stages/namba2026/chronicle/layoutV7";
import { ALLEY_PHASES } from "../src/stages/namba2026/chronicle/alleyTime";
import { IDO_RECORDS, recordOfKanban } from "../src/stages/namba2026/chronicle/idoSearchLogic";
import { V7_FLAGS, chapterOf } from "../src/chronicle/progress";
import table from "../src/stages/namba2026/chronicle/lines_v7.json";

type Line = { speaker: string; text: string };
const book = table as unknown as Record<string, Line[]>;

const flags = (list: string[]) => (n: string) => list.includes(n);

/** 6 章の前までに立っているフラグ（2086 → 1186 → 2086 の扉まで） */
const BEFORE6 = ["v7_prologue_seen", "v7_promise", "v7_rewind1", "v7_loop_seen", "v7_rewind3", "v7_door1"];
/** 9 章の前まで（6〜8 章：2026 → 1726 → 2086 のダイヤル） */
const BEFORE9 = [...BEFORE6, "v7_beast_down", "v7_sketch_seen", "v7_search_done", "v7_back1", "v7_dial_seen"];

const src = (p: string) => readFileSync(new URL(`../src/stages/namba2026/chronicle/${p}`, import.meta.url), "utf8");

describe("段階はフラグだけから（6 章）", () => {
  it("かんばんから出る → 影獣 → 社長の絵 → IDO 検索 → 路地のかんばん", () => {
    const seq: Array<[string[], NambaV7Step]> = [
      [BEFORE6, "arrive"],
      [[...BEFORE6, "v7_beast_down"], "sketch"],
      [[...BEFORE6, "v7_beast_down", "v7_sketch_seen"], "search"],
      [[...BEFORE6, "v7_beast_down", "v7_sketch_seen", "v7_search_done"], "depart"],
    ];
    for (const [f, step] of seq) expect(nambaV7Step(flags(f))).toBe(step);
  });

  it("江戸から 2086 へ帰ったあと（8 章）は between、ダイヤルを見たら 9 章", () => {
    const back = [...BEFORE6, "v7_beast_down", "v7_sketch_seen", "v7_search_done", "v7_back1"];
    expect(nambaV7Step(flags(back))).toBe("between");
    expect(nambaV7Step(flags([...back, "v7_dial_seen"]))).toBe("shrine_talk");
  });

  it("6 章の段階は、どれも 6 章（章のとびらはフラグから）", () => {
    expect(chapterOf(flags(BEFORE6))).toBe(6);
    expect(chapterOf(flags([...BEFORE6, "v7_beast_down", "v7_sketch_seen"]))).toBe(6);
    // 路地のかんばんを見つけたら 7 章（江戸へ行く）
    expect(chapterOf(flags([...BEFORE6, "v7_search_done"]))).toBe(7);
  });
});

describe("段階はフラグだけから（9 章）", () => {
  it("着く → ほこら → 夜の防衛 → 朝・帰りの光", () => {
    expect(nambaV7Step(flags(BEFORE9))).toBe("shrine_talk");
    expect(nambaV7Step(flags([...BEFORE9, "v7_shrine_talk"]))).toBe("defense");
    expect(nambaV7Step(flags([...BEFORE9, "v7_shrine_talk", "v7_shrine_saved"]))).toBe("return");
    expect(chapterOf(flags([...BEFORE9, "v7_shrine_talk", "v7_shrine_saved"]))).toBe(9);
  });

  it("ダイヤルを見る前に 9 章のフラグだけ立っても、9 章にはならない（江戸のあとの居場所）", () => {
    const back = [...BEFORE6, "v7_beast_down", "v7_sketch_seen", "v7_search_done", "v7_back1", "v7_shrine_talk"];
    expect(nambaV7Step(flags(back))).toBe("between");
  });
});

describe("段階ごとの決まり", () => {
  it("どの段階にも、到着地点・時間・目標がある", () => {
    for (const s of NAMBA_V7_STEPS) {
      expect(V7_SPAWNS[STEP_SPAWN[s]], s).toBeTruthy();
      expect(ALLEY_PHASES).toContain(STEP_TIME[s]);
      const o = nambaV7Objective(s);
      expect(o.title.length).toBeGreaterThan(0);
      expect(o.title.length).toBeLessThanOrEqual(24);
    }
  });

  it("戦えるのは影獣の戦いと夜の防衛だけ。夜は夜の曲", () => {
    expect(NAMBA_V7_STEPS.filter(combatStep)).toEqual(["arrive", "defense"]);
    expect(stepMusic("defense")).toBe("night2086");
    expect(stepMusic("arrive")).toBe("present2026");
  });

  it("9 章は夕方に着いて、夜に守り、朝に帰る", () => {
    expect(STEP_TIME.shrine_talk).toBe("dusk");
    expect(STEP_TIME.defense).toBe("night");
    expect(STEP_TIME.return).toBe("dawn");
  });

  it("目標は場面の状態で変わる（よろいの残り・佐伯さん・調べた数・大きな影）", () => {
    expect(nambaV7Objective("arrive", { fight: { plates: 2, grabbed: false } }).sub).toContain("あと 2 枚");
    expect(nambaV7Objective("arrive", { fight: { plates: 1, grabbed: true } }).title).toContain("佐伯さん");
    expect(nambaV7Objective("arrive", { fight: { plates: 0, grabbed: false } }).title).toContain("K");
    expect(nambaV7Objective("search", { searchOpen: true, checked: 2 }).title).toContain("2/3");
    expect(nambaV7Objective("defense", { defense: "big_dark" }).sub).toContain("F");
    expect(nambaV7Objective("defense", { defense: "big_lit" }).sub).toContain("J");
    expect(nambaV7Objective("return", { ringOpen: true }).sub).toContain("2086");
  });

  it("町のかんばん B・C・D は、IDO の記録とつながっている", () => {
    for (const [k, id] of Object.entries(KANBAN_RECORD)) {
      expect(IDO_RECORDS.some((r) => r.id === id)).toBe(true);
      expect(recordOfKanban(k as "b" | "c" | "d")?.id).toBe(id);
    }
  });
});

describe("会話のキー・フラグ", () => {
  it("段階ごとの会話のキーは、lines_v7.json に全部ある", () => {
    for (const k of NAMBA_V7_LINE_KEYS) expect(book[k], k).toBeTruthy();
  });

  it("場面のコードが使う会話のキーは、どれも lines_v7.json にある", () => {
    const code = src("stage.ts") + src("defenseDirector.ts");
    const used = new Set<string>();
    for (const m of code.matchAll(/lines\.lines\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
    for (const m of code.matchAll(/say\?\.\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(30);
    for (const k of used) expect(book[k], k).toBeTruthy();
  });

  it("会話は短く（1 行 52 字まで）、話す人は決まった人だけ", () => {
    const speakers = new Set(["ネクマックス", "マツイ社長", "佐伯", "おふじ"]);
    for (const [k, list] of Object.entries(book)) {
      expect(list.length, k).toBeGreaterThan(0);
      for (const l of list) {
        expect(speakers.has(l.speaker), `${k}: ${l.speaker}`).toBe(true);
        expect(l.text.length, `${k}: ${l.text}`).toBeLessThanOrEqual(52);
      }
    }
  });

  it("場面が読む・立てるフラグは、どれも物語 v7 のフラグ", () => {
    const code = src("stage.ts") + src("storyNamba.ts") + src("defenseDirector.ts");
    const used = new Set([...code.matchAll(/(?:story\.set|story\.get|\bf)\('(v7_[a-z0-9_]+)'/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(6);
    const known = new Set<string>(V7_FLAGS);
    expect([...used].filter((k) => !known.has(k))).toEqual([]);
  });
});
