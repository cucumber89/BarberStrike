import { useEffect, useRef } from "react";
import { sitesOf, TEAM_COLORS, type MapDef } from "@frankibarber/shared";
import type { RadarSnapshot } from "../game/Game";
import { hud } from "../game/store";
import { MINIMAP, bearingTo, compassX, radarOffsetTo, relativeAngle, toMap } from "./minimapGeometry";

/**
 * Minimap + compass (drop 5). The map is a pre-rendered top-down image of the collision boxes
 * (walls light, low cover dimmer, floors dark); every frame it is drawn rotated so the facing is up,
 * then teammates, spotted enemies, flags, marks and buy stations go on top. The compass strip shows
 * N/E/S/W and the flags by bearing. Runs on its own rAF from the radar getter — React never
 * re-renders per frame.
 */

interface Props { radar: () => RadarSnapshot | null }

const NEUTRAL = "#9a9a9a";
/**
 * Shortest gap between two radar redraws.
 *
 * ~60 Hz. The minimap runs on its own `requestAnimationFrame`, so before this it redrew as fast as
 * the display refreshed — on a 144 Hz monitor that is 144 rotated blits of the whole map plus 144
 * rounds of thirty-odd pieces of canvas text a second, for a picture nobody can read that fast.
 * MEASURED (`hud-bench --drive radar`): the minimap cost 0.13 ms of main-thread script per frame.
 */
const MIN_REDRAW_MS = 15;
const cache = new WeakMap<MapDef, HTMLCanvasElement>();

function baseImage(map: MapDef): HTMLCanvasElement {
  const hit = cache.get(map);
  if (hit) return hit;
  const S = MINIMAP.scale;
  const b = map.bounds;
  const c = document.createElement("canvas");
  c.width = Math.ceil((b.maxX - b.minX) * S);
  c.height = Math.ceil((b.maxZ - b.minZ) * S);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, c.width, c.height);
  const rect = (minX: number, minZ: number, maxX: number, maxZ: number, fill: string) => {
    const [x0, y0] = toMap(minX, maxZ, b, S);
    const [x1, y1] = toMap(maxX, minZ, b, S);
    ctx.fillStyle = fill;
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };
  // Floors first (dark), then cover by height: the taller, the brighter.
  for (const s of map.solids) {
    const bx = s.box;
    if (s.invisible) continue;
    if (bx.maxY <= 0.35) rect(bx.minX, bx.minZ, bx.maxX, bx.maxZ, "#1c1c22");
  }
  for (const s of map.solids) {
    const bx = s.box;
    const h = bx.maxY - Math.max(0, bx.minY);
    if (s.invisible || bx.maxY <= 0.35 || bx.minY > 3.5) continue; // ceilings / roofs do not block feet
    rect(bx.minX, bx.minZ, bx.maxX, bx.maxZ, h >= 1.6 ? "#7a7a86" : h >= 0.8 ? "#4e4e58" : "#33333b");
  }
  cache.set(map, c);
  return c;
}

export function Minimap({ radar }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const compassRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current, strip = compassRef.current;
    if (!canvas || !strip) return;
    const ctx = canvas.getContext("2d")!;
    const cc = strip.getContext("2d")!;
    let raf = 0;
    const size = MINIMAP.size, half = size / 2, pxPerM = half / MINIMAP.range;
    // Per-frame state the helpers below read. Hoisted out of `draw` so the three closures are made
    // once for the life of the component instead of thirty-odd times a second.
    const view = { x: 0, z: 0, cos: 1, sin: 0 };
    const off: [number, number] = [0, 0];
    let font = "";
    /** `ctx.font =` reparses the shorthand every time, so only pay for it when the font changes. */
    const setFont = (f: string) => { if (font !== f) { font = f; ctx.font = f; } };
    const dot = (x: number, z: number, color: string, rad: number, ring = false) => {
      radarOffsetTo(off, view.x, view.z, view.cos, view.sin, x, z, pxPerM);
      const ox = off[0], oy = off[1];
      if (ox * ox + oy * oy > (half - 4) * (half - 4)) return;
      ctx.beginPath(); ctx.arc(half + ox, half + oy, rad, 0, Math.PI * 2);
      if (ring) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    };
    const glyph = (x: number, z: number, text: string, color: string, f = "bold 11px system-ui") => {
      radarOffsetTo(off, view.x, view.z, view.cos, view.sin, x, z, pxPerM);
      const ox = off[0], oy = off[1];
      if (ox * ox + oy * oy > (half - 6) * (half - 6)) return;
      setFont(f);
      ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillText(text, half + ox + 1, half + oy + 1);
      ctx.fillStyle = color; ctx.fillText(text, half + ox, half + oy);
    };
    let compassYaw = 0, compassW = MINIMAP.compassWidth, compassH = strip.height;
    const mark = (bearing: number, text: string, color: string, y = compassH / 2) => {
      const cx = compassX(relativeAngle(bearing, compassYaw));
      if (cx === null) return;
      cc.fillStyle = color; cc.fillText(text, compassW / 2 + cx, y);
    };
    // Font and alignment are context state, not per-call arguments, and the compass only ever uses
    // one font — so it is set here, once, rather than reparsed on every frame.
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    cc.textAlign = "center"; cc.textBaseline = "middle"; cc.font = "bold 11px system-ui";
    let lastDraw = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const r = radar();
      if (!r || !r.map) return;
      // A radar does not need to be redrawn faster than the eye can use it. At 60 Hz this changes
      // nothing; on a 144 or 240 Hz display it drops two frames of canvas work in three, and the
      // work is not small — a rotated blit of the whole map plus about thirty pieces of text.
      const now = performance.now();
      if (now - lastDraw < MIN_REDRAW_MS) return;
      lastDraw = now;
      const st = hud.get();
      const map = r.map;
      const img = baseImage(map);
      const [px, py] = toMap(r.x, r.z, map.bounds);
      view.x = r.x; view.z = r.z; view.cos = Math.cos(r.yaw); view.sin = Math.sin(r.yaw);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath(); ctx.arc(half, half, half - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "#0a0a0d"; ctx.fillRect(0, 0, size, size);
      ctx.translate(half, half);
      ctx.rotate(-r.yaw);
      const k = pxPerM / MINIMAP.scale;
      ctx.scale(k, k);
      ctx.drawImage(img, -px, -py);
      ctx.restore();
      for (const s of map.stations) glyph(s.x, s.z, "$", "#7dd68a", "bold 10px system-ui");
      if (st.mode === "bomb") {
        for (const s of sitesOf(map)) { dot(s.x, s.z, "#e5ae52", 7, true); glyph(s.x, s.z, s.id, "#e5ae52"); }
        const b = st.bomb;
        if (b && (b.stage === "planted" || (b.attackTeam === st.myTeam && b.stage !== "resolved"))) glyph(b.x, b.z, "◆", "#ff7050");
      }
      if ((st.mode === "dom" || st.mode === "boys")) st.flags.forEach((f, i) => {
        const def = map.flags[i];
        if (!def) return;
        const color = f.owner === -1 ? NEUTRAL : TEAM_COLORS[f.owner as 0 | 1];
        dot(def.x, def.z, color, 7, true);
        glyph(def.x, def.z, f.id, f.contested ? "#ff7a3d" : color);
      });
      for (const m of st.marks) glyph(m.x, m.z, m.kind === "spot" ? "!" : "▼", m.kind === "spot" ? "#ff5a5a" : TEAM_COLORS[m.team], "bold 13px system-ui");
      for (const e of r.spotted) dot(e.x, e.z, "#ff5a5a", 3.5);
      const mine = TEAM_COLORS[st.myTeam];
      for (const m of r.mates) { if (!m.alive) continue; dot(m.x, m.z, mine, 3); }
      // Me: an arrow pointing up.
      ctx.save(); ctx.translate(half, half);
      ctx.fillStyle = r.alive ? "#ffffff" : "#777";
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      // Compass strip.
      const W = MINIMAP.compassWidth, H = strip.height;
      cc.clearRect(0, 0, W, H);
      cc.fillStyle = "rgba(10,10,12,.7)"; cc.fillRect(0, 0, W, H);
      compassYaw = r.yaw; compassH = H; compassW = W;
      mark(0, "N", "#fff"); mark(Math.PI / 2, "E", "#bbb"); mark(Math.PI, "S", "#bbb"); mark(-Math.PI / 2, "W", "#bbb");
      if (st.mode === "bomb") for (const s of sitesOf(r.map)) mark(bearingTo(r.x, r.z, s.x, s.z), s.id, "#e5ae52");
      if ((st.mode === "dom" || st.mode === "boys")) st.flags.forEach((f, i) => { const def = map.flags[i]; if (def) mark(bearingTo(r.x, r.z, def.x, def.z), f.id, f.owner === -1 ? NEUTRAL : TEAM_COLORS[f.owner as 0 | 1]); });
      for (const m of st.marks) mark(bearingTo(r.x, r.z, m.x, m.z), m.kind === "spot" ? "!" : "▼", m.kind === "spot" ? "#ff5a5a" : TEAM_COLORS[m.team]);
      cc.fillStyle = "#fff"; cc.fillRect(W / 2 - 1, 0, 2, 4); cc.fillRect(W / 2 - 1, H - 4, 2, 4);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [radar]);

  return (
    <div className="minimap" data-testid="minimap">
      <canvas ref={compassRef} className="compass" width={MINIMAP.compassWidth} height={20} />
      <canvas ref={ref} className="radar" width={MINIMAP.size} height={MINIMAP.size} />
    </div>
  );
}
