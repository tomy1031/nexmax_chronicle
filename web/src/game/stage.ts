// ステージ（時代ごとの場面）の取り決め。説明は game/README.md。
// シェル（game.ts）が持つもの：レンダラ・後処理・HUD・入力・プレイヤー（ネクマックス）・カメラ・NMClaw・
// フラグとセーブ・時空移動。ステージが持つもの：シーンの中身・当たり判定・つかめる対象・環境（空・HDRI・霧・太陽）・
// 仲間（NPC）・到着地点・目標・物語の進行。読み込むステージは常に 1 つで、移動のたびに古いステージを解放する。
import type * as THREE from 'three'
import type { SkyPalette } from '../render/sky'
import type { QualitySettings } from '../render/quality'
import type { PostChain } from '../render/post'
import type { SunRig } from '../render/renderer'
import type { ColliderList } from '../world/colliders'
import type { LightSpot } from '../world/edo/kit'
import type { ClawTargetDef } from '../player/clawLogic'
import type { MovableInput, ClawSystem } from '../player/clawSystem'
import type { PlayerController } from '../player/controller'
import type { CameraRig } from '../player/cameraRig'
import type { Physics } from '../player/physics'
import type { ActionFrame } from '../player/inputActions'
import type { WireEvent } from '../player/clawLogic'
import type { Equipment } from '../player/equipment'
import type { Character, CharacterName } from '../world/characters'
import type { MusicId } from '../audio/tracks'
import type { Hud, Hint } from '../ui/hud'
import type { StoryState } from '../core/storyFlags'
import type { EraId } from '../core/eras'
import type { DialogueLine } from './dialogueQueue'
import type { StageKey, TravelRequest, TravelVerdict } from './travel'
import type { RiftFx } from './riftFx'
import type { CineShot } from './cinematic'
import type { ObjectiveMark } from './objectiveMarker'
import type { CombatSystem } from '../combat/combatSystem'

export type { StageKey, TravelRequest, CineShot, ObjectiveMark }

/** 到着地点（足元の位置・向き・カメラ） */
export type SpawnPoint = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }

/** ステージの環境。シェルが空のドーム・IBL・霧・太陽・半球光・色調を設定し、移動時に解放する */
export type StageEnvironment = {
  sky: SkyPalette
  /** 太陽の向き（地面→太陽） */
  sunDir: THREE.Vector3
  sunColor?: THREE.ColorRepresentation
  sunIntensity?: number
  hemi?: { sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number }
  /** public/ からの HDRI（.hdr）。null なら手続きの空から IBL を作る */
  hdri: string | null
  envIntensity?: number
  fog?: { color: THREE.ColorRepresentation; density: number }
  /** 後処理の色調（未指定は既定値） */
  grade?: { exposure?: number; saturation?: number; contrast?: number; vignette?: number }
  bloom?: { intensity?: number; threshold?: number }
  /** 後処理の層状のかすみ（render/post.ts の HazeEffect。未指定は既定値に戻す） */
  haze?: { near?: THREE.ColorRepresentation; far?: THREE.ColorRepresentation; density?: number; start?: number; falloff?: number; max?: number }
}

/** ステージが組み立てた中身 */
export type StageWorld = {
  /** シーンに足すルート。移動時にシェルが外し、配下のジオメトリ・マテリアル・テクスチャを解放する */
  root: THREE.Object3D
  colliders: ColliderList
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }
  /** 点光源の候補（シェルが近い 6 個に点光源を割り当てる） */
  lights: LightSpot[]
}

/** load() の間に使えるもの */
export type StageLoadContext = {
  renderer: THREE.WebGLRenderer
  quality: QualitySettings
  story: StoryState
  /** 読み込み表示（0〜1 はこのステージの読み込みの中での割合） */
  progress(p: number, msg: string): void
  /** 読み込み表示を更新するために 1 フレーム譲る */
  yieldFrame(): Promise<void>
  /** NPC を読み込む（public/models/<name>.glb。無ければ fallback、それも無ければ仮モデル） */
  loadNpc(name: CharacterName, height: number, fallback?: () => Character): Promise<Character>
  /** 到着地点 ID（URL の ?spawn= や移動の要求から） */
  spawnId: string | null
  /** どこから来たか（起動直後は null） */
  from: StageKey | null
  /** URL パラメータ */
  params: URLSearchParams
}

/** プレイ中にステージが使えるシェルの機能 */
export type StageRuntime = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  post: PostChain
  hud: Hud
  quality: QualitySettings
  params: URLSearchParams
  player: PlayerController
  camRig: CameraRig
  claw: ClawSystem
  /** 戦闘（体力・攻撃・敵）。ステージが enabled にして敵を出す（combat/combatSystem.ts） */
  combat: CombatSystem
  phys: Physics
  /** 主人公の見た目（シェルが持つ。ステージは解放しない） */
  nexmax: Character
  equipment: Equipment
  story: StoryState
  /** 空のドームと太陽・半球光（環境はシェルが作って移動時に解放する。昼夜の切り替えなどで色を変えてよい） */
  sky: THREE.Mesh
  sun: SunRig
  /** 3D の光の裂け目（シェルが持つ。到着・出発の演出に使う） */
  rift: RiftFx
  /** 背中の鉱石を光らせる（0〜2 以上。ゆっくり戻る） */
  oreGlow(v: number): void
  /** 時空移動を要求する（規則に合わなければ ok=false） */
  travel(req: TravelRequest): TravelVerdict
  /** 会話を 1 行ずつ出す（F で早送り）。終わると resolve */
  dialogue(lines: readonly DialogueLine[]): Promise<void>
  /** 会話中か（F は会話の早送りに使われる） */
  readonly talking: boolean
  /** 1 行だけ台詞を出す */
  say(speaker: string, text: string, seconds?: number): void
  /** セーブ（到着地点 ID をチェックポイントとして保存） */
  save(checkpoint: string): void
  /** プレイヤー操作を止める（イベント中） */
  setControlLocked(on: boolean): void
  /**
   * カメラの演出（cinematic.ts の CineShot）：操作を止め、プレイのカメラから shot へなめらかに寄って保持し、戻る。
   * その間はキー案内・照準を隠し、上下に黒帯、shot.marker があれば目印（光る輪・光の柱・名前の札）を出す。
   * 会話（dialogue）は同時に流せる（F は会話の早送り。会話が無く shot.skippable なら F・Space・J で戻りに入る）。
   * 戻り終わると resolve（時空移動などで打ち切られたときもすぐ resolve）。再生中に呼ぶと、そのときのカメラから次へ寄る
   */
  cinematic(shot: CineShot): Promise<void>
  /** 再生中のショットの保持を切り上げて戻りに入る（hold: Infinity のショットはこれで終わる）。fast で戻りを短く */
  endCinematic(fast?: boolean): void
  /** カメラの演出中か */
  readonly inCinematic: boolean
  /** 画面の揺れ（0〜1 くらい。少しずつ収まる。プレイ中にも使える） */
  shake(amount: number): void
  readonly playTime: number
}

/** 固定カメラの撮影用ショット（?shot=、P キーで切替） */
export type StageShots = {
  ids: string[]
  /** ショットを適用（-1 でプレイへ戻る） */
  apply(index: number, rt: StageRuntime): void
  /** ショット中の毎フレーム（hand は右手首のワールド位置） */
  update(index: number, dt: number, hand: THREE.Vector3, rt: StageRuntime): void
  focus(index: number): THREE.Vector3
  /** ショット中のネクマックスの歩きの速さ（歩きポーズなら 3.2 など、止まっていれば 0） */
  nexmaxSpeed(index: number): number
}

export interface Stage {
  readonly key: StageKey
  readonly era: EraId
  /** 時代カード・HUD の表示（例「2026年　大阪・なんば」） */
  readonly label: string
  /** 時代カードの下の一行 */
  readonly subtitle?: string
  readonly environment: StageEnvironment
  /** 中身を組み立てる（読み込み画面の裏で呼ばれる） */
  load(ctx: StageLoadContext): Promise<StageWorld>
  /** 到着地点（id が無い・未知なら既定の地点） */
  spawn(id: string | null): SpawnPoint
  /** 物理・プレイヤーの準備ができた後に 1 回（NPC の配置・到着の演出など） */
  begin(rt: StageRuntime): void
  /** 時代カードが消えた後（会話の開始などに） */
  revealed?(rt: StageRuntime): void
  /** プレイ中の毎フレーム（一時停止中・メニュー中・移動中は呼ばれない） */
  update(dt: number, frame: ActionFrame, rt: StageRuntime): void
  /** 毎フレーム（見た目のアニメーション。一時停止中は dt=0） */
  animate(dt: number, t: number, rt: StageRuntime): void
  /** F を押した。処理したら true（会話中は呼ばれない） */
  interact(rt: StageRuntime): boolean
  /** キー案内。null ならシェルの既定（クロー・開始直後の操作案内） */
  hints(rt: StageRuntime): Hint[] | null
  /** 鳴らす曲（省略すると時代の曲。null で鳴らさない）。戦闘・ボスの曲はシェルが上からかぶせる */
  music?(rt: StageRuntime): MusicId | null
  /** 左上の目標 */
  objective(rt: StageRuntime): { title: string; sub: string }
  /** 目標のワールド位置（HUD の方位磁針・目標マーカー用。無ければ null） */
  objectiveTarget?(rt: StageRuntime): THREE.Vector3 | null
  /** いまやることの相手の頭の上に出す目印（objectiveMarker.ts。最大 4 つ。無ければ null・空） */
  objectiveMarkers?(rt: StageRuntime): readonly ObjectiveMark[] | null
  onClawEvent?(e: WireEvent, rt: StageRuntime): void
  /** 水などに落ちて戻されたとき */
  onRespawn?(rt: StageRuntime): void
  shots?: StageShots
  /** 開発用の状態（window.__slice.debug() に混ぜる） */
  debug?(): Record<string, unknown>
  /** ステージ固有の後片付け（root 配下はシェルが解放するので、それ以外の DOM・タイマー・リスナーなど） */
  dispose(): void
}

/** ステージの生成（registry.ts に登録） */
export type StageFactory = () => Promise<Stage>
