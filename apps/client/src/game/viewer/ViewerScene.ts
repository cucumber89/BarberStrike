import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DEFAULT_MAP_ID, INTERP_DELAY_MS, MAPS, sitesOf, type MapDef } from "@frankibarber/shared";
import { buildMap, type MapInstance } from "../world/MapBuilder";
import { BASE_EXPOSURE } from "../world/postfx";
import { RemotePlayer } from "../player/RemotePlayer";
import type { Connection, NetPlayer } from "../net/Connection";
import { fly, look, readKeys, type FlyPose } from "./flyCamera";

/**
 * The spectator's window on a live match — and the map tool this project did not have.
 *
 * It is deliberately NOT `Game.ts` with the player removed. The game orchestrator owns prediction,
 * a local body, weapons, a HUD and a dozen modules that all assume there is a you; a viewer needs
 * none of it and would have had to be threaded through every one of them. What a viewer needs is
 * the map, the other bodies at the same interpolated instant the players see them, and a camera —
 * so that is all this builds, out of the same `buildMap` and `RemotePlayer` the game uses. Nothing
 * here can affect the match: a spectator has no `PlayerState` on the server and sends nothing.
 *
 * The second job is testing the map. Every render since this repo began has been a screenshot from
 * a fixed camera in a headless browser; there has never been a way to simply GO and look at a
 * corner somebody reported. `VIEWPOINTS` and `stats()` are that, and they are why the camera flies
 * through walls instead of colliding with them.
 */

export interface ViewpointSpec { id: string; label: string; pos: [number, number, number]; look: [number, number, number] }

/**
 * Somewhere to start, and somewhere to jump to. The list is the district's own areas, in the order
 * a person walks them, plus the two bomb sites — the places a report is most often about.
 */
export const VIEWPOINTS: readonly ViewpointSpec[] = [
  { id: "street", label: "ULICA", pos: [-10, 1.7, -12], look: [2, 3, 0] },
  { id: "shop", label: "ZAKŁAD", pos: [2, 1.7, 1.2], look: [5, 1.7, 7] },
  { id: "hall", label: "ZAPLECZE", pos: [1, 1.7, 11], look: [3, 2, 17] },
  { id: "unit", label: "SĄSIAD", pos: [11, 1.7, 2], look: [17, 3, 7] },
  { id: "storage", label: "MAGAZYN", pos: [10, 1.7, 12], look: [17, 4, 16] },
  { id: "alley", label: "ZAUŁEK", pos: [-10, 1.7, 2], look: [-5, 3, 15] },
  { id: "backlot", label: "GARAŻE", pos: [-18, 1.7, 10], look: [-24, 3, 4] },
  { id: "east", label: "MYJNIA", pos: [22, 1.7, 9], look: [29, 4, 16] },
  { id: "yard", label: "PLAC", pos: [-3, 1.7, 30], look: [-12, 5, 45] },
  { id: "west_yard", label: "ZACHODNI PLAC", pos: [-20, 1.7, 31], look: [-24, 4, 42] },
  { id: "north", label: "PÓŁNOC", pos: [7, 1.7, 38], look: [-10, 3, 42] },
  { id: "overview", label: "Z GÓRY", pos: [-30, 26, -32], look: [4, 0, 9] },
];

export interface ViewerStats { fps: number; drawCalls: number; meshes: number; players: number; x: number; y: number; z: number }

export class ViewerScene {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private map: MapInstance;
  private bodies = new Map<string, RemotePlayer>();
  private held = new Set<string>();
  private pose: FlyPose;
  private last = performance.now();
  private frames = 0;
  private fpsSince = performance.now();
  private fps = 0;
  private drawCalls = 0;
  private detach: (() => void)[] = [];
  /** Set while following a player; cleared by any movement key. */
  private following = "";

  constructor(private canvas: HTMLCanvasElement, private conn: Connection) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false }, true);
    this.scene = new Scene(this.engine);
    const def: MapDef = MAPS[conn.state.mapId] ?? MAPS[DEFAULT_MAP_ID];
    const start = VIEWPOINTS[0];
    this.pose = { x: start.pos[0], y: start.pos[1], z: start.pos[2], yaw: 0, pitch: 0 };
    this.camera = new FreeCamera("viewer", new Vector3(...start.pos), this.scene);
    this.camera.minZ = 0.05;
    this.camera.fov = 1.15;
    this.camera.setTarget(new Vector3(...start.look));
    this.pose.yaw = this.camera.rotation.y;
    this.pose.pitch = this.camera.rotation.x;

    // The same tone curve, exposure and contrast the game sets in `postfx.ts`: a viewer that graded
    // the map differently from the players would report a map nobody is looking at.
    const ip = this.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = BASE_EXPOSURE;
    ip.contrast = 1.1;

    this.map = buildMap(this.scene, def, { shadows: true, shadowMapSize: 1024 });
    for (const [id, p] of conn.state.players) this.addBody(p, id);
    conn.onPlayers((p, id) => this.addBody(p, id), (_p, id) => this.removeBody(id));

    this.bindInput();
    this.engine.runRenderLoop(() => this.frame());
    const resize = () => this.engine.resize();
    window.addEventListener("resize", resize);
    this.detach.push(() => window.removeEventListener("resize", resize));
  }

  private addBody(p: NetPlayer, id: string): void {
    if (this.bodies.has(id)) return;
    this.bodies.set(id, new RemotePlayer(this.scene, p));
  }

  private removeBody(id: string): void {
    this.bodies.get(id)?.dispose();
    this.bodies.delete(id);
    if (this.following === id) this.following = "";
  }

  private bindInput(): void {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      this.held.add(e.code);
      if (/^(KeyW|KeyA|KeyS|KeyD|Space|ControlLeft|ControlRight|KeyC|Arrow)/.test(e.code)) this.following = "";
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n) this.go(VIEWPOINTS[Number(n[1]) - 1]?.id ?? "");
      if (e.code === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.held.delete(e.code);
    const blur = () => this.held.clear();
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.following = "";
      this.pose = look(this.pose, e.movementX, e.movementY);
    };
    const click = () => { void this.canvas.requestPointerLock?.(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("mousemove", move);
    this.canvas.addEventListener("click", click);
    this.detach.push(() => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur); window.removeEventListener("mousemove", move);
      this.canvas.removeEventListener("click", click);
    });
  }

  /** Jump to a named viewpoint, or to a bomb site by its id ("A" / "B"). */
  go(id: string): void {
    const v = VIEWPOINTS.find((p) => p.id === id);
    if (v) {
      this.following = "";
      this.pose = { ...this.pose, x: v.pos[0], y: v.pos[1], z: v.pos[2] };
      this.camera.position.copyFromFloats(...v.pos);
      this.camera.setTarget(new Vector3(...v.look));
      this.pose.yaw = this.camera.rotation.y; this.pose.pitch = this.camera.rotation.x;
      return;
    }
    const site = sitesOf(MAPS[this.conn.state.mapId] ?? MAPS[DEFAULT_MAP_ID]).find((s) => s.id === id);
    if (site) {
      this.following = "";
      this.pose = { ...this.pose, x: site.x, y: site.y + 12, z: site.z - 10 };
      this.camera.position.copyFromFloats(this.pose.x, this.pose.y, this.pose.z);
      this.camera.setTarget(new Vector3(site.x, site.y, site.z));
      this.pose.yaw = this.camera.rotation.y; this.pose.pitch = this.camera.rotation.x;
    }
  }

  /** Ride behind a player until any movement key is pressed. */
  follow(id: string): void { this.following = this.bodies.has(id) ? id : ""; }
  get followed(): string { return this.following; }

  stats(): ViewerStats {
    return {
      fps: Math.round(this.fps), drawCalls: this.drawCalls, meshes: this.scene.getActiveMeshes().length,
      players: this.bodies.size,
      x: Math.round(this.pose.x * 10) / 10, y: Math.round(this.pose.y * 10) / 10, z: Math.round(this.pose.z * 10) / 10,
    };
  }

  private frame(): void {
    const now = performance.now();
    const dtMs = now - this.last;
    this.last = now;
    this.frames++;
    if (now - this.fpsSince >= 500) { this.fps = (this.frames * 1000) / (now - this.fpsSince); this.frames = 0; this.fpsSince = now; }

    // The same render clock the players are on, so a body is where they see it, not where it is.
    const renderT = this.conn.serverNow() - INTERP_DELAY_MS;
    for (const [id, body] of this.bodies) {
      const p = this.conn.state.players.get(id);
      if (p) body.pushFrom(p, this.conn.state.t);
      body.update(renderT, dtMs);
    }

    const followed = this.following ? this.conn.state.players.get(this.following) : undefined;
    if (followed) {
      // Over the shoulder: far enough back to see what they are about to walk into.
      const bx = Math.sin(followed.yaw), bz = Math.cos(followed.yaw);
      this.pose = { ...this.pose, x: followed.x - bx * 3.2, y: followed.y + 2.1, z: followed.z - bz * 3.2, yaw: followed.yaw, pitch: 0.18 };
    } else {
      this.pose = fly(this.pose, readKeys(this.held), dtMs);
    }
    this.camera.position.copyFromFloats(this.pose.x, this.pose.y, this.pose.z);
    this.camera.rotation.set(this.pose.pitch, this.pose.yaw, 0);

    // Babylon's own counter, read either side of the render — the same way `map-review.mjs` does it,
    // so a number quoted from the viewer and one from the review tool mean the same thing.
    const counter = (this.engine as unknown as { _drawCalls?: { current: number } })._drawCalls;
    const before = counter?.current ?? 0;
    this.scene.render();
    const after = counter?.current ?? 0;
    if (after >= before) this.drawCalls = after - before;
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    for (const d of this.detach) d();
    this.detach = [];
    for (const b of this.bodies.values()) b.dispose();
    this.bodies.clear();
    this.map.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
