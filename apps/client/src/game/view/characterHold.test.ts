import { describe, expect, it } from "vitest";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "@frankibarber/shared";
import { gunBoxInTorso, holdPose, overlap, vestPenetration, HOLD, VEST } from "./characterHold";

/**
 * Drop A: the third-person gun is a held object, not a decal on the chest.
 *
 * Three art-review rounds rejected the same frames — the gun swallowed by the vest from the front,
 * the stock coming out of the character's back in profile — and two hand-tuned fixes moved one end
 * of the gun out of the body while pushing the other in. A 1.3 m gun has two ends; a screenshot
 * from the front shows one. These are the numbers that show both.
 */

const slotOf = (id: WeaponId): 1 | 2 | 3 => WEAPONS[id].slot as 1 | 2 | 3;

describe("third-person hold: the gun does not pass through the body", () => {
  it.each(WEAPON_ORDER)("%s clears the vest", (id) => {
    const box = gunBoxInTorso(id, slotOf(id));
    const pen = vestPenetration(box);
    const o = overlap(box, VEST);
    expect(pen, `${id}: ${(pen * 1000).toFixed(0)} mm inside the vest (overlap x/y/z ${o.map((v) => (v * 1000).toFixed(0)).join("/")} mm); gun box x ${box.min[0].toFixed(3)}…${box.max[0].toFixed(3)}, z ${box.min[2].toFixed(3)}…${box.max[2].toFixed(3)}`).toBe(0);
  });

  it("leaves every gun visible past the vest's edge, not swallowed by it", () => {
    for (const id of WEAPON_ORDER) {
      const box = gunBoxInTorso(id, slotOf(id));
      // Either the gun is wholly outboard of the vest, or a hand's width of it shows past the edge.
      const clear = box.min[0] >= VEST.max[0];
      const showing = box.max[0] - VEST.max[0];
      expect(clear || showing > 0.05, `${id}: only ${(showing * 1000).toFixed(0)} mm shows past the vest edge`).toBe(true);
    }
  });

  it("does not solve the clash by holding the gun out at a stiff arm", () => {
    // Pushing the gun forward until its stock clears the back is the other way to satisfy the
    // clearance above, and it is what earlier rounds rejected. The grip stays near the chest.
    expect(holdPose(1).position[2], "grip depth").toBeLessThan(0.2);
    for (const id of WEAPON_ORDER) {
      expect(holdPose(slotOf(id)).position[0], `${id} grip offset`).toBeLessThan(0.42);
      expect(gunBoxInTorso(id, slotOf(id)).max[1], `${id} top`).toBeLessThan(1.0);
    }
  });
});

describe("holdPose", () => {
  it("mirrors the constants Character.update writes", () => {
    const long = holdPose(1);
    expect(long.position).toEqual([HOLD.x, HOLD.y, HOLD.z]);
    expect(long.rotation).toEqual([HOLD.pitch, HOLD.yaw, 0]);
    // A sidearm sits a little further out and forward; the clippers lower and further forward still.
    expect(holdPose(2).position[0]).toBeGreaterThan(long.position[0]);
    expect(holdPose(3).position[1]).toBeLessThan(long.position[1]);
  });
});
