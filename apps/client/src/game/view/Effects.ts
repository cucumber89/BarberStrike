import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { CollisionWorld } from "@frankibarber/shared";
import { makeRayHit } from "@frankibarber/shared";

/**
 * Pooled combat effects with hard budgets:
 * - muzzle flashes: 8 pooled billboards + one shared flicker light
 * - impact bursts: 6 particle systems reused round-robin (sparks/dust), hit puffs
 * - decals: 64 small quads, oldest replaced
 * - shell casings: 24 pooled boxes with gravity
 * No per-frame allocations after warm-up.
 */

const FLASH_POOL = 8;
const DECAL_MAX = 64;
const CASING_MAX = 24;
const BURSTS = 6;

interface Flash { mesh: Mesh; life: number; ttl: number }
interface Casing { mesh: Mesh; vx: number; vy: number; vz: number; rx: number; life: number; active: boolean }

const hit = makeRayHit();

export function softDiscTexture(scene: Scene, name: string, inner: string, outer: string): Texture {
  const size = 64;
  const dt = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.5, outer); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  dt.update(false);
  dt.hasAlpha = true;
  return dt;
}

export class Effects {
  private flashes: Flash[] = [];
  private flashLight: PointLight;
  private flashMat: StandardMaterial;
  private flashTex: Texture;
  private lightLife = 0;
  private bursts: ParticleSystem[] = [];
  private burstIdx = 0;
  private puffs: ParticleSystem[] = [];
  private puffIdx = 0;
  private decals: Mesh[] = [];
  private decalIdx = 0;
  private decalMat: StandardMaterial;
  private casings: Casing[] = [];
  private casingMat: StandardMaterial;
  private tmp = new Vector3();
  private tmpN = new Vector3();
  private effectsScale = 1;

  constructor(private scene: Scene, private world: CollisionWorld) {
    this.flashTex = softDiscTexture(scene, "fx_flash", "rgba(255,240,200,1)", "rgba(255,150,60,0.6)");
    this.flashMat = new StandardMaterial("fx_flashMat", scene);
    this.flashMat.diffuseTexture = this.flashTex;
    this.flashMat.opacityTexture = this.flashTex;
    this.flashMat.emissiveColor = new Color3(1, 0.85, 0.6);
    this.flashMat.disableLighting = true;
    this.flashMat.backFaceCulling = false;
    for (let i = 0; i < FLASH_POOL; i++) {
      const m = MeshBuilder.CreatePlane(`fx_flash_${i}`, { size: 0.3 }, scene);
      m.material = this.flashMat;
      m.billboardMode = Mesh.BILLBOARDMODE_ALL;
      m.isPickable = false;
      m.setEnabled(false);
      this.flashes.push({ mesh: m, life: 0, ttl: 0 });
    }
    this.flashLight = new PointLight("fx_flashLight", Vector3.Zero(), scene);
    this.flashLight.diffuse = new Color3(1, 0.7, 0.4);
    this.flashLight.intensity = 0;
    this.flashLight.range = 7;

    const sparkTex = softDiscTexture(scene, "fx_spark", "rgba(255,230,180,1)", "rgba(255,160,70,0.5)");
    const dustTex = softDiscTexture(scene, "fx_dust", "rgba(120,110,100,0.7)", "rgba(80,75,70,0.25)");
    for (let i = 0; i < BURSTS; i++) {
      const ps = new ParticleSystem(`fx_burst_${i}`, 40, scene);
      ps.particleTexture = sparkTex;
      ps.emitter = new Vector3(0, -100, 0);
      ps.minSize = 0.02; ps.maxSize = 0.06;
      ps.minLifeTime = 0.12; ps.maxLifeTime = 0.35;
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.gravity = new Vector3(0, -14, 0);
      ps.minEmitPower = 2; ps.maxEmitPower = 6;
      ps.color1 = new Color4(1, 0.9, 0.6, 1); ps.color2 = new Color4(1, 0.6, 0.2, 1); ps.colorDead = new Color4(0.4, 0.1, 0, 0);
      ps.direction1 = new Vector3(-1, 0.2, -1); ps.direction2 = new Vector3(1, 1, 1);
      ps.updateSpeed = 0.016;
      ps.disposeOnStop = false;
      ps.start();
      this.bursts.push(ps);
      const puff = new ParticleSystem(`fx_puff_${i}`, 24, scene);
      puff.particleTexture = dustTex;
      puff.emitter = new Vector3(0, -100, 0);
      puff.minSize = 0.08; puff.maxSize = 0.22;
      puff.minLifeTime = 0.25; puff.maxLifeTime = 0.6;
      puff.emitRate = 0;
      puff.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      puff.gravity = new Vector3(0, 0.6, 0);
      puff.minEmitPower = 0.4; puff.maxEmitPower = 1.2;
      puff.color1 = new Color4(0.5, 0.45, 0.4, 0.5); puff.color2 = new Color4(0.35, 0.3, 0.28, 0.4); puff.colorDead = new Color4(0.2, 0.2, 0.2, 0);
      puff.direction1 = new Vector3(-1, 0, -1); puff.direction2 = new Vector3(1, 1, 1);
      puff.updateSpeed = 0.016;
      puff.start();
      this.puffs.push(puff);
    }

    this.decalMat = new StandardMaterial("fx_decalMat", scene);
    const decalTex = softDiscTexture(scene, "fx_decalTex", "rgba(10,10,10,0.95)", "rgba(20,18,16,0.5)");
    this.decalMat.diffuseTexture = decalTex;
    this.decalMat.opacityTexture = decalTex;
    this.decalMat.disableLighting = true;
    this.decalMat.emissiveColor = new Color3(0.02, 0.02, 0.02);
    this.decalMat.zOffset = -2;
    for (let i = 0; i < DECAL_MAX; i++) {
      const d = MeshBuilder.CreatePlane(`fx_decal_${i}`, { size: 0.12 }, scene);
      d.material = this.decalMat;
      d.isPickable = false;
      d.setEnabled(false);
      this.decals.push(d);
    }

    this.casingMat = new StandardMaterial("fx_casingMat", scene);
    this.casingMat.diffuseColor = new Color3(0.75, 0.6, 0.25);
    this.casingMat.specularColor = new Color3(0.9, 0.8, 0.5);
    this.casingMat.emissiveColor = new Color3(0.15, 0.1, 0.02);
    for (let i = 0; i < CASING_MAX; i++) {
      const m = MeshBuilder.CreateBox(`fx_casing_${i}`, { width: 0.012, height: 0.012, depth: 0.03 }, scene);
      m.material = this.casingMat;
      m.isPickable = false;
      m.setEnabled(false);
      this.casings.push({ mesh: m, vx: 0, vy: 0, vz: 0, rx: 0, life: 0, active: false });
    }
  }

  setDensity(d: number): void { this.effectsScale = Math.max(0, Math.min(1, d)); }

  /** Muzzle flash at a world position, optionally with the shared light. */
  flash(pos: Vector3, size = 0.3, light = true): void {
    if (this.effectsScale <= 0) return;
    let f = this.flashes.find((x) => x.life >= x.ttl) ?? this.flashes[0];
    f.mesh.position.copyFrom(pos);
    f.mesh.scaling.setAll(size * (0.8 + Math.random() * 0.5));
    f.mesh.rotation.z = Math.random() * Math.PI * 2;
    f.mesh.setEnabled(true);
    f.life = 0; f.ttl = 45 + Math.random() * 25;
    if (light) {
      this.flashLight.position.copyFrom(pos);
      this.flashLight.intensity = 18 * this.effectsScale;
      this.lightLife = 60;
    }
  }

  /**
   * Impact at the end of a trace. Re-traces the last 0.5 m to find the surface normal, spawns
   * sparks/dust and a decal (unless the surface is a player).
   */
  impact(from: Vector3, to: Vector3, kind: number): void {
    if (this.effectsScale <= 0) return;
    if (kind !== 0) { this.puff(to, 0.6); return; }
    this.tmp.copyFrom(to).subtractInPlace(from);
    const len = this.tmp.length();
    if (len < 0.01) return;
    this.tmp.scaleInPlace(1 / len);
    const back = Math.min(0.5, len);
    const ox = to.x - this.tmp.x * back, oy = to.y - this.tmp.y * back, oz = to.z - this.tmp.z * back;
    this.world.raycast(ox, oy, oz, this.tmp.x, this.tmp.y, this.tmp.z, back + 0.05, hit);
    if (!hit.hit) return; // trace ended in the air (max range)
    this.tmpN.set(hit.nx, hit.ny, hit.nz);
    // Sparks.
    const ps = this.bursts[this.burstIdx++ % BURSTS];
    (ps.emitter as Vector3).set(hit.x + hit.nx * 0.02, hit.y + hit.ny * 0.02, hit.z + hit.nz * 0.02);
    ps.direction1.set(this.tmpN.x - 0.6, this.tmpN.y - 0.2, this.tmpN.z - 0.6);
    ps.direction2.set(this.tmpN.x + 0.6, this.tmpN.y + 0.8, this.tmpN.z + 0.6);
    ps.manualEmitCount = Math.round(10 * this.effectsScale);
    // Dust.
    const puff = this.puffs[this.puffIdx++ % BURSTS];
    (puff.emitter as Vector3).copyFrom(ps.emitter as Vector3);
    puff.direction1.set(this.tmpN.x - 0.5, this.tmpN.y, this.tmpN.z - 0.5);
    puff.direction2.set(this.tmpN.x + 0.5, this.tmpN.y + 0.6, this.tmpN.z + 0.5);
    puff.manualEmitCount = Math.round(4 * this.effectsScale);
    // Decal.
    if (this.effectsScale > 0.35) {
      const d = this.decals[this.decalIdx++ % DECAL_MAX];
      d.position.set(hit.x + hit.nx * 0.005, hit.y + hit.ny * 0.005, hit.z + hit.nz * 0.005);
      // Orient the plane so its +Z faces the normal.
      if (Math.abs(hit.ny) > 0.9) d.rotation.set(hit.ny > 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() * Math.PI * 2, 0);
      else d.rotation.set(0, Math.atan2(hit.nx, hit.nz) + Math.PI, Math.random() * Math.PI * 2);
      d.scaling.setAll(0.8 + Math.random() * 0.5);
      d.setEnabled(true);
    }
  }

  /** A dust/blood puff at a point (used for thrown-knife hits and grenade bounces). */
  puff(at: Vector3, power: number): void {
    if (this.effectsScale <= 0) return;
    const puff = this.puffs[this.puffIdx++ % BURSTS];
    (puff.emitter as Vector3).copyFrom(at);
    puff.direction1.set(-1, -0.3, -1); puff.direction2.set(1, 1, 1);
    puff.minEmitPower = 0.3 * power; puff.maxEmitPower = 1.0 * power;
    puff.manualEmitCount = Math.round(6 * this.effectsScale);
  }

  /** Ejects a shell casing from a world position with a rightward/up velocity in the facing frame. */
  eject(pos: Vector3, yaw: number): void {
    if (this.effectsScale < 0.3) return;
    const c = this.casings.find((x) => !x.active) ?? this.casings[0];
    c.mesh.position.copyFrom(pos);
    c.mesh.setEnabled(true);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    c.vx = rx * (1.2 + Math.random() * 0.8) + Math.sin(yaw) * 0.3; c.vz = rz * (1.2 + Math.random() * 0.8) + Math.cos(yaw) * 0.3;
    c.vy = 2 + Math.random() * 1.2;
    c.rx = (Math.random() - 0.5) * 20;
    c.life = 0; c.active = true;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const f of this.flashes) {
      if (f.life >= f.ttl) continue;
      f.life += Math.min(dtMs, 40); // at low frame rates a flash still shows for ≥2 frames
      if (f.life >= f.ttl) f.mesh.setEnabled(false);
      else f.mesh.visibility = 1 - f.life / f.ttl;
    }
    if (this.lightLife > 0) {
      this.lightLife -= dtMs;
      this.flashLight.intensity = Math.max(0, this.lightLife / 60) * 18 * this.effectsScale;
      if (this.lightLife <= 0) this.flashLight.intensity = 0;
    }
    for (const c of this.casings) {
      if (!c.active) continue;
      c.life += dtMs;
      c.vy -= 9.8 * dt;
      const m = c.mesh;
      m.position.x += c.vx * dt; m.position.y += c.vy * dt; m.position.z += c.vz * dt;
      m.rotation.x += c.rx * dt; m.rotation.y += c.rx * 0.5 * dt;
      if (m.position.y < 0.01 && c.vy < 0) { m.position.y = 0.01; c.vy = -c.vy * 0.3; c.vx *= 0.6; c.vz *= 0.6; c.rx *= 0.4; }
      if (c.life > 1500) { c.active = false; m.setEnabled(false); }
    }
  }

  dispose(): void {
    for (const f of this.flashes) f.mesh.dispose();
    for (const d of this.decals) d.dispose();
    for (const c of this.casings) c.mesh.dispose();
    for (const p of this.bursts) p.dispose();
    for (const p of this.puffs) p.dispose();
    this.flashLight.dispose();
    this.flashMat.dispose(true, true);
    this.decalMat.dispose(true, true);
    this.casingMat.dispose();
  }
}
