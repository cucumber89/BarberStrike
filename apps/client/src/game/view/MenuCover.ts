import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Team, WeaponId } from "@frankibarber/shared";
import { Character, type CharacterInput } from "./Character";

/**
 * The menu cover (2.3): the game's own characters, live, behind the main menu — the way the
 * classic CS 1.6 menu put both sides in the dark with one light on them. Nothing is imported:
 * these are the procedural bodies and bevelled weapons every match renders, lit by a warm
 * practical on FADE's side and a violet one on TAPER's, on a wet floor, in fog.
 *
 * Cheap on purpose: WebGL2 only, half-resolution, capped at 30 fps, no post-processing, paused
 * when the tab is hidden, a single frame under `prefers-reduced-motion`, and disposed the moment
 * the menu unmounts so the match gets a fresh context.
 */
interface Actor {
  ch: Character;
  yaw: number;
  inp: CharacterInput;
  /** Idle personality: how much this one sways, and when it next checks its weapon. */
  sway: number;
  nextReloadAt: number;
  reloadUntil: number;
}

interface Placement { team: Team; x: number; z: number; yaw: number; weapon: WeaponId; crouch?: boolean; tac?: boolean; bomb?: boolean }

/** Positions are metres; the camera sits at z ≈ -6 looking down +Z, so smaller z is closer. */
const CAST: Placement[] = [
  // FADE (brass), stage left: a rifleman on watch, a crouched shotgun up front, the carrier behind.
  { team: 0, x: -3.1, z: 0.2, yaw: 0.55, weapon: "rifle" },
  { team: 0, x: -2.35, z: -1.1, yaw: 0.35, weapon: "shotgun", crouch: true },
  { team: 0, x: -4.1, z: 1.9, yaw: 0.85, weapon: "smg", tac: true, bomb: true },
  // TAPER (violet), stage right: a marksman, a crouched revolver, the gunner behind.
  { team: 1, x: 3.05, z: 0.15, yaw: -0.5, weapon: "dmr" },
  { team: 1, x: 2.3, z: -1.15, yaw: -0.3, weapon: "revolver", crouch: true },
  { team: 1, x: 4.15, z: 1.95, yaw: -0.8, weapon: "lmg", tac: true },
];

const FRAME_MS = 1000 / 30;

export class MenuCover {
  private engine: Engine;
  private scene: Scene;
  private camera: UniversalCamera;
  private actors: Actor[] = [];
  private t = 0;
  private lastFrame = 0;
  private lastTick = 0;
  private stopped = false;
  private readonly still: boolean;
  private readonly onResize = () => this.engine.resize();
  private readonly onVisibility = () => { if (!document.hidden) this.lastTick = performance.now(); };

  constructor(canvas: HTMLCanvasElement) {
    this.still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power", antialias: true }, false);
    if (this.engine.webGLVersion < 2) { this.engine.dispose(); throw new Error("WebGL2 is required for the menu cover"); }
    // Half resolution: a backdrop behind text does not need every pixel, and the menu must never
    // cost more than the match it leads to.
    this.engine.setHardwareScalingLevel(Math.max(1.5, 1.5 * (window.devicePixelRatio || 1) / 1.5));
    const scene = this.scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.043, 0.043, 0.051, 1);
    scene.ambientColor = new Color3(0.02, 0.02, 0.03);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.075;
    scene.fogColor = new Color3(0.043, 0.043, 0.051);
    scene.skipPointerMovePicking = true;

    this.camera = new UniversalCamera("cover_cam", new Vector3(0, 1.5, -6.1), scene);
    this.camera.setTarget(new Vector3(0, 0.95, 0.4));
    // A fixed HORIZONTAL field of view: the cast keeps its place at the edges on every aspect
    // ratio instead of crowding under the menu on 4:3 (measured at 1024×768).
    this.camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    this.camera.fov = 1.3;
    this.camera.minZ = 0.1; this.camera.maxZ = 60;

    // ---- Light: a low cool fill, a warm practical over FADE, a violet one over TAPER, and a thin
    // key from the front so faces and gun steel catch an edge. All range-limited like the map.
    const ambient = new HemisphericLight("cover_ambient", new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.22; ambient.diffuse = new Color3(0.36, 0.42, 0.6); ambient.groundColor = new Color3(0.06, 0.05, 0.06);
    ambient.renderPriority = 100;
    const key = new DirectionalLight("cover_key", new Vector3(0.15, -0.6, 1).normalize(), scene);
    key.diffuse = new Color3(0.5, 0.52, 0.62); key.specular = new Color3(0.25, 0.25, 0.3); key.intensity = 0.85; key.renderPriority = 90;
    const brass = new PointLight("cover_brass", new Vector3(-3.9, 2.9, 0.2), scene);
    brass.diffuse = Color3.FromHexString("#ffb347"); brass.specular = brass.diffuse.scale(0.5); brass.intensity = 70; brass.range = 10; brass.radius = 0.3; brass.renderPriority = 10;
    const violet = new PointLight("cover_violet", new Vector3(3.9, 2.9, 0.4), scene);
    violet.diffuse = Color3.FromHexString("#8f76e0"); violet.specular = violet.diffuse.scale(0.5); violet.intensity = 75; violet.range = 10; violet.radius = 0.3; violet.renderPriority = 10;
    const rim = new PointLight("cover_rim", new Vector3(0, 2.4, 4.5), scene);
    rim.diffuse = new Color3(0.55, 0.6, 0.85); rim.specular = rim.diffuse; rim.intensity = 40; rim.range = 9; rim.radius = 0.2; rim.renderPriority = 5;

    // ---- Set: a wet floor that carries the two colours, a back wall lost in fog, two neon strips.
    const floorMat = new PBRMaterial("cover_floor", scene);
    floorMat.albedoColor = new Color3(0.045, 0.046, 0.052); floorMat.roughness = 0.32; floorMat.metallic = 0.15;
    floorMat.maxSimultaneousLights = 4; floorMat.useGLTFLightFalloff = true; floorMat.freeze();
    const floor = MeshBuilder.CreateGround("cover_ground", { width: 40, height: 40 }, scene);
    floor.material = floorMat; floor.isPickable = false;
    const wallMat = new PBRMaterial("cover_wall", scene);
    wallMat.albedoColor = new Color3(0.07, 0.07, 0.08); wallMat.roughness = 0.9; wallMat.metallic = 0;
    wallMat.maxSimultaneousLights = 4; wallMat.useGLTFLightFalloff = true; wallMat.freeze();
    const wall = MeshBuilder.CreateBox("cover_wall", { width: 30, height: 6, depth: 0.4 }, scene);
    wall.position.set(0, 3, 6.5); wall.material = wallMat; wall.isPickable = false;
    const neon = (name: string, hex: string, x: number, y: number, z: number, w: number, ry: number) => {
      const m = new StandardMaterial(name, scene); m.emissiveColor = Color3.FromHexString(hex); m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.disableLighting = true;
      const strip = MeshBuilder.CreateBox(name, { width: w, height: 0.05, depth: 0.05 }, scene);
      strip.position.set(x, y, z); strip.rotation.y = ry; strip.material = m; strip.isPickable = false;
    };
    neon("cover_neon_brass", "#ffb347", -3.6, 2.85, 5.9, 3.2, 0.12);
    neon("cover_neon_violet", "#8f76e0", 3.6, 2.85, 5.9, 3.2, -0.12);
    // A few crates in the fog behind them so the dark has shape.
    const crateMat = new PBRMaterial("cover_crate", scene);
    crateMat.albedoColor = new Color3(0.11, 0.1, 0.09); crateMat.roughness = 0.85; crateMat.maxSimultaneousLights = 4; crateMat.useGLTFLightFalloff = true; crateMat.freeze();
    for (const [x, z, s, ry] of [[-4.6, 3.6, 1.1, 0.3], [4.4, 3.2, 1.0, -0.2], [-3.2, 4.6, 0.8, 0.9], [3.6, 4.9, 1.3, 0.5]] as const) {
      const c = MeshBuilder.CreateBox("cover_crate", { size: s }, scene);
      c.position.set(x, s / 2, z); c.rotation.y = ry; c.material = crateMat; c.isPickable = false;
    }

    // ---- The cast.
    CAST.forEach((p, i) => {
      const ch = new Character(scene, p.team, `cover_${i}`);
      ch.root.position.set(p.x, 0, p.z);
      ch.root.rotation.y = p.yaw;
      const inp: CharacterInput = { speed: 0, grounded: true, crouch: !!p.crouch, pitch: 0, alive: true, reloading: false, weapon: p.weapon, moveDir: 0, tac: !!p.tac, bomb: !!p.bomb, lean: 0 };
      this.actors.push({ ch, yaw: p.yaw, inp, sway: 0.6 + (i % 3) * 0.25, nextReloadAt: 4 + i * 2.7, reloadUntil: 0 });
    });
    // Settle the blends so the first frame is not a pop from the T-pose.
    for (let i = 0; i < 40; i++) for (const a of this.actors) a.ch.update(a.inp, 50);

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.lastTick = performance.now();
    this.engine.runRenderLoop(() => this.frame());
  }

  private frame(): void {
    if (this.stopped) return;
    const now = performance.now();
    if (now - this.lastFrame < FRAME_MS || document.hidden) return;
    const dt = Math.min(100, now - this.lastTick);
    this.lastFrame = now; this.lastTick = now;
    this.t += dt / 1000;
    const t = this.t;
    this.actors.forEach((a, i) => {
      // Small breathing sway in yaw and aim; every few seconds one of them checks the weapon.
      a.ch.root.rotation.y = a.yaw + Math.sin(t * 0.35 + i * 1.3) * 0.045 * a.sway;
      a.inp.pitch = Math.sin(t * 0.5 + i * 0.7) * 0.05;
      a.inp.lean = Math.sin(t * 0.22 + i * 2.1) * 0.06 * a.sway;
      if (t >= a.nextReloadAt) { a.reloadUntil = t + 1.6; a.nextReloadAt = t + 9 + (i * 3.7) % 6; }
      a.inp.reloading = t < a.reloadUntil;
      a.ch.update(a.inp, dt);
    });
    // The camera drifts a hand's width, the way the old menus breathed.
    this.camera.position.x = Math.sin(t * 0.11) * 0.18;
    this.camera.position.y = 1.5 + Math.sin(t * 0.17) * 0.04;
    this.scene.render();
    if (this.still) this.stopped = true;
  }

  dispose(): void {
    this.stopped = true;
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
