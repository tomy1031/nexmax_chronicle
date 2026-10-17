// glTF-Transform の NodeIO を、このプロジェクトで必要な拡張・デコーダ込みで作る。
//   - Tripo の GLB は通常 Draco/Meshopt なしだが、念のため読み込み側で両方デコード可能にしている
//   - 書き出し側では EXT_meshopt_compression / EXT_texture_webp を使えるようにしてある

import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

let dracoDecoderPromise = null;

/**
 * @param {{ verbose?: boolean }} [opts]
 * @returns {Promise<NodeIO>}
 */
export async function createIO(opts = {}) {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  dracoDecoderPromise ??= draco3d.createDecoderModule();
  const io = new NodeIO()
    .setLogger(new Logger(opts.verbose ? Logger.Verbosity.INFO : Logger.Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
      'draco3d.decoder': await dracoDecoderPromise,
    });
  return io;
}

export { MeshoptEncoder };
