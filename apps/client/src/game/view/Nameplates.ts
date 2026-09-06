import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TEAM_COLORS, makeRayHit, type CollisionWorld, type Team } from "@frankibarber/shared";
import type { RemotePlayer } from "../player/RemotePlayer";

const MAX_DIST = 28;
const hit = makeRayHit();

/**
 * Small billboard name tags above TEAMMATES only, shown when within range and in line of sight
 * (never through walls; enemies never get one — readability of the silhouette is their tell).
 */
export class Nameplates {
  private plates = new Map<string, { mesh: Mesh; mat: StandardMaterial; tex: DynamicTexture }>();
  private tmp = new Vector3();

  constructor(private scene: Scene, private world: CollisionWorld, private myTeam: () => Team) {}

  private make(p: RemotePlayer) {
    const tex = new DynamicTexture(`plate_${p.id}`, { width: 256, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '600 30px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillText(p.name, 130, 34);
    ctx.fillStyle = TEAM_COLORS[p.team]; ctx.fillText(p.name, 128, 32);
    tex.update(false);
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`plateMat_${p.id}`, this.scene);
    mat.diffuseTexture = tex; mat.opacityTexture = tex;
    mat.emissiveColor = Color3.White(); mat.disableLighting = true;
    mat.backFaceCulling = false;
    const mesh = MeshBuilder.CreatePlane(`plate_${p.id}`, { width: 0.9, height: 0.225 }, this.scene);
    mesh.material = mat;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.renderingGroupId = 0;
    const entry = { mesh, mat, tex };
    this.plates.set(p.id, entry);
    return entry;
  }

  update(remotes: ReadonlyMap<string, RemotePlayer>, eye: Vector3): void {
    const team = this.myTeam();
    for (const [id, entry] of this.plates) if (!remotes.has(id)) { this.dispose1(entry); this.plates.delete(id); }
    for (const p of remotes.values()) {
      const entry = this.plates.get(p.id) ?? (p.team === team ? this.make(p) : null);
      if (!entry) continue;
      let visible = p.team === team && p.alive;
      if (visible) {
        p.eye(this.tmp);
        const dx = this.tmp.x - eye.x, dy = this.tmp.y - eye.y, dz = this.tmp.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        visible = d < MAX_DIST && d > 0.5;
        if (visible) {
          this.world.raycast(eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, d, hit);
          visible = !hit.hit;
        }
      }
      entry.mesh.setEnabled(visible);
      if (visible) {
        entry.mesh.position.set(p.x, p.y + (p.crouch ? 1.55 : 2.05), p.z);
        const s = 0.6 + Math.min(1.2, Math.hypot(p.x - eye.x, p.z - eye.z) / 12);
        entry.mesh.scaling.setAll(s);
      }
    }
  }

  private dispose1(e: { mesh: Mesh; mat: StandardMaterial; tex: DynamicTexture }): void {
    e.mesh.dispose(); e.mat.dispose(); e.tex.dispose();
  }

  dispose(): void {
    for (const e of this.plates.values()) this.dispose1(e);
    this.plates.clear();
  }
}
