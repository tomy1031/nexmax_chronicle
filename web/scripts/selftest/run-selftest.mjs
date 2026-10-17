// パイプラインの自己テスト（実際の Tripo ファイル無しで動作確認する）。
//   node scripts/selftest/run-selftest.mjs [workDir]      （既定: OS の一時ディレクトリ）
//   npm run models:selftest
//
// 合成モデルを作り → process-model の各オプションで変換 → 数値を検証 →
//   gltf-transform validate（gltf-validator）→ three.js GLTFLoader でのロード確認、まで行う。
// 出力は workDir 配下のみ。public/models には何も書かない。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAll } from './make-test-models.mjs';
import { processModel } from '../lib/pipeline.mjs';
import { createIO } from '../lib/io.mjs';
import { computeBounds, guessFacing } from '../lib/geometry.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workDir = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'nexmax-model-selftest'));
const inDir = path.join(workDir, 'in');
const outDir = path.join(workDir, 'out');
fs.mkdirSync(outDir, { recursive: true });

const results = []; // { name, ok, detail }
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function facingOf(file) {
  const doc = await (await createIO()).read(file);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  return guessFacing(scene, computeBounds(scene)).dir;
}

/** 全プリミティブの法線がほぼ単位長か（gltf-transform の正規化整数法線バグの回帰検出も兼ねる） */
async function normalsOk(file) {
  const doc = await (await createIO()).read(file);
  const el = [0, 0, 0];
  let bad = 0;
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const n = prim.getAttribute('NORMAL');
      if (!n) continue;
      for (let i = 0; i < n.getCount(); i++) {
        n.getElement(i, el);
        total++;
        if (Math.abs(Math.hypot(el[0], el[1], el[2]) - 1) > 0.03) bad++;
      }
    }
  }
  return { ok: bad === 0 && total > 0, bad, total };
}

function validate(file) {
  const cli = path.join(webRoot, 'node_modules/@gltf-transform/cli/bin/cli.js');
  const r = spawnSync(process.execPath, [cli, 'validate', file], { encoding: 'utf8' });
  const text = `${r.stdout}${r.stderr}`;
  return { ok: /No errors found/.test(text), text };
}

function threeLoad(files) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'three-load-check.mjs');
  const r = spawnSync(process.execPath, [script, ...files], { encoding: 'utf8', cwd: webRoot });
  return { ok: r.status === 0, text: `${r.stdout}${r.stderr}` };
}

const quiet = () => {};
const run = (name, input, extra) => {
  const out = path.join(outDir, `${name}.glb`);
  return processModel(input, out, extra, process.env.VERBOSE ? console.log : quiet).then((r) => ({ ...r, out }));
};

console.log(`作業ディレクトリ: ${workDir}`);
const inputs = await makeAll(inDir);
const inSize = (f) => fs.statSync(f).size;
const outFiles = [];

// ---- 1. 静的キャラ（+Z 向き、オフセット、親スケール、2048 PNG x2）----
console.log('\n[1] 静的キャラ: --height 1.2 --tris 25000');
{
  const r = await run('static', inputs.static, { height: 1.2, tris: 25000 });
  outFiles.push(r.out);
  const a = r.after;
  record('足元 y=0', near(a.bounds.min[1], 0, 0.001), `min y = ${a.bounds.min[1].toExponential(2)}`);
  record('X/Z 中央', near((a.bounds.min[0] + a.bounds.max[0]) / 2, 0, 0.001) && near((a.bounds.min[2] + a.bounds.max[2]) / 2, 0, 0.001));
  record('高さ 1.2m', near(a.bounds.size[1], 1.2, 0.005), `${a.bounds.size[1].toFixed(4)} m`);
  record('三角形 ≤ 25000', a.triangles <= 25000, `${r.before.triangles} → ${a.triangles}`);
  record('テクスチャ ≤1024 & WebP', a.textures.length === 2 && a.textures.every((t) => Math.max(t.width, t.height) <= 1024 && t.mimeType === 'image/webp'), a.textures.map((t) => `${t.width}x${t.height} ${t.mimeType}`).join(', '));
  record('ファイルサイズ縮小', a.fileBytes < r.before.fileBytes / 10, `${(r.before.fileBytes / 1e6).toFixed(2)} MB → ${(a.fileBytes / 1e3).toFixed(1)} KB`);
  record('正面が -Z に回った', (await facingOf(r.out)) === '-z');
  record('スキン/アニメ無し', a.skins.length === 0 && a.animations.length === 0);
}

// ---- 2. 向きオプション ----
console.log('\n[2] 向きオプション（元モデルは実際には +Z 向き）');
for (const [label, extra, expect] of [
  ['--face +z', { face: '+z' }, '-z'],
  ['--face auto', { face: 'auto' }, '-z'],
  ['--face -z (無回転)', { face: '-z' }, '+z'],
  ['--face +x', { face: '+x' }, '+x'],
  ['--face -x', { face: '-x' }, '-x'],
  ['--face +z --yaw 90', { face: '+z', yaw: 90 }, '-x'],
]) {
  const r = await run(`face_${label.replace(/[^a-z0-9]+/gi, '_')}`, inputs.static, { height: 1.2, tris: 5000, ...extra });
  const got = await facingOf(r.out);
  record(`${label} → 出力の正面 ${expect}`, got === expect, `実測 ${got}`);
  record(`${label} → 足元 y=0 / 高さ`, near(r.after.bounds.min[1], 0, 0.001) && near(r.after.bounds.size[1], 1.2, 0.005));
}

// ---- 3. スキン + アニメ ----
console.log('\n[3] スキンメッシュ（既定: レストポーズ焼き込み）');
{
  const r = await run('skinned_baked', inputs.skinned, { height: 1.3, tris: 20000 });
  outFiles.push(r.out);
  const a = r.after;
  record('スキン/アニメ削除', a.skins.length === 0 && a.animations.length === 0);
  record('足元 y=0 / 高さ 1.3', near(a.bounds.min[1], 0, 0.001) && near(a.bounds.size[1], 1.3, 0.005), `${a.bounds.size[1].toFixed(4)} m`);
  record('三角形 ≤ 20000', a.triangles <= 20000, `${r.before.triangles} → ${a.triangles}`);
  record('正面 -Z', (await facingOf(r.out)) === '-z');
}
console.log('\n[4] スキンメッシュ + --keep-anim');
{
  const r = await run('skinned_keep', inputs.skinned, { height: 1.3, tris: 20000, keepAnim: true });
  outFiles.push(r.out);
  const a = r.after;
  record('スキン(3 joints)とクリップ保持', a.skins.length === 1 && a.skins[0].joints === 3 && a.animations.length === 1, `${a.animations[0]?.name} ${a.animations[0]?.duration}s`);
  record('足元 y=0 / 高さ 1.3 (CPUスキニング計測)', near(a.bounds.min[1], 0, 0.001) && near(a.bounds.size[1], 1.3, 0.005), `${a.bounds.size[1].toFixed(4)} m`);
  record('三角形 ≤ 20000', a.triangles <= 20000, `${r.before.triangles} → ${a.triangles}`);
  record('正面 -Z', (await facingOf(r.out)) === '-z');
}

// ---- 4. 複数メッシュ結合 + pivot center ----
console.log('\n[5] 複数メッシュ: --join --pivot center --height 3 --tris 4000（512px テクスチャは拡大されない）');
{
  const r = await run('multi_join', inputs.multi, { height: 3, tris: 4000, join: true, pivot: 'center' });
  outFiles.push(r.out);
  const a = r.after;
  record('メッシュ結合 2 → 1', r.before.meshes.length === 2 && a.meshes.length === 1 && a.meshes[0].primitives === 1);
  record('BBox 中心 y=0', near((a.bounds.min[1] + a.bounds.max[1]) / 2, 0, 0.001));
  record('テクスチャ 512 のまま', a.textures.length === 1 && a.textures[0].width === 512);
  record('三角形 ≤ 4000', a.triangles <= 4000, `${r.before.triangles} → ${a.triangles}`);
}

// ---- 5. 圧縮なし ----
console.log('\n[6] --no-meshopt --no-webp（デコーダ不要の素の GLB）');
{
  const r = await run('plain', inputs.static, { height: 1.2, tris: 25000, meshopt: false, webp: false });
  outFiles.push(r.out);
  const a = r.after;
  record('required 拡張なし', a.extensionsRequired.length === 0, a.extensionsRequired.join(',') || '-');
  record('PNG のまま 1024 に縮小', a.textures.every((t) => t.mimeType === 'image/png' && Math.max(t.width, t.height) === 1024));
  record('足元 y=0 / 高さ 1.2', near(a.bounds.min[1], 0, 0.001) && near(a.bounds.size[1], 1.2, 0.005));
}

// ---- 6. 再処理（meshopt + 量子化済みの出力を入力にする）----
console.log('\n[7] 再処理: 出力ファイル(meshopt/量子化/WebP 済み)を入力にしても壊れない');
for (const [label, extra] of [
  ['meshopt あり', {}],
  ['--no-meshopt', { meshopt: false }],
]) {
  const r = await run(`reprocess_${label.replace(/[^a-z0-9]+/gi, '_')}`, path.join(outDir, 'static.glb'), { height: 1.2, tris: 10000, face: '-z', ...extra });
  outFiles.push(r.out);
  record(`${label}: 高さ/足元/三角形`, near(r.after.bounds.size[1], 1.2, 0.005) && near(r.after.bounds.min[1], 0, 0.001) && r.after.triangles <= 10000, `${r.after.triangles} tris`);
  record(`${label}: 正面が維持 (-z)`, (await facingOf(r.out)) === '-z');
}
{
  const draco = path.join(workDir, 'in', 'draco.glb');
  const cli = path.join(webRoot, 'node_modules/@gltf-transform/cli/bin/cli.js');
  const d = spawnSync(process.execPath, [cli, 'draco', path.join(outDir, 'plain.glb'), draco], { encoding: 'utf8' });
  if (d.status === 0) {
    const r = await run('from_draco', draco, { height: 1.2, tris: 10000, face: '-z' });
    outFiles.push(r.out);
    record('Draco 圧縮済み入力を読める', near(r.after.bounds.size[1], 1.2, 0.005) && r.after.triangles <= 10000);
  } else {
    record('Draco 入力の準備', false, d.stderr.slice(0, 200));
  }
}

// ---- 7. 検証 ----
console.log('\n[8] 法線の長さ / gltf-transform validate');
for (const f of outFiles) {
  const nr = await normalsOk(f);
  record(`法線が単位長 ${path.basename(f)}`, nr.ok, `${nr.bad}/${nr.total} 異常`);
}
for (const f of outFiles) {
  const v = validate(f);
  record(`validate ${path.basename(f)}`, v.ok);
  if (!v.ok) console.log(v.text);
}
console.log('\n[9] three.js GLTFLoader + MeshoptDecoder でロード');
{
  const t = threeLoad(outFiles);
  console.log(t.text.replace(/^/gm, '    '));
  record('three.js で全ファイルロード', t.ok);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (failed.length) {
  for (const f of failed) console.log(`FAIL: ${f.name} ${f.detail}`);
  process.exit(1);
}
