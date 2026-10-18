# 近未来ホログラム HUD（HudFuture）

コンセプト画像 **B**（`assets_src/reference/ui/ui_concept_B.png`）の配置に、**A** の「会話ウィンドウ内の話者の顔」を取り入れ、
色と細部は **v2 のホログラム案**（`assets_src/reference/ui/v2/nx_ui_v2_2_holo.png`）に合わせた HUD。
深い紺の半透明ガラス・細く光る線（デザイン 1〜1.5px）・白いハイライトと端の光の点・小さなさし色（2086 はマゼンタ）・
区切りのある角の括弧・小さな技術ラベル・走査線・ふちのにじみ。**立体的な傾き（パース）は付けない**（スマホで操作しにくいため。すべて平ら）。
表示はキーボードの表記だけ（マウス・コントローラーの絵や文字は出さない。操作マニュアル v1.1 §2・§7）。

ゲームにつないである（`src/ui/hud.ts` が `export * from './future/hudFuture'`）。

## 時代ごとのテーマ（`setTheme`）

`hud.setTheme('1726' | '2026' | '2086')`（`game.ts` の `loadStage` で `setEra` の直後に呼ぶ）。呼ばれるまでは **2086**。
ルート要素に `.nx-theme-1726` などのクラスが付き、`hudFuture.css` の CSS 変数（線・ガラス・さし色・模様の色）と模様が切り替わる。

| テーマ | 色 | 模様（`themes.ts`） | 演出 |
|---|---|---|---|
| 2086（既定） | 水色の線＋白のハイライト、マゼンタのさし色、深い紺のガラス | 細かな六角の網 | すべて（斜線のさし色・括弧の四角・端の光の点・上の辺を走る光） |
| 2026 | 青緑の線＋白、落ち着いた紺緑のガラス | うすい方眼 | 控えめ（さし色・括弧の四角・光の点・走る光は出さない） |
| 1726 | 金の線、藍のガラス、朱のさし色（ひし形）。内側の細い線だけ青く光る（ネクマックスの投影） | 麻の葉（パネル）・青海波（会話ウィンドウ・時代カード）・格子（札・帯）・七宝（腕の丸） | 2086 と同じ量。コンパスの N は朱 |

- 模様は SVG の `<pattern>`（`frame.ts` の `frameDefs()`）。枠の上に `.nx-f-pat` の層を重ね、マスクで文字の少ない側（右・右上）ほど濃くする。
  CSS の背景で使う所（時代カード・一時停止の背景・読み込み画面）は `patternDataUri()` の data URI を CSS 変数 `--nx-pat-uri` / `--nx-pat-uri2` で渡す。
- `LoadingOverlayFuture` にも `setTheme` がある。呼ばれなければ `setEra('1726年　…')` の年から自動で決める（ゲームは読み込み画面の `setTheme` を呼んでいないため）。

## 大きさ（一律の拡大縮小）

1600×900 を基準に、**画面の幅・高さの小さいほうに合わせて全体を同じ倍率で拡大縮小**する（上限・下限なし）。
CSS の `--u`（デザイン 1px の画面上の大きさ）を JS がルート要素の大きさから入れ直し（`hudScale(w, h) = min(w/1600, h/900)`）、
枠の SVG・模様・光のにじみ・照準の括弧の大きさも同じ倍率で描き直す。どの画面でも配置の比率が同じで、16:9 でない画面では四隅に寄せる。
線だけは消えないよう下限（約 0.75px）がある。

| 画面 | 倍率 | 会話の文字 | 目的の補足・小さな文字 |
|---|---|---|---|
| 1600×900 | 1.00 | 24px | 14px |
| 1280×720 | 0.80 | 19px | 11px |
| 844×390（スマホ横） | 0.43 | 10.4px | 6px |
| 390×844（スマホ縦） | 0.24 | 5.9px | 3.4px |

## ファイル

| ファイル | 中身 |
|---|---|
| `hudFuture.ts` | `HudFuture`（= `Hud` の代わり）と `LoadingOverlayFuture`（= `LoadingOverlay` の代わり）。`Hud` / `LoadingOverlay` という別名でも export |
| `hudFuture.css` | 見た目。クラスはすべて `.nx-` で始まる（`style.css` とぶつからない）。寸法は 1600×900 基準のデザイン px × `--u`。テーマは `.nx-theme-*` の CSS 変数 |
| `themes.ts` | テーマの名前の決まり（`normalizeTheme` ほか）と和柄などの模様のタイル（DOM なし・テストあり） |
| `hudLogic.ts` | 左腕が無いときの Q の案内の出し分け・一時停止のタブの切り替え（DOM なし・テストあり） |
| `portrait.ts` | 左上の**本物の 3D モデル**のポートレート（`createNexmax` の頭を描く） |
| `miniRenderer.ts` | HUD 専用の小さな WebGL レンダラ（1 つだけ。ポートレートと話者アイコンで共用） |
| `speakerIcons.ts` | 話者アイコン（GLB の人物の顔を 1 回だけ描いて画像にして覚える）と話者ごとの色 |
| `compass.ts` | コンパスの計算（DOM なし・テストあり）と表示部品 `CompassBar` |
| `dialogueBoard.ts` | 会話ウィンドウの中身を決めるロジック・文の切れ目での改行（DOM なし・テストあり） |
| `frame.ts` | ホログラムの枠（角を落としたガラス＋光る線・模様の層・さし色・括弧・技術ラベル）を要素の大きさに合わせて SVG で描く。`hudScale` |
| `icons.ts` | アイコン（インライン SVG） |
| `types.ts` | 型（`hud.ts` と同じ形）と `CONTROL_LIST` |
| `preview.ts` ＋ `web/hud-preview.html` | プレビュー（ゲームの画面写真 `public/dev/hud-bg*.png` の上に重ねて状態を切り替える） |

テスト：`web/tests/hudFutureCompass.test.ts`、`web/tests/hudFutureDialogue.test.ts`、`web/tests/hudFutureTheme.test.ts`（テーマ・一律の拡大縮小・模様・Q の案内・タブ）。

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
| `setEra(text)` | 左上の時代と場所の札。**筆文字（Yuji Boku）は使わない**。見た目のテーマは `setTheme` で別に切り替える |
| `setHp(n)` | ハート 5 個。減ると割れるように光り、ポートレートが揺れて赤く光り、2.2 秒「心配」の顔。1 以下で枠が赤く点滅 |
| `setEnergy(v \| null)` | 結晶アイコン＋4 区切りのゲージ。null で隠す（現行と同じ「必要なときだけ」） |
| `setReticle(s)` | B の照準（十字の入った丸）。種類ごとの形と色：軽い物＝十字の丸・橙、固定支点＝ひし形・水色、協力装置＝歯車・緑（色は現行と同じ）。左右に六角の括弧（対象の大きさ）、下に小さな矢印、名前の札。新しい対象に吸い付くとぱっと縮む。つないでいる間は脈打つ |
| `setHints(list)` | 1〜3 個は B の「[J] で つかむ」形の札（会話中は会話ウィンドウの右上へ移動）。4 個以上（開始直後の一覧）は小さな札を 1 列。**`{ key, label: '次へ' }` は会話ウィンドウの ▷ の横に出す** |
| `say(speaker, text, seconds)` | 現行は最大 3 行の吹き出しの積み重ね。新しい HUD は**大きな会話ウィンドウ 1 つ**（話者の顔・名札・2 行・▷）。表示中に別の台詞が来たら、前の台詞は上に小さく残す（最大 3.2 秒）。長い台詞は文の切れ目（。！？）で改行し、さらに長いと文字を小さく |
| `toast(text, s)` | 上中央（コンパスの下）の小さな札 |
| `banner(text, kind, s)` / `flash(kind)` | ホログラムの帯の大きな文字／画面のふちの光。成功は水色、失敗は赤 |
| `setArms(a)` / `pulseArm(side)` | 右下 J の円形の枠。つかんでいる物は右腕の上に黄色の札。射出中は点線の輪が回る。**左下 Q の枠は `a.left.name` があるときだけ出す**（装備なしの間は出さない。キー案内の Q も出さない）。一時停止の「装備」も同じデータで更新 |
| `setGate(g \| null)` | 右上（目的の下）。源兵衛・おはるの顔、10 区切りの進み具合、おはるの合図のランプ |
| `setPaused` / `setMenu` | **1 つのパネルに「装備・記録」「操作一覧」の 2 つのタブ**。← → で切り替え（パネルが出ている間だけ HUD が keydown を聞く）。開いたときは「装備・記録」。`setMenu`（Tab）も同じパネルを開く（題が「装備・記録」、閉じるキーが Tab）。装備は見るだけ（付け替えは異次元拠点の装備台） |
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
| `setTheme(key)` / `currentTheme` | 時代ごとの見た目（'1726' / '2026' / '2086'。年を含む文も可）。既定 2086 |
| `setCompassHeading(deg \| null, target, from)` | 方位（度、北 0・東 90）で直接指定する版 |
| `setPlayerPose(pose)` | ポーズから表情：`hold` `pulled` `swing` `crank` → 必死、`fall` → 驚き |
| `setPortraitExpression(e \| null)` | 表情を固定（`happy` `determined` `worried` `surprised`）。null で自動 |
| `setOreGlow(v)` | 鉱石の光の強さ（ポートレートの水色の縁の光と後ろの光） |
| `preloadSpeakers(names)` | 話者アイコンを先に作る |
| `setSpeakerIcon(name, url)` | 顔の画像を外から渡す（イラストなど） |
| `dispose()` | HUD とポートレート用レンダラを解放 |

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
  &bg=1726|2026|none  &theme=1726|2026|2086（既定は背景に合わせる）  &left=1（左腕に装備あり）  &tab=controls（pause=1 と一緒に）
  &sheet=icons（話者アイコンの一覧）  &sheet=svg（アイコンの一覧）
```

## デザインの言語化（コンセプト B → 実装の基準）

- 全体：1600×900 基準。余白は左右 18〜24px、上 12〜24px。日本語は角の立ったゴシック **M PLUS 1p**（700／500）、数字・英字の見出しとキーの英字は Orbitron（500／700）。実行時に Google Fonts を読み込む（無ければヒラギノ角ゴ）。
- 色（2086）：線 `#5ee6ff`／白いハイライト `#effdff`／薄い線 `rgba(104,222,255,.42)`／さし色 `#ff4fd8`／ガラス `rgba(16,60,140,.64)→rgba(3,16,54,.80)`／文字 `#f3fbff`／黄 `#ffd23f`／ハート `#ffc2d6→#e3266a`。2026・1726 は `hudFuture.css` の `.nx-theme-*`。
- 線：枠の線 1.25px、内側の線 0.75px（青白い）、角の白いハイライト 2.2px＋端の光の点、外側の一部だけの細い線（上の右寄り・下の左寄り。その上を光る短い区間）、区切りのある角の括弧、右下の小さな目盛りと技術ラベル（飾り）。光のにじみは 2 段のぼかし（SVG フィルター。静止しているので毎フレームの負担はない）。
- 左上：丸いガラスに光る輪（1.6px）・目盛りの輪・外側の弧（ところどころさし色）。ポートレートは直径 103。右に体力の帯（292×46、右端が矢印）とエネルギーの帯（296×36）。下に両端のとがった札（高さ 38、文字 18px）。帯の上に技術ラベルとバーコード（飾り）。
- 上中央：両端の深くとがったコンパス（600×40）。黄色のピンは帯の上、距離はピンの下（下に細い楕円の輪）、中央の ▲ はその下。
- 右上：左のとがったパネル（360〜480 幅）。ひし形 40px、題 23px、細い光る区切り線、補足 14px。
- 下中央：会話ウィンドウ（808×128、四隅を落とす）。左に話者の顔の枠（140×140、角を落とした四角・話者の色の線）をはみ出して置く。名札（高さ 34）は上辺に重ね、右端にさし色の斜線。右上に小さな音声の波形（話している間ゆれる）。文字 24px・行間 1.6・2 行、右下に ▷。キー案内の札（高さ 38）はウィンドウの右上。
- キー：暗いガラスのキーに細い光る縁と白い文字（白いふくらんだキーはやめた）。1 文字は M PLUS 1p、Space などは Orbitron。
- 左下・右下：円形の枠（168／186）に細い輪・目盛り・外側の弧、手・爪のアイコン、キー、下に名札と技術ラベル。左下は左腕に装備があるときだけ。
- 一時停止：大きなパネル（980 幅）。上にタブ「装備・記録」「操作一覧」と ← →、下に「← → 切り替え」と閉じるキー。背景は暗くして模様を薄く（ぼかしは使わない）。

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
| ゲームへの接続 | 反映済み（`src/ui/hud.ts`） | — |
| v2：ホログラム案（nx_ui_v2_2_holo）の色・線・細部、立体の傾きなし | 反映済み | `?theme=2086` |
| v2：時代ごとのテーマ（2086／2026／1726 の和柄） | 反映済み | `?theme=…`、ゲームの `?stage=…` |
| v2：どの画面でも同じ比率（一律の拡大縮小） | 反映済み | 画面の大きさを変える |
| v2：左腕の枠は装備があるときだけ | 反映済み | `?left=1` |
| v2：一時停止に装備・記録（タブ） | 反映済み | `?pause=1`、`?pause=1&tab=controls`、`?menu=1` |
| B のハート 6 個目（空） | 保留：仕様は体力 5 目盛りなので 5 個 | — |

## 既知の課題

- WebGL コンテキストが 1 つ増える（ポートレート用）。コンテキストの上限に当たったときは SVG の顔になる。
- 話者アイコンの切り出しは人物ごとの数値（`speakerIcons.ts` の `FRAMING`）。モデルを作り直したら `?sheet=icons` で確かめて直す。「ルート」など GLB の無い話者は人影。
- M PLUS 1p と Orbitron は Google Fonts から読む。オフラインではヒラギノ角ゴなどで表示（崩れはしない）。
- スマホ縦（390×844）では一律の縮小のため文字がとても小さい（会話 5.9px）。一時停止・IDO のパネルも同じ倍率なので、スマホでは読みにくい。
- `word-break: auto-phrase`（文節での折り返し）は Chrome 119 以降。ほかのブラウザでは通常の折り返し。
