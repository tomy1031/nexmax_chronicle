// 次の目標とイベント条件（仕様 §14.2 QuestDirector）。
// 保存されたフラグだけから目標を決めるので、ロード後も同じ表示になる。
// Godot 版はグローバルの TimelineState を読んでいたが、こちらは状態を引数で受け取る純粋関数。

import { ERA_EDO, ERA_FUTURE, ERA_HUB, ERA_PRESENT } from "./eras";
import { ROBOTS_TOTAL } from "./timelineState";

/** 目標マーカーの対象ID（各時代のシーンがこのIDで目標の位置を持つ） */
export type QuestTargetId =
  | "intro_goal"
  | "sora"
  | "robots"
  | "goal"
  | "matsui"
  | "ido"
  | "exhibit"
  | "hub_portal"
  | "genbei"
  | "gear"
  | "gate_gear"
  | "return_point"
  | "future_gate"
  | "present_gate"
  | ""; // 未定義の時代

export interface Objective {
  /** 目標 */
  title: string;
  /** 補足 */
  sub: string;
  /** 目標マーカーの対象ID */
  target: QuestTargetId;
}

/** 目標の決定に使う進行フラグ。TimelineState をそのまま渡せる（テストでは素のオブジェクトでもよい）。 */
export interface QuestProgress {
  readonly intro_done: boolean;
  readonly met_sora: boolean;
  readonly robots_defeated: number;
  readonly met_matsui: boolean;
  readonly gate_repaired: boolean;
  readonly drawing_confirmed: boolean;
  readonly met_genbei: boolean;
  readonly gear_placed: boolean;
}

/** 各時代の目標が取りうる対象ID。シーン側が全部の位置を用意できているかの検証に使う。 */
export const QUEST_TARGETS_BY_ERA: Readonly<Record<number, readonly QuestTargetId[]>> = {
  [ERA_FUTURE]: ["intro_goal", "sora", "robots", "goal"],
  [ERA_PRESENT]: ["matsui", "ido", "exhibit", "hub_portal"],
  [ERA_EDO]: ["genbei", "gear", "gate_gear", "return_point"],
  [ERA_HUB]: ["future_gate", "present_gate"],
};

function o(title: string, sub: string, target: QuestTargetId): Objective {
  return { title, sub, target };
}

export function objective(era: number, state: QuestProgress): Objective {
  const t = state;
  switch (era) {
    case ERA_FUTURE:
      if (!t.intro_done) {
        return o("閉じていく道から逃げよう", "ルートが通路を閉鎖している", "intro_goal");
      }
      if (!t.met_sora) {
        return o("開いた保守路へ向かおう", "閉じていたはずの通路に誰かいる", "sora");
      }
      if (t.robots_defeated < ROBOTS_TOTAL) {
        return o(
          `警備ロボを停止させよう（${t.robots_defeated}/${ROBOTS_TOTAL}）`,
          "盾をクローで引きはがして攻撃",
          "robots",
        );
      }
      return o("セントラルタワーを目指そう", "ナンバタウンの新しいルートから向かおう", "goal");
    case ERA_PRESENT:
      if (!t.met_matsui) {
        return o("なんばを調べよう", "水路沿いに誰かいる", "matsui");
      }
      if (!t.gate_repaired) {
        return o("IDOマーカーをスキャンする", "水路沿いの石の標識を F で調べよう", "ido");
      }
      if (!t.drawing_confirmed) {
        return o("旧水門跡の記録を確かめよう", "IDOの隣の展示が変わっている", "exhibit");
      }
      return o("異次元拠点へ向かおう", "光の扉から未来の座標を復元しよう", "hub_portal");
    case ERA_EDO:
      if (!t.met_genbei) {
        return o("からくり人形を追いかけよう", "仕掛け横丁で源兵衛をたずねよう", "genbei");
      }
      if (!t.gear_placed) {
        return o("外れた大歯車を水門の軸へ戻そう", "NMクローでつかんで運ぶ", "gear");
      }
      if (!t.gate_repaired) {
        return o("大歯車を支えて、水門を直そう", "源兵衛の調整とおはるの合図を待つ", "gate_gear");
      }
      return o("帰還地点から2026年へ戻ろう", "光の輪で F", "return_point");
    case ERA_HUB:
      if (t.drawing_confirmed) {
        return o("2086年へ戻ろう", "回復と装備を整えたら未来への扉へ", "future_gate");
      }
      return o("最後のチェックポイントへ戻ろう", "2026年への扉", "present_gate");
  }
  return o("", "", "");
}
