import type { GrenadeId, WeaponId } from "@frankibarber/shared";

/** One line per weapon: what it is FOR, in the voice of the shop. Shared by the buy menu and the armoury. */
export const WEAPON_BLURB: Record<WeaponId, string> = {
  pistol: "Free sidearm. Always in slot 2 unless you carry the revolver.",
  revolver: "Six big rounds. Two to the chest, one to the head.",
  smg: "Fast, forgiving up close. Cheap entry ticket.",
  smg2: "Screams through a mag in 1.4 s. Fastest hands in the game.",
  shotgun: "One-shot inside the shop, useless across the street.",
  rifle: "The all-rounder. Learn the recoil and it wins most fights.",
  lmg: "100 rounds, slow to swing, holds a lane on its own.",
  dmr: "Two-tap at range. Slow, punishing, satisfying.",
  sniper: "Scoped. One shot to the head, two to the body. Shift steadies the reticle.",
  launcher: "One shell, a 4.5 m blast, breaks open to reload. Mind the walls.",
  clippers: "Always on you (V). From behind it is a haircut nobody walks away from.",
};

/** The role tag on the armoury card. */
export const WEAPON_ROLE: Record<WeaponId, string> = {
  pistol: "SIDEARM", revolver: "HAND CANNON", smg: "CLOSE RANGE", smg2: "RUN & GUN", shotgun: "DOORWAYS", rifle: "ALL-ROUNDER",
  lmg: "SUPPRESSION", dmr: "MID RANGE", sniper: "LONG RANGE", launcher: "AREA DENIAL", clippers: "MELEE",
};

export const GRENADE_BLURB: Record<GrenadeId, string> = {
  frag: "Hold G to cook, release to throw. 3.2 s fuse.",
  molotov: "Breaks on impact; burns the floor for 6 s.",
  knife: "Silent, straight, 70 damage on a hit. Sticks in walls.",
  flash: "Blinds everyone looking at it. Press 4 to throw.",
  smoke: "12 s of cover. Press 4 to throw.",
  shell: "The GL-1's round: 95 in the middle of a 4.5 m blast.",
};
