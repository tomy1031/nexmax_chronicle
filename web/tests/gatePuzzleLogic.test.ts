// GatePuzzleLogic のユニットテスト（Godot 版 tests/run_tests.gd の gate: 19件を移植 + TS 版の追加分）
import { describe, expect, it } from "vitest";
import {
  ADJUST_TIME,
  BOAT_DESPAWN_X,
  BOAT_PERIOD,
  BOAT_SPAWN_X,
  BOAT_SPEED,
  DANGER_MAX_X,
  DANGER_MIN_X,
  FIRST_SIGNAL_BOAT_X,
  GatePhase,
  GatePuzzleLogic,
  GateResult,
  LINGER_MARGIN,
} from "../src/core/gatePuzzleLogic";
import { near } from "./helpers";

/** 保持を続けて調整完了まで進める。完了した tick で true が返った回数と、経過時間を返す。 */
function holdUntilRatchet(
  p: GatePuzzleLogic,
  step = 1.0 / 60.0,
  limitSeconds = 30.0,
): { elapsed: number; completions: number } {
  let elapsed = 0.0;
  let completions = 0;
  while (elapsed < limitSeconds) {
    const done = p.tick(step);
    elapsed += step;
    if (done) {
      completions += 1;
      break;
    }
  }
  return { elapsed, completions };
}

/** WAIT_SIGNAL まで進めたパズルを返す（舟は必ず危険範囲にいる）。 */
function inWaitSignal(): GatePuzzleLogic {
  const p = new GatePuzzleLogic();
  p.grab();
  holdUntilRatchet(p);
  return p;
}

describe("GatePuzzleLogic", () => {
  it("gate: 初期状態（WAIT_GRAB / 進捗0 / 舟なし）", () => {
    const p = new GatePuzzleLogic();
    expect(p.phase, "phase は WAIT_GRAB").toBe(GatePhase.WAIT_GRAB);
    near(p.progress, 0.0, "progress は 0");
    expect(p.holding, "holding は false").toBe(false);
    expect(p.boats.length, "舟はいない").toBe(0);
    expect(p.isDanger(), "危険ではない").toBe(false);
  });

  it("gate: 最初の grab までは舟が出ない・進まない", () => {
    const p = new GatePuzzleLogic();
    let anyDone = false;
    for (let i = 0; i < 120; i++) {
      if (p.tick(1.0)) {
        anyDone = true;
      }
    }
    expect(anyDone, "grab 前に調整完了は起きない").toBe(false);
    expect(p.boats.length, "120秒経っても grab 前は舟が出ない").toBe(0);
    expect(p.phase, "phase は WAIT_GRAB のまま").toBe(GatePhase.WAIT_GRAB);
    near(p.progress, 0.0, "進捗は 0 のまま");
    near(p.spawnTimer, 4.0, "spawnTimer も減らない");
  });

  it("gate: grab で ADJUSTING に入る", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    expect(p.holding, "holding が true").toBe(true);
    expect(p.phase, "ADJUSTING に入る").toBe(GatePhase.ADJUSTING);
    p.grab(); // 二重 grab は無害
    expect(p.phase, "二重 grab でも ADJUSTING").toBe(GatePhase.ADJUSTING);
    expect(p.holding, "二重 grab でも holding").toBe(true);
  });

  it("gate: 保持している間だけ進捗が進む", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    expect(p.tick(3.0), "半分では完了しない").toBe(false);
    near(p.progress, 0.5, "3秒保持で進捗 0.5");
    expect(p.phase, "まだ ADJUSTING").toBe(GatePhase.ADJUSTING);
    // 保持していなければ進まない
    p.holding = false;
    p.tick(2.0);
    near(p.progress, 0.5, "holding=false の間は進捗が進まない");
  });

  it("gate: ADJUST_TIME 保持で完了（tick が true を1回だけ返す）→ WAIT_SIGNAL", () => {
    let p = new GatePuzzleLogic();
    p.grab();
    let completions = 0;
    let elapsed = 0.0;
    let completedAt = -1.0;
    const step = 1.0 / 60.0;
    const frames = Math.trunc(ADJUST_TIME / step) + 600;
    for (let i = 0; i < frames; i++) {
      const done = p.tick(step);
      elapsed += step;
      if (done) {
        completions += 1;
        completedAt = elapsed;
      }
    }
    expect(completions, "tick が true を返すのは1回だけ").toBe(1);
    // ADJUST_TIME ちょうど（浮動小数の誤差で最大1フレーム遅れてよい）
    expect(
      completedAt >= ADJUST_TIME - step && completedAt <= ADJUST_TIME + step * 2.0,
      `完了は ADJUST_TIME(${ADJUST_TIME.toFixed(1)}s) 付近（実際 ${completedAt.toFixed(3)}s）`,
    ).toBe(true);
    expect(p.phase, "WAIT_SIGNAL に移る").toBe(GatePhase.WAIT_SIGNAL);
    near(p.progress, 1.0, "進捗は 1.0");
    expect(p.holding, "完了しても holding は維持").toBe(true);
    // 1回の大きな tick でも完了する
    p = new GatePuzzleLogic();
    p.grab();
    expect(p.tick(ADJUST_TIME), "ADJUST_TIME ぶんの1tickで完了").toBe(true);
    expect(p.phase, "WAIT_SIGNAL").toBe(GatePhase.WAIT_SIGNAL);
    near(p.progress, 1.0, "進捗は 1.0（上限）");
    expect(p.tick(1.0), "完了後の tick は false").toBe(false);
  });

  it("gate: 調整完了の瞬間に危険範囲へ必ず舟がいる（待機時間を変えても）", () => {
    // 1) 素直に保持し続けた場合
    const p = inWaitSignal();
    expect(p.phase, "前提: WAIT_SIGNAL").toBe(GatePhase.WAIT_SIGNAL);
    expect(p.isDanger(), "素直に保持: 完了時に危険範囲へ舟がいる").toBe(true);
    // 2) 途中で離して待ち時間を変えてからつかみ直した場合（舟の出現タイミングがずれる）
    const failures: string[] = [];
    for (let wait = 0.0; wait <= 40.0; wait += 0.5) {
      const q = new GatePuzzleLogic();
      q.grab();
      q.tick(3.0);
      q.release();
      let waited = 0.0;
      while (waited < wait) {
        q.tick(0.25);
        waited += 0.25;
      }
      q.grab();
      const r = holdUntilRatchet(q);
      if (q.phase !== GatePhase.WAIT_SIGNAL) {
        failures.push(`wait=${wait.toFixed(2)}: WAIT_SIGNAL に入らなかった`);
      } else if (!q.isDanger()) {
        failures.push(`wait=${wait.toFixed(2)}: 完了時に危険範囲に舟がいない boats=${JSON.stringify(q.boats)}`);
      } else if (r.completions !== 1) {
        failures.push(`wait=${wait.toFixed(2)}: 完了イベントが ${r.completions} 回`);
      }
    }
    expect(failures, `待機時間を変えると舟が危険範囲にいないことがある: ${failures.slice(0, 3)}`).toEqual([]);
  });

  it("gate: 既に危険範囲に舟がいれば追加で出さない", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.spawnTimer = 1000.0;
    p.boats.push(23.0); // 既に危険範囲にいる（完了tickの移動後も範囲内に残る位置）
    expect(p.tick(ADJUST_TIME), "調整完了").toBe(true);
    expect(p.boats.length, "舟は増えない").toBe(1);
    expect(p.isDanger(), "危険のまま").toBe(true);
    near(p.spawnTimer, BOAT_PERIOD, "次の舟まで BOAT_PERIOD をまるごと空ける（合図の窓を保証）");
  });

  it("gate: 早く離す（ADJUSTING）と TOO_EARLY・進捗半減・WAIT_GRAB", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.tick(3.0);
    near(p.progress, 0.5, "前提: 進捗 0.5");
    expect(p.release(), "早く離すと TOO_EARLY").toBe(GateResult.TOO_EARLY);
    near(p.progress, 0.25, "進捗は半分(EARLY_KEEP)になる");
    expect(p.phase, "WAIT_GRAB に戻る").toBe(GatePhase.WAIT_GRAB);
    expect(p.holding, "holding は false").toBe(false);
    // つかみ直すと残った進捗から再開できる
    p.grab();
    expect(p.phase, "つかみ直しで ADJUSTING").toBe(GatePhase.ADJUSTING);
    near(p.progress, 0.25, "進捗は保持される");
    expect(p.tick(4.0), "あと 4.5秒 必要なので 4.0 秒ではまだ完了しない").toBe(false);
    expect(p.tick(0.5), "合計 4.5 秒で完了").toBe(true);
    expect(p.phase, "WAIT_SIGNAL").toBe(GatePhase.WAIT_SIGNAL);
  });

  it("gate: 進捗0で離しても TOO_EARLY で WAIT_GRAB に戻る", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    expect(p.release(), "つかんですぐ離しても TOO_EARLY").toBe(GateResult.TOO_EARLY);
    near(p.progress, 0.0, "進捗は 0 のまま");
    expect(p.phase, "WAIT_GRAB").toBe(GatePhase.WAIT_GRAB);
  });

  it("gate: 保持していない release は NONE", () => {
    const p = new GatePuzzleLogic();
    expect(p.release(), "つかんでいないときの release は NONE").toBe(GateResult.NONE);
    p.grab();
    p.release();
    expect(p.release(), "離した直後の再 release も NONE").toBe(GateResult.NONE);
  });

  it("gate: 危険中の release は PERSON_IN_DANGER（WAIT_SIGNAL のまま・holding=false）", () => {
    const p = inWaitSignal();
    expect(p.isDanger(), "前提: 危険").toBe(true);
    expect(p.release(), "危険中に離すと PERSON_IN_DANGER").toBe(GateResult.PERSON_IN_DANGER);
    expect(p.phase, "phase は WAIT_SIGNAL のまま").toBe(GatePhase.WAIT_SIGNAL);
    expect(p.holding, "holding は false").toBe(false);
    near(p.progress, 1.0, "進捗は保持される");
    expect(p.release(), "離した状態での再 release は NONE").toBe(GateResult.NONE);
  });

  it("gate: つかみ直して安全になってから離すと SUCCESS → DONE", () => {
    const p = inWaitSignal();
    expect(p.release(), "前提: 危険中に離して失敗").toBe(GateResult.PERSON_IN_DANGER);
    p.grab();
    expect(p.holding, "つかみ直すと holding").toBe(true);
    expect(p.phase, "つかみ直しても WAIT_SIGNAL のまま").toBe(GatePhase.WAIT_SIGNAL);
    let elapsed = 0.0;
    while (p.isDanger() && elapsed < 40.0) {
      expect(p.tick(0.1), "WAIT_SIGNAL 中の tick は完了イベントを出さない").toBe(false);
      elapsed += 0.1;
    }
    expect(p.isDanger(), `舟が通り過ぎて安全になる（${elapsed.toFixed(1)}s 以内）`).toBe(false);
    expect(p.signalText(), "安全になったら合図が変わる").toBe("今や！ 離して！");
    expect(p.release(), "安全なときに離すと SUCCESS").toBe(GateResult.SUCCESS);
    expect(p.phase, "DONE").toBe(GatePhase.DONE);
    expect(p.holding, "holding は false").toBe(false);
  });

  it("gate: DONE は終端（舟が止まり release は NONE）", () => {
    const p = inWaitSignal();
    p.release(); // 危険中: PERSON_IN_DANGER
    p.grab();
    let elapsed = 0.0;
    while (p.isDanger() && elapsed < 40.0) {
      p.tick(0.1);
      elapsed += 0.1;
    }
    expect(p.release(), "前提: SUCCESS").toBe(GateResult.SUCCESS);
    const boatsBefore = [...p.boats];
    expect(p.tick(5.0), "DONE の tick は false").toBe(false);
    expect(p.boats, "DONE 後は舟が動かない／増えない").toEqual(boatsBefore);
    p.grab();
    expect(p.release(), "DONE 後の release は NONE").toBe(GateResult.NONE);
    expect(p.phase, "DONE のまま").toBe(GatePhase.DONE);
  });

  it("gate: signalText が各状態の文言を返す", () => {
    const p = new GatePuzzleLogic();
    expect(p.signalText(), "WAIT_GRAB").toBe("見張り中");
    p.grab();
    expect(p.signalText(), "ADJUSTING").toBe("見張り中");
    p.tick(ADJUST_TIME);
    expect(p.isDanger(), "前提: 危険").toBe(true);
    expect(p.signalText(), "WAIT_SIGNAL（危険）").toBe("待って！ 人がいる");
    p.boats.length = 0;
    expect(p.isDanger(), "前提: 舟を除くと安全").toBe(false);
    expect(p.signalText(), "WAIT_SIGNAL（安全）").toBe("今や！ 離して！");
    p.phase = GatePhase.DONE;
    expect(p.signalText(), "DONE").toBe("安全確認よし");
  });

  it("gate: 危険範囲の境界（5.0〜24.0 を含む）", () => {
    const lo = DANGER_MIN_X;
    const hi = DANGER_MAX_X;
    const cases: Array<[number, boolean]> = [
      [lo, true],
      [hi, true],
      [(lo + hi) * 0.5, true],
      [lo - 0.01, false],
      [hi + 0.01, false],
      [-10.0, false],
      [40.0, false],
    ];
    for (const [x, expected] of cases) {
      const p = new GatePuzzleLogic();
      p.boats.push(x);
      expect(p.isDanger(), `x=${x} の isDanger`).toBe(expected);
    }
    const p2 = new GatePuzzleLogic();
    p2.boats.push(hi + 5.0);
    p2.boats.push(lo - 5.0);
    expect(p2.isDanger(), "範囲の外側に2艘いても危険ではない").toBe(false);
    p2.boats.push(10.0);
    expect(p2.isDanger(), "1艘でも範囲内なら危険").toBe(true);
  });

  it("gate: 舟は -x 方向へ BOAT_SPEED で進む", () => {
    const p = new GatePuzzleLogic();
    p.boats.push(20.0);
    p.tick(1.0);
    expect(p.boats.length, "舟は1艘のまま（grab 前は新規出現なし）").toBe(1);
    near(p.boats[0], 20.0 - BOAT_SPEED, "1秒で BOAT_SPEED ぶん -x へ進む");
    p.tick(2.0);
    near(p.boats[0], 20.0 - BOAT_SPEED * 3.0, "さらに2秒進む");
  });

  it("gate: 舟は BOAT_DESPAWN_X を過ぎると消える", () => {
    const p = new GatePuzzleLogic();
    const despawn = BOAT_DESPAWN_X;
    p.boats.push(despawn + 1.0); // 1秒後に下限を過ぎる
    p.boats.push(despawn + 20.0); // まだ残る
    p.tick(1.0);
    expect(p.boats.length, "下流端を過ぎた舟だけが消える").toBe(1);
    near(p.boats[0], despawn + 20.0 - BOAT_SPEED, "残った舟は進んでいる");
  });

  it("gate: 舟は spawnTimer 経過で BOAT_SPAWN_X に出現し BOAT_PERIOD で再装填", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.tick(3.9);
    expect(p.boats.length, "spawnTimer(4.0) 手前では出ない").toBe(0);
    p.tick(0.11); // 浮動小数の誤差で境界ちょうどを避ける
    expect(p.boats.length, "spawnTimer 経過で1艘出現").toBe(1);
    near(p.boats[0], BOAT_SPAWN_X, "BOAT_SPAWN_X に出現");
    near(p.spawnTimer, BOAT_PERIOD, "spawnTimer は BOAT_PERIOD に再装填");
    // 離して待機（進捗>0 なので舟は出続ける）。BOAT_PERIOD 経過で次が出る
    p.release();
    expect(p.progress > 0.0, "前提: 進捗は残っている").toBe(true);
    p.tick(BOAT_PERIOD);
    expect(p.boats.length, "BOAT_PERIOD 後に2艘目").toBe(2);
  });

  // Godot 版では既知の問題だったが、tick で舟を先に動かしてから完了を判定する修正で解消済み。
  // 判定を「いま危険範囲にいるか」から「危険範囲の下端から LINGER_MARGIN 以上内側に残る舟がいるか」に変えている。
  it("gate: 調整完了と同じtickで舟が危険範囲外へ出ても、完了直後は危険範囲に舟がいる", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.spawnTimer = 1000.0;
    p.boats.push(DANGER_MIN_X + 0.01);
    p.progress = 1.0 - 0.0001;
    const done = p.tick(1.0 / 60.0);
    expect(done, "前提: このtickで調整が完了する").toBe(true);
    expect(p.phase, "前提: WAIT_SIGNAL").toBe(GatePhase.WAIT_SIGNAL);
    expect(p.isDanger(), `完了直後に危険範囲へ舟がいない boats=${JSON.stringify(p.boats)}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TS 版で追加した検証（Godot 版のテストにはないもの）
// ---------------------------------------------------------------------------
describe("GatePuzzleLogic（TS 版の追加検証）", () => {
  it("LINGER_MARGIN は 3m（調整完了時に危険範囲の内側へ3m以上残る舟を保証する）", () => {
    expect(LINGER_MARGIN).toBe(3.0);
  });

  it("出口ぎりぎり（危険範囲の下端から 3m 未満）の舟だけなら追加で FIRST_SIGNAL_BOAT_X に出す", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.spawnTimer = 1000.0;
    p.progress = 1.0 - 0.0001;
    p.boats.push(DANGER_MIN_X + 3.0 - 0.5); // 危険範囲にはいるが、すぐ出てしまう位置
    p.tick(1.0 / 60.0);
    expect(p.phase).toBe(GatePhase.WAIT_SIGNAL);
    expect(p.boats.length, "舟が1艘追加される").toBe(2);
    expect(p.boats).toContain(FIRST_SIGNAL_BOAT_X);
    near(p.spawnTimer, BOAT_PERIOD, "次の舟まで BOAT_PERIOD を空ける");
  });

  it("危険範囲の下端から 3m 以上内側に残る舟がいれば追加しない", () => {
    const p = new GatePuzzleLogic();
    p.grab();
    p.spawnTimer = 1000.0;
    p.progress = 1.0 - 0.0001;
    const dt = 1.0 / 60.0;
    p.boats.push(DANGER_MIN_X + 3.0 + BOAT_SPEED * dt + 0.01); // 移動後も下端から 3m を超える位置
    p.tick(dt);
    expect(p.boats.length, "舟は増えない").toBe(1);
  });

  it("boats 配列は tick を跨いでも同じ参照（描画側が参照し続けられる）", () => {
    const p = new GatePuzzleLogic();
    const ref = p.boats;
    p.boats.push(0.0, 10.0);
    p.tick(1.0);
    expect(p.boats).toBe(ref);
    p.boats.push(BOAT_DESPAWN_X + 0.1);
    p.tick(1.0);
    expect(p.boats).toBe(ref);
    expect(ref.every((x) => x > BOAT_DESPAWN_X)).toBe(true);
  });

  it("舟の移動は同じ時間ならフレーム分割に依存しない", () => {
    const a = new GatePuzzleLogic();
    const b = new GatePuzzleLogic();
    a.boats.push(30.0);
    b.boats.push(30.0);
    a.tick(1.0);
    for (let i = 0; i < 60; i++) {
      b.tick(1.0 / 60.0);
    }
    near(a.boats[0], b.boats[0], "1回の1秒と60回の1/60秒で同じ位置", 1e-9);
  });
});
