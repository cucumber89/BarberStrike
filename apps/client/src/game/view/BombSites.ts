import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { BOMB, sitesOf, type BombData, type MapDef } from "@frankibarber/shared";

/** Physical, occluded site markings and an in-world procedural charge. */
export class BombSites {
  private meshes: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private charge: Mesh;
  private led: StandardMaterial;
  /**
   * The sites belong to the MAP, not to the module: a second map (GÓRA) plants in its own rooms.
   * The map the round is running is the one the context already resolved (`Game.start`), so it is
   * passed in rather than imported — importing one would paint NIGHT_DISTRICT's pair on every map.
   */
  constructor(scene: Scene, map: MapDef) {
    const mat = (name: string, hex: string) => {
      const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(0.3); m.specularColor = Color3.Black();
      this.materials.push(m); return m;
    };
    const yellow = mat("site_paint", "#e5ae52");
    for (const site of sitesOf(map)) {
      // main's #14 replaced an 80 m² hazard-striped plate with a ring and a 3 × 1.5 m label. That is
      // a better answer to the overdraw this branch set out to fix — 4.5 m² of alpha instead of 80 —
      // so its geometry is what survives the merge. What this branch adds back is the discipline the
      // old plate was missing and this one still is: a decal is emissive PAINT, so walking the
      // scene's lights per fragment for it buys nothing (each site sits under its own point light),
      // one texture sample beats two, and nothing here ever moves, so nothing should be re-evaluated
      // per frame. The ordering problem underneath was map data (see `floorAudit.test.ts`).
      const ring = MeshBuilder.CreateTorus(`site_${site.id}`, { diameter: BOMB.useRadius * 2, thickness: 0.065, tessellation: 32 }, scene);
      ring.position.set(site.x, site.y + 0.045, site.z); ring.material = yellow;
      ring.freezeWorldMatrix(); ring.doNotSyncBoundingInfo = true; this.meshes.push(ring);
      const texture = new DynamicTexture(`site_label_${site.id}`, { width: 512, height: 256 }, scene, false);
      texture.drawText(`${site.id} / ${site.name}`, null, 150, "bold 44px Arial", "#e5ae52", "#192022", true);
      const label = mat(`site_label_${site.id}`, "#ffffff");
      label.diffuseTexture = texture; label.emissiveTexture = texture;
      label.disableLighting = true; label.backFaceCulling = true; label.zOffset = -2;
      label.freeze();
      const plate = MeshBuilder.CreateGround(`site_plate_${site.id}`, { width: 3, height: 1.5 }, scene);
      plate.position.set(site.x, site.y + 0.035, site.z); plate.material = label;
      plate.freezeWorldMatrix(); plate.doNotSyncBoundingInfo = true; this.meshes.push(plate);
    }
    this.charge = MeshBuilder.CreateBox("bomb_charge", { width: 0.5, height: 0.24, depth: 0.36 }, scene);
    this.charge.material = mat("bomb_case", "#4b5746"); this.meshes.push(this.charge);
    const strap = mat("bomb_straps", "#20292d");
    for (const x of [-0.16, 0.16]) {
      const m = MeshBuilder.CreateBox("bomb_strap", { width: 0.045, height: 0.25, depth: 0.37 }, scene);
      m.parent = this.charge; m.position.x = x; m.material = strap;
    }
    const screen = MeshBuilder.CreateBox("bomb_display", { width: 0.15, height: 0.02, depth: 0.12 }, scene);
    screen.parent = this.charge; screen.position.y = 0.13;
    this.led = mat("bomb_led", "#ff493b"); screen.material = this.led;
    for (const m of this.meshes) m.isPickable = false;
  }
  update(b: BombData, now: number): void {
    this.charge.setEnabled(b.stage === "dropped" || b.stage === "planted");
    this.charge.position.set(b.x, b.y + 0.13, b.z);
    const beat = b.stage === "planted" ? Math.max(110, (b.endsAt - now) / 45) : 1000;
    this.led.emissiveColor.set(Math.floor(now / beat) % 2 ? 1 : 0.2, 0.04, 0.02);
  }
  dispose(): void { for (const m of this.meshes) m.dispose(); for (const m of this.materials) m.dispose(false, true); }
}
