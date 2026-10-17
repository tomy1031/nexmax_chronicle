// セーブスロット1（仕様 §14.2 SaveManager / §17 チェックポイント＋拠点で自動保存）。
// Godot 版は user://nexmax_chronicle_slot1.json（Web ではブラウザの IndexedDB）だったが、
// こちらは localStorage の1キーに JSON を保存する。保存先は差し替えられる（テストはメモリ上の偽物を使う）。

import { Emitter } from "./emitter";
import type { TimelineState } from "./timelineState";

export const SAVE_KEY = "nexmax_chronicle_slot1";

/** localStorage と互換の最小インターフェース（Web Storage の部分集合） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function warn(message: string): void {
  console.warn(`SaveManager: ${message}`);
}

/** ブラウザの localStorage。プライベートモードや無効化で参照自体が例外になる場合があるので null を返す。 */
export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class SaveManager {
  /** 保存に成功したときの通知（Godot の signal saved） */
  readonly saved = new Emitter<[]>();

  private readonly storage: StorageLike | null;
  /** テストは別のキーに保存する（遊んでいるセーブを壊さない） */
  readonly key: string;

  constructor(storage: StorageLike | null = defaultStorage(), key: string = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  hasSave(): boolean {
    return this.read() !== null;
  }

  saveGame(state: TimelineState): boolean {
    if (this.storage === null) {
      warn("保存先（localStorage）を使えません");
      return false;
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(state.toJSON(), null, 2));
    } catch (e) {
      warn(`保存に失敗しました (${String(e)})`);
      return false;
    }
    this.saved.emit();
    return true;
  }

  /** セーブがあれば state へ復元して true。なければ（空・壊れた場合も）false で state は変えない。 */
  loadGame(state: TimelineState): boolean {
    const d = this.readSave();
    if (d === null) {
      return false;
    }
    state.fromJSON(d);
    return true;
  }

  /** 保存された辞書（JSON.parse の結果）。なし・空・壊れていれば null。 */
  readSave(): Record<string, unknown> | null {
    const text = this.read();
    if (text === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const d = parsed as Record<string, unknown>;
      return Object.keys(d).length > 0 ? d : null; // Godot 版と同じく空の辞書はセーブなし扱い
    }
    warn("セーブデータを読み込めませんでした");
    return null;
  }

  deleteSave(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch (e) {
      warn(`削除に失敗しました (${String(e)})`);
    }
  }

  private read(): string | null {
    if (this.storage === null) {
      return null;
    }
    try {
      return this.storage.getItem(this.key);
    } catch {
      return null;
    }
  }
}
