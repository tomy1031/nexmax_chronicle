// three.js 版のセーブ（ステージ＝時代・スポーン地点・全フラグ）。
// 既存の SaveManager（TimelineState だけを slot1 に保存・既存テストで形式固定）はそのまま残し、
// こちらは別のキーに { timeline, story } をまとめて保存する。
// 現在の時代は timeline.current_era、スポーン地点（チェックポイント）は timeline.checkpoint に入れて保存する。

import { defaultStorage, type StorageLike } from "./saveManager";
import { isEraId, type EraId } from "./eras";
import type { StoryState } from "./storyFlags";

export const GAME_SAVE_KEY = "nexmax_chronicle_v23_slot1";
export const GAME_SAVE_VERSION = 1;

export interface GameSaveData {
  version: number;
  timeline: unknown;
  story: unknown;
  saved_at: number;
}

export interface LoadedGame {
  era: EraId;
  checkpoint: string;
}

export class GameSave {
  private readonly storage: StorageLike | null;
  readonly key: string;

  constructor(storage: StorageLike | null = defaultStorage(), key: string = GAME_SAVE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  /** いまの時代とスポーン地点を書き込んでから保存する */
  save(story: StoryState, era: EraId, checkpoint: string, now = Date.now()): boolean {
    if (!this.storage) return false;
    story.timeline.setFlag("current_era", era);
    story.timeline.setFlag("checkpoint", checkpoint);
    const data: GameSaveData = { version: GAME_SAVE_VERSION, timeline: story.timeline.toJSON(), story: story.toJSON(), saved_at: now };
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn(`GameSave: 保存に失敗しました (${String(e)})`);
      return false;
    }
  }

  /** 保存された辞書（無い・壊れていれば null） */
  read(): GameSaveData | null {
    if (!this.storage) return null;
    let text: string | null = null;
    try {
      text = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (!text) return null;
    try {
      const d = JSON.parse(text) as unknown;
      if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
      const r = d as Record<string, unknown>;
      if (typeof r.timeline !== "object" || r.timeline === null) return null;
      return { version: Number(r.version) || 0, timeline: r.timeline, story: r.story, saved_at: Number(r.saved_at) || 0 };
    } catch {
      return null;
    }
  }

  has(): boolean {
    return this.read() !== null;
  }

  /** セーブがあれば story（と timeline）へ復元して時代とスポーン地点を返す。無ければ null で状態は変えない */
  load(story: StoryState): LoadedGame | null {
    const d = this.read();
    if (!d) return null;
    story.timeline.fromJSON(d.timeline);
    story.fromJSON(d.story);
    const era = story.timeline.current_era;
    return { era: isEraId(era) ? era : 2086, checkpoint: story.timeline.checkpoint };
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // 消せなくても続行
    }
  }
}
