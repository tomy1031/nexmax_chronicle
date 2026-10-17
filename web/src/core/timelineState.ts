// 保存する世界の進行（仕様 §4.3 / §14.2 TimelineState）。
// ロード時は状態を再計算せず、保存したフラグから再現する。
// future_route_open だけは drawing_confirmed から算出する（P4 タスク定義）。
//
// 命名の方針: フラグ・保存項目（gate_repaired, current_era, play_time ...）は
// 仕様書とセーブ JSON のキーに合わせて snake_case のまま持つ。メソッドは camelCase。

import { Emitter } from "./emitter";
import { ERA_FUTURE, isEraId, type EraId } from "./eras";

export const SAVE_VERSION = 1;

/** 警備ロボを何体止めればロボ戦クリアか */
export const ROBOTS_TOTAL = 2;

/** setFlag で値が真偽のフラグ（仕様のフラグと序章の進行フラグ） */
export const BOOL_FLAG_NAMES = [
  "gate_repaired", // 1726年で水門の修復が完了
  "genbei_drawing_found", // 源兵衛の絵図が継承された
  "drawing_confirmed", // 2026年に記録を確認
  "intro_done", // 2086年の冒頭（経路閉鎖からの脱出）を終えた
  "met_matsui",
  "met_genbei",
  "gear_placed", // 外れた大歯車を軸へ戻した
  "met_sora",
  "prologue_cleared",
] as const;

export type BoolFlagName = (typeof BOOL_FLAG_NAMES)[number];

/** setFlag で設定できるフラグ名とその値の型 */
export interface FlagValues {
  gate_repaired: boolean;
  genbei_drawing_found: boolean;
  drawing_confirmed: boolean;
  intro_done: boolean;
  met_matsui: boolean;
  met_genbei: boolean;
  gear_placed: boolean;
  met_sora: boolean;
  prologue_cleared: boolean;
  current_era: EraId;
  robots_defeated: number;
  checkpoint: string;
  equipment: string;
}

export type FlagName = keyof FlagValues;

export const FLAG_NAMES: readonly FlagName[] = [
  ...BOOL_FLAG_NAMES,
  "current_era",
  "robots_defeated",
  "checkpoint",
  "equipment",
];

/** 保存せず他のフラグから算出する値。setFlag では設定できない。 */
export const DERIVED_FLAG_NAMES = ["future_route_open"] as const;

/** flagChanged で通知される名前。クリスタルの取得は "crystals"（値は所持数）。 */
export type FlagChangeName = FlagName | "crystals";
export type FlagChangeValue = boolean | number | string;

export function isFlagName(name: string): name is FlagName {
  return (FLAG_NAMES as readonly string[]).includes(name);
}

/** 試作の計測（仕様 §15.1 テスト観察シート向け）の初期値 */
function defaultMetrics(): Record<string, number> {
  return {
    claw_first_success_time: -1.0,
    claw_misgrabs: 0,
    claw_grabs: 0,
    release_too_early: 0,
    release_person_danger: 0,
    falls: 0,
    deaths: 0,
    ido_found_time: -1.0,
    time_travels: 0,
  };
}

/** セーブ JSON の形（キーは Godot 版 to_dict と同一）。future_route_open は含めない。 */
export interface SaveData {
  version: number;
  gate_repaired: boolean;
  genbei_drawing_found: boolean;
  drawing_confirmed: boolean;
  current_era: EraId;
  intro_done: boolean;
  met_matsui: boolean;
  met_genbei: boolean;
  gear_placed: boolean;
  met_sora: boolean;
  robots_defeated: number;
  prologue_cleared: boolean;
  checkpoint: string;
  equipment: string;
  crystals: string[];
  play_time: number;
  metrics: Record<string, number>;
}

function warn(message: string): void {
  console.warn(`TimelineState: ${message}`);
}

// JSON から読んだ値を型に合わせて取り出す。型が合わなければ既定値にする。
function readBool(v: unknown, def: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return def;
}

function readInt(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : def;
}

function readFloat(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function readString(v: unknown, def: string): string {
  return typeof v === "string" ? v : def;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class TimelineState {
  // --- 仕様で定義された進行フラグ ---
  gate_repaired!: boolean; // 1726年で水門の修復が完了
  genbei_drawing_found!: boolean; // 源兵衛の絵図が継承された
  drawing_confirmed!: boolean; // 2026年に記録を確認
  current_era!: EraId; // 1726 / 2026 / 2086（拠点は 0）

  // --- 序章の進行（物語の段階） ---
  intro_done!: boolean; // 2086年の冒頭（経路閉鎖からの脱出）を終えた
  met_matsui!: boolean;
  met_genbei!: boolean;
  gear_placed!: boolean; // 外れた大歯車を軸へ戻した
  met_sora!: boolean;
  robots_defeated!: number;
  prologue_cleared!: boolean;

  // --- 継続データ ---
  checkpoint!: string;
  equipment!: string;
  crystals!: Set<string>; // 取得済みクリスタルID（保存時は配列）
  play_time!: number;

  /** 試作の計測（仕様 §15.1 テスト観察シート向け） */
  metrics!: Record<string, number>;

  /**
   * フラグが変化したときの通知（Godot の signal flag_changed）。
   * setFlag / confirmDrawing / collectCrystal だけが発火する。フィールドを直接書き換えても通知されない。
   */
  readonly flagChanged = new Emitter<[flag: FlagChangeName, value: FlagChangeValue]>();

  constructor() {
    this.reset();
  }

  /** P4: future_route_open は保存せず drawing_confirmed から算出する。 */
  get future_route_open(): boolean {
    return this.drawing_confirmed;
  }

  /** 新規ゲームの状態へ戻す（リスナーは外さない）。 */
  reset(): void {
    this.gate_repaired = false;
    this.genbei_drawing_found = false;
    this.drawing_confirmed = false;
    this.current_era = ERA_FUTURE;
    this.intro_done = false;
    this.met_matsui = false;
    this.met_genbei = false;
    this.gear_placed = false;
    this.met_sora = false;
    this.robots_defeated = 0;
    this.prologue_cleared = false;
    this.checkpoint = "future_intro";
    this.equipment = "claw_standard";
    this.crystals = new Set();
    this.play_time = 0.0;
    this.metrics = defaultMetrics();
  }

  /**
   * フラグを設定する。未知のフラグ・算出フラグ（future_route_open）・型の合わない値は警告して無視する。
   * 値が変化したときだけ flagChanged を発火する。戻り値は「値が変化したか」。
   */
  setFlag<K extends FlagName>(flag: K, value: FlagValues[K]): boolean;
  setFlag(flag: string, value: unknown): boolean;
  setFlag(flag: string, value: unknown): boolean {
    if ((DERIVED_FLAG_NAMES as readonly string[]).includes(flag)) {
      warn(`${flag} は drawing_confirmed から算出するため直接設定できません`);
      return false;
    }
    if (!isFlagName(flag)) {
      warn(`unknown flag ${flag}`);
      return false;
    }
    if (!this.acceptsValue(flag, value)) {
      warn(`${flag} に不正な値 ${String(value)} は設定できません`);
      return false;
    }
    const self = this as unknown as Record<FlagName, unknown>;
    if (self[flag] === value) {
      return false;
    }
    self[flag] = value;
    this.flagChanged.emit(flag, value as FlagChangeValue);
    return true;
  }

  private acceptsValue(flag: FlagName, value: unknown): boolean {
    if ((BOOL_FLAG_NAMES as readonly string[]).includes(flag)) return typeof value === "boolean";
    switch (flag) {
      case "current_era":
        return isEraId(value);
      case "robots_defeated":
        return typeof value === "number" && Number.isInteger(value);
      default:
        return typeof value === "string"; // checkpoint / equipment
    }
  }

  /** 2026年で絵図の記録を確かめる。過去で修復と絵図の継承が済んでいなければ確定しない。 */
  confirmDrawing(): boolean {
    if (this.drawing_confirmed) {
      return true;
    }
    if (this.gate_repaired && this.genbei_drawing_found) {
      this.setFlag("drawing_confirmed", true);
      return true;
    }
    return false;
  }

  isRobotCombatCleared(): boolean {
    return this.robots_defeated >= ROBOTS_TOTAL;
  }

  addMetric(key: string, amount = 1.0): void {
    this.metrics[key] = this.getMetric(key, 0.0) + amount;
  }

  /** 計測値が未達（負）のときだけ、いまの play_time を記録する（最初の1回だけ）。 */
  markMetricTime(key: string): void {
    if (this.getMetric(key, -1.0) < 0.0) {
      this.metrics[key] = this.play_time;
    }
  }

  private getMetric(key: string, def: number): number {
    return Object.hasOwn(this.metrics, key) ? this.metrics[key] : def;
  }

  /** クリスタルを取得する。すでに持っていれば false。 */
  collectCrystal(id: string): boolean {
    if (this.crystals.has(id)) {
      return false;
    }
    this.crystals.add(id);
    this.flagChanged.emit("crystals", this.crystals.size);
    return true;
  }

  crystalCount(): number {
    return this.crystals.size;
  }

  /** セーブ用の辞書。JSON.stringify(state) でもこの形になる。 */
  toJSON(): SaveData {
    return {
      version: SAVE_VERSION,
      gate_repaired: this.gate_repaired,
      genbei_drawing_found: this.genbei_drawing_found,
      drawing_confirmed: this.drawing_confirmed,
      current_era: this.current_era,
      intro_done: this.intro_done,
      met_matsui: this.met_matsui,
      met_genbei: this.met_genbei,
      gear_placed: this.gear_placed,
      met_sora: this.met_sora,
      robots_defeated: this.robots_defeated,
      prologue_cleared: this.prologue_cleared,
      checkpoint: this.checkpoint,
      equipment: this.equipment,
      crystals: [...this.crystals],
      play_time: this.play_time,
      metrics: { ...this.metrics },
    };
  }

  /**
   * 保存した辞書から状態を復元する（JSON.parse の結果をそのまま渡せる）。
   * 既存の状態は引きずらず、足りないキーは既定値になる。
   * 保存された future_route_open は信用しない（drawing_confirmed から算出される）。
   */
  fromJSON(data: unknown): void {
    this.reset();
    if (!isRecord(data)) {
      return;
    }
    const d = data;
    this.gate_repaired = readBool(d.gate_repaired, false);
    this.genbei_drawing_found = readBool(d.genbei_drawing_found, false);
    this.drawing_confirmed = readBool(d.drawing_confirmed, false);
    const era = readInt(d.current_era, ERA_FUTURE);
    this.current_era = isEraId(era) ? era : ERA_FUTURE;
    this.intro_done = readBool(d.intro_done, false);
    this.met_matsui = readBool(d.met_matsui, false);
    this.met_genbei = readBool(d.met_genbei, false);
    this.gear_placed = readBool(d.gear_placed, false);
    this.met_sora = readBool(d.met_sora, false);
    this.robots_defeated = readInt(d.robots_defeated, 0);
    this.prologue_cleared = readBool(d.prologue_cleared, false);
    this.checkpoint = readString(d.checkpoint, "future_intro");
    this.equipment = readString(d.equipment, "claw_standard");
    this.crystals = new Set();
    if (Array.isArray(d.crystals)) {
      for (const id of d.crystals) {
        this.crystals.add(String(id));
      }
    }
    this.play_time = readFloat(d.play_time, 0.0);
    if (isRecord(d.metrics)) {
      for (const [k, v] of Object.entries(d.metrics)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          this.metrics[k] = v;
        }
      }
    }
  }
}
