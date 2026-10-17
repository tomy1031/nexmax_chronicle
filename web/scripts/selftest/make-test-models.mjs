// パイプラインの自己テスト用に、Tripo の GLB に似た合成モデルを作る。
//   node scripts/selftest/make-test-models.mjs <outDir>
//
// 作るもの:
//   char_static.glb   高ポリ UV 球 + 箱で作った「キャラ」。+Z を向き、原点から外れ、親ノードにスケール、2048px PNG テクスチャ(色+法線)
//   char_skinned.glb  3 ジョイントのスキンメッシュ + ボーン曲げアニメ（+Z を向く、オフセットあり）
//   props_multi.glb   同一マテリアルの 2 メッシュ（--join テスト用）。512px テクスチャ（拡大されないことの確認）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

// ---------------------------------------------------------------- geometry builders

class Geo {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
    this.extra = []; // 頂点ごとの追加情報（スキン用）
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(p, n, uv) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
  }
}

/** UV 球。UV は経度・緯度そのまま（シーム有り = 実際のモデルと同様に頂点が重複する） */
function addSphere(g, c, r, segU, segV, uvRect = [0, 0, 1, 1]) {
  const base = g.count;
  for (let j = 0; j <= segV; j++) {
    const phi = (j / segV) * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const th = (i / segU) * Math.PI * 2;
      // 北極 = +Y。th=0 のとき +Z 方向
      const n = [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)];
      g.vert(
        [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r],
        n,
        [uvRect[0] + (i / segU) * uvRect[2], uvRect[1] + (1 - j / segV) * uvRect[3]],
      );
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i;
      const b = a + 1;
      const c2 = a + segU + 1;
      const d = c2 + 1;
      if (j !== 0) g.idx.push(a, c2, b);
      if (j !== segV - 1) g.idx.push(b, c2, d);
    }
  }
}

/** 軸平行ボックス（面ごとに頂点を分けるフラットシェード） */
function addBox(g, min, max, uvRect = [0, 0, 0.2, 0.2], sub = 1) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces = [
    { n: [0, 0, 1], o: [x0, y0, z1], u: [x1 - x0, 0, 0], v: [0, y1 - y0, 0] },
    { n: [0, 0, -1], o: [x1, y0, z0], u: [x0 - x1, 0, 0], v: [0, y1 - y0, 0] },
    { n: [1, 0, 0], o: [x1, y0, z1], u: [0, 0, z0 - z1], v: [0, y1 - y0, 0] },
    { n: [-1, 0, 0], o: [x0, y0, z0], u: [0, 0, z1 - z0], v: [0, y1 - y0, 0] },
    { n: [0, 1, 0], o: [x0, y1, z1], u: [x1 - x0, 0, 0], v: [0, 0, z0 - z1] },
    { n: [0, -1, 0], o: [x0, y0, z0], u: [x1 - x0, 0, 0], v: [0, 0, z1 - z0] },
  ];
  for (const f of faces) {
    const base = g.count;
    for (let j = 0; j <= sub; j++) {
      for (let i = 0; i <= sub; i++) {
        const s = i / sub;
        const t = j / sub;
        g.vert(
          [f.o[0] + f.u[0] * s + f.v[0] * t, f.o[1] + f.u[1] * s + f.v[1] * t, f.o[2] + f.u[2] * s + f.v[2] * t],
          f.n,
          [uvRect[0] + s * uvRect[2], uvRect[1] + t * uvRect[3]],
        );
      }
    }
    for (let j = 0; j < sub; j++) {
      for (let i = 0; i < sub; i++) {
        const a = base + j * (sub + 1) + i;
        g.idx.push(a, a + 1, a + sub + 1, a + 1, a + sub + 2, a + sub + 1);
      }
    }
  }
}

// ---------------------------------------------------------------- textures

/** 勾配 + チェッカー + ノイズの色テクスチャ（Tripo の絵柄っぽく圧縮しにくい） */
async function makeColorTexture(size) {
  const buf = Buffer.alloc(size * size * 3);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 3;
      const checker = (((x >> 6) + (y >> 6)) & 1) * 30;
      const n = (rnd() - 0.5) * 24;
      buf[o] = Math.max(0, Math.min(255, (x / size) * 200 + checker + n + 20));
      buf[o + 1] = Math.max(0, Math.min(255, (y / size) * 180 + checker + n + 30));
      buf[o + 2] = Math.max(0, Math.min(255, 128 + Math.sin(x / 40) * 60 + n));
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

async function makeNormalTexture(size) {
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 3;
      const nx = Math.sin(x / 25) * 0.25;
      const ny = Math.cos(y / 31) * 0.25;
      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      buf[o] = Math.round((nx * 0.5 + 0.5) * 255);
      buf[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      buf[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

// ---------------------------------------------------------------- doc helpers

function attach(doc, buffer, prim, g, { skin = null } = {}) {
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer);
  const nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buffer);
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buffer);
  const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buffer);
  prim.setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setAttribute('TEXCOORD_0', uv).setIndices(idx);
  if (skin) {
    prim
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(skin.joints)).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(new Float32Array(skin.weights)).setBuffer(buffer));
  }
}

async function makeMaterial(doc, { texSize, withNormal }) {
  const color = doc
    .createTexture('baseColor')
    .setImage(new Uint8Array(await makeColorTexture(texSize)))
    .setMimeType('image/png');
  const mat = doc
    .createMaterial('Body')
    .setBaseColorTexture(color)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.8);
  if (withNormal) {
    const normal = doc
      .createTexture('normal')
      .setImage(new Uint8Array(await makeNormalTexture(texSize)))
      .setMimeType('image/png');
    mat.setNormalTexture(normal);
  }
  return mat;
}

// ---------------------------------------------------------------- models

/** 高さ 3.7 ワールド単位、+Z 向き、原点から外れている静的キャラ */
async function makeStaticChar(file) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const g = new Geo();
  // 以下は「ローカル高さ 1.85」のモデルを作る（親ノードの scale=2 でワールド 3.7）
  addSphere(g, [0, 1.625, 0], 0.225, 256, 128); // 頭
  addBox(g, [-0.04, 1.58, 0.2], [0.04, 1.66, 0.28], [0.3, 0.3, 0.1, 0.1]); // 鼻（+Z へ突き出す）
  addSphere(g, [0, 1.0, 0], 0.3, 160, 80, [0, 0, 0.5, 0.5]); // 胴
  addBox(g, [-0.25, 0.1, -0.1], [-0.05, 0.4, 0.1], [0.5, 0.5, 0.1, 0.1], 4); // 脚 L
  addBox(g, [0.05, 0.1, -0.1], [0.25, 0.4, 0.1], [0.6, 0.5, 0.1, 0.1], 4); // 脚 R
  addBox(g, [-0.28, 0, -0.15], [-0.02, 0.1, 0.35], [0.5, 0.6, 0.1, 0.1], 4); // 足 L（つま先が +Z 側に長い）
  addBox(g, [0.02, 0, -0.15], [0.28, 0.1, 0.35], [0.6, 0.6, 0.1, 0.1], 4); // 足 R
  const mat = await makeMaterial(doc, { texSize: 2048, withNormal: true });
  const prim = doc.createPrimitive().setMaterial(mat);
  attach(doc, buffer, prim, g);
  const mesh = doc.createMesh('Character').addPrimitive(prim);
  const meshNode = doc.createNode('Mesh').setMesh(mesh).setTranslation([2.5, 1, -1.5]);
  const parent = doc.createNode('Parent').setScale([2, 2, 2]).addChild(meshNode);
  doc.createScene('Scene').addChild(parent);
  await new NodeIO().write(file, doc);
}

/** 3 ジョイント + 曲げアニメ。高さ 3.0、床 y=1、+Z 向き、(-2, 4) 付近 */
async function makeSkinnedChar(file) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const g = new Geo();
  const joints = [];
  const weights = [];
  const base = [-2, 1, 4]; // armature の位置 = 足元
  const jointY = [0, 1.5, 3.0];
  const radial = 96;
  const rings = 400;
  const height = 3.0;
  const r = 0.35;
  const pushSkin = (y) => {
    // y は armature からの高さ
    let a = 0;
    if (y >= jointY[1]) a = 1;
    const t = (y - jointY[a]) / (jointY[a + 1] - jointY[a]);
    joints.push(a, a + 1, 0, 0);
    weights.push(1 - t, t, 0, 0);
  };
  // 円筒（胴体）
  for (let j = 0; j <= rings; j++) {
    const y = (j / rings) * height;
    for (let i = 0; i <= radial; i++) {
      const th = (i / radial) * Math.PI * 2;
      const n = [Math.sin(th), 0, Math.cos(th)];
      g.vert([base[0] + n[0] * r, base[1] + y, base[2] + n[2] * r], n, [i / radial, j / rings]);
      pushSkin(y);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const c = a + radial + 1;
      g.idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  // 足（ジョイント 0 に 100%）: +Z に突き出す箱
  const nBefore = g.count;
  addBox(g, [base[0] - 0.3, base[1], base[2] - 0.2], [base[0] + 0.3, base[1] + 0.1, base[2] + 0.8], [0.5, 0.5, 0.1, 0.1], 2);
  for (let i = nBefore; i < g.count; i++) {
    joints.push(0, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  const mat = await makeMaterial(doc, { texSize: 2048, withNormal: false });
  const prim = doc.createPrimitive().setMaterial(mat);
  attach(doc, buffer, prim, g, { skin: { joints, weights } });

  const j0 = doc.createNode('hip');
  const j1 = doc.createNode('spine').setTranslation([0, jointY[1], 0]);
  const j2 = doc.createNode('head').setTranslation([0, jointY[2] - jointY[1], 0]);
  j0.addChild(j1);
  j1.addChild(j2);
  const armature = doc.createNode('Armature').setTranslation(base).addChild(j0);
  const ibm = new Float32Array(48);
  jointY.forEach((y, i) => {
    // バインド時のジョイントワールド = translate(base + (0,y,0)) → IBM はその逆
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -base[0], -(base[1] + y), -base[2], 1], i * 16);
  });
  const skin = doc
    .createSkin('Skin')
    .addJoint(j0)
    .addJoint(j1)
    .addJoint(j2)
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
  const mesh = doc.createMesh('SkinnedChar').addPrimitive(prim);
  const meshNode = doc.createNode('SkinnedMesh').setMesh(mesh).setSkin(skin);

  // spine を X 軸まわりに曲げるアニメ
  const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 0.5, 1])).setBuffer(buffer);
  const s = Math.sin(0.15);
  const c = Math.cos(0.15);
  const rot = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([0, 0, 0, 1, s, 0, 0, c, 0, 0, 0, 1]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(times).setOutput(rot).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(j1).setTargetPath('rotation').setSampler(sampler);
  doc.createAnimation('Bend').addSampler(sampler).addChannel(channel);

  doc.createScene('Scene').addChild(armature).addChild(meshNode);
  await new NodeIO().write(file, doc);
}

/** 同一マテリアルの 2 メッシュ（箱 + 球）。小さなテクスチャ(512) */
async function makeMultiProps(file) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mat = await makeMaterial(doc, { texSize: 512, withNormal: false });
  const scene = doc.createScene('Scene');
  const gb = new Geo();
  addBox(gb, [-1, 0, -1], [1, 2, 1], [0, 0, 1, 1], 8);
  const pb = doc.createPrimitive().setMaterial(mat);
  attach(doc, buffer, pb, gb);
  scene.addChild(doc.createNode('Box').setMesh(doc.createMesh('BoxMesh').addPrimitive(pb)).setTranslation([0, 0, 0]));
  const gs = new Geo();
  addSphere(gs, [0, 0, 0], 0.7, 64, 32);
  const ps = doc.createPrimitive().setMaterial(mat);
  attach(doc, buffer, ps, gs);
  scene.addChild(doc.createNode('Ball').setMesh(doc.createMesh('BallMesh').addPrimitive(ps)).setTranslation([3, 0.7, 0]));
  await new NodeIO().write(file, doc);
}

export async function makeAll(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    static: path.join(outDir, 'char_static.glb'),
    skinned: path.join(outDir, 'char_skinned.glb'),
    multi: path.join(outDir, 'props_multi.glb'),
  };
  await makeStaticChar(files.static);
  await makeSkinnedChar(files.skinned);
  await makeMultiProps(files.multi);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('使い方: node scripts/selftest/make-test-models.mjs <outDir>');
    process.exit(2);
  }
  const files = await makeAll(path.resolve(outDir));
  for (const f of Object.values(files)) console.log(`${f}  ${(fs.statSync(f).size / 1024 / 1024).toFixed(2)} MB`);
}
