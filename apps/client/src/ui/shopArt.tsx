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
const box = (x: number, y: number, w: number, h: number) =>
  ({ viewBox: `${x - 1} ${y - 1} ${w + 2} ${h + 2}`, fill: "currentColor", "aria-hidden": true }) as const;

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

const Frag = (): ReactElement => <svg {...box(13, 1, 26, 21)}><path d="M18 6h13l4 5-3 11H17l-4-11zm4-5h8v5h-8zm8 1h9v3h-9z" /></svg>;
const Molotov = (): ReactElement => <svg {...box(14, 2, 25, 20)}><path d="M20 2h9v6l5 6v8H14v-8l6-6zm11 0 8 3-5 5z" /></svg>;
const Knife = (): ReactElement => <svg {...box(3, 3, 41, 20)}><path d="M3 17h13l21-14 7 2-22 14v4H10v-3H3z" /></svg>;
const Flash = (): ReactElement => <svg {...box(16, 1, 24, 22)}><path d="M16 6h17v17H16zM20 1h9v5h-9zm11 1h9v3h-9zM19 9h11v2H19zm0 5h11v2H19z" /></svg>;
const Smoke = (): ReactElement => <svg {...box(15, 1, 26, 22)}><path d="M15 5h18v18H15zM18 1h12v4H18zm15 2h8v3h-8zM18 9h12v3H18zm0 5h12v3H18z" /></svg>;
const Shell = (): ReactElement => <svg {...box(3, 8, 42, 8)}><path d="M7 9h30l8 3-8 3H7zM3 8h7v8H3z" /></svg>;

const LightPlate = (): ReactElement => <svg {...box(8, 2, 32, 21)}><path d="M13 2h22l5 5-3 16H11L8 7zm2 5v11h18l2-9-3-2z" /></svg>;
const HeavyPlate = (): ReactElement => <svg {...box(5, 1, 38, 22)}><path d="M9 4h27l4 5-3 14H8L5 9zm6-3h25l3 4-2 4-5-5H14z" /></svg>;
const Flask = (): ReactElement => <svg {...box(14, 1, 20, 22)}><path d="M19 1h10v6l5 6v10H14V13l5-6zm-1 13v6h12v-6z" /></svg>;
const Syringe = (): ReactElement => <svg {...box(2, 0, 39, 24)}><path d="M8 16 31 3l5 8-23 13zM31 1l2-1 8 13-3 2zM5 15l5 9H6l-4-7z" /></svg>;
const EnergyCan = (): ReactElement => <svg {...box(15, 2, 19, 21)}><path d="M15 2h19l-2 21H17zm4 6h10l-5 5h5l-9 7 3-6h-5z" /></svg>;
const Fade = (): ReactElement => <svg {...box(5, 3, 39, 18)}><path d="M5 5h28v5H5zm4 5h3v5H9zm5 0h3v7h-3zm5 0h3v9h-3zm5 0h3v11h-3zm9-7h11v3H33z" /></svg>;

export const SHOP_ART: Record<ShopItemId, () => ReactElement> = {
  pistol: Pistol, revolver: Revolver, machinepistol: MachinePistol,
  smg: Smg, smg2: Smg2, carbine: Carbine, rifle: Rifle, lmg: Lmg,
  shotgun: Shotgun, autoshotgun: AutoShotgun, dmr: Dmr, sniper: Sniper,
  launcher: Launcher, clippers: Clippers,
  frag: Frag, molotov: Molotov, knife: Knife, flash: Flash, smoke: Smoke, shell: Shell,
  light: LightPlate, heavy: HeavyPlate,
  flask: Flask, roids: Syringe, energy: EnergyCan, fade: Fade,
};
