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
- `objectiveMarker.ts` … 目標の目印（いまやることの相手の頭の上に弾む金色の「！」と名前の札。画面の外なら縁に寄せて矢印）。DOM だけ。ステージの `objectiveMarkers(rt)` を毎フレーム映す。置き場所の計算 `placeMarker` は `tests/objectiveMarker.test.ts`
- `params.ts` … URL パラメータ
- `titleLogic.ts`・`titleScreen.ts`・`title.css` … タイトル画面（はじめから／つづきから。決まりは `tests/title.test.ts`）
- `titleScene.ts` … タイトル画面の 3D の背景（夜明けの空・時空の輪・光の粒。シェルのネクマックスを使い回す）
- `future2086Adapter.ts` … 2086 年ステージ（別担当）をつなぐところ
- `game.css` … 時空移動・時代カード・IDO パネル・話者の色

## Stage の取り決め（`stage.ts`）

```ts
interface Stage {
  key: '1726' | '1970' | '2026' | '2086'
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
  music?(rt): MusicId | null       // 鳴らす曲（省略で時代の曲・null で無音。戦闘・ボスの曲はシェルがかぶせる）
  objectiveTarget?(rt): Vector3 | null   // 目標の位置（HUD の方位磁針用）
  objectiveMarkers?(rt): ObjectiveMark[] | null   // 頭の上の目印 { pos, label?, edge? }（最大 4。会話・演出・操作停止中はシェルが隠す）
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
  cause：`ido_exhibit`（2086 の IDO 展示）・`ido_qr`（2026 の QR）・`ido_compass`（2086 のソラの羅針盤。中盤）・
  `return`（鉱石に残った出発地点へ帰る）・`debug`・`load`。
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

`?stage=1726|1970|2026|2086`・`?spawn=ID`・`?flags=met_matsui,gate_repaired,loop_count=2`（`name=false` で下ろす）・
`?continue`（セーブから再開）・`?newgame`（セーブを消す）・`?notitle`（タイトル画面を出さない。stage・spawn・flags・continue・newgame・shot のどれかがあっても出さない）・`?shot=ID`（ステージの固定カメラ）・`?nohud`・`?quality=low|medium|high`・`?fps=30|60`
（どちらも保存した設定より優先）・`?fixed`（解像度を固定）・`?stats`（F3 と同じ計測表示）・`?debug`・`?slowmo=0.3`。
開発用の操作：`window.__game.travel('2026')`・`window.__game.debug()`・`window.__game.memory()`・`window.__game.story`・
`window.__game.graphics({ quality: 'low', fps: 30, music: 2 })`（画質・フレームレート・音楽の音量をその場で変える）・`window.__game.music()`（いま鳴らしたい曲）・`window.__game.title()`（タイトル画面の段階）。

## タイトル画面と起動の流れ

URL に開始の指定が無いときは、読み込み画面 → タイトル画面（`PRESS ANY KEY`／画面をタップ）→ メニュー。
最初のキー・タップで音を出せるようにして（ブラウザの決まり）、タイトルの曲を始める。
「はじめから」は記録があれば確かめてから消し、2086 年の冒頭へ。「つづきから」は記録の時代とチェックポイント（`rt.save` で保存した到着地点）から再開する。
記録が無いときの「つづきから」は選べない。選んだら暗転 → 読み込み画面 → ステージ。タイトルの間も毎フレームの流れ（`startLoop`）は回っていて、
`frame()` はタイトルの背景だけを描く。

## 音楽（`src/audio/`）

音源ファイルは使わず、Web Audio で楽器の音を合成して曲のデータを演奏する（すべて書き下ろし）。
- `tracks.ts` … 曲のデータ（タイトル・2086 年の朝と夜・2026・1970・1726・戦闘・番人）。旋律・和音・低音・分散・刻み・打楽器の型を文字で書く
- `theory.ts` … 曲のデータを音の並びにする純粋な計算（音名・和音・小節の長さの確かめ。`tests/music.test.ts` で、旋律が調の音かそのときの和音の音だけかも確かめる）
- `synth.ts` … 楽器（パッド・電気ピアノ・オルゴール・ヴィブラフォン・三味線・琴・笛・テルミン・金管・低音）と打楽器（太鼓・締め太鼓・鉦も）。
  1 音ごとに発振器 1〜3 個。鳴り終わった音は出口を外す（つないだままだとフィルタが処理され続けて重くなる）
- `music.ts` … `MusicPlayer`：少し先（0.3 秒）までを予約していく。曲の切り替えはクロスフェード、一時停止中は小さく、画面が裏に回ったら止める。音量 0 なら AudioContext ごと止める
- `musicDirector.ts` … どの曲にするか：ステージの `music()`（2086 年は回想＝タイトルの曲・夜＝夜の曲）、敵が襲ってきたら戦闘（離れても 4 秒は続ける）、ボスの体力が出ている間は番人、時空移動の間は無音

音量は一時停止の「設定」タブ（切・小・中・大。既定は中）。iPhone はマナーモードのあいだ Web Audio が鳴らない。

## 画質とフレームレート（`render/quality.ts`）

一時停止の「設定」タブで選び、この端末（localStorage の `nexmax.graphics.v1`）に保存する。スマホ・タブレット（タッチ操作）は「標準・30」、PC は「高画質・60」から始まる。
変えるとその場で効く（後処理のパスの組み直し・影の解像度・点光源の数・解像度の上限。花びらの数だけは次の時代から）。

| | 省電力 | 標準 | 高画質 |
|---|---|---|---|
| 環境遮蔽（N8AO） | なし | なし | あり（半分の解像度） |
| ブルーム | なし（パスから外す） | あり | あり |
| アンチエイリアス（SMAA） | なし | MEDIUM | HIGH |
| 影の解像度・ぼかし | 1024・1 | 1024・2 | 2048・3 |
| 解像度の上限（CSS の画素あたり） | 0.85 | 1.0 | 1.25 |
| 点光源（提灯など） | 2 | 4 | 6 |
| 左上の顔の更新 | 8 回／秒 | 12 回／秒 | 20 回／秒 |

フレームレートは requestAnimationFrame を間引いて上限（30・60）に合わせる（120Hz の画面でも 60 を超えない）。一時停止中・メニュー中は 12 まで下げる。
適応解像度（`render/renderer.ts` の `AdaptiveResolution`）は上限のフレームレートを目標に、毎フレームの実時間で測って解像度を下げ、余裕が続けば戻す。

## 2086 年ステージのつなぎ方（`future2086Adapter.ts`）

`stages/future2086/` の組み立て（`{ root, colliders, claw, … }` を返す）と物語のモジュールを、`Stage` を実装した
アダプタで包んで `createFutureStage()` から返す。物語は導入編 1〜5 章の `intro2086Story.ts`（台詞 `intro_2086.json`）で、
新しい演出（回想・レンズの受け渡し・アンテナと大画面・試みの一覧・町の外・QR と記録の石標など）とソラの動きは
`introDirector2086.ts`、小物は `introProps2086.ts`。旧版の流れ `future2086Story.ts` はプレビュー（previewPlay.ts）と既存テスト用に残してある。IDO 展示で 2026 年へ行くときは
`rt.travel({ to: '2026', cause: 'ido_exhibit', spawn: 'present_start' })`、2026 年から戻るときの到着地点 ID は `future_return`。

## 戦闘（`combat/`）と 1970 年ステージ（`stages/expo1970/`）

中盤（`docs/中盤シナリオとワールド構成_v1.md`）のアクション。シェルはステージごとに `CombatSystem`（`combat/combatSystem.ts`）を作り、
`rt.combat` で渡す。ステージは `rt.combat.enabled = true` にして `spawn(kind, pos, { tag, leash, style, hp, scale, hidden, armored })` で
敵（欠け虫・欠け盾・欠け重）を出す。K：3 段の連続攻撃、Shift（戦闘中）：回避、J：クローで小さい敵を引き寄せる・盾をはがす・
大きい敵へ飛び込んで蹴る。左腕の はじくNMClaw（`impact_claw_got`）を選んで J で衝撃（盾・装甲を割る・`addBreakable` の壁を壊す）。
左腕を選んでいても、金具など敵でない対象を狙っているときやワイヤーがつながっているときはクローを使う。
倒した敵は `onEnemyDefeated`、演出で倒すときは `kill(handle)`。敵の判断は純粋なロジック `combat/combatLogic.ts`（テストあり）。
壊れる壁の当たり判定は `rt.phys.remove(box)` で外す（`ColliderList.box()` が返す箱）。

1970 年 千里丘陵・万国博覧会（架空の会場）は `stages/expo1970/`：配置 `layout.ts`、組み立て `scene1970.ts`（2026 年の素材を使い回して Batch で結合）、
進み方 `story1970.ts`（フラグだけで段階が決まる純粋なロジック。錨をほどく合図 `UnravelLogic`）、ステージ `stage.ts`、
仲間のミチ `michi.ts`、来場者 `visitors1970.ts`（部品ごとの InstancedMesh）、拾える物・裂け目・破片・錨の糸 `props1970.ts`、
台詞 `dialogue_1970.json`・`mob_lines_1970.json`。2086 年からはソラの羅針盤（9 章。`compass_built`）で `ido_compass`、
錨をほどく（`expo_anchor_cleared`）と `return` で 2086 年へ帰れる。

