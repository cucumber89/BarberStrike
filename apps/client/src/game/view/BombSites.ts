import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { BOMB, BOMB_SITES, type BombData } from "@frankibarber/shared";

export interface BombSiteHooks {
  /** One beep of the planted charge; `urgency` 0..1 over the fuse, ≥ 2 for the final long tone. */
  onBeep?(x: number, y: number, z: number, urgency: number): void;
  onPlanted?(x: number, y: number, z: number): void;
  onDefused?(x: number, y: number, z: number): void;
}

/**
 * Bomb sites (2.2): the plant zone painted on the floor the way a site is on a real map — a
 * hazard-striped border, the letter in the middle, a cross-hatch so the edge reads from any angle
 * — plus the charge itself: a satchel with a display, a wire loom and a red cell that beats faster
 * as the fuse runs down. A dropped charge gets a slow amber pulse and a thin vertical beacon so it
 * can be found from across the site.
 */
export class BombSites {
  private meshes: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private textures: DynamicTexture[] = [];
  private charge: Mesh;
  private beacon: Mesh;
  private led: StandardMaterial;
  private beaconMat: StandardMaterial;
  private lastStage = "";
  private lastBeepAt = 0;
  private finalTone = false;
  constructor(scene: Scene, private hooks: BombSiteHooks = {}) {
    const mat = (name: string, hex: string, emissive = 0.3) => {
      const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex);
      m.emissiveColor = m.diffuseColor.scale(emissive); m.specularColor = Color3.Black();
      this.materials.push(m); return m;
    };
    for (const site of BOMB_SITES) {
      const w = site.hw * 2, d = site.hd * 2;
      // Floor: 1024×(scaled) canvas with striped border, hatched interior and the letter.
      const tex = new DynamicTexture(`site_floor_${site.id}`, { width: 1024, height: Math.round(1024 * d / w) }, scene, true);
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      const W = tex.getSize().width, H = tex.getSize().height;
      ctx.clearRect(0, 0, W, H);
      // MEASURED (site screenshots, three tries): a ground's V axis runs north→south, so an unflipped
      // canvas reads upside down from the south approach every team uses. Flip V while drawing — a
      // negative vScale on a clamped texture smears one row across the whole plate instead.
      ctx.translate(0, H); ctx.scale(1, -1);
      // Faint fill so the zone reads as a surface change, not only a line.
      ctx.fillStyle = "rgba(229,174,82,0.10)"; ctx.fillRect(0, 0, W, H);
      // Hatch.
      ctx.strokeStyle = "rgba(229,174,82,0.22)"; ctx.lineWidth = 3;
      for (let x = -H; x < W + H; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
      // Hazard border: alternating amber / near-black blocks along the edge.
      const b = 34, seg = 68;
      for (let x = 0; x < W; x += seg) {
        ctx.fillStyle = (x / seg) % 2 ? "#e5ae52" : "#1a1c1e"; ctx.fillRect(x, 0, seg, b); ctx.fillRect(x, H - b, seg, b);
      }
      for (let y = 0; y < H; y += seg) {
        ctx.fillStyle = (y / seg) % 2 ? "#e5ae52" : "#1a1c1e"; ctx.fillRect(0, y, b, seg); ctx.fillRect(W - b, y, b, seg);
      }
      // Letter and name.
      ctx.fillStyle = "rgba(229,174,82,0.85)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(H * 0.62)}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
      ctx.fillText(site.id, W / 2, H / 2 + H * 0.02);
      ctx.font = `bold ${Math.round(H * 0.11)}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
      ctx.fillText(`BOMB SITE · ${site.name}`, W / 2, H - b - H * 0.09);
      ctx.fillText("PLANT ANYWHERE INSIDE", W / 2, b + H * 0.09);
      tex.update(false); tex.hasAlpha = true;
      this.textures.push(tex);
      const fm = new StandardMaterial(`site_floor_${site.id}`, scene);
      // MEASURED CAUSE of "the floor at A and B lags": this plate is an 80 m² alpha-blended quad
      // laid over the busiest ground on the map, and it used to be the most expensive surface in
      // the scene per pixel. Four things made it so, all fixed here:
      //  - `backFaceCulling = false` drew it twice and defeated early-Z, for an underside no player
      //    can ever see (it lies on the floor);
      //  - the same 1024² texture was bound to diffuse, opacity AND emissive — three samples per
      //    fragment where one will do (`useAlphaFromDiffuseTexture` takes the alpha from diffuse);
      //  - a lit material meant every fragment walked the scene's lights, and each site sits under
      //    its own point light plus the room lights — for a decal that is pure emissive paint;
      //  - nothing was frozen, so the world matrix and the material were re-evaluated every frame.
      // Overdraw at the sites is what the player felt; the ordering problem was the map data
      // underneath (see `floorAudit.test.ts`).
      fm.diffuseTexture = tex; fm.useAlphaFromDiffuseTexture = true;
      fm.emissiveTexture = tex; fm.emissiveColor = new Color3(0.55, 0.55, 0.55);
      fm.disableLighting = true;
      fm.specularColor = Color3.Black(); fm.backFaceCulling = true; fm.zOffset = -2;
      fm.freeze();
      this.materials.push(fm);
      const plate = MeshBuilder.CreateGround(`site_plate_${site.id}`, { width: w, height: d }, scene);
      plate.position.set(site.x, site.y + 0.03, site.z); plate.material = fm;
      plate.freezeWorldMatrix(); plate.doNotSyncBoundingInfo = true;
      this.meshes.push(plate);
      // Corner posts with a lit cap: the zone's extent is visible even when a crate hides the paint.
      // Eight boxes per site were eight draw calls each; merged, the posts are one and the caps are
      // one, and both are static for the life of the match.
      const post = mat(`site_post_${site.id}`, "#2b2f33", 0.05), cap = mat(`site_cap_${site.id}`, "#e5ae52", 0.9);
      const posts: Mesh[] = [], caps: Mesh[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const p = MeshBuilder.CreateBox(`site_post_${site.id}`, { width: 0.12, height: 1.1, depth: 0.12 }, scene);
        p.position.set(site.x + sx * (site.hw - 0.2), site.y + 0.55, site.z + sz * (site.hd - 0.2));
        posts.push(p);
        const c = MeshBuilder.CreateBox(`site_cap_${site.id}`, { width: 0.16, height: 0.08, depth: 0.16 }, scene);
        c.position.set(p.position.x, site.y + 1.14, p.position.z);
        caps.push(c);
      }
      for (const [parts, material, name] of [[posts, post, "posts"], [caps, cap, "caps"]] as const) {
        // `Mesh.MergeMeshes` disposes the sources and returns null only if the list is empty.
        const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
        if (merged) {
          merged.name = `site_${name}_${site.id}`;
          merged.material = material;
          merged.freezeWorldMatrix();
          this.meshes.push(merged);
        } else for (const m of parts) { m.material = material; this.meshes.push(m); }
      }
    }
    // The charge: satchel, straps, a display with a bezel, a wire loom, an antenna and the cell.
    this.charge = MeshBuilder.CreateBox("bomb_charge", { width: 0.5, height: 0.24, depth: 0.36 }, scene);
    this.charge.material = mat("bomb_case", "#4b5746", 0.15); this.meshes.push(this.charge);
    const strap = mat("bomb_straps", "#20292d", 0.05), wire = mat("bomb_wire", "#c8442f", 0.25), wire2 = mat("bomb_wire2", "#2f6fc8", 0.25), steel = mat("bomb_steel", "#9aa3a8", 0.1);
    for (const x of [-0.16, 0.16]) {
      const m = MeshBuilder.CreateBox("bomb_strap", { width: 0.045, height: 0.25, depth: 0.37 }, scene);
      m.parent = this.charge; m.position.x = x; m.material = strap;
    }
    const bezel = MeshBuilder.CreateBox("bomb_bezel", { width: 0.2, height: 0.03, depth: 0.15 }, scene);
    bezel.parent = this.charge; bezel.position.y = 0.125; bezel.position.x = 0.08; bezel.material = strap;
    const screen = MeshBuilder.CreateBox("bomb_display", { width: 0.15, height: 0.02, depth: 0.1 }, scene);
    screen.parent = this.charge; screen.position.y = 0.14; screen.position.x = 0.08;
    this.led = mat("bomb_led", "#ff493b", 0.6); screen.material = this.led;
    for (const [m, z, y] of [[wire, 0.1, 0.13], [wire2, 0.05, 0.135], [wire, -0.02, 0.13]] as const) {
      const w = MeshBuilder.CreateBox("bomb_wire", { width: 0.28, height: 0.012, depth: 0.012 }, scene);
      w.parent = this.charge; w.position.set(-0.08, y, z); w.rotation.z = 0.08; w.material = m;
    }
    const ant = MeshBuilder.CreateBox("bomb_antenna", { width: 0.01, height: 0.22, depth: 0.01 }, scene);
    ant.parent = this.charge; ant.position.set(-0.2, 0.2, -0.12); ant.material = steel;
    // Dropped-charge beacon: a thin translucent column, only while the charge lies on the floor.
    this.beaconMat = mat("bomb_beacon", "#e5ae52", 0.8); this.beaconMat.alpha = 0.35;
    this.beacon = MeshBuilder.CreateCylinder("bomb_beacon", { diameter: 0.12, height: 2.6, tessellation: 6 }, scene);
    this.beacon.material = this.beaconMat; this.meshes.push(this.beacon);
    for (const m of this.meshes) m.isPickable = false;
  }
  update(b: BombData, now: number): void {
    // Stage edges: the plant and the defuse are announced; the fuse beeps in step with the LED.
    if (b.stage !== this.lastStage) {
      if (b.stage === "planted") { this.lastBeepAt = 0; this.finalTone = false; this.hooks.onPlanted?.(b.x, b.y, b.z); }
      if (this.lastStage === "planted" && b.stage === "resolved" && b.result === "BOMB DEFUSED") this.hooks.onDefused?.(b.x, b.y, b.z);
      this.lastStage = b.stage;
    }
    if (b.stage === "planted") {
      const left = b.endsAt - now;
      if (left <= 1150 && !this.finalTone) { this.finalTone = true; this.hooks.onBeep?.(b.x, b.y, b.z, 2); }
      else if (!this.finalTone) {
        const beat = Math.max(110, left / 45) * 2; // one beep per LED on-phase
        if (now - this.lastBeepAt >= beat) { this.lastBeepAt = now; this.hooks.onBeep?.(b.x, b.y, b.z, 1 - Math.max(0, left) / BOMB.fuseMs); }
      }
    }
    const onFloor = b.stage === "dropped" || b.stage === "planted";
    this.charge.setEnabled(onFloor);
    this.charge.position.set(b.x, b.y + 0.13, b.z);
    this.beacon.setEnabled(b.stage === "dropped");
    this.beacon.position.set(b.x, b.y + 1.4, b.z);
    if (b.stage === "dropped") this.beaconMat.alpha = 0.22 + 0.18 * Math.sin(now / 260);
    // Planted: the beat shortens from ~0.9 s to 0.11 s over the fuse. Dropped: a slow amber breath.
    if (b.stage === "planted") {
      const beat = Math.max(110, (b.endsAt - now) / 45);
      this.led.emissiveColor.set(Math.floor(now / beat) % 2 ? 1 : 0.2, 0.04, 0.02);
    } else {
      const k = 0.35 + 0.35 * Math.sin(now / 400);
      this.led.emissiveColor.set(0.9 * k, 0.65 * k, 0.2 * k);
    }
  }
  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials) m.dispose(false, true);
    for (const t of this.textures) t.dispose();
  }
}
