# Blender の顔の修正スクリプト

Tripo の生モデル（`assets_src/tripo/<name>.glb`）の、口を開けた顔を「口を閉じたやさしい笑顔」に直す。
直したモデルは `assets_src/tripo_fixed/<name>.glb` に書き出し、`web/scripts/process-model.mjs` で `web/public/models/` へ変換する。

```bash
# 直す（smile_scale と line_scale は省略可。ソラは線を少し濃く 1.0 1.2）
blender -b -P assets_src/blender/fix_mouth.py -- assets_src/tripo/sora.glb assets_src/tripo_fixed/sora.glb /tmp/sora 1.0 1.2
# 確認用に正面・斜め・全身を撮る
blender -b -P assets_src/blender/render_faces.py -- assets_src/tripo_fixed/sora.glb /tmp/sora_fixed
# ゲーム用に変換
cd web && node scripts/process-model.mjs ../assets_src/tripo_fixed/sora.glb public/models/sora.glb --height 1.55 --tris 20000
```

やっていること：
1. 正面から光線を当ててテクスチャの色を読み、唇・口の中の赤い部分（顔の中心線をまたぐ横長のかたまり）を口として見つける。
2. 口のまわりの頬から、なめらかな面（2 次曲面）を当てはめる。
3. 唇・歯・口の中の頂点を、その面より少しだけ奥へ押し込む（穴はあけないので、ゲームの輪郭線が乱れない）。
4. 面の上に薄い「顔の当て布」（円板のメッシュ）を貼る。テクスチャの空いている四角に、正面から見た顔の絵を描いて当て布の UV をそこへ向ける。
   顔の絵は、口の部分をまわりの肌から滑らかに埋め（調和補間）、口角の上がった細い笑みの線を描いたもの。
5. 当て布と、そのまわりの法線を当てはめた面の向きにそろえて、ふちに陰影の輪が出ないようにする。
