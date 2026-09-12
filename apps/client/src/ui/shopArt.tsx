import type { ReactElement } from "react";
import type { ShopItemId } from "@frankibarber/shared";

/** Flat 48×24 silhouettes sized for the shop's 28 px scan slot. */
const icon = { viewBox: "0 0 48 24", fill: "currentColor", "aria-hidden": true } as const;

const Pistol = (): ReactElement => <svg {...icon}><path d="M3 7h29v7H20l-2 9h-8l2-9H3zm29 2h12v3H32z" /></svg>;
const Revolver = (): ReactElement => <svg {...icon}><path d="M3 8h13v7H3zm13-2h9l4 3h15v4H29l-4 3h-5l-3 7h-7l4-9h2z" /><circle cx="21" cy="11" r="4" /></svg>;
const MachinePistol = (): ReactElement => <svg {...icon}><path d="M2 6h28v8H19l-1 9h-7l1-9H6v3H3zm28 2h14v4H30zM21 14h5l2 9h-6z" /></svg>;
const Smg = (): ReactElement => <svg {...icon}><path d="M2 8h7l5-4h4v4h18v7H23l-2 8h-6l1-8H8l-6 4zm34 2h10v3H36z" /></svg>;
const Smg2 = (): ReactElement => <svg {...icon}><path d="M2 9h7l7-5h2v5h17v5H22l3 9h-6l-4-9H9L2 18zm33-1h11v7H35z" /><path fillRule="evenodd" d="M5 10h10v3H8v2H5z" /></svg>;
const Carbine = (): ReactElement => <svg {...icon}><path d="M2 7h17l5 3h15v6H23l-5-3H9l-3 6H2zm37 4h7v3h-7zM11 13h5l2 10h-6z" /></svg>;
const Rifle = (): ReactElement => <svg {...icon}><path d="M1 8h10l5-4h4v4h18v7H22l-3 8h-6l2-8H9l-8 4zm37 2h9v3h-9zM25 15h6l2 8h-7z" /></svg>;
const Lmg = (): ReactElement => <svg {...icon}><path d="M1 7h11l4-3h5v3h18v8H22l-3 8h-6l2-8H8l-7 3zm38 3h8v4h-8zM23 14h12v9H23z" /></svg>;
const Shotgun = (): ReactElement => <svg {...icon}><path d="M1 9h15l4-3h5v3h22v3H25v4h-7l-3 7H9l4-8H1zM24 14h23v3H24z" /></svg>;
const AutoShotgun = (): ReactElement => <svg {...icon}><path d="M1 7h17l4-3h5v3h20v4H27v6h-8l-3 6H9l5-8H1zm25 6h21v3H26z" /></svg>;
const Dmr = (): ReactElement => <svg {...icon}><path d="M1 9h13l5-4h4v4h24v3H27l-4 5h-7l-4 6H5l7-9H1zM21 3h12v3H21zm4 11h7l2 9h-7z" /></svg>;
const Sniper = (): ReactElement => <svg {...icon}><path d="M1 10h14l4-3h28v3H25v5h-8l-5 8H4l8-10H1zM18 3h18v4H18zm16 1h6v2h-6zM24 15h6l2 8h-7z" /></svg>;
const Launcher = (): ReactElement => <svg {...icon}><path d="M2 7h35v11H2zm35 2h10v7H37zM13 18h7l-2 5h-7zm12 0h5v5h-5z" /></svg>;
const Clippers = (): ReactElement => <svg {...icon}><path d="M13 7h22v15H13zM10 2h28v6H10zM11 1h3v4h3V1h3v4h3V1h3v4h3V1h3v4h3V1h3v4h3v3H8V5h3z" /></svg>;

const Frag = (): ReactElement => <svg {...icon}><path d="M18 6h13l4 5-3 11H17l-4-11zm4-5h8v5h-8zm8 1h9v3h-9z" /></svg>;
const Molotov = (): ReactElement => <svg {...icon}><path d="M20 2h9v6l5 6v8H14v-8l6-6zm11 0 8 3-5 5z" /></svg>;
const Knife = (): ReactElement => <svg {...icon}><path d="M3 17h13l21-14 7 2-22 14v4H10v-3H3z" /></svg>;
const Flash = (): ReactElement => <svg {...icon}><path d="M16 6h17v17H16zM20 1h9v5h-9zm11 1h9v3h-9zM19 9h11v2H19zm0 5h11v2H19z" /></svg>;
const Smoke = (): ReactElement => <svg {...icon}><path d="M15 5h18v18H15zM18 1h12v4H18zm15 2h8v3h-8zM18 9h12v3H18zm0 5h12v3H18z" /></svg>;
const Shell = (): ReactElement => <svg {...icon}><path d="M7 9h30l8 3-8 3H7zM3 8h7v8H3z" /></svg>;

const LightPlate = (): ReactElement => <svg {...icon}><path d="M13 2h22l5 5-3 16H11L8 7zm2 5v11h18l2-9-3-2z" /></svg>;
const HeavyPlate = (): ReactElement => <svg {...icon}><path d="M9 4h27l4 5-3 14H8L5 9zm6-3h25l3 4-2 4-5-5H14z" /></svg>;
const Flask = (): ReactElement => <svg {...icon}><path d="M19 1h10v6l5 6v10H14V13l5-6zm-1 13v6h12v-6z" /></svg>;
const Syringe = (): ReactElement => <svg {...icon}><path d="M8 16 31 3l5 8-23 13zM31 1l2-1 8 13-3 2zM5 15l5 9H6l-4-7z" /></svg>;
const EnergyCan = (): ReactElement => <svg {...icon}><path d="M15 2h19l-2 21H17zm4 6h10l-5 5h5l-9 7 3-6h-5z" /></svg>;
const Fade = (): ReactElement => <svg {...icon}><path d="M5 5h28v5H5zm4 5h3v5H9zm5 0h3v7h-3zm5 0h3v9h-3zm5 0h3v11h-3zm9-7h11v3H33z" /></svg>;

export const SHOP_ART: Record<ShopItemId, () => ReactElement> = {
  pistol: Pistol, revolver: Revolver, machinepistol: MachinePistol,
  smg: Smg, smg2: Smg2, carbine: Carbine, rifle: Rifle, lmg: Lmg,
  shotgun: Shotgun, autoshotgun: AutoShotgun, dmr: Dmr, sniper: Sniper,
  launcher: Launcher, clippers: Clippers,
  frag: Frag, molotov: Molotov, knife: Knife, flash: Flash, smoke: Smoke, shell: Shell,
  light: LightPlate, heavy: HeavyPlate,
  flask: Flask, roids: Syringe, energy: EnergyCan, fade: Fade,
};
