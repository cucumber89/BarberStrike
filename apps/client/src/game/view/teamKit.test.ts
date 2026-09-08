import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PLAYER, type Team } from "@frankibarber/shared";
import { Character } from "./Character";
import { TEAM_KITS, contrastRatio } from "./teamKit";

/**
 * A skin may change how a player LOOKS and nothing else. In a shooter, geometry is fairness.
 */

function shapeOf(team: Team): { name: string; size: string; at: string }[] {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ch = new Character(scene, team, `probe_t${team}`);
  const out = scene.meshes
    .filter((m): m is Mesh => "getBoundingInfo" in m && m.getTotalVertices() > 0)
    .map((m) => {
      const e = m.getBoundingInfo().boundingBox.extendSize;
      const p = m.position;
      return {
        // The probe's own id is in the weapon mesh names; strip it so the two bodies are compared
        // on their parts, not on what the test called them.
        name: m.name.replace(`probe_t${team}`, "probe"),
        size: `${e.x.toFixed(4)},${e.y.toFixed(4)},${e.z.toFixed(4)}`,
        at: `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`,
      };
    })
    .sort((a, b) => (a.name + a.at).localeCompare(b.name + b.at));
  ch.dispose();
  scene.dispose();
  engine.dispose();
  return out;
}

describe("the Marcovia kit is a palette, not an advantage", () => {
  it("gives both sides the exact same body: same parts, same sizes, same places", () => {
    // If this ever fails, a skin has changed a silhouette — which changes how easy that player is
    // to see and to hit. Colours are the only thing a kit is allowed to touch.
    const a = shapeOf(0);
    const b = shapeOf(1);
    expect(a.length).toBeGreaterThan(20);
    expect(a).toEqual(b);
  });

  it("leaves the hitbox where it always was — it never came from the mesh", () => {
    // The box the server hits is PLAYER.halfWidth x PLAYER.height, not anything built above.
    // Stated as a test so a future kit that tries to reach for the body dimensions trips over it.
    const parts = shapeOf(0);
    const widest = Math.max(...parts.map((m) => Number(m.size.split(",")[0])));
    expect(widest, "no single part may stick out past the box the server collides with")
      .toBeLessThanOrEqual(PLAYER.halfWidth);
  });
});

describe("the two sides cannot be confused for each other", () => {
  const [m, t] = [TEAM_KITS[0], TEAM_KITS[1]];

  it("separates the shirts by value, not only by hue", () => {
    // Hue alone fails in a dark corner, through smoke, and for a colour-blind player. The shirt is
    // the biggest area on a body, so it is the one that has to carry the difference.
    expect(contrastRatio(m.cloth, t.cloth)).toBeGreaterThan(3);
    expect(contrastRatio(m.vest, t.vest)).toBeGreaterThan(2);
  });

  it("dresses Marcovia in the club's three colours", () => {
    // Yellow shirt, green vest, white trim — what every source says the club plays in.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return -1;
      const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return h * 60;
    };
    expect(hue(m.cloth), "shirt is yellow").toBeGreaterThan(40);
    expect(hue(m.cloth), "shirt is yellow").toBeLessThan(65);
    expect(hue(m.vest), "vest is green").toBeGreaterThan(90);
    expect(hue(m.vest), "vest is green").toBeLessThan(165);
    expect(hue(m.trim), "trim is white (no hue to speak of)").toBeLessThan(90);
    expect(contrastRatio(m.trim, "#000000"), "trim is near-white").toBeGreaterThan(15);
  });

  it("keeps every kit's team panel matched to that side's colour on the minimap", () => {
    // The body on screen and the dot on the radar must obviously be the same side.
    expect(m.accent.toLowerCase()).toBe("#d9a441");
    expect(t.accent.toLowerCase()).toBe("#7a5cc9");
  });

  it("holds the shirt and the vest apart inside a kit, so the strip reads at distance", () => {
    for (const kit of [m, t]) expect(contrastRatio(kit.cloth, kit.vest), kit.name).toBeGreaterThan(1.6);
  });
});
