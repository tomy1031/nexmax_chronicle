// 近未来ホログラム HUD（コンセプト B ＋ A の話者の顔、色と細部は nx_ui_v2_2_holo）。ui/hud.ts の Hud と同じ公開 API。
// ネクマックスの体内の時空鉱石の光をテーマに、深い紺の半透明ガラス・細く光る線・白いハイライト・小さなさし色・走査線。
// ・左上：本物の 3D モデルのポートレート（portrait.ts）、体力 5、鉱石エネルギー、時代と場所
// ・上中央：コンパス（setCompass）　・右上：目的　・中央：照準（対象の種類ごとの形と色）
// ・左下：左腕（Q。左腕に装備があるときだけ出す）　・右下：右腕（J・つかむNMClaw・つかんでいる物）
// ・下中央：会話ウィンドウ（話者の顔・名札・2 行・▷）、必要なときだけのキー案内
// ・お知らせ・大きな文字・画面のふち光り・水門パズル・時代カード・IDO・一時停止（装備・記録／操作一覧）・読み込み
// 表示はキーボードの表記だけ（マウス・コントローラーの絵や文字は出さない）。
// スマホ（setTouchMode）ではキー名を出さず、右腕の輪をつかむボタンにして、文言・操作一覧をタッチ用にする。
// 毎フレーム呼ばれる set* は、値が変わったときだけ DOM を触る（位置は transform で動かす）。
// ・見た目は時代ごとのテーマ（setTheme：2086 ホログラム／2026 研究室／1726 江戸の和柄）。立体的な傾きは付けない
// ・大きさは 1600×900 を基準に、画面の幅・高さの小さいほうに合わせて全体を一律に拡大縮小（CSS の --u）。
//   どの画面でも配置の比率が同じ（16:9 でない画面では四隅に寄せる）
import './hudFuture.css'
import { CompassBar, headingFromCameraYaw } from './compass'
import { DialogueBoard, breakLines, textSizeStep } from './dialogueBoard'
import { FrameManager, frameDefs, hudScale, scaleDefs } from './frame'
import {
  BRACKET_SVG,
  CHEVRON_SVG,
  CLAW_SVG,
  CRYSTAL_SVG,
  DIAMOND_SVG,
  GEAR_SVG,
  HAND_SVG,
  HEART_SVG,
  INFO_SVG,
  NEXT_SVG,
  RETICLE_IDLE_SVG,
  RETICLE_SVG,
  SILHOUETTE_SVG,
  SYSTEM_SVG,
  WAVE_SVG,
} from './icons'
import { MiniRenderer } from './miniRenderer'
import { LivePortrait } from './portrait'
import { SpeakerIconCache, speakerStyle } from './speakerIcons'
import { TalkLogPanel } from './talkLog'
import { PAUSE_DEFAULT_TAB, SETTING_ROWS, filterHintsForArms, nextPauseTab, settingsKey, type PauseTab, type SettingRow } from './hudLogic'
import { FPS_CAPS, MUSIC_LEVELS, QUALITY_LABELS, QUALITY_LEVELS, type FpsCap, type GraphicsPrefs, type MusicLevel, type QualityLevel } from '../../render/quality'
import { DEFAULT_THEME, HUD_THEMES, normalizeTheme, patternDataUri, themeClass, themeFromText, type HudTheme, type PatternName } from './themes'
import { toTouchText } from '../../player/touchLogic'
import {
  CONTROL_LIST,
  TOUCH_CONTROL_LIST,
  type ArmView,
  type GateView,
  type Hint,
  type HudStats,
  type IdoPanelContent,
  type PlanePoint,
  type PlayerPoseHint,
  type PortraitExpression,
  type ReticleCategory,
  type ReticleState,
} from './types'

export * from './types'
export { speakerStyle } from './speakerIcons'
export { DEFAULT_THEME, HUD_THEMES, normalizeTheme, themeFromText, type HudTheme } from './themes'

export type HudFutureOptions = {
  /** 左上に本物の 3D モデルのポートレートを出す（既定 true。false なら SVG の顔） */
  livePortrait?: boolean
  /** 会話の話者アイコンを GLB から作る（既定 true） */
  speakerIcons?: boolean
  /** ポートレートの描画回数（1 秒あたり、既定 20） */
  portraitFps?: number
  /** ひとつ前の台詞を小さく残す最長の秒数（既定 0：残さない。オーナーの希望） */
  ghostSeconds?: number
}

const HP_MAX = 5

const el = <T extends Element = HTMLDivElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** 「J」「Space」「↑↓←→」などのキーを、キーの形のしるしに */
/** 設定タブ：画質・フレームレートの説明 */
const QUALITY_DESC: Record<QualityLevel, string> = {
  low: '影・かすみ・色調だけで描きます。光のにじみと、ふちのなめらかさを省き、解像度も少し下げます。いちばん熱くなりにくい設定です。',
  medium: '影と光のにじみはそのまま、物のすき間の陰（AO）を省きます。スマホ・タブレットのおすすめです。',
  high: '物のすき間の陰（AO）・細かい影・ふちのなめらかさまで、すべて描きます。PC 向けです。',
}
const FPS_LABELS: Record<FpsCap, string> = { 30: '30', 60: '60' }
const FPS_DESC: Record<FpsCap, string> = {
  30: '1 秒に 30 回描きます。電池の減りと発熱がおよそ半分になります。',
  60: '1 秒に 60 回描きます。動きがなめらかです。',
}

const MUSIC_LABELS: Record<MusicLevel, string> = { 0: '切', 1: '小', 2: '中', 3: '大' }
const MUSIC_DESC: Record<MusicLevel, string> = {
  0: '音楽を鳴らしません。',
  1: '音楽を小さく鳴らします。',
  2: '時代ごとの音楽を鳴らします。iPhone はマナーモードのあいだ鳴りません。',
  3: '音楽を大きく鳴らします。',
}

/** 設定の値（data-v の文字） */
function settingValue(row: SettingRow, p: GraphicsPrefs): string {
  return row === 'quality' ? p.quality : row === 'fps' ? String(p.fps) : String(p.music)
}

function settingOpts(row: SettingRow): string {
  const opts: Array<[string, string]> =
    row === 'quality' ? QUALITY_LEVELS.map((q) => [q, QUALITY_LABELS[q]]) : row === 'fps' ? FPS_CAPS.map((f) => [String(f), FPS_LABELS[f]]) : MUSIC_LEVELS.map((m) => [String(m), MUSIC_LABELS[m]])
  return opts.map(([v, label]) => `<span class="nx-set-opt" data-row="${row}" data-v="${v}">${escapeHtml(label)}</span>`).join('')
}

function keycap(key: string): string {
  const k = key.trim()
  const wide = [...k].length > 1 ? ' wide' : ''
  const arrow = /^[↑↓←→]+$/.test(k) ? ' arrow' : ''
  return `<span class="nx-key${wide}${arrow}">${escapeHtml(k)}</span>`
}

/** 操作一覧の「W／A／S／D」→ 4 つのキー */
function keycaps(spec: string): string {
  return spec
    .split('／')
    .map((k) => keycap(k))
    .join('<span class="nx-key-sep">/</span>')
}

/** 操作一覧の 1 行（キーボード：キーの形、タッチ：指の動き・ボタンの名前の札） */
function controlRows(list: Array<[string, string]>, touch: boolean): string {
  return list.map(([k, d]) => `<div class="nx-ctl"><span class="nx-ctl-keys">${touch ? touchTag(k) : keycaps(k)}</span><span class="nx-ctl-desc">${escapeHtml(d)}</span></div>`).join('')
}

/** タッチの「キー」の代わりの札（指の動き・画面のボタンの名前） */
function touchTag(name: string): string {
  return `<span class="nx-key wide nx-tkey">${escapeHtml(name)}</span>`
}

/**
 * Google Fonts を 1 回だけ読み込む。日本語は角の立ったゴシック M PLUS 1p（500／700）、
 * 数字・英字の見出しは Orbitron（500／700）。無いときはヒラギノ角ゴなどで表示（崩れはしない）。
 */
function ensureFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('nx-hud-fonts')) return
  const link = document.createElement('link')
  link.id = 'nx-hud-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@500;700&family=Orbitron:wght@500;700&display=swap'
  document.head.appendChild(link)
}

/** 水門パネルの既定（1726年：源兵衛が歯止めを入れ、おはるが合図する） */
const GATE_LABELS_1726 = { title: '水門の仕掛け', worker: '源兵衛', what: ['歯止め', '歯止めを調整中', '歯止め 完了'], watcher: 'おはる' } as const

/** テーマごとに CSS の背景で使う模様（SVG の defs が無い所：時代カード・読み込み・一時停止の背景） */
const THEME_PATTERNS: Record<HudTheme, { main: [PatternName, string]; sub: [PatternName, string] }> = {
  '2086': { main: ['hex', '#7fe2ff'], sub: ['hex', '#ff6ee0'] },
  '2026': { main: ['grid', '#8ff5ea'], sub: ['grid', '#ffffff'] },
  '1726': { main: ['asanoha', '#f2c662'], sub: ['seigaiha', '#f2c662'] },
  '1970': { main: ['shippo', '#ffb066'], sub: ['grid', '#7fe8dc'] },
  '1186': { main: ['shippo', '#e9c46a'], sub: ['seigaiha', '#7fd8b0'] },
}

/** ルート要素にテーマのクラスと模様の CSS 変数を付ける（HUD と読み込み画面で共用） */
function applyThemeTo(root: HTMLElement, t: HudTheme): void {
  for (const k of HUD_THEMES) root.classList.toggle(themeClass(k), k === t)
  root.dataset.theme = t
  const p = THEME_PATTERNS[t]
  root.style.setProperty('--nx-pat-uri', patternDataUri(p.main[0], p.main[1]))
  root.style.setProperty('--nx-pat-uri2', patternDataUri(p.sub[0], p.sub[1], 1, t === '1726' ? '#0b0f38' : 'none'))
}

/** ルート要素の大きさから --u（デザイン 1px の画面上の大きさ）を決める。値を返す */
function applyScaleTo(root: HTMLElement): number {
  const w = root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1600)
  const h = root.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 900)
  const s = hudScale(w, h)
  root.style.setProperty('--u', `${s.toFixed(5)}px`)
  return s
}

/** ネクマックスの顔（3D が使えないときの代わり・読み込み中） */
const NEXMAX_FACE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="nx-fb-h" cx="0.4" cy="0.32" r="0.75"><stop offset="0" stop-color="#9ad0ff"/><stop offset="1" stop-color="#4c9ae6"/></radialGradient></defs><ellipse cx="11" cy="54" rx="6" ry="10" fill="#5ea8ee"/><ellipse cx="89" cy="54" rx="6" ry="10" fill="#5ea8ee"/><ellipse cx="50" cy="50" rx="40" ry="37" fill="url(#nx-fb-h)" stroke="#16223a" stroke-width="1.6"/><path d="M50 30 C44 26 34 24 26 28 C19 32 17 42 18 54 C19 68 31 77 50 77 C69 77 81 68 82 54 C83 42 81 32 74 28 C66 24 56 26 50 30 Z" fill="#f6f6f4" stroke="#4f6f98" stroke-width="1"/><path d="M30 35 Q35 31 40 34 M60 34 Q65 31 70 35" stroke="#202228" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="38" cy="47" rx="5" ry="6.4" fill="#141416"/><ellipse cx="62" cy="47" rx="5" ry="6.4" fill="#141416"/><path d="M44 58 Q50 66 56 58 Z" fill="#fb7a52" stroke="#3a1c16" stroke-width="1.2" stroke-linejoin="round"/></svg>`

/** 円弧の path（角度は度、12 時が 0、時計回り） */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180
    return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`
  }
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0
  return `M${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}`
}

/** 円周の目盛り（step 度ごと、major 度ごとに長く） */
function ringTicks(cx: number, cy: number, r: number, len: number, step: number, major: number, skip: Array<[number, number]> = []): string {
  const out: string[] = []
  for (let a = 0; a < 360; a += step) {
    if (skip.some(([s0, s1]) => a >= s0 && a <= s1)) continue
    const l = a % major === 0 ? len * 1.9 : len
    const t = ((a - 90) * Math.PI) / 180
    const c = Math.cos(t)
    const sn = Math.sin(t)
    out.push(`M${(cx + r * c).toFixed(1)} ${(cy + r * sn).toFixed(1)}L${(cx + (r + l) * c).toFixed(1)} ${(cy + (r + l) * sn).toFixed(1)}`)
  }
  return out.join('')
}

/** 左上のポートレートの枠（丸いガラス＋光る輪＋目盛り＋外側の弧） */
const PORTRAIT_FRAME_SVG = `<svg class="nx-pf-frame" viewBox="0 0 160 160" aria-hidden="true">
  <circle class="pf-plate" cx="80" cy="80" r="61"/>
  <circle class="pf-pat" cx="80" cy="80" r="61"/>
  <circle class="pf-scan" cx="80" cy="80" r="61"/>
  <circle class="pf-rim" cx="80" cy="80" r="61"/>
  <circle class="pf-in" cx="80" cy="80" r="58.6"/>
  <path class="pf-ticks" d="${ringTicks(80, 80, 65.5, 2.2, 6, 30, [[204, 246], [24, 66]])}"/>
  <g filter="url(#nxf-glow-d)">
    <circle class="pf-ring" cx="80" cy="80" r="55.5"/>
    <path class="pf-acc" d="${arc(80, 80, 55.5, 296, 344)} ${arc(80, 80, 55.5, 116, 164)}"/>
    <path class="pf-arc" d="${arc(80, 80, 62, 206, 244)} ${arc(80, 80, 62, 26, 64)}"/>
  </g>
  <path class="pf-outer" d="${arc(80, 80, 74, 214, 276)} ${arc(80, 80, 74, 300, 326)} ${arc(80, 80, 74, 24, 62)} ${arc(80, 80, 74, 104, 150)}"/>
  <path class="pf-mark" d="${arc(80, 80, 74, 280, 294)} ${arc(80, 80, 74, 154, 160)}"/>
</svg>`

/** ポートレートの周りでゆっくり回る点線の輪 */
const PORTRAIT_SPIN_SVG = `<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="69.5" fill="none" stroke="currentColor" stroke-width="0.9" stroke-dasharray="1.5 5 14 5 1.5 26" opacity="0.75"/></svg>`

/** 腕の枠の輪（左：控えめ、右：明るい） */
function armRingSvg(side: 'left' | 'right'): string {
  const R = side === 'right' ? 64 : 60
  const c = 100
  return `<svg class="nx-arm-svg" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="arm-disk" cx="${c}" cy="${c}" r="${R}"/>
    <circle class="arm-pat" cx="${c}" cy="${c}" r="${R}"/>
    <circle class="arm-scan" cx="${c}" cy="${c}" r="${R}"/>
    <circle class="arm-rim" cx="${c}" cy="${c}" r="${R}"/>
    <circle class="arm-inner" cx="${c}" cy="${c}" r="${R - 8}"/>
    <path class="arm-ticks" d="${ringTicks(c, c, R + 5, 2.4, 5, 45, [[150, 210]])}"/>
    <g filter="url(#nxf-glow-d)">
      <circle class="arm-ring" cx="${c}" cy="${c}" r="${R}"/>
      <path class="arm-acc" d="${arc(c, c, R, 300, 344)} ${arc(c, c, R, 112, 140)}"/>
      <path class="arm-arc" d="${arc(c, c, R + 14, 200, 262)} ${arc(c, c, R + 14, 18, 60)}"/>
      <path class="arm-arc thin" d="${arc(c, c, R + 14, 276, 330)} ${arc(c, c, R + 14, 92, 128)}"/>
    </g>
    <path class="arm-outer" d="${arc(c, c, R + 23, 206, 252)} ${arc(c, c, R + 23, 290, 316)} ${arc(c, c, R + 23, 30, 74)}"/>
    <path class="arm-mark" d="${arc(c, c, R + 23, 258, 270)} ${arc(c, c, R + 23, 80, 85)}"/>
  </svg>`
}

/** 装備の説明（一時停止の「装備・記録」。見るだけで、ここでは付け替えられない） */
const PART_DESC: Record<string, string> = {
  つかむNMClaw: 'ワイヤーを射出して対象をつかむ。射程 約10m。軽い物は手元へ、固定された金具へは自分が移動、仕掛けはその場で保持。小さい敵は引き寄せ、大きい敵へは飛び込む。',
  はじくNMClaw: '電気で爪を一瞬だけ弾き、前へ衝撃を飛ばす。ひび割れた壁を壊し、敵をよろけさせ、盾や装甲を割る。1970年に佐伯ミチが組み上げた。',
  時空裂きのNMクロー: 'NMクローの先に、源兵衛さんの「時を裂く爪」をはめたもの。つかむ・引く・ぶら下がるはそのまま。J で、動いている物を少しのあいだ止める（爪の先が物を時の流れない裏側へさしこむ）・空中のゆらぎを裂いて裏側への切れ目をひらく・裏側にしかない物（黒い手など）を裂く。',
}

export class HudFuture {
  private readonly root: HTMLDivElement
  private readonly defs: SVGSVGElement
  private readonly frames = new FrameManager()
  private readonly compass: CompassBar
  private readonly board = new DialogueBoard()
  /** 会話のきろく（ログ）と AUTO のボタン（上中央、コンパスの下） */
  talk!: TalkLogPanel
  private readonly icons: SpeakerIconCache
  private readonly opts: Required<HudFutureOptions>
  private mini: MiniRenderer | null = null
  private portrait: LivePortrait | null = null
  // 左上
  private readonly pfBox: HTMLDivElement
  private readonly pfCanvas: HTMLDivElement
  private readonly hearts: HTMLSpanElement[]
  private readonly hpBox: HTMLDivElement
  private readonly energy: HTMLDivElement
  private readonly energyFill: HTMLDivElement
  /** 物語 v7 の背中の石の光のつぶ（7 つ）。null の間は出さない */
  private readonly lightsBox: HTMLDivElement
  private readonly lightDots: HTMLElement[]
  private lightsN: number | null = null
  private readonly era: HTMLDivElement
  // 右上
  private readonly objective: HTMLDivElement
  private readonly objTitle: HTMLDivElement
  private readonly objSub: HTMLDivElement
  // 照準
  private readonly reticle: HTMLDivElement
  private readonly retIdle: HTMLDivElement
  private readonly retTarget: HTMLDivElement
  private readonly retShape: HTMLDivElement
  private readonly retBrkL: HTMLDivElement
  private readonly retBrkR: HTMLDivElement
  private readonly retArrow: HTMLDivElement
  private readonly retLabel: HTMLDivElement
  // 下
  private readonly hints: HTMLDivElement
  private readonly toastEl: HTMLDivElement
  private readonly toastText: HTMLSpanElement
  private readonly dialog: HTMLDivElement
  private readonly dlgBox: HTMLDivElement
  private readonly dlgName: HTMLSpanElement
  private readonly dlgText: HTMLDivElement
  private readonly dlgFace: HTMLDivElement
  private readonly dlgNextKey: HTMLSpanElement
  private readonly ghost: HTMLDivElement
  private readonly armR: HTMLDivElement
  private readonly armL: HTMLDivElement
  private readonly armLIcon: HTMLDivElement
  private readonly armRHold: HTMLDivElement
  private readonly armRName: HTMLSpanElement
  private readonly armLName: HTMLSpanElement
  // 水門
  private readonly gate: HTMLDivElement
  private readonly gateSegs: HTMLElement[]
  private readonly gatePct: HTMLSpanElement
  private readonly gateWhat: HTMLSpanElement
  private readonly gateSignal: HTMLDivElement
  private readonly gateSignalText: HTMLSpanElement
  // 演出・パネル
  private readonly bannerEl: HTMLDivElement
  private readonly bannerText: HTMLSpanElement
  private readonly flashEl: HTMLDivElement
  private readonly pause: HTMLDivElement
  private readonly eraCard: HTMLDivElement
  private readonly ido: HTMLDivElement
  private readonly shotLabel: HTMLDivElement
  private readonly stats: HTMLDivElement
  // 状態
  private theme: HudTheme = DEFAULT_THEME
  private scale = 1
  private statsVisible = false
  private hintKey = ''
  private lastHints: Hint[] = []
  private retMode: 'idle' | 'target' | 'far' = 'idle'
  private retCategory: ReticleCategory | null = null
  private retLabelKey = ''
  private retSize = 0
  private retX = Number.POSITIVE_INFINITY
  private retY = Number.POSITIVE_INFINITY
  private retTargetKey = ''
  private toastTimer = 0
  private bannerTimer = 0
  private eraCardTimer = 0
  private eraCardEnd = 0
  private armKey = ''
  private leftPart: string | null = null
  private rightPart = 'つかむNMClaw'
  private gateKey = ''
  private gatePeople = ''
  private hp = HP_MAX
  private energyV: number | null = null
  private objKey = ''
  private dlgVersion = -1
  private dlgTimer = 0
  private faceSig = ''
  private faceMirror: CanvasRenderingContext2D | null = null
  private nextHintKey: string | null = null
  private compassOn = false
  // 一時停止（装備・記録／操作一覧）
  private pauseOn = false
  private menuOn = false
  private pauseTab: PauseTab = PAUSE_DEFAULT_TAB
  /** 設定タブ：いまの画質・フレームレートと、選んでいる項目 */
  private graphics: GraphicsPrefs = { quality: 'high', fps: 60, music: 2 }
  private setRow: SettingRow = SETTING_ROWS[0]
  /** 設定タブで画質・フレームレートを変えた（シェルが適用して、setGraphicsPrefs で戻す） */
  onGraphicsChange: ((p: GraphicsPrefs) => void) | null = null
  // 表情
  private moodOverride: PortraitExpression | null = null
  private moodTimed: { e: PortraitExpression; t: number } | null = null
  private poseMood: PortraitExpression | null = null
  private armsBusy = false
  private oreGlow = 1
  // スマホ（タッチ操作）
  private touch = false
  private objRaw: [string, string] = ['', '']
  private clawPromptKey = ''
  private readonly ro: ResizeObserver | null = null
  private readonly onResize = () => {
    this.applyScale()
    this.layoutTouch()
  }
  /** 一時停止パネルが出ているあいだだけ ← → を聞いてタブを切り替える（ゲームはこの間止まっている） */
  private readonly onPauseKey = (e: KeyboardEvent) => {
    if (e.repeat) return
    const t = nextPauseTab(this.pauseTab, e.code)
    if (t !== this.pauseTab) {
      this.setPauseTab(t)
      return
    }
    if (this.pauseTab !== 'settings') return
    const r = settingsKey(this.setRow, this.graphics, e.code)
    this.setRow = r.row
    this.changeGraphics(r.prefs)
  }

  constructor(ui: HTMLElement, options: HudFutureOptions = {}) {
    this.opts = { livePortrait: options.livePortrait ?? true, speakerIcons: options.speakerIcons ?? true, portraitFps: options.portraitFps ?? 20, ghostSeconds: options.ghostSeconds ?? 0 }
    this.board.ghostMax = this.opts.ghostSeconds
    ensureFonts()
    this.root = document.createElement('div')
    this.root.className = 'nx-hud'
    this.root.innerHTML = `
      <div class="nx-status">
        <div class="nx-bars">
          <div class="nx-hp"><div class="nx-frame-host" data-frame="bar"></div><div class="nx-hearts" aria-label="体力">${`<span class="nx-heart">${HEART_SVG}</span>`.repeat(HP_MAX)}</div></div>
          <div class="nx-micro nx-micro-hp"><span>NX-01 · VITAL</span><i class="nx-barcode"></i></div>
          <div class="nx-energy"><div class="nx-frame-host" data-frame="bar"></div><span class="nx-crystal">${CRYSTAL_SVG}</span><div class="nx-gauge"><div class="nx-gauge-fill"></div><div class="nx-gauge-seg"></div></div></div>
          <div class="nx-lights" hidden><div class="nx-frame-host" data-frame="bar"></div><span class="nx-crystal">${CRYSTAL_SVG}</span><span class="nx-lights-label">光のつぶ</span><div class="nx-light-row" aria-label="光のつぶ">${'<i class="nx-light"></i>'.repeat(7)}</div></div>
        </div>
        <div class="nx-portrait">
          <div class="nx-pf-glow"></div>
          ${PORTRAIT_FRAME_SVG}
          <div class="nx-pf-spin">${PORTRAIT_SPIN_SVG}</div>
          <div class="nx-pf-canvas"><div class="nx-pf-fallback">${NEXMAX_FACE_SVG}</div></div>
          <div class="nx-pf-hurt"></div>
        </div>
        <div class="nx-era"><div class="nx-frame-host" data-frame="plate"></div><span class="nx-era-text">1726年　大坂・仕掛け横丁</span></div>
      </div>
      <div class="nx-objective">
        <div class="nx-frame-host" data-frame="objective"></div>
        <div class="nx-sweep"></div>
        <div class="nx-obj-icon">${DIAMOND_SVG}</div>
        <div class="nx-obj-text"><div class="nx-obj-title"></div><i class="nx-obj-rule"></i><div class="nx-obj-sub"></div></div>
      </div>
      <div class="nx-gate" hidden>
        <div class="nx-frame-host" data-frame="panel"></div>
        <div class="nx-gate-head"><span class="nx-gate-gear">${GEAR_SVG}</span><span class="nx-gate-title">水門の仕掛け</span></div>
        <div class="nx-gate-row">
          <span class="nx-gate-face" data-who="源兵衛"></span><span class="nx-gate-who">源兵衛</span>
          <span class="nx-gate-what">歯止め</span>
          <div class="nx-gate-bar">${'<i></i>'.repeat(10)}</div>
          <span class="nx-gate-pct">0%</span>
        </div>
        <div class="nx-gate-row">
          <span class="nx-gate-face" data-who="おはる"></span><span class="nx-gate-who">おはる</span>
          <div class="nx-gate-signal" data-signal="watch"><i class="lamp"></i><span>見張り中</span></div>
        </div>
      </div>
      <div class="nx-shot"></div>
      <div class="nx-reticle">
        <div class="nx-ret-idle">${RETICLE_IDLE_SVG}</div>
        <div class="nx-ret-target" hidden>
          <div class="nx-ret-brk l">${BRACKET_SVG}</div>
          <div class="nx-ret-brk r">${BRACKET_SVG}</div>
          <div class="nx-ret-shape"></div>
          <div class="nx-ret-arrow">${CHEVRON_SVG}</div>
          <div class="nx-ret-label"></div>
        </div>
      </div>
      <div class="nx-banner" hidden><i class="nx-bn-line l"></i><span class="nx-bn-text"></span><i class="nx-bn-line r"></i></div>
      <div class="nx-flash"></div>
      <div class="nx-toast" hidden><div class="nx-frame-host" data-frame="toast"></div><span class="nx-toast-icon">${INFO_SVG}</span><span class="nx-toast-text"></span></div>
      <div class="nx-dialog" hidden>
        <div class="nx-dlg-ghost" hidden></div>
        <div class="nx-dlg-box">
          <div class="nx-frame-host" data-frame="dialog"></div>
          <div class="nx-sweep"></div>
          <div class="nx-dlg-wave">${WAVE_SVG}</div>
          <div class="nx-dlg-text"></div>
          <div class="nx-dlg-next"><span class="nx-dlg-nextkey" hidden></span><span class="nx-dlg-arrow">${NEXT_SVG}</span></div>
        </div>
        <div class="nx-dlg-face"><div class="nx-frame-host" data-frame="face"></div><div class="nx-face-img"></div></div>
        <div class="nx-dlg-name"><div class="nx-frame-host" data-frame="plate"></div><span></span><i class="nx-dlg-slash"></i></div>
      </div>
      <div class="nx-hints"></div>
      <div class="nx-arm nx-arm-left empty" hidden>
        <div class="nx-arm-ringbox">${armRingSvg('left')}<div class="nx-arm-icon">${HAND_SVG}</div>${keycap('Q')}</div>
        <div class="nx-arm-plate"><div class="nx-frame-host" data-frame="armPlate"></div><span class="nx-arm-name">装備なし</span><span class="nx-arm-code">L-ARM · ITEM</span></div>
      </div>
      <div class="nx-arm nx-arm-right">
        <div class="nx-arm-hold" hidden><span class="nx-hold-dot"></span><span class="nx-hold-text"></span></div>
        <div class="nx-arm-ringbox">${armRingSvg('right')}<div class="nx-arm-spin"></div><div class="nx-arm-icon">${CLAW_SVG}</div>${keycap('J')}<span class="nx-arm-prompt" hidden></span></div>
        <div class="nx-arm-plate"><div class="nx-frame-host" data-frame="armPlate"></div><span class="nx-arm-name">つかむNMClaw</span><span class="nx-arm-code">R-ARM · ACTION</span></div>
      </div>
      <div class="nx-modal nx-pause" hidden>
        <div class="nx-panel">
          <div class="nx-frame-host" data-frame="panel"></div>
          <div class="nx-panel-head">
            <span class="nx-panel-tag">PAUSE</span><span class="nx-panel-title">一時停止</span>
            <div class="nx-tabs" role="tablist">
              ${keycap('←')}
              <div class="nx-tab" data-tab="equip" role="tab"><div class="nx-frame-host" data-frame="tab"></div><span>装備・記録</span></div>
              <div class="nx-tab" data-tab="controls" role="tab"><div class="nx-frame-host" data-frame="tab"></div><span>操作一覧</span></div>
              <div class="nx-tab" data-tab="settings" role="tab"><div class="nx-frame-host" data-frame="tab"></div><span>設定</span></div>
              ${keycap('→')}
            </div>
          </div>
          <div class="nx-panes">
            <div class="nx-pane" data-pane="equip">
              <div class="nx-menu-grid">
                <div class="nx-menu-card">
                  <div class="nx-frame-host" data-frame="card"></div>
                  <div class="nx-menu-head">装備<span class="nx-menu-ro">確認のみ</span></div>
                  <div class="nx-menu-slot" data-side="right"><span class="nx-slot-icon">${CLAW_SVG}</span><span class="nx-slot-side">右腕</span><span class="nx-slot-part">つかむNMClaw</span></div>
                  <div class="nx-menu-desc" data-desc="right">${escapeHtml(PART_DESC['つかむNMClaw'])}</div>
                  <div class="nx-menu-slot empty" data-side="left"><span class="nx-slot-icon">${HAND_SVG}</span><span class="nx-slot-side">左腕</span><span class="nx-slot-part">装備なし</span></div>
                  <div class="nx-menu-desc" data-desc="left" hidden></div>
                  <div class="nx-menu-desc nx-menu-note">装備の交換は異次元拠点の装備台で行えます。</div>
                </div>
                <div class="nx-menu-card">
                  <div class="nx-frame-host" data-frame="card"></div>
                  <div class="nx-menu-head">記録</div>
                  <div class="nx-menu-desc">IDO で見た記録：まだありません。</div>
                  <div class="nx-menu-desc">収納：0 / 8</div>
                  <div class="nx-store">${'<i></i>'.repeat(8)}</div>
                </div>
              </div>
            </div>
            <div class="nx-pane" data-pane="controls">
              <div class="nx-panel-sub">操作一覧（キーボード）</div>
              <div class="nx-controls">${controlRows(CONTROL_LIST, false)}</div>
              <div class="nx-panel-note">キー設定は今後のバージョンで対応します</div>
            </div>
            <div class="nx-pane" data-pane="settings">
              <div class="nx-panel-sub">画面と音の設定（この端末に保存します）</div>
              <div class="nx-settings">
                <div class="nx-set-row" data-row="quality"><span class="nx-set-name">画質</span><div class="nx-set-opts">${settingOpts('quality')}</div></div>
                <div class="nx-set-desc" data-desc="quality"></div>
                <div class="nx-set-row" data-row="fps"><span class="nx-set-name">フレームレート</span><div class="nx-set-opts">${settingOpts('fps')}</div></div>
                <div class="nx-set-desc" data-desc="fps"></div>
                <div class="nx-set-row" data-row="music"><span class="nx-set-name">音楽</span><div class="nx-set-opts">${settingOpts('music')}</div></div>
                <div class="nx-set-desc" data-desc="music"></div>
              </div>
              <div class="nx-panel-note nx-set-note">スマホが熱くなるときは「省電力」と「30」を選んでください。</div>
            </div>
          </div>
          <div class="nx-panel-foot"><span class="nx-foot-tabs">${keycap('←')}${keycap('→')}<span>切り替え</span></span><span class="nx-foot-set" hidden>${keycap('W')}${keycap('S')}<span>項目</span>${keycap('A')}${keycap('D')}<span>変更</span></span><span class="nx-foot-close"></span></div>
        </div>
      </div>
      <div class="nx-eracard" hidden>
        <div class="nx-ec-glow"></div>
        <div class="nx-ec-pat"></div>
        <div class="nx-ec-line top"><i></i></div>
        <div class="nx-ec-tag">TIME LINK</div>
        <div class="nx-ec-year"></div>
        <div class="nx-ec-place"></div>
        <div class="nx-ec-sub"></div>
        <div class="nx-ec-line bottom"><i></i></div>
      </div>
      <div class="nx-ido" hidden>
        <div class="nx-ido-card">
          <div class="nx-frame-host" data-frame="panel"></div>
          <div class="nx-ido-head"><span class="nx-ido-logo">IDO</span><span class="nx-ido-title"></span></div>
          <div class="nx-ido-sub"></div>
          <div class="nx-ido-image"></div>
          <div class="nx-ido-body"></div>
          <div class="nx-ido-foot"></div>
          <div class="nx-ido-scan"></div>
        </div>
      </div>
      <div class="nx-stats"></div>`
    this.defs = frameDefs()
    this.root.prepend(this.defs)
    applyThemeTo(this.root, this.theme)
    ui.appendChild(this.root)
    const r = this.root
    // コンパス（上中央）
    this.compass = new CompassBar()
    this.compass.el.hidden = true
    r.insertBefore(this.compass.el, el(r, '.nx-objective'))
    this.talk = new TalkLogPanel(r, (s) => speakerStyle(s).color)
    // 左上
    this.pfBox = el(r, '.nx-portrait')
    this.pfCanvas = el(r, '.nx-pf-canvas')
    this.hearts = Array.from(r.querySelectorAll<HTMLSpanElement>('.nx-heart'))
    this.hpBox = el(r, '.nx-hp')
    this.energy = el(r, '.nx-energy')
    this.energyFill = el(r, '.nx-gauge-fill')
    this.lightsBox = el(r, '.nx-lights')
    this.lightDots = Array.from(r.querySelectorAll<HTMLElement>('.nx-light'))
    this.era = el(r, '.nx-era-text')
    // 右上
    this.objective = el(r, '.nx-objective')
    this.objTitle = el(r, '.nx-obj-title')
    this.objSub = el(r, '.nx-obj-sub')
    // 照準
    this.reticle = el(r, '.nx-reticle')
    this.retIdle = el(r, '.nx-ret-idle')
    this.retTarget = el(r, '.nx-ret-target')
    this.retShape = el(r, '.nx-ret-shape')
    this.retBrkL = el(r, '.nx-ret-brk.l')
    this.retBrkR = el(r, '.nx-ret-brk.r')
    this.retArrow = el(r, '.nx-ret-arrow')
    this.retLabel = el(r, '.nx-ret-label')
    // 下
    this.hints = el(r, '.nx-hints')
    this.toastEl = el(r, '.nx-toast')
    this.toastText = el(r, '.nx-toast-text')
    this.dialog = el(r, '.nx-dialog')
    this.dlgBox = el(r, '.nx-dlg-box')
    this.dlgName = el(r, '.nx-dlg-name span')
    this.dlgText = el(r, '.nx-dlg-text')
    this.dlgFace = el(r, '.nx-face-img')
    this.dlgNextKey = el(r, '.nx-dlg-nextkey')
    this.ghost = el(r, '.nx-dlg-ghost')
    this.armR = el(r, '.nx-arm-right')
    this.armL = el(r, '.nx-arm-left')
    this.armLIcon = el(r, '.nx-arm-left .nx-arm-icon')
    this.armRHold = el(r, '.nx-arm-hold')
    this.armRName = el(r, '.nx-arm-right .nx-arm-name')
    this.armLName = el(r, '.nx-arm-left .nx-arm-name')
    // 水門
    this.gate = el(r, '.nx-gate')
    this.gateSegs = Array.from(r.querySelectorAll<HTMLElement>('.nx-gate-bar i'))
    this.gatePct = el(r, '.nx-gate-pct')
    this.gateWhat = el(r, '.nx-gate-what')
    this.gateSignal = el(r, '.nx-gate-signal')
    this.gateSignalText = el(r, '.nx-gate-signal span')
    // 演出・パネル
    this.bannerEl = el(r, '.nx-banner')
    this.bannerText = el(r, '.nx-bn-text')
    this.flashEl = el(r, '.nx-flash')
    this.pause = el(r, '.nx-pause')
    this.eraCard = el(r, '.nx-eracard')
    this.ido = el(r, '.nx-ido')
    this.shotLabel = el(r, '.nx-shot')
    this.stats = el(r, '.nx-stats')

    // 大きさ：先に --u を決めてから枠を描く（どの画面でも同じ比率）
    this.applyScale()
    this.frames.attachAll(r)
    this.setPauseTab(PAUSE_DEFAULT_TAB)
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.onResize())
      this.ro.observe(this.root)
    }
    window.addEventListener('resize', this.onResize)
    this.icons = new SpeakerIconCache()
    this.icons.onReady(() => this.refreshFaces())
    this.setObjective('大歯車を支えて、水門を直そう', '桟橋から照準を歯車へ向けて J でつかむ')
    this.setEnergy(null)
    // ポートレートと話者アイコン（ゲームの最初の描画を邪魔しないよう、少し後で作る）
    if (this.opts.livePortrait || this.opts.speakerIcons) {
      const start = () => this.initRenderer()
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 900 })
      else setTimeout(start, 250)
    }
  }

  // ================================================================ 大きさ・テーマ

  /** 画面（ルート要素）の大きさから全体の拡大率を決め、枠・模様・にじみを描き直す */
  private applyScale(): void {
    const s = applyScaleTo(this.root)
    if (Math.abs(s - this.scale) < 1e-4 && this.root.dataset.scaled === '1') return
    this.root.dataset.scaled = '1'
    this.scale = s
    scaleDefs(this.defs, s)
    this.frames.setScale(s)
    // 照準の括弧の幅・大きさは px で置いているので測り直す
    this.bracketW = 0
    this.retSize = 0
  }

  /**
   * 時代ごとの見た目（'1726' 江戸の和柄／'2026' 研究室／'2086' ホログラム）。呼ばれるまでは 2086。
   * 知らない値は既定に戻す（年を含む文 '1726年…' も受け付ける）。
   */
  setTheme(key: HudTheme | string): void {
    const t = normalizeTheme(key)
    if (t === this.theme) return
    this.theme = t
    applyThemeTo(this.root, t)
  }

  /** いまのテーマ */
  get currentTheme(): HudTheme {
    return this.theme
  }

  // ================================================================ ポートレート・話者アイコン

  private initRenderer(): void {
    if (this.mini || !this.root.isConnected) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = Math.max(128, Math.min(256, Math.round(this.pfCanvas.clientWidth * dpr) || 192))
    this.mini = MiniRenderer.create(size)
    if (!this.mini) return
    this.mini.onLost = () => this.pfBox.classList.remove('live')
    if (this.opts.livePortrait) {
      try {
        this.portrait = new LivePortrait(this.mini)
        this.portrait.setFps(this.opts.portraitFps)
        this.pfCanvas.appendChild(this.portrait.el)
        this.portrait.start()
        this.pfBox.classList.add('live')
        this.applyMood()
        this.portrait.setOreGlow(this.oreGlow)
        const p = this.portrait
        this.icons.nexmaxSnapshot = () => p.snapshot()
      } catch (e) {
        console.warn('[hudFuture] ポートレートを作れませんでした', e)
        this.portrait = null
      }
    }
    if (this.opts.speakerIcons) this.icons.setRenderer(this.mini)
    this.refreshFaces()
  }

  /** 話者アイコンを先に作っておく（例：['源兵衛', 'おはる']） */
  preloadSpeakers(names: string[]): void {
    this.icons.preload(names)
  }

  /** 話者アイコンの画像を外から渡す（イラストなど）。name は話者名 */
  setSpeakerIcon(name: string, url: string): void {
    const st = speakerStyle(name)
    this.icons.set(st.source ?? `name:${name}`, url)
  }

  private faceUrl(name: string): string | null {
    const st = speakerStyle(name)
    if (!st.source) return this.icons.get(`name:${name}`)
    if (st.source === 'system') return null
    const u = this.icons.get(st.source)
    if (!u && this.opts.speakerIcons) this.icons.request(st.source)
    return u
  }

  /** 顔の中身（画像・生の絵・しるし） */
  private faceHtml(name: string): string {
    const st = speakerStyle(name)
    if (st.source === 'system') return `<span class="nx-face-svg sys">${SYSTEM_SVG}</span>`
    const url = this.faceUrl(name)
    if (url) return `<img alt="" src="${url}">`
    if (st.source === 'nexmax') return `<span class="nx-face-svg">${NEXMAX_FACE_SVG}</span>`
    return `<span class="nx-face-svg sil">${SILHOUETTE_SVG}</span>`
  }

  private refreshFaces(): void {
    // 会話ウィンドウ
    const m = this.board.main
    if (m) this.updateDialogFace(m.speaker)
    // 水門パネル（出ているときだけ。隠れているのに顔を作ると、1726年以外でも源兵衛・おはるのモデルを読み込んでしまう）
    if (this.gate.hidden) return
    this.root.querySelectorAll<HTMLElement>('.nx-gate-face').forEach((f) => {
      const who = f.dataset.who ?? ''
      f.style.setProperty('--spk', speakerStyle(who).color)
      f.innerHTML = this.faceHtml(who)
    })
  }

  // ================================================================ 表情

  /** ポートレートの表情を固定する（null で自動に戻す） */
  setPortraitExpression(e: PortraitExpression | null): void {
    this.moodOverride = e
    this.applyMood()
  }

  /** プレイヤーのポーズ（落下＝驚き）。クローでつかむ・引っぱられる・ぶら下がるときは表情を変えない（キリッとした目が、こわく見えるので） */
  setPlayerPose(p: PlayerPoseHint | string | null): void {
    const m: PortraitExpression | null = p === 'fall' ? 'surprised' : null
    if (m === this.poseMood) return
    this.poseMood = m
    this.applyMood()
  }

  /** 鉱石の光（ゲームの oreGlow と同じ尺度：0 = 消灯、1 = 通常、2 以上 = 強く） */
  setOreGlow(v: number): void {
    const g = Math.max(0, v)
    if (Math.abs(g - this.oreGlow) < 0.02) return
    this.oreGlow = g
    this.portrait?.setOreGlow(g)
    this.pfBox.style.setProperty('--ore', Math.min(2.5, g).toFixed(2))
  }

  private moodFor(e: PortraitExpression, seconds: number): void {
    this.moodTimed = { e, t: seconds }
    this.applyMood()
  }

  private currentMood(): PortraitExpression {
    if (this.moodOverride) return this.moodOverride
    if (this.moodTimed) return this.moodTimed.e
    if (this.poseMood) return this.poseMood
    if (this.hp <= 1) return 'worried'
    return 'happy'
  }

  private applyMood(): void {
    const e = this.currentMood()
    this.portrait?.setExpression(e)
    this.pfBox.dataset.mood = e
  }

  // ================================================================ 左上

  setObjective(title: string, sub: string): void {
    this.objRaw = [title, sub]
    if (this.touch) sub = toTouchText(sub)
    const key = `${title}|${sub}`
    if (key === this.objKey) return
    const first = this.objKey === ''
    this.objKey = key
    if (this.objTitle.textContent !== title) this.objTitle.textContent = title
    if (this.objSub.textContent !== sub) this.objSub.textContent = sub
    this.objSub.hidden = !sub
    this.objective.classList.toggle('no-sub', !sub)
    if (!first) this.retrigger(this.objective, 'updated')
  }

  setEra(text: string): void {
    if (this.era.textContent !== text) this.era.textContent = text
  }

  /** 体力（0〜5 目盛り） */
  setHp(n: number): void {
    const v = Math.max(0, Math.min(HP_MAX, Math.round(n)))
    const prev = this.hp
    if (v === prev) return
    this.hp = v
    this.hearts.forEach((h, i) => {
      h.classList.toggle('empty', i >= v)
      if (v < prev && i >= v && i < prev) this.retrigger(h, 'lost')
      if (v > prev && i < v && i >= prev) this.retrigger(h, 'gain')
    })
    this.hpBox.classList.toggle('low', v <= 1)
    if (v < prev) {
      this.retrigger(this.pfBox, 'hurt')
      this.moodFor('worried', 2.2)
    } else this.moodFor('happy', 1.5)
  }

  /** 特殊エネルギー（null で非表示。必要なときだけ出す） */
  setEnergy(v: number | null): void {
    const show = v !== null
    if (this.energy.hidden === show) this.energy.hidden = !show
    this.root.classList.toggle('nx-has-energy', show)
    if (v === null) {
      this.energyV = null
      return
    }
    const c = Math.max(0, Math.min(1, v))
    if (this.energyV !== null && Math.abs(c - this.energyV) < 0.002) return
    this.energyV = c
    this.energyFill.style.transform = `scaleX(${c.toFixed(3)})`
    this.energy.classList.toggle('full', c >= 0.999)
  }

  /**
   * 背中の石の光のつぶ（物語 v7。0〜7。null で非表示）。減ったつぶははじけて消え、顔の縁が光る。
   * シェルがフラグ（chronicle/progress.ts lightsLeft）から毎フレーム渡す（同じ数なら何もしない）
   */
  setLights(n: number | null): void {
    if (n === this.lightsN) return
    const prev = this.lightsN
    this.lightsN = n
    const show = n !== null
    if (this.lightsBox.hidden === show) this.lightsBox.hidden = !show
    this.root.classList.toggle('nx-has-lights', show)
    if (n === null) return
    this.lightDots.forEach((d, i) => {
      d.classList.toggle('off', i >= n)
      if (prev !== null && n < prev && i >= n && i < prev) this.retrigger(d, 'lost')
    })
    this.lightsBox.classList.toggle('last', n <= 1)
    if (prev !== null && n < prev) this.retrigger(this.lightsBox, 'spent')
  }

  setShot(label: string | null): void {
    this.shotLabel.textContent = label ?? ''
    this.shotLabel.style.display = label ? 'block' : 'none'
  }

  /** プレイ用の表示（照準・案内・お知らせ・コンパス）をまとめて隠す（ショット撮影用） */
  setPlayUiVisible(on: boolean): void {
    this.root.classList.toggle('nx-no-play-ui', !on)
  }

  // ================================================================ コンパス（新規）

  /**
   * 上中央のコンパス。cameraYaw は cameraRig.yaw（ラジアン）。target は目的地（null でピンなし）、
   * from はプレイヤーの位置（THREE.Vector3 をそのまま渡せる）。cameraYaw に null でコンパスごと隠す。
   */
  setCompass(cameraYaw: number | null, target: PlanePoint | null = null, from: PlanePoint | null = null): void {
    this.setCompassHeading(cameraYaw === null ? null : headingFromCameraYaw(cameraYaw), target, from)
  }

  /** 方位（度、北 = -Z が 0、東 = +X が 90）で指定する版 */
  setCompassHeading(headingDeg: number | null, target: PlanePoint | null = null, from: PlanePoint | null = null): void {
    const on = headingDeg !== null
    if (on !== this.compassOn) {
      this.compassOn = on
      this.compass.el.hidden = !on
    }
    if (headingDeg === null) return
    this.compass.update(headingDeg, target, from)
  }

  // ================================================================ 照準

  setReticle(s: ReticleState): void {
    if (s.mode === 'idle') {
      if (this.retMode !== 'idle') {
        this.retMode = 'idle'
        this.retIdle.hidden = false
        this.retTarget.hidden = true
        this.reticle.classList.remove('snapped')
        this.retTargetKey = ''
      }
      return
    }
    const wasIdle = this.retMode === 'idle'
    if (s.mode !== this.retMode) {
      this.retMode = s.mode
      this.retIdle.hidden = s.mode === 'target'
      this.retTarget.hidden = false
      this.reticle.classList.toggle('snapped', s.mode === 'target')
      this.retTarget.classList.toggle('far', s.mode === 'far')
    }
    if (this.retCategory !== s.category) {
      this.retCategory = s.category
      this.retShape.innerHTML = RETICLE_SVG[s.category]
      this.retTarget.dataset.cat = s.category
    }
    this.retTarget.classList.toggle('connected', s.connected)
    // 新しい対象に吸い付いたら、ぱっと縮む演出
    const tkey = `${s.label}|${s.category}`
    if (s.mode === 'target' && (wasIdle || tkey !== this.retTargetKey)) this.retrigger(this.retTarget, 'snap')
    this.retTargetKey = tkey
    if (!(Math.abs(s.x - this.retX) <= 0.2 && Math.abs(s.y - this.retY) <= 0.2)) {
      this.retX = s.x
      this.retY = s.y
      this.retTarget.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`
    }
    // 括弧の大きさ：対象の画面上の大きさ（px）に合わせ、最小・最大は HUD の拡大率に合わせる
    const k = this.scale
    const size = Math.round(Math.max(64 * k, Math.min(280 * k, s.r * 2.3 + 24 * k)))
    if (size !== this.retSize) {
      this.retSize = size
      const half = size / 2
      const bh = `${size}px`
      this.retBrkL.style.height = bh
      this.retBrkR.style.height = bh
      this.retBrkL.style.transform = `translate3d(${(-half).toFixed(0)}px, ${(-half).toFixed(0)}px, 0)`
      this.retBrkR.style.transform = `translate3d(${(half - this.bracketWidth()).toFixed(0)}px, ${(-half).toFixed(0)}px, 0) scaleX(-1)`
      this.retArrow.style.transform = `translate3d(-50%, ${(half * 0.55 + 6 * k).toFixed(0)}px, 0)`
      this.retLabel.style.transform = `translate3d(-50%, ${(half + 10 * k).toFixed(0)}px, 0)`
    }
    const label = s.mode === 'far' ? `${s.label}（遠い）` : s.label
    const multi = s.candidates > 1 && !s.connected
    const key = `${label}|${multi ? 1 : 0}|${s.locked ? 1 : 0}`
    if (key !== this.retLabelKey) {
      this.retLabelKey = key
      // スマホでは「切替」ボタンが出るので R の案内は出さない
      const lock = !multi ? '' : this.touch ? (s.locked ? '<span class="nx-ret-lock"><b>ロック中</b></span>' : '') : `<span class="nx-ret-lock">${s.locked ? '<b>ロック中</b>' : ''}${keycap('R')}切替</span>`
      this.retLabel.innerHTML = `<span class="nx-ret-name">${escapeHtml(label)}</span>${lock}`
    }
  }

  private bracketW = 0
  private bracketWidth(): number {
    if (!this.bracketW) this.bracketW = this.retBrkL.offsetWidth || 16 * this.scale
    return this.bracketW
  }

  // ================================================================ 画面下：キー案内・お知らせ

  /** 必要なときだけのキー案内。同じ内容なら DOM を触らない */
  setHints(list: Hint[]): void {
    this.lastHints = list
    // 左腕に装備が無いあいだは Q の案内を出さない
    const shown = filterHintsForArms(list, this.leftPart !== null)
    const key = shown.map((h) => `${h.key}:${h.label}`).join('|')
    if (key === this.hintKey) return
    this.hintKey = key
    // 「F：次へ」は会話ウィンドウの ▷ の横に出す
    const next = shown.find((h) => h.label === '次へ') ?? null
    this.nextHintKey = next ? next.key : null
    this.updateNextMark()
    const rest = shown.filter((h) => h !== next)
    if (this.touch) {
      // タッチ：key は指の動きの名前（「スティック」など）。小さな札を 1 列
      this.hints.classList.add('row')
      const host = '<span class="nx-frame-host" data-frame="chip"></span>'
      this.hints.innerHTML = rest.map((h) => `<span class="nx-chip small">${host}${touchTag(h.key)}<span class="nx-chip-label">${escapeHtml(h.label)}</span></span>`).join('')
      this.frames.prune()
      this.frames.attachAll(this.hints)
      return
    }
    const row = rest.length >= 4
    this.hints.classList.toggle('row', row)
    const host = '<span class="nx-frame-host" data-frame="chip"></span>'
    this.hints.innerHTML = rest
      .map((h, i) =>
        row
          ? `<span class="nx-chip small">${host}${keycap(h.key)}<span class="nx-chip-label">${escapeHtml(h.label)}</span></span>`
          : `<span class="nx-chip${i === 0 ? ' primary' : ''}">${host}${keycap(h.key)}<span class="nx-chip-de">で</span><span class="nx-chip-label">${escapeHtml(h.label)}</span></span>`,
      )
      .join('')
    this.frames.prune()
    this.frames.attachAll(this.hints)
  }

  /** 短いお知らせ（「左腕：装備なし」など） */
  toast(text: string, seconds = 2.2): void {
    if (this.touch) text = toTouchText(text)
    this.toastText.textContent = text
    this.toastEl.hidden = false
    this.retrigger(this.toastEl, 'show')
    this.toastTimer = seconds
  }

  // ================================================================ 会話

  /** 台詞（話者名＋一言）。新しい台詞をウィンドウに出す */
  say(speaker: string, text: string, seconds = 3.8): void {
    if (this.touch) text = toTouchText(text)
    this.talk.push(speaker, text)
    const now = performance.now() / 1000
    const r = this.board.say(speaker, text, seconds, now)
    if (r === 'new') this.renderDialog()
    this.scheduleDialogCheck()
  }

  /** 会話ウィンドウを今すぐ空にする（時空移動でステージが替わるとき） */
  clearDialog(): void {
    clearTimeout(this.dlgTimer)
    this.board.clear()
    this.renderDialog()
  }

  private scheduleDialogCheck(): void {
    clearTimeout(this.dlgTimer)
    const next = this.board.nextExpiry()
    if (next === null) return
    const wait = Math.max(0, next - performance.now() / 1000) * 1000 + 30
    this.dlgTimer = window.setTimeout(() => {
      if (this.board.tick(performance.now() / 1000)) this.renderDialog()
      this.scheduleDialogCheck()
    }, wait)
  }

  private renderDialog(): void {
    if (this.board.version === this.dlgVersion) return
    this.dlgVersion = this.board.version
    const m = this.board.main
    if (!m) {
      // 台詞が終わったら、残っている小さな台詞ごと閉じる
      this.board.clear()
      this.dlgVersion = this.board.version
      if (!this.dialog.hidden && !this.dialog.classList.contains('out')) {
        this.dialog.classList.add('out')
        this.root.classList.remove('nx-talking')
        setTimeout(() => {
          if (!this.board.main) {
            this.dialog.hidden = true
            this.dialog.classList.remove('out')
            this.clearFaceMirror()
            this.faceSig = ''
          }
        }, 260)
      }
      return
    }
    const st = speakerStyle(m.speaker)
    this.dialog.classList.remove('out')
    this.dialog.hidden = false
    this.root.classList.add('nx-talking')
    this.dialog.style.setProperty('--spk', st.color)
    this.dialog.dataset.spk = st.key
    this.dlgName.textContent = m.speaker
    this.dlgText.textContent = breakLines(m.text, textSizeStep(m.text))
    this.dlgText.dataset.size = String(textSizeStep(m.text))
    this.updateDialogFace(m.speaker)
    this.retrigger(this.dlgBox, 'enter')
    const g = this.board.ghost
    this.ghost.hidden = !g
    if (g) {
      this.ghost.style.setProperty('--spk', speakerStyle(g.speaker).color)
      this.ghost.innerHTML = `<span class="nx-ghost-who">${escapeHtml(g.speaker)}</span><span class="nx-ghost-text">${escapeHtml(g.text)}</span>`
    }
    this.updateNextMark()
  }

  private updateDialogFace(speaker: string): void {
    const st = speakerStyle(speaker)
    const live = st.source === 'nexmax' && !!this.portrait
    const url = live ? null : this.faceUrl(speaker)
    const sig = live ? 'live' : `${st.source ?? 'name:' + speaker}|${url ? url.length : 0}`
    if (sig === this.faceSig) return
    this.faceSig = sig
    if (live) {
      this.dlgFace.innerHTML = '<canvas class="nx-face-live" width="192" height="192"></canvas>'
      const c = this.dlgFace.querySelector('canvas') as HTMLCanvasElement
      this.faceMirror = c.getContext('2d')
      if (this.faceMirror) this.portrait?.addMirror(this.faceMirror)
      return
    }
    this.clearFaceMirror()
    this.dlgFace.innerHTML = this.faceHtml(speaker)
  }

  private clearFaceMirror(): void {
    if (!this.faceMirror) return
    this.portrait?.removeMirror(this.faceMirror)
    this.faceMirror = null
  }

  private updateNextMark(): void {
    const k = this.nextHintKey
    this.dlgNextKey.hidden = !k
    if (k && this.dlgNextKey.dataset.key !== k) {
      this.dlgNextKey.dataset.key = k
      this.dlgNextKey.innerHTML = `${keycap(k)}<span>次へ</span>`
    }
  }

  // ================================================================ 腕

  setArms(a: ArmView): void {
    const key = JSON.stringify(a)
    if (key === this.armKey) return
    this.armKey = key
    this.armR.classList.toggle('active', a.right.active)
    this.armR.classList.toggle('selected', a.right.selected)
    this.armR.classList.toggle('holding', !!a.right.holding)
    if (this.armRName.textContent !== a.right.name) this.armRName.textContent = a.right.name
    const holdText = el<HTMLSpanElement>(this.armRHold, '.nx-hold-text')
    holdText.textContent = a.right.holding ?? ''
    this.armRHold.hidden = !a.right.holding
    // 左腕：装備があるときだけ出す（初期の「装備なし」は画面に置かない）
    const leftChanged = a.left.name !== this.leftPart
    this.leftPart = a.left.name
    this.armL.hidden = a.left.name === null
    this.armL.classList.toggle('selected', a.left.selected)
    this.armL.classList.toggle('empty', a.left.name === null)
    this.armLName.textContent = a.left.name ?? '装備なし'
    if (leftChanged) {
      this.armLIcon.innerHTML = a.left.name ? CLAW_SVG : HAND_SVG
      this.armLIcon.classList.toggle('mirror', !!a.left.name)
      // Q の案内の出し分けをやり直す
      this.hintKey = '\u0000'
      this.setHints(this.lastHints)
    }
    if (a.right.name !== this.rightPart || leftChanged) {
      this.rightPart = a.right.name
      this.updateEquipCard()
    }
    const busy = a.right.active || !!a.right.holding
    if (busy !== this.armsBusy) {
      this.armsBusy = busy
      this.applyMood()
    }
  }

  /** 一時停止の「装備」カード（見るだけ） */
  private updateEquipCard(): void {
    const slot = (side: 'left' | 'right', name: string | null) => {
      const s = el(this.pause, `.nx-menu-slot[data-side="${side}"]`)
      s.classList.toggle('empty', !name)
      el(s, '.nx-slot-part').textContent = name ?? '装備なし'
      el(s, '.nx-slot-icon').innerHTML = name ? CLAW_SVG : HAND_SVG
      el(s, '.nx-slot-icon').classList.toggle('mirror', side === 'left' && !!name)
    }
    slot('right', this.rightPart)
    slot('left', this.leftPart)
    el(this.pause, '.nx-menu-desc[data-desc="right"]').textContent = PART_DESC[this.rightPart] ?? ''
    const ld = el(this.pause, '.nx-menu-desc[data-desc="left"]')
    ld.textContent = this.leftPart ? (PART_DESC[this.leftPart] ?? '') : ''
    ld.hidden = !ld.textContent
  }

  /** Q／E を押したときに腕の枠を光らせる */
  pulseArm(side: 'left' | 'right'): void {
    this.retrigger(side === 'left' ? this.armL : this.armR, 'pulse')
  }

  // ================================================================ 水門パズル

  setGate(g: GateView | null): void {
    if (!g) {
      if (!this.gate.hidden) this.gate.hidden = true
      this.gateKey = ''
      return
    }
    const L = g.labels ?? GATE_LABELS_1726
    const people = `${L.title}|${L.worker}|${L.watcher}`
    if (this.gate.hidden || people !== this.gatePeople) {
      this.gate.hidden = false
      this.gatePeople = people
      ;(this.gate.querySelector('.nx-gate-title') as HTMLElement).textContent = L.title
      const faces = this.gate.querySelectorAll<HTMLElement>('.nx-gate-face')
      const whos = this.gate.querySelectorAll<HTMLElement>('.nx-gate-who')
      faces[0].dataset.who = L.worker
      faces[1].dataset.who = L.watcher
      whos[0].textContent = L.worker
      whos[1].textContent = L.watcher
      if (this.opts.speakerIcons) this.icons.preload([L.worker, L.watcher])
      this.refreshFaces()
      this.gateKey = ''
    }
    const pct = Math.round(Math.max(0, Math.min(1, g.progress)) * 100)
    const key = `${pct}|${g.signal}|${g.signalText}|${g.adjusting}`
    if (key === this.gateKey) return
    this.gateKey = key
    const lit = Math.round((pct / 100) * this.gateSegs.length)
    this.gateSegs.forEach((s, i) => s.classList.toggle('on', i < lit))
    this.gatePct.textContent = `${pct}%`
    this.gateWhat.textContent = g.progress >= 1 ? L.what[2] : g.adjusting ? L.what[1] : L.what[0]
    this.gate.classList.toggle('adjusting', g.adjusting && g.progress < 1)
    this.gate.classList.toggle('complete', g.progress >= 1)
    this.gateSignalText.textContent = g.signalText
    this.gateSignal.dataset.signal = g.signal
  }

  /** 大きな文字の演出（成功・失敗） */
  banner(text: string, kind: 'success' | 'fail', seconds = 2.6): void {
    this.bannerText.textContent = text
    this.bannerEl.dataset.kind = kind
    this.bannerEl.hidden = false
    this.retrigger(this.bannerEl, 'show')
    this.bannerTimer = seconds
    if (kind === 'fail') this.moodFor('worried', 1.8)
    else this.moodFor('happy', 2.5)
  }

  flash(kind: 'danger' | 'success'): void {
    this.flashEl.dataset.kind = kind
    this.retrigger(this.flashEl, 'show')
    if (kind === 'danger') this.moodFor('surprised', 1.2)
  }

  // ================================================================ 一時停止（装備・記録／操作一覧）

  /** 一時停止（Esc）。「装備・記録」と「操作一覧」の 2 つのタブ（← → で切り替え）。開いたときは「装備・記録」 */
  setPaused(on: boolean): void {
    if (on === this.pauseOn) return
    this.pauseOn = on
    this.syncPausePanel()
  }

  /** 装備・記録（Tab）。一時停止と同じパネルを「装備・記録」のタブで開く（見るだけ） */
  setMenu(on: boolean): void {
    if (on === this.menuOn) return
    this.menuOn = on
    this.syncPausePanel()
  }

  private syncPausePanel(): void {
    const show = this.pauseOn || this.menuOn
    this.root.classList.toggle('nx-panel-open', show)
    if (show && this.pause.hidden) {
      this.setPauseTab(PAUSE_DEFAULT_TAB)
      this.pause.hidden = false
      window.addEventListener('keydown', this.onPauseKey)
    } else if (!show && !this.pause.hidden) {
      this.pause.hidden = true
      window.removeEventListener('keydown', this.onPauseKey)
    }
    if (!show) return
    const mode = this.pauseOn ? 'pause' : 'menu'
    const key = `${mode}|${this.touch ? 1 : 0}`
    if (this.pause.dataset.mode === key) return
    this.pause.dataset.mode = key
    el<HTMLSpanElement>(this.pause, '.nx-panel-tag').textContent = mode === 'pause' ? 'PAUSE' : 'MENU'
    el<HTMLSpanElement>(this.pause, '.nx-panel-title').textContent = mode === 'pause' ? '一時停止' : '装備・記録'
    // スマホ：タブはタップで切り替え、ほかの所をタップすると戻る（touchInput.ts）
    el<HTMLSpanElement>(this.pause, '.nx-foot-tabs').innerHTML = this.touch ? '<span>上のタブをタップで切り替え</span>' : `${keycap('←')}${keycap('→')}<span>切り替え</span>`
    el<HTMLSpanElement>(this.pause, '.nx-foot-close').innerHTML = this.touch
      ? '<span>ほかの所をタップしてゲームに戻る</span>'
      : mode === 'pause'
        ? `${keycap('Esc')}<span>ゲームに戻る</span>`
        : `${keycap('Tab')}<span>閉じる</span>`
  }

  /**
   * スマホ：一時停止パネルのタブ・設定の選択肢の上をタップしたか（画面座標）。当たっていれば切り替えて true。
   * HUD は pointer-events を受けないので、タッチの層（touchInput.ts）から座標で聞く
   */
  tapPauseAt(x: number, y: number): boolean {
    if (this.pause.hidden) return false
    const hit = (e: HTMLElement) => {
      const r = e.getBoundingClientRect()
      // 指は大きいので、上下に少しゆとりを持たせる
      return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 8 && y <= r.bottom + 8
    }
    for (const t of this.pause.querySelectorAll<HTMLElement>('.nx-tab')) {
      if (hit(t)) {
        const tab = t.dataset.tab as PauseTab
        if (tab !== this.pauseTab) this.setPauseTab(tab)
        return true
      }
    }
    if (this.pauseTab === 'settings') {
      for (const o of this.pause.querySelectorAll<HTMLElement>('.nx-pane[data-pane="settings"] .nx-set-opt')) {
        if (!hit(o)) continue
        const row = o.dataset.row as SettingRow
        this.setRow = row
        const v = o.dataset.v ?? ''
        this.changeGraphics(
          row === 'quality' ? { ...this.graphics, quality: v as QualityLevel } : row === 'fps' ? { ...this.graphics, fps: Number(v) as FpsCap } : { ...this.graphics, music: Number(v) as MusicLevel },
        )
        return true
      }
      // 設定の枠の中（選択肢のすき間）をタップしても閉じない
      const pane = this.pause.querySelector<HTMLElement>('.nx-pane[data-pane="settings"] .nx-settings')
      if (pane && hit(pane)) return true
    }
    return false
  }

  /** 設定タブに、いまの画質・フレームレートを出す */
  setGraphicsPrefs(p: GraphicsPrefs): void {
    this.graphics = { ...p }
    this.renderSettings()
  }

  /** 左上の顔（小さな WebGL）を 1 秒に何回描くか */
  setPortraitFps(fps: number): void {
    this.opts.portraitFps = fps
    this.portrait?.setFps(fps)
  }

  private changeGraphics(p: GraphicsPrefs): void {
    const changed = p.quality !== this.graphics.quality || p.fps !== this.graphics.fps || p.music !== this.graphics.music
    this.graphics = { ...p }
    this.renderSettings()
    if (changed) this.onGraphicsChange?.({ ...p })
  }

  private renderSettings(): void {
    const pane = this.pause.querySelector<HTMLElement>('.nx-pane[data-pane="settings"]')
    if (!pane) return
    pane.querySelectorAll<HTMLElement>('.nx-set-opt').forEach((o) => {
      o.classList.toggle('on', o.dataset.v === settingValue(o.dataset.row as SettingRow, this.graphics))
    })
    pane.querySelectorAll<HTMLElement>('.nx-set-row').forEach((r) => r.classList.toggle('sel', !this.touch && r.dataset.row === this.setRow))
    el(pane, '.nx-set-desc[data-desc="quality"]').textContent = QUALITY_DESC[this.graphics.quality]
    el(pane, '.nx-set-desc[data-desc="fps"]').textContent = FPS_DESC[this.graphics.fps]
    el(pane, '.nx-set-desc[data-desc="music"]').textContent = MUSIC_DESC[this.graphics.music]
  }

  private setPauseTab(t: PauseTab): void {
    this.pauseTab = t
    this.pause.querySelectorAll<HTMLElement>('.nx-tab').forEach((e) => {
      const on = e.dataset.tab === t
      e.classList.toggle('on', on)
      e.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    this.pause.querySelectorAll<HTMLElement>('.nx-pane').forEach((e) => e.classList.toggle('on', e.dataset.pane === t))
    // 設定タブ（キーボード）：W/S・A/D の案内
    el(this.pause, '.nx-foot-set').hidden = this.touch || t !== 'settings'
    if (t === 'settings') this.renderSettings()
  }

  // ================================================================ スマホ（タッチ操作）

  /**
   * タッチ操作に合わせた表示にする：キー名を出さない（目的・台詞・照準・キー案内）、操作一覧をタッチ用に、
   * 右腕の輪をつかむボタンに（中に「つかむ」「離す」などを出す）、左腕の輪を左上へ小さく、
   * 会話ウィンドウを右腕の輪と重ならない幅に。
   */
  setTouchMode(on: boolean): void {
    this.touch = on
    this.root.classList.toggle('nx-touch', on)
    el(this.pause, '.nx-panel-sub').textContent = on ? '操作一覧（タッチ）' : '操作一覧（キーボード）'
    el(this.pause, '.nx-controls').innerHTML = controlRows(on ? TOUCH_CONTROL_LIST : CONTROL_LIST, on)
    el(this.pause, '.nx-panel-note').hidden = on
    // 一時停止パネルの下の案内（タッチ／キーボード）を作り直す
    delete this.pause.dataset.mode
    this.syncPausePanel()
    this.retLabelKey = ''
    this.hintKey = '\u0000'
    this.objKey = ''
    this.setObjective(this.objRaw[0], this.objRaw[1])
    this.layoutTouch()
    this.frames.rescale()
  }

  /** タッチで押せる HUD の部品（右腕の輪＝つかむ、左腕の輪＝左腕を選ぶ） */
  get touchTargets(): { rightArm: HTMLElement; leftArm: HTMLElement } {
    return { rightArm: el(this.armR, '.nx-arm-ringbox'), leftArm: el(this.armL, '.nx-arm-ringbox') }
  }

  /** タッチ：右腕の輪に出す言葉（照準・ワイヤーの状態で「つかむ」「飛びつく」「離す」など）と、照準が合っているか */
  setClawPrompt(label: string, ready: boolean): void {
    const key = `${label}|${ready ? 1 : 0}`
    if (key === this.clawPromptKey) return
    this.clawPromptKey = key
    const p = el<HTMLSpanElement>(this.armR, '.nx-arm-prompt')
    p.textContent = label
    p.hidden = false
    p.classList.toggle('long', [...label].length > 4)
    this.armR.classList.toggle('ready', ready)
  }

  /** タッチ：会話ウィンドウとキー案内を、左端から右腕の輪の手前までの帯に収める（収まらなければ縮める） */
  private layoutTouch(): void {
    if (!this.touch) return
    const w = window.innerWidth
    const h = window.innerHeight
    // HUD と同じく画面に比例した倍率（スマホでも配置の比率が同じ）
    const u = Math.min(w / 1600, h / 900)
    const left = 16 * u
    const right = 212 * u + 10 * u
    const band = Math.max(200 * u, w - left - right)
    const k = Math.min(1, band / (790 * u))
    this.root.style.setProperty('--nx-dlg-k', k.toFixed(3))
    this.root.style.setProperty('--nx-dlg-cx', `${((left + w - right) / 2).toFixed(0)}px`)
    this.root.style.setProperty('--nx-band-w', `${band.toFixed(0)}px`)
  }

  // ================================================================ 時空移動（時代カード）・IDO

  /** 到着した時代のカード（例：2026年／大阪・なんば） */
  showEraCard(year: string, place: string, sub = '', seconds = 3.4, tint = '#8fd8ff'): void {
    const m = /^(\d+)(.*)$/.exec(year.trim())
    el(this.eraCard, '.nx-ec-year').innerHTML = m ? `<b>${escapeHtml(m[1])}</b><span>${escapeHtml(m[2])}</span>` : escapeHtml(year)
    el(this.eraCard, '.nx-ec-place').textContent = place
    const subEl = el(this.eraCard, '.nx-ec-sub')
    subEl.textContent = sub
    subEl.hidden = !sub
    this.eraCard.style.setProperty('--ec-tint', tint)
    this.eraCard.hidden = false
    this.eraCard.classList.remove('out')
    this.retrigger(this.eraCard, 'show')
    // 実時間で数える（重い端末でフレームが落ちても、決まった秒数で消える）
    this.eraCardTimer = seconds
    this.eraCardEnd = performance.now() + seconds * 1000
  }

  /** IDO の歴史案内パネルを出す */
  showIdo(c: IdoPanelContent): void {
    el<HTMLSpanElement>(this.ido, '.nx-ido-title').textContent = c.title
    el(this.ido, '.nx-ido-sub').textContent = c.sub
    el(this.ido, '.nx-ido-body').textContent = c.body
    el(this.ido, '.nx-ido-foot').textContent = c.foot ?? ''
    const img = el(this.ido, '.nx-ido-image')
    img.innerHTML = ''
    if (c.image) img.appendChild(c.image)
    img.hidden = !c.image
    this.ido.hidden = false
    this.ido.classList.remove('out')
    this.setIdoGlitch(0)
    this.retrigger(this.ido, 'show')
  }

  /** パネルのゆがみ（鉱石が反応して、映像の向こうに本物の町が見え始める）0〜1 */
  setIdoGlitch(v: number): void {
    this.ido.style.setProperty('--glitch', v.toFixed(3))
    this.ido.classList.toggle('glitch', v > 0.01)
  }

  hideIdo(): void {
    if (this.ido.hidden) return
    this.ido.classList.add('out')
    setTimeout(() => {
      if (this.ido.classList.contains('out')) this.ido.hidden = true
    }, 350)
  }

  get idoVisible(): boolean {
    return !this.ido.hidden && !this.ido.classList.contains('out')
  }

  /** 毎フレーム：お知らせ・演出の時間切れ、表情の時間 */
  tick(dt: number): void {
    if (this.eraCardTimer > 0) {
      this.eraCardTimer = Math.max(0, (this.eraCardEnd - performance.now()) / 1000)
      if (this.eraCardTimer <= 0) {
        this.eraCard.classList.add('out')
        setTimeout(() => {
          if (this.eraCardTimer <= 0) this.eraCard.hidden = true
        }, 700)
      }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toastEl.hidden = true
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.bannerEl.hidden = true
    }
    if (this.moodTimed) {
      this.moodTimed.t -= dt
      if (this.moodTimed.t <= 0) {
        this.moodTimed = null
        this.applyMood()
      }
    }
  }

  // ================================================================ 開発用の統計（F3）

  toggleStats(force?: boolean): void {
    this.statsVisible = force ?? !this.statsVisible
    this.stats.style.display = this.statsVisible ? 'block' : 'none'
  }

  get statsOn(): boolean {
    return this.statsVisible
  }

  updateStats(s: HudStats): void {
    if (!this.statsVisible) return
    this.stats.innerHTML = `FPS <b>${s.fps.toFixed(0)}</b> (${s.ms.toFixed(1)} ms)<br>Draw calls <b>${s.calls}</b><br>Triangles ${(s.tris / 1000).toFixed(0)}k<br>Pixel ratio ${s.ratio.toFixed(2)} / ${s.quality}<br>Textures ${s.textures} / Programs ${s.programs}<br>HUD portrait ${this.portrait ? 'live' : 'svg'}`
  }

  // ================================================================ 片付け

  /** HUD を取り外す（ポートレートのレンダラも解放） */
  dispose(): void {
    clearTimeout(this.dlgTimer)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onPauseKey)
    this.ro?.disconnect()
    this.clearFaceMirror()
    this.portrait?.dispose()
    this.mini?.dispose()
    this.compass.dispose()
    this.frames.dispose()
    this.root.remove()
  }

  /** CSS のアニメーションをかけ直す */
  private retrigger(e: HTMLElement, cls: string): void {
    e.classList.remove(cls)
    void e.offsetWidth
    e.classList.add(cls)
  }
}

export class LoadingOverlayFuture {
  private readonly el: HTMLDivElement
  private readonly bar: HTMLDivElement
  private readonly msg: HTMLDivElement
  private readonly pct: HTMLDivElement
  private theme: HudTheme | null = null
  /** setTheme が呼ばれたら、時代の文からの自動の切り替えはしない */
  private themeFixed = false
  private readonly onResize = () => applyScaleTo(this.el)

  constructor(ui: HTMLElement) {
    ensureFonts()
    this.el = document.createElement('div')
    this.el.className = 'nx-loading'
    this.el.innerHTML = `
      <div class="nx-ld-grid"></div>
      <div class="nx-ld-pat"></div>
      <div class="nx-ld-corner tl"></div><div class="nx-ld-corner tr"></div><div class="nx-ld-corner bl"></div><div class="nx-ld-corner br"></div>
      <div class="nx-ld-box">
        <div class="nx-ld-ring"><i class="nx-ld-orbit"></i>${CRYSTAL_SVG}</div>
        <div class="nx-ld-title">NEXMAX CHRONICLE</div>
        <div class="nx-ld-sub">― はじまりの未来 ―</div>
        <div class="nx-ld-era">1726年　大坂・仕掛け横丁</div>
        <div class="nx-ld-bar"><div class="nx-ld-fill"></div><div class="nx-ld-seg"></div></div>
        <div class="nx-ld-row"><div class="nx-ld-msg">準備中…</div><div class="nx-ld-pct">0%</div></div>
      </div>`
    this.setTheme(DEFAULT_THEME)
    this.themeFixed = false
    ui.appendChild(this.el)
    applyScaleTo(this.el)
    window.addEventListener('resize', this.onResize)
    this.bar = this.el.querySelector('.nx-ld-fill') as HTMLDivElement
    this.msg = this.el.querySelector('.nx-ld-msg') as HTMLDivElement
    this.pct = this.el.querySelector('.nx-ld-pct') as HTMLDivElement
  }

  /** 時代ごとの見た目（HudFuture.setTheme と同じ）。呼ばれなければ setEra の年から決める（既定 2086） */
  setTheme(key: HudTheme | string): void {
    this.themeFixed = true
    this.applyTheme(normalizeTheme(key))
  }

  private applyTheme(t: HudTheme): void {
    if (t === this.theme) return
    this.theme = t
    applyThemeTo(this.el, t)
  }

  /** 読み込む時代の表示（例「2026年　大阪・なんば」）。年が入っていればその時代の見た目にする */
  setEra(text: string): void {
    ;(this.el.querySelector('.nx-ld-era') as HTMLDivElement).textContent = text
    const t = themeFromText(text)
    if (t && !this.themeFixed) this.applyTheme(t)
  }

  set(progress: number, msg: string): void {
    const p = Math.max(0, Math.min(1, progress))
    this.bar.style.transform = `scaleX(${p.toFixed(3)})`
    this.pct.textContent = `${Math.round(p * 100)}%`
    this.msg.textContent = msg
  }

  hide(): void {
    this.el.classList.add('done')
    window.removeEventListener('resize', this.onResize)
    setTimeout(() => this.el.remove(), 700)
  }
}

/** 差し替え用の別名（import { Hud, LoadingOverlay } from './future/hudFuture' と書ける） */
export { HudFuture as Hud, LoadingOverlayFuture as LoadingOverlay }
