// 物語 v7 の 2086 年：町の人と量産型NEXMAXの台詞（chronicle/mob_lines_v7.json・mobTalkV7.ts）
import { describe, expect, it } from "vitest";
import type { Flags } from "../src/chronicle/progress";
import { bubbleLinesFor, talkLinesFor, type MobTable } from "../src/world/mobTalkLogic";
import { MOB_SLOTS_2086 } from "../src/stages/future2086/mobTalk2086";
import { UNIT_SPECS } from "../src/stages/future2086/units";
import { MOB_TABLE_V7, mobPhaseV7 } from "../src/stages/future2086/chronicle/mobTalkV7";

const T = MOB_TABLE_V7 as MobTable;
const flagsOf = (on: readonly string[]): Flags => {
  const s = new Set(on);
  return (n) => s.has(n);
};

describe("2086 年の町の人（v7）", () => {
  it("場面：1 度目の朝・くり返しの朝・昔が変わったあと・夕方・夜・10月19日", () => {
    expect(mobPhaseV7(flagsOf([]), "morning")).toBe("day1");
    expect(mobPhaseV7(flagsOf(["v7_rewind1"]), "morning")).toBe("loop");
    expect(mobPhaseV7(flagsOf(["v7_rewind1", "v7_back2"]), "morning")).toBe("changed");
    expect(mobPhaseV7(flagsOf(["v7_rewind1"]), "evening")).toBe("evening");
    expect(mobPhaseV7(flagsOf([]), "night")).toBe("night");
    expect(mobPhaseV7(flagsOf(["v7_ending"]), "morning")).toBe("epilogue");
  });

  it("広場の人と量産型は、みんな 1 度目の朝に話すことがある", () => {
    const ids = [...MOB_SLOTS_2086.map((s) => s.id), ...UNIT_SPECS.map((u) => u.id), "unit_keychain"];
    const lines = bubbleLinesFor(T, ids, "day1");
    ids.forEach((id, i) => expect(lines[i].length, id).toBeGreaterThan(0));
  });

  it("くり返しの朝は、町の人が一字一句同じことを言う（返事だけ変わる）", () => {
    for (const id of Object.keys(T.speakers)) {
      const a = bubbleLinesFor(T, [id], "day1")[0];
      const b = bubbleLinesFor(T, [id], "loop")[0];
      if (id === "staff") continue; // 中継アンテナの話は 1 度目だけ（くり返しの朝は大画面がついている）
      expect(b, id).toEqual(a);
      const t1 = talkLinesFor(T, id, "day1", 0);
      const t2 = talkLinesFor(T, id, "loop", 0);
      if (t1.length && t2.length) expect(t2[0], id).toEqual(t1[0]);
    }
  });

  it("吹き出しは 40 字まで、物語の先（トワ・オルム・時を裂く爪）は言わない", () => {
    for (const [id, sp] of Object.entries(T.speakers)) {
      for (const [ph, arr] of Object.entries(sp.bubble)) {
        for (const l of arr ?? []) {
          expect(l.length, `${id}/${ph}: ${l}`).toBeLessThanOrEqual(40);
          expect(/トワ|オルム|時を裂く爪|仮面/.test(l), `${id}/${ph}: ${l}`).toBe(false);
        }
      }
      for (const arr of Object.values(sp.talk ?? {})) for (const l of arr ?? []) expect(/トワ|オルム|時を裂く爪/.test(l.text), `${id}: ${l.text}`).toBe(false);
    }
  });
});
