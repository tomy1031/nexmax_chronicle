// 2026年 なんばの物語の進行（誰に話すと何が起きるか）。フラグだけから決まる純粋なロジック（tests/storyDirector.test.ts）。
// 1. 初回：光の裂け目から NEXTMAKE の前へ落ちる → マツイ社長（入口）→ 社長の案内でラボへ → 佐伯（腕の取り付け部を点検）
//    → 社長が IDO を紹介して標識の前へ → IDO の QR を読むと鉱石が反応して 1726年へ（偶然。社長の目の前で消える）
// 2. 帰還：IDO の前に戻る → 待っていた社長に源兵衛の話 → ラボで佐伯が絵図から固定具を試作 → 「できることが一つ増えたな。」
//    → 社長が IDO の前で見送り → IDO の光から 2086年へ
import type { FlagReader } from '../../core/storyDirector'
import type { AnyBoolFlag } from '../../core/storyFlags'
import type { TravelRequest } from '../../game/travel'

export type NambaActor = 'matsui' | 'saeki' | 'ido'

/** IDO のパネルに出す内容 */
export type IdoPanelKind = 'info' | 'karakuri' | 'record' | 'return'

/** マツイ社長の居場所 */
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
  /** IDO のパネル */
  panel?: IdoPanelKind
  /** パネルのあと、鉱石が反応して移動する */
  travel?: TravelRequest
}

export function nambaBeat(actor: NambaActor, f: FlagReader): NambaBeat {
  const back = f('gate_repaired')
  switch (actor) {
    case 'matsui':
      if (!back) {
        if (!f('met_matsui')) return { dialogue: 'matsui_first', set: ['met_matsui'], matsuiTo: 'lab' }
        if (!f('met_saeki')) return { dialogue: 'matsui_lead' }
        return { dialogue: 'matsui_ido_repeat' }
      }
      if (!f('genbei_story_told')) return { dialogue: 'matsui_return', set: ['genbei_story_told'], matsuiTo: 'lab' }
      if (!f('fixture_made')) return { dialogue: 'matsui_lab_wait' }
      return { dialogue: 'matsui_sendoff' }
    case 'saeki':
      if (!back) {
        if (!f('met_matsui')) return { dialogue: 'saeki_stranger' }
        // 社長が IDO のデモを見せに、水路沿いの標識へ先に歩いていく
        if (!f('met_saeki')) return { dialogue: 'saeki_first', set: ['met_saeki'], matsuiTo: 'ido' }
        return { dialogue: 'saeki_repeat' }
      }
      if (!f('genbei_story_told')) return { dialogue: 'saeki_return_early' }
      // 固定具ができたら、社長は見送りに IDO の前へ
      if (!f('fixture_made')) return { dialogue: 'saeki_fixture', set: ['fixture_made'], confirmDrawing: true, matsuiTo: 'ido' }
      return { dialogue: 'saeki_after' }
    case 'ido':
      if (!back) {
        if (!f('met_matsui')) return { dialogue: 'ido_before', panel: 'info' }
        if (!f('met_saeki')) return { dialogue: 'ido_wait_saeki' }
        return { dialogue: 'ido_qr', panel: 'karakuri', set: ['ido_qr_used'], travel: { to: '1726', cause: 'ido_qr', spawn: 'arrive' } }
      }
      if (!f('drawing_confirmed')) return { dialogue: 'ido_record', panel: 'record' }
      return { dialogue: 'ido_return', panel: 'return', travel: { to: '2086', cause: 'return', spawn: 'future_return' } }
  }
}

/** マツイ社長の定位置（フラグから。歩いて移る途中の演出はステージ側） */
export function matsuiSpot(f: FlagReader): MatsuiSpot {
  if (!f('gate_repaired')) {
    if (!f('met_matsui')) return 'entrance'
    return f('met_saeki') ? 'ido' : 'lab'
  }
  if (!f('genbei_story_told')) return 'ido'
  return f('fixture_made') ? 'ido' : 'lab'
}

/** 到着地点：初回は NEXTMAKE の前（光の裂け目から落ちる）、1726年からの帰還は IDO の前 */
export function nambaArrivalSpawn(f: FlagReader): 'present_start' | 'present_ido' {
  return f('gate_repaired') ? 'present_ido' : 'present_start'
}
