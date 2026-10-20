// 近未来 HUD のプレビュー（hud-preview.html）。ゲームの画面写真の上に HUD を重ね、状態を切り替えて確かめる。
// クエリ（組み合わせ可）：
//   bg=1726|2026|none     背景（public/dev/hud-bg*.png）
//   ui=0                  右の切り替えパネルを隠す（スクリーンショット用）
//   spk=源兵衛|おはる|マツイ社長|佐伯|ソラ|ネクマックス|システム|ルート   その話者の台詞を出す（spk=none で会話なし）
//   claw=light|anchor|mechanism|far|connected|multi|none   照準
//   hold=1                右腕が大歯車を支えている
//   gate=wait|go|done|watch   水門パズルのパネル
//   hp=0..5  energy=0..1|none  expr=happy|determined|worried|surprised
//   hints=start|ctx|talk|none   キー案内（開始直後の一覧／状況に応じた案内／会話中の F 次へ）
//   heading=度  dist=m  bearing=度   コンパス（heading=none で隠す）、spin=1 で回す
//   era=1  pause=1  menu=1  toast=1  banner=success|fail  flash=danger|success  ido=1|glitch  loading=1  ghost=1
//   theme=1726|2026|2086   時代ごとの見た目（既定は背景に合わせる：bg=1726 → 1726、bg=2026 → 2026、bg=none → 2086）
//   left=1                 左腕に装備あり（左下の Q の枠が出る。既定は装備なしで出ない）
//   tab=controls           一時停止パネルを「操作一覧」のタブで開く（pause=1 と一緒に）
import { HudFuture, LoadingOverlayFuture, type HudTheme, type ReticleCategory } from './hudFuture'
import { CLAW_SVG, CRYSTAL_SVG, DIAMOND_SVG, HAND_SVG, RETICLE_SVG } from './icons'
import { MiniRenderer } from './miniRenderer'
import { SpeakerIconCache } from './speakerIcons'

const q = new URLSearchParams(location.search)
const ui = document.getElementById('ui') as HTMLDivElement
const bg = document.getElementById('bg') as HTMLImageElement
const panel = document.getElementById('pv-panel') as HTMLDivElement

const bgKey = q.get('bg') ?? '1726'
if (bgKey === 'none') bg.remove()
else bg.src = bgKey === '2026' ? './dev/hud-bg-2026.png' : './dev/hud-bg.png'
if (q.get('ui') === '0') panel.remove()

if (q.get('sheet') === 'icons') void iconSheet()
if (q.get('sheet') === 'svg') {
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:20px;top:20px;z-index:60;display:flex;gap:24px;background:#0a2550;padding:20px;color:#69eeff'
  for (const svg of [CLAW_SVG, HAND_SVG, CRYSTAL_SVG, DIAMOND_SVG, RETICLE_SVG.light, RETICLE_SVG.anchor, RETICLE_SVG.mechanism]) {
    const d = document.createElement('div')
    d.style.cssText = 'width:160px;height:160px'
    d.innerHTML = svg.replace('<svg ', '<svg width="160" height="160" ')
    box.appendChild(d)
  }
  document.body.appendChild(box)
}

/** 話者アイコンの一覧（切り出しの調整用）：?sheet=icons */
async function iconSheet(): Promise<void> {
  const mini = MiniRenderer.create(256)
  if (!mini) return
  const cache = new SpeakerIconCache(mini)
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:20px;top:20px;z-index:60;display:flex;gap:16px;flex-wrap:wrap;background:rgba(0,10,30,.8);padding:16px;font:700 14px system-ui;color:#fff'
  document.body.appendChild(box)
  cache.onReady((src, url) => {
    const fig = document.createElement('div')
    fig.innerHTML = `<img src="${url}" style="width:256px;height:256px;display:block;background:radial-gradient(circle at 50% 34%, #6ab4f2, #2766b6 55%, #0b2d66);border-radius:50%"><div style="text-align:center">${src}</div>`
    box.appendChild(fig)
  })
  for (const n of ['源兵衛', 'おはる', 'マツイ社長', '佐伯', 'ソラ']) cache.preload([n])
}

const hud = new HudFuture(ui, q.get('ghost') === '1' ? { ghostSeconds: 600 } : {})
;(window as unknown as { __hud: HudFuture }).__hud = hud

const ERA_TEXT: Record<HudTheme, string> = { '1726': '1726年　大坂・仕掛け横丁', '1970': '1970年　千里丘陵・万国博覧会', '2026': '2026年　大阪・なんば', '2086': '2086年　ナンバタウン' }
const themeKey = (q.get('theme') ?? (bgKey === '2026' ? '2026' : bgKey === 'none' ? '2086' : '1726')) as HudTheme
function theme(t: HudTheme): void {
  hud.setTheme(t)
  hud.setEra(ERA_TEXT[t])
}

// ---------------------------------------------------------------- 既定（コンセプト B の場面）

const LINES: Record<string, string> = {
  源兵衛: 'つかむだけやあかん。人が通る道は、ちゃんと残さんとな。',
  おはる: 'うちは見張り台から水路を見とくね！ 舟が来たら教えるから！',
  マツイ社長: 'ようこそ NEXTMAKE へ。ここは未来を試作する場所なんや。',
  佐伯: 'センサーの値は正常。ネクマックス、ゆっくり右へ。',
  ソラ: 'ネクマックス、展示の準備を手伝ってくれる？',
  ネクマックス: 'まかせて！ この腕なら、きっと届くよ。',
  システム: '時空鉱石が反応しています。',
  ルート: 'この先は工事中です。',
}

let heading = Number(q.get('heading') ?? 0)
const bearing = Number(q.get('bearing') ?? 6)
const dist = Number(q.get('dist') ?? 32)
const player = { x: 0, z: 0 }
const target = () => {
  const b = (bearing * Math.PI) / 180
  return { x: Math.sin(b) * dist, z: -Math.cos(b) * dist }
}
const compassOn = q.get('heading') !== 'none'

theme(themeKey)
hud.setObjective('大歯車を支えて、水門を直そう', '桟橋から照準を歯車へ向けて J でつかむ')
hud.setHp(Number(q.get('hp') ?? 5))
const en = q.get('energy') ?? '0.82'
hud.setEnergy(en === 'none' ? null : Number(en))
let leftPart: string | null = q.get('left') === '1' ? 'つかむNMClaw' : null
hud.setArms({ right: { name: 'つかむNMClaw', holding: null, selected: true, active: false }, left: { name: leftPart, selected: false } })
hud.preloadSpeakers(['源兵衛', 'おはる'])

function setCompass(): void {
  if (!compassOn) {
    hud.setCompassHeading(null)
    return
  }
  hud.setCompassHeading(heading, target(), player)
}
setCompass()

// ---------------------------------------------------------------- 照準

function reticle(kind: string): void {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  if (kind === 'none') {
    hud.setReticle({ mode: 'idle' })
    return
  }
  const cat: ReticleCategory = kind === 'anchor' ? 'anchor' : kind === 'light' ? 'light' : 'mechanism'
  const labels: Record<ReticleCategory, string> = { light: '木箱', anchor: '屋根の金具', mechanism: '大歯車', enemy: '欠け虫', chrono: '回る歯車' }
  hud.setReticle({
    mode: kind === 'far' ? 'far' : 'target',
    x: cx + (kind === 'far' ? 120 : 8),
    y: cy - (kind === 'far' ? 60 : 30),
    r: kind === 'anchor' ? 18 : kind === 'light' ? 26 : 34,
    category: cat,
    label: labels[cat],
    candidates: kind === 'multi' ? 2 : 1,
    locked: false,
    connected: kind === 'connected',
  })
}
reticle(q.get('claw') ?? 'mechanism')

// ---------------------------------------------------------------- 会話・案内

function speak(name: string): void {
  if (name === 'none') return
  hud.say(name, LINES[name] ?? '……', 600)
}
const spk = q.get('spk') ?? '源兵衛'
if (q.get('ghost') === '1') {
  hud.say('おはる', LINES['おはる'], 600)
}
speak(spk)

const HINTS: Record<string, Array<{ key: string; label: string }>> = {
  start: [
    { key: 'WASD', label: '移動' },
    { key: '↑↓←→', label: 'カメラ' },
    { key: 'Space', label: 'ジャンプ' },
    { key: 'Shift', label: 'ダッシュ' },
    { key: 'J', label: 'つかむ' },
    { key: 'Esc', label: '操作一覧' },
  ],
  ctx: [{ key: 'J', label: 'つかむNMClaw' }],
  ctx2: [
    { key: 'J', label: 'つかむ' },
    { key: 'R', label: '対象を切替' },
  ],
  talk: [{ key: 'F', label: '次へ' }],
  hold: [
    { key: 'J', label: '離す' },
    { key: '↑↓←→', label: 'カメラ' },
  ],
  none: [],
}
hud.setHints(HINTS[q.get('hints') ?? 'ctx'] ?? [])

// ---------------------------------------------------------------- その他の状態

function hold(on: boolean): void {
  hud.setArms({ right: { name: 'つかむNMClaw', holding: on ? '支えている：大歯車' : null, selected: true, active: on }, left: { name: leftPart, selected: false } })
  if (on) {
    reticle('connected')
    hud.setObjective('歯車を動かないように支えよう', '源兵衛が水門を調整中')
  }
}
if (q.get('hold') === '1') hold(true)

function gate(sig: string): void {
  const text: Record<string, string> = { watch: '見張り中', wait: '待って！ 舟が来る', go: '今や！ 離して', done: '修理完了' }
  hud.setGate({ progress: sig === 'done' ? 1 : sig === 'go' ? 1 : 0.7, signal: sig as 'watch' | 'wait' | 'go' | 'done', signalText: text[sig] ?? sig, adjusting: sig === 'watch' })
}
if (q.get('gate')) gate(q.get('gate') as string)
if (q.get('expr')) hud.setPortraitExpression(q.get('expr') as 'happy')
const ERA_CARD: Record<HudTheme, [string, string, string, string]> = {
  '1726': ['1726年', '大坂・仕掛け横丁', 'からくり職人の町', '#ffd27a'],
  '1970': ['1970年', '千里丘陵・万国博覧会', '人類の明日が並んだ夏', '#ffb066'],
  '2026': ['2026年', '大阪・なんば', 'ネクマックスが生まれた時代', '#8fd8ff'],
  '2086': ['2086年', 'ナンバタウン', '時代博覧祭', '#9fe8ff'],
}
function eraCard(t: HudTheme, seconds = 3.4): void {
  const [y, p, sub, tint] = ERA_CARD[t]
  hud.showEraCard(y, p, sub, seconds, tint)
}
if (q.get('era') === '1') eraCard(themeKey, 600)
if (q.get('pause') === '1') {
  hud.setPaused(true)
  if (q.get('tab') === 'controls') window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }))
}
if (q.get('menu') === '1') hud.setMenu(true)
if (q.get('toast') === '1') hud.toast('左腕：装備なし', 600)
if (q.get('banner')) hud.banner(q.get('banner') === 'fail' ? '危ない！ 舟が下にいる' : '水門 修理完了！', q.get('banner') === 'fail' ? 'fail' : 'success', 600)
if (q.get('flash')) hud.flash(q.get('flash') === 'success' ? 'success' : 'danger')
if (q.get('ido')) showIdo(q.get('ido') === 'glitch')
if (q.get('loading') === '1') {
  const l = new LoadingOverlayFuture(ui)
  l.setEra(ERA_TEXT[themeKey])
  l.set(0.62, 'ステージを組み立て中…')
}

function showIdo(glitch: boolean): void {
  const c = document.createElement('canvas')
  c.width = 560
  c.height = 220
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const grd = g.createLinearGradient(0, 0, 0, 220)
  grd.addColorStop(0, '#f4d9a8')
  grd.addColorStop(1, '#b98b52')
  g.fillStyle = grd
  g.fillRect(0, 0, 560, 220)
  g.fillStyle = '#5a3a1e'
  for (let i = 0; i < 9; i++) g.fillRect(20 + i * 60, 120 - (i % 3) * 14, 46, 100)
  g.fillStyle = '#2d6fb0'
  g.fillRect(0, 190, 560, 30)
  hud.showIdo({ title: '道頓堀の水路', sub: '1726年ごろ ― 大坂のからくり職人の町', body: '水門と歯車の仕掛けで、舟の通る水の高さを調整していました。職人たちは、使う人のことを考えて仕掛けを作りました。', image: c, foot: 'IDO 歴史アーカイブ #0726' })
  if (glitch) hud.setIdoGlitch(0.55)
}

// ---------------------------------------------------------------- 毎フレーム

let last = performance.now()
const spin = q.get('spin') === '1'
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (spin) {
    heading = ((heading + dt * 20 + 180) % 360) - 180
    setCompass()
  }
  hud.tick(dt)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---------------------------------------------------------------- 切り替えパネル

type Btn = [string, () => void]
const groups: Array<[string, Btn[]]> = [
  ['会話（話者）', [...Object.keys(LINES).map((n): Btn => [n, () => hud.say(n, LINES[n], 8)]), ['2人同時', () => (hud.say('源兵衛', '歯止めは入っとる。おはるの合図で離すんやで。', 8), setTimeout(() => hud.say('おはる', '待って！ 舟が来るよ！', 6), 400))]]],
  ['照準', ['light', 'anchor', 'mechanism', 'far', 'multi', 'connected', 'none'].map((k): Btn => [k, () => reticle(k)])],
  ['テーマ', (['2086', '2026', '1970', '1726'] as HudTheme[]).map((t): Btn => [t, () => theme(t)])],
  ['腕', [['支える', () => hold(true)], ['離す', () => hold(false)], ['左腕 装備', () => ((leftPart = 'つかむNMClaw'), hold(false))], ['左腕 なし', () => ((leftPart = null), hold(false))], ['Q', () => (hud.pulseArm('left'), hud.toast(leftPart ? '左腕：つかむNMClaw' : '左腕：装備なし'))], ['E', () => hud.pulseArm('right')]]],
  ['体力・鉱石', [['HP -1', () => hud.setHp(Math.max(0, hpNow() - 1))], ['HP +1', () => hud.setHp(Math.min(5, hpNow() + 1))], ['鉱石 0.3', () => hud.setEnergy(0.3)], ['鉱石 1.0', () => hud.setEnergy(1)], ['鉱石 なし', () => hud.setEnergy(null)], ['鉱石が光る', () => hud.setOreGlow(2.5)]]],
  ['表情', [...(['happy', 'determined', 'worried', 'surprised'] as const).map((e): Btn => [e, () => hud.setPortraitExpression(e)]), ['自動', () => hud.setPortraitExpression(null)]]],
  ['キー案内', Object.keys(HINTS).map((k): Btn => [k, () => hud.setHints(HINTS[k])])],
  ['水門', [...['watch', 'wait', 'go', 'done'].map((k): Btn => [k, () => gate(k)]), ['閉じる', () => hud.setGate(null)]]],
  ['演出', [['お知らせ', () => hud.toast('水に落ちた！ 近くのチェックポイントから再開')], ['成功', () => (hud.flash('success'), hud.banner('水門 修理完了！', 'success'))], ['失敗', () => (hud.flash('danger'), hud.banner('まだ早い！', 'fail', 1.6))], ['時代カード', () => eraCard(hud.currentTheme)], ['目的を変える', () => hud.setObjective('IDOマーカーを調べよう', '水路沿いの石の標識で F')]]],
  ['パネル', [['一時停止', () => hud.setPaused(true)], ['装備・記録', () => hud.setMenu(true)], ['閉じる', () => (hud.setPaused(false), hud.setMenu(false), hud.hideIdo())], ['IDO', () => showIdo(false)], ['IDO ゆがみ', () => showIdo(true)], ['読み込み', () => showLoading()]]],
  ['コンパス', [['左へ', () => ((heading -= 25), setCompass())], ['右へ', () => ((heading += 25), setCompass())], ['真後ろ', () => ((heading = bearing + 180), setCompass())]]],
]

let hpCache = Number(q.get('hp') ?? 5)
function hpNow(): number {
  return hpCache
}
const origSetHp = hud.setHp.bind(hud)
hud.setHp = (n: number) => {
  hpCache = n
  origSetHp(n)
}

function showLoading(): void {
  const l = new LoadingOverlayFuture(ui)
  l.setEra(ERA_TEXT[hud.currentTheme])
  let p = 0
  const id = setInterval(() => {
    p += 0.08
    l.set(p, p < 0.5 ? '町を組み立て中…' : '光を準備中…')
    if (p >= 1) {
      clearInterval(id)
      l.hide()
    }
  }, 160)
}

if (panel.isConnected) {
  panel.innerHTML = `<button class="hide">隠す</button><b>HUD プレビュー</b>`
  for (const [title, btns] of groups) {
    const h = document.createElement('h3')
    h.textContent = title
    panel.appendChild(h)
    for (const [label, fn] of btns) {
      const b = document.createElement('button')
      b.textContent = label
      b.addEventListener('click', fn)
      panel.appendChild(b)
    }
  }
  panel.querySelector('.hide')?.addEventListener('click', () => panel.remove())
}
