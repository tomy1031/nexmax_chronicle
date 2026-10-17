// data/dialogue.json（Godot 版 data/dialogues/tutorial_dialogue.json と同じ内容）からセリフを読み出す。

import data from "../data/dialogue.json";

export interface DialogueLine {
  readonly speaker: string;
  readonly text: string;
}

/** dialogue.json にあるセリフのキー（"_note" は注記なので含めない） */
export type DialogueKey = Exclude<keyof typeof data, "_note">;

/** キー → セリフ列 の表。JSON の読み込み結果やテスト用データを渡す。 */
export class DialogueDB {
  private readonly table: Readonly<Record<string, unknown>>;

  constructor(table: Readonly<Record<string, unknown>>) {
    this.table = table;
  }

  /**
   * キーのセリフ列。存在しなければ空配列。
   * 値が配列でない（"_note" など）場合は警告して空配列を返す。
   */
  lines(key: DialogueKey | (string & {})): readonly DialogueLine[] {
    if (!Object.hasOwn(this.table, key)) {
      return [];
    }
    const v = this.table[key];
    if (Array.isArray(v)) {
      return v as DialogueLine[];
    }
    console.warn(`DialogueDB: セリフ ${key} がありません`);
    return [];
  }

  /** セリフ列として存在するキーか（"_note" のような注記は false）。 */
  has(key: string): key is DialogueKey {
    return Object.hasOwn(this.table, key) && Array.isArray(this.table[key]);
  }

  /** セリフ列を持つ全キー */
  keys(): DialogueKey[] {
    return Object.keys(this.table).filter((k): k is DialogueKey => this.has(k));
  }
}

const db = new DialogueDB(data);

export function lines(key: DialogueKey | (string & {})): readonly DialogueLine[] {
  return db.lines(key);
}

export function has(key: string): key is DialogueKey {
  return db.has(key);
}

export function keys(): DialogueKey[] {
  return db.keys();
}
