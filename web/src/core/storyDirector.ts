// 物語 v2.3 の目標（questDirector の v2.3 版）。保存されたフラグだけから決まるので、ロード後も同じ表示になる。
// questDirector.ts（Godot 版から移植した序章 v1 の目標・既存テストで文言固定）はそのまま残し、
// three.js 版のステージはこちらを使う。佐伯玲奈は 2026年の NEXTMAKE ラボのエンジニア（仕様 §5.2）。

import { ERA_EDO, ERA_FUTURE, ERA_PRESENT } from "./eras";

export type StoryTargetId =
  | "festival"
  | "sora"
  | "exhibit"
  | "matsui"
  | "saeki"
  | "ido"
  | "ido_markers"
  | "oharu"
  | "genbei"
  | "gate_gear"
  | "return_point"
  | "";

export interface StoryObjective {
  title: string;
  sub: string;
  /** 目標マーカーの対象ID（各ステージがこの ID の位置を持つ） */
  target: StoryTargetId;
}

/** 目標の決定に使うフラグ。StoryState.get をそのまま渡せる */
export type FlagReader = (name: string) => boolean;

function o(title: string, sub: string, target: StoryTargetId): StoryObjective {
  return { title, sub, target };
}

/** 2026年の IDO の石標（導入編 6-6）。A・B は昔の町を見るだけ、C で鉱石が反応して 1726年へ（順番は自由） */
export const IDO_MARKER_NAMES = {
  a: "A（NEXTMAKE の前）",
  b: "B（橋のたもと）",
  c: "C（古い路地の奥）",
} as const;

/** まだ読んでいない石標（C は読むと 1726年へ行くので、ここでは常に残る） */
export function idoMarkersLeft(f: FlagReader): Array<keyof typeof IDO_MARKER_NAMES> {
  const left: Array<keyof typeof IDO_MARKER_NAMES> = [];
  if (!f("ido_a_seen")) left.push("a");
  if (!f("ido_b_seen")) left.push("b");
  left.push("c");
  return left;
}

/**
 * 2026年（導入編 6 章）：マツイ社長が近づいてくる → 社長についてラボへ、佐伯が右腕の取り付け部を直す →
 * 表で待つ社長に帰る方法を相談（社内は自由に見てよい）→ IDO の石標 A・B・C（順不同。C で 1726年へ）→
 * 帰還して報告 → 佐伯の固定具 → IDO（2086年へ）
 */
export function presentObjective(f: FlagReader): StoryObjective {
  if (!f("gate_repaired")) {
    if (!f("met_matsui")) return o("NEXTMAKE の前の人に話しかけよう", "入口の前で F", "matsui");
    if (!f("met_saeki")) return o("ラボで右腕を見てもらおう", "マツイ社長について、NEXTMAKE の奥の「LAB」へ", "saeki");
    if (!f("ido_hint_heard")) return o("表のマツイ社長に、帰る方法を相談しよう", "それまで社内を見て回ってもいい", "matsui");
    const left = idoMarkersLeft(f);
    const sub =
      left.length === 3
        ? "石標 A・B・C の QR を F で読む（順番は自由）"
        : `あと：${left.map((k) => IDO_MARKER_NAMES[k]).join("・")}`;
    return o("IDOの石標を調べよう", sub, "ido_markers");
  }
  // 1726年から戻ったあと
  if (!f("drawing_confirmed")) {
    if (!f("fixture_made")) {
      if (!f("genbei_story_told")) return o("マツイ社長に源兵衛のことを話そう", "NEXTMAKE の前の石標のそばにいる", "matsui");
      return o("ラボで佐伯さんに絵図を見せよう", "NEXTMAKE の奥の「LAB」へ", "saeki");
    }
    return o("佐伯さんの固定具を受け取ろう", "ラボの作業台で F", "saeki");
  }
  return o("2086年へ戻ろう", "NEXTMAKE の前の石標の光で F", "ido");
}

/**
 * 1726年の導入（導入編 7-1〜7-5）：町を歩く（うわさ）→ おはるについて工房へ → 源兵衛の話 → 黒い輪を見る。
 * 黒い輪を見たあと（水門の危機）と、水門を直したあとは null（edoObjective・GateFlow の目標を使う）。
 * 古いセーブ（met_genbei だけ立っている）は、おはるにはもう会ったものとして扱う
 */
export function edoIntroObjective(f: FlagReader): StoryObjective | null {
  if (f("gate_repaired") || f("black_ring_seen")) return null;
  if (!f("met_oharu") && !f("met_genbei")) return o("仕掛け横丁を歩いてみよう", "町の人のうわさ話が聞こえる", "");
  if (!f("met_genbei")) return o("おはるについて行こう", "からくり職人・源兵衛の工房へ", "oharu");
  return o("源兵衛の話を聞こう", "工房の前で F", "genbei");
}

/** 1726年：水門修理（GateFlow の目標）→ 帰還 */
export function edoObjective(f: FlagReader): StoryObjective {
  if (!f("gate_repaired")) return o("大歯車を支えて、水門を直そう", "桟橋から照準を歯車へ向けて J でつかむ", "gate_gear");
  return o("2026年へ戻ろう", "通りに開いた光の輪で F", "return_point");
}

/** 2086年：祭りの朝 → オルム → IDO 展示（2026年へ）→ 帰還してソラに見せる（既定の文言。2086年のステージが上書きしてよい） */
export function futureObjective(f: FlagReader): StoryObjective {
  if (f("drawing_confirmed")) return o("ソラに絵図と固定具を見せよう", "時代博覧祭の IDO 展示へ", "sora");
  if (!f("festival_morning_seen")) return o("ソラと祭りの準備をしよう", "時代博覧祭の会場へ", "festival");
  if (!f("ido_exhibit_used")) return o("ソラの IDO 展示を体験しよう", "展示装置で F", "exhibit");
  return o("ソラの IDO 展示を体験しよう", "展示装置で F", "exhibit");
}

export function storyObjective(era: number, f: FlagReader): StoryObjective {
  switch (era) {
    case ERA_PRESENT:
      return presentObjective(f);
    case ERA_EDO:
      return edoObjective(f);
    case ERA_FUTURE:
      return futureObjective(f);
  }
  return o("", "", "");
}
