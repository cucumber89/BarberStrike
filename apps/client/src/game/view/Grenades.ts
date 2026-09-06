import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { GRENADES, TICK_MS, MAX_SMOKE_CLOUDS, SMOKE_CENTER_Y, smokeRadius, createProjectile, stepProjectile, type SmokeCloud, type BoomEvent, type CollisionWorld, type GrenadeId, type Projectile, type ThrowEvent } from "@frankibarber/shared";
import { softDiscTexture } from "./Effects";

/**
 * Grenade presentation (drop 2): every client re-simulates each thrown grenade from the server's
 * `ThrowEvent` with the shared deterministic integrator, so flight needs no per-tick network
 * traffic and lands where the server says it lands. Detonations are driven by `BoomEvent`
 * (authoritative); a grenade whose local fuse ran out simply waits for it.
 *
 * Budgets: fireball/flash billboards from a small pool, one shared explosion light, at most
 * MAX_FIRES burning molotovs and MAX_SMOKES clouds (oldest replaced), scorch decals pooled.
 */

const MAX_FIRES = 3;
const MAX_SMOKES = MAX_SMOKE_CLOUDS;
const SCORCH_MAX = 12;
const FIREBALL_POOL = 4;
const RING_MS = 700;
/** After the local fuse ran out, give the authoritative Boom this long before detonating visually anyway. */
const BOOM_GRACE_MS = 600;

interface Flight {
  id: number;
  proj: Projectile;
  node: TransformNode;
  /** Server-clock time the visual flight starts (throw time + render delay). */
  startAt: number;
  renderDelay: number;
  acc: number;
  spinAxis: Vector3;
  spin: number;
  done: boolean;
  /** Local sim reached its own detonation/stick point at this time (0 = still flying). */
  doneAt: number;
  /** Boom arrived before the visual reached the point: apply when the flight catches up. */
  pendingBoom: BoomEvent | null;
  pendingDeadline: number;
  lastBounceAt: number;
}

interface Fireball { mesh: Mesh; life: number; ttl: number; size: number }
interface Fire { node: TransformNode; ps: ParticleSystem; light: PointLight; until: number; flicker: number }
interface Smoke { ps: ParticleSystem; until: number; stopAt: number; core: Mesh; cloud: SmokeCloud }
interface Stuck { node: TransformNode; until: number }

export interface GrenadeViewHooks {
  /** Called on every bounce (audio), with the world position and impact speed. */
  onBounce?: (kind: GrenadeId, x: number, y: number, z: number, speed: number) => void;
  /** Called when a detonation / stick / effect start is shown. */
  onBoom?: (e: BoomEvent) => void;
}

export class Grenades {
  private flights = new Map<number, Flight>();
  private templates = new Map<GrenadeId, TransformNode>();
  private fireballs: Fireball[] = [];
  private fireballMat: StandardMaterial;
  private flashMat: StandardMaterial;
  private boomLight: PointLight;
  private boomLightLife = 0;
  private boomLightMax = 0;
  private boomLightPeak = 60;
  private ring: Mesh;
  private ringLife = 0;
  private boomLightColor = new Color3(1, 0.6, 0.25);
  private sparks: ParticleSystem;
  private dust: ParticleSystem;
  private fires: Fire[] = [];
  private smokes: Smoke[] = [];
  private stuck: Stuck[] = [];
  private scorches: Mesh[] = [];
  private scorchIdx = 0;
  private scorchMat: StandardMaterial;
  private fireTex: Texture;
  private smokeTex: Texture;
  private matBody: PBRMaterial;
  private matMetal: PBRMaterial;
  private matGlass: PBRMaterial;
  private matRag: StandardMaterial;
  private matBlade: PBRMaterial;
  private density = 1;
  private tmp = new Vector3();
  private tmpQ = new Quaternion();
  private hooks: GrenadeViewHooks = {};

  constructor(private scene: Scene, private world: CollisionWorld, private now: () => number) {
    // ---- materials
    const pbr = (name: string, hex: string, rough: number, metal = 0, emissive?: string) => {
      const m = new PBRMaterial(name, scene);
      m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
      m.roughness = rough; m.metallic = metal;
      if (emissive) m.emissiveColor = Color3.FromHexString(emissive).scale(0.8);
      m.maxSimultaneousLights = 4; m.useGLTFLightFalloff = true; m.freeze();
      return m;
    };
    this.matBody = pbr("gr_body", "#3b4a2f", 0.75);
    this.matMetal = pbr("gr_metal", "#8d939a", 0.4, 0.85);
    this.matGlass = pbr("gr_glass", "#5f8a5a", 0.15, 0.1);
    this.matBlade = pbr("gr_blade", "#c9ccd1", 0.25, 0.95);
    this.matRag = new StandardMaterial("gr_rag", scene);
    this.matRag.diffuseColor = new Color3(0.9, 0.85, 0.7);
    this.matRag.emissiveColor = new Color3(1, 0.45, 0.1);
    this.matRag.disableLighting = true;
    this.buildTemplates();

    // ---- fireball / flash billboards
    this.fireTex = softDiscTexture(scene, "gr_fireTex", "rgba(255,245,210,1)", "rgba(255,120,30,0.55)");
    this.fireballMat = new StandardMaterial("gr_fireballMat", scene);
    this.fireballMat.diffuseTexture = this.fireTex; this.fireballMat.opacityTexture = this.fireTex;
    this.fireballMat.emissiveColor = new Color3(1, 0.7, 0.35);
    this.fireballMat.disableLighting = true; this.fireballMat.backFaceCulling = false;
    const flashTex = softDiscTexture(scene, "gr_flashTex", "rgba(255,255,255,1)", "rgba(220,235,255,0.7)");
    this.flashMat = new StandardMaterial("gr_flashMat", scene);
    this.flashMat.diffuseTexture = flashTex; this.flashMat.opacityTexture = flashTex;
    this.flashMat.emissiveColor = new Color3(1, 1, 1);
    this.flashMat.disableLighting = true; this.flashMat.backFaceCulling = false;
    for (let i = 0; i < FIREBALL_POOL; i++) {
      const m = MeshBuilder.CreatePlane(`gr_fireball_${i}`, { size: 1 }, scene);
      m.material = this.fireballMat; m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false; m.setEnabled(false);
      this.fireballs.push({ mesh: m, life: 0, ttl: 0, size: 1 });
    }
    // Shockwave ring for the charge (2.3): a flat torus, emissive, scaled out from the site.
    const ringMat = new StandardMaterial("gr_ringMat", scene);
    ringMat.emissiveColor = new Color3(1, 0.75, 0.45); ringMat.diffuseColor = Color3.Black(); ringMat.specularColor = Color3.Black();
    ringMat.disableLighting = true; ringMat.alpha = 0.85; ringMat.backFaceCulling = false;
    this.ring = MeshBuilder.CreateTorus("gr_ring", { diameter: 2, thickness: 0.35, tessellation: 48 }, scene);
    this.ring.material = ringMat; this.ring.isPickable = false; this.ring.setEnabled(false);
    this.boomLight = new PointLight("gr_boomLight", Vector3.Zero(), scene);
    this.boomLight.diffuse = this.boomLightColor; this.boomLight.intensity = 0; this.boomLight.range = 14;

    // ---- particle systems: sparks + dust for explosions (shared, manual emit)
    const sparkTex = softDiscTexture(scene, "gr_sparkTex", "rgba(255,230,170,1)", "rgba(255,140,50,0.5)");
    this.smokeTex = softDiscTexture(scene, "gr_smokeTex", "rgba(200,200,205,0.55)", "rgba(150,150,155,0.25)");
    this.sparks = new ParticleSystem("gr_sparks", 160, scene);
    this.sparks.particleTexture = sparkTex;
    this.sparks.emitter = new Vector3(0, -100, 0);
    this.sparks.minSize = 0.04; this.sparks.maxSize = 0.12;
    this.sparks.minLifeTime = 0.3; this.sparks.maxLifeTime = 0.9;
    this.sparks.emitRate = 0; this.sparks.manualEmitCount = 0;
    this.sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.sparks.gravity = new Vector3(0, -16, 0);
    this.sparks.minEmitPower = 6; this.sparks.maxEmitPower = 14;
    this.sparks.direction1 = new Vector3(-1, 0.3, -1); this.sparks.direction2 = new Vector3(1, 1.4, 1);
    this.sparks.color1 = new Color4(1, 0.95, 0.7, 1); this.sparks.color2 = new Color4(1, 0.6, 0.2, 1); this.sparks.colorDead = new Color4(0.5, 0.1, 0, 0);
    this.sparks.updateSpeed = 0.016; this.sparks.disposeOnStop = false; this.sparks.start();
    this.dust = new ParticleSystem("gr_dust", 90, scene);
    this.dust.particleTexture = this.smokeTex;
    this.dust.emitter = new Vector3(0, -100, 0);
    this.dust.minSize = 0.6; this.dust.maxSize = 1.6;
    this.dust.minLifeTime = 0.8; this.dust.maxLifeTime = 1.8;
    this.dust.emitRate = 0; this.dust.manualEmitCount = 0;
    this.dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.dust.gravity = new Vector3(0, 0.8, 0);
    this.dust.minEmitPower = 1.5; this.dust.maxEmitPower = 4;
    this.dust.direction1 = new Vector3(-1, 0.1, -1); this.dust.direction2 = new Vector3(1, 1, 1);
    this.dust.color1 = new Color4(0.35, 0.3, 0.26, 0.6); this.dust.color2 = new Color4(0.2, 0.18, 0.16, 0.5); this.dust.colorDead = new Color4(0.1, 0.1, 0.1, 0);
    this.dust.updateSpeed = 0.016; this.dust.disposeOnStop = false; this.dust.start();

    // ---- scorch decals
    this.scorchMat = new StandardMaterial("gr_scorchMat", scene);
    const scorchTex = softDiscTexture(scene, "gr_scorchTex", "rgba(8,6,5,0.9)", "rgba(20,16,12,0.4)");
    this.scorchMat.diffuseTexture = scorchTex; this.scorchMat.opacityTexture = scorchTex;
    this.scorchMat.disableLighting = true; this.scorchMat.emissiveColor = new Color3(0.01, 0.01, 0.01); this.scorchMat.zOffset = -2;
    for (let i = 0; i < SCORCH_MAX; i++) {
      const d = MeshBuilder.CreatePlane(`gr_scorch_${i}`, { size: 1 }, scene);
      d.material = this.scorchMat; d.isPickable = false; d.setEnabled(false);
      this.scorches.push(d);
    }
  }

  setHooks(h: GrenadeViewHooks): void { this.hooks = h; }
  setDensity(d: number): void { this.density = Math.max(0, Math.min(1, d)); }

  // ---------------------------------------------------------------- models

  private buildTemplates(): void {
    const scene = this.scene;
    const mk = (kind: GrenadeId) => { const t = new TransformNode(`gr_tpl_${kind}`, scene); t.setEnabled(false); this.templates.set(kind, t); return t; };
    const part = (parent: TransformNode, mesh: Mesh, mat: PBRMaterial | StandardMaterial, x = 0, y = 0, z = 0) => {
      mesh.material = mat; mesh.parent = parent; mesh.position.set(x, y, z); mesh.isPickable = false; mesh.receiveShadows = false;
      return mesh;
    };
    // Frag: a segmented body with a fuze head and spoon.
    const frag = mk("frag");
    part(frag, MeshBuilder.CreateSphere("fragBody", { diameter: 0.13, segments: 6 }, scene), this.matBody);
    part(frag, MeshBuilder.CreateCylinder("fragHead", { diameter: 0.045, height: 0.04, tessellation: 8 }, scene), this.matMetal, 0, 0.075, 0);
    part(frag, MeshBuilder.CreateBox("fragSpoon", { width: 0.018, height: 0.09, depth: 0.012 }, scene), this.matMetal, 0.028, 0.035, 0);
    // Flash / smoke: cans, the flash silver, the smoke green with a coloured band.
    for (const kind of ["flash", "smoke"] as const) {
      const can = mk(kind);
      part(can, MeshBuilder.CreateCylinder(`${kind}Body`, { diameter: 0.075, height: 0.15, tessellation: 10 }, scene), kind === "flash" ? this.matMetal : this.matBody);
      part(can, MeshBuilder.CreateCylinder(`${kind}Cap`, { diameter: 0.05, height: 0.03, tessellation: 8 }, scene), this.matMetal, 0, 0.088, 0);
      part(can, MeshBuilder.CreateBox(`${kind}Lever`, { width: 0.014, height: 0.1, depth: 0.012 }, scene), this.matMetal, 0.036, 0.045, 0);
    }
    // Molotov: bottle + neck + burning rag.
    const mol = mk("molotov");
    part(mol, MeshBuilder.CreateCylinder("molBody", { diameter: 0.085, height: 0.2, tessellation: 10 }, scene), this.matGlass);
    part(mol, MeshBuilder.CreateCylinder("molNeck", { diameter: 0.035, height: 0.08, tessellation: 8 }, scene), this.matGlass, 0, 0.14, 0);
    part(mol, MeshBuilder.CreateBox("molRag", { width: 0.035, height: 0.06, depth: 0.03 }, scene), this.matRag, 0, 0.19, 0);
    // Launcher shell: a stubby brass round along +Z (drop 3).
    const shell = mk("shell");
    part(shell, MeshBuilder.CreateCylinder("shellBody", { diameter: 0.06, height: 0.09, tessellation: 8 }, scene), this.matMetal);
    shell.getChildMeshes(true)[0].rotation.x = Math.PI / 2;
    part(shell, MeshBuilder.CreateSphere("shellTip", { diameter: 0.055, segments: 6 }, scene), this.matBody, 0, 0, 0.05);
    // Throwing knife: blade + grip, along +Z.
    const knife = mk("knife");
    part(knife, MeshBuilder.CreateBox("knifeBlade", { width: 0.028, height: 0.006, depth: 0.16 }, scene), this.matBlade, 0, 0, 0.07);
    part(knife, MeshBuilder.CreateBox("knifeGrip", { width: 0.022, height: 0.016, depth: 0.1 }, scene), this.matBody, 0, 0, -0.06);
  }

  private instantiate(kind: GrenadeId, id: number): TransformNode {
    const tpl = this.templates.get(kind)!;
    const node = new TransformNode(`gr_${id}`, this.scene);
    for (const child of tpl.getChildMeshes(true)) {
      const inst = (child as Mesh).createInstance(`${child.name}_${id}`);
      inst.parent = node; inst.position.copyFrom(child.position); inst.isPickable = false;
    }
    node.rotationQuaternion = Quaternion.Identity();
    return node;
  }

  // ---------------------------------------------------------------- flights

  /** Starts the visual flight. `renderDelayMs` shifts the timeline (remote throws are INTERP behind). */
  onThrow(e: ThrowEvent, renderDelayMs: number): void {
    if (this.flights.has(e.id)) return;
    const proj = createProjectile(e.id, e.kind, e.owner, [e.o[0], e.o[1], e.o[2]], [0, 0, 0], 0);
    proj.vx = e.v[0]; proj.vy = e.v[1]; proj.vz = e.v[2];
    proj.fuseMs = e.fuseMs;
    const node = this.instantiate(e.kind, e.id);
    node.position.set(e.o[0], e.o[1], e.o[2]);
    node.setEnabled(true);
    const axis = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const speed = Math.hypot(e.v[0], e.v[1], e.v[2]);
    // Timeline in server-clock ms: the throw happened at e.t; remote throws are shown
    // `renderDelayMs` later, in step with the interpolated thrower.
    const f: Flight = {
      id: e.id, proj, node, startAt: e.t + renderDelayMs, acc: 0, renderDelay: renderDelayMs,
      spinAxis: axis, spin: e.kind === "knife" || e.kind === "shell" ? 0 : 6 + speed * 0.4, done: false, doneAt: 0, pendingBoom: null, pendingDeadline: 0, lastBounceAt: -1,
    };
    // Late arrival (or a hitch): the flight started in the past — advance it on the first update.
    const behind = this.now() - f.startAt;
    if (behind > 0) f.acc = Math.min(behind, 3000);
    this.flights.set(e.id, f);
    this.place(f);
  }

  /**
   * Authoritative detonation / stick / effect start. The visual runs the same integrator, so it
   * reaches the same point a little later (render delay + half the RTT): hold the boom until the
   * local flight gets there, with a deadline so a diverged sim never delays it for long.
   */
  onBoom(e: BoomEvent): void {
    const f = this.flights.get(e.id);
    if (f && !f.done && f.doneAt === 0) {
      f.pendingBoom = e;
      f.pendingDeadline = this.now() + f.renderDelay + 250;
      return;
    }
    this.applyBoom(e, f);
  }

  private applyBoom(e: BoomEvent, f: Flight | undefined): void {
    if (f) this.endFlight(f);
    const effectMs = e.effectMs || (e.kind === "c4" ? 0 : GRENADES[e.kind].effectMs);
    this.hooks.onBoom?.(e);
    switch (e.kind) {
      case "c4": this.blast(e.x, e.y, e.z); break;
      case "frag": this.explosion(e.x, e.y, e.z, e.nx, e.ny, e.nz, 1); break;
      case "shell": this.explosion(e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.75); break;
      case "flash": this.flashBurst(e.x, e.y, e.z); break;
      case "smoke": this.startSmoke(e.x, e.y, e.z, effectMs); break;
      case "molotov": this.startFire(e.x, e.y, e.z, e.nx, e.ny, e.nz, effectMs); break;
      case "knife":
        // effectMs > 0: stuck in the world (keep the blade there); 0: hit a player (small puff, gone).
        if (e.effectMs > 0) this.stickKnife(e); break;
    }
  }

  private endFlight(f: Flight): void {
    if (f.done) return;
    f.done = true; f.doneAt = this.now();
    f.node.dispose(false, false);
    this.flights.delete(f.id);
  }

  private place(f: Flight): void {
    const p = f.proj;
    f.node.position.set(p.x, p.y, p.z);
    if (p.kind === "knife" || p.kind === "shell") {
      // Point along the velocity (or the last normal once stuck).
      const vx = p.stuck ? -p.nx : p.vx, vy = p.stuck ? -p.ny : p.vy, vz = p.stuck ? -p.nz : p.vz;
      const l = Math.hypot(vx, vy, vz);
      if (l > 1e-4) {
        this.tmp.set(vx / l, vy / l, vz / l);
        const yaw = Math.atan2(this.tmp.x, this.tmp.z), pitch = -Math.asin(Math.max(-1, Math.min(1, this.tmp.y)));
        Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, f.node.rotationQuaternion!);
      }
    }
  }

  update(dtMs: number): void {
    const now = this.now();
    const dt = dtMs / 1000;
    // ---- flights (fixed-step, catch-up capped so a hitch cannot stall the frame)
    for (const f of Array.from(this.flights.values())) {
      if (now < f.startAt) continue;
      const p = f.proj;
      if (f.doneAt === 0) {
        f.acc += dtMs;
        let steps = 0;
        while (f.acc >= TICK_MS && steps < 40) {
          f.acc -= TICK_MS; steps++;
          const bouncesBefore = p.bounces, speedBefore = Math.hypot(p.vx, p.vy, p.vz);
          const r = stepProjectile(this.world, p, TICK_MS);
          if (p.bounces > bouncesBefore && r !== "detonate" && p.ageMs - f.lastBounceAt > 120) {
            f.lastBounceAt = p.ageMs;
            this.hooks.onBounce?.(p.kind, p.x, p.y, p.z, speedBefore);
          }
          if (r === "detonate" || r === "stuck") { f.doneAt = now; break; }
        }
      }
      if (f.pendingBoom && (f.doneAt > 0 || now >= f.pendingDeadline)) {
        const b = f.pendingBoom; f.pendingBoom = null;
        this.applyBoom(b, f);
        continue;
      }
      // Local fuse ran out but no Boom yet (packet late): detonate visually after a grace period.
      if (f.doneAt > 0 && now - f.doneAt > BOOM_GRACE_MS) {
        this.applyBoom({ id: f.id, kind: p.kind, x: p.x, y: p.y, z: p.z, nx: p.nx, ny: p.ny, nz: p.nz, effectMs: GRENADES[p.kind].effectMs }, f);
        continue;
      }
      if (!p.resting && !p.stuck && f.spin > 0) {
        Quaternion.RotationAxisToRef(f.spinAxis, f.spin * dt, this.tmpQ);
        f.node.rotationQuaternion!.multiplyInPlace(this.tmpQ);
        f.spin *= p.rolling ? Math.exp(-dt * 3) : 1;
      }
      this.place(f);
    }
    // ---- fireballs
    for (const b of this.fireballs) {
      if (b.life >= b.ttl) continue;
      b.life += dtMs;
      const t = Math.min(1, b.life / b.ttl);
      b.mesh.scaling.setAll(b.size * (0.5 + 0.9 * Math.sqrt(t)));
      b.mesh.visibility = 1 - t * t;
      if (b.life >= b.ttl) b.mesh.setEnabled(false);
    }
    if (this.boomLightLife > 0) {
      this.boomLightLife -= dtMs;
      this.boomLight.intensity = Math.max(0, this.boomLightLife / this.boomLightMax) * this.boomLightPeak * this.density;
      if (this.boomLightLife <= 0) this.boomLight.intensity = 0;
    }
    // ---- the blast's shockwave ring: out to 30 m in 0.7 s, thinning as it goes.
    if (this.ring.isEnabled()) {
      this.ringLife += dtMs;
      const t = Math.min(1, this.ringLife / RING_MS);
      const r = 1 + 29 * (1 - (1 - t) * (1 - t));
      this.ring.scaling.set(r, 1, r);
      this.ring.visibility = (1 - t) * 0.85;
      if (t >= 1) this.ring.setEnabled(false);
    }
    // ---- fires: flicker, end
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      const left = f.until - now;
      if (left <= 0) { this.endFire(f); this.fires.splice(i, 1); continue; }
      f.flicker += dt * 23;
      const fade = Math.min(1, left / 1200);
      f.light.intensity = (14 + Math.sin(f.flicker) * 3 + Math.sin(f.flicker * 2.7) * 2) * fade * this.density;
      if (left < 1200) f.ps.emitRate = 70 * fade * this.density;
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.core.scaling.setAll(Math.max(0.001, smokeRadius(s.cloud, now)));
      if (now >= s.stopAt && s.ps.emitRate > 0) s.ps.emitRate = 0;
      if (now >= s.until) { s.ps.dispose(); s.core.dispose(false, true); this.smokes.splice(i, 1); }
    }
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      if (now >= this.stuck[i].until) { this.stuck[i].node.dispose(false, false); this.stuck.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- effects

  private explosion(x: number, y: number, z: number, nx: number, ny: number, nz: number, scale: number): void {
    if (this.density <= 0) return;
    const ox = x + nx * 0.15, oy = y + ny * 0.15, oz = z + nz * 0.15;
    // Fireball + hot core.
    this.fireball(ox, oy, oz, 3.2 * scale, 420, this.fireballMat);
    this.fireball(ox, oy, oz, 1.4 * scale, 160, this.flashMat);
    this.boomLight.position.set(ox, oy + 0.3, oz);
    this.boomLight.diffuse.set(1, 0.6, 0.25);
    this.boomLight.range = 14; this.boomLightPeak = 60;
    this.boomLightMax = 280; this.boomLightLife = 280;
    this.boomLight.intensity = 60 * this.density;
    (this.sparks.emitter as Vector3).set(ox, oy, oz);
    this.sparks.manualEmitCount = Math.round(90 * this.density);
    (this.dust.emitter as Vector3).set(ox, oy, oz);
    this.dust.direction1.set(nx - 1, ny * 0.5, nz - 1); this.dust.direction2.set(nx + 1, ny * 0.5 + 1, nz + 1);
    this.dust.manualEmitCount = Math.round(40 * this.density);
    this.scorch(x, y, z, nx, ny, nz, 2.2 * scale);
  }

  /**
   * The charge going off (2.3): a stack of fireballs that keep growing after a grenade's would be
   * gone, a white core, a shockwave ring racing out along the floor, a light that reaches across the
   * site, every spark and dust particle the pools have, and a scorch the size of a car.
   */
  private blast(x: number, y: number, z: number): void {
    if (this.density <= 0) return;
    this.fireball(x, y + 0.6, z, 5, 520, this.fireballMat);
    this.fireball(x, y + 1.8, z, 9, 900, this.fireballMat);
    this.fireball(x, y + 3.2, z, 13, 1300, this.fireballMat);
    this.fireball(x, y + 0.8, z, 7, 240, this.flashMat);
    this.boomLight.position.set(x, y + 1.2, z);
    this.boomLight.diffuse.set(1, 0.7, 0.35);
    // MEASURED (blast screenshots): 320 at 45 m turned the whole site floor flat yellow; this still
    // lights the far walls without flattening the paint.
    this.boomLight.range = 36;
    this.boomLightPeak = 210; this.boomLightMax = 1100; this.boomLightLife = 1100;
    this.boomLight.intensity = this.boomLightPeak * this.density;
    (this.sparks.emitter as Vector3).set(x, y + 0.3, z);
    this.sparks.manualEmitCount = Math.round(160 * this.density);
    (this.dust.emitter as Vector3).set(x, y + 0.2, z);
    this.dust.direction1.set(-1, 0.2, -1); this.dust.direction2.set(1, 1.6, 1);
    this.dust.manualEmitCount = Math.round(90 * this.density);
    this.scorch(x, y, z, 0, 1, 0, 7);
    this.ring.position.set(x, y + 0.08, z);
    this.ring.setEnabled(true); this.ringLife = 0;
  }

  private flashBurst(x: number, y: number, z: number): void {
    this.fireball(x, y + 0.1, z, 6, 260, this.flashMat);
    this.boomLight.position.set(x, y + 0.4, z);
    this.boomLight.diffuse.set(1, 1, 1);
    this.boomLight.range = 14; this.boomLightPeak = 80;
    this.boomLightMax = 220; this.boomLightLife = 220;
    this.boomLight.intensity = 80 * this.density;
    (this.sparks.emitter as Vector3).set(x, y + 0.1, z);
    this.sparks.manualEmitCount = Math.round(20 * this.density);
  }

  private fireball(x: number, y: number, z: number, size: number, ttl: number, mat: StandardMaterial): void {
    const b = this.fireballs.find((f) => f.life >= f.ttl) ?? this.fireballs[0];
    b.mesh.material = mat;
    b.mesh.position.set(x, y, z);
    b.mesh.rotation.z = Math.random() * Math.PI * 2;
    b.mesh.scaling.setAll(size * 0.5);
    b.mesh.visibility = 1;
    b.mesh.setEnabled(true);
    b.life = 0; b.ttl = ttl; b.size = size;
  }

  private scorch(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number): void {
    if (this.density < 0.35) return;
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 0.5) { nx = 0; ny = 1; nz = 0; }
    const d = this.scorches[this.scorchIdx++ % SCORCH_MAX];
    d.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
    if (Math.abs(ny) > 0.9) d.rotation.set(ny > 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() * Math.PI * 2, 0);
    else d.rotation.set(0, Math.atan2(nx, nz) + Math.PI, Math.random() * Math.PI * 2);
    d.scaling.setAll(size * (0.9 + Math.random() * 0.3));
    d.setEnabled(true);
  }

  private startFire(x: number, y: number, z: number, nx: number, ny: number, nz: number, effectMs: number): void {
    // Bottle break: glass sparkle + a short fireball, then the burning pool.
    this.fireball(x, y + 0.2, z, 2.2, 300, this.fireballMat);
    (this.sparks.emitter as Vector3).set(x, y + 0.1, z);
    this.sparks.manualEmitCount = Math.round(30 * this.density);
    this.scorch(x, y, z, nx, ny, nz, 3.2);
    if (this.fires.length >= MAX_FIRES) { const old = this.fires.shift()!; this.endFire(old); }
    const node = new TransformNode("gr_fire", this.scene);
    node.position.set(x, y + 0.05, z);
    const ps = new ParticleSystem("gr_fire_ps", 220, this.scene);
    ps.particleTexture = this.fireTex;
    ps.emitter = node.position;
    ps.minEmitBox = new Vector3(-1.4, 0, -1.4); ps.maxEmitBox = new Vector3(1.4, 0.1, 1.4);
    ps.minSize = 0.35; ps.maxSize = 0.9;
    ps.minLifeTime = 0.35; ps.maxLifeTime = 0.8;
    ps.emitRate = 150 * this.density;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 2.2, 0);
    ps.direction1 = new Vector3(-0.2, 1, -0.2); ps.direction2 = new Vector3(0.2, 2.2, 0.2);
    ps.minEmitPower = 0.6; ps.maxEmitPower = 1.6;
    ps.color1 = new Color4(1, 0.75, 0.25, 0.9); ps.color2 = new Color4(1, 0.4, 0.08, 0.8); ps.colorDead = new Color4(0.3, 0.05, 0, 0);
    ps.updateSpeed = 0.016;
    ps.start();
    const light = new PointLight("gr_fireLight", new Vector3(x, y + 0.6, z), this.scene);
    light.diffuse = new Color3(1, 0.55, 0.2); light.range = 9; light.intensity = 14 * this.density;
    this.fires.push({ node, ps, light, until: this.now() + effectMs, flicker: Math.random() * 10 });
  }

  private endFire(f: Fire): void {
    f.ps.dispose(); f.light.dispose(); f.node.dispose();
  }

  private startSmoke(x: number, y: number, z: number, effectMs: number): void {
    if (this.smokes.length >= MAX_SMOKES) { const old = this.smokes.shift()!; old.ps.dispose(); old.core.dispose(false, true); }
    const ps = new ParticleSystem("gr_smoke_ps", 260, this.scene);
    ps.particleTexture = this.smokeTex;
    ps.emitter = new Vector3(x, y + 0.2, z);
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3); ps.maxEmitBox = new Vector3(0.3, 0.4, 0.3);
    ps.minSize = 1.2; ps.maxSize = 2.6;
    ps.minLifeTime = 2.5; ps.maxLifeTime = 4.5;
    ps.emitRate = 55 * Math.max(0.4, this.density);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, 0.15, 0);
    ps.direction1 = new Vector3(-1, 0.2, -1); ps.direction2 = new Vector3(1, 0.8, 1);
    ps.minEmitPower = 0.6; ps.maxEmitPower = 1.6;
    ps.minAngularSpeed = -0.4; ps.maxAngularSpeed = 0.4;
    ps.color1 = new Color4(0.85, 0.85, 0.88, 0.75); ps.color2 = new Color4(0.7, 0.7, 0.74, 0.7); ps.colorDead = new Color4(0.6, 0.6, 0.62, 0);
    ps.updateSpeed = 0.016;
    ps.start();
    const now = this.now();
    const core = MeshBuilder.CreateSphere("smoke_dense_core", { diameter: 2, segments: 12 }, this.scene);
    core.convertToFlatShadedMesh(); core.position.set(x, y + SMOKE_CENTER_Y, z); core.isPickable = false;
    const mat = new StandardMaterial("smoke_dense_mat", this.scene);
    mat.diffuseColor = new Color3(0.42, 0.45, 0.46); mat.emissiveColor = new Color3(0.2, 0.22, 0.23);
    mat.specularColor = Color3.Black(); mat.backFaceCulling = false;
    core.material = mat; core.scaling.setAll(0.001);
    this.smokes.push({ ps, core, cloud: { x, y, z, born: now, until: now + effectMs }, stopAt: now + effectMs - 3500, until: now + effectMs + 1500 });
  }

  private stickKnife(e: BoomEvent): void {
    const node = this.instantiate("knife", e.id + 1_000_000);
    node.position.set(e.x, e.y, e.z);
    const yaw = Math.atan2(-e.nx, -e.nz), pitch = -Math.asin(Math.max(-1, Math.min(1, -e.ny)));
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, 0, node.rotationQuaternion!);
    node.setEnabled(true);
    this.stuck.push({ node, until: this.now() + e.effectMs });
  }

  /** Number of grenades currently in flight (debug / tests). */
  get inFlight(): number { return this.flights.size; }

  obscurityAt(x: number, y: number, z: number): number {
    let opacity = 0;
    for (const s of this.smokes) {
      const c = s.cloud;
      const inside = smokeRadius(c, this.now()) - Math.hypot(x - c.x, y - c.y - SMOKE_CENTER_Y, z - c.z);
      opacity = Math.max(opacity, Math.min(1, inside / 0.5));
    }
    return Math.round(opacity * 50) / 50;
  }

  reset(): void {
    for (const f of this.flights.values()) f.node.dispose(false, false);
    this.flights.clear();
    for (const f of this.fires) this.endFire(f);
    this.fires.length = 0;
    for (const s of this.smokes) { s.ps.dispose(); s.core.dispose(false, true); }
    this.smokes.length = 0;
    for (const s of this.stuck) s.node.dispose(false, false);
    this.stuck.length = 0;
  }

  dispose(): void {
    this.ring.dispose(false, true);
    for (const f of this.flights.values()) f.node.dispose(false, false);
    this.flights.clear();
    for (const f of this.fires) this.endFire(f);
    for (const s of this.smokes) { s.ps.dispose(); s.core.dispose(false, true); }
    for (const s of this.stuck) s.node.dispose(false, false);
    for (const b of this.fireballs) b.mesh.dispose();
    for (const d of this.scorches) d.dispose();
    for (const t of this.templates.values()) t.dispose(false, true);
    this.sparks.dispose(); this.dust.dispose();
    this.boomLight.dispose();
    this.fireballMat.dispose(true, true); this.flashMat.dispose(true, true); this.scorchMat.dispose(true, true);
    this.matBody.dispose(); this.matMetal.dispose(); this.matGlass.dispose(); this.matBlade.dispose(); this.matRag.dispose();
  }
}
