// 物語 v7.1 の 6 章：よろいの影獣（stages/namba2026/chronicle/beastLogic.ts）の決まりと、
// 戦いの場（水辺の広場・柱）、町の人の台詞（mob_lines_v7.json）を、シーン無しで確かめる。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BEAST_TUNING as T,
  beastObjective,
  beastStep,
  chargeHits,
  firstPillarOnPath,
  nextMove,
  ringHits,
  telegraphLocked,
} from "../src/stages/namba2026/chronicle/beastLogic";
import { DECK, PILLARS } from "../src/stages/namba2026/chronicle/layoutV7";
import { NAMBA_V7_STEPS } from "../src/stages/namba2026/chronicle/storyNamba";
import { mobPhaseV7, MOB_STAFF_V7, MOB_WALKERS_V7, MOB_TABLE_V7 } from "../src/stages/namba2026/chronicle/mobTalkV7";
import { bubbleLinesFor, talkLinesFor } from "../src/world/mobTalkLogic";
import table from "../src/stages/namba2026/chronicle/lines_v7.json";

const book = table as unknown as Record<string, Array<{ speaker: string; text: string }>>;
const src = (p: string) => readFileSync(new URL(`../src/stages/namba2026/chronicle/${p}`, import.meta.url), "utf8");

describe("突進と柱", () => {
  const pillars = [
    { x: 0, z: -6, r: 0.2 },
    { x: 3, z: -3, r: 0.2 },
  ];
  it("道すじの上の柱にぶつかる（手前の柱が先）", () => {
    const hit = firstPillarOnPath(0, 0, 0, -1, 20, pillars, T.bodyR);
    expect(hit?.i).toBe(0);
    expect(hit!.d).toBeCloseTo(6 - (0.2 + T.bodyR), 5);
  });
  it("体の幅より横にずれていれば、ぶつからない", () => {
    expect(firstPillarOnPath(1.5, 0, 0, -1, 20, pillars, T.bodyR)).toBeNull();
    expect(firstPillarOnPath(1.0, 0, 0, -1, 20, pillars, T.bodyR)?.i).toBe(0);
  });
  it("うしろの柱・届かない柱にはぶつからない", () => {
    expect(firstPillarOnPath(0, 0, 0, 1, 20, pillars, T.bodyR)).toBeNull();
    expect(firstPillarOnPath(0, 0, 0, -1, 3, pillars, T.bodyR)).toBeNull();
  });
  it("突進が当たるのは、獣の前の体の幅の中だけ", () => {
    expect(chargeHits(0.5, 0, T.bodyR)).toBe(true);
    expect(chargeHits(0.5, 1.6, T.bodyR)).toBe(false);
    expect(chargeHits(3, 0, T.bodyR)).toBe(false);
    expect(chargeHits(-1, 0, T.bodyR)).toBe(false);
  });
});

describe("子どもの物差し（予告から当たりまで 1.2 秒以上・ハート 1 つ）", () => {
  it("突進の予告（前足で地面をかく・赤い帯）は 1.2 秒以上。向きが決まってから走り出すまでも 0.6 秒以上", () => {
    for (let i = 0; i < 2; i++) {
      expect(T.charge.paw[i]).toBeGreaterThanOrEqual(1.2);
      expect(T.charge.lockBefore[i]).toBeGreaterThanOrEqual(0.6);
      expect(telegraphLocked(T.charge.paw[i] - T.charge.lockBefore[i] - 0.01, T.charge.paw[i], T.charge.lockBefore[i])).toBe(false);
      expect(telegraphLocked(T.charge.paw[i] - T.charge.lockBefore[i], T.charge.paw[i], T.charge.lockBefore[i])).toBe(true);
    }
  });
  it("ひっかき・とびかかりの構えも 1.2 秒以上", () => {
    expect(T.scratch.windup).toBeGreaterThanOrEqual(1.2);
    expect(T.pounce.windup).toBeGreaterThanOrEqual(1.2);
  });
  it("衝撃の輪は、跳んでいればよけられる", () => {
    expect(ringHits(3, 3.1, 0)).toBe(true);
    expect(ringHits(3, 3.1, 0.6)).toBe(false);
    expect(ringHits(3, 5, 0)).toBe(false);
  });
  it("板 3 枚を投げ返すと、体力は半分くらい。のこりはパンチ 2 回分ほど", () => {
    const left = T.hp - 3 * T.throwDamage;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(8);
  });
  it("気絶の間に板をはがせる（ゆるむ秒は気絶より長い）", () => {
    expect(T.crash.loose).toBeGreaterThanOrEqual(T.crash.stun);
    expect(T.crash.stun).toBeGreaterThanOrEqual(3);
  });
});

describe("勝ち方の手順と目標の欄", () => {
  it("① 突進 → ② はがす → ③ 投げる → ④ パンチ。佐伯さんがつかまったら助けるのが先", () => {
    expect(beastStep({ plates: 3, loose: false, holding: false, grabbed: false })).toBe("charge");
    expect(beastStep({ plates: 3, loose: true, holding: false, grabbed: false })).toBe("strip");
    expect(beastStep({ plates: 2, loose: false, holding: true, grabbed: false })).toBe("throw");
    expect(beastStep({ plates: 0, loose: false, holding: false, grabbed: false })).toBe("punch");
    expect(beastStep({ plates: 0, loose: false, holding: false, grabbed: true })).toBe("rescue");
  });
  it("目標の欄は ①〜④ の番号と、よろいの残り。2 回はずれたら柱の前で待つヒント", () => {
    expect(beastObjective("charge", 3).title).toContain("①");
    expect(beastObjective("charge", 2).sub).toContain("あと 2 枚");
    expect(beastObjective("charge", 2, T.hintAfterMisses).sub).toContain("柱の前");
    expect(beastObjective("strip", 2).title).toContain("J");
    expect(beastObjective("throw", 2).title).toContain("投げ");
    expect(beastObjective("punch", 0).title).toContain("K");
    for (const s of ["charge", "strip", "throw", "punch", "rescue"] as const) expect(beastObjective(s, 1).title.length).toBeLessThanOrEqual(24);
  });
  it("よろいがある間は突進（近すぎればひっかく）。おこったら、とびかかりと突進をかわりばんこ", () => {
    expect(nextMove({ armored: true, dist: 6, scratchReady: true, last: null })).toBe("charge");
    expect(nextMove({ armored: true, dist: 2, scratchReady: true, last: null })).toBe("scratch");
    expect(nextMove({ armored: true, dist: 2, scratchReady: false, last: null })).toBe("charge");
    expect(nextMove({ armored: false, dist: 6, scratchReady: true, last: "charge" })).toBe("pounce");
    expect(nextMove({ armored: false, dist: 6, scratchReady: true, last: "pounce" })).toBe("charge");
  });
});

describe("水辺の広場と柱", () => {
  it("広場は水路へ張り出し（南岸の遊歩道とあわせて、たて 10m 以上）", () => {
    expect(DECK.z0).toBeLessThan(2);
    expect(11 - DECK.z0).toBeGreaterThanOrEqual(10);
    expect(DECK.x1 - DECK.x0).toBeGreaterThanOrEqual(24);
  });
  it("柱は 6 本以上、広場のあちこちに（どこにいても 8m 以内に柱がある）", () => {
    expect(PILLARS.length).toBeGreaterThanOrEqual(6);
    for (let x = DECK.x0 + 1; x < DECK.x1; x += 2) {
      for (let z = DECK.z0 + 0.5; z < 10.5; z += 2) {
        const d = Math.min(...PILLARS.map((p) => Math.hypot(p.pos.x - x, p.pos.z - z)));
        expect(d, `${x},${z}`).toBeLessThan(8);
      }
    }
  });
});

describe("台詞", () => {
  it("影獣の戦いの台詞（beastFight.ts・stage.ts の sayLines）は、どれも lines_v7.json にある", () => {
    const code = src("beastFight.ts") + src("stage.ts");
    const used = new Set<string>();
    for (const m of code.matchAll(/'(beast_[a-z0-9_]+)'/g)) used.add(m[1]);
    for (const m of code.matchAll(/sayLines\('([a-z0-9_]+)'\)/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(15);
    for (const k of used) expect(book[k], k).toBeTruthy();
  });
  it("社長のパラドックス（本文 6 章の言い回し）", () => {
    const all = Object.values(book).flat().map((l) => l.text).join("\n");
    expect(all).toContain("それ、僕がノートにこっそり書いとる名前やで！");
    expect(all).toContain("作ってへんのに、もう、できとる");
    expect(all).toContain("本人の前で見せるの、めっちゃはずかしいな！");
    expect(all).toContain("あかん、頭がこんがらがってきた");
    expect(all).toContain("社長、落ち着いてください");
    expect(all).toContain("（トワのランプの影だ……！ ぼくを追いかけて、来たんだ）");
    expect(all).toContain("おお、帰れたんか！ ……って、また来たんか？");
  });
});

describe("町の人と話す（mob_lines_v7.json）", () => {
  const ids = [...MOB_WALKERS_V7.map((m) => m.id), ...MOB_STAFF_V7];
  it("話す人は、みんな台詞の表にいる", () => {
    for (const id of ids) expect(MOB_TABLE_V7.speakers[id], id).toBeTruthy();
  });
  it("影獣のあと・夕方・朝の場面で、みんな何か言う。吹き出しは 40 字まで", () => {
    for (const phase of ["after", "dusk", "dawn"]) {
      const b = bubbleLinesFor(MOB_TABLE_V7, ids, phase);
      b.forEach((list, i) => {
        expect(list.length, `${ids[i]} ${phase}`).toBeGreaterThan(0);
        for (const t of list) expect([...t].length, t).toBeLessThanOrEqual(40);
      });
      for (const id of ids) expect(talkLinesFor(MOB_TABLE_V7, id, phase, 0).length).toBeGreaterThan(0);
    }
  });
  it("段階 → 場面：戦う前は黙る、9 章は夕方と朝", () => {
    expect(mobPhaseV7("arrive")).toBe("before");
    expect(bubbleLinesFor(MOB_TABLE_V7, ids, "before").every((l) => l.length === 0)).toBe(true);
    expect(mobPhaseV7("search")).toBe("after");
    expect(mobPhaseV7("shrine_talk")).toBe("dusk");
    expect(mobPhaseV7("return")).toBe("dawn");
    for (const s of NAMBA_V7_STEPS) expect(typeof mobPhaseV7(s)).toBe("string");
  });
  it("影獣のあとの「さっきの、なんやったん？」がある", () => {
    const all = JSON.stringify(MOB_TABLE_V7);
    expect(all).toContain("さっきの、なんやったん？");
  });
});
