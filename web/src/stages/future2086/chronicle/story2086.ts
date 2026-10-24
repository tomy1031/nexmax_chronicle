// 物語 v7 の 2086 年（はじめに・1〜5・8・10・12 章・おわりに）の進み方。フラグだけから決まる純粋なロジック
// （tests/chronicle2086Story.test.ts）。ステージ（stage.ts）は段階 step を読んで場面を始め、目標・到着地点・昼夜・曲を決める。
// 段階の中の細かい進み（レンズを取った、など）はステージが覚え、セーブから再開したら段階の頭から。
import type { MusicId } from '../../../audio/tracks'
import type { Flags } from '../../../chronicle/progress'

export type Step2086 =
  | 'prologue' // はじめに（2071 の回想）
  | 'ch1_booth' // 1章：お祭りの朝 → ソラのブース → 共鳴レンズ
  | 'ch1_antenna' // 1章：北の回廊の中継アンテナ（金具 → 光る輪 → 線をつなぐ → 大画面に「開場」）
  | 'ch1_qr' // 1章：ブースへもどる → 展示の台の QR を読む（300 年前の路地）
  | 'ch1_keychain' // 1章：光のつぶの話 → 夕方 → 屋台で星のキーホルダー
  | 'ch1_promise' // 1章：夜のお祭りへ（約束）
  | 'ch2_night' // 2章：時計台の仮面の男 → 空のひび → 黒い手から逃げきる → 朝へ
  | 'ch3_morning' // 3章：二度目の朝（同じ風船・同じあいさつ・ポケットのキーホルダー・石の音）
  | 'ch4_hide' // 4章：二度目の夜は地下にかくれる → ソラがつかまる → すりぬける
  | 'ch4_tower' // 4章：三度目の夜、時計台をのぼって仮面の男（トワと名のる）と話す → ランプにクロー → ベンチ
  | 'ch5_confide' // 5章：四度目の朝、ソラに全部話す（キーホルダー）
  | 'ch5_door' // 5章：わっかで 60 年前の記録 → 扉 → 2026 へ
  | 'ch8_back' // 8章：江戸から帰る → 路地のあとへ（ビル・記録・書の絵）
  | 'ch8_dial' // 8章：年代ダイヤル → 2026 へ
  | 'ch10_shrine' // 10章：2026 から帰る → 中庭とほこら → 錠前 → 時空裂きのNMクロー
  | 'ch10_practice' // 10章：新しい力の練習（工具箱・ゆらぎ・歯車）
  | 'ch10_memory' // 10章：思い出の錠前・佐伯さんの声
  | 'ch10_duel' // 10章：夕方、中庭でトワと決闘
  | 'ch10_travel' // 10章のあと：カンボジアの記録 → ダイヤル 1186 → 1186 へ
  | 'ch12_back' // 12章：カンボジアから帰る → ソラと小さな切れ目を試す
  | 'ch12_hands' // 12章：夜 8時40分、黒い手 3 本を裂く
  | 'ch12_ura' // 12章：空を大きく裂く → 裏側（UraBattle 'final'）
  | 'ch12_ending' // 12章：結末（トワ・夜のお祭り・キーホルダー）
  | 'epilogue' // おわりに：10月19日の朝
  | 'done'

export const STEPS_2086: readonly Step2086[] = [
  'prologue',
  'ch1_booth',
  'ch1_antenna',
  'ch1_qr',
  'ch1_keychain',
  'ch1_promise',
  'ch2_night',
  'ch3_morning',
  'ch4_hide',
  'ch4_tower',
  'ch5_confide',
  'ch5_door',
  'ch8_back',
  'ch8_dial',
  'ch10_shrine',
  'ch10_practice',
  'ch10_memory',
  'ch10_duel',
  'ch10_travel',
  'ch12_back',
  'ch12_hands',
  'ch12_ura',
  'ch12_ending',
  'epilogue',
  'done',
]

/**
 * いまの段階（フラグだけから）。2086 年にいるときに読む。
 * 帰還のフラグ（v7_back1..3）は到着したときにステージが立てる（arrivalFlag）。
 */
export function step2086(f: Flags): Step2086 {
  if (f('v7_epilogue')) return 'done'
  if (f('v7_ending')) return 'epilogue'
  if (f('v7_orm_down')) return 'ch12_ending'
  if (f('v7_hands_cut')) return 'ch12_ura'
  if (f('v7_final_ready')) return 'ch12_hands'
  if (f('v7_khmer_done') || f('v7_back3')) return 'ch12_back'
  if (f('v7_towa_duel')) return 'ch10_travel'
  if (f('v7_memory_open')) return 'ch10_duel'
  if (f('v7_rift_practice')) return 'ch10_memory'
  if (f('v7_rift_claw')) return 'ch10_practice'
  if (f('v7_shrine_saved') || f('v7_back2')) return 'ch10_shrine'
  if (f('v7_building_seen')) return 'ch8_dial'
  if (f('v7_claw_stored') || f('v7_back1')) return 'ch8_back'
  if (f('v7_confided')) return 'ch5_door'
  if (f('v7_rewind3')) return 'ch5_confide'
  if (f('v7_rewind2')) return 'ch4_tower'
  if (f('v7_loop_seen')) return 'ch4_hide'
  if (f('v7_rewind1')) return 'ch3_morning'
  if (f('v7_promise')) return 'ch2_night'
  if (f('v7_keychain')) return 'ch1_promise'
  if (f('v7_qr_demo')) return 'ch1_keychain'
  if (f('v7_antenna_done')) return 'ch1_qr'
  if (f('v7_lens_done')) return 'ch1_antenna'
  if (f('v7_prologue_seen')) return 'ch1_booth'
  return 'prologue'
}

/** 2086 に着いたときに立てる帰還のフラグ（光のつぶが 1 つへる）。無ければ null */
export function arrivalFlag(f: Flags): 'v7_back1' | 'v7_back2' | 'v7_back3' | null {
  if (f('v7_khmer_done') && !f('v7_back3')) return 'v7_back3'
  if (f('v7_shrine_saved') && !f('v7_back2')) return 'v7_back2'
  if (f('v7_claw_stored') && !f('v7_back1')) return 'v7_back1'
  return null
}

/** 段階の時間帯（はじめの環境）。夕方は夜の環境で、オルムを出さない */
export type DayPart = 'morning' | 'evening' | 'night'

export function dayPartOf(step: Step2086): DayPart {
  switch (step) {
    case 'ch2_night':
    case 'ch12_hands':
    case 'ch12_ura':
    case 'ch12_ending':
      return 'night'
    case 'ch10_duel':
    case 'ch10_travel':
    case 'ch12_back':
      return 'evening'
    default:
      return 'morning'
  }
}

/** 何度目の朝の型（街頭ビジョン・風船・ソラのあいさつ）を出す段階。0 = 出さない */
export function morningOf(step: Step2086, f: Flags): number {
  switch (step) {
    case 'ch1_booth':
    case 'ch3_morning':
    case 'ch4_hide':
    case 'ch4_tower':
    case 'ch5_confide':
      return 1 + (f('v7_rewind1') ? 1 : 0) + (f('v7_rewind2') ? 1 : 0) + (f('v7_rewind3') ? 1 : 0)
    default:
      return 0
  }
}

/** 段階ごとの到着地点（scene の spawns・layoutChronicle の CHRONICLE_SPOTS の ID）。帰還の ID はブースの前 */
export function spawnFor(step: Step2086, arrival: string | null = null): string {
  if (arrival === 'v7_from_1726' || arrival === 'v7_from_2026' || arrival === 'v7_from_1186') return 'arrive_from_2026'
  switch (step) {
    case 'prologue':
    case 'ch1_booth':
      return 'start'
    case 'ch1_antenna':
    case 'ch1_qr':
    case 'ch1_keychain':
      return 'booth'
    case 'ch1_promise':
      return 'key_stall'
    case 'ch2_night':
    case 'ch12_hands':
    case 'ch12_ura':
    case 'ch12_ending':
      return 'night_plaza'
    case 'ch5_door':
    case 'ch10_travel':
      return 'exhibit'
    case 'ch8_back':
    case 'ch10_shrine':
    case 'ch12_back':
      return 'arrive_from_2026'
    case 'ch8_dial':
      return 'site_front'
    case 'ch10_practice':
    case 'ch10_memory':
    case 'ch10_duel':
      return 'courtyard'
    default:
      return 'loop_morning'
  }
}

/** 跡地の姿（ほこらを守った歴史になったら中庭） */
export function siteVariantOf(f: Flags): 'building' | 'courtyard' {
  return f('v7_shrine_saved') ? 'courtyard' : 'building'
}

/** 年代ダイヤルがわっかについているか（2027 年に社長がつけた：2026 で社長に会ったあとの歴史） */
export function dialVisible(f: Flags): boolean {
  return f('v7_back1')
}

/**
 * 共鳴レンズがわっかにはまっているか（その日の中だけ。ループの朝ははずれる。5章の扉からはずっと）。
 * 一度目の 10月18日は、レンズをわたしたあと（アンテナ〜夜）はずっとはまっている（セーブから再開しても）
 */
export function lensMounted(step: Step2086, lensDoneToday: boolean): boolean {
  const i = STEPS_2086.indexOf(step)
  if (i >= STEPS_2086.indexOf('ch5_door')) return true
  if (i >= STEPS_2086.indexOf('ch1_antenna') && i <= STEPS_2086.indexOf('ch2_night')) return true
  return lensDoneToday
}

/** 会場の大画面に「開場」が出ているか（一度目の朝は、アンテナをつなぐまで「映像信号なし」） */
export function screenOn(step: Step2086, antennaDoneToday: boolean): boolean {
  if (step === 'ch1_booth' || step === 'ch1_antenna') return antennaDoneToday
  return true
}

export function musicOf(step: Step2086, part: DayPart): MusicId {
  if (step === 'prologue') return 'title'
  if (step === 'epilogue' || step === 'done' || step === 'ch12_ending') return 'dawn'
  return part === 'morning' ? 'future2086' : 'night2086'
}

// ------------------------------------------------------------------ 目標（左上）。phase は段階の中の細かい進み

export type Objective = { title: string; sub: string }

export const OBJECTIVES: Record<string, Objective> = {
  prologue: { title: 'はじめに', sub: '15年前の、地下の倉庫' },
  morning: { title: 'お祭りの朝', sub: '街頭ビジョンを見よう' },
  go_sora: { title: 'ソラのブースへ行く', sub: '広場の西。IDOのわっかのところ' },
  balloon: { title: 'ソラのブースへ行く', sub: '（風船を J で取ってあげてもいい）' },
  balloon_choice: { title: '男の子の風船', sub: '取ってあげる？ それとも、ソラのところへ？' },
  balloon_take: { title: '男の子の風船を取ってあげよう', sub: '電灯の風船を見上げて J で引きよせる' },
  balloon_give: { title: '風船を男の子にわたそう', sub: '男の子のそばで F' },
  lens: { title: '共鳴レンズを取る', sub: '箱の山のいちばん上。J で引きよせる' },
  lens_give: { title: 'レンズをソラにわたす', sub: 'ソラのそばで F' },
  antenna_hook: { title: '北の回廊の中継アンテナへ', sub: '回廊のふちの金具に J で飛びつく' },
  antenna_swing: { title: '切れた橋をわたる', sub: '回廊を北へ。アーチの光る輪に J → WASD でこぐ → Space で飛びうつる' },
  antenna_fix: { title: '中継アンテナの線をつなぐ', sub: 'アンテナの前で F' },
  back_booth: { title: 'ソラのブースへもどる', sub: '広場の西' },
  qr_demo: { title: '展示の台の QR を読む', sub: '台の前で F' },
  vr_look: { title: '昔の町を見回す', sub: '↑↓←→：見回す　F：おわる' },
  vr_dive: { title: 'IDO の記録', sub: '背中の石が……？' },
  keychain: { title: '屋台で星のキーホルダーを買う', sub: '東の屋台の列のいちばん南。F で買う' },
  night_walk: { title: 'ソラとお祭りを回る', sub: '夜の広場を歩こう' },
  protect: { title: '黒い手から、ソラを守ろう', sub: '黒い手に J' },
  flee: { title: 'ソラと南のゲートへにげよう', sub: '広場の南の入口へ。Shift でダッシュ' },
  loop_greet: { title: 'ソラに会う', sub: '同じ朝……？' },
  pocket: { title: 'ポケットを見る', sub: 'F' },
  hide: { title: 'ひとりになれる所へ', sub: '北の通りの西側の、地下通路。その奥の部屋' },
  hide_wait: { title: 'じっとかくれる', sub: '夜まで' },
  save_sora: { title: 'ソラを助ける！', sub: 'ソラをつかんだ黒い手に J' },
  save_run: { title: 'ソラの前に飛び出す', sub: 'ソラのところへ走る' },
  tower_go: { title: '時計台の下へ行く', sub: '北の通りの入口（アーチの先）' },
  tower_gears: { title: '時計台にのぼる', sub: '回る大歯車に Space でとびのって、上の足場へ' },
  tower_gearhook: { title: '時計台にのぼる', sub: '回る歯車の金具が上に来て、金色に光ったら J' },
  tower_wall: { title: '時計台にのぼる', sub: '壁から黒い手！ 赤い輪の外へはなれて。渡り廊下の南の端へ' },
  tower_hand: { title: '時計台にのぼる', sub: '大きな針が来て止まったら、のって、向こうの足場へ' },
  tower_swing1: { title: '通りの向こうのビルへ', sub: '金色の光る輪に J でぶら下がって、WASD でこいで、光る足場の上で Space' },
  tower_swing2: { title: 'ビルの壁ぞいに、北へ', sub: '金色の光る輪に J でぶら下がって、WASD でこいで、光る足場の上で Space' },
  tower_swing3: { title: '通りをこえて、時計台の側へ', sub: '金色の光る輪に J でぶら下がって、WASD でこいで、光る足場の上で Space' },
  tower_gearhook2: { title: '時計台の回廊へ', sub: '回る歯車の金具が上に来て、金色に光ったら J' },
  tower_debris: { title: '時計台にのぼる', sub: '赤い輪に、がれきが落ちてくる。止まらずに、回廊の南の端へ' },
  tower_top: { title: '時計台のてっぺんへ', sub: 'てっぺんの金色の金具に J' },
  tower_deck: { title: '時計台のてっぺん', sub: '仮面の男' },
  tower_lamp: { title: 'トワのランプを取る', sub: '影が出てくるランプに J' },
  confide: { title: 'ソラに全部話す', sub: 'ソラのブースへ' },
  show_keychain: { title: 'キーホルダーを見せる', sub: 'F' },
  qr_door: { title: '展示の台の QR を読む', sub: '60年前の記録。台の前で F' },
  back_talk: { title: 'ソラに話す', sub: '' },
  to_site: { title: '路地のあとへ走る', sub: '北の通りのさらに北、東側（NEXTMAKE）' },
  kanban: { title: 'かんばんの記録を見る', sub: '古い石のかんばんの前で F' },
  to_ring_dial: { title: 'ソラのわっかへもどる', sub: 'ブースへ' },
  dial: { title: '年代ダイヤルを回す', sub: '光る年に合わせて「この年へ行く」' },
  dial_again: { title: '年代ダイヤル', sub: 'わっかの前で F' },
  qr_dial: { title: '展示の台の QR を読む', sub: 'ダイヤルでえらんだ年の記録。台の前で F' },
  to_court: { title: '路地のあとへ', sub: 'NEXTMAKE の場所へ' },
  lock: { title: 'ほこらの錠前', sub: 'ほこらの前で F' },
  toolbox: { title: '落ちる工具箱を止める', sub: '時空裂きのクロー：動いている物に J' },
  seam: { title: 'ゆらぎを裂く', sub: '池の上の、うすく光る縦のすじに J' },
  ura_climb: { title: '裏側の足場をわたる', sub: '縁側へのぼろう（すぐ閉じる）' },
  gear: { title: '回る歯車を止めて、足場にする', sub: '歯車に J → 一番上の歯 → からくり時計の足場へ' },
  memory: { title: '思い出', sub: '' },
  duel: { title: 'トワ', sub: '影は K でたおす（たおすと、ランプの糸が光る）。影の弾は J で止める' },
  duel_thread: { title: 'ランプの黒い糸を裂く', sub: 'トワとランプをつなぐ糸が光ったら J（3 回）' },
  relief: { title: 'カンボジアの記録', sub: 'ソラと話す' },
  dial1186: { title: '年代ダイヤルを 1186 年へ', sub: 'わっかの前で F' },
  qr1186: { title: '遺跡のかんばんの QR を読む', sub: '展示の台の前で F' },
  test_slit: { title: '小さな切れ目を裂く', sub: 'ソラのわっかの前のゆらぎに J' },
  hands: { title: '黒い手を裂く', sub: 'ふりおろして止まった手に J（3 本）' },
  sky_seam: { title: '空を大きく裂く', sub: '時計台の上の大きなゆらぎに J' },
  ura: { title: '裏側へ', sub: 'オルムの心臓' },
  ending: { title: '明日へ', sub: '' },
  epilogue: { title: '10月19日の朝', sub: 'NEXTMAKE の中庭へ行こう' },
  done: { title: 'おわり', sub: 'ナンバタウンを自由に歩ける' },
}

/** 段階のはじめの目標（phase が決まっていないとき） */
export function defaultPhase(step: Step2086): string {
  switch (step) {
    case 'prologue':
      return 'prologue'
    case 'ch1_booth':
      return 'go_sora'
    case 'ch1_antenna':
      return 'antenna_hook'
    case 'ch1_qr':
      return 'back_booth'
    case 'ch1_keychain':
      return 'keychain'
    case 'ch1_promise':
      return 'night_walk'
    case 'ch2_night':
      return 'night_walk'
    case 'ch3_morning':
      return 'loop_greet'
    case 'ch4_hide':
      return 'hide'
    case 'ch4_tower':
      return 'tower_go'
    case 'ch5_confide':
      return 'confide'
    case 'ch5_door':
      return 'qr_door'
    case 'ch8_back':
      return 'to_site'
    case 'ch8_dial':
      return 'to_ring_dial'
    case 'ch10_shrine':
      return 'to_court'
    case 'ch10_practice':
      return 'toolbox'
    case 'ch10_memory':
      return 'memory'
    case 'ch10_duel':
      return 'duel'
    case 'ch10_travel':
      return 'dial1186'
    case 'ch12_back':
      return 'test_slit'
    case 'ch12_hands':
      return 'hands'
    case 'ch12_ura':
      return 'sky_seam'
    case 'ch12_ending':
      return 'ending'
    case 'epilogue':
      return 'epilogue'
    default:
      return 'done'
  }
}

export function objectiveOf(phase: string): Objective {
  return OBJECTIVES[phase] ?? OBJECTIVES.done
}

/** 何度目の 10月18日の見出し（2 度目から） */
export function dayLabel(n: number): string {
  return n >= 2 ? `${n}度目の、10月18日` : '10月18日'
}
