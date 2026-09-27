/**
 * Every voxel model the client can place: the catalogue furniture (`voxelModels.ts`) and the
 * hero pieces drawn from photographs (`voxelHero.ts`). Maps and the prop builder look up here.
 */
import { HERO_MODELS, HERO_TEXT } from "./voxelHero";
import { VOXEL_MODELS, VOXEL_TEXT } from "./voxelModels";
import type { VoxelModel } from "./voxel";

export const VOXEL_LIBRARY: Readonly<Record<string, VoxelModel>> = { ...VOXEL_MODELS, ...HERO_MODELS };
export const VOXEL_LIBRARY_TEXT: Readonly<Record<string, string>> = { ...VOXEL_TEXT, ...HERO_TEXT };

/** The model, or a loud error — a map naming a model that does not exist is a bug, not a gap. */
export function voxelModel(id: string): VoxelModel {
  const m = VOXEL_LIBRARY[id];
  if (!m) throw new Error(`voxel: no model "${id}"`);
  return m;
}
