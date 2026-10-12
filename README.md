# NEXMAX CHRONICLE ― はじまりの未来 ―

> **過去で手を加え、別の時代でその結果を見つけ、NMClawと仲間の知恵で未来の道を自ら開く。**

3つの時代（1726年・2026年・2086年）を行き来する3人称3Dアクションの **序章・縦型試作** です。
2026年の街に置かれたIDO標識を手がかりに過去へ向かい、NMClawで「つかむ・保持する・離す」を使い、
源兵衛やおはるといった仲間と一緒に水門を直す。その結果が2026年の記録と2086年の街の地形に現れます。

## 遊ぶ

**https://tomy1031.github.io/nexmax_chronicle/**

- PCのブラウザで動きます（キーボードとマウスが必要）。スマホ・タブレットのタッチ操作には未対応です。
- 進行は自動保存され、ブラウザのIndexedDBに残ります（サイトデータを消すとセーブも消えます）。

## 序章に入っているもの

| 順 | 時代・場所 | 内容 |
|---|---|---|
| 1 | 2086年 ナンバタウン | 都市管理AI「ルート」が通路を閉鎖。閉じていく道から脱出する |
| 2 | 2026年 なんば | マツイ社長と出会い、水路沿いのIDO標識を調べて過去への手がかりを得る |
| 3 | 1726年 仕掛け横丁 | 源兵衛・おはると出会い、NMClawで外れた大歯車を戻し、**からくり水門**の協力パズルを解く |
| 4 | 2026年 なんば | 旧水門跡の記録が変わっていることを確かめる（過去の行動の結果） |
| 5 | 異次元拠点 | 回復と最後のチェックポイント。2086年への扉 |
| 6 | 2086年 ナンバタウン | 開いた新しい保守路でソラと会い、警備ロボを停止させる |

水門のパズルは「操作しなければ進まないが、仲間がいないと成功しない」が狙いです。
源兵衛が歯止めを調整する間は歯車を保持し続け、おはるの合図（舟が来ているか）を見て離します。
早く離すと調整が戻り、人がいるときに離すと失敗します。

## 操作

| 操作 | キー・マウス |
|---|---|
| 移動 | `W` `A` `S` `D`（矢印キーも可） |
| 視点 | マウス |
| ジャンプ | `Space` |
| ダッシュ | `Shift` |
| 調べる・話す・IDO | `F` |
| NMClawを構える | 右クリック長押し、または `Q` 長押し |
| つかむ／離す | 構えている間に 左クリック、または `E`（つかんだら、もう一度クリックするまで保持） |
| 攻撃 | 構えていないときに 左クリック |
| 会話を進める | `Space` / `Enter` / `F` / 左クリック |
| ポーズ | `Esc`（`P` も可） |
| 計測表示（FPS・メモリ・フラグ） | `F3` |

ブラウザでは `Esc` でマウスのロックが外れ、ポーズが開きます。

## ローカルで動かす

[Godot 4.7.2](https://godotengine.org/download/) （標準版、.NET不要）を使います。

```bash
# エディタで開く
godot --path . --editor

# そのまま実行
godot --path .
```

初回はエディタで開くか、`godot --headless --path . --import` でインポートしてください。

## テスト

```bash
# ユニットテスト（NMClawの状態機械・水門パズル・TimelineStateのセーブ/ロード）
godot --headless --path . -s res://tests/run_tests.gd

# スモークテスト（全スクリプトの読み込みと各シーンの実行）。最後に "SMOKE OK" が出れば合格
godot --headless --path . res://tests/SmokeTest.tscn
```

- ユニットテストは合格で終了コード 0、失敗で 1。各テストに `PASS` / `FAIL` が出ます。
- どちらも出力に `SCRIPT ERROR` が無いことを確認してください（CIでも見ています）。

## デプロイ

`main` へ push すると GitHub Actions（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）が動きます。

1. Godot 4.7.2 とWeb用テンプレート（シングルスレッド版）を取得
2. プロジェクトを取り込み、ユニットテストとスモークテストを実行
3. `godot --headless --path . --export-release "Web" build/web/index.html`
4. GitHub Pages へ公開

リポジトリの Settings → Pages → Source を **GitHub Actions** にしておく必要があります。
手元で書き出すときは、エディタにWeb用の書き出しテンプレートを入れたうえで、上の3のコマンドを実行します。

## プロジェクト構成

```text
nexmax_chronicle/
├── project.godot
├── export_presets.cfg      Web書き出し設定（シングルスレッド）
├── scenes/                 シーン（ui / eras / hub / prototype / shared）
├── scripts/
│   ├── autoload/           Game（入力・ポーズ）, Sfx（効果音・BGMの合成）
│   ├── systems/            ロジック（NMClaw, 水門パズル, TimelineState, セーブ, 時空移動, クエスト）
│   ├── player/ npc/ enemy/ 操作キャラ、NPC、警備ロボ
│   ├── eras/               各時代・拠点のシーン構築
│   ├── world/              ステージ部品（ゲート, ソケット, クリスタル, ポータル など）
│   └── ui/                 HUD・タイトル
├── data/dialogues/         セリフ（JSON）
├── assets/fonts/           Noto Sans JP とそのライセンス
├── tests/                  ユニットテスト・スモークテスト
├── docs/                   企画仕様書・コンセプト画像（ゲームには含まれない）
└── .github/workflows/      Pagesへの自動公開
```

## ドキュメント

- [ゲームシステム仕様書 v0.6](docs/NEXMAX_CHRONICLE_ゲームシステム仕様書_v0.6.md)（[docx版](docs/NEXMAX_CHRONICLE_ゲームシステム仕様書_v0.6.docx)）
- [試作タスク定義 P1〜P4](docs/NEXMAX_CHRONICLE_試作タスク定義_P1-P4.md)（[docx版](docs/NEXMAX_CHRONICLE_試作タスク定義_P1-P4.docx)）
- [コンセプト画像（プレイイメージ全10枚）](docs/NEXMAX_CHRONICLE_プレイイメージ10枚/) と [画像一覧](docs/NEXMAX_CHRONICLE_プレイイメージ10枚/画像一覧.txt)
  - 企画用のイメージです。実際のゲーム画面や実装済みの機能を示すものではありません。

## 技術メモ

- Godot 4.7.2 / GDScript / **Compatibility** レンダラー（Web書き出し対応。M1 Mac 8GBでの動作を目標）
- Web書き出しは **シングルスレッド版**（`variant/thread_support=false`）。GitHub PagesはCOOP/COEPヘッダーを送れないため
- キャラクター・背景のモデルはすべてコードでプリミティブ（箱・球・円柱など）から組み立てています。外部の3Dモデルやテクスチャ画像は使っていません
- 効果音とBGMはコードで合成しています（外部の音声ファイルなし）
- 状態フラグ（`gate_repaired` / `genbei_drawing_found` / `drawing_confirmed` ほか）は `TimelineState` に集約。
  `future_route_open` は保存せず `drawing_confirmed` から算出します
- 作業の優先順位は、まず「つかむ・離す」の手触り。物理で自由に運ばず、レールや設置位置への補間移動にしています

## ご注意

- これは **企画試作版** です。検証が完了した製品ではなく、仕様も変わります。
- **IDO** と **NMClaw** はゲーム内の独自設定です。実在のIDOに時空移動の機能はありません。
- 1726年にQRコードは存在しません。過去ではネクマックスの装置に記録された帰還先の座標を使います。
- 「仕掛け横丁」「源兵衛」「おはる」「からくり水門」は創作です。
- マツイ社長の氏名・セリフ・容姿は、本人の許諾のもとで使用しています。セリフは実在人物の実際の発言ではありません。

## クレジット・ライセンス

- フォント: **Noto Sans JP** — [SIL Open Font License 1.1](assets/fonts/OFL.txt)
- ゲームエンジン: [Godot Engine](https://godotengine.org/license/)（MIT License）
- ソースコードと企画資料のライセンスは、現時点では設定していません。
