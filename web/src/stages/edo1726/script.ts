// 1726年 仕掛け横丁の物語の段階（docs/シナリオ改訂案_導入編_v1.md の 7 章）。フラグだけから決まる純粋なロジック
// （tests/edo1726Script.test.ts）。
// town：到着（茶運び人形が歩いてくる）→ 町のうわさ（吹き出し）→ おはるが人形を追ってきて出会う
// follow：おはるについて源兵衛の工房へ
// workshop：源兵衛「お前、また来たんか！」・三年前の話・古い金具 →（続けて）黒い輪を見る
// crisis：黒い輪のあと、水門の危機（協力パズル）
// after：水門を直した（輪が薄くなる → 絵図とおはるの写し → 帰りの光の輪）
import type { FlagReader } from '../../core/storyDirector'

export type EdoPhase = 'town' | 'follow' | 'workshop' | 'crisis' | 'after'

export function edoPhase(f: FlagReader): EdoPhase {
  if (f('gate_repaired')) return 'after'
  if (f('black_ring_seen')) return 'crisis'
  if (f('met_genbei')) return 'workshop'
  if (f('met_oharu')) return 'follow'
  return 'town'
}

/** 町の人の台詞の場面（mob_lines_1726.json）：town（黒い輪の前）・ring（黒い輪のあと）・after（水門を直したあと） */
export function mobPhase1726(f: FlagReader): 'town' | 'ring' | 'after' {
  const p = edoPhase(f)
  return p === 'after' ? 'after' : p === 'crisis' ? 'ring' : 'town'
}

/** 源兵衛とおはるの居場所：工房の前（水門の危機まで）か、水門の持ち場か */
export function edoNpcPlace(f: FlagReader): 'workshop' | 'gate' {
  const p = edoPhase(f)
  return p === 'crisis' || p === 'after' ? 'gate' : 'workshop'
}

/** 大歯車をつかめるか（水門の危機のあいだだけ） */
export function gearGrabbable(f: FlagReader): boolean {
  return edoPhase(f) === 'crisis'
}

/**
 * おはるが人形を追って出てくる合図：人形が止まってから seconds 秒たったか、ネクマックスが到着地点から moved m 動いたか、
 * 町の人のうわさを 2 つ以上聞いたか（いちばん早いもの）
 */
export function oharuShouldCome(secondsSinceDollStop: number, moved: number, rumorsHeard: number): boolean {
  return secondsSinceDollStop >= 16 || moved >= 6 || rumorsHeard >= 2
}
