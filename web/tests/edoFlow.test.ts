// 1726年・水門パズルの通しテスト（Godot 版 tests/edo_flow_test.gd のロジック部分を移植）。
// 元のテストは実シーンで「歯車の設置 → 早すぎる解除 → 舟が通る間の解除 → おはるの合図で解除 → フラグ確定」を確かめる。
// ここではシーンを使わず、GatePuzzleLogic + TimelineState + QuestDirector + SaveManager の組み合わせで同じ流れを確かめる。
// （歯車を遠くで離すと元へ戻る・堰板や水位の見た目などシーン側の検証は含まない）
import { describe, expect, it } from "vitest";
import { GatePhase, GatePuzzleLogic, GateResult } from "../src/core/gatePuzzleLogic";
import { objective } from "../src/core/questDirector";
import { SaveManager } from "../src/core/saveManager";
import { ERA_EDO, ERA_PRESENT } from "../src/core/eras";
import { TimelineState } from "../src/core/timelineState";
import { FakeStorage } from "./helpers";

const DT = 1.0 / 60.0;

/** 秒数ぶん 1/60 秒刻みで tick する。調整完了が起きた回数を返す。 */
function advance(logic: GatePuzzleLogic, seconds: number): number {
  let completions = 0;
  for (let t = 0.0; t < seconds; t += DT) {
    if (logic.tick(DT)) {
      completions += 1;
    }
  }
  return completions;
}

/** 条件が満たされるまで tick する（上限秒数を超えたら止める）。経過秒数を返す。 */
function advanceUntil(logic: GatePuzzleLogic, done: () => boolean, limitSeconds: number): number {
  let t = 0.0;
  while (!done() && t < limitSeconds) {
    logic.tick(DT);
    t += DT;
  }
  return t;
}

/**
 * 水門から手を離したときのシーン側の処理（scripts/eras/edo_canal.gd の _on_gate_released / _on_puzzle_success）を
 * 状態へ反映する。ロジックの結果に応じて計測値とフラグを更新するだけの薄い橋渡し。
 */
function onGateReleased(logic: GatePuzzleLogic, state: TimelineState): GateResult {
  const r = logic.release();
  switch (r) {
    case GateResult.TOO_EARLY:
      state.addMetric("release_too_early");
      break;
    case GateResult.PERSON_IN_DANGER:
      state.addMetric("release_person_danger");
      break;
    case GateResult.SUCCESS:
      state.gate_repaired = true;
      state.genbei_drawing_found = true;
      break;
  }
  return r;
}

describe("Edo flow（ロジック層の通しテスト）", () => {
  it("歯車の設置 → 早すぎる解除 → 舟が通る間の解除 → 合図で解除 → フラグ確定 → 自動セーブ", () => {
    const storage = new FakeStorage();
    const save = new SaveManager(storage, "test_slot");
    const state = new TimelineState();
    state.intro_done = true;
    state.met_matsui = true; // 2026年でマツイ社長に会ってから 1726年へ来ている
    state.met_genbei = true;
    state.current_era = ERA_EDO;
    expect(objective(ERA_EDO, state).target, "歯車を運ぶ段階").toBe("gear");

    // 2) 歯車を軸へ置くと gear_placed が立ち、協力パズルが始まる
    state.setFlag("gear_placed", true);
    expect(state.gear_placed, "gear_placed フラグ").toBe(true);
    expect(objective(ERA_EDO, state).target, "大歯車を支える段階").toBe("gate_gear");
    const logic = new GatePuzzleLogic();
    expect(logic.phase, "協力パズルの開始時は WAIT_GRAB").toBe(GatePhase.WAIT_GRAB);

    // 3) 調整中に離す → 早すぎる
    logic.grab();
    advance(logic, 2.0);
    expect(logic.phase, "保持中は源兵衛が調整中").toBe(GatePhase.ADJUSTING);
    expect(onGateReleased(logic, state), "調整中の解除は TOO_EARLY").toBe(GateResult.TOO_EARLY);
    expect(state.metrics["release_too_early"], "早すぎる解除が記録される").toBeGreaterThanOrEqual(1);
    expect(state.gate_repaired, "早すぎる解除では直らない").toBe(false);
    advance(logic, 1.5);

    // 4) 調整を終える → 舟が危険範囲にいる間に離す → 歯止めが受け止める
    logic.grab();
    advanceUntil(logic, () => logic.phase === GatePhase.WAIT_SIGNAL, 12.0);
    expect(logic.phase, "歯止めの調整が終わる").toBe(GatePhase.WAIT_SIGNAL);
    expect(logic.isDanger(), "調整完了時は舟が通っている（待って）").toBe(true);
    expect(logic.signalText()).toBe("待って！ 人がいる");
    expect(onGateReleased(logic, state), "人がいる間の解除は PERSON_IN_DANGER").toBe(GateResult.PERSON_IN_DANGER);
    expect(state.metrics["release_person_danger"], "人がいる時の解除が記録される").toBeGreaterThanOrEqual(1);
    expect(state.gate_repaired, "人がいる時の解除では直らない").toBe(false);
    advance(logic, 3.0);

    // 5) もう一度つかみ、おはるの合図（危険なし）で離す → 成功
    logic.grab();
    advanceUntil(logic, () => !logic.isDanger(), 15.0);
    expect(logic.isDanger(), "舟が通り過ぎて合図が出る").toBe(false);
    expect(logic.signalText()).toBe("今や！ 離して！");
    expect(onGateReleased(logic, state), "合図で離すと SUCCESS").toBe(GateResult.SUCCESS);
    expect(logic.phase).toBe(GatePhase.DONE);
    expect(state.gate_repaired, "gate_repaired = true").toBe(true);
    expect(state.genbei_drawing_found, "genbei_drawing_found = true").toBe(true);
    expect(state.drawing_confirmed, "2026年で確認するまでは drawing_confirmed でない").toBe(false);

    // 自動セーブにフラグが残る
    state.checkpoint = "edo_arrive";
    expect(save.saveGame(state)).toBe(true);
    expect(save.hasSave()).toBe(true);
    expect(save.readSave()?.["gate_repaired"], "自動セーブにフラグが残る").toBe(true);
    save.deleteSave(); // テストで作ったセーブを残さない
    expect(save.hasSave()).toBe(false);

    // 水門が直ると、目標は帰還地点へ → 2026年で記録を確かめる → 異次元拠点へ
    expect(objective(ERA_EDO, state).target).toBe("return_point");
    expect(objective(ERA_PRESENT, state).target).toBe("exhibit");
    expect(state.confirmDrawing()).toBe(true);
    expect(state.future_route_open).toBe(true);
    expect(objective(ERA_PRESENT, state).target).toBe("hub_portal");
  });

  it("早すぎる解除を繰り返しても進捗は残り（半分ずつ）、最後は成功できる", () => {
    const state = new TimelineState();
    const logic = new GatePuzzleLogic();
    for (let i = 0; i < 3; i++) {
      logic.grab();
      advance(logic, 3.0);
      expect(onGateReleased(logic, state)).toBe(GateResult.TOO_EARLY);
    }
    expect(state.metrics["release_too_early"]).toBe(3);
    expect(logic.progress, "進捗は 0 より大きく残る").toBeGreaterThan(0);
    logic.grab();
    expect(advance(logic, 6.0), "最終的に調整は1回だけ完了する").toBe(1);
    expect(logic.phase).toBe(GatePhase.WAIT_SIGNAL);
    expect(logic.isDanger()).toBe(true);
    advanceUntil(logic, () => !logic.isDanger(), 15.0);
    expect(onGateReleased(logic, state)).toBe(GateResult.SUCCESS);
    expect(state.gate_repaired).toBe(true);
  });

  it("操作しなければ進まない: つかまずに放置しても完了も成功もしない", () => {
    const state = new TimelineState();
    const logic = new GatePuzzleLogic();
    expect(advance(logic, 300.0)).toBe(0);
    expect(logic.phase).toBe(GatePhase.WAIT_GRAB);
    expect(logic.boats.length).toBe(0);
    expect(onGateReleased(logic, state)).toBe(GateResult.NONE);
    expect(state.gate_repaired).toBe(false);
  });

  it("仲間がいないと成功しない: 舟が危険範囲にいる間の解除は何度やっても SUCCESS にならない", () => {
    const state = new TimelineState();
    const logic = new GatePuzzleLogic();
    logic.grab();
    advanceUntil(logic, () => logic.phase === GatePhase.WAIT_SIGNAL, 12.0);
    let successes = 0;
    let dangerReleases = 0;
    // 擬似乱数（再現可能）で、つかみ直しと解除をフレームごとにランダムに繰り返す
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let frame = 0; frame < 60 * 120 && logic.phase !== GatePhase.DONE; frame++) {
      logic.tick(DT);
      if (rand() < 0.02) {
        logic.grab();
      }
      if (rand() < 0.02) {
        const wasDanger = logic.isDanger();
        const holding = logic.holding;
        const r = onGateReleased(logic, state);
        if (r === GateResult.SUCCESS) {
          successes += 1;
          expect(wasDanger, "SUCCESS は危険のないときだけ").toBe(false);
        } else if (holding && wasDanger) {
          dangerReleases += 1;
          expect(r, "危険中の解除は PERSON_IN_DANGER").toBe(GateResult.PERSON_IN_DANGER);
        }
      }
    }
    expect(dangerReleases, "テストが危険中の解除を実際に含んでいる").toBeGreaterThan(0);
    expect(successes, "最終的には安全なときに離して成功する").toBe(1);
    expect(state.metrics["release_person_danger"]).toBe(dangerReleases);
  });
});
