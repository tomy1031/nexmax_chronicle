#!/usr/bin/env node
// GLB の中身を表示する（メッシュ/三角形/マテリアル/テクスチャ/スキン/アニメ/BBox/向きのヒント）。
//   node scripts/inspect-model.mjs <file.glb> [more.glb ...] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createIO } from './lib/io.mjs';
import { collectStats, formatStats } from './lib/stats.mjs';
import { computeBounds, guessFacing } from './lib/geometry.mjs';

const USAGE = `使い方: node scripts/inspect-model.mjs <file.glb> [more.glb ...] [--json]
  --json   機械可読な JSON を出力`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 2);
  }
  const io = await createIO();
  const reports = [];
  for (const file of positionals) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
      console.error(`見つかりません: ${file}`);
      process.exitCode = 1;
      continue;
    }
    const doc = await io.read(abs);
    const stats = collectStats(doc, fs.statSync(abs).size);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const facing = scene ? guessFacing(scene, computeBounds(scene)) : null;
    reports.push({ file, stats, facing });
    if (values.json) continue;

    console.log(`\n=== ${file} ===`);
    console.log(formatStats(stats, { detail: true }));
    if (stats.bounds) {
      const b = stats.bounds;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      console.log(`  足元 (min y)   : ${b.min[1].toFixed(4)}   X/Z 中心 : (${cx.toFixed(4)}, ${cz.toFixed(4)})`);
    }
    if (facing) {
      const txt = facing.dir ? `${facing.dir} らしい (${facing.confidence}; ${facing.note})` : `不明 (${facing.note})`;
      console.log(`  正面の推定     : ${txt}`);
      console.log('                   ※人型向けの弱いヒント。process-model の --face は目視確認の上で指定してください');
    }
  }
  if (values.json) console.log(JSON.stringify(reports, null, 2));
}

main().catch((e) => {
  console.error(`エラー: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
