import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  BODY_ENVELOPE, BUILDS, DEFAULT_BUILD, HAIRCUTS, PLAYER, PROFILE_BANDS,
  buildRig, encodeHaircut, headZoneStart, profileDistance, widthProfile,
} from "@frankibarber/shared";
import { Character, type CharacterInput } from "./Character";

/**
 * The other half of `shared/builds.test.ts`.
 *
 * That file proves the RIG keeps every build inside one envelope. This one proves the rig is not
 * describing a fiction: it measures every VERTEX `Character.ts` actually emits, in world space with
 * the joint chain applied, and holds those against the same envelope. A solver that is right about a
 * body nobody draws would be worth nothing, and a bounding box per merged mesh would not catch a gut
 * grown past the shoulders — only the vertices do.
 *
 * Two poses, for two different questions. `rest()` never runs the animation, so it is directly
 * comparable to the pure model. `stand()` runs it, and gives every build the SAME name so the idle
 * breath is in the same phase for all six and the build is the only variable — the breath moves the
 * hips ±6 mm, which would otherwise swamp the millimetre the comparisons are looking for.
 */

const scene = () => new Scene(new NullEngine());
const input = (over: Partial<CharacterInput> = {}): CharacterInput =>
  ({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "rifle", moveDir: 0, ...over });

/** The body as the constructor left it: no rotations, no smoothing — the pose the rig describes. */
function rest(build: string): { c: Character; s: Scene } {
  const s = scene(), c = new Character(s, 0, "rest", build);
  c.root.computeWorldMatrix(true);
  return { c, s };
}

/** The body the game actually draws, with the animation settled. */
function stand(build: string, over: Partial<CharacterInput> = {}, frames = 8): { c: Character; s: Scene } {
  const s = scene(), c = new Character(s, 0, "same-phase", build);
  for (let i = 0; i < frames; i++) c.update(input(over), 16);
  c.root.computeWorldMatrix(true);
  return { c, s };
}

interface Measured { minY: number; maxY: number; halfX: number; maxZ: number; minZ: number; profile: number[] }

/**
 * Every vertex of the body, bucketed into the same height bands the shared module profiles in, so
 * the measured silhouette and the predicted one are directly comparable.
 */
function measure(c: Character, only?: (name: string) => boolean): Measured {
  const out: Measured = {
    minY: Infinity, maxY: -Infinity, halfX: 0, maxZ: -Infinity, minZ: Infinity,
    profile: new Array<number>(PROFILE_BANDS).fill(0),
  };
  const lo = BODY_ENVELOPE.footY, step = (BODY_ENVELOPE.crownY - lo) / PROFILE_BANDS;
  const v = new Vector3();
  for (const m of c.allMeshes) {
    // The held weapon is not part of the body; nor is anything the build hid.
    if (!m.isEnabled() || m.name.startsWith("tp_")) continue;
    if (only && !only(m.name)) continue;
    const positions = m.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    m.computeWorldMatrix(true);
    const world = m.getWorldMatrix();
    for (let i = 0; i < positions.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], world, v);
      out.minY = Math.min(out.minY, v.y); out.maxY = Math.max(out.maxY, v.y);
      out.halfX = Math.max(out.halfX, Math.abs(v.x));
      out.maxZ = Math.max(out.maxZ, v.z); out.minZ = Math.min(out.minZ, v.z);
      const band = Math.floor((v.y - lo) / step);
      if (band >= 0 && band < PROFILE_BANDS) out.profile[band] = Math.max(out.profile[band], Math.abs(v.x));
    }
  }
  return out;
}

const isHead = (n: string) => n.startsWith("skull") || n.startsWith("bare_head");
const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
/** The cap sits proud of the crown; the rig owns its height, so the two agree by construction. */
const SILHOUETTE_TOP = BODY_ENVELOPE.topY;

describe("the rest pose is the body the rig describes", () => {
  it("lands on the envelope, to the bevel", () => {
    // `beveledBox` rounds the vertical corners but leaves the top and bottom faces flat, so height
    // is exact and width comes in by up to 18% of the smallest edge on a corner.
    for (const b of BUILDS) {
      const { c, s } = rest(b.id);
      const e = measure(c);
      expect(e.maxY, `${b.id} top`).toBeCloseTo(SILHOUETTE_TOP, 6);
      expect(e.minY, `${b.id} sole`).toBeCloseTo(BODY_ENVELOPE.footY, 6);
      expect(e.halfX, `${b.id} widest`).toBeCloseTo(BODY_ENVELOPE.halfW, 6);
      c.dispose(); s.dispose();
    }
  });

  it("matches the silhouette the pure module predicts, band for band", () => {
    // The pure model is what `builds.test.ts` reasons about, so it has to be the same body. Bands
    // the model leaves empty are skipped: it carries structure only, and kit detail (a pouch, the
    // goggles) can fill a band no structural box reaches into.
    for (const b of BUILDS) {
      const { c, s } = rest(b.id);
      const measured = measure(c).profile, predicted = widthProfile(buildRig(b));
      for (let i = 0; i < PROFILE_BANDS; i++) {
        if (predicted[i] === 0 || measured[i] === 0) continue;
        expect(measured[i], `${b.id} band ${i}`).toBeLessThan(predicted[i] + 0.005);
      }
      c.dispose(); s.dispose();
    }
  });
});

describe("the drawn body of every build fills the same envelope", () => {
  it("stands the same height and reaches the same width, whichever build it is", () => {
    const tops: number[] = [], widths: number[] = [], soles: number[] = [], crowns: number[] = [];
    for (const b of BUILDS) {
      const { c, s } = stand(b.id);
      const e = measure(c);
      // Against the shared envelope first: a drift that moved every build together would still be
      // a drift away from the character the game shipped. The idle breath lowers the hips by up to
      // 6 mm, which is the whole of the allowance here.
      expect(Math.abs(e.maxY - SILHOUETTE_TOP), `${b.id} top`).toBeLessThan(0.008);
      expect(Math.abs(e.minY - BODY_ENVELOPE.footY), `${b.id} sole`).toBeLessThan(0.008);
      tops.push(e.maxY); soles.push(e.minY);
      widths.push(e.halfX); crowns.push(measure(c, isHead).maxY);
      c.dispose(); s.dispose();
    }
    // ...and then against each other, which is the claim a player is owed: two builds that both sit
    // inside a loose tolerance but not on top of each other would still be an unfair pair.
    expect(spread(tops), `tops: ${tops.map((v) => v.toFixed(4)).join(", ")}`).toBeLessThan(0.002);
    expect(spread(soles), "soles").toBeLessThan(0.002);
    expect(spread(crowns), "crowns").toBeLessThan(0.002);
    // The arms swing out of the rest pose by a shared set of angles, so a thicker sleeve traces a
    // slightly wider arc: MEASURED 0.4154 m (TYCZKA) to 0.4337 m (BYK), an 18 mm spread on a sleeve
    // edge. It is bounded here and it is the only extent that is not equal to the millimetre. It
    // changes nothing about registration — the AABB is 0.35 m for all of them either way.
    expect(spread(widths), `widths: ${widths.map((v) => v.toFixed(4)).join(", ")}`).toBeLessThan(0.025);
  });

  it("puts every build's head in the band the server scores as a headshot", () => {
    const zone = headZoneStart();
    for (const b of BUILDS) {
      const { c, s } = stand(b.id);
      const head = measure(c, isHead);
      expect(head.minY - zone, `${b.id} chin above the head zone`).toBeGreaterThan(0.05);
      // Inside the footprint too, so a hunched head cannot be aimed at and missed sideways: the
      // hit test is an AABB about the player's position and knows nothing about the lean.
      expect(head.halfX, `${b.id} head width`).toBeLessThan(PLAYER.halfWidth);
      expect(Math.max(head.maxZ, -head.minZ), `${b.id} head reach`).toBeLessThan(PLAYER.halfWidth);
      c.dispose(); s.dispose();
    }
  });

  it("keeps the head where it belongs through a shave and every haircut", () => {
    for (const b of BUILDS) {
      const crowns: number[] = [];
      for (const cut of HAIRCUTS) {
        const { c, s } = stand(b.id, { haircut: cut.id });
        const hair = measure(c, (n) => n === "hair");
        if (hair.maxY !== -Infinity) {
          // Hair sits ON the skull: never down past the collar, never floating off the crown. The
          // 0.14 m allowance is IROKEZ, whose whole point is a ridge standing above the head.
          expect(hair.minY, `${b.id}/${cut.id} hair reaches the collar`).toBeGreaterThan(headZoneStart());
          expect(hair.maxY, `${b.id}/${cut.id} hair floats off the crown`).toBeLessThan(BODY_ENVELOPE.crownY + 0.14);
        }
        crowns.push(measure(c, isHead).maxY);
        c.dispose(); s.dispose();
      }
      expect(spread(crowns), `${b.id} crown across the catalog`).toBeLessThan(0.002);
      // A shaved head is the same skull wearing a different material — a shell 15 mm proud of it,
      // so it wins the depth test — so being shaved must not move the crown either.
      const { c, s } = stand(b.id, { haircut: encodeHaircut("buzz", 4), shaved: true });
      const scalp = measure(c, (n) => n.startsWith("bare_head")).maxY;
      expect(scalp - crowns[0], `${b.id} shaved crown`).toBeCloseTo(0.015, 3);
      c.dispose(); s.dispose();
    }
  });

  it("a crouch is worth the same to every build", () => {
    // Crouching lowers the hips by a distance in metres, and that distance is deliberately NOT
    // scaled by the build's own hip height: scaling it spread the crouched crown over 69 mm, because
    // a short build then dipped less than a tall one. Equal displacement is equal exposure.
    const crowns: number[] = [];
    for (const b of BUILDS) {
      const { c, s } = stand(b.id, { crouch: true }, 240);
      crowns.push(measure(c, isHead).maxY);
      c.dispose(); s.dispose();
    }
    expect(spread(crowns), `crouched crowns: ${crowns.map((v) => v.toFixed(3)).join(", ")}`).toBeLessThan(0.04);
  });

  it("costs no extra draw call for a build, whatever its shape", () => {
    // The body is merged per joint and material; a build changes the SIZE of boxes, never their
    // number — a hunch's upper-back box merges into the torso's cloth group with the chest. A room
    // holds twelve of these, so one extra mesh per build would be twelve draw calls a frame.
    const counts = BUILDS.map((b) => {
      const { c, s } = stand(b.id);
      const n = c.allMeshes.filter((m) => !m.name.startsWith("tp_")).length;
      c.dispose(); s.dispose();
      return n;
    });
    expect(new Set(counts).size, `mesh counts: ${counts.join(", ")}`).toBe(1);
  });
});

describe("the six really do look different once built", () => {
  it("differ by more than a re-colour could", () => {
    const profiles = BUILDS.map((b) => {
      const { c, s } = stand(b.id);
      const p = measure(c).profile;
      c.dispose(); s.dispose();
      return { id: b.id, p };
    });
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        expect(profileDistance(profiles[i].p, profiles[j].p), `${profiles[i].id} vs ${profiles[j].id}`)
          .toBeGreaterThan(0.04);
      }
    }
  });
});

describe("the default build is the character the game already had", () => {
  it("draws the body measured on main before builds existed", () => {
    // MEASURED on `main`: the rest pose spanned y -0.010..1.905 with a half-width of 0.367 before a
    // single frame of animation. Anything that moves those has changed the character every player
    // already knows, which is not what this is.
    const { c, s } = rest(DEFAULT_BUILD);
    const e = measure(c);
    expect(e.minY, "sole").toBeCloseTo(-0.01, 6);
    expect(e.maxY, "cap").toBeCloseTo(1.905, 6);
    expect(e.halfX, "widest").toBeCloseTo(0.367, 6);
    c.dispose(); s.dispose();
  });

  it("is what an unknown build id falls back to, rather than a throw", () => {
    const bad = rest("a-build-that-does-not-exist"), good = rest(DEFAULT_BUILD);
    const a = measure(bad.c), b = measure(good.c);
    expect(a.maxY).toBeCloseTo(b.maxY, 9);
    expect(a.minY).toBeCloseTo(b.minY, 9);
    expect(a.halfX).toBeCloseTo(b.halfX, 9);
    expect(a.profile).toEqual(b.profile);
    bad.c.dispose(); bad.s.dispose(); good.c.dispose(); good.s.dispose();
  });
});
