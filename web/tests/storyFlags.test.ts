// v2.3 の進行フラグ（core/storyFlags.ts）と、まとめたセーブ（core/gameSave.ts）
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_BOOL_FLAGS, STORY_BOOL_FLAGS, StoryState, isAnyBoolFlag } from "../src/core/storyFlags";
import { GameSave, GAME_SAVE_KEY } from "../src/core/gameSave";
import { SAVE_KEY } from "../src/core/saveManager";
import { BOOL_FLAG_NAMES, TimelineState } from "../src/core/timelineState";
import { FakeStorage } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StoryState", () => {
  it("v2.3 の追加フラグは既定 false・TimelineState のセーブ形式は変えない", () => {
    const s = new StoryState();
    for (const f of STORY_BOOL_FLAGS) expect(s.get(f), f).toBe(false);
    expect(s.loop_count).toBe(0);
    expect(STORY_BOOL_FLAGS).toContain("met_saeki");
    expect(STORY_BOOL_FLAGS).toContain("fixture_made");
    expect(STORY_BOOL_FLAGS).toContain("ido_qr_used");
    expect(STORY_BOOL_FLAGS).toContain("ido_exhibit_used");
    // 追加フラグは TimelineState のキーに入らない（既存のセーブ形式を守る）
    for (const f of STORY_BOOL_FLAGS) expect(Object.hasOwn(s.timeline.toJSON(), f), f).toBe(false);
    expect(ALL_BOOL_FLAGS.length).toBe(BOOL_FLAG_NAMES.length + STORY_BOOL_FLAGS.length);
  });

  it("get/set は TimelineState のフラグと追加フラグを同じ名前空間で扱い、変化だけ通知する", () => {
    const s = new StoryState();
    const events: Array<[string, unknown]> = [];
    s.changed.on((n, v) => events.push([n, v]));
    expect(s.set("met_matsui", true)).toBe(true);
    expect(s.timeline.met_matsui).toBe(true);
    expect(s.get("met_matsui")).toBe(true);
    expect(s.set("met_saeki", true)).toBe(true);
    expect(s.set("met_saeki", true)).toBe(false);
    expect(s.get("met_saeki")).toBe(true);
    expect(events).toEqual([
      ["met_matsui", true],
      ["met_saeki", true],
    ]);
  });

  it("未知のフラグは false・設定は警告して無視", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = new StoryState();
    expect(s.get("no_such_flag")).toBe(false);
    expect(s.set("no_such_flag", true)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(isAnyBoolFlag("gate_repaired")).toBe(true);
    expect(isAnyBoolFlag("fixture_made")).toBe(true);
    expect(isAnyBoolFlag("saeki")).toBe(false);
  });

  it("applyFlagList（?flags=）は立てる・下ろす・周回数を受け付け、未知の名前を返す", () => {
    const s = new StoryState();
    const unknown = s.applyFlagList(["met_matsui", "met_saeki", "gate_repaired=true", "ido_qr_used=false", "loop_count=3", "bogus", ""]);
    expect(unknown).toEqual(["bogus"]);
    expect(s.get("met_matsui") && s.get("met_saeki") && s.get("gate_repaired")).toBe(true);
    expect(s.get("ido_qr_used")).toBe(false);
    expect(s.loop_count).toBe(3);
    s.applyFlagList(["met_saeki=0"]);
    expect(s.get("met_saeki")).toBe(false);
    expect(s.activeFlags()).toEqual(["gate_repaired", "met_matsui"]);
  });

  it("toJSON / fromJSON で追加フラグと周回数を復元し、壊れた値は既定値", () => {
    const a = new StoryState();
    a.set("orum_seen", true);
    a.set("fixture_made", true);
    a.addLoop();
    a.addLoop();
    const b = new StoryState();
    b.fromJSON(JSON.parse(JSON.stringify(a)));
    expect(b.get("orum_seen")).toBe(true);
    expect(b.get("fixture_made")).toBe(true);
    expect(b.get("met_saeki")).toBe(false);
    expect(b.loop_count).toBe(2);
    b.fromJSON({ flags: { orum_seen: "yes", met_saeki: true }, loop_count: -1 });
    expect(b.get("orum_seen")).toBe(false);
    expect(b.get("met_saeki")).toBe(true);
    expect(b.loop_count).toBe(0);
    b.fromJSON(null);
    expect(b.activeFlags()).toEqual([]);
  });

  it("reset は TimelineState も含めて新規ゲームに戻す", () => {
    const s = new StoryState();
    s.set("gate_repaired", true);
    s.set("met_saeki", true);
    s.reset();
    expect(s.get("gate_repaired")).toBe(false);
    expect(s.get("met_saeki")).toBe(false);
  });
});

describe("GameSave（ステージ＝時代・到着地点・全フラグ）", () => {
  it("保存→ロードで時代・到着地点・全フラグを再現する（既存の slot1 は触らない）", () => {
    const storage = new FakeStorage();
    const save = new GameSave(storage);
    const src = new StoryState();
    src.applyFlagList(["met_matsui", "met_saeki", "ido_qr_used", "gate_repaired", "genbei_drawing_found", "loop_count=2"]);
    expect(save.save(src, 2026, "present_ido", 1234)).toBe(true);
    expect([...storage.items.keys()]).toEqual([GAME_SAVE_KEY]);
    expect(storage.items.has(SAVE_KEY)).toBe(false);
    const dst = new StoryState(new TimelineState());
    const loaded = save.load(dst);
    expect(loaded).toEqual({ era: 2026, checkpoint: "present_ido" });
    expect(dst.activeFlags()).toEqual(src.activeFlags());
    expect(dst.loop_count).toBe(2);
    expect(dst.timeline.current_era).toBe(2026);
    expect(save.read()?.saved_at).toBe(1234);
  });

  it("セーブが無い・壊れているときは null で状態を変えない", () => {
    const storage = new FakeStorage();
    const save = new GameSave(storage);
    const s = new StoryState();
    s.set("met_matsui", true);
    expect(save.load(s)).toBe(null);
    expect(s.get("met_matsui")).toBe(true);
    storage.setItem(GAME_SAVE_KEY, "{broken");
    expect(save.has()).toBe(false);
    expect(save.load(s)).toBe(null);
    storage.setItem(GAME_SAVE_KEY, JSON.stringify({ version: 1 }));
    expect(save.load(s)).toBe(null);
    save.clear();
    expect(storage.items.size).toBe(0);
  });

  it("保存先が使えないときは false", () => {
    const save = new GameSave(null);
    expect(save.save(new StoryState(), 1726, "street")).toBe(false);
    expect(save.has()).toBe(false);
  });
});
