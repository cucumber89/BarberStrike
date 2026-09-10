/** Data evidence uses the real shared collision and floor audit, never a screenshot estimate.
 * Run with tsx; optional MAP_BASELINE points to an untouched baseline map.ts copy.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { NIGHT_DISTRICT, buildCollisionWorld, type MapDef } from "../../../../packages/shared/src/map";
import { coplanarTopFaces, siteLoad } from "../../../../packages/shared/src/floorAudit";
import { makeRayHit } from "../../../../packages/shared/src/collision";
import { PLAYER } from "../../../../packages/shared/src/constants";

function audit(map: MapDef) {
  const world=buildCollisionWorld(map), dark: number[][]=[], lit: number[][]=[];
  for(let x=-44;x<=52;x+=4) for(let z=-20;z<=40;z+=4) {
    const hit=world.raycast(x,.25,z,0,-1,0,.5,makeRayHit());
    if(!hit.hit || world.overlaps(x-PLAYER.halfWidth,.2,z-PLAYER.halfWidth,x+PLAYER.halfWidth,PLAYER.height,z+PLAYER.halfWidth)) continue;
    (map.lights.some(l=>Math.hypot(x-l.x,l.y,z-l.z)<l.range)?lit:dark).push([x,z]);
  }
  const collision=JSON.stringify({solids:map.solids.map(s=>({name:s.name,box:s.box})),spawns:map.spawns,arenaSpawns:map.arenaSpawns,stations:map.stations,flags:map.flags});
  return {solids:map.solids.length,props:map.props.length,lights:map.lights.length,colors:[...new Set(map.lights.map(l=>l.color))],
    coplanar:coplanarTopFaces(map.solids),sites:siteLoad(map),lit:lit.length,dark:dark.length,darkSamples:dark,
    collisionAndRoutesSha256:createHash("sha256").update(collision).digest("hex")};
}
const baseline=process.env.MAP_BASELINE ? audit((await import(pathToFileURL(process.env.MAP_BASELINE).href)).NIGHT_DISTRICT) : undefined;
console.log(JSON.stringify({baseline,after:audit(NIGHT_DISTRICT)},null,2));
