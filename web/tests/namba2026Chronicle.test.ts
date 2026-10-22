// 物語 v7 の 2026年 なんばの部品（stages/namba2026/chronicle/）：IDO 検索・路地の時間・ほこらの体力・配置
import { describe, expect, it } from "vitest";
import { CLOCK_CANDIDATES, IDO_RECORDS, SEARCH_WORDS, checkedCount, matchedWords, recordOfKanban, searchRecords } from "../src/stages/namba2026/chronicle/idoSearchLogic";
import { ALLEY_PALETTES, ALLEY_PHASES, phaseMix, sunDirection } from "../src/stages/namba2026/chronicle/alleyTime";
import { DEFENSE_WAVES, SHRINE_HITS, ShrineGuard, damageStage, dueSpawns, guardLevel, waveCount } from "../src/stages/namba2026/chronicle/shrineGuard";
import { ALLEY_V7, DEFENSE, KANBAN, LOT, SHRINE, SPOTS_V7, V7_SPAWNS } from "../src/stages/namba2026/chronicle/layoutV7";
import { N } from "../src/stages/namba2026/layout";

describe("IDO 検索（6 章）", () => {
  it("「時計」で 3 本：時計屋の看板・駅の大時計の看板・古い路地のかんばん", () => {
    const r = searchRecords(["時計"]).map((x) => x.name);
    expect(r).toEqual(["時計屋の看板", "駅の大時計の看板", "古い路地のかんばん"]);
    expect(CLOCK_CANDIDATES).toEqual(["clock_shop", "station_clock", "old_alley"]);
  });

  it("「時計」と「青い」の両方では、古い路地のかんばんだけ", () => {
    const r = searchRecords(SEARCH_WORDS.second);
    expect(r.map((x) => x.id)).toEqual(["old_alley"]);
    expect(matchedWords(r[0], ["時計", "青い"])).toEqual(["時計", "青い"]);
  });

  it("「青い」だけだと、路地のほかにも出る（言葉を合わせてしぼるのが大事）", () => {
    const r = searchRecords(["青い"]);
    expect(r.length).toBeGreaterThan(1);
    expect(r.some((x) => x.id === "old_alley")).toBe(true);
  });

  it("言葉が空なら何も出さない・合わない言葉なら 0 本", () => {
    expect(searchRecords([])).toEqual([]);
    expect(searchRecords(["  "])).toEqual([]);
    expect(searchRecords(["宇宙"])).toEqual([]);
  });

  it("候補の 3 本は町のかんばん（B・D・C）にしまってある", () => {
    expect(recordOfKanban("b")?.id).toBe("clock_shop");
    expect(recordOfKanban("d")?.id).toBe("station_clock");
    expect(recordOfKanban("c")?.id).toBe("old_alley");
    for (const id of CLOCK_CANDIDATES) {
      const r = IDO_RECORDS.find((x) => x.id === id);
      expect(r?.kanban).not.toBeNull();
      expect(r?.image).not.toBe("none");
    }
  });

  it("路地の記録は物語の本文どおり（源兵衛・青い刃のかけら・コチ、コチ）", () => {
    const r = recordOfKanban("c");
    expect(r?.panel.body).toContain("源兵衛");
    expect(r?.panel.body).toContain("空の怪物を裂く、青い刃のかけら");
    expect(r?.panel.body).toContain("コチ、コチ");
    // 6 章ではまだネクマックスの絵（時を裂く爪）は無い
    expect(r?.panel.body).not.toContain("時を裂く爪");
  });

  it("調べた数は候補の中だけ数える", () => {
    expect(checkedCount(new Set(["clock_shop", "nextmake"]))).toBe(1);
    expect(checkedCount(new Set(CLOCK_CANDIDATES))).toBe(3);
  });

  it("記録の文に「オルム」は出ない（6 章ではまだ知らない）", () => {
    for (const r of IDO_RECORDS) expect(JSON.stringify(r.panel)).not.toContain("オルム");
  });
});

describe("路地の時間（9 章：夕方 → 夜 → 夜明け）", () => {
  it("位置 0〜3 を、となりの 2 つの時間と割合に分ける", () => {
    expect(phaseMix(0)).toEqual({ a: "day", b: "dusk", k: 0 });
    expect(phaseMix(1.5)).toEqual({ a: "dusk", b: "night", k: 0.5 });
    expect(phaseMix(3)).toEqual({ a: "night", b: "dawn", k: 1 });
    expect(phaseMix(-2).k).toBe(0);
    expect(phaseMix(9)).toEqual({ a: "night", b: "dawn", k: 1 });
  });

  it("夜はいちばん暗く、看板の光はいちばん強い。夜明けの太陽は東から", () => {
    const P = ALLEY_PALETTES;
    for (const ph of ALLEY_PHASES) if (ph !== "night") expect(P.night.sunIntensity).toBeLessThan(P[ph].sunIntensity);
    for (const ph of ALLEY_PHASES) if (ph !== "night") expect(P.night.glow).toBeGreaterThan(P[ph].glow);
    expect(sunDirection(P.dawn.sunYaw, P.dawn.sunEl).x).toBeGreaterThan(0.9);
    expect(sunDirection(P.dusk.sunYaw, P.dusk.sunEl).x).toBeLessThan(-0.9);
    expect(sunDirection(P.day.sunYaw, P.day.sunEl).length()).toBeCloseTo(1, 5);
  });
});

describe("ほこらの体力（9 章の防衛戦）", () => {
  it("影にやられると減り、0 で壊れる。見た目の欠けは 1 - 残り", () => {
    const g = new ShrineGuard(10);
    expect(g.damage).toBe(0);
    g.hit(SHRINE_HITS.leap);
    expect(g.value).toBe(9);
    expect(g.damage).toBeCloseTo(0.1, 5);
    g.hit(SHRINE_HITS.slam * 10);
    expect(g.value).toBe(0);
    expect(g.broken).toBe(true);
    g.reset();
    expect(g.ratio).toBe(1);
  });

  it("ゲージの色と、欠けた見た目の段階", () => {
    expect(guardLevel(1)).toBe("ok");
    expect(guardLevel(0.5)).toBe("warn");
    expect(guardLevel(0.2)).toBe("danger");
    expect([0, 0.2, 0.5, 0.7, 0.9].map(damageStage)).toEqual([0, 1, 2, 3, 4]);
  });

  it("2 波。どちらの波も 3 方向（屋根・路地の口・トンネル）から来る", () => {
    expect(DEFENSE_WAVES.length).toBe(2);
    for (const w of DEFENSE_WAVES) {
      const dirs = new Set(w.spawns.map((s) => s.dir));
      expect(dirs).toEqual(new Set(["north", "south", "roof"]));
      expect(waveCount(w)).toBeGreaterThanOrEqual(5);
      // delay は順に並んでいる
      const d = w.spawns.map((s) => s.delay);
      expect([...d].sort((a, b) => a - b)).toEqual(d);
    }
  });

  it("時間が来た物から順に出す", () => {
    const w = DEFENSE_WAVES[0];
    expect(dueSpawns(w, 0, 0)).toEqual([0]);
    expect(dueSpawns(w, 6.5, 1)).toEqual([1, 2]);
    expect(dueSpawns(w, 100, 4)).toEqual([]);
  });
});

describe("v7 の配置", () => {
  const inLot = (x: number, z: number) => x > LOT.x0 && x < LOT.x1 && z > LOT.z0 && z < LOT.z1;

  it("ほこらは路地のおくの空き地にあって、東を向く", () => {
    expect(inLot(SHRINE.pos.x, SHRINE.pos.z)).toBe(true);
    expect(Math.sin(SHRINE.yaw)).toBeCloseTo(1, 5);
    expect(SHRINE.front.x).toBeGreaterThan(SHRINE.pos.x);
    // 空き地は路地のすぐ南（路地の口とつながる）
    expect(LOT.z0).toBe(ALLEY_V7.z1);
    expect(ALLEY_V7.x0).toBeGreaterThan(LOT.x0);
    expect(ALLEY_V7.x1).toBeLessThan(LOT.x1);
  });

  it("路地のかんばん C は西の塀ぎわ（路地を通れるすきまが残る）", () => {
    const c = KANBAN.c.pos;
    expect(c.x).toBeGreaterThan(ALLEY_V7.x0);
    expect(c.x).toBeLessThan(ALLEY_V7.x0 + 1.0);
    // 石の幅（向きが東なので x 方向に 0.85）を引いても 1.5 m 以上あく
    expect(ALLEY_V7.x1 - 0.12 - (c.x + 0.43)).toBeGreaterThan(1.5);
    expect(Math.sin(KANBAN.c.yaw)).toBeCloseTo(1, 5);
  });

  it("石標 A は NEXTMAKE の前の、もとの石標", () => {
    expect(KANBAN.a.pos.equals(N.IDO)).toBe(true);
    expect(KANBAN.b.pos.equals(N.IDO_B)).toBe(true);
  });

  it("到着地点：v7_nextmake・v7_alley・v7_lab・v7_shrine", () => {
    expect(Object.keys(V7_SPAWNS).sort()).toEqual(["v7_alley", "v7_lab", "v7_nextmake", "v7_shrine"]);
    const s = V7_SPAWNS;
    // かんばん A の前（板の向き＝南の側）
    expect(s.v7_nextmake.pos.z).toBeGreaterThan(KANBAN.a.pos.z);
    expect(Math.hypot(s.v7_nextmake.pos.x - KANBAN.a.pos.x, s.v7_nextmake.pos.z - KANBAN.a.pos.z)).toBeLessThan(2);
    // 路地のかんばん C の前（板の向き＝東の側）
    expect(s.v7_alley.pos.x).toBeGreaterThan(KANBAN.c.pos.x);
    expect(Math.hypot(s.v7_alley.pos.x - KANBAN.c.pos.x, s.v7_alley.pos.z - KANBAN.c.pos.z)).toBeLessThan(2);
    // ラボの中
    expect(s.v7_lab.pos.x).toBeGreaterThan(N.NM.x0);
    expect(s.v7_lab.pos.x).toBeLessThan(N.NM.x1);
    expect(s.v7_lab.pos.z).toBeGreaterThan(N.NM.part);
    // ほこらの前
    expect(inLot(s.v7_shrine.pos.x, s.v7_shrine.pos.z)).toBe(true);
    expect(s.v7_shrine.pos.x).toBeGreaterThan(SHRINE.pos.x);
  });

  it("影の出口は 3 方向、屋根の道はほこらの屋根で終わる", () => {
    expect(Object.keys(DEFENSE.spawns).sort()).toEqual(["north", "roof", "south"]);
    for (const p of DEFENSE.spawns.north) expect(p.x > ALLEY_V7.x0 && p.x < ALLEY_V7.x1 && p.z < ALLEY_V7.z1).toBe(true);
    for (const p of DEFENSE.spawns.south) expect(p.z).toBeGreaterThan(LOT.z1);
    for (const p of DEFENSE.spawns.roof) expect(p.y).toBeGreaterThan(2);
    for (const path of DEFENSE.roofPaths) {
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - SHRINE.pos.x, end.z - SHRINE.pos.z)).toBeLessThan(1.2);
      expect(end.y).toBeGreaterThan(1.8);
    }
    for (const c of DEFENSE.darkCorners) expect(Math.hypot(c.x - SHRINE.pos.x, c.z - SHRINE.pos.z)).toBeGreaterThan(2);
  });

  it("社長が路地のかんばんへかけよる道は、ほこらのそばから C の前まで", () => {
    const p = SPOTS_V7.matsuiToKanban;
    expect(p[0].equals(SPOTS_V7.matsuiShrine.pos)).toBe(true);
    expect(p[p.length - 1].equals(SPOTS_V7.matsuiProject.pos)).toBe(true);
  });
});
