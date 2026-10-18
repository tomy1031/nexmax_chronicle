// eras.ts（時代ID・ラベル・場所・色味）のテスト
import { describe, expect, it } from "vitest";
import {
  ERA,
  ERA_EDO,
  ERA_FUTURE,
  ERA_HUB,
  ERA_IDS,
  ERA_PLACES,
  ERA_PRESENT,
  ERA_TINTS,
  eraLabel,
  eraPlace,
  eraTint,
  eraTintHex,
  isEraId,
} from "../src/core/eras";

describe("eras", () => {
  it("時代ID は 1726 / 1970 / 2026 / 2086、拠点は 0", () => {
    expect(ERA_EDO).toBe(1726);
    expect(ERA_PRESENT).toBe(2026);
    expect(ERA_FUTURE).toBe(2086);
    expect(ERA_HUB).toBe(0);
    expect([...ERA_IDS].sort((a, b) => a - b)).toEqual([0, 1726, 1970, 2026, 2086]);
  });

  it("isEraId は定義済みの時代IDだけ true", () => {
    expect(isEraId(1726)).toBe(true);
    expect(isEraId(0)).toBe(true);
    expect(isEraId(1999)).toBe(false);
    expect(isEraId("1726")).toBe(false);
    expect(isEraId(null)).toBe(false);
  });

  it("eraLabel: 年は「1726年」、拠点は「時の境界」", () => {
    expect(eraLabel(ERA.EDO)).toBe("1726年");
    expect(eraLabel(ERA.PRESENT)).toBe("2026年");
    expect(eraLabel(ERA.FUTURE)).toBe("2086年");
    expect(eraLabel(ERA.HUB)).toBe("時の境界");
  });

  it("場所の名前（Godot 版 ERA_PLACES と同じ）", () => {
    expect(ERA_PLACES[ERA.EDO]).toBe("大坂・仕掛け横丁");
    expect(ERA_PLACES[ERA.PRESENT]).toBe("なんば");
    expect(ERA_PLACES[ERA.FUTURE]).toBe("ナンバタウン");
    expect(ERA_PLACES[ERA.HUB]).toBe("異次元拠点");
    expect(eraPlace(1726)).toBe("大坂・仕掛け横丁");
    expect(eraPlace(1999), "未定義の時代は空文字").toBe("");
  });

  it("色味（Godot 版 ERA_TINTS と同じ RGB）と 0xRRGGBB への変換", () => {
    expect(ERA_TINTS[ERA.EDO]).toEqual({ r: 1.0, g: 0.72, b: 0.38 });
    expect(ERA_TINTS[ERA.PRESENT]).toEqual({ r: 0.45, g: 0.8, b: 1.0 });
    expect(ERA_TINTS[ERA.FUTURE]).toEqual({ r: 0.7, g: 0.55, b: 1.0 });
    expect(ERA_TINTS[ERA.HUB]).toEqual({ r: 0.5, g: 1.0, b: 0.9 });
    expect(eraTintHex(ERA.EDO)).toBe(0xffb861);
    expect(eraTint(1999), "未定義の時代は白").toEqual({ r: 1, g: 1, b: 1 });
    expect(eraTintHex(1999)).toBe(0xffffff);
  });
});
