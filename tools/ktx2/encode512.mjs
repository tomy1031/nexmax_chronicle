// 標準・省電力の法線：nor_1k.jpg を 512 に縮めてから UASTC＋RDO＋Zstd（nor_512.ktx2）。高画質は nor_1k.ktx2
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { encodeToKTX2 } from 'ktx2-encoder'
const root = process.argv[2]
const decode = async (buf) => { const { data, info } = await sharp(buf).resize(512, 512, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height } }
let a = 0
for (const name of fs.readdirSync(root).sort()) {
  const src = path.join(root, name, 'nor_1k.jpg')
  if (!fs.existsSync(src)) continue
  const out = await encodeToKTX2(new Uint8Array(fs.readFileSync(src)), { isUASTC: true, uastcLDRQualityLevel: 1, needSupercompression: true, enableRDO: true, rdoQualityLevel: 2, isNormalMap: true, isSetKTX2SRGBTransferFunc: false, isPerceptual: false, generateMipmap: true, isYFlip: true, imageDecoder: decode })
  fs.writeFileSync(path.join(root, name, 'nor_512.ktx2'), out)
  a += out.byteLength
  console.log(`${name}: ${(out.byteLength / 1024) | 0}KB`)
}
console.log(`合計 ${(a / 1048576).toFixed(2)}MB`)
