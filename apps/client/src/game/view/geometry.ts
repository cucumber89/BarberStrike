import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/** Eight-sided box profile: bevels catch the light without textures or imported meshes. */
export function beveledBox(name: string, w: number, h: number, d: number, scene: Scene): Mesh {
  const x = w / 2, y = h / 2, bevel = Math.min(w, h, d) * 0.18;
  const ring = [[-x + bevel, -y], [x - bevel, -y], [x, -y + bevel], [x, y - bevel],
    [x - bevel, y], [-x + bevel, y], [-x, y - bevel], [-x, -y + bevel]];
  const positions: number[] = [], indices: number[] = [], normals: number[] = [];
  for (const z of [-d / 2, d / 2]) for (const [px, py] of ring) positions.push(px, py, z);
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) % 8;
    indices.push(i, n, i + 8, n, n + 8, i + 8);
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 8, 8 + i, 9 + i);
  // Babylon's default clockwise front faces.
  for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  // Match Babylon primitives' attributes so boxes and cylinders can share a merged weapon.
  data.uvs = positions.flatMap((_, i) => i % 3 === 0 ? [positions[i] / w + 0.5, positions[i + 1] / h + 0.5] : []);
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
  return mesh;
}
