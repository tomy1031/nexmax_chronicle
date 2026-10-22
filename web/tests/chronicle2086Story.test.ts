// 物語 v7 の 2086 年の本編（stages/future2086/chronicle/story2086.ts・stage.ts・lines_v7.json）
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V7_FLAGS, chapterOf, lightsLeft, type Flags } from "../src/chronicle/progress";
import {
  OBJECTIVES,
  STEPS_2086,
  arrivalFlag,
  dayLabel,
  dayPartOf,
  defaultPhase,
  dialVisible,
  lensMounted,
  morningOf,
  musicOf,
  objectiveOf,
  screenOn,
  siteVariantOf,
  spawnFor,
  step2086,
  type Step2086,
} from "../src/stages/future2086/chronicle/story2086";
import { CHRONICLE_SPOTS } from "../src/stages/future2086/chronicle/layoutChronicle";
import lines from "../src/stages/future2086/chronicle/lines_v7.json";

const flagsOf = (on: readonly string[]): Flags => {
  const s = new Set(on);
  return (n) => s.has(n);
};

/** 物語の順に立つフラグ（2086 年の外の章も、その順で） */
const ORDER: readonly string[] = V7_FLAGS;
const upTo = (last: string): Flags => flagsOf(ORDER.slice(0, ORDER.indexOf(last) + 1));

const TABLE = lines as Record<string, unknown>;
const STAGE_SRC = readFileSync(resolve(__dirname, "../src/stages/future2086/chronicle/stage.ts"), "utf8");

describe("2086 年の段階（フラグだけから）", () => {
  it("はじめは prologue、全部おわれば done", () => {
    expect(step2086(flagsOf([]))).toBe("prologue");
    expect(step2086(flagsOf(ORDER))).toBe("done");
  });

  it("フラグを物語の順に立てていくと、段階は前へだけ進む", () => {
    let last = 0;
    for (const k of ORDER) {
      const s = step2086(upTo(k));
      const i = STEPS_2086.indexOf(s);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it("2086 年の段階は全部どこかで出てくる", () => {
    const seen = new Set<Step2086>([step2086(flagsOf([]))]);
    for (const k of ORDER) seen.add(step2086(upTo(k)));
    // 帰還の直後（到着のフラグを立てる前）の段階
    for (const s of STEPS_2086) expect(seen.has(s), s).toBe(true);
  });

  it("1 章のお使い：レンズ → 中継アンテナ（開場）→ QR の見せ場 → キーホルダー", () => {
    expect(step2086(upTo("v7_lens_done"))).toBe("ch1_antenna");
    expect(step2086(upTo("v7_antenna_done"))).toBe("ch1_qr");
    expect(step2086(upTo("v7_qr_demo"))).toBe("ch1_keychain");
    // 一度目の 10月18日は、レンズをわたしたあとはずっとはまっている。大画面は、アンテナをつなぐまで「映像信号なし」
    expect(lensMounted("ch1_antenna", false)).toBe(true);
    expect(lensMounted("ch2_night", false)).toBe(true);
    expect(screenOn("ch1_antenna", false)).toBe(false);
    expect(screenOn("ch1_antenna", true)).toBe(true);
    expect(screenOn("ch3_morning", false)).toBe(true);
    expect(defaultPhase("ch1_antenna")).toBe("antenna_hook");
    expect(defaultPhase("ch5_door")).toBe("qr_door");
  });

  it("おもな切りかわり", () => {
    expect(step2086(upTo("v7_prologue_seen"))).toBe("ch1_booth");
    expect(step2086(upTo("v7_promise"))).toBe("ch2_night");
    expect(step2086(upTo("v7_rewind1"))).toBe("ch3_morning");
    expect(step2086(upTo("v7_rewind3"))).toBe("ch5_confide");
    expect(step2086(upTo("v7_door1"))).toBe("ch5_door");
    expect(step2086(upTo("v7_claw_stored"))).toBe("ch8_back");
    expect(step2086(upTo("v7_dial_seen"))).toBe("ch8_dial");
    expect(step2086(upTo("v7_shrine_saved"))).toBe("ch10_shrine");
    expect(step2086(upTo("v7_towa_duel"))).toBe("ch10_travel");
    expect(step2086(upTo("v7_khmer_done"))).toBe("ch12_back");
    expect(step2086(upTo("v7_hands_cut"))).toBe("ch12_ura");
    expect(step2086(upTo("v7_orm_down"))).toBe("ch12_ending");
    expect(step2086(upTo("v7_ending"))).toBe("epilogue");
  });

  it("帰還のフラグは、行った先のしめくくりのあとに 1 回だけ", () => {
    expect(arrivalFlag(upTo("v7_door1"))).toBeNull();
    expect(arrivalFlag(upTo("v7_claw_stored"))).toBe("v7_back1");
    expect(arrivalFlag(upTo("v7_back1"))).toBeNull();
    expect(arrivalFlag(upTo("v7_shrine_saved"))).toBe("v7_back2");
    expect(arrivalFlag(upTo("v7_back2"))).toBeNull();
    expect(arrivalFlag(upTo("v7_khmer_done"))).toBe("v7_back3");
    expect(arrivalFlag(upTo("v7_back3"))).toBeNull();
  });

  it("光のつぶ：はじめ 7、オルムをたおすと 0", () => {
    expect(lightsLeft(flagsOf([]))).toBe(7);
    expect(lightsLeft(upTo("v7_rewind3"))).toBe(4);
    expect(lightsLeft(upTo("v7_back3"))).toBe(1);
    expect(lightsLeft(upTo("v7_orm_down"))).toBe(0);
  });

  it("章：約束のあとは 2 章、二度目の朝は 3 章、結末は 13（おわりに）", () => {
    expect(chapterOf(upTo("v7_promise"))).toBe(2);
    expect(chapterOf(upTo("v7_rewind1"))).toBe(3);
    expect(chapterOf(upTo("v7_loop_seen"))).toBe(4);
    expect(chapterOf(upTo("v7_rewind3"))).toBe(5);
    expect(chapterOf(upTo("v7_ending"))).toBe(13);
  });
});

describe("段階ごとの場所・時間帯・曲・目標", () => {
  const SPOTS = new Set([
    "start",
    "booth",
    "exhibit",
    "night_plaza",
    "arrive_from_2026",
    "loop_morning",
    ...Object.keys(CHRONICLE_SPOTS),
  ]);

  it("到着地点は scene の spawns か CHRONICLE_SPOTS のどれか", () => {
    for (const s of STEPS_2086) expect(SPOTS.has(spawnFor(s)), s).toBe(true);
    for (const a of ["v7_from_1726", "v7_from_2026", "v7_from_1186"]) expect(spawnFor("ch8_back", a)).toBe("arrive_from_2026");
  });

  it("夜の段階（2 章・12 章の夜）と夕方（決闘・1186 へ・12 章の帰還）", () => {
    expect(dayPartOf("ch2_night")).toBe("night");
    expect(dayPartOf("ch12_ura")).toBe("night");
    expect(dayPartOf("ch10_duel")).toBe("evening");
    expect(dayPartOf("ch1_booth")).toBe("morning");
    expect(musicOf("prologue", "morning")).toBe("title");
    expect(musicOf("ch2_night", "night")).toBe("night2086");
    expect(musicOf("epilogue", "morning")).toBe("dawn");
  });

  it("何度目の朝：ループのたびに 1 ずつふえる", () => {
    expect(morningOf("ch1_booth", flagsOf([]))).toBe(1);
    expect(morningOf("ch3_morning", upTo("v7_rewind1"))).toBe(2);
    expect(morningOf("ch4_tower", upTo("v7_rewind2"))).toBe(3);
    expect(morningOf("ch5_confide", upTo("v7_rewind3"))).toBe(4);
    expect(morningOf("ch8_back", upTo("v7_back1"))).toBe(0);
    expect(dayLabel(1)).toBe("10月18日");
    expect(dayLabel(3)).toBe("3度目の、10月18日");
  });

  it("跡地は、ほこらを守ってから中庭。ダイヤルは江戸から帰ってから", () => {
    expect(siteVariantOf(upTo("v7_dial_seen"))).toBe("building");
    expect(siteVariantOf(upTo("v7_shrine_saved"))).toBe("courtyard");
    expect(dialVisible(upTo("v7_claw_stored"))).toBe(false);
    expect(dialVisible(upTo("v7_back1"))).toBe(true);
    expect(lensMounted("ch3_morning", false)).toBe(false);
    expect(lensMounted("ch8_back", false)).toBe(true);
  });

  it("どの段階にも、はじめの目標がある", () => {
    for (const s of STEPS_2086) {
      const ph = defaultPhase(s);
      expect(OBJECTIVES[ph], `${s} → ${ph}`).toBeDefined();
      expect(objectiveOf(ph).title.length).toBeGreaterThan(0);
    }
  });

  it("ステージが使う目標（setPhase）は全部ある", () => {
    const used = new Set<string>();
    for (const m of STAGE_SRC.matchAll(/setPhase\('([a-z0-9_]+)'/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(20);
    for (const k of used) expect(OBJECTIVES[k], k).toBeDefined();
  });
});

describe("台詞（lines_v7.json）", () => {
  /** stage.ts が使う台詞のキー（talk・talkShot・L・touchAndLoop・showRecord の行の、英小文字の文字列） */
  const usedKeys = (): Set<string> => {
    const out = new Set<string>();
    for (const line of STAGE_SRC.split("\n")) {
      if (!/talk\(rt,|talkShot\(rt,|this\.L\(|touchAndLoop\(rt,|showRecord\(|\['mem_/.test(line)) continue;
      for (const m of line.matchAll(/'([a-z][a-z0-9_]*)'/g)) if (!m[1].startsWith("v7_")) out.add(m[1]);
    }
    for (let d = 1; d <= 4; d++) out.add(`morning${d}`);
    return out;
  };

  it("ステージが使うキーは全部ある", () => {
    const keys = usedKeys();
    expect(keys.size).toBeGreaterThan(60);
    for (const k of keys) expect(Array.isArray(TABLE[k]), k).toBe(true);
  });

  it("どの台詞も、話す人と短い文（子どもが読める長さ）", () => {
    for (const [k, v] of Object.entries(TABLE)) {
      if (k.startsWith("_")) continue;
      expect(Array.isArray(v), k).toBe(true);
      for (const l of v as { speaker: string; text: string }[]) {
        expect(typeof l.speaker, k).toBe("string");
        expect(l.text.length, `${k}: ${l.text}`).toBeGreaterThan(0);
        expect(l.text.length, `${k}: ${l.text}`).toBeLessThanOrEqual(90);
      }
    }
  });
});
