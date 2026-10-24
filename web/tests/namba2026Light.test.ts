// 9 章の夜（物語 v7.2）：かんばんの「江戸の朝」の光の輪で、大きな影をつかまえるしくみ（stages/namba2026/chronicle/lightLogic.ts）
import { describe, expect, it } from "vitest";
import { BIG_SHADOW, LIGHT_TUNING, LightPostLogic, bestPost, inRing, pushOutOfRing } from "../src/stages/namba2026/chronicle/lightLogic";
import { lightPostSpots } from "../src/stages/namba2026/chronicle/lightPosts";
import { LOT, SHRINE } from "../src/stages/namba2026/chronicle/layoutV7";

const T = LIGHT_TUNING;

describe("かんばんの光（ready → rising → lit → cool → ready）", () => {
  it("たたくと広がって、ともって、消えて、またためる", () => {
    const p = new LightPostLogic();
    expect(p.trigger()).toBe(true);
    expect(p.trigger()).toBe(false); // 広がっている間は、もう一度は光らない
    expect(p.update(T.rise * 0.5)).toBe(null);
    expect(p.level).toBeGreaterThan(0);
    expect(p.on).toBe(false);
    expect(p.update(T.rise)).toBe("lit");
    expect(p.on).toBe(true);
    expect(p.left).toBeCloseTo(T.lit, 5);
    expect(p.update(T.lit + 0.01)).toBe("off");
    expect(p.on).toBe(false);
    expect(p.trigger()).toBe(false); // ためている間は使えない
    expect(p.charge).toBeLessThan(1);
    expect(p.update(T.cool + 0.01)).toBe("ready");
    expect(p.trigger()).toBe(true);
  });

  it("子どもの物差し：たたいてから光るまで短く（0.8 秒まで）、ともっている間は長め（4 秒以上）", () => {
    expect(T.rise).toBeLessThanOrEqual(0.8);
    expect(T.lit).toBeGreaterThanOrEqual(4);
    // 大きな影の叩きつけの溜め（1.35 秒）より早く光る：影が前に来てからたたいても間に合う
    expect(T.rise).toBeLessThan(1.35);
  });
});

describe("光の輪の中・外", () => {
  const c = { x: 0, z: 0 };
  it("輪の中（体のゆとりこみ）", () => {
    expect(inRing(c, { x: T.radius, z: 0 })).toBe(true);
    expect(inRing(c, { x: T.radius + T.catchPad + 0.01, z: 0 })).toBe(false);
  });

  it("ともった輪の中にいたら、ふちの外へ押し出す（大きな影は光に入らない）", () => {
    const out = pushOutOfRing(c, { x: 0.5, z: 0 });
    expect(out).not.toBeNull();
    expect(Math.hypot(out!.x, out!.z)).toBeGreaterThan(T.radius);
    expect(out!.x).toBeGreaterThan(0); // 来た向きへ
    expect(pushOutOfRing(c, { x: T.radius + 1, z: 0 })).toBeNull();
    // まん中ぴったりでも、どこかへ出す
    expect(pushOutOfRing(c, { x: 0, z: 0 })).not.toBeNull();
  });

  it("社長が教えるかんばん：使えるかんばんのうち、影にいちばん近い光の輪", () => {
    const centers = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 10, z: 0 },
    ];
    expect(bestPost(centers, [true, true, true], { x: 6, z: 0 })).toBe(1);
    expect(bestPost(centers, [true, false, true], { x: 6, z: 0 })).toBe(2);
    expect(bestPost(centers, [false, false, false], { x: 6, z: 0 })).toBe(-1);
  });
});

describe("大きな影", () => {
  it("クローで 3 回引きたおすと終わる。影の手の予告は 1.2 秒以上", () => {
    expect(Math.ceil(BIG_SHADOW.hp / BIG_SHADOW.pullDamage)).toBe(3);
    expect(BIG_SHADOW.handWindup).toBeGreaterThanOrEqual(1.2);
    expect(BIG_SHADOW.downSec).toBeGreaterThan(0.8);
  });
});

describe("空き地のかんばん 3 本の置き場所", () => {
  const spots = lightPostSpots();
  const inLot = (x: number, z: number, m = 0) => x > LOT.x0 + m && x < LOT.x1 - m && z > LOT.z0 + m && z < LOT.z1 - m;
  const center = (s: (typeof spots)[number]) => ({ x: s.pos.x + Math.sin(s.yaw) * (T.radius + 0.35), z: s.pos.z + Math.cos(s.yaw) * (T.radius + 0.35) });

  it("3 本とも空き地の中。光の輪の真ん中も空き地の中（ふちから 1 m 以上）", () => {
    expect(spots.length).toBe(3);
    for (const s of spots) {
      expect(inLot(s.pos.x, s.pos.z), s.id).toBe(true);
      const c = center(s);
      expect(inLot(c.x, c.z, 1), s.id).toBe(true);
    }
  });

  it("かんばんは路地の口（x 15〜18）をふさがない・ほこらにかさならない", () => {
    for (const s of spots) {
      const blocksMouth = s.pos.z < LOT.z0 + 0.8 && s.pos.x > 15 - 0.25 && s.pos.x < 18 + 0.25;
      expect(blocksMouth, s.id).toBe(false);
      expect(Math.hypot(s.pos.x - SHRINE.pos.x, s.pos.z - SHRINE.pos.z), s.id).toBeGreaterThan(2.2);
    }
  });

  it("光の輪どうしは、はなれている（真ん中どうし 3 m 以上）", () => {
    const cs = spots.map(center);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) expect(Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z)).toBeGreaterThan(3);
  });
});
