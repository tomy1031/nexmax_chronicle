// TimelineState のユニットテスト（Godot 版 tests/run_tests.gd の timeline: 17件を移植 + TS 版の追加分）
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERA_EDO, ERA_FUTURE, ERA_HUB, ERA_PRESENT } from "../src/core/eras";
import { BOOL_FLAG_NAMES, ROBOTS_TOTAL, SAVE_VERSION, TimelineState } from "../src/core/timelineState";
import { collectEvents, fullyProgressed, near } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

/** JSON 文字列を経由して別インスタンスへ復元する（実際のセーブと同じ経路）。 */
function viaJson(src: TimelineState): TimelineState {
  const dst = new TimelineState();
  dst.fromJSON(JSON.parse(JSON.stringify(src.toJSON())));
  return dst;
}

describe("TimelineState", () => {
  it("timeline: 初期値（フラグ false / era 2086 / 装備・チェックポイント既定）", () => {
    const ts = new TimelineState();
    expect(ts.gate_repaired, "gate_repaired").toBe(false);
    expect(ts.genbei_drawing_found, "genbei_drawing_found").toBe(false);
    expect(ts.drawing_confirmed, "drawing_confirmed").toBe(false);
    expect(ts.future_route_open, "future_route_open").toBe(false);
    expect(ts.intro_done, "intro_done").toBe(false);
    expect(ts.met_matsui, "met_matsui").toBe(false);
    expect(ts.met_genbei, "met_genbei").toBe(false);
    expect(ts.gear_placed, "gear_placed").toBe(false);
    expect(ts.met_sora, "met_sora").toBe(false);
    expect(ts.prologue_cleared, "prologue_cleared").toBe(false);
    expect(ts.robots_defeated, "robots_defeated").toBe(0);
    expect(ts.current_era, "current_era は 2086").toBe(2086);
    expect(ts.current_era, "current_era は ERA_FUTURE").toBe(ERA_FUTURE);
    expect(ts.checkpoint, "checkpoint").toBe("future_intro");
    expect(ts.equipment, "equipment").toBe("claw_standard");
    expect(ts.crystalCount(), "crystalCount").toBe(0);
    near(ts.play_time, 0.0, "play_time");
    expect(ts.isRobotCombatCleared(), "ロボ戦は未クリア").toBe(false);
    expect(ERA_EDO, "ERA_EDO").toBe(1726);
    expect(ERA_PRESENT, "ERA_PRESENT").toBe(2026);
    expect(ERA_FUTURE, "ERA_FUTURE").toBe(2086);
    expect(ERA_HUB, "ERA_HUB").toBe(0);
  });

  it("timeline: metrics の既定キー", () => {
    const ts = new TimelineState();
    for (const key of ["claw_first_success_time", "ido_found_time"]) {
      near(ts.metrics[key] ?? 999.0, -1.0, `${key} の既定は -1（未達）`);
    }
    for (const key of [
      "claw_misgrabs",
      "claw_grabs",
      "release_too_early",
      "release_person_danger",
      "falls",
      "deaths",
      "time_travels",
    ]) {
      expect(Object.hasOwn(ts.metrics, key), `metrics に ${key} がある`).toBe(true);
      near(ts.metrics[key] ?? 999.0, 0.0, `${key} の既定は 0`);
    }
  });

  it("timeline: confirmDrawing は gate_repaired と genbei_drawing_found が両方必要", () => {
    const ts = new TimelineState();
    expect(ts.confirmDrawing(), "どちらも未達なら確定しない").toBe(false);
    expect(ts.drawing_confirmed, "drawing_confirmed は false").toBe(false);
    ts.gate_repaired = true;
    expect(ts.confirmDrawing(), "修復のみでは確定しない").toBe(false);
    expect(ts.drawing_confirmed, "drawing_confirmed は false（修復のみ）").toBe(false);
    ts.gate_repaired = false;
    ts.genbei_drawing_found = true;
    expect(ts.confirmDrawing(), "絵図の継承のみでは確定しない").toBe(false);
    expect(ts.drawing_confirmed, "drawing_confirmed は false（絵図のみ）").toBe(false);
    expect(ts.future_route_open, "future_route_open も false のまま").toBe(false);
  });

  it("timeline: confirmDrawing 成功で drawing_confirmed と future_route_open が立つ", () => {
    const ts = new TimelineState();
    ts.gate_repaired = true;
    ts.genbei_drawing_found = true;
    expect(ts.future_route_open, "前提: 確定前は未来の道は開いていない").toBe(false);
    expect(ts.confirmDrawing(), "両方そろえば確定できる").toBe(true);
    expect(ts.drawing_confirmed, "drawing_confirmed").toBe(true);
    expect(ts.future_route_open, "future_route_open").toBe(true);
  });

  it("timeline: confirmDrawing は冪等で flagChanged を1回だけ出す", () => {
    const ts = new TimelineState();
    const events = collectEvents(ts);
    ts.gate_repaired = true;
    ts.genbei_drawing_found = true;
    expect(ts.confirmDrawing(), "1回目 true").toBe(true);
    expect(ts.confirmDrawing(), "2回目も true").toBe(true);
    const confirmedEvents = events.filter((e) => e[0] === "drawing_confirmed");
    expect(confirmedEvents.length, "flagChanged(drawing_confirmed) は1回だけ").toBe(1);
    if (confirmedEvents.length === 1) {
      expect(confirmedEvents[0][1], "値は true").toBe(true);
    }
    // 確定済み（ロード後など）なら前提フラグがなくても true を返し続ける
    ts.gate_repaired = false;
    expect(ts.confirmDrawing(), "確定済みなら前提が崩れても true").toBe(true);
    expect(ts.drawing_confirmed, "確定は取り消されない").toBe(true);
  });

  it("timeline: future_route_open は drawing_confirmed から算出され toJSON に入らない", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ts = new TimelineState();
    expect(ts.future_route_open, "初期は false").toBe(false);
    ts.setFlag("drawing_confirmed", true);
    expect(ts.future_route_open, "drawing_confirmed=true で true").toBe(true);
    expect(Object.hasOwn(ts.toJSON(), "future_route_open"), "toJSON に future_route_open は入らない").toBe(false);
    ts.setFlag("drawing_confirmed", false);
    expect(ts.future_route_open, "drawing_confirmed=false で false").toBe(false);
    // future_route_open を直接 setFlag しても drawing_confirmed と無関係には変わらない
    ts.setFlag("future_route_open", true);
    expect(ts.future_route_open, "setFlag で future_route_open を直接立てられない").toBe(false);
    expect(ts.drawing_confirmed, "drawing_confirmed も変わらない").toBe(false);
    ts.setFlag("drawing_confirmed", true);
    ts.reset();
    expect(ts.future_route_open, "reset で future_route_open も false").toBe(false);
  });

  it("timeline: setFlag は未知のフラグを無視する", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); // 未知フラグの警告は想定内の出力
    const ts = new TimelineState();
    const before = ts.toJSON();
    const emitted = collectEvents(ts);
    ts.setFlag("this_flag_does_not_exist", true);
    expect(emitted.length, "未知のフラグでは flagChanged が出ない").toBe(0);
    expect(ts.toJSON(), "状態は変わらない").toEqual(before);
    expect(
      (ts as unknown as Record<string, unknown>)["this_flag_does_not_exist"],
      "未知のフラグは作られない",
    ).toBeUndefined();
    expect(warn, "警告が出る").toHaveBeenCalledTimes(1);
  });

  it("timeline: setFlag は変化したときだけ flagChanged を出す", () => {
    const ts = new TimelineState();
    const events = collectEvents(ts);
    ts.setFlag("gate_repaired", true);
    expect(ts.gate_repaired, "gate_repaired が立つ").toBe(true);
    expect(events.length, "変化で1回通知").toBe(1);
    if (events.length === 1) {
      expect(events[0][0], "フラグ名").toBe("gate_repaired");
      expect(events[0][1], "値").toBe(true);
    }
    ts.setFlag("gate_repaired", true);
    expect(events.length, "同じ値なら通知しない").toBe(1);
    ts.setFlag("robots_defeated", 1);
    expect(ts.robots_defeated, "整数フラグも設定できる").toBe(1);
    expect(events.length, "整数フラグの変化も通知").toBe(2);
  });

  it("timeline: collectCrystal は重複で false・件数は増えない", () => {
    const ts = new TimelineState();
    const events = collectEvents(ts);
    expect(ts.collectCrystal("c1"), "初回は true").toBe(true);
    expect(ts.crystalCount(), "1個").toBe(1);
    expect(ts.collectCrystal("c1"), "重複は false").toBe(false);
    expect(ts.crystalCount(), "重複では増えない").toBe(1);
    expect(ts.collectCrystal("c2"), "別IDは true").toBe(true);
    expect(ts.crystalCount(), "2個").toBe(2);
    expect(events.length, "通知は新規取得の2回だけ").toBe(2);
    if (events.length === 2) {
      expect(events[0][0], "通知名").toBe("crystals");
      expect(events[1][1], "通知値は所持数").toBe(2);
    }
  });

  it("timeline: addMetric / markMetricTime", () => {
    const ts = new TimelineState();
    ts.addMetric("claw_grabs");
    ts.addMetric("claw_grabs");
    near(ts.metrics["claw_grabs"], 2.0, "addMetric の既定は +1");
    ts.addMetric("claw_grabs", 2.5);
    near(ts.metrics["claw_grabs"], 4.5, "量を指定して加算");
    ts.addMetric("brand_new_metric", 3.0);
    near(ts.metrics["brand_new_metric"], 3.0, "未定義のキーは 0 から加算");
    // markMetricTime: 最初の1回だけ play_time を記録する
    ts.play_time = 12.5;
    ts.markMetricTime("claw_first_success_time");
    near(ts.metrics["claw_first_success_time"], 12.5, "初回は play_time を記録");
    ts.play_time = 99.0;
    ts.markMetricTime("claw_first_success_time");
    near(ts.metrics["claw_first_success_time"], 12.5, "2回目は上書きしない");
    ts.markMetricTime("never_defined_time");
    near(ts.metrics["never_defined_time"], 99.0, "未定義のキーも記録できる");
  });

  it("timeline: isRobotCombatCleared は ROBOTS_TOTAL 体で true", () => {
    const ts = new TimelineState();
    const total = ROBOTS_TOTAL;
    expect(total, "ROBOTS_TOTAL は 2").toBe(2);
    for (let n = 0; n < total; n++) {
      ts.robots_defeated = n;
      expect(ts.isRobotCombatCleared(), `${n} 体では未クリア`).toBe(false);
    }
    ts.robots_defeated = total;
    expect(ts.isRobotCombatCleared(), `${total} 体でクリア`).toBe(true);
    ts.robots_defeated = total + 1;
    expect(ts.isRobotCombatCleared(), "超過でもクリア").toBe(true);
  });

  it("timeline: toJSON の形（version / 配列化した crystals / metrics は複製）", () => {
    const ts = fullyProgressed();
    const d = ts.toJSON();
    expect(d.version, "version").toBe(SAVE_VERSION);
    for (const key of [
      "gate_repaired",
      "genbei_drawing_found",
      "drawing_confirmed",
      "current_era",
      "intro_done",
      "met_matsui",
      "met_genbei",
      "gear_placed",
      "met_sora",
      "robots_defeated",
      "prologue_cleared",
      "checkpoint",
      "equipment",
      "crystals",
      "play_time",
      "metrics",
    ]) {
      expect(Object.hasOwn(d, key), `toJSON に ${key} がある`).toBe(true);
    }
    expect(Array.isArray(d.crystals), "crystals は配列で保存される").toBe(true);
    expect(d.crystals.length, "crystals は3件").toBe(3);
    // metrics は複製：toJSON の戻り値を書き換えても本体に影響しない
    d.metrics["claw_grabs"] = 9999.0;
    near(ts.metrics["claw_grabs"], 3.0, "toJSON の metrics は複製");
  });

  it("timeline: セーブ→JSON→ロードで全フラグ・進行・計測が一致（P4 受け入れ基準）", () => {
    const src = fullyProgressed();
    // 実際のセーブと同じく JSON 文字列を経由する
    const text = JSON.stringify(src.toJSON());
    const parsed: unknown = JSON.parse(text);
    expect(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed), "JSON をオブジェクトとして読み戻せる").toBe(
      true,
    );
    const dst = new TimelineState();
    dst.fromJSON(parsed);

    for (const flag of BOOL_FLAG_NAMES) {
      expect(dst[flag], `フラグ ${flag} が一致`).toBe(src[flag]);
      expect(dst[flag], `フラグ ${flag} は true のまま`).toBe(true);
    }
    expect(dst.future_route_open, "future_route_open が一致").toBe(src.future_route_open);
    expect(dst.future_route_open, "future_route_open は true").toBe(true);
    expect(dst.current_era, "current_era").toBe(1726);
    expect(Number.isInteger(dst.current_era), "current_era は整数").toBe(true);
    expect(dst.robots_defeated, "robots_defeated").toBe(2);
    expect(Number.isInteger(dst.robots_defeated), "robots_defeated は整数").toBe(true);
    expect(dst.checkpoint, "checkpoint").toBe("hub_start");
    expect(dst.equipment, "equipment").toBe("claw_test_mk2");
    near(dst.play_time, 123.5, "play_time");
    expect(dst.crystalCount(), "crystalCount").toBe(3);
    for (const id of ["crystal_a", "crystal_b", "crystal_c"]) {
      expect(dst.crystals.has(id), `crystal ${id} を復元`).toBe(true);
    }
    expect(dst.collectCrystal("crystal_a"), "復元したクリスタルは再取得できない").toBe(false);
    // metrics: 全キーが一致
    expect(Object.keys(dst.metrics).length, "metrics のキー数").toBe(Object.keys(src.metrics).length);
    for (const key of Object.keys(src.metrics)) {
      expect(Object.hasOwn(dst.metrics, key), `metrics に ${key} がある`).toBe(true);
      near(dst.metrics[key], src.metrics[key], `metrics[${key}]`);
    }
    near(dst.metrics["custom_future_metric"], 7.0, "未知の metrics キーも保持");
    // 最終確認: 再度 toJSON しても同じ内容
    expect(Object.keys(dst.toJSON()), "toJSON のキー構成が一致").toEqual(Object.keys(src.toJSON()));
    expect(dst.toJSON(), "toJSON の内容が完全に一致").toEqual(src.toJSON());
  });

  it("timeline: 絵図確定後のセーブ／ロードで future_route_open が一貫する", () => {
    const src = new TimelineState();
    src.gate_repaired = true;
    src.genbei_drawing_found = true;
    expect(src.confirmDrawing(), "前提: 確定").toBe(true);
    const dst = viaJson(src);
    expect(dst.gate_repaired, "gate_repaired").toBe(true);
    expect(dst.genbei_drawing_found, "genbei_drawing_found").toBe(true);
    expect(dst.drawing_confirmed, "drawing_confirmed").toBe(true);
    expect(dst.future_route_open, "future_route_open（算出）").toBe(true);
    expect(dst.future_route_open, "future_route_open == drawing_confirmed").toBe(dst.drawing_confirmed);
    // ロード後の confirmDrawing も true のまま
    expect(dst.confirmDrawing(), "ロード後の confirmDrawing は true").toBe(true);
  });

  it("timeline: 確定前のセーブをロードしても確定は再計算されず、後から confirm できる", () => {
    const src = new TimelineState();
    src.gate_repaired = true;
    src.genbei_drawing_found = true; // 2026年での確認はまだ
    const dst = viaJson(src);
    expect(dst.gate_repaired && dst.genbei_drawing_found, "前提フラグは復元される").toBe(true);
    expect(dst.drawing_confirmed, "ロードしても確認済みにはならない（状態を再計算しない）").toBe(false);
    expect(dst.future_route_open, "未来の道は閉じたまま").toBe(false);
    expect(dst.confirmDrawing(), "2026年で確認すれば確定できる").toBe(true);
    expect(dst.future_route_open, "確定後に未来の道が開く").toBe(true);
  });

  it("timeline: fromJSON は不足キーを既定値にし、既存状態を引きずらない", () => {
    // 空の辞書: すべて既定値
    const ts = fullyProgressed();
    ts.fromJSON({});
    expect(!ts.gate_repaired && !ts.genbei_drawing_found && !ts.drawing_confirmed, "フラグは既定値").toBe(true);
    expect(!ts.intro_done && !ts.met_matsui && !ts.met_genbei && !ts.gear_placed, "進行フラグは既定値").toBe(true);
    expect(!ts.met_sora && !ts.prologue_cleared, "進行フラグ(2)は既定値").toBe(true);
    expect(ts.robots_defeated, "robots_defeated は 0").toBe(0);
    expect(ts.current_era, "current_era は 2086").toBe(2086);
    expect(ts.checkpoint, "checkpoint は既定").toBe("future_intro");
    expect(ts.equipment, "equipment は既定").toBe("claw_standard");
    expect(ts.crystalCount(), "クリスタルは空（既存状態を引きずらない）").toBe(0);
    near(ts.play_time, 0.0, "play_time は 0");
    near(ts.metrics["claw_first_success_time"] ?? 999.0, -1.0, "metrics は既定値");
    near(ts.metrics["claw_grabs"] ?? 999.0, 0.0, "metrics(2) は既定値");
    expect(Object.hasOwn(ts.metrics, "custom_future_metric"), "古い独自 metrics は残らない").toBe(false);
    // 一部だけ入った辞書: 指定項目のみ反映
    ts.fromJSON({ gate_repaired: true, checkpoint: "edo_arrive", crystals: ["x"] });
    expect(ts.gate_repaired, "指定した項目は反映").toBe(true);
    expect(ts.checkpoint, "checkpoint").toBe("edo_arrive");
    expect(ts.crystalCount(), "crystals").toBe(1);
    expect(ts.genbei_drawing_found, "未指定の項目は既定値").toBe(false);
    expect(ts.current_era, "未指定の current_era は既定値").toBe(2086);
  });

  it("timeline: fromJSON は保存された future_route_open を信用しない", () => {
    const ts = new TimelineState();
    ts.fromJSON({ future_route_open: true, drawing_confirmed: false });
    expect(ts.future_route_open, "保存された future_route_open は無視し drawing_confirmed から算出").toBe(false);
    ts.fromJSON({ future_route_open: false, drawing_confirmed: true });
    expect(ts.future_route_open, "drawing_confirmed=true なら future_route_open=true").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TS 版で追加した検証（Godot 版のテストにはないもの）
// ---------------------------------------------------------------------------
describe("TimelineState（TS 版の追加検証）", () => {
  it("setFlag は型の合わない値・未定義の時代IDを拒否して状態を変えない", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ts = new TimelineState();
    const events = collectEvents(ts);
    expect(ts.setFlag("gate_repaired", "yes"), "真偽フラグに文字列は設定できない").toBe(false);
    expect(ts.setFlag("current_era", 1999), "未定義の時代IDは設定できない").toBe(false);
    expect(ts.setFlag("robots_defeated", 1.5), "小数は設定できない").toBe(false);
    expect(ts.setFlag("checkpoint", 3), "文字列フラグに数値は設定できない").toBe(false);
    expect(ts.gate_repaired).toBe(false);
    expect(ts.current_era).toBe(ERA_FUTURE);
    expect(ts.robots_defeated).toBe(0);
    expect(events.length).toBe(0);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("setFlag は変化の有無を戻り値で返し、時代・チェックポイント・装備も設定できる", () => {
    const ts = new TimelineState();
    const events = collectEvents(ts);
    expect(ts.setFlag("current_era", ERA_EDO)).toBe(true);
    expect(ts.setFlag("current_era", ERA_EDO)).toBe(false);
    expect(ts.setFlag("checkpoint", "edo_arrive")).toBe(true);
    expect(ts.setFlag("equipment", "claw_test_mk2")).toBe(true);
    expect(ts.current_era).toBe(1726);
    expect(events).toEqual([
      ["current_era", 1726],
      ["checkpoint", "edo_arrive"],
      ["equipment", "claw_test_mk2"],
    ]);
  });

  it("JSON.stringify(state) は toJSON と同じセーブ形式（snake_case キー）になる", () => {
    const ts = fullyProgressed();
    expect(JSON.parse(JSON.stringify(ts))).toEqual(JSON.parse(JSON.stringify(ts.toJSON())));
    const keys = Object.keys(ts.toJSON());
    expect(keys).toEqual([
      "version",
      "gate_repaired",
      "genbei_drawing_found",
      "drawing_confirmed",
      "current_era",
      "intro_done",
      "met_matsui",
      "met_genbei",
      "gear_placed",
      "met_sora",
      "robots_defeated",
      "prologue_cleared",
      "checkpoint",
      "equipment",
      "crystals",
      "play_time",
      "metrics",
    ]);
  });

  it("fromJSON は壊れた入力でも例外を出さず既定値に戻る（型が違う項目は既定値）", () => {
    const ts = fullyProgressed();
    for (const bad of [null, undefined, 42, "text", [1, 2, 3]]) {
      ts.fromJSON(bad);
      expect(ts.toJSON(), `入力 ${JSON.stringify(bad)} → 既定値`).toEqual(new TimelineState().toJSON());
    }
    ts.fromJSON({
      gate_repaired: "x",
      current_era: 1999,
      robots_defeated: "many",
      checkpoint: 5,
      crystals: "none",
      play_time: "long",
      metrics: { good: 1, bad: "x" },
    });
    expect(ts.gate_repaired).toBe(false);
    expect(ts.current_era, "未定義の時代IDは既定の 2086 に").toBe(ERA_FUTURE);
    expect(ts.robots_defeated).toBe(0);
    expect(ts.checkpoint).toBe("future_intro");
    expect(ts.crystalCount()).toBe(0);
    near(ts.play_time, 0.0);
    expect(ts.metrics["good"]).toBe(1);
    expect(Object.hasOwn(ts.metrics, "bad")).toBe(false);
  });

  it("fromJSON は float で保存された整数（JSON の 1726.0 など）を整数として復元する", () => {
    const ts = new TimelineState();
    ts.fromJSON(JSON.parse('{"current_era": 1726.0, "robots_defeated": 2.0}'));
    expect(ts.current_era).toBe(1726);
    expect(ts.robots_defeated).toBe(2);
  });

  it("reset は flagChanged のリスナーを外さない", () => {
    const ts = new TimelineState();
    const events = collectEvents(ts);
    ts.reset();
    ts.setFlag("met_matsui", true);
    expect(events.length).toBe(1);
  });
});
