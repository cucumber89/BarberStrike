import { bandPx } from "./frame";
import type { BlendMode, Side, SkinCanvas, SkinFrame, TextOpts, Zone } from "./types";

/**
 * Draws in weapon metres (z to the right, y up) on one flank band of the texture.
 *
 * The brush owns the transform stack, so a motif written once in unit space lands on any weapon at
 * any texture resolution. Text is the one thing that must never be flipped by the y-up transform or
 * read backwards on the mirrored flank; `text` undoes both, and `readMirror` says which way legible
 * is on this flank. Fonts are set in real pixels, so a glyph never depends on sub-pixel font sizes.
 */
export class Brush {
  private k: number;
  private stack: number[] = [];
  constructor(readonly c: SkinCanvas, readonly frame: SkinFrame, readonly side: Side, readonly readMirror: 1 | -1, ppm: number) { this.k = ppm; }

  /** Sets up one band: pixels → metres, y up, origin at the frame's (z0, y0). */
  static forBand(c: SkinCanvas, frame: SkinFrame, side: Side, scale = 1): Brush {
    const band = bandPx(frame, side);
    const ppm = frame.width / frame.zSpan * scale;
    c.save();
    c.translate(band.x * scale, (band.y + band.h) * scale);
    c.scale(ppm, -ppm);
    c.translate(-frame.z0, -frame.y0);
    // Every flank reads left-to-right for a viewer standing on that side; the left flank looks at
    // the weapon with the muzzle pointing the other way, so its text is mirrored in u.
    return new Brush(c, frame, side, side === "right" ? 1 : -1, ppm);
  }
  /** Ends what `forBand` began. */
  end(): void { this.c.restore(); }
  /** Pixels per local unit at the current transform. */
  get px(): number { return this.k; }
  /** The whole band as a zone (the frame's visible window). */
  get window(): Zone { return { z0: this.frame.z0, z1: this.frame.z0 + this.frame.zSpan, y0: this.frame.y0, y1: this.frame.y0 + this.frame.ySpan }; }

  save(): void { this.c.save(); this.stack.push(this.k); }
  restore(): void { this.c.restore(); this.k = this.stack.pop() ?? this.k; }
  translate(x: number, y: number): void { this.c.translate(x, y); }
  rotate(r: number): void { this.c.rotate(r); }
  scale(s: number): void { this.c.scale(s, s); this.k *= Math.abs(s); }
  alpha(a: number): void { this.c.alpha(a); }
  blend(mode: BlendMode): void { this.c.blend(mode); }
  /** Glow radius in local units, converted to device pixels which is what shadows use. */
  glow(size: number, color: string): void { this.c.glow(size * this.k, color); }

  rect(x: number, y: number, w: number, h: number, color: string): void { this.c.rect(x, y, w, h, color); }
  zone(z: Zone, color: string, inset = 0): void { this.c.rect(z.z0 + inset, z.y0 + inset, z.z1 - z.z0 - 2 * inset, z.y1 - z.y0 - 2 * inset, color); }
  poly(points: number[], color: string): void { this.c.poly(points, color); }
  circle(x: number, y: number, r: number, color: string): void { this.c.circle(x, y, r, color); }
  ellipse(x: number, y: number, rx: number, ry: number, color: string, rot = 0): void { this.c.ellipse(x, y, rx, ry, color, rot); }
  ring(x: number, y: number, r: number, color: string, width: number, from?: number, to?: number): void { this.c.ring(x, y, r, color, width, from, to); }
  line(points: number[], color: string, width: number, cap: "butt" | "round" = "round"): void { this.c.line(points, color, width, cap); }
  curve(points: number[], color: string, width: number, close = false): void { this.c.curve(points, color, width, close); }
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string { return this.c.gradient(x0, y0, x1, y1, stops); }
  radial(x: number, y: number, r: number, stops: [number, string][]): string { return this.c.radial(x, y, r, stops); }
  clipZone(z: Zone): void { this.c.clip([z.z0, z.y0, z.z1, z.y0, z.z1, z.y1, z.z0, z.y1]); }
  clip(points: number[]): void { this.c.clip(points); }

  /** Legible text: `size` is the cap height in local units, `rot` counter-clockwise with y up. */
  text(s: string, x: number, y: number, size: number, color: string, opts: TextOpts = {}): void {
    const px = Math.max(1, size * this.k);
    this.c.save();
    this.c.translate(x, y);
    if (opts.rot) this.c.rotate(opts.rot);
    this.c.scale(this.readMirror / this.k, -1 / this.k);
    const { rot: _rot, maxWidth, strokeWidth, ...rest } = opts;
    this.c.text(s, 0, 0, px, color, { ...rest, maxWidth: maxWidth ? maxWidth * this.k : undefined, strokeWidth: strokeWidth ? strokeWidth * this.k : undefined });
    this.c.restore();
  }
  /** Rough advance width of `s` at `size`, for layout decisions without measuring. */
  static textWidth(s: string, size: number, font: TextOpts["font"] = "sans", spacing = 0): number {
    const per = font === "display" ? .48 : font === "mono" ? .62 : font === "script" ? .5 : .6;
    return s.length * size * (per + spacing);
  }
  /** Text fitted to a box: the largest cap height whose estimate fits, capped by the box height. */
  fitText(s: string, z: Zone, color: string, opts: TextOpts & { pad?: number; maxSize?: number } = {}): number {
    const pad = opts.pad ?? .12;
    const w = (z.z1 - z.z0) * (1 - pad * 2), h = (z.y1 - z.y0) * (1 - pad * 2);
    const per = Brush.textWidth("M", 1, opts.font, opts.spacing);
    const size = Math.min(h, w / Math.max(1, s.length * per), opts.maxSize ?? Infinity);
    this.text(s, (z.z0 + z.z1) / 2, (z.y0 + z.y1) / 2, size, color, { ...opts, maxWidth: w });
    return size;
  }

  /**
   * Runs `draw` in a unit box: local (0,0) is the stamp centre, y up, height 1, width `aspect`.
   * Directional art keeps its world facing on both flanks; only text is re-read per side.
   */
  stamp(x: number, y: number, height: number, rot: number, draw: (b: Brush, aspect: number) => void, aspect = 1): void {
    this.save();
    this.translate(x, y);
    if (rot) this.rotate(rot);
    this.scale(height);
    draw(this, aspect);
    this.restore();
  }
  /** Stamp fitted inside a zone, preserving `aspect`, scaled by `fill` and nudged by (dz, dy) fractions. */
  stampIn(z: Zone, aspect: number, fill: number, draw: (b: Brush, aspect: number) => void, dz = 0, dy = 0, rot = 0, fitAspect = aspect): void {
    const w = z.z1 - z.z0, h = z.y1 - z.y0;
    // `fitAspect` is the footprint on the zone; a motif turned on its side has the inverse of its own.
    const footprint = Math.min(h, w / fitAspect);
    const height = (fitAspect === aspect ? footprint : footprint / aspect) * fill;
    this.stamp((z.z0 + z.z1) / 2 + dz * w, (z.y0 + z.y1) / 2 + dy * h, height, rot, draw, aspect);
  }
}
