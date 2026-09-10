import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { MapDef, MaterialTag } from "@frankibarber/shared";
import type { AddPiece } from "./dressing";
import { DISTRICT_LANDMARKS } from "./districtLandmarkData";

/** One rooftop silhouette per district area. Anchors are actual named solids, so a moved
 * building carries its landmark with it. Pieces are shared-tag batches, never new materials.
 * Occupied decks use surface relief instead of rooftop objects players could walk through.
 */
export function buildDistrictLandmarks(scene: Scene, map: MapDef, add: AddPiece): void {
  for (const landmark of DISTRICT_LANDMARKS) {
    const solid = map.solids.find(s => s.name === landmark.anchor);
    if (!solid) throw new Error(`Missing district landmark anchor: ${landmark.anchor}`);
    const b = solid.box;
    for (const [i, p] of landmark.pieces.entries()) {
      const [x,y,z,w,h,d,tag,shape,rz] = p;
      const mesh = shape === "cylinder"
        ? MeshBuilder.CreateCylinder(`${landmark.area}_${i}`, {diameter:w,height:h,tessellation:8},scene)
        : MeshBuilder.CreateBox(`${landmark.area}_${i}`, {width:w,height:h,depth:d},scene);
      mesh.position.set(b.minX+x,b.maxY+y,b.minZ+z);
      if (rz) mesh.rotation.z = rz;
      if (shape === "cylinder") mesh.convertToFlatShadedMesh();
      add(mesh, tag as MaterialTag);
    }
  }
}
