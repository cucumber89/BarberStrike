import { beforeAll, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MAPS, buildCollisionWorld, type BoomEvent } from "@frankibarber/shared";
import { Grenades } from "./Grenades";

/**
 * The client suite runs in node, with no DOM, and `DynamicTexture` asks the engine for a canvas —
 * which on any platform without one means `new OffscreenCanvas(...)`. The particle textures here are
 * generated art, but this test is about DISPOSAL BOOKKEEPING, not pixels, so the drawing calls can
 * all be nothing at all. Just enough surface for `softDiscTexture` to run.
 */
beforeAll(() => {
  if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas !== "undefined") return;
  const ctx2d = {
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    stroke: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    scale: () => {}, fillText: () => {}, drawImage: () => {}, moveTo: () => {}, lineTo: () => {},
    closePath: () => {}, measureText: () => ({ width: 0 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "", globalAlpha: 1,
  };
  class StubCanvas {
    constructor(public width = 1, public height = 1) {}
    getContext(): unknown { return ctx2d; }
  }
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = StubCanvas;
});

/**
 * What a grenade leaves behind when it is over.
 *
 * `ParticleSystem.dispose()` defaults to `disposeTexture = true`, and two of the module's textures
 * are SHARED — `fireTex` with the fireball material, `smokeTex` with the dust system. So the first
 * molotov to burn out took the fireball texture with it and the first smoke to clear took the dust's,
 * meaning the second explosion of a match looked nothing like the first. Nobody would file that as a
 * leak; it reads as "the effects are inconsistent".
 */
const map = MAPS[Object.keys(MAPS)[0]];
const world = buildCollisionWorld(map);

const boom = (kind: BoomEvent["kind"], id: number, effectMs: number): BoomEvent =>
  ({ id, kind, x: map.spawns[0].x, y: map.spawns[0].y + 0.1, z: map.spawns[0].z, nx: 0, ny: 1, nz: 0, effectMs });

/** Scene textures by name, so the assertion can name the thing that went missing. */
const textureNames = (s: Scene): string[] => s.textures.map((t) => t.name);

describe("grenade effects do not take the shared textures with them", () => {
  it("keeps the fire and smoke textures alive after the effects expire", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let now = 10_000;
    const g = new Grenades(scene, world, () => now);
    expect(textureNames(scene)).toContain("gr_fireTex");
    expect(textureNames(scene)).toContain("gr_smokeTex");

    // A molotov and a smoke, both with a short life, both expiring.
    g.onBoom(boom("molotov", 1, 300));
    g.onBoom(boom("smoke", 2, 300));
    g.update(16.7);
    now += 5_000;
    g.update(16.7);

    expect(textureNames(scene), "the fireball's texture went with the molotov").toContain("gr_fireTex");
    expect(textureNames(scene), "the dust's texture went with the smoke").toContain("gr_smokeTex");

    // And the next pair still works: the effects are there, drawing with live textures.
    g.onBoom(boom("molotov", 3, 300));
    g.onBoom(boom("smoke", 4, 300));
    g.update(16.7);
    expect(textureNames(scene)).toContain("gr_fireTex");
    expect(textureNames(scene)).toContain("gr_smokeTex");
    g.dispose(); scene.dispose(); engine.dispose();
  });

  it("survives the oldest effect being pushed out by the cap", () => {
    // The cap path disposes an effect early; it used the same defaulted dispose.
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let now = 10_000;
    const g = new Grenades(scene, world, () => now);
    for (let i = 0; i < 8; i++) { g.onBoom(boom("smoke", i + 1, 20_000)); g.onBoom(boom("molotov", 100 + i, 20_000)); now += 50; g.update(16.7); }
    expect(textureNames(scene)).toContain("gr_fireTex");
    expect(textureNames(scene)).toContain("gr_smokeTex");
    g.dispose(); scene.dispose(); engine.dispose();
  });

  it("does clear everything up when the module itself goes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const g = new Grenades(scene, world, () => 10_000);
    g.onBoom(boom("molotov", 1, 20_000));
    g.onBoom(boom("smoke", 2, 20_000));
    g.update(16.7);
    g.dispose();
    expect(textureNames(scene)).not.toContain("gr_fireTex");
    expect(textureNames(scene)).not.toContain("gr_smokeTex");
    expect(scene.particleSystems.length).toBe(0);
    scene.dispose(); engine.dispose();
  });

  it("leaves nothing burning after a round reset", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const g = new Grenades(scene, world, () => 10_000);
    g.onBoom(boom("molotov", 1, 20_000));
    g.onBoom(boom("smoke", 2, 20_000));
    g.update(16.7);
    const during = scene.particleSystems.length;
    g.reset();
    g.update(16.7);
    expect(scene.particleSystems.length).toBeLessThan(during);
    // ...and the shared textures are still there for the next round.
    expect(textureNames(scene)).toContain("gr_fireTex");
    expect(textureNames(scene)).toContain("gr_smokeTex");
    g.dispose(); scene.dispose(); engine.dispose();
  });
});
