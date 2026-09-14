import type { Brush } from "./brush";
import { alpha, shade } from "./color";
import type { FramePart, Zone } from "./types";

/**
 * Damage is drawn where damage happens: chips along part edges, scratches across flats, grime in
 * the corners a hand touches. `amount` 0..1 mixes the recipe's own factory wear with the instance
 * wear rolled from a crate. Bare metal under a chip is always a cool steel grey.
 */
export function paintWear(b: Brush, parts: readonly FramePart[], window: Zone, amount: number, rng: () => number, ground: string, detail = 1): void {
  if (amount <= 0) return;
  amount *= Math.sqrt(detail);
  const bare = "#a9b0b6", dark = shade(ground, -.6);
  b.save();
  // Edge chips: small flakes of bare metal along the top and bottom of every part.
  for (const { zone: z } of parts) {
    const len = (z.z1 - z.z0) + (z.y1 - z.y0);
    const chips = Math.floor(len * 260 * amount * (rng() + .5));
    for (let i = 0; i < chips; i++) {
      const alongTop = rng() < .5, t = rng();
      const x = z.z0 + t * (z.z1 - z.z0), y = alongTop ? z.y1 : z.y0;
      const r = .0006 + rng() * rng() * .003;
      b.alpha(.55 + rng() * .4); b.ellipse(x, y + (alongTop ? -r * .4 : r * .4), r * (1 + rng()), r * .7, bare, (rng() - .5) * .8);
      b.alpha(.35); b.ellipse(x + r * .3, y + (alongTop ? -r : r), r * .8, r * .4, dark, 0);
    }
    // The corners of a part take the most knocks.
    if (rng() < amount) { b.alpha(.7); b.circle(rng() < .5 ? z.z0 : z.z1, rng() < .5 ? z.y0 : z.y1, .002 + rng() * .004 * amount, bare); }
  }
  // Scratches: thin, straight, mostly along the weapon.
  const scratches = Math.floor(90 * amount * amount + 25 * amount);
  for (let i = 0; i < scratches; i++) {
    const x = window.z0 + rng() * (window.z1 - window.z0), y = window.y0 + rng() * (window.y1 - window.y0);
    const len = .005 + rng() * rng() * .06, a = (rng() - .5) * .6 + (rng() < .2 ? Math.PI / 2 : 0);
    b.alpha(.25 + rng() * .5);
    b.line([x, y, x + Math.cos(a) * len, y + Math.sin(a) * len], rng() < .7 ? bare : dark, .0003 + rng() * .0007, "butt");
  }
  // Grime pools low on the grip and along the bottom edge of the receiver.
  b.blend("multiply");
  for (const { zone: z } of parts) {
    if (rng() > amount * 1.3) continue;
    const cx = z.z0 + rng() * (z.z1 - z.z0), cy = z.y0 + (z.y1 - z.y0) * .2, r = (z.y1 - z.y0) * (.4 + rng() * .5);
    b.alpha(.6 * amount); b.circle(cx, cy, r, b.radial(cx, cy, r, [[0, alpha("#3a2f22", .8)], [1, alpha("#3a2f22", 0)]]));
  }
  b.restore();
}

/** Fine surface noise over everything painted, so flats never look like vector fills. */
export function paintGrain(b: Brush, window: Zone, strength: number, rng: () => number, detail = 1): void {
  if (strength <= 0) return;
  b.save(); b.alpha(Math.min(1, strength) * .14);
  const w = window.z1 - window.z0, h = window.y1 - window.y0;
  for (let i = 0; i < Math.ceil(1400 * detail); i++) b.rect(window.z0 + rng() * w, window.y0 + rng() * h, .0006 + rng() * .0012, .0005 + rng() * .001, rng() < .5 ? "#ffffff" : "#11151a");
  b.restore();
}
