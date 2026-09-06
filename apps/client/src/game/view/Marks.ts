import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TEAM_COLORS } from "@frankibarber/shared";
import type { RemotePlayer } from "../player/RemotePlayer";
import { hud, type HudMark } from "../store";

interface MarkView { mesh: Mesh; mat: StandardMaterial; tex: DynamicTexture; key: number }

/**
 * Team marks in the world (drop 5): a billboard with a chevron (go) or a red "!" (spot) and the
 * marker's name, scaled with distance so it reads from across the map, fading out before it expires.
 * A spot follows the spotted enemy while the mark lives.
 */
export class Marks {
  private views = new Map<number, MarkView>();

  constructor(private scene: Scene, private remotes: ReadonlyMap<string, RemotePlayer>, private eye: () => { x: number; y: number; z: number }) {}

  private make(m: HudMark): MarkView {
    const tex = new DynamicTexture(`mark_tex_${m.key}`, { width: 128, height: 128 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 128, 128);
    const color = m.kind === "spot" ? "#ff5a5a" : TEAM_COLORS[m.team];
    ctx.font = 'bold 72px "Inter", system-ui, sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 8; ctx.strokeStyle = "rgba(0,0,0,0.8)";
    const glyph = m.kind === "spot" ? "!" : "▼";
    ctx.strokeText(glyph, 64, 48); ctx.fillStyle = color; ctx.fillText(glyph, 64, 48);
    ctx.font = 'bold 22px "Inter", system-ui, sans-serif';
    ctx.lineWidth = 4; ctx.strokeText(m.name, 64, 104); ctx.fillStyle = "#fff"; ctx.fillText(m.name, 64, 104);
    tex.update(false);
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`mark_mat_${m.key}`, this.scene);
    mat.diffuseTexture = tex; mat.opacityTexture = tex;
    mat.emissiveColor = Color3.White(); mat.disableLighting = true; mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    const mesh = MeshBuilder.CreatePlane(`mark_${m.key}`, { size: 1 }, this.scene);
    mesh.material = mat;
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.renderingGroupId = 2; // over the world, like the HUD — a mark behind a wall still shows
    const v = { mesh, mat, tex, key: m.key };
    this.views.set(m.key, v);
    return v;
  }

  update(): void {
    const marks = hud.get().marks;
    const now = performance.now();
    for (const [key, v] of this.views) if (!marks.some((m) => m.key === key)) { this.dispose1(v); this.views.delete(key); }
    const eye = this.eye();
    for (const m of marks) {
      const v = this.views.get(m.key) ?? this.make(m);
      let x = m.x, y = m.y, z = m.z;
      if (m.kind === "spot" && m.target) { const r = this.remotes.get(m.target); if (r && r.alive) { x = r.x; y = r.y; z = r.z; } }
      const d = Math.hypot(x - eye.x, z - eye.z);
      v.mesh.position.set(x, y + 1.9 + Math.sin(now / 250) * 0.06, z);
      v.mesh.scaling.setAll(0.6 + Math.min(3, d / 10));
      const left = m.until - now;
      v.mesh.visibility = left < 1000 ? Math.max(0, left / 1000) : 1;
    }
  }

  private dispose1(v: MarkView): void { v.mesh.dispose(); v.mat.dispose(); v.tex.dispose(); }

  dispose(): void { for (const v of this.views.values()) this.dispose1(v); this.views.clear(); }
}
