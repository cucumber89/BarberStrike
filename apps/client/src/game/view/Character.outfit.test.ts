import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  BODY_ENVELOPE, BUILDS, DEFAULT_BUILD, DEFAULT_OUTFIT, OUTFITS, OUTFIT_HEAD_ROOM, PLAYER,
} from "@frankibarber/shared";
import { Character, type CharacterInput } from "./Character";
import { TEAM_KITS } from "./teamKit";

/**
 * Outfits, measured on the meshes rather than on the recipe.
 *
 * `shared/outfits.test.ts` proves the catalog obeys its own rules. This proves the rules describe
 * the body that gets built: that a hood really does merge into a mesh that was already there, that
 * nothing an outfit adds sticks out of the box a bullet can reach, and — the one a player would
 * actually be hurt by — that whatever anybody is wearing, the team's colour is still on them.
 */

const scene = () => new Scene(new NullEngine());
const input = (over: Partial<CharacterInput> = {}): CharacterInput =>
  ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle", moveDir: 0, haircut: "cap", ...over });

function wear(outfit: string, build = DEFAULT_BUILD, team: 0 | 1 = 0, over: Partial<CharacterInput> = {}) {
  const s = scene(), c = new Character(s, team, "fit", build, outfit);
  for (let i = 0; i < 4; i++) c.update(input(over), 16);
  c.root.computeWorldMatrix(true);
  return { c, s };
}

const body = (c: Character) => c.allMeshes.filter((m) => !m.name.startsWith("tp_"));

/** World-space extents of the meshes whose name passes `pick`. */
function extents(c: Character, pick: (name: string) => boolean) {
  let minY = Infinity, maxY = -Infinity, halfX = 0, maxZ = -Infinity, minZ = Infinity, found = 0;
  const v = new Vector3();
  for (const m of body(c)) {
    if (!m.isEnabled() || !pick(m.name)) continue;
    const positions = m.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    found++;
    m.computeWorldMatrix(true);
    const world = m.getWorldMatrix();
    for (let i = 0; i < positions.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], world, v);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      halfX = Math.max(halfX, Math.abs(v.x));
      maxZ = Math.max(maxZ, v.z); minZ = Math.min(minZ, v.z);
    }
  }
  return { minY, maxY, halfX, maxZ, minZ, found };
}

describe("an outfit costs nothing to wear", () => {
  it("adds no draw call, on any build", () => {
    // The whole reason `JOINT_ROLES` exists. MEASURED before that rule: a beard and a hat band took
    // the body from 32 meshes to 34, and twelve bodies is twelve times whatever this number is.
    for (const build of BUILDS) {
      const counts = OUTFITS.map((o) => {
        const { c, s } = wear(o.id, build.id);
        const n = body(c).length;
        c.dispose(); s.dispose();
        return n;
      });
      expect(new Set(counts).size, `${build.id}: ${counts.join(", ")}`).toBe(1);
    }
  });

  it("shares one material set between two players in the same team and outfit", () => {
    const s = scene();
    const a = new Character(s, 0, "a", DEFAULT_BUILD, "kibol");
    const b = new Character(s, 0, "b", DEFAULT_BUILD, "kibol");
    const c = new Character(s, 0, "c", DEFAULT_BUILD, "menel");
    const mats = (ch: Character) => new Set(ch.allMeshes.map((m) => m.material?.name).filter(Boolean));
    expect([...mats(a)].every((n) => mats(b).has(n!)), "same outfit, same materials").toBe(true);
    expect([...mats(a)].some((n) => !mats(c).has(n!)), "a different outfit is a different set").toBe(true);
    a.dispose(); b.dispose(); c.dispose(); s.dispose();
  });
});

describe("nothing an outfit adds escapes the body", () => {
  it("keeps every piece inside the footprint a bullet can reach", () => {
    for (const o of OUTFITS) {
      for (const build of BUILDS) {
        const { c, s } = wear(o.id, build.id);
        const piece = extents(c, (n) => n.startsWith("fit_"));
        if (piece.found) {
          expect(piece.halfX, `${o.id}/${build.id} width`).toBeLessThan(PLAYER.halfWidth);
          expect(Math.max(piece.maxZ, -piece.minZ), `${o.id}/${build.id} depth`).toBeLessThan(PLAYER.halfWidth);
          expect(piece.maxY, `${o.id}/${build.id} height`).toBeLessThan(BODY_ENVELOPE.crownY + OUTFIT_HEAD_ROOM);
          expect(piece.minY, `${o.id}/${build.id} sole`).toBeGreaterThan(BODY_ENVELOPE.footY);
        }
        c.dispose(); s.dispose();
      }
    }
  });

  it("never widens the body it is worn on", () => {
    // An outfit is paint and trimmings. If one of them reached past the silhouette, a player would
    // be choosing a look and buying a slightly bigger target.
    const bare = (() => { const { c, s } = wear(DEFAULT_OUTFIT); const w = extents(c, () => true).halfX; c.dispose(); s.dispose(); return w; })();
    for (const o of OUTFITS) {
      const { c, s } = wear(o.id);
      expect(extents(c, () => true).halfX, `${o.id}`).toBeLessThanOrEqual(bare + 1e-6);
      c.dispose(); s.dispose();
    }
  });

  it("leaves the skull, and therefore the headshot, exactly where it was", () => {
    for (const o of OUTFITS) {
      const { c, s } = wear(o.id);
      const skull = extents(c, (n) => n.startsWith("skull"));
      expect(skull.maxY, o.id).toBeCloseTo(BODY_ENVELOPE.crownY, 2);
      c.dispose(); s.dispose();
    }
  });
});

describe("whatever you wear, your side is still readable", () => {
  it("paints the team's accent on every outfit, on both sides", () => {
    // The claim the missing `accent` field buys. Read off the MATERIAL the meshes actually carry,
    // not off the catalog, so a renderer that wired the palette in wrongly fails here.
    for (const team of [0, 1] as const) {
      for (const o of OUTFITS) {
        const { c, s } = wear(o.id, DEFAULT_BUILD, team);
        const accents = body(c).filter((m) => m.material?.name.startsWith("ch_accent"));
        expect(accents.length, `${o.id} on team ${team} has no team-coloured part`).toBeGreaterThan(0);
        expect(accents.some((m) => m.isEnabled()), `${o.id}/${team} team colour is hidden`).toBe(true);
        c.dispose(); s.dispose();
      }
    }
  });

  it("puts the team's colour on the chest and the arm, not only on a badge", () => {
    // A panel a player can only see from behind is not an answer to "who is that in the doorway".
    for (const o of OUTFITS) {
      const { c, s } = wear(o.id);
      const named = body(c).filter((m) => m.material?.name.startsWith("ch_accent")).map((m) => m.name).join(" ");
      expect(named, o.id).toContain("panel");
      expect(named, `${o.id} armband`).toContain("bandR");
      c.dispose(); s.dispose();
    }
  });

  it("uses the kit's own colours only for the default outfit", () => {
    // KLUBOWY is the kit; everything else is the outfit's palette. Checked by material NAME, which
    // carries the outfit id, so the two cannot be silently swapped.
    const shirt = (outfit: string) => {
      const { c, s } = wear(outfit);
      const name = body(c).find((m) => m.name === "chest")?.material?.name ?? "";
      c.dispose(); s.dispose();
      return name;
    };
    expect(shirt(DEFAULT_OUTFIT)).toContain(DEFAULT_OUTFIT);
    expect(shirt("kibol")).toContain("kibol");
    expect(TEAM_KITS[0].accent).toBe("#d9a441");   // and the reserved colour is still the kit's
  });
});

describe("the pieces do what they are for", () => {
  it("a headgear replaces the shop cap instead of stacking on it", () => {
    for (const o of OUTFITS) {
      const { c, s } = wear(o.id);
      const cap = body(c).find((m) => m.name.startsWith("cap"))!;
      expect(cap.isEnabled(), `${o.id} cap`).toBe(o.headgear === "none");
      c.dispose(); s.dispose();
    }
  });

  it("only the cowl hides the hair under it", () => {
    for (const id of ["kibol", "menel", "nietoperz", DEFAULT_OUTFIT]) {
      const { c, s } = wear(id, DEFAULT_BUILD, 0, { haircut: "pompadour" });
      const hair = body(c).find((m) => m.name === "hair");
      expect(hair?.isEnabled() ?? false, id).toBe(id !== "nietoperz");
      c.dispose(); s.dispose();
    }
  });

  it("counts the stripes a player was promised", () => {
    const stripes = (outfit: string) => {
      const { c, s } = wear(outfit);
      // Merged into one mesh per limb, so count the vertices against a single stripe's.
      const one = body(c).find((m) => m.name.startsWith("track_arm_r"))!.getTotalVertices();
      c.dispose(); s.dispose();
      return one;
    };
    expect(stripes("dresik"), "three").toBeGreaterThan(stripes("dres-niebieski"));
    expect(stripes("dres-niebieski"), "two").toBeGreaterThan(stripes(DEFAULT_OUTFIT));
  });

  it("ties the apron on only when the outfit wears one", () => {
    // The apron merges into the torso's vest mesh, so it shows up as vertices rather than as a
    // mesh — which is the point. Compared between outfits rather than against a magic number.
    const vestVerts = (outfit: string) => {
      const { c, s } = wear(outfit);
      const n = body(c).find((m) => m.name.startsWith("vest"))!.getTotalVertices();
      c.dispose(); s.dispose();
      return n;
    };
    const withApron = vestVerts("barber"), without = vestVerts("dresik");
    expect(withApron, "an apron is more vest than no apron").toBeGreaterThan(without);
    expect(vestVerts("kebab")).toBe(withApron);
    expect(vestVerts(DEFAULT_OUTFIT)).toBe(withApron);
    expect(vestVerts("nietoperz")).toBe(without);
  });
});
