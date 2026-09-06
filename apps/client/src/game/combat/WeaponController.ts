import { C2S, WEAPONS, carriedWeapons, effectiveSpread, fireIntervalMs, isWeaponId, noPerks, primaryOf, recoilResetMs, recoilStep, usesAmmo, weaponForSlot, type FireMessage, type Wallet, type WeaponId } from "@frankibarber/shared";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/** Delay before the first shot after sprinting (weapon raise). Server tolerance covers it. */
const SPRINT_OUT_MS = 150;
/** After a local slot request, snapshots still carrying the old weapon are ignored for this long. */
const EQUIP_GRACE_MS = 400;

export interface ShotFired {
  weapon: WeaponId;
  origin: [number, number, number];
  dir: [number, number, number];
}

/**
 * Client-side weapon logic for the local player. Mirrors the server's rules (fire rate,
 * ammo, reload/equip timing) so feedback is instant; the server remains authoritative and
 * the mirror is re-synced from replicated state after every snapshot.
 *
 * Drop 2: the carried weapons come from the wallet (pistol + at most one bought primary), so
 * slot keys map onto the owned list (1 = primary, 2 = sidearm) instead of the fixed catalogue.
 */
export class WeaponController {
  weapon: WeaponId = "pistol";
  ammo = 0;
  reserve = 0;
  reloading = false;
  /** Bought guns as replicated (sidearm + primary); the clippers are implicit. */
  owned: WeaponId[] = ["pistol"];
  /** Everything the player can switch to, in slot order: sidearm, primary, clippers. */
  carried: WeaponId[] = ["pistol", "clippers"];
  private reloadEndsAt = 0;
  private equipEndsAt = 0;
  private localEquipAt = -Infinity;
  private lastFireAt = -Infinity;
  private triggerHeld = false;
  /** Accumulated bloom (radians) that decays over time. */
  spread = 0;
  /** Index into the weapon's recoil pattern; resets after a pause in firing. */
  private shotIndex = 0;
  private lastSprintAt = -Infinity;
  private previousWeapon: WeaponId | null = null;
  private recoilTmp: [number, number] = [0, 0];
  onShot: ((s: ShotFired) => void) | null = null;
  /** Called right before a Fire message goes out (the game flushes queued inputs so seq is known server-side). */
  beforeFire: (() => void) | null = null;
  onDryFire: (() => void) | null = null;
  onReload: ((weapon: WeaponId) => void) | null = null;
  onReloadEnd: ((weapon: WeaponId) => void) | null = null;
  onEquip: ((weapon: WeaponId) => void) | null = null;

  constructor(private conn: Connection, private player: LocalPlayer) {}

  syncFrom(p: NetPlayer): void {
    const owned = Array.from(p.owned ?? []).filter(isWeaponId);
    if (owned.length && (owned.length !== this.owned.length || owned.some((w, i) => w !== this.owned[i]))) { this.owned = owned; this.carried = carriedWeapons(this.walletView()); }
    if (p.weapon !== this.weapon && isWeaponId(p.weapon)) {
      // A snapshot that predates our own equip request still carries the old weapon: ignore it
      // briefly. Anything else (a purchase, a sale) is a server-driven switch we must follow.
      if (performance.now() - this.localEquipAt > EQUIP_GRACE_MS) {
        this.previousWeapon = this.weapon;
        this.weapon = p.weapon;
        this.player.weapon = this.weapon;
        this.reloading = false; this.spread = 0; this.shotIndex = 0;
        this.equipEndsAt = performance.now() + WEAPONS[this.weapon].equipMs;
        this.onEquip?.(this.weapon);
      }
    }
    this.ammo = p.ammo;
    this.reserve = p.reserve;
    // Server finished (or cancelled) a reload we thought was still running.
    if (!p.reloading && this.reloading && performance.now() > this.reloadEndsAt - 150) this.reloading = false;
  }

  /** The wallet view the slot mapping needs (owned list only). */
  private walletView(): Wallet {
    return { money: 0, owned: this.owned, lethal: "", lethalCount: 0, tactical: "", tacticalCount: 0, armor: 0, perks: noPerks() };
  }

  get primary(): WeaponId | null { return primaryOf(this.walletView()); }

  /** Keyboard slot → owned weapon; unowned slots are ignored (no primary bought yet). */
  requestSlot(slot: number, now: number): void {
    const id = weaponForSlot(this.walletView(), slot);
    if (id) this.requestWeapon(id, now);
  }

  requestWeapon(id: WeaponId, now: number): void {
    if (id === this.weapon || !this.player.alive || !this.carried.includes(id)) return;
    this.previousWeapon = this.weapon;
    this.weapon = id;
    this.shotIndex = 0;
    this.player.weapon = id;
    this.reloading = false;
    this.spread = 0;
    this.equipEndsAt = now + WEAPONS[id].equipMs;
    this.localEquipAt = now;
    this.conn.send(C2S.Equip, WEAPONS[id].slot);
    this.onEquip?.(id);
  }

  /** Q: swap back to the previously held weapon (if still carried). */
  requestLast(now: number): void {
    if (this.previousWeapon && this.previousWeapon !== this.weapon && this.carried.includes(this.previousWeapon)) this.requestWeapon(this.previousWeapon, now);
  }

  /** Wheel: cycle through the carried weapons. */
  cycle(delta: number, now: number): void {
    if (this.carried.length < 2) return;
    const idx = Math.max(0, this.carried.indexOf(this.weapon));
    const next = this.carried[(idx + (delta > 0 ? 1 : -1) + this.carried.length) % this.carried.length];
    this.requestWeapon(next, now);
  }

  /** True while an equip animation blocks firing (used to gate grenade throws too). */
  busy(now: number): boolean { return this.reloading || now < this.equipEndsAt; }

  requestReload(now: number): void {
    const w = WEAPONS[this.weapon];
    if (!usesAmmo(w) || !this.player.alive || this.reloading || this.ammo >= w.magazine || this.reserve <= 0 || now < this.equipEndsAt) return;
    this.reloading = true;
    this.reloadEndsAt = now + w.reloadMs;
    this.conn.send(C2S.Reload);
    this.onReload?.(this.weapon);
  }

  /** Current effective cone half-angle for the crosshair. */
  effectiveSpread(): number {
    const w = WEAPONS[this.weapon];
    const b = this.player.body;
    return effectiveSpread(w, this.spread, {
      moving: Math.hypot(b.vx, b.vz) > 0.5,
      airborne: !b.grounded,
      crouching: b.crouching,
      aiming: this.player.isAiming(),
    });
  }

  update(now: number, dtMs: number, fireHeld: boolean): void {
    const w = WEAPONS[this.weapon];
    if (this.spread > 0) this.spread = Math.max(0, this.spread - w.spreadRecoveryPerSec * (dtMs / 1000));
    if (this.reloading && now >= this.reloadEndsAt) {
      const take = Math.min(w.magazine - this.ammo, this.reserve);
      this.ammo += take; this.reserve -= take;
      this.reloading = false;
      this.onReloadEnd?.(this.weapon);
    }
    if (this.player.isSprinting()) this.lastSprintAt = now;
    const wantFire = fireHeld && (w.automatic || !this.triggerHeld);
    this.triggerHeld = fireHeld;
    // Frozen between waves (drop 7): the server refuses the shot anyway, but without this the
    // client still plays the flash and the report, spends a round out of its own magazine and then
    // resyncs — the player hears a gunfight in a countdown nobody can be hurt in.
    if (!wantFire || !this.player.alive || this.player.frozen) return;
    if (this.reloading || now < this.equipEndsAt) return;
    // Sprint-out: a short delay before the first shot after sprinting (the weapon comes back up).
    if (now - this.lastSprintAt < SPRINT_OUT_MS) return;
    if (now - this.lastFireAt < fireIntervalMs(w)) return;
    if (usesAmmo(w) && this.ammo <= 0) {
      if (!w.automatic || now - this.lastFireAt > 250) { this.lastFireAt = now; this.onDryFire?.(); }
      if (this.reserve > 0) this.requestReload(now);
      return;
    }
    this.fire(now, w);
  }

  private fire(now: number, w: (typeof WEAPONS)[WeaponId]): void {
    if (now - this.lastFireAt > recoilResetMs(w)) this.shotIndex = 0;
    this.lastFireAt = now;
    if (usesAmmo(w)) this.ammo -= 1;
    const origin: [number, number, number] = [0, 0, 0];
    const dir: [number, number, number] = [0, 0, 0];
    this.player.eyePosition(origin);
    this.player.aimDir(dir);
    // Handoff P1: the shot names the input it was aimed from; the game flushes pending inputs first
    // so the server already holds that seq's angles when the shot arrives.
    this.beforeFire?.();
    const msg: FireMessage = {
      seq: this.player.lastSeq, weapon: this.weapon, o: origin, d: dir,
      t: this.conn.serverNow() - this.renderDelay,
    };
    this.conn.send(C2S.Fire, msg);
    this.spread = Math.min(w.spreadMax, this.spread + w.spreadPerShot);
    const [up, side] = recoilStep(w, this.shotIndex++, Math.random, this.recoilTmp);
    this.player.addRecoil(up * (this.player.isAiming() ? 0.7 : 1), side, w.recoilRecoverPerSec, w.recoilRecoverDelayMs);
    this.onShot?.({ weapon: this.weapon, origin, dir });
    if (usesAmmo(w) && this.ammo === 0 && this.reserve > 0) this.requestReload(now + 80);
  }

  /** Interpolation delay currently used for remote players (ms); the server rewinds by this. */
  renderDelay = 0;
}
