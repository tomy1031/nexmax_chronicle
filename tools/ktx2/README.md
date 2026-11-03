# 写真のテクスチャを KTX2 にする

`web/public/textures/<名前>/{diff,arm,nor}_1k.jpg` から、同じフォルダに `*_1k.ktx2` と `nor_512.ktx2` を作る（ゲームは KTX2 を先に読み、だめなら JPG。`web/src/render/pbrTextures.ts`）。

```sh
cd tools/ktx2
npm init -y && npm install ktx2-encoder@0.6.0 sharp
node encode.mjs ../../web/public/textures       # diff・arm（ETC1S）・nor（UASTC）の 1k
node encode512.mjs ../../web/public/textures    # 標準・省電力の法線（UASTC 512）
```

新しいテクスチャの組を足したら、両方を流す（`web/tests/pbrKtx2Files.test.ts` が、そろっているか確かめる）。
