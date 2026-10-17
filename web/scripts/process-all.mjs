#!/usr/bin/env node
// models.json の定義に従い、assets_src/tripo/ にある生 GLB をまとめて変換する（無いものはスキップ）。
//   node scripts/process-all.mjs [--only a,b] [--list] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { processModel } from './lib/pipeline.mjs';
import { formatBytes } from './lib/stats.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptsDir, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(scriptsDir, 'models.json'), 'utf8'));
let inputDir = path.resolve(webRoot, manifest.inputDir ?? '../assets_src/tripo');
let outputDir = path.resolve(webRoot, manifest.outputDir ?? 'public/models');

const USAGE = `使い方: node scripts/process-all.mjs [options]
  --only a,b   指定した name だけ処理（カンマ区切り）
  --list       マニフェストと入力ファイルの有無を表示して終了
  --dry-run    変換せず、何を処理するかだけ表示
  --input-dir <dir> / --output-dir <dir>   入出力ディレクトリを上書き（テスト用）
入力: ${path.relative(webRoot, inputDir)}/<name>.glb   出力: ${path.relative(webRoot, outputDir)}/<name>.glb`;

/** 大文字小文字を無視して <name>.glb を探す */
function findInput(entry, dirFiles) {
  const want = `${entry.source ?? entry.name}`.replace(/\.glb$/i, '').toLowerCase();
  const hit = dirFiles.find((f) => f.toLowerCase() === `${want}.glb`);
  return hit ? path.join(inputDir, hit) : null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      only: { type: 'string' },
      list: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'input-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values['input-dir']) inputDir = path.resolve(values['input-dir']);
  if (values['output-dir']) outputDir = path.resolve(values['output-dir']);
  const dirFiles = fs.existsSync(inputDir) ? fs.readdirSync(inputDir) : [];
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  if (only) {
    for (const n of only) {
      if (!manifest.models.some((m) => m.name === n)) {
        console.error(`models.json に無い name: ${n}  (有効: ${manifest.models.map((m) => m.name).join(', ')})`);
        process.exit(2);
      }
    }
  }

  console.log(`入力: ${inputDir}${fs.existsSync(inputDir) ? '' : '  (ディレクトリがありません)'}`);
  console.log(`出力: ${outputDir}\n`);

  const rows = [];
  for (const entry of manifest.models) {
    const input = findInput(entry, dirFiles);
    const output = path.join(outputDir, `${entry.name}.glb`);
    rows.push({ entry, input, output });
  }

  if (values.list) {
    for (const { entry, input, output } of rows) {
      const state = input ? '入力あり' : '入力なし';
      const done = fs.existsSync(output) ? `出力あり(${formatBytes(fs.statSync(output).size)})` : '出力なし';
      console.log(`${entry.name.padEnd(10)} height ${String(entry.height).padEnd(5)} tris ${String(entry.tris).padEnd(6)} ${state} / ${done}`);
    }
    const known = new Set(rows.map((r) => r.input && path.basename(r.input)).filter(Boolean));
    for (const f of dirFiles.filter((f) => /\.glb$/i.test(f) && !known.has(f))) {
      console.log(`[未登録] ${f}  → models.json に追加するか、name に合わせてリネームしてください`);
    }
    return;
  }

  const results = [];
  for (const { entry, input, output } of rows) {
    if (only && !only.has(entry.name)) continue;
    if (!input) {
      results.push({ name: entry.name, status: 'skip (入力なし)' });
      continue;
    }
    if (values['dry-run']) {
      results.push({ name: entry.name, status: `dry-run: ${path.basename(input)} → ${path.relative(webRoot, output)}` });
      continue;
    }
    const { name, notes, source, ...rest } = entry;
    const opts = { ...manifest.defaults, ...rest };
    try {
      const r = await processModel(input, output, opts);
      results.push({
        name,
        status: r.warnings.length ? `OK (警告 ${r.warnings.length})` : 'OK',
        tris: `${r.before.triangles.toLocaleString()} → ${r.after.triangles.toLocaleString()}`,
        size: `${formatBytes(r.before.fileBytes)} → ${formatBytes(r.after.fileBytes)}`,
      });
    } catch (e) {
      console.error(`\n[${name}] 失敗: ${e.message}`);
      if (process.env.DEBUG) console.error(e.stack);
      results.push({ name, status: `FAILED: ${e.message}` });
      process.exitCode = 1;
    }
  }

  const known = new Set(rows.map((r) => r.input && path.basename(r.input)).filter(Boolean));
  const unknown = dirFiles.filter((f) => /\.glb$/i.test(f) && !known.has(f));

  console.log('\n===== 結果 =====');
  for (const r of results) {
    console.log(`${r.name.padEnd(10)} ${r.status}${r.tris ? `   ${r.tris} tris   ${r.size}` : ''}`);
  }
  if (results.every((r) => r.status.startsWith('skip'))) {
    console.log('\n処理対象のファイルがありませんでした。assets_src/tripo/<name>.glb を置いてください (scripts/README.md 参照)。');
  }
  for (const f of unknown) console.log(`[未登録] ${f}  → models.json に追加するか、name に合わせてリネームしてください`);
}

main().catch((e) => {
  console.error(`エラー: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
