// public/textures/<name>/{diff,arm,nor}_1k.jpg → 同じフォルダの .ktx2（GPU のまま縮んだ形式。ミップマップ入り）
// diff（色）：ETC1S・sRGB　arm（AO・粗さ・金属）：ETC1S・リニア　nor（法線）：UASTC＋RDO＋Zstd・法線用（ETC1S は法線がくずれる）
// 上下は JPG（TextureLoader の flipY=true）と同じ向きになるように、さかさに入れる（KTX2 は読むときに上下を返せない）
// 使い方：node encode.mjs <public/textures のパス> [名前...]
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { encodeToKTX2 } from 'ktx2-encoder'

const root = process.argv[2]
const only = process.argv.slice(3)
const decode = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height }
}
const KINDS = {
  diff: { isUASTC: false, qualityLevel: 230, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
  arm: { isUASTC: false, qualityLevel: 230, isSetKTX2SRGBTransferFunc: false, isPerceptual: false },
  nor: { isUASTC: true, uastcLDRQualityLevel: 1, needSupercompression: true, enableRDO: true, rdoQualityLevel: 2, isNormalMap: true, isSetKTX2SRGBTransferFunc: false, isPerceptual: false },
}
let jpg = 0
let ktx = 0
for (const name of fs.readdirSync(root).sort()) {
  const dir = path.join(root, name)
  if (!fs.statSync(dir).isDirectory() || (only.length && !only.includes(name))) continue
  for (const [kind, opt] of Object.entries(KINDS)) {
    const src = path.join(dir, `${kind}_1k.jpg`)
    if (!fs.existsSync(src)) continue
    const t0 = Date.now()
    const out = await encodeToKTX2(new Uint8Array(fs.readFileSync(src)), { ...opt, generateMipmap: true, isYFlip: true, imageDecoder: decode })
    fs.writeFileSync(path.join(dir, `${kind}_1k.ktx2`), out)
    jpg += fs.statSync(src).size
    ktx += out.byteLength
    console.log(`${name}/${kind}: jpg ${(fs.statSync(src).size / 1024) | 0}KB → ktx2 ${(out.byteLength / 1024) | 0}KB (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }
}
console.log(`合計 jpg ${(jpg / 1048576).toFixed(2)}MB → ktx2 ${(ktx / 1048576).toFixed(2)}MB`)
