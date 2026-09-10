import { describe, expect, it } from "vitest";
import { PLAYER } from "./constants";
import { BODY_ENVELOPE, BUILDS, buildRig } from "./builds";
import {
  DEFAULT_OUTFIT, DROPPABLE_OUTFITS, OUTFITS, OUTFIT_HEAD_ROOM,
  isOutfitId, outfitDef, outfitParts, outfitViolations, type OutfitDef,
} from "./outfits";

/**
 * What an outfit is allowed to be.
 *
 * Builds had one thing they must not break (the hitbox) and this has two. The hitbox again — an
 * outfit adds geometry, and geometry outside the box a bullet can reach is something a player can
 * aim at and miss. And the one an outfit is far more likely to break: **which side somebody is on.**
 * Repainting a body is the whole point of an outfit and also the fastest way to make two enemies
 * look like two teammates.
 */

const rigs = BUILDS.map((b) => ({ id: b.id, rig: buildRig(b) }));
const pairs = OUTFITS.flatMap((o) => rigs.map(({ id, rig }) => ({ o, build: id, rig })));

describe("an outfit cannot reach the team's colour", () => {
  it("has no way to name the accent role", () => {
    // The enforcement is the TYPE, so this is the guard on the DATA: an entry that smuggles an
    // accent in (a hand-edit, a bad merge) fails here rather than in a match.
    for (const o of OUTFITS) {
      expect(Object.keys(o.palette ?? {}).sort(), o.id)
        .toEqual(expect.not.arrayContaining(["accent"]));
    }
  });

  it("paints only the five roles it owns, and every colour is a real one", () => {
    const allowed = new Set(["cloth", "vest", "trim", "boots", "skin", "hair"]);
    for (const o of OUTFITS) {
      for (const [role, hex] of Object.entries(o.palette ?? {})) {
        expect(allowed.has(role), `${o.id} paints ${role}`).toBe(true);
        expect(hex, `${o.id}.${role}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the shirt and the vest apart inside every outfit, so a body still reads at distance", () => {
    // The same rule the two team kits are held to: an outfit painted all one colour is a blob, and
    // a blob at 20 m is a shape nobody can resolve into a person facing a direction.
    for (const o of OUTFITS) {
      if (!o.palette) continue;
      expect(contrast(o.palette.cloth, o.palette.vest), `${o.id} shirt vs vest`).toBeGreaterThan(1.15);
    }
  });

  it("puts the team's panel back on the outside of anything worn over it", () => {
    // The failure this catches was found by LOOKING: NIETOPERZ's cape sat behind the chest box and
    // hid the back panel completely, so from behind the two sides were the same body. Reserving the
    // colour is not enough when a piece can be hung in front of it.
    for (const o of OUTFITS) {
      if (o.back === "none") continue;
      for (const { rig } of rigs) {
        const parts = outfitParts(o, rig);
        const panel = parts.find((p) => p.role === "accent");
        expect(panel, `${o.id} hangs something on the back and no team panel over it`).toBeDefined();
        // Further out than every other piece of the same outfit, or it is behind them again.
        const deepest = Math.min(...parts.filter((p) => p.joint === "torso" && p.role !== "accent").map((p) => p.z - p.d / 2));
        expect(panel!.z + panel!.d / 2, `${o.id} panel is buried`).toBeLessThanOrEqual(deepest + 1e-9);
      }
    }
  });

  it("leaves the kit alone: the default outfit declares no palette at all", () => {
    // Absent, not "the same colours copied in" — the team kit is the source of truth for it, so a
    // change to `TEAM_KITS` cannot leave the default outfit behind.
    expect(outfitDef(DEFAULT_OUTFIT).palette).toBeUndefined();
  });
});

describe("no piece of an outfit escapes the body", () => {
  it("stays inside the footprint, under the head room and above the sole, on every build", () => {
    for (const { o, build, rig } of pairs) {
      expect(outfitViolations(o, rig), `${o.id} on ${build}`).toEqual([]);
    }
  });

  it("the cape in particular stays inside the box a bullet can reach", () => {
    // The one piece that hangs off the body rather than clinging to it, so it is the one that would
    // have gone through the back of the AABB if the depth were not clamped.
    for (const { rig } of rigs) {
      const cape = outfitParts(outfitDef("nietoperz"), rig).find((p) => p.name === "fit_cape")!;
      expect(Math.abs(cape.z) + cape.d / 2).toBeLessThan(PLAYER.halfWidth);
    }
  });

  it("headgear never out-reaches a haircut", () => {
    // IROKEZ already stands proud of the crown; the allowance is that, not more, so no hat makes a
    // player taller than the tallest thing the game already draws on a head.
    for (const { o, build, rig } of pairs) {
      const headNodeY = rig.hipY + rig.torsoY + rig.headY;
      for (const p of outfitParts(o, rig)) {
        if (p.joint !== "head") continue;
        expect(headNodeY + p.y + p.h / 2, `${o.id}/${build} ${p.name}`)
          .toBeLessThanOrEqual(BODY_ENVELOPE.crownY + OUTFIT_HEAD_ROOM + 1e-9);
      }
    }
  });

  it("scales its pieces with the body, instead of sitting on top of one", () => {
    // A hood cut for the default skull would float off BARYŁKA's and swallow TYCZKA's. Measured on
    // the piece that wraps the head most tightly.
    const hood = (build: string) =>
      outfitParts(outfitDef("kibol"), buildRig(build)).find((p) => p.name === "fit_hood_top")!.w;
    expect(hood("barylka")).toBeGreaterThan(hood("tyczka") + 0.02);
  });
});

describe("the catalog is a catalog", () => {
  it("every id is a safe wire value and appears once", () => {
    for (const o of OUTFITS) expect(o.id).toMatch(/^[a-z0-9-]{1,32}$/);
    expect(new Set(OUTFITS.map((o) => o.id)).size).toBe(OUTFITS.length);
    expect(OUTFITS[0].id).toBe(DEFAULT_OUTFIT);
  });

  it("never trusts an id off the wire", () => {
    expect(isOutfitId("kibol")).toBe(true);
    for (const junk of ["nope", "", "<script>", 7, null, undefined, { id: "kibol" }]) {
      expect(isOutfitId(junk), String(junk)).toBe(false);
      expect(outfitDef(junk as string).id).toBe(DEFAULT_OUTFIT);
    }
  });

  it("drops everything except the kit, across every tier", () => {
    // The kit is not a prize — every player already wears it, and rolling one would be a dud.
    expect(DROPPABLE_OUTFITS.map((o) => o.id)).not.toContain(DEFAULT_OUTFIT);
    expect(DROPPABLE_OUTFITS.length).toBe(OUTFITS.length - 1);
    const tiers = new Set(DROPPABLE_OUTFITS.map((o) => o.rarity));
    expect([...tiers].sort()).toEqual(["epicki", "legendarny", "pospolity", "rzadki", "zloty"]);
  });

  it("the loud ones are the rare ones", () => {
    // A tracksuit is a Tuesday and a cape is a screenshot, so the tiers should follow how much of a
    // character a look is. Checked as an ordering rather than by eye.
    const weight = (o: OutfitDef) =>
      (o.headgear !== "none" ? 1 : 0) + (o.back !== "none" ? 1 : 0) + (o.face !== "none" ? 1 : 0) + (o.neck !== "none" ? 1 : 0);
    const tier = { pospolity: 0, rzadki: 1, epicki: 2, legendarny: 3, zloty: 4 } as const;
    const common = OUTFITS.filter((o) => tier[o.rarity] <= 1);
    const rare = OUTFITS.filter((o) => tier[o.rarity] >= 3);
    expect(Math.max(...common.map(weight))).toBeLessThanOrEqual(Math.max(...rare.map(weight)));
    expect(weight(outfitDef("nietoperz")), "the golden one has the most going on").toBeGreaterThan(1);
  });

  it("never drops the body's own piping", () => {
    // The outermost stripe is the widest geometry on the character. An outfit that removed it would
    // be measurably narrower than every other one, so the count is a total and the floor is one.
    for (const o of OUTFITS) expect(o.stripes, o.id).toBeGreaterThanOrEqual(1);
    expect(outfitDef("dresik").stripes, "three stripes means three").toBe(3);
    expect(outfitDef("dres-niebieski").stripes, "two, because the third one washed out").toBe(2);
  });

  it("names and blurbs are filled in, in Polish", () => {
    for (const o of OUTFITS) {
      expect(o.name.length, o.id).toBeGreaterThan(2);
      expect(o.blurb.length, o.id).toBeGreaterThan(15);
      expect(o.name, `${o.id} is upper case like the rest of the wardrobe`).toBe(o.name.toUpperCase());
    }
  });
});

/** WCAG contrast, the same measure `teamKit.ts` holds the two sides apart with. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const v = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
