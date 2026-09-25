import { useEffect, useRef } from "react";
import { sitesOf, TEAM_COLORS, type MapDef } from "@frankibarber/shared";
import type { RadarSnapshot } from "../game/Game";
import { hud } from "../game/store";
import { MINIMAP, radarOffsetTo, rimPin, toMap } from "./minimapGeometry";

/**
 * The radar (drop 5; drop U P3, docs/UI_U_SPEC.md §7 P3 WORK 1). The map is a pre-rendered
 * top-down image of the collision boxes (walls light, low cover dimmer, floors dark); every frame
 * it is drawn rotated so the facing is up, then teammates, spotted enemies, flags, sites, the bomb,
 * marks and buy stations go on top. Runs on its own rAF from the radar getter — React never
 * re-renders per frame.
 *
 * Drop U, as CS2 draws it: ONE instrument. The 240×20 compass strip is gone; „N” and every
 * objective beyond the radar's range (a site, a flag, the bomb) sit on the rim in their own
 * direction (`rimPin`). Every letter is 14 px — it was 10–13 — and is drawn in CSS pixels on a
 * backing store sized to the box (`--hud-radar`, 144–176 px) times the device pixel ratio, so
 * 14 px on the canvas is 14 px on the screen. The area off the map is the HUD's plate at 60 %,
 * not a black hole. A planted bomb is an icon at its site; a dropped one, for the attack only,
 * an icon where it lies (§5.3).
 *
 * `window.__canvasText`, when it is an array (the gallery sets one), receives `{text, px}` for
 * every letter drawn, so the 14 px floor is measured (`hud-states.mjs` `canvasMin`).
 */

interface Props { radar: () => RadarSnapshot | null }

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

/** The HUD's colours (§3.4), as the canvas needs them: literal, since a canvas cannot read a token. */
const C = {
  offMap: "rgba(5,15,20,.6)",       // --hud-plate at 60 %
  rim: "rgba(178,201,210,.34)",
  shadow: "rgba(5,15,20,.9)",
  tx: "#f4f0e7",                    // --hud-tx
  tx2: "#afc0ca",                   // --hud-tx2
  warn: "#e5ae52",                  // --hud-warn: the sites
  danger: "#df4938",                // --hud-danger: a planted bomb, spotted enemies
  money: "#9fe0a8",                 // --hud-money: buy stations
  neutral: "#9a9a9a",
  contested: "#ff7a3d",
} as const;
const LETTER = `600 ${MINIMAP.letterPx}px Inter, system-ui, sans-serif`;

function baseImage(map: MapDef): HTMLCanvasElement {
  const hit = cache.get(map);
  if (hit) return hit;
  const S = MINIMAP.scale;
  const b = map.bounds;
  const c = document.createElement("canvas");
  c.width = Math.ceil((b.maxX - b.minX) * S);
  c.height = Math.ceil((b.maxZ - b.minZ) * S);
  const ctx = c.getContext("2d")!;
  // Inside the map's bounds: a dark ground a shade over the off-map plate, so the edge of the
  // world reads as an edge and not as a hole.
  ctx.fillStyle = "rgba(20,26,32,.82)";
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
    if (bx.maxY <= 0.35) rect(bx.minX, bx.minZ, bx.maxX, bx.maxZ, "#262b33");
  }
  for (const s of map.solids) {
    const bx = s.box;
    const h = bx.maxY - Math.max(0, bx.minY);
    if (s.invisible || bx.maxY <= 0.35 || bx.minY > 3.5) continue; // ceilings / roofs do not block feet
    rect(bx.minX, bx.minZ, bx.maxX, bx.maxZ, h >= 1.6 ? "#8a909c" : h >= 0.8 ? "#5a606b" : "#3e434c");
  }
  cache.set(map, c);
  return c;
}

export function Minimap({ radar }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    // The box in CSS px, and what follows from it; `fit` keeps them in step with `--hud-radar`.
    let size = 0, half = 0, pxPerM = 0, rim = 0, dpr = 1;
    let lastDraw = Number.NEGATIVE_INFINITY;
    // Per-frame state the helpers below read. Hoisted out of `draw` so the closures are made once
    // for the life of the component instead of thirty-odd times a second.
    const view = { x: 0, z: 0, cos: 1, sin: 0 };
    const off: [number, number] = [0, 0];
    let font = "";
    /** `ctx.font =` reparses the shorthand every time, so only pay for it when the font changes. */
    const setFont = (f: string) => { if (font !== f) { font = f; ctx.font = f; } };
    const fit = () => {
      const css = canvas.clientWidth || MINIMAP.size;
      const d = window.devicePixelRatio || 1;
      if (css === size && d === dpr) return;
      size = css; half = css / 2; pxPerM = half / MINIMAP.range; rim = half - MINIMAP.rimInset; dpr = d;
      // Resizing the backing store resets the context: its font and alignment go with it.
      canvas.width = Math.round(css * d); canvas.height = Math.round(css * d);
      font = "";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lastDraw = Number.NEGATIVE_INFINITY;
    };
    fit();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    resize?.observe(canvas);

    /** A letter, 14 px, with a dark halo so it reads over the map and over the scene. */
    const letter = (text: string, x: number, y: number, color: string) => {
      setFont(LETTER);
      ctx.lineWidth = 3; ctx.strokeStyle = C.shadow; ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
      const sink = window.__canvasText;
      if (Array.isArray(sink)) sink.push({ text, px: MINIMAP.letterPx });
    };
    /** The offset of a world point, in place when within `lim` px of the centre, else nothing. */
    const inside = (x: number, z: number, lim: number): boolean => {
      radarOffsetTo(off, view.x, view.z, view.cos, view.sin, x, z, pxPerM);
      return off[0] * off[0] + off[1] * off[1] <= lim * lim;
    };
    /** The offset of an objective: in place within range, else pinned `inset` px inside the rim. */
    const pinned = (x: number, z: number, inset = 0): boolean => {
      radarOffsetTo(off, view.x, view.z, view.cos, view.sin, x, z, pxPerM);
      return rimPin(off, off[0], off[1], rim - inset);
    };
    const dot = (x: number, z: number, color: string, rad: number) => {
      if (!inside(x, z, half - 4)) return;
      ctx.beginPath(); ctx.arc(half + off[0], half + off[1], rad, 0, Math.PI * 2);
      ctx.fillStyle = C.shadow; ctx.fill();
      ctx.beginPath(); ctx.arc(half + off[0], half + off[1], rad - 1, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    };
    /** A site or a flag: a ring with its letter in range, the letter on a dark disc on the rim. */
    const objective = (x: number, z: number, id: string, color: string, ring: string) => {
      const onRim = pinned(x, z);
      const px = half + off[0], py = half + off[1];
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2);
      if (onRim) { ctx.fillStyle = C.shadow; ctx.fill(); } else { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
      letter(id, px, py + 0.5, color);
    };
    /**
     * The C4, as the HUD's bomb icon draws it: a block with its dark display and a lead off the
     * corner. Out of range it sits one pin inside the rim, so a bomb lying on the way to a site
     * never covers that site's letter.
     */
    const bomb = (x: number, z: number, color: string) => {
      pinned(x, z, 20);
      const px = half + off[0], py = half + off[1];
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fillStyle = C.shadow; ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(px - 7, py - 4, 14, 9);
      ctx.fillStyle = C.shadow; ctx.fillRect(px - 4, py - 1.5, 6, 3.5);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px + 5, py - 4); ctx.lineTo(px + 7, py - 8); ctx.stroke();
    };
    /** A mark or a station: a letter where it is, only within range. */
    const glyph = (x: number, z: number, text: string, color: string) => {
      if (!inside(x, z, half - 10)) return;
      letter(text, half + off[0], half + off[1], color);
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const r = radar();
      if (!r || !r.map) return;
      // A radar does not need to be redrawn faster than the eye can use it. At 60 Hz this changes
      // nothing; on a 144 or 240 Hz display it drops two frames of canvas work in three.
      const now = performance.now();
      if (now - lastDraw < MIN_REDRAW_MS) return;
      lastDraw = now;
      const st = hud.get();
      const map = r.map;
      const img = baseImage(map);
      const [px, py] = toMap(r.x, r.z, map.bounds);
      view.x = r.x; view.z = r.z; view.cos = Math.cos(r.yaw); view.sin = Math.sin(r.yaw);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // The disc: the plate at 60 % where there is no map, the map where there is.
      ctx.save();
      ctx.beginPath(); ctx.arc(half, half, half - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = C.offMap; ctx.fillRect(0, 0, size, size);
      ctx.translate(half, half);
      ctx.rotate(-r.yaw);
      const k = pxPerM / MINIMAP.scale;
      ctx.scale(k, k);
      ctx.drawImage(img, -px, -py);
      ctx.restore();
      ctx.beginPath(); ctx.arc(half, half, half - 1, 0, Math.PI * 2);
      ctx.strokeStyle = C.rim; ctx.lineWidth = 2; ctx.stroke();

      for (const s of map.stations) glyph(s.x, s.z, "$", C.money);
      for (const m of st.marks) glyph(m.x, m.z, m.kind === "spot" ? "!" : "▼", m.kind === "spot" ? C.danger : TEAM_COLORS[m.team]);
      for (const e of r.spotted) dot(e.x, e.z, C.danger, 4.5);
      const mine = TEAM_COLORS[st.myTeam];
      for (const m of r.mates) { if (!m.alive) continue; dot(m.x, m.z, mine, 4); }
      if (st.mode === "bomb") {
        for (const s of sitesOf(map)) objective(s.x, s.z, s.id, C.warn, C.warn);
        const b = st.bomb;
        // §5.3: planted, everyone sees it at its site; dropped, the attack sees where it lies.
        if (b && b.stage === "planted") bomb(b.x, b.z, C.danger);
        else if (b && b.stage === "dropped" && b.attackTeam === st.myTeam) bomb(b.x, b.z, C.warn);
      }
      if (st.mode === "dom" || st.mode === "boys") st.flags.forEach((f, i) => {
        const def = map.flags[i];
        if (!def) return;
        const color = f.owner === -1 ? C.neutral : TEAM_COLORS[f.owner as 0 | 1];
        objective(def.x, def.z, f.id, f.contested ? C.contested : color, color);
      });
      // Me: an arrow pointing up.
      ctx.save(); ctx.translate(half, half);
      ctx.fillStyle = r.alive ? "#ffffff" : "#777";
      ctx.strokeStyle = C.shadow; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 2.5); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      // North, on the rim: the direction of +Z in the facing-up frame, on a disc like every pin.
      const nx = half - view.sin * rim, ny = half - view.cos * rim;
      ctx.beginPath(); ctx.arc(nx, ny, 9, 0, Math.PI * 2); ctx.fillStyle = C.shadow; ctx.fill();
      letter("N", nx, ny + 0.5, C.tx);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); resize?.disconnect(); };
  }, [radar]);

  return (
    <div className="minimap" data-zone="radar" data-testid="minimap">
      <canvas ref={ref} className="radar" width={MINIMAP.size} height={MINIMAP.size} aria-hidden="true" />
    </div>
  );
}
