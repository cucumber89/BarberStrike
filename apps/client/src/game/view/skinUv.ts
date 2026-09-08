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
