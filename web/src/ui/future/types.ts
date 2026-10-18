// 近未来 HUD（HudFuture）の型。現行の ui/hud.ts と同じ形にしてある（構造的に互換）。
// hud.ts を消しても動くよう、ここで独立に定義する。

export type HudStats = { fps: number; ms: number; calls: number; tris: number; ratio: number; quality: string; textures: number; programs: number }

export type ReticleCategory = 'light' | 'anchor' | 'mechanism' | 'enemy'

export type ReticleState =
  | { mode: 'idle' }
  | { mode: 'target' | 'far'; x: number; y: number; r: number; category: ReticleCategory; label: string; candidates: number; locked: boolean; connected: boolean }

export type Hint = { key: string; label: string }

export type ArmView = {
  right: { name: string; holding: string | null; selected: boolean; active: boolean }
  left: { name: string | null; selected: boolean }
}

export type GateView = {
  progress: number
  signal: 'watch' | 'wait' | 'go' | 'done'
  signalText: string
  adjusting: boolean
  /** 見出しと 2 行の人（無ければ 1726年の水門：源兵衛の歯止め・おはるの合図）。what は [ふだん, 作業中, 完了] */
  labels?: { title: string; worker: string; what: readonly [string, string, string]; watcher: string }
}

/** IDO（歴史案内）のパネルの中身 */
export type IdoPanelContent = {
  title: string
  sub: string
  body: string
  /** 昔の町の絵（キャンバス） */
  image?: HTMLCanvasElement | null
  foot?: string
}

/** 平面上の位置（y は使わない。THREE.Vector3 をそのまま渡せる） */
export type PlanePoint = { x: number; z: number }

/** ポートレートの表情（ネクマックスの rig と同じ名前） */
export type PortraitExpression = 'happy' | 'determined' | 'worried' | 'surprised'

/** プレイヤーの状態（ポートレートの表情に使う。Pose の名前と同じ） */
export type PlayerPoseHint = 'idle' | 'walk' | 'run' | 'dash' | 'jump' | 'fall' | 'land' | 'hold' | 'pulled' | 'swing' | 'fire' | 'crank' | 'wave'

/** 操作一覧（一時停止画面）。マニュアル §2 の表と同じ並び */
export const CONTROL_LIST: Array<[string, string]> = [
  ['W／A／S／D', '移動（カメラの向きが基準）'],
  ['↑／↓／←／→', 'カメラ・照準の向き'],
  ['Space', 'ジャンプ／ワイヤーから離脱'],
  ['Shift', 'ダッシュ（押している間）'],
  ['F', '話す・調べる'],
  ['J', 'NMClaw を射出／もう一度で解除'],
  ['K', '基本攻撃（戦闘の実装後）'],
  ['R', '狙う対象を切り替える'],
  ['Q／E', '左腕／右腕の装備を選ぶ'],
  ['G', '異次元空間を開く（安全地点のみ）'],
  ['Tab', '装備・記録'],
  ['Esc', '一時停止（装備・記録／操作一覧）'],
]

/** スマホの操作一覧（一時停止画面）。左はキーの代わりに指の動き・画面のボタンの名前 */
export const TOUCH_CONTROL_LIST: Array<[string, string]> = [
  ['左側をなぞる', '移動（大きく倒すとダッシュ）'],
  ['右側をなぞる', 'カメラ・照準の向き'],
  ['右下の輪', 'NMClaw を射出／もう一度で解除'],
  ['ジャンプ', 'ジャンプ／ワイヤーから離脱'],
  ['話す', '話す・調べる・次へ（出たとき）'],
  ['切替', '狙う対象を切り替える'],
  ['左上の手の輪', '左腕の装備を選ぶ'],
  ['❚❚', '一時停止（装備・記録／操作一覧。タブをタップで切り替え）'],
]
