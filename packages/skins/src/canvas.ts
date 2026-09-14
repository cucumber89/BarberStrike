import type { BlendMode, FontKind, SkinCanvas, TextOpts } from "./types";

const FONTS: Record<FontKind, string> = {
  display: `"Bebas Neue", "Oswald", Impact, "Arial Narrow", "Liberation Sans Narrow", "DejaVu Sans Condensed", sans-serif`,
  sans: `"Liberation Sans", Arial, Helvetica, "DejaVu Sans", sans-serif`,
  mono: `"Liberation Mono", "DejaVu Sans Mono", Consolas, monospace`,
  script: `"Brush Script MT", "Segoe Script", "URW Chancery L", cursive`,
  serif: `Georgia, "Liberation Serif", "DejaVu Serif", serif`,
};
const normalise = (opts?: TextOpts | number): TextOpts => typeof opts === "number" ? { rot: opts } : opts ?? {};

/** Opaque gradient handles keep browser objects out of recipes and deterministic recordings. */
export class DomSkinCanvas implements SkinCanvas {
  private gradients = new Map<string, CanvasGradient>();
  readonly size: number;
  constructor(private ctx: CanvasRenderingContext2D, readonly width: number, readonly height = width) { this.size = Math.max(width, height); }
  private paint(color: string): string | CanvasGradient { return this.gradients.get(color) ?? color; }
  fill(color: string): void { this.rect(0, 0, this.width, this.height, color); }
  rect(x: number, y: number, w: number, h: number, color: string): void { this.ctx.fillStyle = this.paint(color); this.ctx.fillRect(x, y, w, h); }
  private path(points: number[]): void { this.ctx.beginPath(); this.ctx.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) this.ctx.lineTo(points[i], points[i + 1]); }
  poly(points: number[], color: string): void { this.path(points); this.ctx.closePath(); this.ctx.fillStyle = this.paint(color); this.ctx.fill(); }
  circle(x: number, y: number, r: number, color: string): void { this.ctx.beginPath(); this.ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); this.ctx.fillStyle = this.paint(color); this.ctx.fill(); }
  ellipse(x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
    this.ctx.beginPath(); this.ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2); this.ctx.fillStyle = this.paint(color); this.ctx.fill();
  }
  ring(x: number, y: number, r: number, color: string, width: number, from = 0, to = Math.PI * 2): void {
    this.ctx.beginPath(); this.ctx.arc(x, y, Math.max(0, r), from, to); this.ctx.strokeStyle = this.paint(color); this.ctx.lineWidth = width; this.ctx.lineCap = "butt"; this.ctx.stroke();
  }
  line(points: number[], color: string, width: number, cap: "butt" | "round" = "butt"): void { this.path(points); this.ctx.strokeStyle = this.paint(color); this.ctx.lineWidth = width; this.ctx.lineCap = cap; this.ctx.lineJoin = "round"; this.ctx.stroke(); }
  curve(points: number[], color: string, width: number, close = false): void {
    const n = points.length / 2; if (n < 2) return;
    const ctx = this.ctx; ctx.beginPath();
    const px = (i: number) => points[((i % n) + n) % n * 2], py = (i: number) => points[((i % n) + n) % n * 2 + 1];
    if (close) {
      ctx.moveTo((px(0) + px(1)) / 2, (py(0) + py(1)) / 2);
      for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
      ctx.closePath();
    } else {
      ctx.moveTo(px(0), py(0));
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
      ctx.lineTo(px(n - 1), py(n - 1));
    }
    if (width > 0) { ctx.strokeStyle = this.paint(color); ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); }
    else { ctx.fillStyle = this.paint(color); ctx.fill(); }
  }
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string {
    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1); for (const [at, color] of stops) gradient.addColorStop(at, color);
    const key = `gradient:${this.gradients.size}`; this.gradients.set(key, gradient); return key;
  }
  radial(x: number, y: number, r: number, stops: [number, string][]): string {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, Math.max(1e-6, r)); for (const [at, color] of stops) gradient.addColorStop(at, color);
    const key = `gradient:${this.gradients.size}`; this.gradients.set(key, gradient); return key;
  }
  text(s: string, x: number, y: number, px: number, color: string, opts?: TextOpts | number): void {
    const o = normalise(opts); const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 700} ${px}px ${FONTS[o.font ?? "sans"]}`;
    ctx.textAlign = o.align ?? "center"; ctx.textBaseline = "middle";
    if (o.spacing && "letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing * px}px`;
    const max = o.maxWidth && o.maxWidth > 0 ? o.maxWidth : undefined;
    if (o.stroke && o.strokeWidth) { ctx.lineJoin = "round"; ctx.strokeStyle = this.paint(o.stroke); ctx.lineWidth = o.strokeWidth; ctx.strokeText(s, 0, 0, max); }
    ctx.fillStyle = this.paint(color); ctx.fillText(s, 0, 0, max);
    ctx.restore();
  }
  clip(points: number[]): void { this.path(points); this.ctx.closePath(); this.ctx.clip(); }
  blend(mode: BlendMode): void { this.ctx.globalCompositeOperation = mode; }
  glow(blurPx: number, color: string): void { this.ctx.shadowBlur = blurPx; this.ctx.shadowColor = color; }
  alpha(a: number): void { this.ctx.globalAlpha = Math.max(0, Math.min(1, a)); }
  save(): void { this.ctx.save(); } restore(): void { this.ctx.restore(); }
  translate(x: number, y: number): void { this.ctx.translate(x, y); } rotate(r: number): void { this.ctx.rotate(r); } scale(x: number, y: number): void { this.ctx.scale(x, y); }
}

/** Exact operation streams are the cross-runtime contract; rasterisation is browser-dependent. */
export class RecordingCanvas implements SkinCanvas {
  readonly operations: unknown[][] = [];
  private gradients = 0;
  readonly size: number;
  constructor(readonly width = 1024, readonly height = width) { this.size = Math.max(width, height); }
  private record(...args: unknown[]): void { this.operations.push(args); }
  private static round(n: number): number { return Math.round(n * 1e4) / 1e4; }
  private nums(points: number[]): number[] { return points.map(RecordingCanvas.round); }
  fill(color: string): void { this.record("fill", color); }
  rect(x: number, y: number, w: number, h: number, color: string): void { this.record("rect", ...this.nums([x, y, w, h]), color); }
  poly(points: number[], color: string): void { this.record("poly", this.nums(points), color); }
  circle(x: number, y: number, r: number, color: string): void { this.record("circle", ...this.nums([x, y, r]), color); }
  ellipse(x: number, y: number, rx: number, ry: number, color: string, rot = 0): void { this.record("ellipse", ...this.nums([x, y, rx, ry]), color, RecordingCanvas.round(rot)); }
  ring(x: number, y: number, r: number, color: string, width: number, from = 0, to = Math.PI * 2): void { this.record("ring", ...this.nums([x, y, r]), color, ...this.nums([width, from, to])); }
  line(points: number[], color: string, width: number, cap: "butt" | "round" = "butt"): void { this.record("line", this.nums(points), color, RecordingCanvas.round(width), cap); }
  curve(points: number[], color: string, width: number, close = false): void { this.record("curve", this.nums(points), color, RecordingCanvas.round(width), close); }
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string { const key = `gradient:${this.gradients++}`; this.record("gradient", ...this.nums([x0, y0, x1, y1]), stops.map(s => [...s]), key); return key; }
  radial(x: number, y: number, r: number, stops: [number, string][]): string { const key = `gradient:${this.gradients++}`; this.record("radial", ...this.nums([x, y, r]), stops.map(s => [...s]), key); return key; }
  text(s: string, x: number, y: number, px: number, color: string, opts?: TextOpts | number): void { this.record("text", s, ...this.nums([x, y, px]), color, normalise(opts)); }
  clip(points: number[]): void { this.record("clip", this.nums(points)); }
  blend(mode: BlendMode): void { this.record("blend", mode); }
  glow(blurPx: number, color: string): void { this.record("glow", RecordingCanvas.round(blurPx), color); }
  alpha(a: number): void { this.record("alpha", RecordingCanvas.round(a)); }
  save(): void { this.record("save"); } restore(): void { this.record("restore"); }
  translate(x: number, y: number): void { this.record("translate", ...this.nums([x, y])); } rotate(r: number): void { this.record("rotate", RecordingCanvas.round(r)); } scale(x: number, y: number): void { this.record("scale", ...this.nums([x, y])); }
  serialize(): string { return JSON.stringify(this.operations); }
  /** Cheap structural summary used by the catalogue tests: which primitives, how many colours. */
  summary(): { ops: number; kinds: Record<string, number>; colors: Set<string>; texts: string[] } {
    const kinds: Record<string, number> = {}; const colors = new Set<string>(); const texts: string[] = [];
    for (const op of this.operations) {
      const kind = String(op[0]); kinds[kind] = (kinds[kind] ?? 0) + 1;
      if (kind === "text") texts.push(String(op[1]));
      for (const arg of op) if (typeof arg === "string" && arg.startsWith("#")) colors.add(arg.toLowerCase());
      if (kind === "gradient" || kind === "radial") for (const stop of op[kind === "gradient" ? 5 : 4] as [number, string][]) colors.add(stop[1].toLowerCase());
    }
    return { ops: this.operations.length, kinds, colors, texts };
  }
}
