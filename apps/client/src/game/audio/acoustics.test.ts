import { describe, expect, it } from "vitest";
import { CollisionWorld } from "@frankibarber/shared";
import { Acoustics, SPEED_OF_SOUND, airCutoff, heard, occlusion, roomOf, travelDelay } from "./acoustics";

describe("acoustics: the air", () => {
  it("delays a sound by its travel time, but not up close and not forever", () => {
    expect(travelDelay(1)).toBe(0);
    expect(travelDelay(34.3)).toBeCloseTo(34.3 / SPEED_OF_SOUND, 6);
    expect(travelDelay(34.3)).toBeCloseTo(0.1, 3);
    expect(travelDelay(5000)).toBe(0.25);
  });

  it("dulls a far sound: the cutoff falls with distance and never reaches silence", () => {
    expect(airCutoff(0)).toBe(20000);
    expect(airCutoff(10)).toBeGreaterThan(airCutoff(30));
    expect(airCutoff(30)).toBeGreaterThan(airCutoff(60));
    expect(airCutoff(25)).toBeGreaterThan(6000);
    expect(airCutoff(25)).toBeLessThan(8000);
    expect(airCutoff(500)).toBe(1400);
  });
});

describe("acoustics: walls", () => {
  it("muffles through one wall and more through two", () => {
    expect(occlusion(0)).toEqual({ gain: 1, cutoff: 20000 });
    expect(occlusion(1).gain).toBeLessThan(1);
    expect(occlusion(2).gain).toBeLessThan(occlusion(1).gain);
    expect(occlusion(2).cutoff).toBeLessThan(occlusion(1).cutoff);
    // The filter is the tighter of the two: air or wall.
    expect(heard(5, 1).lowpass).toBe(occlusion(1).cutoff);
    expect(heard(80, 0).lowpass).toBe(airCutoff(80));
  });

  it("counts the walls on the line between the ear and the source", () => {
    const w = new CollisionWorld();
    w.add({ minX: 4, minY: 0, minZ: -5, maxX: 4.3, maxY: 4, maxZ: 5 });
    w.add({ minX: 8, minY: 0, minZ: -5, maxX: 8.3, maxY: 4, maxZ: 5 });
    const a = new Acoustics(w);
    a.setListener(0, 1.6, 0);
    expect(a.wallsTo(3, 1.6, 0)).toBe(0);
    expect(a.wallsTo(6, 1.6, 0)).toBe(1);
    expect(a.wallsTo(12, 1.6, 0)).toBe(2);
    expect(a.wallsTo(0, 1.6, 10)).toBe(0);          // round the side: open
    // A source standing on the floor is not muffled by the floor it stands on.
    w.add({ minX: -10, minY: -1, minZ: -10, maxX: 3.9, maxY: 0, maxZ: 10 });
    expect(a.wallsTo(3, 0.05, 0)).toBe(0);
    const h = a.hear(12, 1.6, 0);
    expect(h.gain).toBe(occlusion(2).gain);
    expect(h.delay).toBeCloseTo(12 / SPEED_OF_SOUND, 6);
  });
});

describe("acoustics: the room", () => {
  it("rings more in a closed room than in the open air", () => {
    const open = roomOf(1, 8, 20, false);
    const room = roomOf(8, 8, 3, true);
    expect(room.wet).toBeGreaterThan(open.wet);
    expect(room.tone).toBeGreaterThan(open.tone);
    expect(open.wet).toBeLessThan(1);   // the yard answers less than today's fixed mix
    expect(room.wet).toBeGreaterThan(1);
  });

  it("measures the room from the world and eases into it", () => {
    const w = new CollisionWorld();
    // A 6 x 6 x 3 m box room around the ear.
    w.add({ minX: -3.3, minY: 0, minZ: -3.3, maxX: -3, maxY: 3, maxZ: 3.3 });
    w.add({ minX: 3, minY: 0, minZ: -3.3, maxX: 3.3, maxY: 3, maxZ: 3.3 });
    w.add({ minX: -3.3, minY: 0, minZ: -3.3, maxX: 3.3, maxY: 3, maxZ: -3 });
    w.add({ minX: -3.3, minY: 0, minZ: 3, maxX: 3.3, maxY: 3, maxZ: 3.3 });
    w.add({ minX: -3.3, minY: 3, minZ: -3.3, maxX: 3.3, maxY: 3.3, maxZ: 3.3 });
    const a = new Acoustics(w);
    a.setListener(0, 1.6, 0);
    const start = a.wet;
    let t = 0;
    for (let i = 0; i < 180; i++) { t += 16; a.probe(t, 16); }
    expect(a.wet).toBeGreaterThan(start);
    expect(a.wet).toBeCloseTo(roomOf(8, 8, 3.2, true).wet, 1);
    const empty = new Acoustics(new CollisionWorld());
    empty.setListener(0, 1.6, 0);
    for (let i = 0; i < 180; i++) { t += 16; empty.probe(t, 16); }
    expect(empty.wet).toBeLessThan(a.wet);
  });
});
