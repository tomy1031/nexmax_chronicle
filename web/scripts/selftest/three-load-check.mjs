// 出力 GLB が「実際の three.js の GLTFLoader + MeshoptDecoder」で読めるかを Node 上で確認する。
// DOM が無いので Image / document を最小限スタブしている（テクスチャのデコード自体は行わない）。
//   node scripts/selftest/three-load-check.mjs <file.glb> [more.glb ...]
//
// 表示: メッシュ数 / 三角形数 / Box3(精密) / テクスチャ種別 / アニメクリップ。終了コード 0=全部ロード成功

import fs from 'node:fs';
import path from 'node:path';

// --- 最小限のブラウザスタブ（three のインポートより前に用意する）---
globalThis.self ??= globalThis;
class FakeImage {
  constructor() {
    this.width = 1;
    this.height = 1;
    this._l = {};
  }
  addEventListener(t, fn) {
    (this._l[t] ??= []).push(fn);
  }
  removeEventListener(t, fn) {
    this._l[t] = (this._l[t] ?? []).filter((f) => f !== fn);
  }
  set src(v) {
    this._src = v;
    queueMicrotask(() => {
      (this._l.load ?? []).forEach((f) => f({}));
      this.onload?.({});
    });
  }
  get src() {
    return this._src;
  }
}
globalThis.Image = FakeImage;
globalThis.document = { createElementNS: () => new FakeImage() };

const THREE = await import('three');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');

async function load(file) {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(ab, '', resolve, reject));
}

function measure(gltf) {
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  let tris = 0;
  let meshes = 0;
  let skinned = 0;
  const maps = new Set();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinned++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (o.material[k]) maps.add(k);
  });
  return { box, tris, meshes, skinned, maps: [...maps] };
}

let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    const gltf = await load(path.resolve(file));
    const m = measure(gltf);
    const size = m.box.getSize(new THREE.Vector3());
    const f = (v) => v.toFixed(4);
    console.log(`OK  ${path.basename(file)}`);
    console.log(`    meshes ${m.meshes} (skinned ${m.skinned}), tris ${m.tris}, maps [${m.maps.join(', ')}]`);
    console.log(`    Box3 min (${f(m.box.min.x)}, ${f(m.box.min.y)}, ${f(m.box.min.z)})  max (${f(m.box.max.x)}, ${f(m.box.max.y)}, ${f(m.box.max.z)})  size (${f(size.x)}, ${f(size.y)}, ${f(size.z)})`);
    if (gltf.animations.length) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = gltf.animations[0];
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration / 2);
      const m2 = measure(gltf);
      const diff = ['x', 'y', 'z'].reduce((a, k) => a + Math.abs(m2.box.min[k] - m.box.min[k]) + Math.abs(m2.box.max[k] - m.box.max[k]), 0);
      console.log(`    アニメ "${clip.name}" ${clip.duration.toFixed(2)}s: 中間フレームで BBox が合計 ${f(diff)} 変化 (0 超なら再生OK)`);
    }
  } catch (e) {
    failed++;
    console.log(`NG  ${path.basename(file)}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
