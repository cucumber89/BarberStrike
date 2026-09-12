import type { ReactElement } from "react";
import type { ShopItemId } from "@frankibarber/shared";

/** Flat silhouettes with enough canvas for a readable 52 px shop slot. */
const icon = { viewBox: "0 0 64 28", fill: "currentColor", "aria-hidden": true } as const;

const Pistol = (): ReactElement => <svg {...icon}><path d="M8 7h35v5H30v4H19l-2 11H9l3-12H6V9h2zm35 2h13v3H43zM20 16h8l-3 4h-6z" /></svg>;
const Revolver = (): ReactElement => <svg {...icon}><path d="M6 9h13V7h12l5 3h21v4H36l-5 3h-7l-4 10h-8l5-12H6z" /><circle cx="27" cy="12" r="6" /></svg>;
const MachinePistol = (): ReactElement => <svg {...icon}><path d="M7 6h36v9H29l-2 12h-8l2-12H11v4H7zm36 3h14v4H43zM33 15h7l4 12h-8z" /><path d="M48 6h3v3h-3zm5 0h3v3h-3z" /></svg>;
const Smg = (): ReactElement => <svg {...icon}><path d="M3 9h9l8-6h5v5h27v8H31l-3 11h-8l2-11H13L3 21zm49 2h9v3h-9zM35 16h7v7h-7z" /></svg>;
const Smg2 = (): ReactElement => <svg {...icon}><path d="M4 10h9l9-7h4v6h27v7H34l4 11h-8l-6-11H13L4 21zm49-2h8v9h-8zM8 12h12v2H8z" /></svg>;
const Carbine = (): ReactElement => <svg {...icon}><path d="M4 7h20l7 3h22v7H30l-7-3H10l-5 7H2V9zM53 11h9v3h-9zM14 14h7l3 13h-8zM31 17h7l-2 8h-7z" /></svg>;
const Rifle = (): ReactElement => <svg {...icon}><path d="M2 9h10l9-6h6v5h27v8H32l-4 11h-8l3-11H13L2 21zm52 2h9v3h-9zM36 16h8l4 11h-9zM29 5h18v2H29z" /></svg>;
const Lmg = (): ReactElement => <svg {...icon}><path d="M2 8h12l8-5h7v4h27v9H32l-4 11h-8l3-11H13L2 20zm54 3h7v4h-7zM34 15h15v12H34zM28 3h21v3H28z" /></svg>;
const Shotgun = (): ReactElement => <svg {...icon}><path d="M2 10h15l8-6h7v5h30v4H34v6h-9l-5 8h-9l7-11H2zM31 15h31v3H31zM37 13h12v7H37z" /></svg>;
const AutoShotgun = (): ReactElement => <svg {...icon}><path d="M2 8h17l8-5h8v4h27v5H36v7H26l-5 8h-9l7-11H2zm34 6h26v3H36zM38 4h17v3H38zM30 18h7l3 9h-8z" /></svg>;
const Dmr = (): ReactElement => <svg {...icon}><path d="M2 10h14l9-6h7v5h30v4H37l-6 6h-9l-7 8H5l10-12H2zm25-8h22v4H27zm15 13h8l3 12h-9z" /></svg>;
const Sniper = (): ReactElement => <svg {...icon}><path d="M1 11h16l9-5h36v4H35v6H24l-8 11H5l10-13H1zm24-9h25v4H25zm22 1h7v2h-7zM39 16h7l3 11h-8zM52 14h2l4 9h-3z" /></svg>;
const Launcher = (): ReactElement => <svg {...icon}><path d="M4 6h47l8 4v9l-8 3H4zM51 8h11v12H51zM16 21h9l-4 6H12zm18 0h7v6h-7zM8 3h21v3H8z" /></svg>;
const Clippers = (): ReactElement => <svg {...icon}><path d="M19 8h27v19H19zM15 3h35v7H15zM16 1h4v5h4V1h4v5h4V1h4v5h4V1h4v5h4V1h4v8H12V6h4zM25 13h15v3H25z" /></svg>;

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
