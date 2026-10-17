#!/usr/bin/env node
// Tripo の生 GLB → Web 用 GLB。
//   node scripts/process-model.mjs <in.glb> [out.glb] --height <meters> [options]
// 詳細は scripts/README.md

import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, processModel } from './lib/pipeline.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `使い方:
  node scripts/process-model.mjs <in.glb> [out.glb] --height <meters> [options]

必須:
  --height <m>        最終的なモデルの高さ（メートル。BBox の Y 幅）
引数:
  out.glb             省略時は public/models/<入力ファイル名>.glb

オプション:
  --tris <n>          目標三角形数の上限（既定 ${DEFAULTS.tris}。0 で削減しない）
  --texture <px>      テクスチャ最大辺（既定 ${DEFAULTS.texture}。0 で縮小しない）。大きい場合のみ縮小
  --face <dir>        元モデルが「正面を向けている方向」: +z | -z | +x | -x | auto（既定 ${DEFAULTS.face}）
                      出力は常に -Z を向くよう回転する。auto は足元の形からの簡易推定
  --yaw <deg>         --face の後にさらに Y 軸まわりへ回す角度（既定 0）
  --pivot <p>         bottom（足元が y=0、既定）| center（BBox 中心が y=0。ギア等向け）
  --keep-anim         スキン(骨)とアニメーションクリップを保持（既定は削除してレストポーズの静的メッシュに）
  --join              静的モデルのメッシュ/プリミティブを同一マテリアルで結合してドローコール削減
  --no-simplify       三角形削減をしない
  --meshopt           EXT_meshopt_compression + 頂点量子化を行う（既定 ON。ローダに MeshoptDecoder が必要）
  --no-meshopt        上記をしない（ローダに MeshoptDecoder 不要になる。ファイルは大きくなる）
  --no-webp           テクスチャを WebP にせず元の形式(PNG/JPEG)のまま（縮小は行う）
  --quality <1-100>   WebP 品質（既定 ${DEFAULTS.quality}。法線/ORM は +7）
  --verbose           gltf-transform のログも表示
  -h, --help          このヘルプ

例:
  node scripts/process-model.mjs ../assets_src/tripo/nexmax.glb public/models/nexmax.glb --height 1.2 --tris 25000
  node scripts/process-model.mjs ../assets_src/tripo/gear.glb --height 2.8 --tris 12000 --pivot center`;

// `--face -z` / `--yaw -15` のように値が '-' で始まるとき、parseArgs がフラグと誤認するので `--opt=value` に正規化する
const VALUE_OPTIONS = new Set(['--height', '--tris', '--texture', '--face', '--yaw', '--pivot', '--quality']);
function normalizeArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (VALUE_OPTIONS.has(a) && next !== undefined && !next.startsWith('--')) {
      out.push(`${a}=${next}`);
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: normalizeArgv(process.argv.slice(2)),
      allowPositionals: true,
      options: {
        height: { type: 'string' },
        tris: { type: 'string' },
        texture: { type: 'string' },
        face: { type: 'string' },
        yaw: { type: 'string' },
        pivot: { type: 'string' },
        quality: { type: 'string' },
        'keep-anim': { type: 'boolean' },
        join: { type: 'boolean' },
        'no-simplify': { type: 'boolean' },
        meshopt: { type: 'boolean' },
        'no-meshopt': { type: 'boolean' },
        'no-webp': { type: 'boolean' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    console.error(`引数エラー: ${e.message}\n\n${USAGE}`);
    process.exit(2);
  }
  const { values: v, positionals } = parsed;
  if (v.help || positionals.length === 0) {
    console.log(USAGE);
    process.exit(v.help ? 0 : 2);
  }
  const num = (name, x) => {
    const n = Number(x);
    if (!Number.isFinite(n)) {
      console.error(`--${name} は数値で指定してください (指定: ${x})`);
      process.exit(2);
    }
    return n;
  };
  if (v.height === undefined) {
    console.error(`--height <meters> は必須です\n\n${USAGE}`);
    process.exit(2);
  }
  const input = path.resolve(positionals[0]);
  const output = positionals[1]
    ? path.resolve(positionals[1])
    : path.join(webRoot, 'public', 'models', `${path.basename(input, path.extname(input))}.glb`);

  const opts = { height: num('height', v.height) };
  if (v.tris !== undefined) opts.tris = num('tris', v.tris);
  if (v.texture !== undefined) opts.texture = num('texture', v.texture);
  if (v.face !== undefined) opts.face = v.face;
  if (v.yaw !== undefined) opts.yaw = num('yaw', v.yaw);
  if (v.pivot !== undefined) opts.pivot = v.pivot;
  if (v.quality !== undefined) opts.quality = num('quality', v.quality);
  if (v['keep-anim']) opts.keepAnim = true;
  if (v.join) opts.join = true;
  if (v['no-simplify']) opts.simplify = false;
  if (v.meshopt) opts.meshopt = true;
  if (v['no-meshopt']) opts.meshopt = false;
  if (v['no-webp']) opts.webp = false;
  if (v.verbose) opts.verbose = true;

  return processModel(input, output, opts);
}

main().catch((e) => {
  console.error(`\nエラー: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
