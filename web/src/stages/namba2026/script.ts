// 2026年 なんばの物語の進行（誰に話す・何を調べると何が起きるか）。フラグだけから決まる純粋なロジック
// （tests/storyDirector.test.ts・tests/namba2026Script.test.ts）。台本は docs/シナリオ改訂案_導入編_v1.md の 6・8 章。
// 1. 初回：光の裂け目から NEXTMAKE の前へ落ちる → 電話中のマツイ社長が光に気づいて近づき「もしかして……君、ネクマックス？」
//    （ステージの演出。会話は matsui_first）→ 社長についてラボへ → 佐伯が右腕の取り付け部を締め直す → 社長は表で待つ
//    （社内は自由に見てよい：構想スケッチのボード・IDO のポスター・社員）→ 表の社長に相談すると「こっちの IDO が帰る手がかりに
//    なるかも」と石標 3 本の話 → 石標 A（100年前）・B（1970年）は見るだけ、C（江戸のからくりのうわさ）で鉱石が反応して 1726年へ
// 2. 帰還：IDO（石標 A）の前へ戻る → 待っていた社長に源兵衛の話 → ラボで佐伯が絵図から固定具を試作 → 社長が石標 A の前で見送り
//    → 石標 A の光から 2086年へ
import type { FlagReader } from '../../core/storyDirector'
import type { AnyBoolFlag } from '../../core/storyFlags'
import type { TravelRequest } from '../../game/travel'

/** 石標の ID（A＝NEXTMAKE の前、B＝橋のたもと、C＝古い路地の奥） */
export type IdoMarkerId = 'a' | 'b' | 'c'

/**
 * 話す・調べる相手。'ido' は石標 A（もとからある NEXTMAKE の前の石標。帰りもここ）、'ido_b'・'ido_c' は石標 B・C、
 * 'board' はラボの構想スケッチのボード、'poster' はオフィスの IDO のポスター
 */
export type NambaActor = 'matsui' | 'saeki' | 'ido' | 'ido_b' | 'ido_c' | 'board' | 'poster'

export const IDO_ACTOR: Record<IdoMarkerId, NambaActor> = { a: 'ido', b: 'ido_b', c: 'ido_c' }

/** IDO のパネルに出す内容 */
export type IdoPanelKind = 'info' | 'old1926' | 'expo1970' | 'karakuri' | 'record' | 'return'

/** マツイ社長の居場所（entrance＝最初に電話をしている NEXTMAKE の前、lab＝構想ボードの前、ido＝石標 A の前） */
export type MatsuiSpot = 'entrance' | 'lab' | 'ido'

export type NambaBeat = {
  /** dialogue_2026.json のキー */
  dialogue: string
  /** 会話のあとに立てるフラグ */
  set?: AnyBoolFlag[]
  /** 会話のあとに絵図の記録を確定する（TimelineState.confirmDrawing） */
  confirmDrawing?: boolean
  /** 会話のあとにマツイ社長が歩いて移る先 */
  matsuiTo?: MatsuiSpot
  /** 会話のあと、マツイ社長がネクマックスについて歩く（石標を順に試す） */
  follow?: boolean
  /** IDO のパネル */
  panel?: IdoPanelKind
  /** パネルのあと、鉱石が反応して移動する */
  travel?: TravelRequest
}

/** 石標 A・B のどちらかを読んだら、もう片方を読んだか（2 本目なら社長が C を指す台詞にする） */
function otherSeen(actor: NambaActor, f: FlagReader): boolean {
  return actor === 'ido' ? f('ido_b_seen') : f('ido_a_seen')
}

export function nambaBeat(actor: NambaActor, f: FlagReader): NambaBeat {
  const back = f('gate_repaired')
  switch (actor) {
    case 'matsui':
      if (!back) {
        // 最初はステージの演出（社長が近づいてくる）で流れる。セーブから始めたときは話しかけても同じ会話
        if (!f('met_matsui')) return { dialogue: 'matsui_first', set: ['met_matsui'], matsuiTo: 'lab' }
        if (!f('met_saeki')) return { dialogue: 'matsui_lead' }
        if (!f('ido_hint_heard')) return { dialogue: 'matsui_ido_hint', set: ['ido_hint_heard'], follow: true }
        return { dialogue: f('ido_a_seen') && f('ido_b_seen') ? 'matsui_ido_last' : 'matsui_ido_repeat', follow: true }
      }
      if (!f('genbei_story_told')) return { dialogue: 'matsui_return', set: ['genbei_story_told'], matsuiTo: 'lab' }
      if (!f('fixture_made')) return { dialogue: 'matsui_lab_wait' }
      return { dialogue: 'matsui_sendoff' }
    case 'saeki':
      if (!back) {
        if (!f('met_matsui')) return { dialogue: 'saeki_stranger' }
        // 右腕を直したら、社長は表（石標 A の前）で待つ
        if (!f('met_saeki')) return { dialogue: 'saeki_first', set: ['met_saeki'], matsuiTo: 'ido' }
        return { dialogue: f('ido_hint_heard') ? 'saeki_ido' : 'saeki_repeat' }
      }
      if (!f('genbei_story_told')) return { dialogue: 'saeki_return_early' }
      // 固定具ができたら、社長は見送りに石標 A の前へ
      if (!f('fixture_made')) return { dialogue: 'saeki_fixture', set: ['fixture_made'], confirmDrawing: true, matsuiTo: 'ido' }
      return { dialogue: 'saeki_after' }
    case 'board':
      return { dialogue: back ? 'look_board_back' : 'look_board' }
    case 'poster':
      return { dialogue: 'look_poster' }
    case 'ido':
    case 'ido_b':
    case 'ido_c':
      if (!back) {
        if (!f('met_matsui')) return { dialogue: 'ido_before', panel: 'info' }
        if (!f('met_saeki')) return { dialogue: 'ido_wait_saeki' }
        if (!f('ido_hint_heard')) return { dialogue: 'ido_ask_matsui' }
        if (actor === 'ido') return { dialogue: otherSeen(actor, f) ? 'ido_a_last' : 'ido_a', panel: 'old1926', set: ['ido_a_seen'] }
        if (actor === 'ido_b') return { dialogue: otherSeen(actor, f) ? 'ido_b_last' : 'ido_b', panel: 'expo1970', set: ['ido_b_seen'] }
        return { dialogue: 'ido_qr', panel: 'karakuri', set: ['ido_qr_used'], travel: { to: '1726', cause: 'ido_qr', spawn: 'arrive' } }
      }
      // 帰還後：記録が増えている（からくりの石標 C と石標 A）。帰りは見送りの待つ石標 A から
      if (actor === 'ido_b') return { dialogue: 'ido_b_again', panel: 'expo1970' }
      if (!f('drawing_confirmed')) return { dialogue: 'ido_record', panel: 'record' }
      if (actor === 'ido_c') return { dialogue: 'ido_go_front', panel: 'record' }
      return { dialogue: 'ido_return', panel: 'return', travel: { to: '2086', cause: 'return', spawn: 'future_return' } }
  }
}

/** マツイ社長の定位置（フラグから。歩いて移る・ついて歩く途中の演出はステージ側） */
export function matsuiSpot(f: FlagReader): MatsuiSpot {
  if (!f('gate_repaired')) {
    if (!f('met_matsui')) return 'entrance'
    return f('met_saeki') ? 'ido' : 'lab'
  }
  if (!f('genbei_story_told')) return 'ido'
  return f('fixture_made') ? 'ido' : 'lab'
}

/** 社長がネクマックスについて歩く段階か（表で相談したあと、1726年へ行くまで） */
export function matsuiFollows(f: FlagReader): boolean {
  return !f('gate_repaired') && f('ido_hint_heard')
}

/** 石標に印（遠くからでも分かる弱い光と方位磁針）を出すか。C は社長からうわさを聞いたあと */
export function idoMarkerVisible(id: IdoMarkerId, f: FlagReader): boolean {
  if (f('gate_repaired')) return id === 'a' && f('drawing_confirmed')
  if (!f('ido_hint_heard')) return false
  if (id === 'a') return !f('ido_a_seen')
  if (id === 'b') return !f('ido_b_seen')
  return true
}

/** 到着地点：初回は NEXTMAKE の前（光の裂け目から落ちる）、1726年からの帰還は IDO（石標 A）の前 */
export function nambaArrivalSpawn(f: FlagReader): 'present_start' | 'present_ido' {
  return f('gate_repaired') ? 'present_ido' : 'present_start'
}
