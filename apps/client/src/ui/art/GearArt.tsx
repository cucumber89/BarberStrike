import type { ReactNode } from "react";
import type { ArmorId, GrenadeId, PerkId, WeaponId } from "@frankibarber/shared";

/**
 * Hand-drawn-looking inline SVG art for every weapon and shop item, so the shop and menus can
 * show what the player is buying. Pure line art in `currentColor`: set `color` on a parent to
 * tint it. Weapons share one 240×100 viewBox (side profile, muzzle to the right, sizes relative
 * to each other); grenades, perks and armour use 100×100.
 */

interface ArtProps<Id extends string> { id: Id; className?: string; title?: string }

const MAIN = { stroke: "currentColor", strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round", fill: "none" } as const;
const FINE = { ...MAIN, strokeWidth: 1.5 } as const;

/** Main outline (2.5 px). */
const P = ({ d }: { d: string }) => <path d={d} {...MAIN} />;
/** Detail line (1.5 px). */
const F = ({ d }: { d: string }) => <path d={d} {...FINE} />;
/** Body mass: outlined shape with a flat translucent fill so the silhouette reads when tiny. */
const M = ({ d, o = 0.16 }: { d: string; o?: number }) => <path d={d} {...MAIN} fill="currentColor" fillOpacity={o} />;
/** Circle: main outline by default, `fine` for details, `solid` for a filled dot. */
const C = ({ cx, cy, r, fine, solid }: { cx: number; cy: number; r: number; fine?: boolean; solid?: boolean }) =>
  solid ? <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" /> : <circle cx={cx} cy={cy} r={r} {...(fine ? FINE : MAIN)} />;
/** Rounded rect as a body mass (fill) or outline. */
const R = ({ x, y, w, h, r = 2, o = 0.16, fine }: { x: number; y: number; w: number; h: number; r?: number; o?: number; fine?: boolean }) =>
  <rect x={x} y={y} width={w} height={h} rx={r} {...(fine ? FINE : MAIN)} fill={o > 0 ? "currentColor" : "none"} fillOpacity={o} />;
/** A run of parallel fine ticks (grip texture, ribs, vents). */
const Ticks = ({ x, y, n, dx, len, dy = 0 }: { x: number; y: number; n: number; dx: number; len: number; dy?: number }) =>
  <>{Array.from({ length: n }, (_, i) => <line key={i} x1={x + i * dx} y1={y + i * dy} x2={x + i * dx} y2={y + i * dy + len} {...FINE} />)}</>;

function Frame({ id, viewBox, className, title, children }: { id: string; viewBox: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      data-art={id}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- weapons (240×100, muzzle right) */

const WEAPON_ART: Record<WeaponId, () => JSX.Element> = {
  // P9 Straight Razor: compact semi-auto with a folded razor spine on the slide.
  pistol: () => (
    <>
      <M d="M 78 32 H 158 Q 166 32 166 39 V 48 H 78 Z" />
      <F d="M 88 36 V 45 M 92 36 V 45 M 96 36 V 45" />
      <R x={104} y={35} w={16} h={7} r={1} o={0} fine />
      <F d="M 158 32 V 27 H 161 V 32 M 82 32 V 28 H 86 V 32" />
      {/* folded straight razor lying along the slide */}
      <M d="M 98 32 Q 99 25 106 25 H 146 Q 152 25 154 32 Z" o={0.2} />
      <F d="M 104 29 H 148" />
      <C cx={101} cy={29} r={2.2} solid />
      {/* frame, trigger guard, dust cover */}
      <P d="M 112 48 V 62 Q 112 68 118 68 H 134 Q 140 68 140 62 V 54 H 166 V 48" />
      <F d="M 124 54 Q 120 60 124 64" />
      {/* grip, raked back */}
      <M d="M 84 48 H 114 L 104 87 Q 103 90 99 90 L 78 87 Q 74 86 75 82 Z" o={0.2} />
      <F d="M 86 56 L 100 58 M 85 64 L 98 66 M 83 72 L 96 74 M 82 80 L 95 82" />
      <F d="M 76 86 H 104" />
    </>
  ),

  // R-44 Razorback: big revolver, exposed cylinder, hammer, long barrel.
  revolver: () => (
    <>
      <M d="M 118 34 H 196 Q 202 34 202 38 V 46 H 118 Z" />
      <F d="M 194 34 V 29 H 198 V 34 M 124 47 V 52 H 160 V 47" />
      <F d="M 124 40 H 190" />
      {/* frame + top strap */}
      <M d="M 76 34 Q 78 28 84 28 H 118 V 34 H 84 Q 80 34 78 40 V 56 H 120 V 46 H 118 V 58 H 78 Z" />
      {/* cylinder */}
      <M d="M 84 32 H 118 Q 122 32 122 36 V 54 Q 122 58 118 58 H 84 Q 80 58 80 54 V 36 Q 80 32 84 32 Z" o={0.22} />
      <F d="M 84 38 H 118 M 84 44 H 118 M 84 50 H 118" />
      <F d="M 92 33 V 57 M 108 33 V 57" />
      {/* hammer */}
      <M d="M 80 30 L 70 21 Q 65 19 66 25 L 76 36 Z" o={0.22} />
      {/* trigger guard & trigger */}
      <P d="M 94 58 V 66 Q 94 72 100 72 H 116 Q 122 72 122 66 V 58" />
      <F d="M 106 58 Q 102 63 106 67" />
      {/* grip */}
      <M d="M 74 56 H 94 L 78 90 Q 76 94 71 94 H 60 Q 53 94 55 87 Q 60 70 74 56 Z" o={0.2} />
      <F d="M 68 68 L 84 70 M 64 78 L 80 80 M 60 88 L 76 90" />
    </>
  ),

  // K-7 Buzzcut: compact MP5-style SMG, curved magazine, shrouded short barrel.
  smg: () => (
    <>
      {/* slim fixed stock */}
      <M d="M 30 38 H 72 V 50 H 30 Q 26 50 26 46 V 42 Q 26 38 30 38 Z" />
      <F d="M 34 38 V 50" />
      {/* receiver */}
      <M d="M 70 34 H 168 V 52 H 70 Z" />
      <F d="M 96 34 V 28 H 102 V 34 M 128 30 H 148 M 148 30 V 34" />
      <F d="M 76 40 H 112 M 76 45 H 112" />
      {/* handguard + short shrouded barrel */}
      <M d="M 136 32 H 176 Q 180 32 180 36 V 52 Q 180 56 176 56 H 136 Z" o={0.2} />
      <F d="M 144 38 H 172 M 144 44 H 172 M 144 50 H 172" />
      <M d="M 180 40 H 204 V 46 H 180 Z" />
      <C cx={182} cy={29} r={4} fine />
      <F d="M 182 33 V 40 M 178 25 V 22" />
      {/* grip + trigger guard */}
      <M d="M 96 52 H 116 L 110 84 Q 109 88 105 88 H 92 Q 88 88 89 84 Z" o={0.2} />
      <P d="M 116 52 V 62 Q 116 68 122 68 H 130 Q 136 68 136 62 V 52" />
      <F d="M 124 54 Q 120 59 124 63" />
      {/* curved magazine, forward of the trigger */}
      <M d="M 136 52 H 152 Q 158 72 168 92 H 152 Q 142 74 136 52 Z" o={0.2} />
      <F d="M 142 62 H 156 M 146 72 H 160 M 150 82 H 164" />
    </>
  ),

  // VZ-9 Trim: Skorpion-style machine pistol, wire stock folded over the top, mag ahead of the grip.
  smg2: () => (
    <>
      {/* wire stock folded forward over the receiver */}
      <P d="M 82 40 Q 82 24 96 24 H 150" />
      <P d="M 90 40 Q 90 30 98 30 H 150" />
      <M d="M 148 20 H 158 Q 162 20 162 24 V 32 Q 162 36 158 36 H 148 Z" />
      <C cx={85} cy={40} r={2.5} solid />
      {/* receiver */}
      <M d="M 82 40 H 158 Q 162 40 162 44 V 56 H 82 Q 78 56 78 52 V 44 Q 78 40 82 40 Z" />
      <F d="M 92 45 H 130 M 100 51 H 132" />
      <R x={136} y={43} w={14} h={7} r={1} o={0} fine />
      <F d="M 154 40 V 35 M 96 40 V 36 H 100 V 40" />
      {/* stubby barrel */}
      <M d="M 162 44 H 186 V 52 H 162 Z" />
      <F d="M 178 44 V 52" />
      {/* magazine ahead of the grip */}
      <M d="M 112 56 H 126 L 130 86 H 116 Z" o={0.2} />
      <F d="M 116 64 H 128 M 118 74 H 130" />
      {/* trigger guard + grip */}
      <P d="M 98 56 V 62 Q 98 68 104 68 H 108 Q 112 68 112 64 V 56" />
      <F d="M 104 57 Q 102 61 105 64" />
      <M d="M 82 56 H 100 L 94 86 Q 93 89 89 89 H 74 Q 70 89 71 85 Z" o={0.2} />
      <F d="M 80 66 H 94 M 78 74 H 92 M 76 82 H 90" />
    </>
  ),

  // AR-31 Pompadour: AR-15 profile, carry handle, 30-round mag, adjustable stock.
  rifle: () => (
    <>
      {/* adjustable stock + buffer tube */}
      <M d="M 22 36 H 58 L 62 52 L 56 64 H 26 Q 20 64 20 58 V 42 Q 20 36 22 36 Z" />
      <F d="M 28 40 V 60 M 40 44 H 54 M 40 50 H 54" />
      <M d="M 58 40 H 90 V 50 H 58 Z" />
      <F d="M 66 40 V 50 M 74 40 V 50" />
      {/* upper + lower receiver */}
      <M d="M 88 34 H 154 V 52 H 88 Z" />
      <R x={120} y={38} w={16} h={8} r={1} o={0} fine />
      <F d="M 92 38 H 108 M 90 43 H 106" />
      {/* carry handle with rear sight */}
      <M d="M 98 34 Q 98 24 108 24 H 138 Q 148 24 148 34 Z" o={0.2} />
      <F d="M 106 34 Q 108 29 114 29 H 132 Q 138 29 140 34" />
      <F d="M 144 24 V 20 H 148 V 24" />
      {/* handguard + barrel + front sight */}
      <M d="M 154 34 H 190 Q 194 34 194 38 V 48 Q 194 52 190 52 H 154 Z" o={0.2} />
      <F d="M 160 40 H 188 M 160 46 H 188" />
      <M d="M 194 39 H 222 V 46 H 194 Z" />
      <F d="M 216 39 V 46" />
      <P d="M 196 34 L 200 20 L 204 34" />
      {/* grip, trigger, mag well + magazine */}
      <M d="M 102 52 H 120 L 112 82 Q 111 86 107 86 H 96 Q 92 86 93 82 Z" o={0.2} />
      <P d="M 120 52 V 60 Q 120 66 126 66 H 132 Q 138 66 138 60 V 52" />
      <F d="M 128 54 Q 124 59 128 63" />
      <M d="M 138 52 H 156 L 162 82 Q 162 86 158 86 H 148 Q 144 86 143 82 Z" o={0.2} />
      <F d="M 142 62 H 158 M 145 72 H 160" />
    </>
  ),

  // MG-4 Bulk: belt-fed LMG, box drum under the receiver, folded bipod, long barrel.
  lmg: () => (
    <>
      {/* stock with shoulder pad */}
      <M d="M 14 34 H 72 V 60 L 40 58 L 18 62 Q 12 62 12 56 V 40 Q 12 34 14 34 Z" />
      <F d="M 18 36 V 60 M 32 40 H 66 M 32 48 H 66" />
      {/* receiver + feed tray cover */}
      <M d="M 70 30 H 172 V 54 H 70 Z" />
      <M d="M 70 30 H 172 V 36 H 70 Z" o={0.22} />
      <F d="M 80 42 H 100 M 122 42 H 160 M 126 47 H 160" />
      <F d="M 76 30 V 24 H 80 V 30" />
      {/* carry handle */}
      <P d="M 144 30 Q 146 20 156 20 H 170 Q 178 20 178 30" />
      {/* grip + trigger */}
      <M d="M 80 54 H 100 L 94 84 Q 93 88 89 88 H 76 Q 72 88 73 84 Z" o={0.2} />
      <P d="M 100 54 V 62 Q 100 68 106 68 H 108 Q 112 68 112 62 V 54" />
      <F d="M 106 56 Q 103 60 106 64" />
      {/* box drum */}
      <M d="M 114 54 H 162 Q 166 54 166 58 V 86 Q 166 90 162 90 H 118 Q 114 90 114 86 Z" o={0.2} />
      <F d="M 120 62 H 160 M 120 70 H 160 M 120 78 H 160" />
      <F d="M 130 58 V 86 M 146 58 V 86" />
      {/* handguard, long barrel, folded bipod */}
      <M d="M 172 34 H 192 Q 196 34 196 38 V 50 Q 196 54 192 54 H 172 Z" o={0.2} />
      <F d="M 178 40 H 190 M 178 46 H 190" />
      <M d="M 196 38 H 232 V 46 H 196 Z" />
      <F d="M 200 42 H 226 M 226 38 V 46 M 232 36 V 48" />
      <P d="M 196 50 L 236 50 M 196 55 L 232 55" />
      <F d="M 196 48 V 57 M 208 50 V 55 M 224 50 V 55" />
    </>
  ),

  // S12 Wet Shave: pump-action shotgun, tube magazine, ribbed forend, wooden stock.
  shotgun: () => (
    <>
      {/* wooden stock */}
      <M d="M 102 36 L 62 38 L 22 48 Q 14 52 15 60 L 19 76 L 60 68 Q 74 62 82 68 Q 90 60 100 54 Z" o={0.22} />
      <F d="M 30 50 Q 50 46 72 46 M 28 62 Q 48 58 70 56 M 20 50 L 24 74" />
      {/* receiver */}
      <M d="M 98 34 H 152 V 54 H 98 Z" />
      <R x={118} y={38} w={16} h={8} r={1} o={0} fine />
      <F d="M 102 36 V 30 H 106 V 36" />
      {/* trigger guard */}
      <P d="M 108 54 V 60 Q 108 66 114 66 H 126 Q 132 66 132 60 V 54" />
      <F d="M 120 55 Q 116 60 120 63" />
      {/* barrel + tube magazine */}
      <M d="M 152 38 H 226 V 45 H 152 Z" />
      <M d="M 152 47 H 216 Q 220 47 220 50 Q 220 53 216 53 H 152 Z" />
      <F d="M 224 38 V 34 M 212 47 V 53" />
      {/* ribbed pump */}
      <M d="M 160 34 H 194 Q 198 34 198 38 V 54 Q 198 58 194 58 H 160 Q 156 58 156 54 V 38 Q 156 34 160 34 Z" o={0.22} />
      <Ticks x={164} y={37} n={7} dx={4.5} len={18} />
    </>
  ),

  // M-1 Clean Line: DMR (M14 EBR chassis), mid-size scope, 20-round mag, long barrel.
  dmr: () => (
    <>
      {/* adjustable stock with cheek piece + tube */}
      <M d="M 14 38 H 60 L 64 52 L 58 62 H 18 Q 12 62 12 56 V 44 Q 12 38 14 38 Z" />
      <M d="M 24 32 H 62 V 38 H 24 Z" o={0.22} />
      <F d="M 20 40 V 60 M 36 44 H 54 M 36 50 H 54" />
      <M d="M 60 42 H 90 V 50 H 60 Z" />
      <F d="M 70 42 V 50 M 80 42 V 50" />
      {/* receiver */}
      <M d="M 88 34 H 160 V 52 H 88 Z" />
      <F d="M 94 42 H 110 M 138 38 H 156" />
      <R x={116} y={38} w={16} h={8} r={1} o={0} fine />
      {/* scope + rings */}
      <F d="M 96 34 V 30 H 150 V 34" />
      <P d="M 110 30 V 24 M 140 30 V 24" />
      <M d="M 94 18 H 102 Q 106 18 106 22 V 26 Q 106 30 102 30 H 94 Q 90 30 90 26 V 22 Q 90 18 94 18 Z" />
      <M d="M 106 20 H 138 V 28 H 106 Z" />
      <M d="M 138 16 H 150 Q 156 16 156 22 V 26 Q 156 32 150 32 H 138 Z" />
      <F d="M 118 20 V 17 M 118 28 V 31" />
      {/* handguard rail, long barrel, flash hider */}
      <M d="M 160 36 H 200 Q 204 36 204 40 V 48 Q 204 52 200 52 H 160 Z" o={0.2} />
      <Ticks x={166} y={36} n={8} dx={4.5} len={4} />
      <F d="M 166 44 H 198" />
      <M d="M 204 39 H 232 V 46 H 204 Z" />
      <F d="M 222 38 V 47 M 226 38 V 47" />
      {/* grip, trigger, magazine */}
      <M d="M 98 52 H 116 L 110 82 Q 109 86 105 86 H 92 Q 88 86 89 82 Z" o={0.2} />
      <P d="M 116 52 V 60 Q 116 66 122 66 H 126 Q 132 66 132 60 V 52" />
      <F d="M 124 54 Q 120 59 124 63" />
      <M d="M 132 52 H 150 L 154 78 Q 154 82 150 82 H 138 Q 134 82 134 78 Z" o={0.2} />
      <F d="M 138 62 H 152 M 140 70 H 153" />
    </>
  ),

  // SR-50 Longcut: bolt-action sniper, big scope, bipod, cheek riser, muzzle brake. The longest gun.
  sniper: () => (
    <>
      {/* stock with butt pad, cheek riser, thumbhole grip */}
      <M d="M 10 36 H 90 V 54 L 78 60 Q 66 62 58 64 L 20 66 Q 12 66 10 60 Z" />
      <M d="M 6 34 H 12 V 68 H 6 Q 3 68 3 65 V 37 Q 3 34 6 34 Z" o={0.22} />
      <M d="M 30 30 H 74 V 36 H 30 Z" o={0.22} />
      <F d="M 18 42 V 60 M 26 44 H 56 M 26 50 H 56 M 66 56 Q 70 58 76 56" />
      {/* receiver + bolt */}
      <M d="M 88 36 H 152 V 52 H 88 Z" />
      <F d="M 94 44 H 106 M 112 44 H 120" />
      <P d="M 128 44 Q 138 44 142 58" />
      <C cx={143} cy={60} r={3.5} solid />
      {/* big scope */}
      <F d="M 96 36 V 32 H 146 V 36" />
      <P d="M 106 32 V 26 M 136 32 V 26" />
      <M d="M 86 16 H 100 Q 104 16 104 20 V 28 Q 104 32 100 32 H 86 Q 82 32 82 28 V 20 Q 82 16 86 16 Z" />
      <M d="M 104 18 H 142 V 30 H 104 Z" />
      <M d="M 142 12 H 160 Q 168 12 168 20 V 26 Q 168 34 160 34 H 142 Z" />
      <F d="M 118 18 V 14 M 118 30 V 34 M 126 18 V 30" />
      {/* magazine box, trigger guard */}
      <M d="M 112 52 H 132 V 66 H 112 Z" o={0.2} />
      <P d="M 92 52 V 58 Q 92 64 98 64 H 104 Q 110 64 110 58 V 52" />
      <F d="M 100 53 Q 97 57 100 60" />
      {/* heavy barrel + muzzle brake */}
      <M d="M 152 39 H 224 V 47 H 152 Z" />
      <F d="M 156 43 H 220" />
      <M d="M 224 36 H 236 Q 238 36 238 38 V 48 Q 238 50 236 50 H 224 Z" o={0.22} />
      <F d="M 228 36 V 50 M 232 36 V 50" />
      {/* bipod */}
      <P d="M 184 47 V 52 M 184 52 L 172 80 M 184 52 L 198 80" />
      <F d="M 170 80 H 176 M 196 80 H 202 M 180 52 H 188" />
    </>
  ),

  // GL-1 Blowout: break-action single-shot grenade launcher, fat short barrel, folding stock.
  launcher: () => (
    <>
      {/* folding skeleton stock (hinge behind the receiver) */}
      <P d="M 56 40 H 90 M 56 52 H 90" />
      <M d="M 50 36 H 58 V 56 H 50 Q 46 56 46 52 V 40 Q 46 36 50 36 Z" o={0.2} />
      <C cx={90} cy={46} r={3.5} fine />
      {/* receiver + grip */}
      <M d="M 88 34 H 122 V 58 H 88 Q 84 58 84 54 V 38 Q 84 34 88 34 Z" />
      <F d="M 92 40 H 116 M 92 46 H 110" />
      <M d="M 96 58 H 116 L 108 86 Q 107 90 103 90 H 90 Q 86 90 87 86 Z" o={0.2} />
      <F d="M 94 68 H 108 M 92 76 H 106" />
      <P d="M 116 58 V 64 Q 116 70 122 70 H 128 Q 134 70 134 64 V 58" />
      <F d="M 124 59 Q 121 63 124 66" />
      {/* fat break-action barrel, hinged at the front of the receiver */}
      <M d="M 124 30 H 194 Q 200 30 200 36 V 56 Q 200 62 194 62 H 124 Q 118 62 118 56 V 36 Q 118 30 124 30 Z" o={0.2} />
      <C cx={122} cy={58} r={3} solid />
      <F d="M 128 36 H 190 M 128 56 H 190 M 190 32 V 60" />
      <F d="M 194 40 H 198 M 194 52 H 198" />
      {/* flip-up ladder sight */}
      <P d="M 150 30 V 18 H 162 V 30" />
      <F d="M 150 22 H 162 M 150 26 H 162" />
    </>
  ),

  // Clippers: electric hair clippers (the melee weapon), blade teeth at the front, cord curling off the back.
  clippers: () => (
    <>
      {/* body */}
      <M d="M 72 36 Q 72 30 78 30 H 130 L 158 34 V 66 L 130 70 H 78 Q 72 70 72 64 Z" />
      <Ticks x={82} y={36} n={6} dx={6} len={28} />
      <R x={116} y={44} w={16} h={12} r={2} o={0.22} />
      <F d="M 120 50 H 128" />
      {/* taper lever on the flank */}
      <P d="M 146 34 L 150 22 H 156" />
      {/* blade head with teeth */}
      <M d="M 156 30 H 176 V 70 H 156 Z" o={0.22} />
      <F d="M 160 38 H 174 M 160 62 H 174" />
      <P d="M 176 34 L 181 37 L 176 40 L 181 43 L 176 46 L 181 49 L 176 52 L 181 55 L 176 58 L 181 61 L 176 64 L 181 67" />
      <F d="M 176 30 V 70" />
      {/* strain relief + coiled cord */}
      <M d="M 62 44 H 72 V 56 H 62 Q 58 56 58 52 V 48 Q 58 44 62 44 Z" o={0.22} />
      <P d="M 58 50 C 40 50 36 66 46 70 C 56 74 56 84 44 86 C 34 88 30 82 32 76" />
      <F d="M 50 68 C 46 72 40 70 40 66" />
    </>
  ),
};

/* ---------------------------------------------------------------- grenades (100×100) */

const GRENADE_ART: Record<GrenadeId, () => JSX.Element> = {
  // Frag: pineapple body, fuse head, pin ring and spoon.
  frag: () => (
    <>
      <M d="M 50 34 Q 72 34 72 62 Q 72 90 50 90 Q 28 90 28 62 Q 28 34 50 34 Z" />
      <F d="M 30 50 H 70 M 28 62 H 72 M 30 74 H 70" />
      <F d="M 40 36 V 88 M 50 34 V 90 M 60 36 V 88" />
      <M d="M 42 26 H 58 V 35 H 42 Z" o={0.22} />
      <M d="M 38 16 H 62 Q 64 16 64 18 V 26 H 38 Q 36 26 36 24 V 18 Q 36 16 38 16 Z" o={0.22} />
      <P d="M 60 20 Q 78 24 76 60" />
      <F d="M 40 20 H 36" />
      <C cx={28} cy={20} r={6} />
    </>
  ),

  // Molotov: bottle with a burning rag in the neck.
  molotov: () => (
    <>
      <M d="M 42 30 H 58 V 42 Q 68 46 68 56 V 88 Q 68 94 62 94 H 38 Q 32 94 32 88 V 56 Q 32 46 42 42 Z" />
      <F d="M 36 64 Q 42 60 50 64 Q 58 68 64 64" />
      <R x={38} y={68} w={24} h={16} r={1} o={0} fine />
      <F d="M 42 74 H 58 M 42 78 H 54" />
      {/* rag */}
      <M d="M 44 30 Q 44 22 50 20 Q 58 20 58 30 L 62 36 L 56 34 L 60 40 L 52 34 L 44 38 Z" o={0.22} />
      {/* flame */}
      <M d="M 50 22 Q 40 12 48 2 Q 48 8 54 6 Q 62 12 56 22 Z" o={0.2} />
      <F d="M 50 20 Q 48 14 52 10" />
    </>
  ),

  // Throwing knife: skeleton-handled blade, drawn on a diagonal.
  knife: () => (
    <g transform="rotate(38 50 50)">
      <M d="M 50 4 Q 59 30 57 52 H 43 Q 41 30 50 4 Z" o={0.2} />
      <F d="M 50 14 V 46" />
      <M d="M 43 52 H 57 V 90 Q 57 94 50 94 Q 43 94 43 90 Z" o={0.22} />
      <C cx={50} cy={61} r={2.5} fine />
      <C cx={50} cy={71} r={2.5} fine />
      <C cx={50} cy={81} r={2.5} fine />
      <F d="M 41 52 H 59" />
    </g>
  ),

  // Flashbang: vented cylinder with a fuse head and pin.
  flash: () => (
    <>
      <M d="M 36 30 H 64 Q 68 30 68 34 V 88 Q 68 92 64 92 H 36 Q 32 92 32 88 V 34 Q 32 30 36 30 Z" />
      <C cx={42} cy={46} r={3} fine />
      <C cx={58} cy={46} r={3} fine />
      <C cx={42} cy={62} r={3} fine />
      <C cx={58} cy={62} r={3} fine />
      <C cx={42} cy={78} r={3} fine />
      <C cx={58} cy={78} r={3} fine />
      <M d="M 40 22 H 60 V 30 H 40 Z" o={0.22} />
      <M d="M 38 12 H 62 Q 64 12 64 14 V 22 H 36 V 14 Q 36 12 38 12 Z" o={0.22} />
      <P d="M 60 16 Q 78 22 76 58" />
      <F d="M 38 16 H 34" />
      <C cx={27} cy={16} r={6} />
    </>
  ),

  // Smoke: canister with a wisp of smoke rising from the top.
  smoke: () => (
    <>
      <M d="M 36 40 H 64 Q 68 40 68 44 V 90 Q 68 94 64 94 H 36 Q 32 94 32 90 V 44 Q 32 40 36 40 Z" />
      <F d="M 32 54 H 68 M 32 80 H 68" />
      <C cx={42} cy={47} r={2} fine />
      <C cx={50} cy={47} r={2} fine />
      <C cx={58} cy={47} r={2} fine />
      <M d="M 42 32 H 58 V 40 H 42 Z" o={0.22} />
      <P d="M 60 34 Q 76 38 74 66" />
      <F d="M 42 34 H 38" />
      <C cx={31} cy={34} r={5} />
      {/* wisp */}
      <P d="M 50 30 C 40 22 60 18 52 6" />
      <F d="M 58 28 C 66 24 60 16 68 10" />
      <F d="M 44 28 C 40 24 44 22 42 18" />
    </>
  ),

  // 40 mm launcher shell: brass casing with a blunt projectile.
  shell: () => (
    <>
      <M d="M 34 56 H 66 V 86 H 34 Z" o={0.2} />
      <M d="M 30 84 H 70 Q 72 84 72 86 V 90 Q 72 92 70 92 H 30 Q 28 92 28 90 V 86 Q 28 84 30 84 Z" o={0.22} />
      <M d="M 34 56 V 30 Q 34 10 50 8 Q 66 10 66 30 V 56 Z" />
      <F d="M 34 52 H 66 M 34 60 H 66" />
      <F d="M 40 30 Q 40 18 50 14" />
    </>
  ),
};

/* ---------------------------------------------------------------- perks (100×100) */

const PERK_ART: Record<PerkId, () => JSX.Element> = {
  // Flaszka: a bottle of vodka with a label.
  flask: () => (
    <>
      <M d="M 40 6 H 60 V 14 H 40 Z" o={0.22} />
      <M d="M 43 14 H 57 V 32 Q 66 36 66 46 V 90 Q 66 94 60 94 H 40 Q 34 94 34 90 V 46 Q 34 36 43 32 Z" />
      <F d="M 38 44 Q 42 36 50 36" />
      <R x={38} y={52} w={24} h={28} r={1} o={0.16} />
      <F d="M 42 60 H 58 M 42 66 H 56 M 42 72 H 54" />
      <F d="M 47 17 H 53" />
    </>
  ),

  // Sterydy: a syringe, drawn on a diagonal.
  roids: () => (
    <g transform="rotate(-38 50 50)">
      <M d="M 22 40 H 70 V 60 H 22 Z" />
      <M d="M 46 42 H 70 V 58 H 46 Z" o={0.22} />
      <Ticks x={30} y={40} n={5} dx={8} len={5} />
      <P d="M 22 34 V 66" />
      <M d="M 6 47 H 22 V 53 H 6 Z" o={0.2} />
      <M d="M 2 38 H 8 V 62 H 2 Z" o={0.22} />
      <M d="M 70 45 L 80 47 V 53 L 70 55 Z" o={0.22} />
      <P d="M 80 50 H 98" />
    </g>
  ),

  // Energetyk: an energy-drink can with a lightning bolt.
  energy: () => (
    <>
      <M d="M 36 18 H 64 Q 68 18 68 22 V 84 Q 68 90 62 90 H 38 Q 32 90 32 84 V 22 Q 32 18 36 18 Z" />
      <M d="M 34 12 H 66 V 18 H 34 Z" o={0.22} />
      <F d="M 32 26 H 68 M 32 80 H 68" />
      <F d="M 44 12 Q 46 8 52 8 Q 56 8 56 11" />
      <M d="M 56 34 L 40 56 H 50 L 44 76 L 62 50 H 52 Z" o={0.22} />
    </>
  ),

  // Świeży fade: barber scissors crossed with a comb.
  fade: () => (
    <>
      <g transform="rotate(-45 50 50)">
        <M d="M 8 44 H 92 V 52 H 8 Z" o={0.2} />
        <Ticks x={12} y={52} n={14} dx={5.7} len={12} />
      </g>
      <g transform="rotate(45 50 50)">
        <M d="M 50 52 L 42 8 L 48 6 Z" o={0.22} />
        <M d="M 50 52 L 58 8 L 52 6 Z" o={0.22} />
        <C cx={50} cy={52} r={2} solid />
        <P d="M 48 54 L 42 66 M 52 54 L 58 66" />
        <C cx={38} cy={74} r={8} />
        <C cx={62} cy={74} r={8} />
      </g>
    </>
  ),
};

/* ---------------------------------------------------------------- armour (100×100) */

const ARMOR_ART: Record<ArmorId, () => JSX.Element> = {
  // Light plate: slim plate carrier.
  light: () => (
    <>
      <M d="M 28 26 L 40 16 L 42 30 Q 50 36 58 30 L 60 16 L 72 26 L 76 60 Q 76 84 50 90 Q 24 84 24 60 Z" />
      <R x={36} y={40} w={28} h={32} r={3} o={0.2} />
      <F d="M 30 34 L 36 32 M 70 34 L 64 32" />
      <F d="M 40 48 H 60 M 40 56 H 60 M 40 64 H 60" />
      <F d="M 46 44 V 68 M 54 44 V 68" />
      <F d="M 26 48 H 34 M 66 48 H 74" />
    </>
  ),

  // Heavy plate: bulky carrier with shoulder pads, side plates and a bigger front plate.
  heavy: () => (
    <>
      <M d="M 20 28 L 36 14 L 40 28 Q 50 36 60 28 L 64 14 L 80 28 L 82 62 Q 82 88 50 94 Q 18 88 18 62 Z" />
      <M d="M 14 30 Q 18 16 36 14 L 40 26 Q 26 30 22 40 Z" o={0.22} />
      <M d="M 86 30 Q 82 16 64 14 L 60 26 Q 74 30 78 40 Z" o={0.22} />
      <R x={32} y={38} w={36} h={38} r={3} o={0.22} />
      <R x={20} y={44} w={9} h={30} r={2} o={0.2} fine />
      <R x={71} y={44} w={9} h={30} r={2} o={0.2} fine />
      <F d="M 36 46 H 64 M 36 54 H 64 M 36 62 H 64 M 36 70 H 64" />
      <F d="M 44 42 V 74 M 56 42 V 74" />
      <M d="M 38 78 H 62 V 86 Q 62 90 50 90 Q 38 90 38 86 Z" o={0.2} />
    </>
  ),
};

/* ---------------------------------------------------------------- public components */

export function WeaponArt({ id, className, title }: ArtProps<WeaponId>): JSX.Element {
  const Draw = WEAPON_ART[id];
  return <Frame id={id} viewBox="0 0 240 100" className={className} title={title}><Draw /></Frame>;
}

export function GrenadeArt({ id, className, title }: ArtProps<GrenadeId>): JSX.Element {
  const Draw = GRENADE_ART[id];
  return <Frame id={id} viewBox="0 0 100 100" className={className} title={title}><Draw /></Frame>;
}

export function PerkArt({ id, className, title }: ArtProps<PerkId>): JSX.Element {
  const Draw = PERK_ART[id];
  return <Frame id={id} viewBox="0 0 100 100" className={className} title={title}><Draw /></Frame>;
}

export function ArmorArt({ id, className, title }: ArtProps<ArmorId>): JSX.Element {
  const Draw = ARMOR_ART[id];
  return <Frame id={id} viewBox="0 0 100 100" className={className} title={title}><Draw /></Frame>;
}

/** Bomb Plant (2.2): the defuse kit — a belt pouch, open, with wire cutters and a probe. */
export function KitArt({ className, title }: { className?: string; title?: string }): JSX.Element {
  return (
    <Frame id="kit" viewBox="0 0 100 100" className={className} title={title}>
      <M d="M18 38 h64 v40 a6 6 0 0 1 -6 6 h-52 a6 6 0 0 1 -6 -6 z" o={0.18} />
      <P d="M18 38 v-8 a6 6 0 0 1 6 -6 h52 a6 6 0 0 1 6 6 v8" />
      <F d="M26 38 v-6 h48 v6" />
      <F d="M44 24 h12 v6 h-12 z" />
      <P d="M34 62 l14 -14 M48 48 l-4 -6 l6 -3 l4 6 z" />
      <P d="M40 56 l-8 10 M46 62 l-8 8" />
      <F d="M60 50 l12 18 M72 68 l4 -2 l-3 -5" />
      <F d="M28 78 h44" />
    </Frame>
  );
}

