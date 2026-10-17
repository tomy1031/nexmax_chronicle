// Document の統計を集めて表示する（process-model の before/after と inspect-model の両方で使う）

import { computeBounds, meshTriangleCount, sceneTriangleCount } from './geometry.mjs';

export function formatBytes(n) {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const fmt = (n, d = 3) => (Math.abs(n) < 5e-7 ? '0' : Number(n.toFixed(d)).toString());
const fmtVec = (v, d = 3) => `[${v.map((x) => fmt(x, d)).join(', ')}]`;

const TEXTURE_SLOTS = [
  ['baseColorTexture', 'getBaseColorTexture'],
  ['normalTexture', 'getNormalTexture'],
  ['occlusionTexture', 'getOcclusionTexture'],
  ['emissiveTexture', 'getEmissiveTexture'],
  ['metallicRoughnessTexture', 'getMetallicRoughnessTexture'],
];

/**
 * @param {import('@gltf-transform/core').Document} doc
 * @param {number|null} fileBytes
 */
export function collectStats(doc, fileBytes = null) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? null;

  const meshes = root.listMeshes().map((mesh) => {
    const prims = mesh.listPrimitives();
    return {
      name: mesh.getName() || '(unnamed)',
      primitives: prims.length,
      triangles: meshTriangleCount(mesh),
      vertices: prims.reduce((s, p) => s + (p.getAttribute('POSITION')?.getCount() ?? 0), 0),
      attributes: [...new Set(prims.flatMap((p) => p.listSemantics()))],
      morphTargets: Math.max(0, ...prims.map((p) => p.listTargets().length)),
    };
  });

  const materials = root.listMaterials().map((m) => ({
    name: m.getName() || '(unnamed)',
    baseColorFactor: m.getBaseColorFactor().map((v) => Number(v.toFixed(3))),
    metallic: Number(m.getMetallicFactor().toFixed(3)),
    roughness: Number(m.getRoughnessFactor().toFixed(3)),
    alphaMode: m.getAlphaMode(),
    doubleSided: m.getDoubleSided(),
    slots: TEXTURE_SLOTS.filter(([, getter]) => m[getter]()).map(([slot]) => slot),
    extensions: m.listExtensions?.().map((e) => e.extensionName) ?? [],
  }));

  const slotByTexture = new Map();
  for (const m of root.listMaterials()) {
    for (const [slot, getter] of TEXTURE_SLOTS) {
      const t = m[getter]();
      if (t) slotByTexture.set(t, [...(slotByTexture.get(t) ?? []), slot]);
    }
  }
  const textures = root.listTextures().map((t) => {
    const size = t.getSize();
    const image = t.getImage();
    return {
      name: t.getName() || t.getURI() || '(unnamed)',
      width: size?.[0] ?? null,
      height: size?.[1] ?? null,
      mimeType: t.getMimeType(),
      bytes: image ? image.byteLength : 0,
      slots: slotByTexture.get(t) ?? [],
    };
  });

  const skins = root.listSkins().map((s) => ({ name: s.getName() || '(unnamed)', joints: s.listJoints().length }));
  const animations = root.listAnimations().map((a) => {
    let duration = 0;
    for (const ch of a.listChannels()) {
      const input = ch.getSampler()?.getInput();
      if (input && input.getCount() > 0) duration = Math.max(duration, input.getMax([])[0]);
    }
    return { name: a.getName() || '(unnamed)', channels: a.listChannels().length, duration: Number(duration.toFixed(3)) };
  });

  const bounds = scene ? computeBounds(scene) : null;

  return {
    fileBytes,
    sceneCount: root.listScenes().length,
    nodeCount: root.listNodes().length,
    meshes,
    triangles: scene ? sceneTriangleCount(scene) : 0,
    vertices: meshes.reduce((s, m) => s + m.vertices, 0),
    materials,
    textures,
    textureBytes: textures.reduce((s, t) => s + t.bytes, 0),
    skins,
    animations,
    bounds,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
    extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName),
  };
}

/** 人間向けの複数行テキスト */
export function formatStats(s, { detail = true } = {}) {
  const L = [];
  L.push(`  ファイルサイズ : ${formatBytes(s.fileBytes)}`);
  L.push(`  三角形 / 頂点  : ${s.triangles.toLocaleString()} tris / ${s.vertices.toLocaleString()} verts  (nodes ${s.nodeCount}, meshes ${s.meshes.length})`);
  if (s.bounds) {
    L.push(`  BBox min       : ${fmtVec(s.bounds.min)}`);
    L.push(`  BBox max       : ${fmtVec(s.bounds.max)}`);
    L.push(`  サイズ (W,H,D) : ${fmtVec(s.bounds.size)}   ※ H=Y, D=Z`);
  } else {
    L.push('  BBox           : (頂点なし)');
  }
  if (s.textures.length === 0) {
    L.push('  テクスチャ     : なし');
  } else {
    L.push(`  テクスチャ     : ${s.textures.length} 枚 / 合計 ${formatBytes(s.textureBytes)}`);
    for (const t of s.textures) {
      const dim = t.width ? `${t.width}x${t.height}` : '?x?';
      L.push(`    - ${dim.padEnd(10)} ${t.mimeType.replace('image/', '').padEnd(5)} ${formatBytes(t.bytes).padStart(10)}  [${t.slots.join(', ') || '未割り当て'}] ${t.name}`);
    }
  }
  if (detail) {
    for (const m of s.meshes) {
      L.push(
        `  mesh "${m.name}": prims ${m.primitives}, ${m.triangles.toLocaleString()} tris, ${m.vertices.toLocaleString()} verts, attrs {${m.attributes.join(',')}}${m.morphTargets ? `, morph targets ${m.morphTargets}` : ''}`,
      );
    }
    for (const m of s.materials) {
      L.push(
        `  material "${m.name}": baseColor ${fmtVec(m.baseColorFactor, 2)} metal ${m.metallic} rough ${m.roughness} alpha ${m.alphaMode}${m.doubleSided ? ' doubleSided' : ''} tex {${m.slots.join(',')}}${m.extensions.length ? ` ext {${m.extensions.join(',')}}` : ''}`,
      );
    }
  }
  L.push(`  スキン         : ${s.skins.length ? s.skins.map((k) => `${k.name}(${k.joints} joints)`).join(', ') : 'なし'}`);
  L.push(
    `  アニメーション : ${s.animations.length ? s.animations.map((a) => `${a.name}(${a.duration}s, ${a.channels}ch)`).join(', ') : 'なし'}`,
  );
  L.push(`  extensionsUsed : ${s.extensionsUsed.join(', ') || '-'}${s.extensionsRequired.length ? `   (required: ${s.extensionsRequired.join(', ')})` : ''}`);
  return L.join('\n');
}
