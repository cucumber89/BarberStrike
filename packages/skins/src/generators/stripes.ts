import { numberParam } from "../layers";
import type { GeneratorFn } from "../types";

/** Paint in a 256-unit design space, so a thumbnail and a 1024 texture have the same stripe scale. */
export const stripes: GeneratorFn = (c, rng, params, palette) => {
  const angle = numberParam(params, "angle", 62) * Math.PI / 180;
  const width = Math.max(2, numberParam(params, "width", 34));
  const step = width + Math.max(0, numberParam(params, "gap", 22));
  c.save(); c.translate(128, 128); c.rotate(angle);
  let index = 0;
  for (let y = -384; y < 384; y += step) {
    const color = palette.colors[(index++ % (palette.colors.length - 1 || 1)) + (palette.colors.length > 1 ? 1 : 0)];
    c.rect(-384, y, 768, width, color);
    if (params.edge === "malowane" || params.edge === "postrzępione") {
      c.save(); c.alpha(params.edge === "malowane" ? .3 : .8);
      for (let x = -384; x < 384; x += 3) {
        c.rect(x, y - rng() * 1.8, 2 + rng(), rng() * 3, palette.base);
        c.rect(x, y + width - rng() * 2, 2 + rng(), rng() * 3, palette.base);
      }
      c.restore();
    }
  }
  c.restore();
};
