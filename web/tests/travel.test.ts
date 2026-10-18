// 時空移動の状態機械と規則（game/travel.ts）
import { describe, expect, it } from "vitest";
import { TRAVEL_TIMING, TravelMachine, eraStage, isStageKey, stageEra, travelRule, type TravelRequest } from "../src/game/travel";

const flags = (...on: string[]) => (name: string) => on.includes(name);

describe("travelRule（移動は自由ではない）", () => {
  it("起動直後・debug・load は常に可", () => {
    expect(travelRule(null, { to: "2026", cause: "ido_qr" }, flags()).ok).toBe(true);
    expect(travelRule("1726", { to: "2086", cause: "debug" }, flags()).ok).toBe(true);
    expect(travelRule("2026", { to: "1726", cause: "load" }, flags()).ok).toBe(true);
  });

  it("2086→2026 は IDO 展示からだけ", () => {
    expect(travelRule("2086", { to: "2026", cause: "ido_exhibit" }, flags()).ok).toBe(true);
    expect(travelRule("2086", { to: "2026", cause: "return" }, flags()).ok).toBe(false);
  });

  it("2026→1726 は IDO の QR から、マツイ社長に会ったあとだけ", () => {
    expect(travelRule("2026", { to: "1726", cause: "ido_qr" }, flags()).ok).toBe(false);
    expect(travelRule("2026", { to: "1726", cause: "ido_qr" }, flags("met_matsui")).ok).toBe(true);
    expect(travelRule("2026", { to: "1726", cause: "return" }, flags("met_matsui")).ok).toBe(false);
  });

  it("1726→2026 は水門を直したあとの帰還だけ（1726年に QR は無い）", () => {
    expect(travelRule("1726", { to: "2026", cause: "return" }, flags()).ok).toBe(false);
    expect(travelRule("1726", { to: "2026", cause: "return" }, flags("gate_repaired")).ok).toBe(true);
    expect(travelRule("1726", { to: "2026", cause: "ido_qr" }, flags("gate_repaired")).ok).toBe(false);
  });

  it("2026→2086 は絵図の記録を確かめたあとの帰還だけ", () => {
    expect(travelRule("2026", { to: "2086", cause: "return" }, flags("gate_repaired")).ok).toBe(false);
    expect(travelRule("2026", { to: "2086", cause: "return" }, flags("drawing_confirmed")).ok).toBe(true);
  });

  it("1726→2086 の直行や同じ時代への移動はできない", () => {
    const v = travelRule("1726", { to: "2086", cause: "return" }, flags("gate_repaired", "drawing_confirmed"));
    expect(v.ok).toBe(false);
    expect(v.reason.length).toBeGreaterThan(0);
    expect(travelRule("2026", { to: "2026", cause: "return" }, flags("drawing_confirmed")).ok).toBe(false);
  });

  it("StageKey と時代 ID の変換", () => {
    expect(stageEra("1726")).toBe(1726);
    expect(eraStage(2086)).toBe("2086");
    expect(eraStage(0)).toBe(null);
    expect(isStageKey("2026")).toBe(true);
    expect(isStageKey("1999")).toBe(false);
    expect(isStageKey(2026)).toBe(false);
  });
});

describe("TravelMachine", () => {
  const req: TravelRequest = { to: "1726", cause: "ido_qr", spawn: "arrive" };

  it("outro → cover（読み込み）→ loaded → intro → done の順に進む", () => {
    const m = new TravelMachine();
    expect(m.busy).toBe(false);
    expect(m.cover).toBe(0);
    const v = m.start("2026", req, flags("met_matsui"));
    expect(v.ok).toBe(true);
    expect(m.phase).toBe("outro");
    expect(m.inputLocked).toBe(true);
    expect(m.tick(0).map((e) => e.kind)).toEqual(["started"]);
    // outro の途中：演出は 0→1
    expect(m.tick(TRAVEL_TIMING.outro / 2)).toEqual([]);
    expect(m.cover).toBeGreaterThan(0.4);
    expect(m.cover).toBeLessThan(0.6);
    const ev = m.tick(TRAVEL_TIMING.outro);
    expect(ev.map((e) => e.kind)).toEqual(["cover"]);
    expect(m.phase).toBe("loading");
    expect(m.cover).toBe(1);
    // 読み込み中は時間がたっても進まない
    expect(m.tick(5)).toEqual([]);
    expect(m.phase).toBe("loading");
    m.loaded();
    expect(m.phase).toBe("intro");
    expect(m.inputLocked).toBe(false);
    expect(m.tick(0).map((e) => e.kind)).toEqual(["revealed"]);
    m.tick(TRAVEL_TIMING.intro / 2);
    expect(m.cover).toBeGreaterThan(0.3);
    expect(m.cover).toBeLessThan(0.7);
    const done = m.tick(TRAVEL_TIMING.intro);
    expect(done.map((e) => e.kind)).toEqual(["done"]);
    expect(done[0].request).toEqual(req);
    expect(m.phase).toBe("idle");
    expect(m.request).toBe(null);
    expect(m.cover).toBe(0);
  });

  it("規則に合わない要求・移動中の要求は始まらない", () => {
    const m = new TravelMachine();
    expect(m.start("2026", req, flags()).ok).toBe(false);
    expect(m.phase).toBe("idle");
    expect(m.start("2026", req, flags("met_matsui")).ok).toBe(true);
    const second = m.start("2026", { to: "2086", cause: "debug" }, flags());
    expect(second.ok).toBe(false);
    expect(second.reason).toContain("移動中");
  });

  it("instant（起動直後の読み込み）は演出なしで loading から始まる", () => {
    const m = new TravelMachine();
    m.start(null, { to: "2026", cause: "load" }, flags(), true);
    expect(m.phase).toBe("loading");
    expect(m.tick(0).map((e) => e.kind)).toEqual(["started", "cover"]);
    m.loaded();
    expect(m.phase).toBe("intro");
  });

  it("loaded は loading 中だけ効き、abort で元に戻る", () => {
    const m = new TravelMachine();
    m.loaded();
    expect(m.phase).toBe("idle");
    m.start("2026", req, flags("met_matsui"));
    m.loaded();
    expect(m.phase).toBe("outro");
    m.abort();
    expect(m.phase).toBe("idle");
    expect(m.busy).toBe(false);
  });

  it("大きな dt でも 1 回の tick で段階を飛ばしすぎない（outro → loading で止まる）", () => {
    const m = new TravelMachine();
    m.start("2026", req, flags("met_matsui"));
    m.tick(100);
    expect(m.phase).toBe("loading");
  });
});
