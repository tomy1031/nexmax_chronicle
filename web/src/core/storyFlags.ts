// 物語 v2.3 の進行フラグ（TimelineState の追加分）。
// TimelineState のセーブ形式（toJSON のキー）は既存テストで固定されているので、v2.3 で増えたフラグは
// ここ（StoryState）に持ち、TimelineState のフラグと同じ名前空間で読み書きできるようにする。
// ・TimelineState のフラグ：gate_repaired / genbei_drawing_found / drawing_confirmed / met_matsui / met_genbei …
// ・v2.3 の追加：festival_morning_seen / orum_seen / ido_exhibit_used / ido_qr_used / met_saeki / genbei_story_told / fixture_made と周回数 loop_count
// ・導入編の改訂（6・7 章）：ido_hint_heard / ido_a_seen / ido_b_seen / met_oharu / black_ring_seen
// ・導入編の改訂（2086年 1〜5 章）：lens_installed / loop_noticed / try_cancel / try_alarm / try_escape / try_confront / confided
//   （セーブに無い古いデータは false で読み込まれる＝互換）
// 描画・DOM には依存しない純粋なロジック。

import { Emitter } from "./emitter";
import { BOOL_FLAG_NAMES, TimelineState, type BoolFlagName } from "./timelineState";

export const STORY_VERSION = 1;

/** v2.3 で追加した真偽フラグ */
export const STORY_BOOL_FLAGS = [
  "festival_morning_seen", // 2086年：祭りの朝（ソラとの準備）を見た
  "orum_seen", // 2086年：夜空の黒い環（オルム）の襲来を見た
  "ido_exhibit_used", // 2086年：ソラの IDO 展示で 2026年へ落ちた
  "ido_qr_used", // 2026年：IDO の QR を読んで 1726年へ飛んだ
  "met_saeki", // 2026年：ラボで佐伯に腕の取り付け部を見てもらった
  "genbei_story_told", // 2026年（帰還後）：マツイ社長に源兵衛と絵図のことを話した
  "fixture_made", // 2026年（帰還後）：佐伯が絵図から小さな固定具を試作した
  // 導入編シナリオ改訂案 v1（docs/シナリオ改訂案_導入編_v1.md）の 6・7 章で増えた段階
  "ido_hint_heard", // 2026年：マツイ社長から「こっちの IDO が帰る手がかりになるかも」と石標 3 本の話を聞いた（6-6）
  "ido_a_seen", // 2026年：石標 A（NEXTMAKE の前・100年前のなんば）の QR を読んだ
  "ido_b_seen", // 2026年：石標 B（橋のたもと・1970年の道頓堀）の QR を読んだ
  "met_oharu", // 1726年：茶運び人形を追ってきたおはると出会い、工房へ案内された（7-3）
  "black_ring_seen", // 1726年：夕暮れの川向こうの空に小さな黒い輪を見た（7-5）。このあと水門の危機
  // 導入編シナリオ改訂案 v1 の 2086年 3〜5 章（stages/future2086/intro2086Story.ts）
  "lens_installed", // 2086年 1-4：共鳴レンズのケースをソラに渡し、リングにはめた（このあと中継アンテナ）
  "loop_noticed", // 2086年：繰り返していると気づいた（3章。腕を受け止めた）。このあと試み（4章）
  "try_cancel", // 2086年 4章①：運営本部とソラに中止を頼んだが、夜は来た
  "try_alarm", // 2086年 4章②：非常警報で早めに避難させたが、逃げた先から消えた
  "try_escape", // 2086年 4章③：ソラと町の外へ出ようとしたが、広場へ戻された
  "try_confront", // 2086年 4章④：夜、空の存在にクローを撃ったが、すり抜けた
  "confided", // 2086年 5章：ソラに繰り返しを打ち明け、「信じるよ」と言ってもらった（記録の石標へ）
] as const;

export type StoryBoolFlag = (typeof STORY_BOOL_FLAGS)[number];

/** 物語で扱う真偽フラグ（TimelineState の分＋v2.3 の追加分） */
export type AnyBoolFlag = BoolFlagName | StoryBoolFlag;

export const ALL_BOOL_FLAGS: readonly AnyBoolFlag[] = [...BOOL_FLAG_NAMES, ...STORY_BOOL_FLAGS];

export function isStoryBoolFlag(name: string): name is StoryBoolFlag {
  return (STORY_BOOL_FLAGS as readonly string[]).includes(name);
}

export function isTimelineBoolFlag(name: string): name is BoolFlagName {
  return (BOOL_FLAG_NAMES as readonly string[]).includes(name);
}

export function isAnyBoolFlag(name: string): name is AnyBoolFlag {
  return isStoryBoolFlag(name) || isTimelineBoolFlag(name);
}

/** StoryState.toJSON の形 */
export interface StoryData {
  version: number;
  flags: Record<StoryBoolFlag, boolean>;
  loop_count: number;
}

function emptyFlags(): Record<StoryBoolFlag, boolean> {
  const out = {} as Record<StoryBoolFlag, boolean>;
  for (const f of STORY_BOOL_FLAGS) out[f] = false;
  return out;
}

export class StoryState {
  readonly timeline: TimelineState;
  private flags: Record<StoryBoolFlag, boolean> = emptyFlags();
  /** 祭りの一日を繰り返した回数（2086年。脚本進行で増やす） */
  loop_count = 0;
  /** フラグが変化したとき（TimelineState の flagChanged も中継する） */
  readonly changed = new Emitter<[name: string, value: boolean | number | string]>();

  constructor(timeline: TimelineState = new TimelineState()) {
    this.timeline = timeline;
    this.timeline.flagChanged.on((name, value) => this.changed.emit(name, value));
  }

  /** 真偽フラグを読む（未知の名前は false） */
  get(name: AnyBoolFlag | (string & {})): boolean {
    if (isStoryBoolFlag(name)) return this.flags[name];
    if (isTimelineBoolFlag(name)) return this.timeline[name];
    return false;
  }

  /** 真偽フラグを設定する。変化したら true。未知の名前は警告して無視する */
  set(name: AnyBoolFlag | (string & {}), value: boolean): boolean {
    if (isStoryBoolFlag(name)) {
      if (this.flags[name] === value) return false;
      this.flags[name] = value;
      this.changed.emit(name, value);
      return true;
    }
    if (isTimelineBoolFlag(name)) return this.timeline.setFlag(name, value);
    console.warn(`StoryState: unknown flag ${name}`);
    return false;
  }

  /** 祭りの朝へ戻った回数を 1 増やす */
  addLoop(): number {
    this.loop_count += 1;
    this.changed.emit("loop_count", this.loop_count);
    return this.loop_count;
  }

  /**
   * カンマ区切りのフラグ一覧（URL の ?flags=a,b）をまとめて立てる。
   * 「name=false」で下ろせる。loop_count=3 も受け付ける。戻り値は認識できなかった名前。
   */
  applyFlagList(list: readonly string[]): string[] {
    const unknown: string[] = [];
    for (const raw of list) {
      const item = raw.trim();
      if (!item) continue;
      const [name, val] = item.split("=");
      if (name === "loop_count") {
        const n = Number(val);
        if (Number.isInteger(n) && n >= 0) this.loop_count = n;
        else unknown.push(item);
        continue;
      }
      if (!isAnyBoolFlag(name)) {
        unknown.push(item);
        continue;
      }
      this.set(name, val === undefined ? true : val !== "false" && val !== "0");
    }
    return unknown;
  }

  /** 立っている真偽フラグの一覧（デバッグ表示用） */
  activeFlags(): AnyBoolFlag[] {
    return ALL_BOOL_FLAGS.filter((f) => this.get(f));
  }

  /** v2.3 追加分だけを既定値へ（TimelineState は触らない） */
  resetStory(): void {
    this.flags = emptyFlags();
    this.loop_count = 0;
  }

  /** 新規ゲーム（TimelineState も既定値へ） */
  reset(): void {
    this.timeline.reset();
    this.resetStory();
  }

  toJSON(): StoryData {
    return { version: STORY_VERSION, flags: { ...this.flags }, loop_count: this.loop_count };
  }

  /** 保存した辞書から v2.3 追加分を復元する（足りない・型の違う項目は既定値） */
  fromJSON(data: unknown): void {
    this.resetStory();
    if (typeof data !== "object" || data === null || Array.isArray(data)) return;
    const d = data as Record<string, unknown>;
    const flags = d.flags;
    if (typeof flags === "object" && flags !== null && !Array.isArray(flags)) {
      for (const f of STORY_BOOL_FLAGS) {
        const v = (flags as Record<string, unknown>)[f];
        if (typeof v === "boolean") this.flags[f] = v;
      }
    }
    if (typeof d.loop_count === "number" && Number.isInteger(d.loop_count) && d.loop_count >= 0) this.loop_count = d.loop_count;
  }
}
