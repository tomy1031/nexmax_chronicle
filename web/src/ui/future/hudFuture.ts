// 近未来ホログラム HUD（コンセプト B ＋ A の話者の顔）。ui/hud.ts の Hud と同じ公開 API で差し替えられる。
// ネクマックスの体内の時空鉱石の水色の光をテーマに、半透明のガラス・光る細い線・角を落としたパネル。
// ・左上：本物の 3D モデルのポートレート（portrait.ts）、体力 5、鉱石エネルギー、時代と場所
// ・上中央：コンパス（setCompass）　・右上：目的　・中央：照準（対象の種類ごとの形と色）
// ・左下：左腕（Q・装備なし）　・右下：右腕（J・つかむNMClaw・つかんでいる物）
// ・下中央：会話ウィンドウ（話者の顔つき・2 行・▷）、必要なときだけのキー案内
// ・お知らせ・大きな文字・画面のふち光り・水門パズル・時代カード・IDO・一時停止・装備と記録・読み込み
// 表示はキーボードの表記だけ（マウス・コントローラーの絵や文字は出さない）。
// スマホ（setTouchMode）ではキー名を出さず、右腕の輪をつかむボタンにして、文言・操作一覧をタッチ用にする。
// 毎フレーム呼ばれる set* は、値が変わったときだけ DOM を触る（位置は transform で動かす）。
import './hudFuture.css'
import { CompassBar, headingFromCameraYaw } from './compass'
import { DialogueBoard, breakLines, textSizeStep } from './dialogueBoard'
import { FrameManager, frameDefs } from './frame'
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
} from './icons'
import { MiniRenderer } from './miniRenderer'
import { LivePortrait } from './portrait'
import { SpeakerIconCache, speakerStyle } from './speakerIcons'
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

export type HudFutureOptions = {
  /** 左上に本物の 3D モデルのポートレートを出す（既定 true。false なら SVG の顔） */
  livePortrait?: boolean
  /** 会話の話者アイコンを GLB から作る（既定 true） */
  speakerIcons?: boolean
  /** ポートレートの描画回数（1 秒あたり、既定 20） */
  portraitFps?: number
  /** ひとつ前の台詞を小さく残す最長の秒数（既定 3.2） */
  ghostSeconds?: number
}

const HP_MAX = 5

const el = <T extends Element = HTMLDivElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** 「J」「Space」「↑↓←→」などのキーを、キーの形のしるしに */
function keycap(key: string): string {
  const k = key.trim()
  const wide = [...k].length > 1 ? ' wide' : ''
  return `<span class="nx-key${wide}">${escapeHtml(k)}</span>`
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

/** Google Fonts の Orbitron（数字・英字の見出し用）を 1 回だけ読み込む。日本語は M PLUS Rounded 1c */
function ensureFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('nx-hud-fonts')) return
  const link = document.createElement('link')
  link.id = 'nx-hud-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap'
  document.head.appendChild(link)
}

/** ネクマックスの顔（3D が使えないときの代わり・読み込み中） */
const NEXMAX_FACE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="nx-fb-h" cx="0.4" cy="0.32" r="0.75"><stop offset="0" stop-color="#9ad0ff"/><stop offset="1" stop-color="#4c9ae6"/></radialGradient></defs><ellipse cx="11" cy="54" rx="6" ry="10" fill="#5ea8ee"/><ellipse cx="89" cy="54" rx="6" ry="10" fill="#5ea8ee"/><ellipse cx="50" cy="50" rx="40" ry="37" fill="url(#nx-fb-h)" stroke="#16223a" stroke-width="1.6"/><path d="M50 30 C44 26 34 24 26 28 C19 32 17 42 18 54 C19 68 31 77 50 77 C69 77 81 68 82 54 C83 42 81 32 74 28 C66 24 56 26 50 30 Z" fill="#f6f6f4" stroke="#4f6f98" stroke-width="1"/><path d="M30 35 Q35 31 40 34 M60 34 Q65 31 70 35" stroke="#202228" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="38" cy="47" rx="5" ry="6.4" fill="#141416"/><ellipse cx="62" cy="47" rx="5" ry="6.4" fill="#141416"/><path d="M44 58 Q50 66 56 58 Z" fill="#fb7a52" stroke="#3a1c16" stroke-width="1.2" stroke-linejoin="round"/></svg>`

/** 左上のポートレートの枠（八角形＋光る輪） */
const PORTRAIT_FRAME_SVG = `<svg class="nx-pf-frame" viewBox="0 0 160 160" aria-hidden="true">
  <path class="pf-plate" d="M53 7 H107 L153 53 V107 L107 153 H53 L7 107 V53 Z"/>
  <path class="pf-scan" d="M53 7 H107 L153 53 V107 L107 153 H53 L7 107 V53 Z"/>
  <g filter="url(#nxf-glow)">
    <path class="pf-line" d="M53 7 H107 L153 53 V107 L107 153 H53 L7 107 V53 Z"/>
    <path class="pf-acc" d="M7 70 V53 L53 7 H74 M153 90 V107 L107 153 H86"/>
    <circle class="pf-ring" cx="80" cy="80" r="57"/>
  </g>
  <path class="pf-outer" d="M38 3 H50 M110 3 H122 L157 38 V56 M157 104 V122 M3 104 V122 L38 157 H56"/>
  <path class="pf-ticks" d="M80 15 V20 M80 140 V145 M15 80 H20 M140 80 H145 M34 34 L37.5 37.5 M126 34 L122.5 37.5 M34 126 L37.5 122.5 M126 126 L122.5 122.5"/>
</svg>`

/** ポートレートの周りでゆっくり回る点線の輪 */
const PORTRAIT_SPIN_SVG = `<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 6 18 6 2 30" opacity="0.8"/></svg>`

/** 腕の枠の輪（左：控えめ、右：明るい） */
function armRingSvg(side: 'left' | 'right'): string {
  const R = side === 'right' ? 70 : 66
  return `<svg class="nx-arm-svg" viewBox="0 0 180 180" aria-hidden="true">
    <circle class="arm-disk" cx="90" cy="90" r="${R - 12}"/>
    <circle class="arm-scan" cx="90" cy="90" r="${R - 12}"/>
    <circle class="arm-inner" cx="90" cy="90" r="${R - 19}"/>
    <g filter="url(#nxf-glow)">
      <circle class="arm-ring" cx="90" cy="90" r="${R - 12}"/>
      <path class="arm-arc" d="${arc(90, 90, R, 196, 262)}"/>
      <path class="arm-arc thin" d="${arc(90, 90, R, 278, 330)}"/>
      <path class="arm-arc" d="${arc(90, 90, R, 16, 58)}"/>
      <path class="arm-arc thin" d="${arc(90, 90, R, 100, 150)}"/>
    </g>
    <path class="arm-outer" d="${arc(90, 90, R + 9, 200, 250)} ${arc(90, 90, R + 9, 290, 312)} ${arc(90, 90, R + 9, 30, 70)}"/>
  </svg>`
}

/** 円弧の path（角度は度、12 時が 0、時計回り） */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180
    return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`
  }
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0
  return `M${p(a0)}A${r} ${r} 0 ${large} 1 ${p(a1)}`
}

export class HudFuture {
  private readonly root: HTMLDivElement
  private readonly frames = new FrameManager()
  private readonly compass: CompassBar
  private readonly board = new DialogueBoard()
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
  private readonly menu: HTMLDivElement
  private readonly eraCard: HTMLDivElement
  private readonly ido: HTMLDivElement
  private readonly shotLabel: HTMLDivElement
  private readonly stats: HTMLDivElement
  // 状態
  private statsVisible = false
  private hintKey = ''
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
  private armKey = ''
  private gateKey = ''
  private hp = HP_MAX
  private energyV: number | null = null
  private objKey = ''
  private dlgVersion = -1
  private dlgTimer = 0
  private faceSig = ''
  private faceMirror: CanvasRenderingContext2D | null = null
  private nextHintKey: string | null = null
  private compassOn = false
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
  private readonly onResize = () => {
    this.frames.rescale()
    this.layoutTouch()
  }

  constructor(ui: HTMLElement, options: HudFutureOptions = {}) {
    this.opts = { livePortrait: options.livePortrait ?? true, speakerIcons: options.speakerIcons ?? true, portraitFps: options.portraitFps ?? 20, ghostSeconds: options.ghostSeconds ?? 3.2 }
    this.board.ghostMax = this.opts.ghostSeconds
    ensureFonts()
    this.root = document.createElement('div')
    this.root.className = 'nx-hud'
    this.root.innerHTML = `
      <div class="nx-status">
        <div class="nx-bars">
          <div class="nx-hp"><div class="nx-frame-host" data-frame="bar"></div><div class="nx-hearts" aria-label="体力">${`<span class="nx-heart">${HEART_SVG}</span>`.repeat(HP_MAX)}</div></div>
          <div class="nx-energy"><div class="nx-frame-host" data-frame="bar"></div><span class="nx-crystal">${CRYSTAL_SVG}</span><div class="nx-gauge"><div class="nx-gauge-fill"></div><div class="nx-gauge-seg"></div></div></div>
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
        <div class="nx-obj-text"><div class="nx-obj-title"></div><div class="nx-obj-sub"></div></div>
      </div>
      <div class="nx-gate" hidden>
        <div class="nx-frame-host" data-frame="panel"></div>
        <div class="nx-gate-head"><span class="nx-gate-gear">${GEAR_SVG}</span><span>水門の仕掛け</span></div>
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
          <div class="nx-dlg-face"><div class="nx-face-img"></div></div>
          <div class="nx-dlg-text"></div>
          <div class="nx-dlg-next"><span class="nx-dlg-nextkey" hidden></span><span class="nx-dlg-arrow">${NEXT_SVG}</span></div>
        </div>
        <div class="nx-dlg-name"><div class="nx-frame-host" data-frame="plate"></div><span></span></div>
      </div>
      <div class="nx-hints"></div>
      <div class="nx-arm nx-arm-left">
        <div class="nx-arm-ringbox">${armRingSvg('left')}<div class="nx-arm-icon">${HAND_SVG}</div>${keycap('Q')}</div>
        <div class="nx-arm-plate"><div class="nx-frame-host" data-frame="plateSmall"></div><span class="nx-arm-name">装備なし</span></div>
      </div>
      <div class="nx-arm nx-arm-right">
        <div class="nx-arm-hold" hidden><span class="nx-hold-dot"></span><span class="nx-hold-text"></span></div>
        <div class="nx-arm-ringbox">${armRingSvg('right')}<div class="nx-arm-spin"></div><div class="nx-arm-icon">${CLAW_SVG}</div>${keycap('J')}<span class="nx-arm-prompt" hidden></span></div>
        <div class="nx-arm-plate"><div class="nx-frame-host" data-frame="plate"></div><span class="nx-arm-name">つかむNMClaw</span></div>
      </div>
      <div class="nx-modal nx-pause" hidden>
        <div class="nx-panel">
          <div class="nx-frame-host" data-frame="panel"></div>
          <div class="nx-panel-head"><span class="nx-panel-tag">PAUSE</span><span class="nx-panel-title">一時停止</span></div>
          <div class="nx-panel-sub">操作一覧（キーボード）</div>
          <div class="nx-controls">${controlRows(CONTROL_LIST, false)}</div>
          <div class="nx-panel-note">キー設定は今後のバージョンで対応します</div>
          <div class="nx-panel-foot">${keycap('Esc')}<span>ゲームに戻る</span></div>
        </div>
      </div>
      <div class="nx-modal nx-menu" hidden>
        <div class="nx-panel wide">
          <div class="nx-frame-host" data-frame="panel"></div>
          <div class="nx-panel-head"><span class="nx-panel-tag">MENU</span><span class="nx-panel-title">装備・記録</span></div>
          <div class="nx-menu-grid">
            <div class="nx-menu-card">
              <div class="nx-frame-host" data-frame="card"></div>
              <div class="nx-menu-head">装備</div>
              <div class="nx-menu-slot"><span class="nx-slot-icon">${CLAW_SVG}</span><span class="nx-slot-side">右腕</span><span class="nx-slot-part">つかむNMClaw</span></div>
              <div class="nx-menu-desc">ワイヤーを射出して対象をつかむ。射程 約10m。軽い物は手元へ、固定された金具へは自分が移動、仕掛けはその場で保持。</div>
              <div class="nx-menu-slot empty"><span class="nx-slot-icon">${HAND_SVG}</span><span class="nx-slot-side">左腕</span><span class="nx-slot-part">装備なし</span></div>
              <div class="nx-menu-desc">装備の交換は異次元拠点の装備台で行えます。</div>
            </div>
            <div class="nx-menu-card">
              <div class="nx-frame-host" data-frame="card"></div>
              <div class="nx-menu-head">記録</div>
              <div class="nx-menu-desc">IDO で見た記録：まだありません。</div>
              <div class="nx-menu-desc">収納：0 / 8</div>
            </div>
          </div>
          <div class="nx-panel-foot">${keycap('Tab')}<span>閉じる</span></div>
        </div>
      </div>
      <div class="nx-eracard" hidden>
        <div class="nx-ec-glow"></div>
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
    this.root.prepend(frameDefs())
    ui.appendChild(this.root)
    const r = this.root
    // コンパス（上中央）
    this.compass = new CompassBar()
    this.compass.el.hidden = true
    r.insertBefore(this.compass.el, el(r, '.nx-objective'))
    // 左上
    this.pfBox = el(r, '.nx-portrait')
    this.pfCanvas = el(r, '.nx-pf-canvas')
    this.hearts = Array.from(r.querySelectorAll<HTMLSpanElement>('.nx-heart'))
    this.hpBox = el(r, '.nx-hp')
    this.energy = el(r, '.nx-energy')
    this.energyFill = el(r, '.nx-gauge-fill')
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
    this.menu = el(r, '.nx-menu')
    this.eraCard = el(r, '.nx-eracard')
    this.ido = el(r, '.nx-ido')
    this.shotLabel = el(r, '.nx-shot')
    this.stats = el(r, '.nx-stats')

    this.frames.attachAll(r)
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
    // 水門パネル
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

  /** プレイヤーのポーズ（保持・引き寄せ＝必死、落下＝驚き） */
  setPlayerPose(p: PlayerPoseHint | string | null): void {
    const m: PortraitExpression | null = p === 'hold' || p === 'pulled' || p === 'swing' || p === 'crank' ? 'determined' : p === 'fall' ? 'surprised' : null
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
    if (this.armsBusy) return 'determined'
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
    const size = Math.round(Math.max(64, Math.min(280, s.r * 2.3 + 24)))
    if (size !== this.retSize) {
      this.retSize = size
      const half = size / 2
      const bh = `${size}px`
      this.retBrkL.style.height = bh
      this.retBrkR.style.height = bh
      this.retBrkL.style.transform = `translate3d(${(-half).toFixed(0)}px, ${(-half).toFixed(0)}px, 0)`
      this.retBrkR.style.transform = `translate3d(${(half - this.bracketWidth()).toFixed(0)}px, ${(-half).toFixed(0)}px, 0) scaleX(-1)`
      this.retArrow.style.transform = `translate3d(-50%, ${(half * 0.55 + 6).toFixed(0)}px, 0)`
      this.retLabel.style.transform = `translate3d(-50%, ${(half + 10).toFixed(0)}px, 0)`
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
    if (!this.bracketW) this.bracketW = this.retBrkL.offsetWidth || 16
    return this.bracketW
  }

  // ================================================================ 画面下：キー案内・お知らせ

  /** 必要なときだけのキー案内。同じ内容なら DOM を触らない */
  setHints(list: Hint[]): void {
    const key = list.map((h) => `${h.key}:${h.label}`).join('|')
    if (key === this.hintKey) return
    this.hintKey = key
    // 「F：次へ」は会話ウィンドウの ▷ の横に出す
    const next = list.find((h) => h.label === '次へ') ?? null
    this.nextHintKey = next ? next.key : null
    this.updateNextMark()
    const rest = list.filter((h) => h !== next)
    if (this.touch) {
      // タッチ：key は指の動きの名前（「スティック」など）。小さな札を 1 列
      this.hints.classList.add('row')
      this.hints.innerHTML = rest.map((h) => `<span class="nx-chip small">${touchTag(h.key)}<span class="nx-chip-label">${escapeHtml(h.label)}</span></span>`).join('')
      return
    }
    const row = rest.length >= 4
    this.hints.classList.toggle('row', row)
    this.hints.innerHTML = rest
      .map((h, i) => (row ? `<span class="nx-chip small">${keycap(h.key)}<span class="nx-chip-label">${escapeHtml(h.label)}</span></span>` : `<span class="nx-chip${i === 0 ? ' primary' : ''}">${keycap(h.key)}<span class="nx-chip-de">で</span><span class="nx-chip-label">${escapeHtml(h.label)}</span></span>`))
      .join('')
  }

  /** 短いお知らせ（「左腕：装備なし」など） */
  toast(text: string, seconds = 2.2): void {
    this.toastText.textContent = text
    this.toastEl.hidden = false
    this.retrigger(this.toastEl, 'show')
    this.toastTimer = seconds
  }

  // ================================================================ 会話

  /** 台詞（話者名＋一言）。新しい台詞をウィンドウに、ひとつ前の台詞は上に小さく残す */
  say(speaker: string, text: string, seconds = 3.8): void {
    if (this.touch) text = toTouchText(text)
    const now = performance.now() / 1000
    const r = this.board.say(speaker, text, seconds, now)
    if (r === 'new') this.renderDialog()
    this.scheduleDialogCheck()
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
    this.armL.classList.toggle('selected', a.left.selected)
    this.armL.classList.toggle('empty', a.left.name === null)
    this.armLName.textContent = a.left.name ?? '装備なし'
    const busy = a.right.active || !!a.right.holding
    if (busy !== this.armsBusy) {
      this.armsBusy = busy
      this.applyMood()
    }
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
    if (this.gate.hidden) {
      this.gate.hidden = false
      if (this.opts.speakerIcons) this.icons.preload(['源兵衛', 'おはる'])
      this.refreshFaces()
    }
    const pct = Math.round(Math.max(0, Math.min(1, g.progress)) * 100)
    const key = `${pct}|${g.signal}|${g.signalText}|${g.adjusting}`
    if (key === this.gateKey) return
    this.gateKey = key
    const lit = Math.round((pct / 100) * this.gateSegs.length)
    this.gateSegs.forEach((s, i) => s.classList.toggle('on', i < lit))
    this.gatePct.textContent = `${pct}%`
    this.gateWhat.textContent = g.progress >= 1 ? '歯止め 完了' : g.adjusting ? '歯止めを調整中' : '歯止め'
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

  // ================================================================ 一時停止・メニュー

  setPaused(on: boolean): void {
    this.pause.hidden = !on
    this.root.classList.toggle('nx-panel-open', !this.pause.hidden || !this.menu.hidden)
  }

  setMenu(on: boolean): void {
    this.menu.hidden = !on
    this.root.classList.toggle('nx-panel-open', !this.pause.hidden || !this.menu.hidden)
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
    el(this.pause, '.nx-panel-foot').innerHTML = on ? '<span>画面をタップしてゲームに戻る</span>' : `${keycap('Esc')}<span>ゲームに戻る</span>`
    el(this.menu, '.nx-panel-foot').innerHTML = on ? '<span>画面をタップして閉じる</span>' : `${keycap('Tab')}<span>閉じる</span>`
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
    const u = Math.min(1.2, Math.max(0.7, Math.min(w * 0.000625, h * 0.001111)))
    const left = 16
    const right = 212 * u + 10
    const band = Math.max(200, w - left - right)
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
    this.eraCardTimer = seconds
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
      this.eraCardTimer -= dt
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

  constructor(ui: HTMLElement) {
    ensureFonts()
    this.el = document.createElement('div')
    this.el.className = 'nx-loading'
    this.el.innerHTML = `
      <div class="nx-ld-grid"></div>
      <div class="nx-ld-box">
        <div class="nx-ld-ring">${CRYSTAL_SVG}</div>
        <div class="nx-ld-title">NEXMAX CHRONICLE</div>
        <div class="nx-ld-sub">― はじまりの未来 ―</div>
        <div class="nx-ld-era">1726年　大坂・仕掛け横丁</div>
        <div class="nx-ld-bar"><div class="nx-ld-fill"></div><div class="nx-ld-seg"></div></div>
        <div class="nx-ld-row"><div class="nx-ld-msg">準備中…</div><div class="nx-ld-pct">0%</div></div>
      </div>`
    ui.appendChild(this.el)
    this.bar = this.el.querySelector('.nx-ld-fill') as HTMLDivElement
    this.msg = this.el.querySelector('.nx-ld-msg') as HTMLDivElement
    this.pct = this.el.querySelector('.nx-ld-pct') as HTMLDivElement
  }

  /** 読み込む時代の表示（例「2026年　大阪・なんば」） */
  setEra(text: string): void {
    ;(this.el.querySelector('.nx-ld-era') as HTMLDivElement).textContent = text
  }

  set(progress: number, msg: string): void {
    const p = Math.max(0, Math.min(1, progress))
    this.bar.style.transform = `scaleX(${p.toFixed(3)})`
    this.pct.textContent = `${Math.round(p * 100)}%`
    this.msg.textContent = msg
  }

  hide(): void {
    this.el.classList.add('done')
    setTimeout(() => this.el.remove(), 700)
  }
}

/** 差し替え用の別名（import { Hud, LoadingOverlay } from './future/hudFuture' と書ける） */
export { HudFuture as Hud, LoadingOverlayFuture as LoadingOverlay }
