// ジオメトリ計測ユーティリティ。
//   - ワールド座標での頂点列挙（スキンメッシュは CPU スキニングでレストポーズの位置を出す）
//   - バウンディングボックス、三角形数
//   - 「どっち向きか」の簡易推定（足先の突き出しを使うだけの弱いヒント）

import { identity, mul, transformPoint } from './math.mjs';

/** accessor を Float32Array(count*3) として取り出す（量子化済みでもデコード） */
export function vec3Array(accessor) {
  const arr = accessor.getArray();
  if (arr instanceof Float32Array && !accessor.getNormalized()) return arr;
  const n = accessor.getCount();
  const out = new Float32Array(n * 3);
  const el = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    accessor.getElement(i, el);
    out[i * 3] = el[0];
    out[i * 3 + 1] = el[1];
    out[i * 3 + 2] = el[2];
  }
  return out;
}

/** skin の各ジョイントについて jointWorld * inverseBind を返す */
export function skinJointMatrices(skin) {
  const ibmAcc = skin.getInverseBindMatrices();
  const joints = skin.listJoints();
  const ibm = new Array(16);
  return joints.map((joint, i) => {
    let m;
    if (ibmAcc) {
      ibmAcc.getElement(i, ibm);
      m = ibm.slice();
    } else {
      m = identity();
    }
    return mul(joint.getWorldMatrix(), m);
  });
}

/**
 * シーン内の全頂点をワールド座標で列挙して cb(x, y, z) を呼ぶ。
 * スキンメッシュは「jointWorld * IBM」で CPU スキニングする（ノード自身の変換は無視 = glTF 仕様どおり）。
 * @param {import('@gltf-transform/core').Scene} scene
 * @param {(x:number,y:number,z:number)=>void} cb
 * @param {number[]|null} [pre] 追加で最後にかける 4x4 行列
 */
export function forEachWorldPosition(scene, cb, pre = null) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const emit = (x, y, z) => {
    if (pre) {
      transformPoint(pre, x, y, z, q);
      cb(q[0], q[1], q[2]);
    } else {
      cb(x, y, z);
    }
  };
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const skin = node.getSkin();
    const jointMats = skin ? skinJointMatrices(skin) : null;
    const world = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION');
      if (!posAcc) continue;
      const P = vec3Array(posAcc);
      const n = posAcc.getCount();
      const jointSets = [];
      if (jointMats) {
        for (let s = 0; s < 4; s++) {
          const j = prim.getAttribute(`JOINTS_${s}`);
          const w = prim.getAttribute(`WEIGHTS_${s}`);
          if (j && w) jointSets.push([j, w]);
        }
      }
      if (jointSets.length === 0) {
        for (let i = 0; i < n; i++) {
          transformPoint(world, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], p);
          emit(p[0], p[1], p[2]);
        }
        continue;
      }
      const jv = [0, 0, 0, 0];
      const wv = [0, 0, 0, 0];
      const t = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const x = P[i * 3];
        const y = P[i * 3 + 1];
        const z = P[i * 3 + 2];
        let ax = 0;
        let ay = 0;
        let az = 0;
        let wsum = 0;
        for (const [ja, wa] of jointSets) {
          ja.getElement(i, jv);
          wa.getElement(i, wv);
          for (let k = 0; k < 4; k++) {
            const w = wv[k];
            if (w <= 0) continue;
            const m = jointMats[jv[k]];
            if (!m) continue;
            transformPoint(m, x, y, z, t);
            ax += w * t[0];
            ay += w * t[1];
            az += w * t[2];
            wsum += w;
          }
        }
        if (wsum > 0) emit(ax / wsum, ay / wsum, az / wsum);
        else emit(x, y, z);
      }
    }
  });
}

/** 既定シーンのワールド AABB。頂点が無ければ null */
export function computeBounds(scene, pre = null) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  forEachWorldPosition(
    scene,
    (x, y, z) => {
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
      count++;
    },
    pre,
  );
  return count === 0 ? null : { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Primitive の三角形数（TRIANGLES / STRIP / FAN のみ。他は 0） */
export function primitiveTriangleCount(prim) {
  const idx = prim.getIndices();
  const pos = prim.getAttribute('POSITION');
  const n = idx ? idx.getCount() : pos ? pos.getCount() : 0;
  switch (prim.getMode()) {
    case 4:
      return Math.floor(n / 3);
    case 5:
    case 6:
      return Math.max(0, n - 2);
    default:
      return 0;
  }
}

export function meshTriangleCount(mesh) {
  return mesh.listPrimitives().reduce((s, p) => s + primitiveTriangleCount(p), 0);
}

/** 既定シーンから見える三角形数（メッシュを複数ノードが参照していればその分も数える） */
export function sceneTriangleCount(scene) {
  let total = 0;
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (mesh) total += meshTriangleCount(mesh);
  });
  return total;
}

/**
 * 「正面がどっちか」の弱い推定（人型キャラ向け）。
 * 胴体スライス(35-65%高)の BBox 中心を基準に、足元スライス(下6%)がどちら側へ突き出しているか（足先は前へ長い）だけを見る。
 * 腕・髪・武器などで外れるので、あくまでヒント。最終確認は目視で。
 * @returns {{ dir: '+z'|'-z'|'+x'|'-x'|null, confidence: 'low'|'medium'|null, note: string }}
 */
export function guessFacing(scene, bounds) {
  if (!bounds) return { dir: null, confidence: null, note: '頂点なし' };
  const h = bounds.size[1];
  if (h <= 0) return { dir: null, confidence: null, note: '高さ 0' };
  const yFoot = bounds.min[1] + h * 0.06;
  const yTorsoLo = bounds.min[1] + h * 0.35;
  const yTorsoHi = bounds.min[1] + h * 0.65;
  // 胴体スライスは頂点密度（簡略化で偏る）に左右されないよう、重心ではなく BBox 中心を使う
  let txMin = Infinity;
  let txMax = -Infinity;
  let tzMin = Infinity;
  let tzMax = -Infinity;
  let tn = 0;
  const feet = [];
  forEachWorldPosition(scene, (x, y, z) => {
    if (y >= yTorsoLo && y <= yTorsoHi) {
      if (x < txMin) txMin = x;
      if (x > txMax) txMax = x;
      if (z < tzMin) tzMin = z;
      if (z > tzMax) tzMax = z;
      tn++;
    } else if (y <= yFoot) {
      feet.push(x, z);
    }
  });
  if (tn === 0 || feet.length === 0) return { dir: null, confidence: null, note: '胴体/足スライスなし' };
  const tx = (txMin + txMax) / 2;
  const tz = (tzMin + tzMax) / 2;
  let maxX = -Infinity;
  let minX = Infinity;
  let maxZ = -Infinity;
  let minZ = Infinity;
  for (let i = 0; i < feet.length; i += 2) {
    const dx = feet[i] - tx;
    const dz = feet[i + 1] - tz;
    if (dx > maxX) maxX = dx;
    if (dx < minX) minX = dx;
    if (dz > maxZ) maxZ = dz;
    if (dz < minZ) minZ = dz;
  }
  // 各軸の「前後の非対称量」: 正なら + 側へ足先が突き出ている
  const asymX = maxX + minX;
  const asymZ = maxZ + minZ;
  const useZ = Math.abs(asymZ) >= Math.abs(asymX);
  const asym = useZ ? asymZ : asymX;
  const ratio = Math.abs(asym) / h;
  if (ratio < 0.012) {
    return { dir: null, confidence: null, note: `足元の非対称が小さい (${(ratio * 100).toFixed(1)}% of height) ため判定不能` };
  }
  const dir = `${asym > 0 ? '+' : '-'}${useZ ? 'z' : 'x'}`;
  return {
    dir,
    confidence: ratio > 0.03 ? 'medium' : 'low',
    note: `足元スライスの非対称 ${(ratio * 100).toFixed(1)}% of height`,
  };
}
