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

/** 2026年：マツイ社長 → ラボの佐伯 → IDO（1726年へ）→ 帰還して報告 → 佐伯の固定具 → IDO（2086年へ） */
export function presentObjective(f: FlagReader): StoryObjective {
  if (!f("gate_repaired")) {
    if (!f("met_matsui")) return o("マツイ社長に話しかけよう", "NEXTMAKE の入口の前で F", "matsui");
    if (!f("met_saeki")) return o("ラボの佐伯さんに会おう", "NEXTMAKE のオフィスの奥、「LAB」へ", "saeki");
    return o("IDOマーカーを調べよう", "水路沿いの石の標識で F", "ido");
  }
  // 1726年から戻ったあと
  if (!f("drawing_confirmed")) {
    if (!f("fixture_made")) {
      if (!f("genbei_story_told")) return o("マツイ社長に源兵衛のことを話そう", "IDOマーカーの近くにいる", "matsui");
      return o("ラボで佐伯さんに絵図を見せよう", "NEXTMAKE の奥の「LAB」へ", "saeki");
    }
    return o("佐伯さんの固定具を受け取ろう", "ラボの作業台で F", "saeki");
  }
  return o("2086年へ戻ろう", "IDOマーカーの光で F", "ido");
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
