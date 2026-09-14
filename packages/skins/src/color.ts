/** Tiny colour helpers; recipes only ever see hex/rgba strings, never browser objects. */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
export const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("")}`;
/** amount > 0 lightens towards white, < 0 darkens towards black. */
export function shade(color: string, amount: number): string {
  const [r, g, b] = rgb(color);
  const t = Math.max(-1, Math.min(1, amount));
  return t >= 0 ? hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t) : hex(r * (1 + t), g * (1 + t), b * (1 + t));
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function alpha(color: string, a: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
export function luminance(color: string): number {
  const [r, g, b] = rgb(color);
  return (r * .299 + g * .587 + b * .114) / 255;
}
/** Ink that reads on the given ground: dark on light material, pale on dark. */
export const inkOn = (ground: string, dark = "#15171b", light = "#f1ebdf"): string => luminance(ground) > .55 ? dark : light;
