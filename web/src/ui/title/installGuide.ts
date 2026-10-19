// 「ホーム画面に追加」の案内の中身（端末ごとに出し分ける）。titleScreen.ts が開く。
import type { InstallPlatform } from './titleLogic'

const ICON_SHARE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v8A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 9H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 14V3.5M8.5 7 12 3.5 15.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const ICON_ADD = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
const ICON_MORE = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="18.5" r="1.8" fill="currentColor"/></svg>`
const ICON_DOTS = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor"/></svg>`
const ICON_OPEN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
const ICON_FULL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
const ICON_DIFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
const ICON_TAP = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>`

export const INSTALL_ICON = ICON_ADD

function step(icon: string | null, main: string, sub?: string): string {
  return `<li><span class="nt-step-ico">${icon ?? ''}</span><span class="nt-step-text">${main}${sub ? `<small>${sub}</small>` : ''}</span></li>`
}

const PERKS = `<ul class="nt-perks">
  <li>${ICON_FULL}<span>画面いっぱいで遊べる</span></li>
  <li>${ICON_DIFF}<span>次からは、新しくなったところだけダウンロード</span></li>
  <li>${ICON_TAP}<span>ホーム画面のアイコンから、すぐ始められる</span></li>
</ul>`

/**
 * 案内の HTML。ボタンは data-act で titleScreen.ts が受ける：
 * guide-prompt（ブラウザのインストール画面を出す）・guide-close（あとで）
 */
export function installGuideHtml(platform: InstallPlatform, canPrompt: boolean): string {
  const head = `<h2 class="nt-guide-title" id="nt-guide-title">ホーム画面に追加して遊ぼう</h2>`
  let body = ''
  let note = ''
  if (platform === 'ios') {
    body = `<ol class="nt-steps">
      ${step(ICON_SHARE, 'Safari の<b>共有ボタン</b>をタップ', '見つからないときは、［…］の中にあります')}
      ${step(ICON_ADD, '<b>ホーム画面に追加</b>を選ぶ', '出てこないときは、下へスクロールしてください')}
      ${step(null, '<b>追加</b>をタップ', 'ホーム画面にできたアイコンから開きます')}
    </ol>`
    note = 'iPhone・iPad では、Safari とホーム画面のアプリで記録（セーブ）が別になります。先に追加してから遊ぶのがおすすめです。'
  } else if (platform === 'inapp') {
    body = `<p class="nt-guide-lead">このアプリの中のブラウザでは、ホーム画面に追加できません。</p>
    <ol class="nt-steps">
      ${step(ICON_DOTS, 'メニュー［…］をタップ', '画面の右上か右下にあります')}
      ${step(ICON_OPEN, '<b>ブラウザで開く</b>を選ぶ', 'iPhone は Safari、Android は Chrome で開きます')}
      ${step(null, '開いたページで、もう一度この案内が出ます')}
    </ol>`
  } else if (canPrompt) {
    body = `<div class="nt-guide-one">
      <button class="nt-btn primary nt-guide-prompt" data-act="guide-prompt"><span class="nt-btn-label">${ICON_ADD}ホーム画面に追加する</span></button>
      <p class="nt-guide-lead">次に出る画面で「インストール」（または「追加」）を押すだけです。</p>
    </div>`
  } else if (platform === 'android') {
    body = `<ol class="nt-steps">
      ${step(ICON_MORE, '右上のメニュー［⋮］をタップ')}
      ${step(ICON_ADD, '<b>ホーム画面に追加</b>を選ぶ', '「アプリをインストール」と出ることもあります')}
      ${step(null, '<b>追加</b>（インストール）をタップ', 'ホーム画面にできたアイコンから開きます')}
    </ol>`
  } else {
    body = `<p class="nt-guide-lead">Chrome・Edge では、アドレスバーの右にある「インストール」のアイコンから追加できます。</p>`
  }
  return `${head}<div class="nt-guide-cols">${PERKS}<div class="nt-guide-how">${body}${note ? `<p class="nt-note">${note}</p>` : ''}</div></div>
  <div class="nt-guide-actions"><button class="nt-link" data-act="guide-close">あとで</button></div>`
}

/** 追加できたとき */
export function installedHtml(): string {
  return `<h2 class="nt-guide-title" id="nt-guide-title">ホーム画面に追加しました</h2>
  <p class="nt-guide-lead">ホーム画面にできたネクマックスのアイコンから開いてください。</p>
  <div class="nt-guide-actions"><button class="nt-link" data-act="guide-close">閉じる</button></div>`
}
