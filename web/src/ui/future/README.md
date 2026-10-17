# 近未来ホログラム HUD（HudFuture）

コンセプト画像 **B**（`assets_src/reference/ui/ui_concept_B.png`）をベースに、**A** の「会話ウィンドウ内の話者の顔」だけを取り入れた HUD。
ネクマックスの体内にある時空鉱石の水色の光をテーマに、半透明の青いガラス・光る細い線・角を落としたパネル・小さな目盛り・走査線・ゆっくり動く光で組んでいる。
表示はキーボードの表記だけ（マウス・コントローラーの絵や文字は出さない。操作マニュアル v1.1 §2・§7）。

**まだゲームにはつないでいない。** 現行の `ui/hud.ts`（`Hud`／`LoadingOverlay`）と同じ公開 API を持つので、差し替えればそのまま動く（下の「差し替え方」）。

## ファイル

| ファイル | 中身 |
|---|---|
| `hudFuture.ts` | `HudFuture`（= `Hud` の代わり）と `LoadingOverlayFuture`（= `LoadingOverlay` の代わり）。`Hud` / `LoadingOverlay` という別名でも export |
| `hudFuture.css` | 見た目。クラスはすべて `.nx-` で始まる（`style.css` とぶつからない）。寸法は 1600×900 基準のデザイン px × `--u` |
| `portrait.ts` | 左上の**本物の 3D モデル**のポートレート（`createNexmax` の頭を描く） |
| `miniRenderer.ts` | HUD 専用の小さな WebGL レンダラ（1 つだけ。ポートレートと話者アイコンで共用） |
| `speakerIcons.ts` | 話者アイコン（GLB の人物の顔を 1 回だけ描いて画像にして覚える）と話者ごとの色 |
| `compass.ts` | コンパスの計算（DOM なし・テストあり）と表示部品 `CompassBar` |
| `dialogueBoard.ts` | 会話ウィンドウの中身を決めるロジック・文の切れ目での改行（DOM なし・テストあり） |
| `frame.ts` | ホログラムの枠（角を落としたガラス＋光る線）を要素の大きさに合わせて SVG で描く |
| `icons.ts` | アイコン（インライン SVG） |
| `types.ts` | 型（`hud.ts` と同じ形）と `CONTROL_LIST` |
| `preview.ts` ＋ `web/hud-preview.html` | プレビュー（ゲームの画面写真 `public/dev/hud-bg*.png` の上に重ねて状態を切り替える） |

テスト：`web/tests/hudFutureCompass.test.ts`、`web/tests/hudFutureDialogue.test.ts`。

## 差し替え方

`HudFuture` は `Hud` の公開メンバーをすべて同じ形で持つ（`setCompass` も含む。型で確認済み）。
ただし TypeScript では private を持つクラスは名前で区別されるので、`import type { Hud } from '../ui/hud'` のままだと型が合わない。どちらかで差し替える。

**A. いちばん簡単（1 ファイル）**：今の `src/ui/hud.ts` を `hudLegacy.ts` などへ退避し、`src/ui/hud.ts` を次の 1 行にする。

```ts
export * from './future/hudFuture'
```

`Hud` / `LoadingOverlay` / `CONTROL_LIST` / 型（`Hint` `ReticleState` ほか）がすべて新しい HUD を指すので、呼び出し側は変更不要。

**B. import を書き換える**：`game/game.ts`・`game/stage.ts`・`stages/future2086/preview.ts`・`previewPlay.ts` の
`from '../ui/hud'` を `from '../ui/future/hudFuture'` に（`Hud` / `LoadingOverlay` の名前のまま使える）。`Hint` だけを import している所はそのままでもよい（形が同じ）。

差し替え後、`style.css` の `.hud-*` / `.loading*` と `game/game.css` の `.hud-eracard` `.hud-ido` `.bark.*` は使われなくなる（消すのは任意）。

### つなぐと良くなるもの（任意・新しい API）

```ts
// game.ts の毎フレーム（applyPose の近く）：ポーズで表情（保持・引き寄せ＝必死、落下＝驚き）
hud.setPlayerPose(pose)
// 鉱石の光（ゲームの oreGlow と同じ尺度）→ ポートレートの縁の光
hud.setOreGlow(this.oreGlow)
// ステージ読み込み時：その時代の話者アイコンを先に作る
hud.preloadSpeakers(['源兵衛', 'おはる'])
```

`setCompass(camRig.yaw, target, player.position)` は game.ts がすでに毎フレーム呼んでいる（現行の Hud では何も表示しない入口）。
新しい HUD ではそのまま上中央のコンパスに出る。

## API

### 現行の Hud と同じ（動きの違いだけ書く）

| メソッド | 新しい HUD での見た目・違い |
|---|---|
| `setObjective(title, sub)` | 右上の目的パネル（黄色のひし形）。2 回目以降に変わると枠が光って知らせる |
| `setEra(text)` | 左上の時代と場所の札。**筆文字（Yuji Boku）は使わない**（コンセプト B の丸ゴシックに合わせた） |
| `setHp(n)` | ハート 5 個。減ると割れるように光り、ポートレートが揺れて赤く光り、2.2 秒「心配」の顔。1 以下で枠が赤く点滅 |
| `setEnergy(v \| null)` | 結晶アイコン＋4 区切りのゲージ。null で隠す（現行と同じ「必要なときだけ」） |
| `setReticle(s)` | B の照準（十字の入った丸）。種類ごとの形と色：軽い物＝十字の丸・橙、固定支点＝ひし形・水色、協力装置＝歯車・緑（色は現行と同じ）。左右に六角の括弧（対象の大きさ）、下に小さな矢印、名前の札。新しい対象に吸い付くとぱっと縮む。つないでいる間は脈打つ |
| `setHints(list)` | 1〜3 個は B の「[J] で つかむ」形の札（会話中は会話ウィンドウの右上へ移動）。4 個以上（開始直後の一覧）は小さな札を 1 列。**`{ key, label: '次へ' }` は会話ウィンドウの ▷ の横に出す** |
| `say(speaker, text, seconds)` | 現行は最大 3 行の吹き出しの積み重ね。新しい HUD は**大きな会話ウィンドウ 1 つ**（話者の顔・名札・2 行・▷）。表示中に別の台詞が来たら、前の台詞は上に小さく残す（最大 3.2 秒）。長い台詞は文の切れ目（。！？）で改行し、さらに長いと文字を小さく |
| `toast(text, s)` | 上中央（コンパスの下）の小さな札 |
| `banner(text, kind, s)` / `flash(kind)` | ホログラムの帯の大きな文字／画面のふちの光。成功は水色、失敗は赤 |
| `setArms(a)` / `pulseArm(side)` | 左下 Q・右下 J の円形の枠。つかんでいる物は右腕の上に黄色の札。射出中は点線の輪が回る。装備なしの左腕で Q を押すと揺れる |
| `setGate(g \| null)` | 右上（目的の下）。源兵衛・おはるの顔、10 区切りの進み具合、おはるの合図のランプ |
| `setPaused` / `setMenu` | ホログラムのパネル（操作一覧は 2 列・キーの形） |
| `showEraCard(year, place, sub, s, tint)` | 大きな「2026年」（数字は Orbitron）＋場所。中央から開く演出。tint は線と光の色 |
| `showIdo` / `setIdoGlitch` / `hideIdo` / `idoVisible` | 暗いガラスのパネルに変更（現行は白いカード）。ゆがみの演出は同じ |
| `setShot` / `setPlayUiVisible` | 同じ。プレイ用表示を隠すときはコンパスも隠す |
| `tick(dt)` / `toggleStats` / `statsOn` / `updateStats` | 同じ |
| `setCompass(cameraYaw, target, player)` | 上中央のコンパス（W・E などの文字、15° ごとの目盛り、目的地のピンと距離「32m」、範囲外は端に矢印）。`cameraYaw` は `cameraRig.yaw`（0 = カメラが +Z 側で北＝-Z を向く）。**null を渡すとコンパスごと隠す**（呼ばれるまでは出ない） |
| `LoadingOverlayFuture`（`setEra` / `set` / `hide`） | 同じ API。結晶・方眼・20 区切りのゲージ・％表示 |

### 新しく増えたもの

| メソッド | 用途 |
|---|---|
| `constructor(ui, options?)` | `options`：`livePortrait`（既定 true。false で SVG の顔）、`speakerIcons`（既定 true）、`portraitFps`（既定 20）、`ghostSeconds`（前の台詞を小さく残す秒数、既定 3.2） |
| `setCompassHeading(deg \| null, target, from)` | 方位（度、北 0・東 90）で直接指定する版 |
| `setPlayerPose(pose)` | ポーズから表情：`hold` `pulled` `swing` `crank` → 必死、`fall` → 驚き |
| `setPortraitExpression(e \| null)` | 表情を固定（`happy` `determined` `worried` `surprised`）。null で自動 |
| `setOreGlow(v)` | 鉱石の光の強さ（ポートレートの水色の縁の光と後ろの光） |
| `preloadSpeakers(names)` | 話者アイコンを先に作る |
| `setSpeakerIcon(name, url)` | 顔の画像を外から渡す（イラストなど） |
| `dispose()` | HUD とポートレート用レンダラを解放 |
| `setTouchMode(on)` | スマホのタッチ操作用の表示（`.nx-touch`）：目的・台詞・照準・キー案内からキー名を外す（`player/touchLogic.ts` の `toTouchText`）、操作一覧をタッチ用に、右腕の輪をつかむボタンに、左腕の輪を左上へ小さく、会話ウィンドウを右腕の輪の手前までに収める、コンパスをハートと目的の間に収める |
| `touchTargets` | タッチで押せる部品（`rightArm`＝つかむ、`leftArm`＝左腕を選ぶ）。`game.ts` がタッチ層の `bindButton` でつなぐ |
| `setClawPrompt(label, ready)` | タッチ：右腕の輪の中の言葉（「つかむ」「飛びつく」「離す」など）と、照準が合っているか（輪が黄色） |

表情の優先順：`setPortraitExpression` ＞ 一時的な表情（ダメージ＝心配 2.2 秒、`flash('danger')`＝驚き、`banner` 成功＝笑顔／失敗＝心配）＞ `setPlayerPose` ＞ 右腕を使用中（`setArms` の active / holding）＝必死 ＞ 体力 1 以下＝心配 ＞ 笑顔。

## ポートレートのしくみと費用

- HUD 専用の小さな `WebGLRenderer`（`miniRenderer.ts`、**WebGL コンテキストが 1 つ増える**）。キャンバスそのものを左上の丸い枠に置く。
  ゲーム本体のレンダラ・ポストエフェクトには触らないので、差し替えだけで動く（`new Hud(ui)` のまま）。
- 中身は `createNexmax(1.2)` の主人公そのもの（`autoExpression = false`、待機ポーズ）。カメラは頭の正面やや右上から、待機の首振りに半分だけついていく。まばたき・視線はモデル自身の動き。
- 背中の鉱石は正面から見えないので、鉱石の明るさは水色のリムライトと枠の後ろの光で表す。
- **費用**：1 辺 192px 前後（表示 106px × 画素比、128〜256px に制限）に、ドローコール約 21・三角形約 2.5 万を **20 回/秒**。
  画面に出ていないとき（IntersectionObserver）とタブが裏のときは描かない。起動の邪魔をしないよう、最初の描画はアイドル時（最長 0.9 秒後）に作る。
- 会話でネクマックスが話すときは、同じ絵を 2D キャンバスへ写して顔に使う（追加の 3D 描画なし）。
- 話者アイコン：最初にその話者が話したとき（または `preloadSpeakers`）に `loadCharacter` で GLB を読み、同じキャンバスへ 1 回だけ描いて PNG の data URL にし、すぐポートレートを描き直す（同じ処理の中なので画面には出ない）。読み込んだモデルはすぐ解放。1 人あたり GLB の解析と 1 回の描画（数十 ms、アイドル時）。出来るまでは色付きの人影。
- WebGL が使えない・コンテキストが失われたときは、SVG の顔（`hudFuture.ts` の `NEXMAX_FACE_SVG`）に切り替わる。

## プレビュー

開発サーバで `hud-preview.html` を開く（右の切り替えパネルで状態を切り替えられる）。スクリーンショット用のクエリ：

```
hud-preview.html?ui=0                         既定（コンセプト B と同じ場面：源兵衛の台詞・大歯車の照準・コンパス 32m）
  &spk=源兵衛|おはる|マツイ社長|佐伯|ソラ|ネクマックス|システム|ルート|none
  &claw=light|anchor|mechanism|far|multi|connected|none
  &hold=1  &gate=watch|wait|go|done  &hp=0..5  &energy=0..1|none  &expr=happy|determined|worried|surprised
  &hints=start|ctx|ctx2|talk|hold|none  &heading=度|none  &bearing=度  &dist=m  &spin=1
  &era=1  &pause=1  &menu=1  &toast=1  &banner=success|fail  &flash=danger|success  &ido=1|glitch  &loading=1  &ghost=1
  &bg=1726|2026|none
  &sheet=icons（話者アイコンの一覧）  &sheet=svg（アイコンの一覧）
```

## デザインの言語化（コンセプト B → 実装の基準）

- 全体：1600×900 基準。余白は左右 18〜24px、上 12〜24px。日本語は M PLUS Rounded 1c（800／500）、数字・英字の見出しは Orbitron（実行時に Google Fonts を読み込む。無ければ丸ゴシック）。
- 色（推定）：線 `#3fdcff`／明るい線 `#c4faff`／薄い線 `rgba(96,222,255,.45)`／ガラス `#1767c0→#083274`（不透明度 .70→.82）／文字 `#f6fcff`／黄 `#ffd23f`／ハート `#ff9fb4→#e8325e`。
- 左上：八角形の枠（外に一部だけの細い線、角の明るい線）＋光る輪の中にポートレート（直径 106）。右に体力の帯（286×50、右端が矢印）とエネルギーの帯（306×42）。下に両端のとがった札（高さ 40、文字 19px）。
- 上中央：両端の深くとがったコンパス（590×42、画面幅の 37% まで）。黄色のピンは帯の上、距離はピンの下、中央の ▲ はその下。
- 右上：左のとがったパネル（350〜480 幅、画面幅の 30% まで）。ひし形 44px、題 24px、補足 14.5px（「— 」付き）。
- 下中央：会話ウィンドウ（790×138、四隅を落とす）。顔 100px（A）、名札は文字の頭にそろえて上辺に重ねる、文字 25px・行間 1.62・2 行、右下に ▷。キー案内の札（高さ 42）はウィンドウの右上。
- 左下・右下：円形の枠（166／190）に手・爪のアイコン、白いキー、下に名札。右のほうが明るく太い輪。

### 反映一覧

| 項目（コンセプト・指示） | 状態 | 確かめる場所 |
|---|---|---|
| 左上：本物の 3D のネクマックス（まばたき・表情・鉱石の光）、体力 5、結晶付きエネルギー、時代と場所 | 反映済み | `?ui=0`、`?hp=1`、`?hold=1`（必死の顔） |
| 上中央：コンパス（W/E、目盛り、ピン、距離、▲） | 反映済み | `?ui=0`、`?bearing=140`（範囲外の矢印）、`?spin=1` |
| 右上：目的パネル（ひし形・題・補足） | 反映済み | `?ui=0` |
| 中央：照準（B の十字の丸、種類ごとの形と色、六角の括弧、矢印） | 反映済み | `?claw=light|anchor|mechanism|far|multi|connected` |
| 左下 Q「装備なし」・右下 J「つかむNMClaw」＋つかんでいる物 | 反映済み | `?ui=0`、`?hold=1` |
| 会話ウィンドウ（B）＋話者の顔（A のみ取り入れ）、話者ごとの名札の色 | 反映済み | `?spk=…`、`?sheet=icons` |
| キー案内（状況に応じた札、開始直後だけの一覧） | 反映済み | `?hints=ctx|ctx2|start|talk|hold` |
| お知らせ・大きな文字・ふち光り・水門パネル・読み込み・時代カード・一時停止・メニュー・IDO | 反映済み | `?toast=1` `?banner=…` `?gate=…` `?loading=1` `?era=1` `?pause=1` `?menu=1` `?ido=1` |
| ゲームへの接続 | 保留（指示どおり未接続。上の「差し替え方」） | — |
| B のハート 6 個目（空） | 保留：仕様は体力 5 目盛りなので 5 個 | — |

## 既知の課題

- WebGL コンテキストが 1 つ増える（ポートレート用）。コンテキストの上限に当たったときは SVG の顔になる。
- 話者アイコンの切り出しは人物ごとの数値（`speakerIcons.ts` の `FRAMING`）。モデルを作り直したら `?sheet=icons` で確かめて直す。「ルート」など GLB の無い話者は人影。
- Orbitron は Google Fonts から読む。オフラインでは丸ゴシックで表示（崩れはしない）。
- `word-break: auto-phrase`（文節での折り返し）は Chrome 119 以降。ほかのブラウザでは通常の折り返し。
