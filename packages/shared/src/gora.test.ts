import { describe, expect, it } from "vitest";
import { GORA, GORA_LIP, GORA_PERCH_Y, rotSolid } from "./gora";
import { buildCollisionWorld, type Solid } from "./map";
import { makeRayHit } from "./collision";
import { PLAYER } from "./constants";
import { MOVE } from "./movement";
import { walkable, reachable, cellKey, snapCoord, JUMP_UP } from "./mapWalk";
import { findPath, prepareNav } from "./nav";

/**
 * GÓRA (DACH)'s own rules — the claims the 1v1 arena makes that no generic map test can express,
 * every one re-derived from the finished solids rather than trusted from the file that built them.
 * The generic suite (`map.test.ts`, `mapFlags.test.ts`, `floorAudit.test.ts`) still runs over it.
 */

/** What a player can actually climb, which is NOT what the walk grid says a bot can. */
const APEX = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -PLAYER.gravity);   // 0.931 m
const MANTLE = APEX + MOVE.airStepCrouch;                                            // 1.251 m
const HW = PLAYER.halfWidth, H = PLAYER.height;
const world = buildCollisionWorld(GORA);
const roof = (s: Solid) => !/^(blok_|podworko_dol)/.test(s.name ?? "");
const sees = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  return !world.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, makeRayHit()).hit;
};

describe("GÓRA is its own 180° rotation", () => {
  it("has a twin for every solid on the roof, same size, same material class of cover", () => {
    // Fairness is a construction: every solid off the centre line is placed with its twin about the
    // origin. Checked on the OUTPUT, so a solid added by hand without its twin fails here.
    const key = (s: Solid) => [s.box.minX, s.box.minY, s.box.minZ, s.box.maxX, s.box.maxY, s.box.maxZ].map((v) => v.toFixed(3)).join(",");
    const keys = new Set(GORA.solids.filter(roof).map(key));
    const odd = GORA.solids.filter(roof).filter((s) => !keys.has(key(rotSolid(s, "twin"))));
    expect(odd.map((s) => s.name), "solids without a rotated twin").toEqual([]);
  });

  it("starts both sides at twin points, so every distance and angle is the same from either start", () => {
    const t0 = GORA.spawns.filter((s) => s.team === 0), t1 = GORA.spawns.filter((s) => s.team === 1);
    expect(t0.length).toBe(t1.length);
    for (const s of t0) expect(t1.some((t) => Math.abs(t.x + s.x) < 1e-9 && Math.abs(t.z + s.z) < 1e-9 && t.y === s.y), `spawn (${s.x}, ${s.z}) has no twin`).toBe(true);
    // The duel start is index 0 of each side (the room reads it that way), and it is the hidden one.
    // It stays in the stair head: `map-duel.ts` audited four starts closer to the middle and every
    // one of them ended the walked route onto the perch stuck (see the note in `gora.ts`).
    expect(t0[0].x).toBeLessThan(-12.6);
    expect(t0[0].z).toBeGreaterThan(-7.6);
  });

  it("walks the same path length from either start to the same place, seen from that side", () => {
    // Bots and the tool measure time; this pins the thing time is made of, on the real walk grid.
    const walk = walkable(GORA);
    prepareNav(walk);
    const t0 = GORA.spawns[0], t1 = GORA.spawns.find((s) => s.team === 1)!;
    const len = (p: { x: number; z: number }[]) => p.slice(1).reduce((a, c, i) => a + Math.hypot(c.x - p[i].x, c.z - p[i].z), 0);
    for (const to of [{ x: 0, y: GORA_PERCH_Y, z: 0 }, { x: -6.2, y: 0, z: 0 }, { x: -3.2, y: 0, z: -9.4 }, { x: -14.6, y: 0, z: 9.4 }, { x: 12.6, y: 0, z: -3.0 }]) {
      const a = findPath(walk, { x: t0.x, y: 0, z: t0.z }, to, 60000);
      const b = findPath(walk, { x: t1.x, y: 0, z: t1.z }, { x: -to.x, y: to.y, z: -to.z }, 60000);
      expect(a, `no path from T0 to ${JSON.stringify(to)}`).not.toBeNull();
      expect(b, `no path from T1 to the twin of ${JSON.stringify(to)}`).not.toBeNull();
      // Two cells of slack: A* breaks ties one way, and the grid's cell centres do not rotate onto
      // each other exactly. 1 m of path is 130 ms; the brief allows 250.
      expect(Math.abs(len(a!) - len(b!)), `path to ${JSON.stringify(to)}: ${len(a!).toFixed(1)} vs ${len(b!).toFixed(1)} m`).toBeLessThan(1.0);
    }
  });
});

describe("GÓRA's starts are hidden", () => {
  it("cannot see each other standing or crouching, either way round", () => {
    const eyes = [PLAYER.eyeHeight, PLAYER.crouchEyeHeight];
    const t0 = GORA.spawns.filter((s) => s.team === 0), t1 = GORA.spawns.filter((s) => s.team === 1);
    const visible: string[] = [];
    for (const a of t0) for (const b of t1) for (const ea of eyes) for (const eb of eyes) {
      if (sees(a.x, a.y + ea, a.z, b.x, b.y + eb, b.z)) visible.push(`(${a.x},${a.z})@${ea} sees (${b.x},${b.z})@${eb}`);
    }
    expect(visible).toEqual([]);
  });

  it("puts the duel start where only the doorway can see it", () => {
    // Every reachable surface with a line to the start must be within 9 m of it — the strip and the
    // door. A start visible from across the roof is a start that can be sniped on the buzzer.
    const walk = walkable(GORA);
    const seen = reachable(walk, GORA.spawns[0]);
    const start = GORA.spawns[0];
    const far: string[] = [];
    for (const k of seen) {
      const at = k.indexOf("@");
      const [cx, cz] = k.slice(0, at).split(",").map(Number);
      const x = cx / 2 - 0.25, z = cz / 2 - 0.25, y = Number(k.slice(at + 1));
      if (Math.hypot(x - start.x, z - start.z) <= 9) continue;
      if (sees(x, y + PLAYER.eyeHeight, z, start.x, start.y + PLAYER.eyeHeight, start.z)) far.push(`(${x}, ${y}, ${z})`);
    }
    expect(far, "surfaces over 9 m away with a line to the duel start").toEqual([]);
  });
});

describe("GÓRA's perch is the only height", () => {
  /**
   * Every standing surface a body can reach by chaining real moves from the deck: a step, a jump
   * (apex 0.93 m) with the crouch mantle on top (1.25 m), and a SPRINT JUMP across up to 4.4 m of
   * air onto anything no higher than that. The walk grid's JUMP_UP (0.88) is under the real apex,
   * and the old flat lost its whole roof to exactly that gap — so this uses the player's numbers
   * and a crouched body's headroom, never the grid's.
   */
  type Top = { name: string; y: number; box: Solid["box"] };
  /** A sprint jump: 7.6 m/s for the 0.58 s of air the 6.4 m/s launch buys = 4.43 m of ground. */
  const REACH = (2 * PLAYER.jumpVelocity / -PLAYER.gravity) * PLAYER.sprintSpeed;
  const tops: Top[] = GORA.solids.filter(roof).map((s) => ({ name: s.name ?? "?", y: s.box.maxY, box: s.box }));
  /** Horizontal gap between two footprints (0 when they touch or overlap). */
  const gap = (a: Solid["box"], b: Solid["box"]) => Math.hypot(Math.max(0, b.minX - a.maxX, a.minX - b.maxX), Math.max(0, b.minZ - a.maxZ, a.minZ - b.maxZ));
  /**
   * Can a body on `k` land on `t`? Beside it: a standing jump plus the crouch mantle (1.25 m). Across
   * a gap: the sprint jump's parabola at that distance, plus the mantle — so a target 3 m away can
   * only be 1.0 m higher, and one 4.4 m away no higher at all. Any drop within reach is a landing.
   */
  const canHop = (k: Top, t: Top) => {
    const d = gap(k.box, t.box), rise = t.y - k.y;
    if (d >= REACH) return false;
    if (rise <= 0) return true;
    if (d <= 0.6) return rise <= MANTLE;
    const u = d / REACH;
    return rise <= MOVE.airStepCrouch + 4 * APEX * u * (1 - u);
  };
  const room = (t: Top) => {
    for (let x = t.box.minX + 0.15; x <= t.box.maxX - 0.15 + 1e-9; x += 0.3)
      for (let z = t.box.minZ + 0.15; z <= t.box.maxZ - 0.15 + 1e-9; z += 0.3)
        if (!world.overlaps(x - 0.2, t.y + 0.02, z - 0.2, x + 0.2, t.y + PLAYER.crouchHeight, z + 0.2)) return true;
    return false;
  };
  const standable: Top[] = [tops.find((t) => t.name === "dach")!];
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tops) {
      if (standable.includes(t) || !room(t)) continue;
      const can = standable.some((k) => Math.abs(t.y - k.y) > 0.01 && canHop(k, t));
      if (can) { standable.push(t); grew = true; }
    }
  }
  const names = standable.map((t) => t.name);

  it("lets nothing on the roof reach the cage, so nobody leaves it", () => {
    expect(names.filter((n) => n.startsWith("siatka_") || n.startsWith("attyka_")), "the cage or the parapet is standable").toEqual([]);
    const fence = GORA.solids.filter((s) => (s.name ?? "").startsWith("siatka_"));
    expect(fence.length).toBe(4);
    const highest = Math.max(...standable.map((t) => t.y));
    for (const f of fence) expect(f.box.maxY - highest, "cage height over the highest standable top").toBeGreaterThan(MANTLE);
  });

  it("keeps every structure off limits: stair heads, tanks, fan houses, chimneys, billboards, pallets", () => {
    const off = ["klatka", "skrzydlo", "brama", "zbiornik", "wentylatornia", "lustra", "komin_pasma", "tablica", "palety", "parawan", "slup_pralni_1", "slup_pralni_2"];
    const reached = names.filter((n) => off.some((o) => n.startsWith(o)));
    expect(reached, "structures a body can chain onto").toEqual([]);
    // What IS reachable is the perch, its stairs, the low crates, the crouch units, and — by a jump
    // off the perch — the cabinet beside it and the lockers behind the court. Nothing else.
    const allowed = /^(dach|schody_|maszynownia|skrzynia|donica|kosz_|fotel_|rozdzielnia|szafki|kanal)/;
    expect(names.filter((n) => !allowed.test(n))).toEqual([]);
    expect(names).toContain("maszynownia");
  });

  it("hides a crouched player behind the lip and shows a standing one's head", () => {
    const lip = GORA.solids.find((s) => s.name === "attyka_maszynowni_pd")!;
    expect(lip.box.maxY - GORA_PERCH_Y).toBeCloseTo(GORA_LIP, 5);
    expect(GORA_LIP).toBeGreaterThan(PLAYER.crouchHeight);        // crouched: covered
    expect(GORA_LIP).toBeLessThan(PLAYER.eyeHeight);             // standing: eye over it
    expect(GORA_LIP).toBeGreaterThan(MANTLE);                    // and it cannot be stood on
    // Proved with a ray: a crouched eye on the perch has no line to a standing eye in the court.
    // The eye stands 0.25 m behind the lip's inner face (a body pressed against it); the target is a
    // standing eye 5 m out in the court.
    const court = { x: 2.6, y: 0, z: -6.5 };
    expect(sees(0, GORA_PERCH_Y + PLAYER.crouchEyeHeight, -1.95, court.x, court.y + PLAYER.eyeHeight, court.z)).toBe(false);
    expect(sees(0, GORA_PERCH_Y + PLAYER.eyeHeight, -1.95, court.x, court.y + PLAYER.eyeHeight, court.z)).toBe(true);
  });

  it("is reached by stairs a bot can climb, and the grid reaches nothing higher", () => {
    const walk = walkable(GORA);
    const seen = reachable(walk, GORA.spawns[0]);
    const heights = [...seen].map((k) => Number(k.slice(k.indexOf("@") + 1)));
    expect(Math.max(...heights)).toBeCloseTo(GORA_PERCH_Y, 2);
    expect(JUMP_UP).toBeLessThan(APEX);
    const perch = `${cellKey(snapCoord(0), snapCoord(0))}@${GORA_PERCH_Y}`;
    expect(seen.has(perch), "the perch top is not on the walk grid").toBe(true);
  });
});

describe("GÓRA's cover speaks one language", () => {
  it("uses three heights: low (jump on it), crouch (cannot be climbed), full (over a standing head)", () => {
    const heights = new Map<string, number>();
    for (const s of GORA.solids.filter(roof)) {
      if (s.box.minY > 0.011 || s.box.maxY >= 2.55) continue;            // structures and things on them
      if (/^(attyka|siatka|schody|maszynownia|dach)/.test(s.name ?? "")) continue;
      heights.set(s.name ?? "?", s.box.maxY);
    }
    for (const [name, h] of heights) {
      const low = h <= APEX - 0.1, crouch = Math.abs(h - 1.3) < 0.01 || Math.abs(h - 1.45) < 0.06, full = h >= PLAYER.height + 0.1 - 1e-9;
      expect(low || crouch || full, `${name} is ${h} m: neither low (≤ ${(APEX - 0.1).toFixed(2)}), crouch (1.3) nor full (≥ ${PLAYER.height + 0.1})`).toBe(true);
      if (crouch) expect(h, `${name} could be mantled`).toBeGreaterThan(MANTLE);
    }
  });

  it("gives every barber chair a collision the size of the drawn chair (a prop is never cover)", () => {
    const chairs = GORA.props.filter((p) => p.kind === "barber_chair");
    expect(chairs.length).toBe(4);
    for (const c of chairs) {
      const seat = GORA.solids.find((s) => s.invisible && s.box.minX < c.x && s.box.maxX > c.x && s.box.minZ < c.z && s.box.maxZ > c.z && s.box.minY < 0.1);
      const back = GORA.solids.find((s) => s.invisible && s.box.minX < c.x && s.box.maxX > c.x && s.box.minZ < c.z && s.box.maxZ > c.z && s.box.maxY > 1.4);
      expect(seat, `chair at (${c.x}, ${c.z}) has no seat proxy`).toBeDefined();
      expect(back, `chair at (${c.x}, ${c.z}) has no back proxy`).toBeDefined();
      // A body cannot stand on the seat: the back's underside leaves no headroom.
      expect(back!.box.minY - seat!.box.maxY).toBeLessThan(PLAYER.crouchHeight);
    }
    // No other prop kind that reads as an object stands loose on the deck.
    const loose = GORA.props.filter((p) => ["crate", "dumpster"].includes(p.kind));
    expect(loose).toEqual([]);
  });

  it("stands every solid on the deck, on another solid, or hangs it from its line", () => {
    const rests = (s: Solid) => {
      if (Math.abs(s.box.minY) < 0.011) return true;
      for (const o of GORA.solids) {
        if (o === s) continue;
        const ox = Math.min(s.box.maxX, o.box.maxX) - Math.max(s.box.minX, o.box.minX);
        const oz = Math.min(s.box.maxZ, o.box.maxZ) - Math.max(s.box.minZ, o.box.minZ);
        if (ox <= 0 || oz <= 0) continue;
        if (Math.abs(s.box.minY - o.box.maxY) < 0.011) return true;
      }
      return false;
    };
    const floating: string[] = [];
    for (const s of GORA.solids.filter(roof)) {
      if (s.name === "dach") continue;
      if (s.invisible) continue;
      if (/^pranie_/.test(s.name ?? "")) {
        const line = GORA.props.find((p) => p.kind === "cable" && Math.abs(p.z - (s.box.minZ + s.box.maxZ) / 2) < 0.1 && Math.abs(p.y - s.box.maxY) < 0.1 && Math.abs(p.x - (s.box.minX + s.box.maxX) / 2) <= (p.w ?? 3) / 2);
        if (!line) floating.push(`${s.name} hangs from nothing`);
        // Above a sprint jump's head: nobody bumps it and nothing shelters behind it.
        if (s.box.minY < PLAYER.height + APEX) floating.push(`${s.name} is low enough to bump`);
        continue;
      }
      if (!rests(s)) floating.push(`${s.name} at y ${s.box.minY}`);
    }
    expect(floating).toEqual([]);
  });
});

describe("GÓRA keeps its rounds short", () => {
  it("connects every named place to every other for a bot, both ways", () => {
    const walk = walkable(GORA);
    prepareNav(walk);
    const places = [
      GORA.spawns[0], GORA.spawns.find((s) => s.team === 1)!,
      { x: 0, y: GORA_PERCH_Y, z: 0 }, { x: -3.2, y: 0, z: -9.4 }, { x: 3.2, y: 0, z: 9.4 },
      { x: -14.6, y: 0, z: 9.4 }, { x: 14.6, y: 0, z: -9.4 }, ...GORA.flags, ...GORA.sites!, ...GORA.stations,
    ];
    for (const a of places) for (const b of places) {
      if (a === b) continue;
      expect(findPath(walk, { x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, 60000), `no path (${a.x},${a.z}) → (${b.x},${b.z})`).not.toBeNull();
    }
  });

  it("has no standing surface on the roof that a body fits on but cannot leave (no cul-de-sac cells)", () => {
    // A cell with exactly one walkable neighbour is a slot a player can back into and hold.
    const walk = walkable(GORA);
    const seen = reachable(walk, GORA.spawns[0]);
    const cells = new Set([...seen].map((k) => k.slice(0, k.indexOf("@"))));
    const dead: string[] = [];
    for (const k of cells) {
      const [cx, cz] = k.split(",").map(Number);
      let n = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cells.has(`${cx + dx},${cz + dz}`)) n++;
      if (n <= 1) dead.push(`(${cx / 2 - 0.25}, ${cz / 2 - 0.25})`);
    }
    expect(dead).toEqual([]);
  });

  it("keeps both starts free, on the deck, and on the walk grid", () => {
    for (const s of GORA.spawns) {
      expect(world.overlaps(s.x - HW, s.y + 0.02, s.z - HW, s.x + HW, s.y + H, s.z + HW)).toBe(false);
      expect(world.raycast(s.x, s.y + 0.5, s.z, 0, -1, 0, 0.7, makeRayHit()).hit).toBe(true);
    }
  });
});
