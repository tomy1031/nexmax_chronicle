// 時代（年代）の定義。
// Godot 版の TimelineState.ERA_* と TimeTravelManager の ERA_PLACES / ERA_TINTS / era_label に相当する。
// three.js などのフレームワークには依存しない（色は 0〜1 の RGB で持つ）。

/** 時代ID。拠点（異次元拠点）は 0。 */
export const ERA = {
  HUB: 0,
  EDO: 1726,
  PRESENT: 2026,
  FUTURE: 2086,
} as const;

export type EraId = (typeof ERA)[keyof typeof ERA];

export const ERA_HUB = ERA.HUB;
export const ERA_EDO = ERA.EDO;
export const ERA_PRESENT = ERA.PRESENT;
export const ERA_FUTURE = ERA.FUTURE;

/** 全時代ID（Godot の ERA_SCENES と同じ並び）。 */
export const ERA_IDS: readonly EraId[] = [ERA.EDO, ERA.PRESENT, ERA.FUTURE, ERA.HUB];

export function isEraId(value: unknown): value is EraId {
  return ERA_IDS.includes(value as EraId);
}

/** 場所の名前（HUD の「年代・場所」表示、移動中の文言に使う）。 */
export const ERA_PLACES: Readonly<Record<EraId, string>> = {
  [ERA.EDO]: "大坂・仕掛け横丁",
  [ERA.PRESENT]: "なんば",
  [ERA.FUTURE]: "ナンバタウン",
  [ERA.HUB]: "異次元拠点",
};

/** 時代ごとのワープ演出・色味（RGB、各 0〜1）。Godot の Color と同じ値。 */
export interface EraTint {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const ERA_TINTS: Readonly<Record<EraId, EraTint>> = {
  [ERA.EDO]: { r: 1.0, g: 0.72, b: 0.38 },
  [ERA.PRESENT]: { r: 0.45, g: 0.8, b: 1.0 },
  [ERA.FUTURE]: { r: 0.7, g: 0.55, b: 1.0 },
  [ERA.HUB]: { r: 0.5, g: 1.0, b: 0.9 },
};

const WHITE: EraTint = { r: 1, g: 1, b: 1 };

/** 表示用の年代ラベル。拠点は「時の境界」、それ以外は「1726年」のように年で表す。 */
export function eraLabel(era: number): string {
  if (era === ERA.HUB) {
    return "時の境界";
  }
  return `${era}年`;
}

/** 場所の名前。未定義の時代は空文字（Godot の ERA_PLACES.get(era, "") と同じ）。 */
export function eraPlace(era: number): string {
  return isEraId(era) ? ERA_PLACES[era] : "";
}

/** 時代の色味。未定義の時代は白（Godot の Color.WHITE と同じ）。 */
export function eraTint(era: number): EraTint {
  return isEraId(era) ? ERA_TINTS[era] : WHITE;
}

/** 色味を 0xRRGGBB に直す（three.js の `new Color(hex)` などに渡す用）。 */
export function eraTintHex(era: number): number {
  const t = eraTint(era);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(t.r) << 16) | (c(t.g) << 8) | c(t.b);
}
