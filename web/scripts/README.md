# 3D モデル変換パイプライン（Tripo の生 GLB → Web 用 GLB）

Tripo AI（画像→3D）からダウンロードした重い GLB を、three.js 版ゲームで使える軽量 GLB に変換します。
実行は `web/` ディレクトリで行います（初回のみ `npm ci`）。

```
assets_src/tripo/<name>.glb  (git 管理外・生データ)
        │  npm run models:all
        ▼
web/public/models/<name>.glb  (ゲームが ./models/<name>.glb で読み込む)
```

## 最短手順

1. Tripo から GLB をダウンロードし、`assets_src/tripo/` に **`models.json` の name どおりのファイル名**で置く  
   例: `nexmax.glb` `genbei.glb` `oharu.glb` `matsui.glb` `sora.glb` `gear.glb` `machiya.glb` `watergate.glb`
2. 中身を確認（任意）  
   `cd web && npm run models:inspect -- ../assets_src/tripo/nexmax.glb`
3. 一括変換（無いファイルはスキップ）  
   `npm run models:all`  
   一部だけなら `npm run models:all -- --only nexmax,genbei`
4. 出力は `web/public/models/<name>.glb`。ゲームで読み込んで **向きを目視確認**（下の「向き」参照）
5. 向きや見た目が違えば、`web/scripts/models.json` の該当エントリ（`face` など）を直して再実行

## 出力の仕様（ゲーム側ローダが前提にしてよいこと）

| 項目 | 内容 |
|---|---|
| 座標系 | three.js / glTF と同じ Y-up、右手系。単位はメートル |
| 原点 | 足元（BBox の最下点）が `y=0`、X/Z は BBox の中央が `0`。`pivot: "center"` なら BBox 中心が原点 |
| 向き | 正面が **-Z** |
| 大きさ | BBox の Y 幅が `--height`（models.json の `height`）になる等倍スケール |
| テクスチャ | 最大 1024px の WebP（`EXT_texture_webp`）。法線/ORM は品質を少し高めに |
| ジオメトリ | 三角形数は `tris` 以下。meshopt 圧縮 + 頂点量子化（`EXT_meshopt_compression`, `KHR_mesh_quantization`） |
| スキン/アニメ | 既定では無し（静的メッシュ）。`--keep-anim` / `keepAnim: true` のときだけ骨格とクリップを保持 |

### ローダ側の要件（重要）

出力は既定で meshopt 圧縮されているので、**GLTFLoader に MeshoptDecoder を渡す必要があります**。

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('./models/nexmax.glb', (gltf) => scene.add(gltf.scene));
```

`EXT_texture_webp` と `KHR_mesh_quantization` は GLTFLoader が標準で処理します（追加設定不要）。
ローダ側の対応が間に合わない間は `--no-meshopt`（models.json なら `"meshopt": false`）で出力すれば
デコーダ不要になります（その分ファイルは大きくなり、量子化もされません）。

## コマンド

### `npm run models:process -- <in.glb> [out.glb] --height <m> [options]`
1 ファイルを変換します。`out.glb` を省略すると `public/models/<入力名>.glb`。

| オプション | 既定 | 説明 |
|---|---|---|
| `--height <m>` | 必須 | 最終的な高さ（BBox の Y 幅）。ギアのような円形物は直径を指定 |
| `--tris <n>` | 20000 | 三角形数の上限。`0` で削減しない。元が少なければ何もしない |
| `--texture <px>` | 1024 | テクスチャ最大辺。大きいものだけ縮小（拡大はしない）。`0` で縮小しない |
| `--face <dir>` | `+z` | **元モデルが正面を向けている方向** `+z｜-z｜+x｜-x｜auto`。出力は常に -Z 向きになる |
| `--yaw <deg>` | 0 | `--face` の後、さらに Y 軸まわりに回す角度（微調整用） |
| `--pivot <p>` | `bottom` | `bottom`＝足元が y=0 / `center`＝BBox 中心が y=0 |
| `--keep-anim` | off | 骨格（スキン）とアニメーションクリップを保持 |
| `--join` | off | 静的モデルの複数メッシュを同一マテリアルで結合（ドローコール削減） |
| `--no-simplify` | | 三角形削減をしない |
| `--no-meshopt` | | meshopt 圧縮・量子化をしない（MeshoptDecoder 不要になる） |
| `--no-webp` | | WebP にせず PNG/JPEG のまま（縮小は行う） |
| `--quality <1-100>` | 85 | WebP 品質（法線/ORM は +7） |
| `--verbose` | | gltf-transform の内部ログも表示 |

処理の最後に **[check]** として 原点 / 高さ / 三角形数 / テクスチャ上限 を書き出したファイルを読み直して検査し、
`OK`/`NG` を表示します。`NG` が出たら内容を確認してください。

### `npm run models:inspect -- <file.glb> [more.glb ...] [--json]`
メッシュ・三角形/頂点数・マテリアル・テクスチャ（サイズ/形式/用途）・スキン・アニメ・BBox・
正面の推定（弱いヒント）を表示します。生データでも出力でも使えます。

### `npm run models:all [-- --only a,b] [--list] [--dry-run]`
`scripts/models.json` に従い `assets_src/tripo/` の生 GLB を全部変換します（大文字小文字は無視）。
`--list` で「入力の有無 / 出力の有無」と「未登録の GLB」を表示。末尾に結果の一覧表が出ます。

### `npm run models:selftest [-- <workDir>]`
合成モデル（高ポリ球＋箱のキャラ、スキン＋アニメ付き、複数メッシュ）を作って全オプションを検証します。
`gltf-transform validate` と、実際の three.js `GLTFLoader` + `MeshoptDecoder`（Node 上）での読み込み確認も行います。
実ファイルが無くても動作確認できます。生成物は一時ディレクトリのみで、`public/models` には書きません。

## models.json

```jsonc
{
  "inputDir": "../assets_src/tripo",     // web/ からの相対
  "outputDir": "public/models",
  "defaults": { "texture": 1024, "face": "+z", "pivot": "bottom", "keepAnim": false, "meshopt": true, "webp": true },
  "models": [
    { "name": "nexmax", "height": 1.2, "tris": 25000, "notes": "メモ" }
    // 上書きできるキー: height tris texture face yaw pivot keepAnim join meshopt webp quality simplify
    // source: 入力ファイル名の別名（"source": "tripo_model_123" → tripo_model_123.glb を読む）
  ]
}
```

登録済み: nexmax 1.2m/25k, genbei 1.6m/20k, oharu 1.25m/18k, matsui 1.7m/20k, sora 1.3m/20k,
gear 2.8m/12k（直径）, machiya 6m/25k, watergate 7m/20k。

## 向き（正面）の決め方

Tripo の GLB は多くの場合「正面が +Z」ですが、保証はありません。ゲーム側は **-Z が正面**を前提にしているので、
`--face` に「元ファイルで正面がどっちを向いているか」を指定します。

1. 迷ったら一度 `--face +z` のまま変換してゲームで確認し、背中を向いていたら `--face -z`、横なら `+x`/`-x` に変える
2. `--face auto` は足元スライスの突き出し（つま先は前に長い）で推定する簡易版。人型専用で、外れることもある
3. 少しだけ回したいときは `--yaw 15` のように併用

`inspect-model` の「正面の推定」も同じ方式の弱いヒントです。建物・歯車など人型でないものは判定不能になります。

## 三角形削減とスキンメッシュの扱い

- meshoptimizer の簡略化（辺コラプス）を使い、**UV と法線を誤差に含めて**テクスチャのにじみや陰影の崩れを抑えます。
  複数メッシュ/プリミティブがある場合は三角形数の比率で配分します。
- 目標に届かない場合は自動で `Permissive`（UV シームをまたぐ縮退を許可）→ `sloppy`（粗い方式）の順に切り替え、
  使った方式をログに出します。`sloppy` が出たら UV/形状を目視で確認してください。
- 最大の幾何誤差（高さに対する %）も表示します。2% を超えると警告します（Tripo 側で面数を絞って再生成する方が綺麗です）。
- **頂点位置は動かさず index だけ間引く方式**なので、スキンメッシュ（`--keep-anim`）でも JOINTS/WEIGHTS はそのまま有効です。
  ウェイトも誤差に含めますが、関節まわりの変形品質はやや落ちることがあります。気になるときは `--no-simplify` か
  `--tris` を増やしてください。
- `--keep-anim` なし（既定）でスキン付きGLBを渡すと、**レストポーズのまま静的メッシュに焼き込んで**スキンとクリップを削除します。
- `--keep-anim` ありの場合、向き/原点/スケールは頂点ではなくルートノード `ModelRoot` に適用します（骨格を壊さないため）。
  BBox は CPU スキニングでレストポーズから計算しています。
- モーフターゲット（ブレンドシェイプ）は `--keep-anim` なしでは削除します。

## 既知の制限

- Y-up 前提です（Tripo は Y-up）。Z-up のファイルは高さが誤計算されるため、先に Blender 等で直してください。
- 高さは BBox の Y 幅（ポーズ込み）です。腕を上げたポーズだと「頭の高さ」ではなく「手の高さ」になります。
- テクスチャは WebP の非可逆圧縮です。ノーマルマップは品質を高めにしていますが、ギリギリの質感が必要なら `--quality 92`。
- KTX2/Basis や Draco 圧縮には対応していません（入力が Draco/meshopt 圧縮済みなら読み込みだけはできます）。
- 接線（TANGENT）は生成しません。法線マップは three.js が導関数ベースで処理します。
- 自己テストは合成モデルでの検証です。実際の Tripo ファイルでは、まず 1 体を `--verbose` なしで通し、
  `[check]` と見た目を確認してから `models:all` に進むのが安全です。

## Tripo 側の書き出し設定のおすすめ

- **形式は GLB**（FBX/OBJ ではなく）。テクスチャが埋め込まれて 1 ファイルになり、このパイプラインの入力形式そのままです。
- **テクスチャサイズは標準（2048 前後）で十分**。最終的に 1024 に縮小するので 4096 は処理が重くなるだけです。
- **PBR（法線/メタルネス）は必要なものだけ**。ベースカラーのみなら最終テクスチャは 1 枚（約 100KB）、PBR 付きだと 3 枚になります。
  ゲームの絵柄がアニメ調/絵本調なら、ベースカラーのみで軽く済ませるのが相性良好です。
- **面数上限（face limit）や低ポリ指定が Tripo 側にあれば、20k〜30k 程度を指定して生成**すると、
  こちらの自動削減より UV・シルエットが綺麗に保たれます（その場合パイプラインはほぼ何も削らず通ります）。
  GLB は三角形しか持てないので、クアッド出力にしても GLB では利点がありません。
- **リグ付き**: 骨でアニメさせたいキャラだけ、リグ/アニメ付きで GLB を書き出して `--keep-anim`（models.json は `"keepAnim": true`）。
  プログラム的な動き（揺れ・拡縮など）だけで済むなら、**リグなしの静的 GLB** にした方が軽くて扱いやすいです。
  リグ予定のキャラは、元の生成時に **T ポーズ / A ポーズ**で出すと腕のめり込みが減ります。
- ポーズは直立・足を閉じすぎない・マント/長いスカートは広がり過ぎないものが、足元合わせ・高さ合わせで安定します。
- 同じ登場人物のモデルは **同じ向き**（正面 +Z）で出力されるよう、入力画像の向きを揃えておくと `face` の指定が不要になります。

## ファイル構成

```
web/scripts/
  process-model.mjs   1 ファイル変換 CLI
  process-all.mjs     models.json に従う一括変換
  inspect-model.mjs   GLB の中身表示
  models.json         変換定義（name / height / tris / notes ...）
  lib/                パイプライン本体（pipeline.mjs）・統計・ジオメトリ計測など
  selftest/           合成モデル生成・自己テスト・three.js ロード確認
```
