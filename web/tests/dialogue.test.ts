// DialogueDB / dialogue.json のテスト
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogueDB, has, keys, lines } from "../src/core/dialogue";
import raw from "../src/data/dialogue.json";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dialogue（dialogue.json の型付きアクセス）", () => {
  it("lines はセリフ列（speaker / text）を返す", () => {
    const l = lines("future_intro_start");
    expect(l.length).toBe(3);
    expect(l[0]).toEqual({
      speaker: "ルート",
      text: "都市管理AI『ルート』より通達。このエリアは安全のため、ただいまより閉鎖します。",
    });
    expect(l[2].speaker).toBe("ネクマックス");
  });

  it("has は存在するセリフキーだけ true（注記 _note や未知のキーは false）", () => {
    expect(has("matsui_first")).toBe(true);
    expect(has("gate_success")).toBe(true);
    expect(has("no_such_key")).toBe(false);
    expect(has("_note")).toBe(false);
    expect(has("toString"), "Object のプロトタイプ名は存在しない扱い").toBe(false);
  });

  it("存在しないキーの lines は警告なしで空配列（Godot 版と同じ）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lines("no_such_key")).toEqual([]);
    expect(lines("toString")).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("値が配列でないキー（_note）の lines は警告して空配列", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(lines("_note")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("全キーが1行以上のセリフを持ち、各行に speaker と text がある", () => {
    const all = keys();
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBe(Object.keys(raw).length - 1); // _note 以外すべて
    for (const key of all) {
      const l = lines(key);
      expect(l.length, `${key} は1行以上`).toBeGreaterThan(0);
      for (const line of l) {
        expect(typeof line.speaker, `${key}.speaker`).toBe("string");
        expect(line.speaker.length, `${key}.speaker`).toBeGreaterThan(0);
        expect(typeof line.text, `${key}.text`).toBe("string");
        expect(line.text.length, `${key}.text`).toBeGreaterThan(0);
      }
    }
  });

  it("シナリオで使う主要なキーがそろっている", () => {
    for (const key of [
      "future_intro_start",
      "present_arrive_first",
      "matsui_first",
      "edo_arrive_first",
      "genbei_first",
      "gear_placed",
      "gate_success",
      "exhibit_confirm",
      "hub_first",
      "future_return",
      "sora_first",
      "robots_cleared",
    ]) {
      expect(has(key), key).toBe(true);
    }
  });

  it("DialogueDB は任意の表から作れる（テスト用データ）", () => {
    const db = new DialogueDB({ a: [{ speaker: "A", text: "こんにちは" }], note: "x" });
    expect(db.has("a")).toBe(true);
    expect(db.has("note")).toBe(false);
    expect(db.lines("a")).toEqual([{ speaker: "A", text: "こんにちは" }]);
    expect(db.keys()).toEqual(["a"]);
  });
});
