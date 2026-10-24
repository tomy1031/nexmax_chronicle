// マツイ社長・佐伯さん（GLB の人）の顔の「ほうれい線のような線」を消す（オーナーの感想：社長をアップにすると、陰で線が出る）。
// 原因：人の輪郭線は、体を法線の向きへ少しふくらませた裏返しの殻（world/characters.ts の addOutline）。
// 鼻のわき・口のまわりのくぼみでは、その殻が顔の前へはみ出して、鼻から口のはしへ向かう黒い線に見える（アップほど目立つ）。
// 共有の読み込み（world/*）は変えずに、2026 年の側で、この人たちの殻だけを直す：
//   ① 殻から「顔の前の肌」の三角形をぬく（テクスチャの色が肌で、頭の高さで、法線が前を向いている物）。
//      まわりの形の線（あご・ほお・髪のふち）は残る
//   ② 殻を深さの上で少し奥へ（polygonOffset）。小さなくぼみでは、顔の面が殻をかくす
import * as THREE from 'three'
import type { Character } from '../../../world/characters'

/** 肌の色か（Tripo の肌：明るいだいだい。髪の茶・目の白黒・服はちがう） */
function isSkin(r: number, g: number, b: number): boolean {
  return r > 150 && r - b > 55 && g > 85 && r >= g && g >= b - 10 && r + g + b > 330
}

type PixelReader = (u: number, v: number) => [number, number, number] | null

/** マテリアルの色のテクスチャから、UV の色を読む（読めなければ null） */
function pixelReader(tex: THREE.Texture | null): PixelReader | null {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (!img || !img.width || typeof document === 'undefined') return null
  let data: ImageData
  try {
    const w = Math.min(512, img.width)
    const h = Math.min(512, img.height)
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const g = cv.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    g.drawImage(img, 0, 0, w, h)
    data = g.getImageData(0, 0, w, h)
  } catch {
    return null
  }
  const flip = tex?.flipY ?? false
  return (u, v) => {
    const x = Math.max(0, Math.min(data.width - 1, Math.floor((u - Math.floor(u)) * data.width)))
    const vv = v - Math.floor(v)
    const y = Math.max(0, Math.min(data.height - 1, Math.floor((flip ? 1 - vv : vv) * data.height)))
    const i = (y * data.width + x) * 4
    return [data.data[i], data.data[i + 1], data.data[i + 2]]
  }
}

/**
 * 顔の輪郭線を直す。ch.root の中の、輪郭線の殻（裏面だけを描く黒い Basic）を探して、
 * 顔の前の肌の三角形をぬいた形にさしかえ、深さを少し奥へ。直した殻の数を返す
 */
export function smoothFaceOutline(ch: Character): number {
  if (ch.placeholder) return 0
  const root = ch.root
  root.updateMatrixWorld(true)
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const h = ch.height
  let fixed = 0
  const shells: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.userData.noOutline) return
    const mat = m.material as THREE.MeshBasicMaterial
    if (!mat || Array.isArray(mat) || mat.side !== THREE.BackSide) return
    shells.push(m)
  })
  for (const shell of shells) {
    const body = shell.parent as THREE.Mesh | null
    const bodyMat = body && (body as THREE.Mesh).isMesh ? (body.material as THREE.MeshStandardMaterial) : null
    const read = pixelReader(bodyMat && !Array.isArray(bodyMat) ? (bodyMat.map ?? null) : null)
    const src = shell.geometry
    const pos = src.attributes.position as THREE.BufferAttribute | undefined
    const nrm = src.attributes.normal as THREE.BufferAttribute | undefined
    const uv = src.attributes.uv as THREE.BufferAttribute | undefined
    // ② 深さを少し奥へ（くぼみで殻が前へ出ない）
    const mat = shell.material as THREE.MeshBasicMaterial
    mat.polygonOffset = true
    mat.polygonOffsetFactor = 2
    mat.polygonOffsetUnits = 40
    mat.needsUpdate = true
    fixed++
    if (!pos || !nrm || !uv || !read) continue
    // ① 顔の前の肌の三角形をぬく
    const m = new THREE.Matrix4().multiplyMatrices(toRoot, shell.matrixWorld)
    const nm = new THREE.Matrix3().getNormalMatrix(m)
    const P = new THREE.Vector3()
    const N = new THREE.Vector3()
    const tri = src.index ? src.index.count / 3 : pos.count / 3
    const idx = (k: number) => (src.index ? src.index.getX(k) : k)
    const keep: number[] = []
    let dropped = 0
    for (let t = 0; t < tri; t++) {
      const a = idx(t * 3)
      const b = idx(t * 3 + 1)
      const c = idx(t * 3 + 2)
      let y = 0
      let nz = 0
      let u = 0
      let v = 0
      for (const k of [a, b, c]) {
        P.fromBufferAttribute(pos, k).applyMatrix4(m)
        N.fromBufferAttribute(nrm, k).applyMatrix3(nm).normalize()
        y += P.y / 3
        nz += N.z / 3
        u += uv.getX(k) / 3
        v += uv.getY(k) / 3
      }
      // 頭の高さ（あごの下〜まゆ）で、前（-Z）を向いた面
      const face = y > h * 0.7 && y < h * 0.93 && nz < -0.5
      let drop = false
      if (face) {
        const px = read(u, v)
        drop = !!px && isSkin(px[0], px[1], px[2])
      }
      if (drop) dropped++
      else keep.push(a, b, c)
    }
    if (!dropped) continue
    const g = new THREE.BufferGeometry()
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.attributes[name])
    g.setIndex(keep)
    g.boundingSphere = src.boundingSphere?.clone() ?? null
    g.boundingBox = src.boundingBox?.clone() ?? null
    if (!g.boundingSphere) g.computeBoundingSphere()
    shell.geometry = g
    // 古い形は本体がまだ使っている（解放しない）。新しい形は、殻を外すときにシェルが解放する
  }
  return fixed
}
