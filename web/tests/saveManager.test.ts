// SaveManager のテスト。保存先はメモリ上の偽 Storage（localStorage 互換）を注入する。
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAVE_KEY, SaveManager, defaultStorage, type StorageLike } from "../src/core/saveManager";
import { ERA_FUTURE } from "../src/core/eras";
import { SAVE_VERSION, TimelineState } from "../src/core/timelineState";
import { FakeStorage, fullyProgressed, near } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SaveManager", () => {
  it("保存キーは nexmax_chronicle_slot1", () => {
    expect(SAVE_KEY).toBe("nexmax_chronicle_slot1");
    const storage = new FakeStorage();
    const sm = new SaveManager(storage);
    expect(sm.key).toBe("nexmax_chronicle_slot1");
    sm.saveGame(new TimelineState());
    expect([...storage.items.keys()]).toEqual(["nexmax_chronicle_slot1"]);
  });

  it("セーブがなければ hasSave=false / loadGame=false で state は変わらない", () => {
    const sm = new SaveManager(new FakeStorage());
    const state = fullyProgressed();
    const before = state.toJSON();
    expect(sm.hasSave()).toBe(false);
    expect(sm.readSave()).toBeNull();
    expect(sm.loadGame(state)).toBe(false);
    expect(state.toJSON()).toEqual(before);
  });

  it("保存 → 読み込みで全項目が一致する（ラウンドトリップ）", () => {
    const storage = new FakeStorage();
    const sm = new SaveManager(storage);
    const src = fullyProgressed();
    expect(sm.saveGame(src)).toBe(true);
    expect(sm.hasSave()).toBe(true);

    // 別セッション相当：新しい SaveManager / TimelineState で同じ storage を読む
    const dst = new TimelineState();
    expect(new SaveManager(storage).loadGame(dst)).toBe(true);
    expect(dst.toJSON()).toEqual(src.toJSON());
    expect(dst.future_route_open).toBe(true);
    expect(dst.current_era).toBe(1726);
    expect(dst.crystalCount()).toBe(3);
    near(dst.play_time, 123.5);
    near(dst.metrics["custom_future_metric"], 7.0);
  });

  it("保存される JSON は Godot 版と同じキー（snake_case）で、future_route_open を含まない", () => {
    const storage = new FakeStorage();
    new SaveManager(storage).saveGame(fullyProgressed());
    const text = storage.getItem(SAVE_KEY) ?? "";
    const d = JSON.parse(text) as Record<string, unknown>;
    expect(d["version"]).toBe(SAVE_VERSION);
    expect(Object.keys(d)).toEqual(Object.keys(new TimelineState().toJSON()));
    expect(Object.hasOwn(d, "future_route_open")).toBe(false);
    expect(Array.isArray(d["crystals"])).toBe(true);
    expect(d["drawing_confirmed"]).toBe(true);
  });

  it("saveGame は成功時だけ saved を発火する", () => {
    const sm = new SaveManager(new FakeStorage());
    let count = 0;
    sm.saved.on(() => {
      count += 1;
    });
    sm.saveGame(new TimelineState());
    sm.saveGame(new TimelineState());
    expect(count).toBe(2);
  });

  it("loadGame は現在の状態を引きずらず、セーブの内容に置き換える", () => {
    const sm = new SaveManager(new FakeStorage());
    const early = new TimelineState();
    early.setFlag("intro_done", true);
    sm.saveGame(early);
    const state = fullyProgressed();
    expect(sm.loadGame(state)).toBe(true);
    expect(state.intro_done).toBe(true);
    expect(state.gate_repaired).toBe(false);
    expect(state.crystalCount()).toBe(0);
    expect(state.current_era).toBe(ERA_FUTURE);
  });

  it("deleteSave でセーブがなくなる（なくても例外を出さない）", () => {
    const sm = new SaveManager(new FakeStorage());
    sm.deleteSave();
    sm.saveGame(new TimelineState());
    expect(sm.hasSave()).toBe(true);
    sm.deleteSave();
    expect(sm.hasSave()).toBe(false);
    expect(sm.loadGame(new TimelineState())).toBe(false);
  });

  it("キーを変えれば別スロット（テストは遊んでいるセーブを壊さない）", () => {
    const storage = new FakeStorage();
    const real = new SaveManager(storage);
    const test = new SaveManager(storage, "test_slot");
    real.saveGame(fullyProgressed());
    expect(test.hasSave()).toBe(false);
    test.saveGame(new TimelineState());
    test.deleteSave();
    expect(real.hasSave()).toBe(true);
  });

  it("壊れた JSON は読み込めず、false を返して state は変わらない（セーブ自体は残る）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, "{ これは JSON ではない");
    const sm = new SaveManager(storage);
    const state = fullyProgressed();
    const before = state.toJSON();
    expect(sm.hasSave(), "Godot 版の file_exists と同じく、壊れていても「ある」").toBe(true);
    expect(sm.readSave()).toBeNull();
    expect(sm.loadGame(state)).toBe(false);
    expect(state.toJSON()).toEqual(before);
    expect(warn).toHaveBeenCalled();
  });

  it("オブジェクトでない JSON（配列・数値・null）は読み込めない", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const text of ["[1,2,3]", "42", "null", '"text"']) {
      const storage = new FakeStorage();
      storage.setItem(SAVE_KEY, text);
      expect(new SaveManager(storage).loadGame(new TimelineState()), text).toBe(false);
    }
  });

  it("空のオブジェクト {} はセーブなし扱い（Godot 版と同じ）", () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, "{}");
    const sm = new SaveManager(storage);
    expect(sm.readSave()).toBeNull();
    expect(sm.loadGame(new TimelineState())).toBe(false);
  });

  it("一部のキーだけのセーブ（古い版など）は足りない項目が既定値になる", () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, gate_repaired: true, current_era: 1726 }));
    const state = new TimelineState();
    expect(new SaveManager(storage).loadGame(state)).toBe(true);
    expect(state.gate_repaired).toBe(true);
    expect(state.current_era).toBe(1726);
    expect(state.checkpoint).toBe("future_intro");
    expect(state.metrics["claw_grabs"]).toBe(0);
  });

  it("保存先が使えない（null）場合は保存できず、読み込みも false で、例外を出さない", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sm = new SaveManager(null);
    let saved = 0;
    sm.saved.on(() => {
      saved += 1;
    });
    expect(sm.saveGame(new TimelineState())).toBe(false);
    expect(sm.hasSave()).toBe(false);
    expect(sm.loadGame(new TimelineState())).toBe(false);
    expect(() => sm.deleteSave()).not.toThrow();
    expect(saved).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("setItem が例外（容量超過など）でも saveGame は false を返し、saved は発火しない", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    const sm = new SaveManager(storage);
    let saved = 0;
    sm.saved.on(() => {
      saved += 1;
    });
    expect(sm.saveGame(new TimelineState())).toBe(false);
    expect(saved).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("getItem / removeItem が例外でも例外を外へ出さない", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    const sm = new SaveManager(storage);
    expect(sm.hasSave()).toBe(false);
    expect(sm.loadGame(new TimelineState())).toBe(false);
    expect(() => sm.deleteSave()).not.toThrow();
  });
});

describe("defaultStorage", () => {
  it("globalThis.localStorage があればそれを使う（引数なしの SaveManager）", () => {
    const fake = new FakeStorage();
    vi.stubGlobal("localStorage", fake);
    expect(defaultStorage()).toBe(fake);
    const sm = new SaveManager();
    sm.saveGame(new TimelineState());
    expect(fake.items.has(SAVE_KEY)).toBe(true);
  });

  it("localStorage がない環境では null", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(defaultStorage()).toBeNull();
  });

  it("localStorage へのアクセス自体が例外になる環境（プライベートモード等）では null", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(defaultStorage()).toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});
