# game/ ― ゲームのシェルとステージの取り決め

three.js 版は **シェル（ずっと残るもの）＋ステージ（時代ごとの場面）** でできている。
読み込むステージは常に 1 つ。時空移動のたびに古いステージの GPU 資源と物理を解放してから、新しいステージを組み立てる
（操作マニュアル v1.1 §8-6、物語 v2.3 §14）。

| 持ち主 | もの |
|---|---|
| シェル（`game.ts`） | レンダラ・後処理（N8AO／かすみ／ブルーム／色調／SMAA）・HUD・入力（アクション）・ネクマックス（主人公の見た目）・カメラ・NMClaw（照準・ワイヤー・見た目）・装備・点光源 6 個・光の裂け目（`riftFx.ts`）・フラグとセーブ（`core/storyFlags.ts`・`core/gameSave.ts`）・時空移動（`travel.ts`・`travelFx.ts`） |
| ステージ（`stages/*`） | シーンの中身（ルート）・当たり判定（`ColliderList`）・つかめる対象（`ClawTargetDef[]`／動かせる物）・環境（空・HDRI・霧・太陽・半球光・色調）・仲間（NPC）・到着地点・目標・物語の進行 |

物理（Rapier の World）・`PlayerController`・`CameraRig`・`ClawSystem` は**ステージごとに作り直す**
（ステージの当たり判定とつかめる対象から作る）。主人公の見た目・HUD・後処理はそのまま使い回す。

## ファイル

- `stage.ts` … `Stage` などの型（下の説明）
- `game.ts` … シェル。`startGame(app, ui)`。毎フレームの流れは 1726 年の縦切り試作（旧 `world/edo/slice.ts`）と同じ
- `registry.ts` … ステージの登録（動的 import）と時代カードの文言。`DEFAULT_STAGE`（URL 指定が無いときの開始ステージ）
- `travel.ts` … 時空移動の状態機械と移動の規則（純粋なロジック・`tests/travel.test.ts`）
- `travelFx.ts` … 全画面の時空移動の演出（2D キャンバス）と「時空移動中」の読み込み表示
- `riftFx.ts` … 3D の光の裂け目（到着・出発の場所に開く）
- `env.ts` … 環境の適用と解放（PMREM のレンダーターゲットまで解放する）
- `dispose.ts` … ルート配下のジオメトリ・マテリアル・テクスチャ（シェーダの uniform のテクスチャも）を解放
- `dialogueQueue.ts` … 複数行の会話を順に出す（文字数で自動送り、F で早送り）
- `cinematic.ts` … カメラの演出（`rt.cinematic(shot)`）の時間の進み・加減速・自動のカメラ位置・ディレクター（純粋な計算＋THREE の数学。`tests/cinematic.test.ts`）
- `cineMarker.ts` … 演出中の目印（脈打つ光る輪・光の柱・名前の札）。シェルが 1 組だけ持って使い回す
- `params.ts` … URL パラメータ
- `future2086Adapter.ts` … 2086 年ステージ（別担当）をつなぐところ
- `game.css` … 時空移動・時代カード・IDO パネル・話者の色

## Stage の取り決め（`stage.ts`）

```ts
interface Stage {
  key: '1726' | '2026' | '2086'
  era: EraId                       // core/eras.ts
  label: string                    // 時代カード・HUD（例「2026年　大阪・なんば」）
  subtitle?: string                // 時代カードの下の一行
  environment: StageEnvironment    // 空・太陽・HDRI・霧・色調（シェルが適用して、移動時に解放）
  load(ctx): Promise<StageWorld>   // 中身を組み立てる（読み込み画面の裏）
  spawn(id): SpawnPoint            // 到着地点（id は URL の ?spawn= か移動の要求）
  begin(rt): void                  // 物理・プレイヤーができた後に 1 回（NPC の配置、到着の演出）
  revealed?(rt): void              // 時代カードが出た後（会話の開始など）
  update(dt, frame, rt): void      // プレイ中の毎フレーム（一時停止・メニュー・移動中は呼ばれない）
  animate(dt, t, rt): void         // 毎フレーム（見た目。一時停止中は dt = 0）
  interact(rt): boolean            // F（会話中はシェルが早送りに使うので呼ばれない）
  hints(rt): Hint[] | null         // キー案内（null ならシェルの既定）
  objective(rt): { title, sub }    // 左上の目標
  objectiveTarget?(rt): Vector3 | null   // 目標の位置（HUD の方位磁針用）
  onClawEvent?(e, rt): void        // NMClaw のお知らせ（connected / released など）
  onRespawn?(rt): void
  shots?: StageShots               // ?shot= の固定カメラ（P キーで切替）
  debug?(): Record<string, unknown>
  dispose(): void                  // ステージ固有の後片付け（root 配下はシェルが解放する）
}

type StageWorld = {
  root: THREE.Object3D             // シーンに足すルート。移動時にシェルが外して配下を解放する
  colliders: ColliderList          // world/colliders.ts（箱・床・見えない壁）
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }   // player/clawLogic.ts・clawSystem.ts
  lights: LightSpot[]              // 点光源の候補（シェルが近い 6 個に割り当てる）
}
```

`StageLoadContext`（`load` に渡る）：`renderer`・`quality`・`story`・`progress(p, msg)`・`yieldFrame()`・
`loadNpc(name, height, fallback?)`（`public/models/<name>.glb`、無ければ fallback）・`spawnId`・`from`（来た時代）・`params`。

`StageRuntime`（`begin` 以降に渡る）：`scene`・`camera`・`renderer`・`post`・`hud`・`player`・`camRig`・`claw`・`phys`・
`nexmax`（主人公の見た目。ステージは解放しない）・`equipment`・`story`・`rift`・`oreGlow(v)`（背中の鉱石）・
`travel(req)`・`dialogue(lines)`（Promise）・`talking`・`say(speaker, text)`・`save(checkpoint)`・`setControlLocked(on)`・`playTime`・
`cinematic(shot)`（Promise）・`endCinematic(fast?)`・`inCinematic`・`shake(amount)`。

### カメラの演出（`rt.cinematic`）

```ts
await rt.cinematic({
  look: casePos,                 // 見せる点（必須）
  from: camPos,                  // カメラの位置（省略するとプレイヤー越しに自動・壁に埋まらない）
  lookTo, fromTo, panSec,        // 保持の間のパン・ドリー（任意）
  inSec: 2, hold: 3, outSec: 1.6, // 寄る・保持（Infinity なら endCinematic() まで）・戻る
  fov: 50,
  marker: { pos: casePos, label: '共鳴レンズのケース', color: '#ffd447' },
  shake: 0, skippable: false, letterbox: true,
})
```

プレイのカメラ（CameraRig）の姿勢から shot の姿勢へ、位置は補間（遠いときは弧を描いて持ち上げる）・向きは slerp で寄り、戻るときもプレイの姿勢へ
ぴったり戻る（飛ばない）。その間は操作を止め、照準・キー案内・コンパスを隠し、上下に細い黒帯（HUD の後ろ）。会話は同時に流せる（F は会話の早送り。
会話が無く `skippable` なら F・Space・J で戻りに入る）。時空移動・ステージの解放・撮影ショット（P）で打ち切られ、そのときもすぐ resolve。
look などの Vector3 は毎フレーム読むので、ステージが動かしてもよい（`shake` も同じ）。2086年の表は `stages/future2086/focusShots2086.ts`。

### 守ること

- ステージの物は**すべて `root` の下**に入れる（解放はシェルが `root` をたどって行う）。`root` の外に作った GPU 資源
  （別の PMREM、レンダーターゲットなど）は `dispose()` で自分で解放する。
- `onBeforeCompile` の中だけで作った uniform のテクスチャはたどれない。モジュールで使い回すキャッシュにしておくか、
  `dispose()` で解放する。
- 主人公の見た目（`rt.nexmax`）・HUD・`rt.rift` はシェルの物なので解放しない。
- 時空移動は `rt.travel({ to, cause, spawn })`。規則（`travel.ts` の `travelRule`）に合わないと `{ ok: false, reason }`。
  cause：`ido_exhibit`（2086 の IDO 展示）・`ido_qr`（2026 の QR）・`return`（鉱石に残った出発地点へ帰る）・`debug`・`load`。
- フラグは `rt.story.get(name)` / `rt.story.set(name, true)`。TimelineState のフラグ（`gate_repaired` など）と
  v2.3 の追加フラグ（`festival_morning_seen`・`orum_seen`・`ido_exhibit_used`・`ido_qr_used`・`met_saeki`・
  `genbei_story_told`・`fixture_made`、周回数 `loop_count` は `rt.story.addLoop()`）を同じ名前で扱える。
  目標の既定の文言は `core/storyDirector.ts`。
- 到着したら `rt.save(spawnId)` で到着地点を保存（`?continue` で再開できる）。

## 時空移動の流れ（`travel.ts` → `game.ts`）

1. `rt.travel(req)` → 規則を確かめて `outro`（約 1.1 秒）：全画面の光の渦が時代の色で画面を覆い、ネクマックスが吸い込まれる
2. `cover`：読み込み表示（「時空移動中」）の裏で、古いステージの `dispose()` → `root` の解放（`dispose.ts`）→ クローの見た目の解放
   → 環境（空・PMREM・太陽）の解放 → `world.free()`（Rapier）→ 新しいステージの `load()` → 物理・プレイヤー・クローを作り直す
   → `begin()` → `renderer.compileAsync()`（シェーダの事前コンパイル）→ 2 回の空描画
3. `intro`（約 0.9 秒）：中央から渦が開いて新しい時代が見え、時代カード（例：2026年／大阪・なんば）と HUD の時代表示が変わる
4. `done`：`stage.revealed(rt)`

`renderer.info.memory` は移動のたびに新しいステージの分まで下がる（例：1726 年 約 137 geometries / 92 textures →
2026 年 約 131 / 63 → 2086 年の仮ステージ 約 39 / 42）。

## URL パラメータ（開発・検証用）

`?stage=1726|2026|2086`・`?spawn=ID`・`?flags=met_matsui,gate_repaired,loop_count=2`（`name=false` で下ろす）・
`?continue`（セーブから再開）・`?newgame`（セーブを消す）・`?shot=ID`（ステージの固定カメラ）・`?nohud`・`?quality=low`・`?stats`・`?debug`・`?slowmo=0.3`。
開発用の操作：`window.__game.travel('2026')`・`window.__game.debug()`・`window.__game.memory()`・`window.__game.story`。

## 2086 年ステージのつなぎ方（`future2086Adapter.ts`）

`stages/future2086/` の組み立て（`{ root, colliders, claw, … }` を返す）と物語のモジュールを、`Stage` を実装した
アダプタで包んで `createFutureStage()` から返す。物語は導入編 1〜5 章の `intro2086Story.ts`（台詞 `intro_2086.json`）で、
新しい演出（回想・レンズの受け渡し・アンテナと大画面・試みの一覧・町の外・QR と記録の石標など）とソラの動きは
`introDirector2086.ts`、小物は `introProps2086.ts`。旧版の流れ `future2086Story.ts` はプレビュー（previewPlay.ts）と既存テスト用に残してある。IDO 展示で 2026 年へ行くときは
`rt.travel({ to: '2026', cause: 'ido_exhibit', spawn: 'present_start' })`、2026 年から戻るときの到着地点 ID は `future_return`。
