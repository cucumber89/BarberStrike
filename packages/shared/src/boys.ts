import type { WeaponId } from "./weapons";

export const BOYS_CLASSES = [1, 2, 3, 4, 5] as const;
export type BoysClass = typeof BOYS_CLASSES[number];
export const isBoysClass = (v: unknown): v is BoysClass => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
export interface BoysClassDef { name: string; health: number; speed: number; starter: WeaponId; weapons: readonly WeaponId[]; items: readonly string[]; blurb: string }
export const BOYS: Record<BoysClass, BoysClassDef> = {
  1: { name: "Scout", health: 85, speed: 1.15, starter: "smg", weapons: ["smg", "smg2", "shotgun"], items: ["knife", "smoke", "energy", "fade", "light"], blurb: "Flank & capture · +15% speed · counts as two on points · 85 HP" },
  2: { name: "Assault", health: 110, speed: 1, starter: "rifle", weapons: ["rifle", "shotgun", "launcher"], items: ["frag", "flash", "flask", "light", "heavy"], blurb: "Break defences · 110 HP · free frag every spawn" },
  3: { name: "Heavy", health: 150, speed: .85, starter: "lmg", weapons: ["lmg", "shotgun"], items: ["molotov", "smoke", "flask", "light", "heavy"], blurb: "Hold the line · 150 HP · -15% speed · LMG from spawn · suppress lanes" },
  4: { name: "Medic", health: 100, speed: 1.05, starter: "smg", weapons: ["smg", "shotgun"], items: ["smoke", "flash", "roids", "energy", "light"], blurb: "Heal allies 6 HP/s in combat, 10 HP/s after 3s without damage · 6m, line of sight · earns support cash" },
  5: { name: "Marksman", health: 90, speed: 1, starter: "dmr", weapons: ["dmr", "sniper"], items: ["knife", "smoke", "roids", "fade", "light"], blurb: "Cover long lanes · 90 HP · recover 5 HP/s after 4s without damage" },
};
export const boysClass = (v: unknown): BoysClassDef => BOYS[isBoysClass(v) ? v : 1];
export const boysAllows = (v: unknown, item: string): boolean => {
  const c = boysClass(v);
  return item === "pistol" || item === "revolver" || item === "clippers" || c.weapons.some(w => w === item) || c.items.includes(item);
};

/** Shared support rules: one healer per target, never additive. */
export const BOYS_SUPPORT = { radius: 6, combatHeal: 6, safeHeal: 10, safeDelayMs: 3000 } as const;
export function boysHealRate(sinceDamageMs: number): number {
  return sinceDamageMs >= BOYS_SUPPORT.safeDelayMs ? BOYS_SUPPORT.safeHeal : BOYS_SUPPORT.combatHeal;
}
export interface BoysAlly { id: string; team: number; alive: boolean; connected: boolean; boysClass: number; health: number; x: number; y: number; z: number }
/** Prefer nearby, badly hurt allies; do not abandon the objective to chase someone across the map. */
export function boysMedicGoal(me: BoysAlly, players: Iterable<BoysAlly>): BoysAlly | undefined {
  if (me.boysClass !== 4) return;
  let best: BoysAlly | undefined, bestScore = -Infinity;
  for (const p of players) {
    if (p.id === me.id || p.team !== me.team || !p.alive || !p.connected) continue;
    const missing = boysClass(p.boysClass).health - p.health;
    const distance = Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z);
    if (missing <= 0 || distance > 18) continue;
    const score = missing - distance * 2;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
