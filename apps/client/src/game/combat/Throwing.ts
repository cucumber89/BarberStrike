import { C2S, GRENADES, THROW_INTERVAL_MS, type GrenadeId, type ThrowMessage } from "@frankibarber/shared";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/** Wind-up before the grenade leaves the hand (the arm swings), ms. Hides most of the RTT too. */
export const THROW_WINDUP_MS = 180;
/**
 * A cooked frag starts its release this long before the fuse. The wind-up (THROW_WINDUP_MS) is
 * still counted as cooking, so the grenade leaves the hand with ~270 ms left: it goes off right
 * in front of the thrower (punishing) but not in the hand (the server's in-hand rule is fuse − 50).
 */
const AUTO_RELEASE_MARGIN_MS = 450;

export interface ThrowState {
  /** Grenade in the hand (being cooked / wound up), or null. */
  kind: GrenadeId | null;
  /** 0..1 cook progress for cookable grenades (0 otherwise). */
  cook: number;
  /** ms until the grenade leaves the hand while winding up (0 when idle or still cooking). */
  windupLeft: number;
}

/**
 * Local grenade handling (drop 2). Mirrors the server's rules — a grenade must be in the slot,
 * one throw per THROW_INTERVAL_MS, the frag cooks while the key is held — and turns key
 * presses into `C2S.Throw`. The flight itself is not predicted: the server's `ThrowEvent`
 * (which includes the thrower's momentum) starts the visual on every client, our own included;
 * the wind-up animation covers the round trip.
 */
export class Throwing {
  readonly state: ThrowState = { kind: null, cook: 0, windupLeft: 0 };
  lethal: GrenadeId | "" = ""; lethalCount = 0;
  tactical: GrenadeId | "" = ""; tacticalCount = 0;
  private cookStart = -Infinity;
  private windupEndsAt = -Infinity;
  private releaseCook = 0;
  private lastThrowAt = -Infinity;
  /** Called when a grenade is taken in hand (viewmodel lowers the gun, pin sound). */
  onPrime: ((kind: GrenadeId, cookable: boolean) => void) | null = null;
  /** Called when the throw motion starts (arm swing); the grenade leaves the hand after the wind-up. */
  onThrow: ((kind: GrenadeId) => void) | null = null;
  /** Called when a primed grenade is put away without a throw (death, no grenade left). */
  onCancel: (() => void) | null = null;

  constructor(private conn: Connection, private player: LocalPlayer) {}

  syncFrom(p: NetPlayer): void {
    this.lethal = (p.lethal as GrenadeId | "") ?? ""; this.lethalCount = p.lethalCount ?? 0;
    this.tactical = (p.tactical as GrenadeId | "") ?? ""; this.tacticalCount = p.tacticalCount ?? 0;
  }

  private canStart(now: number): boolean {
    // Frozen (drop 7): the server refuses the throw anyway, but without this the client still primes
    // and COOKS the grenade through the countdown — the arm animation plays, the pin is pulled on
    // nothing, and the player is released holding a fully cooked frag they never chose to hold.
    return this.player.alive && !this.player.frozen && this.state.kind === null && now - this.lastThrowAt >= THROW_INTERVAL_MS;
  }

  /** G pressed: take the lethal grenade in hand. Cookable ones wait for the release; others go at once. */
  pressLethal(now: number): void {
    if (!this.lethal || this.lethalCount <= 0 || !this.canStart(now)) return;
    const kind = this.lethal;
    this.state.kind = kind; this.state.cook = 0;
    this.cookStart = now;
    this.onPrime?.(kind, GRENADES[kind].cookable);
    if (!GRENADES[kind].cookable) this.beginRelease(now);
  }

  /** G released: throw a cooking frag. */
  releaseLethal(now: number): void {
    if (this.state.kind && this.windupEndsAt === -Infinity) this.beginRelease(now);
  }

  /** 4 pressed: tactical grenades are never cooked — they go immediately. */
  pressTactical(now: number): void {
    if (!this.tactical || this.tacticalCount <= 0 || !this.canStart(now)) return;
    const kind = this.tactical;
    this.state.kind = kind; this.state.cook = 0;
    this.cookStart = now;
    this.onPrime?.(kind, false);
    this.beginRelease(now);
  }

  private beginRelease(now: number): void {
    const kind = this.state.kind!;
    this.releaseCook = GRENADES[kind].cookable ? Math.max(0, now - this.cookStart) : 0;
    this.windupEndsAt = now + THROW_WINDUP_MS;
    this.onThrow?.(kind);
  }

  /** Drops whatever is in the hand (death, respawn). */
  cancel(): void {
    if (this.state.kind === null) return;
    this.state.kind = null; this.state.cook = 0; this.state.windupLeft = 0;
    this.windupEndsAt = -Infinity;
    this.onCancel?.();
  }

  update(now: number): void {
    const kind = this.state.kind;
    if (!kind) return;
    if (!this.player.alive) { this.cancel(); return; }
    // `canStart` refuses to PRIME during a freeze, but nothing refused to RELEASE into one: a frag
    // cooked before the countdown auto-released at its fuse, sent a Throw the server discards, and
    // optimistically decremented the HUD count — so the player watched a grenade they still had
    // disappear from the corner of the screen. It stays in the hand until the freeze lifts.
    if (this.player.frozen) return;
    const def = GRENADES[kind];
    if (this.windupEndsAt === -Infinity) {
      // Cooking: progress towards the fuse; auto-release just before it.
      if (def.cookable) {
        const elapsed = now - this.cookStart;
        this.state.cook = Math.min(1, elapsed / def.fuseMs);
        if (elapsed >= def.fuseMs - AUTO_RELEASE_MARGIN_MS) this.beginRelease(now);
      }
      return;
    }
    this.state.windupLeft = Math.max(0, this.windupEndsAt - now);
    if (def.cookable) this.state.cook = Math.min(1, (this.releaseCook + (now - (this.windupEndsAt - THROW_WINDUP_MS))) / def.fuseMs);
    if (now < this.windupEndsAt) return;
    // Release: the grenade leaves the hand now. Cook time counts up to this instant.
    const o: [number, number, number] = [0, 0, 0];
    const d: [number, number, number] = [0, 0, 0];
    this.player.eyePosition(o);
    this.player.aimDir(d);
    // Release point: a little forward and to the right of the eye, like the viewmodel hand.
    const rx = Math.cos(this.player.yaw), rz = -Math.sin(this.player.yaw);
    o[0] += d[0] * 0.35 + rx * 0.2; o[1] += d[1] * 0.35 - 0.08; o[2] += d[2] * 0.35 + rz * 0.2;
    const cookMs = def.cookable ? Math.round(this.releaseCook + THROW_WINDUP_MS) : 0;
    const msg: ThrowMessage = { kind, o, d, cookMs };
    this.conn.send(C2S.Throw, msg);
    this.lastThrowAt = now;
    // Optimistic count so the HUD and a second press agree with the server before the snapshot.
    if (def.slot === "lethal") { this.lethalCount = Math.max(0, this.lethalCount - 1); if (this.lethalCount === 0) this.lethal = ""; }
    else { this.tacticalCount = Math.max(0, this.tacticalCount - 1); if (this.tacticalCount === 0) this.tactical = ""; }
    this.state.kind = null; this.state.cook = 0; this.state.windupLeft = 0;
    this.windupEndsAt = -Infinity;
  }
}
