// Tripo の生 GLB → Web 用 GLB への変換パイプライン本体。
// CLI (process-model.mjs) と process-all.mjs の両方から呼ぶ。
//
// 処理順:
//   1. 読み込み・統計（before）
//   2. アニメ/スキン処理      --keep-anim なし: アニメ削除 + スキンはレストポーズで静的メッシュに焼き込み
//   3. dedup / prune / weld（必要なら flatten + join）
//   4. 三角形削減（meshoptimizer、UV/法線を考慮）
//   5. 向き補正 + 原点合わせ + 等倍スケール（静的: 頂点に焼き込み / スキン・アニメ付き: ルートノードに適用）
//   6. テクスチャ縮小 + WebP 化
//   7. prune / dedup / （任意）meshopt 圧縮 → 書き出し → 再読込して統計（after）

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';
import { PropertyType } from '@gltf-transform/core';
import {
  compactPrimitive,
  clearNodeParent,
  dedup,
  dequantize,
  flatten,
  join,
  meshopt,
  prune,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';

import { createIO, MeshoptEncoder } from './io.mjs';
import {
  computeBounds,
  guessFacing,
  primitiveTriangleCount,
  sceneTriangleCount,
  skinJointMatrices,
  vec3Array,
} from './geometry.mjs';
import { deg2rad, mul, quatY, rotationY, scaling, translation } from './math.mjs';
import { collectStats, formatBytes, formatStats } from './stats.mjs';

export const DEFAULTS = {
  tris: 20000,
  texture: 1024,
  face: '+z',
  yaw: 0,
  pivot: 'bottom',
  keepAnim: false,
  meshopt: true,
  webp: true,
  quality: 85,
  join: false,
  simplify: true,
  verbose: false,
};

// 三角形削減時に「形を変えてでも維持したい度合い」。値が大きいほどその属性を優先して保つ。
const SIMPLIFY_WEIGHTS = { normal: 1.0, uv: 2.0, color: 1.0, skinWeight: 1.0 };

const FACE_TO_YAW = {
  '-z': 0,
  '+z': Math.PI,
  '+x': Math.PI / 2,
  '-x': -Math.PI / 2,
};

const DATA_SLOTS = /^(normalTexture|occlusionTexture|metallicRoughnessTexture)$/;
const COLOR_SLOTS = /^(?!(normalTexture|occlusionTexture|metallicRoughnessTexture)$)/;

// ---------------------------------------------------------------------------
// 2. アニメ・スキン
// ---------------------------------------------------------------------------

/** モーフターゲットを全削除（アニメ無しで使うことはないため） */
function dropMorphTargets(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const t of prim.listTargets()) {
        prim.removeTarget(t);
        n++;
      }
    }
    mesh.setWeights([]);
  }
  return n;
}

/**
 * スキンメッシュを「レストポーズのワールド座標」で静的メッシュに焼き込み、スキンを外す。
 * 位置は jointWorld*IBM の線形ブレンド（= レンダラのスキニングと同じ）で計算する。
 */
function bakeSkinsToStatic(doc, log) {
  let baked = 0;
  for (const node of doc.getRoot().listNodes()) {
    const skin = node.getSkin();
    if (!skin) continue;
    const mesh = node.getMesh();
    if (!mesh) {
      node.setSkin(null);
      continue;
    }
    const jointMats = skinJointMatrices(skin);
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION');
      if (!posAcc) continue;
      const sets = [];
      for (let s = 0; s < 4; s++) {
        const j = prim.getAttribute(`JOINTS_${s}`);
        const w = prim.getAttribute(`WEIGHTS_${s}`);
        if (j && w) sets.push([j, w]);
      }
      if (sets.length === 0) continue;
      const P = vec3Array(posAcc);
      const norAcc = prim.getAttribute('NORMAL');
      const N = norAcc ? vec3Array(norAcc) : null;
      const n = posAcc.getCount();
      const outP = new Float32Array(n * 3);
      const outN = N ? new Float32Array(n * 3) : null;
      const jv = [0, 0, 0, 0];
      const wv = [0, 0, 0, 0];
      const S = new Array(16);
      for (let i = 0; i < n; i++) {
        S.fill(0);
        let wsum = 0;
        for (const [ja, wa] of sets) {
          ja.getElement(i, jv);
          wa.getElement(i, wv);
          for (let k = 0; k < 4; k++) {
            const w = wv[k];
            const m = jointMats[jv[k]];
            if (w <= 0 || !m) continue;
            for (let e = 0; e < 16; e++) S[e] += w * m[e];
            wsum += w;
          }
        }
        const x = P[i * 3];
        const y = P[i * 3 + 1];
        const z = P[i * 3 + 2];
        if (wsum <= 0) {
          outP[i * 3] = x;
          outP[i * 3 + 1] = y;
          outP[i * 3 + 2] = z;
          if (N) outN.set([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], i * 3);
          continue;
        }
        const inv = 1 / wsum;
        outP[i * 3] = (S[0] * x + S[4] * y + S[8] * z + S[12]) * inv;
        outP[i * 3 + 1] = (S[1] * x + S[5] * y + S[9] * z + S[13]) * inv;
        outP[i * 3 + 2] = (S[2] * x + S[6] * y + S[10] * z + S[14]) * inv;
        if (N) {
          const nx = N[i * 3];
          const ny = N[i * 3 + 1];
          const nz = N[i * 3 + 2];
          const ox = S[0] * nx + S[4] * ny + S[8] * nz;
          const oy = S[1] * nx + S[5] * ny + S[9] * nz;
          const oz = S[2] * nx + S[6] * ny + S[10] * nz;
          const len = Math.hypot(ox, oy, oz) || 1;
          outN[i * 3] = ox / len;
          outN[i * 3 + 1] = oy / len;
          outN[i * 3 + 2] = oz / len;
        }
      }
      prim.setAttribute('POSITION', posAcc.clone().setArray(outP).setNormalized(false));
      if (N) prim.setAttribute('NORMAL', norAcc.clone().setArray(outN).setNormalized(false));
      for (let s = 0; s < 4; s++) {
        prim.setAttribute(`JOINTS_${s}`, null);
        prim.setAttribute(`WEIGHTS_${s}`, null);
      }
    }
    node.setSkin(null);
    // 頂点は既にワールド座標。ノードを scene 直下・単位変換にしておく
    clearNodeParent(node);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    baked++;
  }
  if (baked) log(`  スキンメッシュ ${baked} 個をレストポーズで静的メッシュに焼き込みました (--keep-anim で骨格とクリップを保持)`);
}

// ---------------------------------------------------------------------------
// 4. 三角形削減
// ---------------------------------------------------------------------------

function buildSimplifyAttributes(prim, hasSkinWeights) {
  const n = prim.getAttribute('POSITION').getCount();
  const parts = []; // { data, size, weight }
  const normal = prim.getAttribute('NORMAL');
  if (normal) parts.push({ data: vec3Array(normal), size: 3, weight: SIMPLIFY_WEIGHTS.normal });
  const uv = prim.getAttribute('TEXCOORD_0');
  if (uv) {
    const data = new Float32Array(n * 2);
    const el = [0, 0];
    for (let i = 0; i < n; i++) {
      uv.getElement(i, el);
      data[i * 2] = el[0];
      data[i * 2 + 1] = el[1];
    }
    parts.push({ data, size: 2, weight: SIMPLIFY_WEIGHTS.uv });
  }
  const color = prim.getAttribute('COLOR_0');
  if (color) {
    const data = new Float32Array(n * 3);
    const el = new Array(color.getElementSize());
    for (let i = 0; i < n; i++) {
      color.getElement(i, el);
      data[i * 3] = el[0];
      data[i * 3 + 1] = el[1];
      data[i * 3 + 2] = el[2];
    }
    parts.push({ data, size: 3, weight: SIMPLIFY_WEIGHTS.color });
  }
  const skinW = hasSkinWeights ? prim.getAttribute('WEIGHTS_0') : null;
  if (skinW) {
    const data = new Float32Array(n * 4);
    const el = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      skinW.getElement(i, el);
      data.set(el, i * 4);
    }
    parts.push({ data, size: 4, weight: SIMPLIFY_WEIGHTS.skinWeight });
  }
  const stride = parts.reduce((s, p) => s + p.size, 0);
  const attrs = new Float32Array(n * stride);
  let offset = 0;
  const weights = [];
  for (const p of parts) {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < p.size; c++) attrs[i * stride + offset + c] = p.data[i * p.size + c];
    }
    for (let c = 0; c < p.size; c++) weights.push(p.weight);
    offset += p.size;
  }
  return { attrs, stride, weights };
}

/**
 * 1 つの Primitive を目標三角形数まで減らす。頂点位置は動かさず index だけ間引く
 * （= スキンのウェイト/ジョイント・モーフ・UV などの頂点データはそのまま有効）。
 * @returns {{ before:number, after:number, error:number, method:string }|null}
 */
function simplifyPrimitiveTo(prim, targetTris, hasSkin) {
  const mode = prim.getMode();
  if (mode !== 4) return null; // TRIANGLES 以外は対象外（weld 後は常に TRIANGLES のはず）
  const idxAcc = prim.getIndices();
  const posAcc = prim.getAttribute('POSITION');
  if (!idxAcc || !posAcc) return null;
  const before = primitiveTriangleCount(prim);
  if (before <= targetTris) return null;

  const indices = Uint32Array.from(idxAcc.getArray());
  const positions = vec3Array(posAcc);
  const { attrs, stride, weights } = buildSimplifyAttributes(prim, hasSkin);
  const targetIndexCount = Math.max(3, Math.floor(targetTris)) * 3;

  // 段階的に試す: 通常 → Permissive（UV シームをまたぐ縮退を許す）→ Sloppy（形状は粗くなるが必ず減る）
  const withAttr = stride > 0;
  const simplifyAttr = (flags) =>
    withAttr
      ? MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, stride, weights, null, targetIndexCount, 1.0, flags)
      : MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, 1.0, flags);
  const attempts = [
    { name: withAttr ? 'attributes' : 'position-only', run: () => simplifyAttr([]) },
    { name: 'permissive', run: () => simplifyAttr(['Permissive']) },
    { name: 'sloppy', run: () => MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, targetIndexCount, 1.0) },
  ];
  let best = null;
  for (const a of attempts) {
    const [result, error] = a.run();
    if (!best || result.length < best.result.length) best = { result, error, method: a.name };
    if (result.length <= targetIndexCount) break;
  }
  prim.setIndices(idxAcc.clone().setArray(new Uint32Array(best.result)));
  compactPrimitive(prim);
  return { before, after: primitiveTriangleCount(prim), error: best.error, scale: MeshoptSimplifier.getScale(positions, 3), method: best.method };
}

async function simplifyScene(doc, scene, targetTris, sourceHeight, log) {
  await MeshoptSimplifier.ready;
  const root = doc.getRoot();
  const total0 = sceneTriangleCount(scene);
  if (total0 <= targetTris) {
    log(`  三角形削減: スキップ（${total0.toLocaleString()} tris は目標 ${targetTris.toLocaleString()} 以下）`);
    return;
  }
  const hasSkin = root.listSkins().length > 0;
  if (hasSkin) {
    log('  スキンメッシュ: 頂点は動かさず index のみ間引きます（ウェイトも属性として考慮）');
  }
  const meshes = root.listMeshes();
  let absErr = 0;
  const methods = new Set();
  for (let round = 0; round < 4; round++) {
    const total = sceneTriangleCount(scene);
    if (total <= targetTris) break;
    const ratio = (targetTris / total) * (round === 0 ? 1 : 0.97);
    for (const mesh of meshes) {
      for (const prim of mesh.listPrimitives()) {
        const t = primitiveTriangleCount(prim);
        const goal = Math.max(Math.min(t, 8), Math.floor(t * ratio));
        const r = simplifyPrimitiveTo(prim, goal, hasSkin);
        if (r) {
          methods.add(r.method);
          absErr = Math.max(absErr, r.error * r.scale);
        }
      }
    }
  }
  const total1 = sceneTriangleCount(scene);
  log(
    `  三角形削減: ${total0.toLocaleString()} → ${total1.toLocaleString()} tris (目標 ${targetTris.toLocaleString()}) / 方式 ${[...methods].join(', ')} / 最大幾何誤差 ≈ ${((absErr / sourceHeight) * 100).toFixed(2)}% of height`,
  );
  if (methods.has('sloppy')) {
    log('  [警告] 通常の削減が目標に届かず、粗い方式 (sloppy) を併用しました。UV/形状が荒れていないか目視確認してください');
  }
  if (total1 > targetTris) log(`  [警告] 目標 ${targetTris.toLocaleString()} tris に届きませんでした (${total1.toLocaleString()})`);
  if (absErr / sourceHeight > 0.02) {
    log('  [警告] 削減による形状誤差が大きめです。--tris を増やすか、Tripo 側で低ポリ指定の再生成を検討してください');
  }
}

// ---------------------------------------------------------------------------
// 5. 向き・原点・スケール
// ---------------------------------------------------------------------------

function wrapSceneInRoot(doc, scene, { translationVec, yaw, scale }) {
  const wrapper = doc
    .createNode('ModelRoot')
    .setTranslation(translationVec)
    .setRotation(quatY(yaw))
    .setScale([scale, scale, scale]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
}

async function bakeTransformIntoMeshes(doc, scene, M) {
  await doc.transform(flatten());
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    transformMesh(mesh, mul(M, node.getMatrix()));
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {Partial<typeof DEFAULTS> & { height: number }} options
 * @param {(msg:string)=>void} [log]
 */
export async function processModel(inputPath, outputPath, options, log = console.log) {
  const opts = { ...DEFAULTS, ...options };
  if (!(opts.height > 0)) throw new Error('--height <meters> は必須です (例: --height 1.2)');
  if (!['bottom', 'center'].includes(opts.pivot)) throw new Error(`--pivot は bottom|center (指定: ${opts.pivot})`);
  const faceArg = String(opts.face).toLowerCase();
  if (faceArg !== 'auto' && !(faceArg in FACE_TO_YAW)) throw new Error(`--face は +z|-z|+x|-x|auto (指定: ${opts.face})`);
  if (!fs.existsSync(inputPath)) throw new Error(`入力ファイルが見つかりません: ${inputPath}`);

  const warnings = [];
  const warn = (m) => {
    warnings.push(m);
    log(`  [警告] ${m}`);
  };

  const io = await createIO({ verbose: opts.verbose });
  const inBytes = fs.statSync(inputPath).size;
  const doc = await io.read(inputPath);
  const root = doc.getRoot();
  // --- 1. before ---
  log(`\n=== ${path.basename(inputPath)} → ${path.relative(process.cwd(), outputPath)} ===`);
  const before = collectStats(doc, inBytes);
  log('[before]');
  log(formatStats(before, { detail: false }));

  // 入力が Draco / meshopt 圧縮済みでも、読み込み時点でデコード済み。圧縮拡張はいったん外し、
  // meshopt は必要なら最後に付け直す（Draco は使わない）
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression' || ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  }
  // 量子化済み（KHR_mesh_quantization）の入力は一度 float に戻す。gltf-transform 4.5.1 の transformMesh は
  // 正規化整数の法線を書き戻す際に符号化を誤る（法線が 0 になる）ため、変換前に必ず float 化しておく
  const wasQuantized = root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_mesh_quantization');
  if (wasQuantized) await doc.transform(dequantize());

  // 既定シーン以外は捨てる
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('GLB にシーンがありません');
  root.setDefaultScene(scene);
  for (const s of root.listScenes()) if (s !== scene) s.dispose();

  // --- 2. アニメ/スキン ---
  const hadSkin = root.listSkins().length > 0;
  const hadAnim = root.listAnimations().length > 0;
  log('\n[process]');
  if (wasQuantized) log('  入力は量子化済み (KHR_mesh_quantization) → float に戻してから処理');
  if (!opts.keepAnim) {
    if (hadAnim) {
      for (const a of root.listAnimations()) {
        // channel/sampler が残るとターゲットノード(関節)が prune されないので一緒に破棄する
        a.listChannels().forEach((c) => c.dispose());
        a.listSamplers().forEach((s) => s.dispose());
        a.dispose();
      }
      log(`  アニメーション ${before.animations.length} 本を削除 (--keep-anim で保持)`);
    }
    const dropped = dropMorphTargets(doc);
    if (dropped) log(`  モーフターゲット ${dropped} 個を削除`);
    if (hadSkin) bakeSkinsToStatic(doc, log);
  }
  await doc.transform(prune());

  // --- 3. クリーンアップ ---
  await doc.transform(dedup(), weld());
  const isStatic = root.listSkins().length === 0 && root.listAnimations().length === 0;
  if (opts.join) {
    if (isStatic) {
      const meshesBefore = root.listMeshes().length;
      await doc.transform(flatten(), join({ keepMeshes: false, keepNamed: false }));
      log(`  メッシュ結合: ${meshesBefore} → ${root.listMeshes().length} meshes`);
    } else {
      warn('--join はスキン/アニメ付きモデルでは無効のためスキップ');
    }
  }

  // --- 4. 三角形削減 ---
  const srcBounds = computeBounds(scene);
  if (!srcBounds) throw new Error('頂点が見つかりません（空のモデル）');
  const sourceHeight = srcBounds.size[1];
  if (!(sourceHeight > 0)) throw new Error('モデルの高さ (Y) が 0 です。Z-up のモデルの可能性があります');
  if (opts.simplify && opts.tris > 0) {
    await simplifyScene(doc, scene, opts.tris, sourceHeight, log);
  } else {
    log('  三角形削減: 無効');
  }

  // --- 5. 向き・原点・スケール ---
  let faceDir = faceArg;
  if (faceArg === 'auto') {
    const g = guessFacing(scene, computeBounds(scene));
    if (g.dir && g.confidence) {
      faceDir = g.dir;
      log(`  --face auto: ${g.dir} と推定 (${g.confidence}; ${g.note})`);
    } else {
      faceDir = '+z';
      warn(`--face auto で判定できなかったため +z と仮定します (${g.note})`);
    }
  }
  const yaw = FACE_TO_YAW[faceDir] + deg2rad(opts.yaw);
  const cur = computeBounds(scene); // 簡略化後（端点が落ちて高さが微妙に変わる場合がある）
  const scale = opts.height / cur.size[1];
  const M0 = mul(scaling(scale), rotationY(yaw));
  const rb = computeBounds(scene, M0);
  const cx = (rb.min[0] + rb.max[0]) / 2;
  const cz = (rb.min[2] + rb.max[2]) / 2;
  const cy = opts.pivot === 'center' ? (rb.min[1] + rb.max[1]) / 2 : rb.min[1];
  const t = [-cx, -cy, -cz];
  const M = mul(translation(t[0], t[1], t[2]), M0);

  const canBake =
    isStatic &&
    root.listMeshes().every((m) => m.listParents().filter((p) => p.propertyType === PropertyType.NODE).length <= 1);
  if (canBake) {
    await bakeTransformIntoMeshes(doc, scene, M);
    log(`  変換: 頂点に焼き込み (face ${faceDir} → -z, scale ×${scale.toPrecision(5)}, pivot ${opts.pivot})`);
  } else {
    wrapSceneInRoot(doc, scene, { translationVec: t, yaw, scale });
    log(
      `  変換: ルートノード "ModelRoot" に適用 (${isStatic ? 'メッシュ共有あり' : 'スキン/アニメ付き'}; face ${faceDir} → -z, scale ×${scale.toPrecision(5)}, pivot ${opts.pivot})`,
    );
  }
  await doc.transform(prune());

  // --- 6. テクスチャ ---
  if (root.listTextures().length > 0 && (opts.texture > 0 || opts.webp)) {
    const common = {
      encoder: sharp,
      ...(opts.texture > 0 ? { resize: [opts.texture, opts.texture] } : {}),
      ...(opts.webp ? { targetFormat: 'webp' } : {}),
    };
    // 色テクスチャは quality、法線/ORM は劣化に敏感なので少し高めの quality
    await doc.transform(
      textureCompress({ ...common, slots: COLOR_SLOTS, quality: opts.quality }),
      textureCompress({ ...common, slots: DATA_SLOTS, quality: Math.min(95, opts.quality + 7) }),
    );
    log(`  テクスチャ: 最大 ${opts.texture > 0 ? opts.texture + 'px' : '(縮小なし)'}${opts.webp ? ' / WebP' : ' / 形式そのまま'}`);
  }

  // --- 7. 仕上げ ---
  await doc.transform(prune(), dedup());
  if (opts.meshopt) {
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    log('  meshopt 圧縮 + 量子化: ON  (ローダ側で MeshoptDecoder が必要)');
  } else {
    log('  meshopt 圧縮: OFF');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await io.write(outputPath, doc);

  // --- after: 書き出したファイルを読み直して計測 ---
  const outBytes = fs.statSync(outputPath).size;
  const after = collectStats(await (await createIO()).read(outputPath), outBytes);
  log('\n[after]');
  log(formatStats(after, { detail: false }));

  // --- 自己チェック ---
  const checks = [];
  if (after.bounds) {
    const bottom = opts.pivot === 'center' ? (after.bounds.min[1] + after.bounds.max[1]) / 2 : after.bounds.min[1];
    const cxA = (after.bounds.min[0] + after.bounds.max[0]) / 2;
    const czA = (after.bounds.min[2] + after.bounds.max[2]) / 2;
    const h = after.bounds.size[1];
    const tol = Math.max(0.001, opts.height * 0.002);
    const z4 = (v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4); // -0.0000 を避ける
    checks.push([Math.abs(bottom) <= tol, `原点 (${opts.pivot}) y=${z4(bottom)}`]);
    checks.push([Math.abs(cxA) <= tol && Math.abs(czA) <= tol, `X/Z 中心 (${z4(cxA)}, ${z4(czA)})`]);
    checks.push([Math.abs(h - opts.height) <= opts.height * 0.005, `高さ ${h.toFixed(4)} m (目標 ${opts.height})`]);
  }
  if (opts.simplify && opts.tris > 0) checks.push([after.triangles <= opts.tris, `三角形 ${after.triangles.toLocaleString()} ≤ ${opts.tris.toLocaleString()}`]);
  if (opts.texture > 0) {
    checks.push([after.textures.every((x) => Math.max(x.width, x.height) <= opts.texture), `テクスチャ ≤ ${opts.texture}px`]);
  }
  log('\n[check]');
  for (const [ok, msg] of checks) {
    log(`  ${ok ? 'OK ' : 'NG '} ${msg}`);
    if (!ok) warnings.push(`check failed: ${msg}`);
  }

  const pct = (a, b) => (a > 0 ? `${((1 - b / a) * 100).toFixed(0)}% 減` : '');
  log(
    `\n[summary] ${formatBytes(before.fileBytes)} → ${formatBytes(after.fileBytes)} (${pct(before.fileBytes, after.fileBytes)}) / ${before.triangles.toLocaleString()} → ${after.triangles.toLocaleString()} tris` +
      ` / 高さ ${after.bounds ? after.bounds.size[1].toFixed(3) : '?'} m / 出力 ${outputPath}`,
  );
  return { before, after, warnings, facing: faceDir };
}
