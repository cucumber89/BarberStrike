import type { ReactElement } from "react";
import { isWeaponId, type ShopItemId, type WeaponId } from "@frankibarber/shared";

/**
 * Flat silhouettes. Each one is drawn on a 64 × 28 sheet, but its `viewBox` is the drawing's own
 * bounding box plus one unit (measured with `getBBox()` in a browser, 2026-09-14): a grenade that
 * covers 26 × 21 units of a 64 × 28 sheet showed as a thumbnail in a slot that was three times its
 * width, so the "large silhouette" the row promises was mostly margin. Same aspect handling as
 * before (`xMidYMid meet`), so nothing is stretched.
 *
 * The FOURTEEN weapons are the exception: their tiles carry a rendered three-quarter PNG
 * (`assets/weapons/<id>.png`, built by `e2e/tools/weapon-icons.mjs` from the real procedural
 * geometry) instead of an inline `<path>`, so the shop shows the actual gun. Grenades, gear and
 * perks keep the flat SVG silhouettes below — they were never the placeholders P8a set out to fix.
 */
// Every weapon portrait, resolved to its bundled URL at build time (Vite `import.meta.glob`).
// Keyed by weapon id so a tile picks its own PNG without fourteen literal imports.
const WEAPON_PNG = import.meta.glob<string>("../assets/weapons/*.png", { eager: true, query: "?url", import: "default" });
const weaponPngUrl = (id: WeaponId): string | undefined => WEAPON_PNG[`../assets/weapons/${id}.png`];

/**
 * The shop/HUD icon for any item, tagged `shop-icon-<id>` (the e2e contract, §8). A weapon renders
 * its rendered PNG portrait; everything else renders its flat SVG silhouette. One component so the
 * shop, the kill feed, the inventory strip and the death card all draw an item the same way.
 */
export function ShopIcon({ id, className }: { id: ShopItemId; className?: string }): ReactElement {
  const url = isWeaponId(id) ? weaponPngUrl(id) : undefined;
  if (url) return <img className={className} src={url} alt="" aria-hidden="true" draggable={false} data-testid={`shop-icon-${id}`} />;
  const Draw = SHOP_ART[id];
  return <span className={className} data-testid={`shop-icon-${id}`}>{Draw ? <Draw /> : null}</span>;
}

// The weapons: a rendered PNG portrait, NOT an inline `<path>` (P8a criterion — the shop cards must
// carry the real gun). `weaponImg` builds the same `<img>` for every weapon so a missing PNG is a
// build error, not fourteen chances to forget one. The image is the item's silhouette wherever
// `SHOP_ART[id]` is used (shop tile, kill feed, inventory, death card).
const weaponImg = (id: WeaponId): (() => ReactElement) => {
  const url = weaponPngUrl(id);
  const Draw = (): ReactElement => <img className="art-img" src={url} alt="" aria-hidden="true" draggable={false} />;
  return Draw;
};
const Pistol = weaponImg("pistol");
const Revolver = weaponImg("revolver");
const MachinePistol = weaponImg("machinepistol");
const Smg = weaponImg("smg");
const Smg2 = weaponImg("smg2");
const Carbine = weaponImg("carbine");
const Rifle = weaponImg("rifle");
const Lmg = weaponImg("lmg");
const Shotgun = weaponImg("shotgun");
const AutoShotgun = weaponImg("autoshotgun");
const Dmr = weaponImg("dmr");
const Sniper = weaponImg("sniper");
const Launcher = weaponImg("launcher");
const Clippers = weaponImg("clippers");

/**
 * Grenades, gear and perks as small COLOURED illustrations on one 48×48 grid, one house palette
 * (steel + brass + each item's own colour). They replace the flat ivory silhouettes P8a left in
 * place: a white blob read as nothing at a shop-tile's size, and next to the rendered weapon
 * portraits it looked unfinished. Two or three tones each is enough to say "bottle", "vest",
 * "syringe" at a glance; the drop shadow (in `screens.css`) sits them on the tile like the guns.
 */
const VB = { viewBox: "0 0 48 48", "aria-hidden": true } as const;
// House palette, shared with the weapon renderer's material colours where it helps them sit together.
const C = {
  steelL: "#cdd4dc", steel: "#9aa3ad", steelD: "#5f666f", dark: "#2b2f36",
  brass: "#e7b62e", brassD: "#b98a1f", olive: "#77883f", oliveD: "#56602f",
  glass: "#a7c4d2", amber: "#d68a2c", flame: "#f4a72a", flame2: "#e85f2b",
  kev: "#3d444e", kevL: "#525b66", red: "#d0555f", green: "#57bd67",
  white: "#eef2f6", tan: "#c39a63", tanD: "#8f6f45", lens: "#5fa7c8",
};

const Frag = (): ReactElement => (
  <svg {...VB}>
    <ellipse cx="24" cy="31" rx="11" ry="13" fill={C.olive} />
    <path d="M13 27h22M13 34h22M24 18v26M18 19v24M30 19v24" stroke={C.oliveD} strokeWidth="1.6" />
    <rect x="19" y="12" width="10" height="8" rx="1.5" fill={C.steel} />
    <rect x="19" y="12" width="10" height="3" fill={C.steelL} />
    <path d="M29 14q10 1 7 13" fill="none" stroke={C.steelD} strokeWidth="3" strokeLinecap="round" />
    <circle cx="15" cy="14" r="4" fill="none" stroke={C.brass} strokeWidth="2.4" />
  </svg>
);
const Molotov = (): ReactElement => (
  <svg {...VB}>
    <path d="M18 20h12v4l3 5v13a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V29l3-5z" fill={C.glass} />
    <path d="M15 33h18v11a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill={C.amber} />
    <rect x="19" y="15" width="10" height="6" rx="1" fill={C.steelL} />
    <path d="M22 15c-1-5 3-6 2-11 4 3 5 7 2 11z" fill={C.flame} />
    <path d="M23 11c0-3 1-4 1-6 2 2 2 4 1 6z" fill={C.flame2} />
  </svg>
);
const Knife = (): ReactElement => (
  <svg {...VB}>
    <path d="M8 34 34 8l5 2-24 26z" fill={C.steelL} />
    <path d="M8 34 34 8l2 1-25 26z" fill={C.white} />
    <rect x="6" y="31" width="12" height="7" rx="2" transform="rotate(-3 12 34)" fill={C.dark} />
    <rect x="16" y="30" width="4" height="8" rx="1.5" transform="rotate(-45 18 34)" fill={C.brass} />
  </svg>
);
const Flash = (): ReactElement => (
  <svg {...VB}>
    <rect x="17" y="18" width="14" height="26" rx="3" fill={C.steel} />
    <rect x="17" y="18" width="5" height="26" rx="3" fill={C.steelL} />
    <rect x="19" y="13" width="10" height="6" rx="1.5" fill={C.steelD} />
    <path d="M24 2 27 12h-6zM8 16l9 3-8 4zM40 16l-9 3 8 4z" fill={C.brass} />
    <circle cx="24" cy="30" r="4" fill={C.white} />
  </svg>
);
const Smoke = (): ReactElement => (
  <svg {...VB}>
    <rect x="17" y="20" width="14" height="24" rx="3" fill={C.oliveD} />
    <rect x="17" y="20" width="5" height="24" rx="3" fill={C.olive} />
    <rect x="19" y="15" width="10" height="6" rx="1.5" fill={C.steel} />
    <circle cx="16" cy="12" r="5" fill={C.steelL} opacity=".85" />
    <circle cx="26" cy="9" r="6" fill={C.steel} opacity=".8" />
    <circle cx="34" cy="13" r="4.5" fill={C.steelL} opacity=".85" />
  </svg>
);
const Shell = (): ReactElement => (
  <svg {...VB}>
    <path d="M22 14c7 0 12 4 12 10s-5 10-12 10z" fill={C.steelL} />
    <rect x="12" y="17" width="12" height="14" rx="2" fill={C.brass} />
    <rect x="10" y="16" width="4" height="16" rx="1.5" fill={C.brassD} />
    <path d="M24 19h9M24 24h11M24 29h9" stroke={C.steel} strokeWidth="1.4" />
  </svg>
);
const plate = (heavy: boolean): (() => ReactElement) => () => (
  <svg {...VB}>
    <path d="M24 10 38 14v11c0 8-6 12-14 15-8-3-14-7-14-15V14z" fill={C.kev} />
    <path d="M24 10 38 14v3l-14-4-14 4v-3z" fill={C.kevL} />
    <path d="M24 15v25" stroke={C.kevL} strokeWidth="1.4" />
    {heavy && <path d="M15 20h18M15 27h18" stroke={C.kevL} strokeWidth="1.6" />}
    <rect x="21" y="20" width="6" height="8" rx="1" fill={C.brass} />
  </svg>
);
const LightPlate = plate(false);
const HeavyPlate = plate(true);
const Flask = (): ReactElement => (
  <svg {...VB}>
    <path d="M20 10h8v9l7 13a5 5 0 0 1-4.5 8H17.5a5 5 0 0 1-4.5-8l7-13z" fill={C.glass} />
    <path d="M14 30h20l1.5 3a5 5 0 0 1-4.5 7H17a5 5 0 0 1-4.5-7z" fill={C.green} />
    <rect x="19" y="7" width="10" height="5" rx="1.5" fill={C.brass} />
    <circle cx="21" cy="35" r="1.8" fill={C.white} opacity=".8" />
    <circle cx="27" cy="38" r="1.3" fill={C.white} opacity=".8" />
  </svg>
);
const Syringe = (): ReactElement => (
  <svg {...VB}>
    <rect x="10" y="18" width="24" height="10" rx="2" transform="rotate(-30 22 23)" fill={C.steelL} />
    <rect x="10" y="18" width="12" height="10" rx="2" transform="rotate(-30 22 23)" fill={C.amber} />
    <path d="M33 9 42 15" stroke={C.steel} strokeWidth="3" strokeLinecap="round" />
    <path d="M6 27 12 31" stroke={C.steelD} strokeWidth="3" strokeLinecap="round" />
    <path d="M39 6l4 3" stroke={C.steelD} strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const EnergyCan = (): ReactElement => (
  <svg {...VB}>
    <rect x="16" y="10" width="16" height="30" rx="3" fill={C.steelL} />
    <rect x="16" y="10" width="5" height="30" rx="3" fill={C.white} />
    <rect x="16" y="20" width="16" height="10" fill={C.red} />
    <path d="M25 21l-5 6h4l-2 5 6-7h-4z" fill={C.brass} />
    <rect x="18" y="8" width="12" height="3" rx="1" fill={C.steelD} />
  </svg>
);
const Fade = (): ReactElement => (
  <svg {...VB}>
    <path d="M24 8 39 13v10c0 9-6 14-15 18-9-4-15-9-15-18V13z" fill={C.lens} />
    <path d="M24 8 39 13v10c0 9-6 14-15 18z" fill={C.steel} opacity=".55" />
    <path d="M24 15l7 8-7 8-7-8z" fill={C.white} opacity=".85" />
  </svg>
);

export const SHOP_ART: Record<ShopItemId, () => ReactElement> = {
  pistol: Pistol, revolver: Revolver, machinepistol: MachinePistol,
  smg: Smg, smg2: Smg2, carbine: Carbine, rifle: Rifle, lmg: Lmg,
  shotgun: Shotgun, autoshotgun: AutoShotgun, dmr: Dmr, sniper: Sniper,
  launcher: Launcher, clippers: Clippers,
  frag: Frag, molotov: Molotov, knife: Knife, flash: Flash, smoke: Smoke, shell: Shell,
  light: LightPlate, heavy: HeavyPlate,
  flask: Flask, roids: Syringe, energy: EnergyCan, fade: Fade,
};
