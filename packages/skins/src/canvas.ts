import type { SkinCanvas } from "./types";

/** Opaque gradient handles keep browser objects out of recipes and deterministic recordings. */
export class DomSkinCanvas implements SkinCanvas {
  private gradients = new Map<string, CanvasGradient>();
  constructor(private ctx: CanvasRenderingContext2D, readonly size: number) {}
  private paint(color: string): string | CanvasGradient { return this.gradients.get(color) ?? color; }
  fill(color: string): void { this.rect(0, 0, this.size, this.size, color); }
  rect(x: number, y: number, w: number, h: number, color: string): void { this.ctx.fillStyle = this.paint(color); this.ctx.fillRect(x, y, w, h); }
  private path(points: number[]): void { this.ctx.beginPath(); this.ctx.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) this.ctx.lineTo(points[i], points[i + 1]); }
  poly(points: number[], color: string): void { this.path(points); this.ctx.closePath(); this.ctx.fillStyle = this.paint(color); this.ctx.fill(); }
  circle(x: number, y: number, r: number, color: string): void { this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fillStyle = this.paint(color); this.ctx.fill(); }
  line(points: number[], color: string, width: number, cap: "butt" | "round" = "butt"): void { this.path(points); this.ctx.strokeStyle = this.paint(color); this.ctx.lineWidth = width; this.ctx.lineCap = cap; this.ctx.stroke(); }
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string {
    const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1); for (const [at, color] of stops) gradient.addColorStop(at, color);
    const key = `gradient:${this.gradients.size}`; this.gradients.set(key, gradient); return key;
  }
  text(s: string, x: number, y: number, px: number, color: string, rot = 0): void { this.save(); this.translate(x, y); this.rotate(rot); this.ctx.font = `bold ${px}px sans-serif`; this.ctx.fillStyle = this.paint(color); this.ctx.fillText(s, 0, 0); this.restore(); }
  alpha(a: number): void { this.ctx.globalAlpha = a; }
  save(): void { this.ctx.save(); } restore(): void { this.ctx.restore(); }
  translate(x: number, y: number): void { this.ctx.translate(x, y); } rotate(r: number): void { this.ctx.rotate(r); } scale(x: number, y: number): void { this.ctx.scale(x, y); }
}

/** Exact operation streams are the cross-runtime contract; rasterisation is browser-dependent. */
export class RecordingCanvas implements SkinCanvas {
  readonly operations: unknown[][] = [];
  private gradients = 0;
  constructor(readonly size = 1024) {}
  private record(...args: unknown[]): void { this.operations.push(args); }
  fill(color: string): void { this.record("fill", color); }
  rect(x: number, y: number, w: number, h: number, color: string): void { this.record("rect", x, y, w, h, color); }
  poly(points: number[], color: string): void { this.record("poly", [...points], color); }
  circle(x: number, y: number, r: number, color: string): void { this.record("circle", x, y, r, color); }
  line(points: number[], color: string, width: number, cap: "butt" | "round" = "butt"): void { this.record("line", [...points], color, width, cap); }
  gradient(x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): string { const key = `gradient:${this.gradients++}`; this.record("gradient", x0, y0, x1, y1, stops.map(s => [...s]), key); return key; }
  text(s: string, x: number, y: number, px: number, color: string, rot = 0): void { this.record("text", s, x, y, px, color, rot); }
  alpha(a: number): void { this.record("alpha", a); }
  save(): void { this.record("save"); } restore(): void { this.record("restore"); }
  translate(x: number, y: number): void { this.record("translate", x, y); } rotate(r: number): void { this.record("rotate", r); } scale(x: number, y: number): void { this.record("scale", x, y); }
  serialize(): string { return JSON.stringify(this.operations); }
}
