// 目標の目印（src/game/objectiveMarker.ts）の置き場所：画面の中ならそのまま、外・後ろなら縁に寄せて向きを示す。
// 回想（introOverlay2086.ts）の行の時刻も見る。
import { describe, expect, it } from "vitest";
import { markerScale, placeMarker } from "../src/game/objectiveMarker";
import { flashbackLineSec, flashbackSchedule, FLASHBACK_TIMING } from "../src/stages/future2086/introOverlay2086";
import table from "../src/stages/future2086/intro_2086.json";

const W = 1600;
const H = 900;

describe("目標の目印の置き場所", () => {
  it("画面の中の目標は、射影した位置にそのまま置く", () => {
    const p = placeMarker({ x: 0, y: 1, z: -10 }, { x: 0.25, y: -0.5 }, W, H);
    expect(p.edge).toBe(false);
    expect(p.x).toBeCloseTo(1000);
    expect(p.y).toBeCloseTo(675);
  });

  it("右の画面外の目標は、右の縁に寄せて右向きの矢印", () => {
    const p = placeMarker({ x: 20, y: 0, z: -5 }, { x: 3.2, y: 0 }, W, H, 56);
    expect(p.edge).toBe(true);
    expect(p.x).toBeCloseTo(W - 56);
    expect(p.y).toBeCloseTo(H / 2);
    expect(p.angle).toBeCloseTo(0);
  });

  it("カメラの後ろの目標は、左右のどちら側かで縁に寄せる（射影が反転しても向きは正しい）", () => {
    const left = placeMarker({ x: -3, y: 0.2, z: 6 }, { x: 0.4, y: 0 }, W, H, 56);
    expect(left.edge).toBe(true);
    expect(left.x).toBeCloseTo(56);
    expect(Math.abs(left.angle)).toBeGreaterThan(Math.PI / 2);
    const behind = placeMarker({ x: 0, y: 0, z: 6 }, { x: 0, y: 0 }, W, H, 56);
    expect(behind.edge).toBe(true);
    expect(behind.y).toBeCloseTo(H - 56);
  });

  it("縁ぎりぎり（半分の余白より外）なら縁の目印にする。縁の位置はいつも画面の内側", () => {
    const p = placeMarker({ x: 1, y: 3, z: -5 }, { x: 0.1, y: 0.99 }, W, H, 56);
    expect(p.edge).toBe(true);
    for (const c of [
      { x: 5, y: 9, z: -2 },
      { x: -40, y: -1, z: -3 },
      { x: 0.2, y: -8, z: 4 },
    ]) {
      const q = placeMarker(c, { x: 9, y: 9 }, W, H, 56);
      expect(q.x).toBeGreaterThanOrEqual(56 - 1e-6);
      expect(q.x).toBeLessThanOrEqual(W - 56 + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(56 - 1e-6);
      expect(q.y).toBeLessThanOrEqual(H - 56 + 1e-6);
    }
  });

  it("遠いほど少し小さく（上限・下限あり）", () => {
    expect(markerScale(2)).toBeCloseTo(1.1);
    expect(markerScale(20)).toBeLessThan(markerScale(5));
    expect(markerScale(200)).toBe(0.75);
  });
});

describe("回想（15年前）", () => {
  it("名前しか覚えていないロボットとの会話を 1 行ずつ出し、最後が「今日から、いっしょに思い出をつくろう」", () => {
    const lines = table.flashback;
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.some((l) => l.text.includes("ネク"))).toBe(true);
    expect(lines.some((l) => l.text.includes("何も分からない"))).toBe(true);
    expect(lines[lines.length - 1].text).toBe("昨日のこと、思い出せなくても大丈夫。今日から、いっしょに思い出をつくろう！");
    const plan = flashbackSchedule(lines);
    expect(plan.starts[0]).toBe(FLASHBACK_TIMING.firstLine);
    for (let i = 1; i < plan.starts.length; i++) expect(plan.starts[i] - plan.starts[i - 1]).toBeCloseTo(flashbackLineSec(lines[i - 1].text));
    expect(plan.white).toBeGreaterThan(plan.starts[plan.starts.length - 1] + 2.6);
    expect(plan.out).toBeGreaterThan(plan.white);
  });
});
