import { frameUv, type SkinFrame } from "@frankibarber/skins";

/** Root-space box projection preserves pattern scale across differently sized weapon parts. */
export function boxProjectUvs(positions: Float32Array | number[], normals: Float32Array | number[], metresPerTile = .32): Float32Array {
  if (positions.length % 3 || positions.length !== normals.length || !Number.isFinite(metresPerTile) || metresPerTile <= 0) {
    throw new RangeError("Invalid box projection input");
  }
  const uv = new Float32Array(positions.length / 3 * 2);
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const nx = Math.abs(normals[i]), ny = Math.abs(normals[i + 1]), nz = Math.abs(normals[i + 2]);
    const axis = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    uv[j] = (axis === 2 ? x : z) / metresPerTile + .5;
    uv[j + 1] = (axis === 1 ? x : y) / metresPerTile + .5;
  }
  return uv;
}

/**
 * Side-elevation projection onto a weapon's skin frame: z → u along the barrel, y → v inside the
 * flank's band, right flank in the upper half of the texture and left flank in the lower. Every
 * face lands somewhere inside its band, so a hero on the receiver appears once, the right way
 * round, on each side. See `frameUv` for the exact rule; this only walks the vertex buffers.
 */
export function sideProjectUvs(positions: Float32Array | number[], normals: Float32Array | number[], frame: SkinFrame): Float32Array {
  if (positions.length % 3 || positions.length !== normals.length) throw new RangeError("Invalid side projection input");
  const uv = new Float32Array(positions.length / 3 * 2);
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    const [u, v] = frameUv(frame, positions[i], positions[i + 1], positions[i + 2], normals[i], normals[i + 1], normals[i + 2]);
    uv[j] = u; uv[j + 1] = v;
  }
  return uv;
}
