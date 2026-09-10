import type { Box, LightHint } from "@frankibarber/shared";

/** Bake local lights once. Ambient and moon reserve two shader slots; distant range spheres
 * must not spend the remaining slots just because they occur first in the map's list.
 */
export function selectPracticals(box: Box, lights: readonly LightHint[], slots: number): number[] {
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
  return lights.map((l, i) => {
    const dx = Math.max(box.minX-l.x,0,l.x-box.maxX), dy = Math.max(box.minY-l.y,0,l.y-box.maxY), dz = Math.max(box.minZ-l.z,0,l.z-box.maxZ);
    const near = dx*dx + dy*dy + dz*dz;
    const centre = (cx-l.x)**2 + (cy-l.y)**2 + (cz-l.z)**2;
    return { i, score: near < l.range*l.range ? l.intensity / (1 + near + centre * .25) : -1 };
  }).filter(v => v.score >= 0).sort((a,b) => b.score-a.score || a.i-b.i).slice(0,Math.max(0,slots)).map(v=>v.i);
}
