// テスト共通の補助。Godot 版 run_tests.gd の _near に相当する比較など。
import { expect } from "vitest";
import type { StorageLike } from "../src/core/saveManager";
import { ERA_EDO } from "../src/core/eras";
import {
  TimelineState,
  type FlagChangeName,
  type FlagChangeValue,
} from "../src/core/timelineState";

/** 浮動小数の近似比較（Godot 版 _near と同じ許容誤差 0.0001） */
export function near(actual: number, expected: number, message = "", eps = 0.0001): void {
  expect(Math.abs(actual - expected), `${message} (expected=${expected}, actual=${actual})`).toBeLessThanOrEqual(eps);
}

/** flagChanged の通知を [flag, value] の配列へ集める。 */
export function collectEvents(ts: TimelineState): Array<[FlagChangeName, FlagChangeValue]> {
  const events: Array<[FlagChangeName, FlagChangeValue]> = [];
  ts.flagChanged.on((flag, value) => events.push([flag, value]));
  return events;
}

/** 全保存項目を非既定値にした TimelineState。 */
export function fullyProgressed(): TimelineState {
  const ts = new TimelineState();
  ts.gate_repaired = true;
  ts.genbei_drawing_found = true;
  ts.confirmDrawing();
  ts.current_era = ERA_EDO;
  ts.intro_done = true;
  ts.met_matsui = true;
  ts.met_genbei = true;
  ts.gear_placed = true;
  ts.met_sora = true;
  ts.robots_defeated = 2;
  ts.prologue_cleared = true;
  ts.checkpoint = "hub_start";
  ts.equipment = "claw_test_mk2";
  ts.collectCrystal("crystal_a");
  ts.collectCrystal("crystal_b");
  ts.collectCrystal("crystal_c");
  ts.play_time = 123.5;
  ts.addMetric("claw_grabs", 3.0);
  ts.addMetric("claw_misgrabs", 1.0);
  ts.addMetric("release_too_early", 2.0);
  ts.addMetric("time_travels", 4.0);
  ts.markMetricTime("claw_first_success_time");
  ts.addMetric("custom_future_metric", 7.0); // 未知のキーも保存される
  return ts;
}

/** メモリ上の偽 localStorage。 */
export class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}
