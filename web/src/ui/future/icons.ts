// 近未来 HUD のアイコン（インライン SVG）。色は currentColor か、共有の <defs>（frame.ts）のグラデーション。
// キーボードのみの表示方針：マウス・コントローラーの絵は置かない。

/** 左腕：開いた手（装備なし） */
export const HAND_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor">
<rect x="19.5" y="12" width="7.6" height="27" rx="3.8"/>
<rect x="28.2" y="8" width="7.6" height="31" rx="3.8"/>
<rect x="36.9" y="10" width="7.6" height="29" rx="3.8"/>
<rect x="45.4" y="16.5" width="7" height="23" rx="3.5"/>
<path d="M19.5 31 H52.4 V44 C52.4 53.5 45.6 59 37 59 H34.6 C26 59 19.5 53 19.5 44.5 Z"/>
<rect x="11.5" y="29.5" width="7.6" height="20" rx="3.8" transform="rotate(-27 15.3 39.5)"/>
</g><path d="M22 35 C30 37.5 40 37.5 50 35" stroke="rgba(255,255,255,0.28)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`

/** 右腕：つかむNMClaw（斜めの柄の先に、上下 2 本の爪が開いたつかみ具） */
export const CLAW_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
<path d="M9 55 L27 37" stroke-width="7.5"/>
<path d="M19.5 31 L33 44.5" stroke-width="6.5"/>
<path d="M28 34 C24 23 30.5 11.5 42 10 C50 9 56 13.5 56 20.5 L50 21.5" stroke-width="6"/>
<path d="M33.5 39.5 C40.5 42.5 47 42 51.5 37.5 L50 32" stroke-width="5.5"/>
</svg>`

/** 体力のハート（gradient は共有 defs の nxf-heart） */
export const HEART_SVG = `<svg viewBox="0 0 32 30" aria-hidden="true"><path class="h-body" d="M16 28.3 C6.6 21.4 2 16 2 10.2 C2 5.7 5.3 2.6 9.3 2.6 C12.1 2.6 14.5 4.2 16 6.7 C17.5 4.2 19.9 2.6 22.7 2.6 C26.7 2.6 30 5.7 30 10.2 C30 16 25.4 21.4 16 28.3 Z"/><path class="h-shine" d="M7.2 7.6 C8.6 5.9 11 5.6 12.6 6.8"/></svg>`

/** 特殊鉱石（六角の結晶） */
export const CRYSTAL_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2.5 L34.5 11 V29 L20 37.5 L5.5 29 V11 Z" fill="url(#nxf-crystal)" stroke="#e8fdff" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 9.5 L28.5 14.5 V25.5 L20 30.5 L11.5 25.5 V14.5 Z" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.7)" stroke-width="1"/><path d="M20 2.5 V9.5 M34.5 11 L28.5 14.5 M34.5 29 L28.5 25.5 M20 37.5 V30.5 M5.5 29 L11.5 25.5 M5.5 11 L11.5 14.5" stroke="rgba(255,255,255,0.55)" stroke-width="1"/></svg>`

/** 目的のひし形（黄色） */
export const DIAMOND_SVG = `<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M22 3.5 L40.5 22 L22 40.5 L3.5 22 Z" fill="rgba(20,40,80,0.35)" stroke="#ffd23f" stroke-width="3.4" stroke-linejoin="round"/><path d="M22 12 L32 22 L22 32 L12 22 Z" fill="url(#nxf-gold)"/><path d="M22 12 L32 22 L22 22 Z" fill="rgba(255,255,255,0.55)"/></svg>`

/** 会話を進めるしるし（▷） */
export const NEXT_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4 L19 12 L6 20 Z" fill="rgba(80,220,255,0.18)" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`

/** お知らせのしるし */
export const INFO_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5 V13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.5" fill="currentColor"/></svg>`

/** 歯車（水門の仕掛け） */
export const GEAR_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`

/** 話者の顔が無いときの人影（色は currentColor） */
export const SILHOUETTE_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="25" r="12.5" fill="currentColor"/><path d="M10 62 C11 46 20 39 32 39 C44 39 53 46 54 62 Z" fill="currentColor"/></svg>`

/** システムの話者（鉱石の光） */
export const SYSTEM_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(12 12)">${CRYSTAL_SVG.replace('<svg viewBox="0 0 40 40" aria-hidden="true">', '').replace('</svg>', '')}</g></svg>`

/** 照準の形（対象の種類ごと） */
export const RETICLE_SVG: Record<'light' | 'anchor' | 'mechanism', string> = {
  // 軽い物：十字の入った丸（物がこちらへ）
  light: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="32" cy="32" r="18" stroke-width="3.2"/><path d="M32 8 V19 M32 45 V56 M8 32 H19 M45 32 H56" stroke-width="3.2"/><path d="M32 27.5 L36.5 32 L32 36.5 L27.5 32 Z" fill="currentColor" stroke-width="1"/></svg>`,
  // 固定支点：ひし形（自分が向こうへ）
  anchor: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M32 11 L53 32 L32 53 L11 32 Z" stroke-width="3.2"/><path d="M32 4 V11 M32 53 V60 M4 32 H11 M53 32 H60" stroke-width="3.2"/><circle cx="32" cy="32" r="4" fill="currentColor" stroke="none"/></svg>`,
  // 協力装置：歯車（その場で支える）
  mechanism: `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-linejoin="round"><g transform="translate(12 12)"><path d="M17 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" stroke-width="2.6"/><circle cx="20" cy="20" r="5.5" stroke-width="2.6"/></g></svg>`,
}

/** 何も狙っていないときの小さな照準 */
export const RETICLE_IDLE_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="20" cy="20" r="8" stroke-width="1.8" stroke-dasharray="9.5 3.07" transform="rotate(-38 20 20)"/><circle cx="20" cy="20" r="1.9" fill="currentColor" stroke="none"/></svg>`

/** 照準の左右の六角の括弧（左用。右は CSS で反転） */
export const BRACKET_SVG = `<svg viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 2 L3 20 V80 L18 98" fill="none" stroke="currentColor" stroke-width="2.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`

/** 照準の下の小さな矢印 */
export const CHEVRON_SVG = `<svg viewBox="0 0 20 14" aria-hidden="true"><path d="M3 2 L10 9 L17 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9 V0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
