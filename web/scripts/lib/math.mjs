// 4x4 行列ユーティリティ（glTF と同じ列優先 = column-major の number[16]）。
// gl-matrix を直接 import しなくて済むよう、必要最小限だけここに持つ。

export const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a * b （b を先に適用） */
export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export const scaling = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];

export const translation = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Y 軸まわり回転。x' = c*x + s*z, z' = -s*x + c*z （three.js の Matrix4.makeRotationY と同じ向き） */
export function rotationY(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Y 軸まわり回転のクォータニオン [x,y,z,w] */
export const quatY = (rad) => [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)];

/** 点を変換して out に書く */
export function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

export const deg2rad = (d) => (d * Math.PI) / 180;
