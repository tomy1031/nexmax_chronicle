// QuestDirector のテスト。
// Godot 版 tests/chronicle_contract_test.gd の STAGES（物語の各段階）ごとに、
// 目標マーカーの対象ID（target）が期待どおりになることを確かめる。
// シーン・スポーンの検証（実シーンを読み込む部分）は three.js 版のシーン側テストの担当。
import { describe, expect, it } from "vitest";
import { ERA_EDO, ERA_FUTURE, ERA_HUB, ERA_PRESENT } from "../src/core/eras";
import {
  QUEST_TARGETS_BY_ERA,
  objective,
  type QuestProgress,
  type QuestTargetId,
} from "../src/core/questDirector";
import { BOOL_FLAG_NAMES, ROBOTS_TOTAL, TimelineState, type BoolFlagName } from "../src/core/timelineState";

const F_INTRO: BoolFlagName[] = ["intro_done"];
const F_MATSUI: BoolFlagName[] = ["intro_done", "met_matsui"];
const F_GENBEI: BoolFlagName[] = ["intro_done", "met_matsui", "met_genbei"];
const F_GEAR: BoolFlagName[] = ["intro_done", "met_matsui", "met_genbei", "gear_placed"];
const F_GATE: BoolFlagName[] = [
  "intro_done",
  "met_matsui",
  "met_genbei",
  "gear_placed",
  "gate_repaired",
  "genbei_drawing_found",
];
const F_DRAW: BoolFlagName[] = [...F_GATE, "drawing_confirmed"];
const F_SORA: BoolFlagName[] = [...F_DRAW, "met_sora"];

interface Stage {
  label: string;
  era: number;
  spawn: string;
  flags: BoolFlagName[];
  robots: number;
  /** 期待する目標マーカーの対象ID */
  target: QuestTargetId;
}

/** [説明, 時代, スポーンID, フラグ, 倒した警備ロボ数] ＋ 期待する target。契約テストの STAGES と同じ並び。 */
const STAGES: Stage[] = [
  { label: "2086 冒頭（経路閉鎖から逃げる）", era: 2086, spawn: "future_intro", flags: [], robots: 0, target: "intro_goal" },
  { label: "2026 到着（マツイ社長に会う）", era: 2026, spawn: "present_start", flags: F_INTRO, robots: 0, target: "matsui" },
  { label: "2026 IDOを調べる", era: 2026, spawn: "present_start", flags: F_MATSUI, robots: 0, target: "ido" },
  { label: "1726 到着（からくり人形を追う）", era: 1726, spawn: "edo_arrive", flags: F_MATSUI, robots: 0, target: "genbei" },
  { label: "1726 大歯車を軸へ", era: 1726, spawn: "edo_arrive", flags: F_GENBEI, robots: 0, target: "gear" },
  { label: "1726 大歯車を支える", era: 1726, spawn: "edo_arrive", flags: F_GEAR, robots: 0, target: "gate_gear" },
  { label: "1726 帰還地点へ", era: 1726, spawn: "edo_arrive", flags: F_GATE, robots: 0, target: "return_point" },
  { label: "2026 帰還（記録を確かめる）", era: 2026, spawn: "present_ido", flags: F_GATE, robots: 0, target: "exhibit" },
  { label: "2026 異次元拠点へ", era: 2026, spawn: "present_ido", flags: F_DRAW, robots: 0, target: "hub_portal" },
  { label: "拠点 2086年へ", era: 0, spawn: "hub_start", flags: F_DRAW, robots: 0, target: "future_gate" },
  { label: "2026 拠点から戻る", era: 2026, spawn: "present_portal", flags: F_DRAW, robots: 0, target: "hub_portal" },
  { label: "2086 帰還（ソラに会う）", era: 2086, spawn: "future_return", flags: F_DRAW, robots: 0, target: "sora" },
  { label: "2086 警備ロボを停止", era: 2086, spawn: "future_return", flags: F_SORA, robots: 0, target: "robots" },
  { label: "2086 セントラルタワーへ", era: 2086, spawn: "future_return", flags: F_SORA, robots: 2, target: "goal" },
];

/** 契約テストと同じ作り方：reset → フラグを立てる → ロボ撃破数 → 時代。 */
function stateFor(stage: Stage): TimelineState {
  const ts = new TimelineState();
  for (const f of stage.flags) {
    ts.setFlag(f, true);
  }
  ts.robots_defeated = stage.robots;
  return ts;
}

describe("QuestDirector.objective: 物語の各段階の目標（chronicle_contract_test の STAGES）", () => {
  it("STAGES は契約テストと同じ14段階", () => {
    expect(STAGES.length).toBe(14);
  });

  for (const stage of STAGES) {
    it(`${stage.label}（${stage.era} / ${stage.spawn}）→ target=${stage.target}`, () => {
      const o = objective(stage.era, stateFor(stage));
      expect(o.target, `目標「${o.title}」の対象`).toBe(stage.target);
      expect(o.title.length, "目標の文言がある").toBeGreaterThan(0);
      expect(o.sub.length, "補足の文言がある").toBeGreaterThan(0);
      // 期待する target は、その時代の目標が取りうる対象IDの表に載っている
      expect(QUEST_TARGETS_BY_ERA[stage.era]).toContain(o.target);
    });
  }
});

describe("QuestDirector.objective: 文言と補足", () => {
  it("各段階の title / sub（Godot 版と同じ文言）", () => {
    const text = (stage: Stage): [string, string] => {
      const o = objective(stage.era, stateFor(stage));
      return [o.title, o.sub];
    };
    expect(text(STAGES[0])).toEqual(["閉じていく道から逃げよう", "ルートが通路を閉鎖している"]);
    expect(text(STAGES[1])).toEqual(["なんばを調べよう", "水路沿いに誰かいる"]);
    expect(text(STAGES[2])).toEqual(["IDOマーカーをスキャンする", "水路沿いの石の標識を F で調べよう"]);
    expect(text(STAGES[3])).toEqual(["からくり人形を追いかけよう", "仕掛け横丁で源兵衛をたずねよう"]);
    expect(text(STAGES[4])).toEqual(["外れた大歯車を水門の軸へ戻そう", "NMクローでつかんで運ぶ"]);
    expect(text(STAGES[5])).toEqual(["大歯車を支えて、水門を直そう", "源兵衛の調整とおはるの合図を待つ"]);
    expect(text(STAGES[6])).toEqual(["帰還地点から2026年へ戻ろう", "光の輪で F"]);
    expect(text(STAGES[7])).toEqual(["旧水門跡の記録を確かめよう", "IDOの隣の展示が変わっている"]);
    expect(text(STAGES[8])).toEqual(["異次元拠点へ向かおう", "光の扉から未来の座標を復元しよう"]);
    expect(text(STAGES[9])).toEqual(["2086年へ戻ろう", "回復と装備を整えたら未来への扉へ"]);
    expect(text(STAGES[11])).toEqual(["開いた保守路へ向かおう", "閉じていたはずの通路に誰かいる"]);
    expect(text(STAGES[12])).toEqual(["警備ロボを停止させよう（0/2）", "盾をクローで引きはがして攻撃"]);
    expect(text(STAGES[13])).toEqual(["セントラルタワーを目指そう", "ナンバタウンの新しいルートから向かおう"]);
  });

  it("警備ロボの進捗が目標の文言に出る（0/2 → 1/2 → セントラルタワー）", () => {
    const base = STAGES[12];
    const o0 = objective(2086, stateFor({ ...base, robots: 0 }));
    const o1 = objective(2086, stateFor({ ...base, robots: 1 }));
    const o2 = objective(2086, stateFor({ ...base, robots: ROBOTS_TOTAL }));
    expect(o0.title).toBe("警備ロボを停止させよう（0/2）");
    expect(o1.title).toBe("警備ロボを停止させよう（1/2）");
    expect(o1.target).toBe("robots");
    expect(o2.target).toBe("goal");
  });

  it("拠点: 絵図が確定していなければ「最後のチェックポイントへ」（2026年への扉）", () => {
    const o = objective(ERA_HUB, new TimelineState());
    expect(o).toEqual({ title: "最後のチェックポイントへ戻ろう", sub: "2026年への扉", target: "present_gate" });
  });

  it("未定義の時代は空の目標を返す", () => {
    expect(objective(1999, new TimelineState())).toEqual({ title: "", sub: "", target: "" });
  });
});

describe("QuestDirector.objective: 純粋関数であること", () => {
  it("TimelineState でなく必要なフラグだけの素のオブジェクトでも動く", () => {
    const progress: QuestProgress = {
      intro_done: true,
      met_sora: false,
      robots_defeated: 0,
      met_matsui: false,
      gate_repaired: false,
      drawing_confirmed: false,
      met_genbei: false,
      gear_placed: false,
    };
    expect(objective(ERA_FUTURE, progress).target).toBe("sora");
    expect(objective(ERA_PRESENT, progress).target).toBe("matsui");
    expect(objective(ERA_EDO, progress).target).toBe("genbei");
  });

  it("状態を書き換えない・同じ入力には同じ結果を返す", () => {
    const ts = new TimelineState();
    ts.setFlag("intro_done", true);
    const before = JSON.stringify(ts);
    const a = objective(ERA_FUTURE, ts);
    const b = objective(ERA_FUTURE, ts);
    expect(a).toEqual(b);
    expect(JSON.stringify(ts)).toBe(before);
  });

  it("セーブ→ロード後も同じ目標になる（保存されたフラグだけから決まる）", () => {
    for (const stage of STAGES) {
      const src = stateFor(stage);
      const dst = new TimelineState();
      dst.fromJSON(JSON.parse(JSON.stringify(src)));
      expect(objective(stage.era, dst), stage.label).toEqual(objective(stage.era, src));
    }
  });
});

describe("QuestDirector.objective: 全フラグの組み合わせ", () => {
  it("どの組み合わせでも target は QUEST_TARGETS_BY_ERA の範囲内で、表の全 target に到達できる", () => {
    const eras = [ERA_FUTURE, ERA_PRESENT, ERA_EDO, ERA_HUB];
    const names = BOOL_FLAG_NAMES;
    const reached = new Map<number, Set<string>>(eras.map((e) => [e, new Set<string>()]));
    for (let mask = 0; mask < 1 << names.length; mask++) {
      for (let robots = 0; robots <= ROBOTS_TOTAL + 1; robots++) {
        const progress = { robots_defeated: robots } as Record<string, boolean | number>;
        names.forEach((n, i) => {
          progress[n] = (mask & (1 << i)) !== 0;
        });
        for (const era of eras) {
          const o = objective(era, progress as unknown as QuestProgress);
          expect(QUEST_TARGETS_BY_ERA[era], `era=${era} mask=${mask}`).toContain(o.target);
          expect(o.title.length).toBeGreaterThan(0);
          reached.get(era)?.add(o.target);
        }
      }
    }
    for (const era of eras) {
      expect([...(reached.get(era) ?? [])].sort(), `era=${era} の到達可能な target`).toEqual(
        [...QUEST_TARGETS_BY_ERA[era]].sort(),
      );
    }
  });
});
