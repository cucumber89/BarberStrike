import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DOM, TEAM_COLORS, type MapDef } from "@frankibarber/shared";
import type { NetFlag } from "../net/Connection";

const NEUTRAL = "#9a9a9a";
const CONTESTED = "#ff7a3d";

interface FlagView {
  pole: Mesh; banner: Mesh; ring: Mesh; beacon: Mesh;
  bannerMat: StandardMaterial; ringMat: StandardMaterial; beaconMat: StandardMaterial;
  tex: DynamicTexture;
  drawnOwner: number;
}

/**
 * Domination flags in the world (drop 4): a pole with a lettered banner (owner colour), a ground
 * ring the size of the capture zone (capturing team's colour while progress runs, pulsing orange
 * while contested) and a tall dim beacon so the objective reads from across the map.
 */
export class Flags {
  private views: FlagView[] = [];
  private time = 0;

  constructor(private scene: Scene, private map: MapDef, private source: () => ArrayLike<NetFlag> | undefined) {
    for (const f of map.flags) this.views.push(this.make(f.id, f.x, f.y, f.z));
  }

  private mat(name: string, hex: string, alpha = 1): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.Black();
    m.emissiveColor = Color3.FromHexString(hex);
    m.disableLighting = true;
    m.alpha = alpha;
    m.backFaceCulling = false;
    return m;
  }

  private make(id: string, x: number, y: number, z: number): FlagView {
    const s = this.scene;
    const pole = MeshBuilder.CreateCylinder(`flag_pole_${id}`, { diameter: 0.08, height: 3.2, tessellation: 8 }, s);
    pole.position.set(x, y + 1.6, z);
    pole.material = this.mat(`flag_pole_m_${id}`, "#3a3a40");
    const tex = new DynamicTexture(`flag_tex_${id}`, { width: 128, height: 80 }, s, false);
    const bannerMat = new StandardMaterial(`flag_banner_m_${id}`, s);
    bannerMat.diffuseTexture = tex; bannerMat.emissiveTexture = tex; bannerMat.disableLighting = true; bannerMat.backFaceCulling = false;
    const banner = MeshBuilder.CreatePlane(`flag_banner_${id}`, { width: 0.9, height: 0.56 }, s);
    banner.position.set(x, y + 2.85, z);
    banner.billboardMode = Mesh.BILLBOARDMODE_Y;
    banner.material = bannerMat;
    const ringMat = this.mat(`flag_ring_m_${id}`, NEUTRAL, 0.55);
    const ring = MeshBuilder.CreateTorus(`flag_ring_${id}`, { diameter: DOM.radius * 2, thickness: 0.12, tessellation: 40 }, s);
    ring.position.set(x, y + 0.06, z);
    ring.material = ringMat;
    const beaconMat = this.mat(`flag_beacon_m_${id}`, NEUTRAL, 0.12);
    const beacon = MeshBuilder.CreateCylinder(`flag_beacon_${id}`, { diameter: 0.5, height: 14, tessellation: 12 }, s);
    beacon.position.set(x, y + 7, z);
    beacon.material = beaconMat;
    for (const m of [pole, banner, ring, beacon]) { m.isPickable = false; m.receiveShadows = false; }
    const v: FlagView = { pole, banner, ring, beacon, bannerMat, ringMat, beaconMat, tex, drawnOwner: -2 };
    this.draw(v, id, -1);
    return v;
  }

  private draw(v: FlagView, id: string, owner: number): void {
    const ctx = v.tex.getContext() as CanvasRenderingContext2D;
    const hex = owner === 0 ? TEAM_COLORS[0] : owner === 1 ? TEAM_COLORS[1] : NEUTRAL;
    ctx.fillStyle = hex; ctx.fillRect(0, 0, 128, 80);
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.font = '700 58px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(id, 64, 42);
    v.tex.update(false);
    v.drawnOwner = owner;
  }

  update(dtMs: number): void {
    this.time += dtMs / 1000;
    const flags = this.source();
    if (!flags) return;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i], f = flags[i];
      if (!f) continue;
      if (v.drawnOwner !== f.owner) {
        this.draw(v, this.map.flags[i].id, f.owner);
        v.beaconMat.emissiveColor = Color3.FromHexString(f.owner === -1 ? NEUTRAL : TEAM_COLORS[f.owner as 0 | 1]);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      if (f.contested) {
        v.ringMat.emissiveColor = Color3.FromHexString(CONTESTED);
        v.ringMat.alpha = 0.35 + 0.5 * pulse;
      } else if (f.capTeam !== -1 && f.cap > 0) {
        v.ringMat.emissiveColor = Color3.FromHexString(TEAM_COLORS[f.capTeam as 0 | 1]);
        v.ringMat.alpha = 0.4 + 0.5 * f.cap;
        // The ring tightens towards the pole as the capture runs.
        v.ring.scaling.setAll(1 - 0.35 * f.cap);
      } else {
        v.ringMat.emissiveColor = Color3.FromHexString(f.owner === -1 ? NEUTRAL : TEAM_COLORS[f.owner as 0 | 1]);
        v.ringMat.alpha = 0.55;
      }
      if (!(f.capTeam !== -1 && f.cap > 0)) v.ring.scaling.setAll(1);
    }
  }

  dispose(): void {
    for (const v of this.views) {
      v.pole.dispose(); v.banner.dispose(); v.ring.dispose(); v.beacon.dispose();
      v.bannerMat.dispose(); v.ringMat.dispose(); v.beaconMat.dispose(); v.tex.dispose();
    }
    this.views.length = 0;
  }
}
