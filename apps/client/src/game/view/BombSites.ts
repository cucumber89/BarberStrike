import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { BOMB, BOMB_SITES, type BombData } from "@frankibarber/shared";

/** Physical, occluded site markings and an in-world procedural charge. */
export class BombSites {
  private meshes: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private charge: Mesh;
  private led: StandardMaterial;
  constructor(scene: Scene) {
    const mat = (name: string, hex: string) => {
      const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(0.3); m.specularColor = Color3.Black();
      this.materials.push(m); return m;
    };
    const yellow = mat("site_paint", "#e5ae52");
    for (const site of BOMB_SITES) {
      const ring = MeshBuilder.CreateTorus(`site_${site.id}`, { diameter: BOMB.useRadius * 2, thickness: 0.065, tessellation: 32 }, scene);
      ring.position.set(site.x, site.y + 0.045, site.z); ring.material = yellow; this.meshes.push(ring);
      const texture = new DynamicTexture(`site_label_${site.id}`, { width: 512, height: 256 }, scene, false);
      texture.drawText(`${site.id} / ${site.name}`, null, 150, "bold 44px Arial", "#e5ae52", "#192022", true);
      const label = mat(`site_label_${site.id}`, "#ffffff"); label.diffuseTexture = texture; label.emissiveTexture = texture;
      const plate = MeshBuilder.CreateGround(`site_plate_${site.id}`, { width: 3, height: 1.5 }, scene);
      plate.position.set(site.x, site.y + 0.035, site.z); plate.material = label; this.meshes.push(plate);
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
