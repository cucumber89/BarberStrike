/**
 * plan — top-down ASCII plan of ANY prototype MapDef, rendered FROM the solids (like map-plan.ts),
 * so the picture in §5 cannot drift from the data. 2 chars per metre in X, 1 line per metre in Z,
 * north (+Z) up. Glyphs by the height a body meets: `#` ≥ 2.8 (structure), `=` 2.0–2.8 (full
 * cover), `+` 1.2–1.6 (crouch cover), `.` 0.5–1.0 (low, jump on it), `/` stairs, `~` fence /
 * hedge / boundary (name-matched), `o` duel start T0, `O` duel start T1, `x` other spawns,
 * `$` station, `A`/`B` bomb sites, `F` flags. Invisible solids: `:`.
 * Run: ./apps/server/node_modules/.bin/tsx plan.mts <proto.ts>
 */
import type { MapDef } from "../../../../../packages/shared/src/map";
const file = process.argv[2];
const mod = await import(file.startsWith("/") ? file : `${process.cwd()}/${file}`);
const map: MapDef = mod.MAP;
const BOUNDARY: RegExp = mod.BOUNDARY ?? /(fence|siatka|bound|granica|tuje|hedge|zywoplot|limit)/i;
const b = map.bounds;
const X0 = Math.floor(b.minX), X1 = Math.ceil(b.maxX), Z0 = Math.floor(b.minZ), Z1 = Math.ceil(b.maxZ);
const COLS = (X1 - X0) * 2, ROWS = Z1 - Z0;
const col = (x: number) => Math.round((x - X0) * 2), row = (z: number) => Math.round(Z1 - z);
const g: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(" "));
const paint = (x0: number, x1: number, z0: number, z1: number, ch: string) => { for (let ry = row(z1); ry < row(z0); ry++) for (let cx = col(x0); cx < col(x1); cx++) if (ry >= 0 && ry < ROWS && cx >= 0 && cx < COLS) g[ry][cx] = ch; };
const put = (x: number, z: number, ch: string) => { const ry = Math.min(ROWS - 1, Math.max(0, row(z) - 1)), cx = Math.min(COLS - 1, Math.max(0, col(x))); g[ry][cx] = ch; };
const glyph = (name: string, h: number, minY: number, invisible?: boolean): string | null => {
  if (h <= 0.05) return "·";
  if (invisible) return ":";
  if (/(schod|stair|step|stopien)/i.test(name)) return "/";
  if (BOUNDARY.test(name)) return "~";
  if (minY > 1.9) return null; // things hanging above head height do not shape the floor
  if (h >= 2.8) return "#"; if (h >= 2.0) return "="; if (h >= 1.2) return "+"; if (h >= 0.5) return "."; return null;
};
for (const s of [...map.solids].sort((p, q) => p.box.maxY - q.box.maxY)) {
  const ch = glyph(s.name ?? "", s.box.maxY, s.box.minY, s.invisible);
  if (ch) paint(s.box.minX, s.box.maxX, s.box.minZ, s.box.maxZ, ch);
}
map.spawns.forEach((s, i) => put(s.x, s.z, s.team === 0 ? (i === map.spawns.findIndex((v) => v.team === 0) ? "o" : "x") : (i === map.spawns.findIndex((v) => v.team === 1) ? "O" : "x")));
for (const st of map.stations) put(st.x, st.z, "$");
for (const f of map.flags) put(f.x, f.z, "F");
for (const s of map.sites ?? []) put(s.x, s.z, s.id);
const axis = Array(COLS).fill(" "); for (let x = Math.ceil(X0 / 5) * 5; x <= X1; x += 5) { const c = col(x); String(x).split("").forEach((ch, i) => { if (c + i < COLS) axis[c + i] = ch; }); }
console.log(`${map.id} — ${X1 - X0} × ${Z1 - Z0} m, north up, 2 chars/m in X. # ≥2.8  = 2.0–2.8  + 1.2–1.6  . 0.5–1.0  / stairs  ~ boundary  : invisible  o/O duel starts  x spawns  $ station  F flag  A/B sites`);
console.log(`      ${axis.join("")}`);
g.forEach((r, i) => console.log(`${String(Z1 - i).padStart(5)} ${r.join("")}`));
