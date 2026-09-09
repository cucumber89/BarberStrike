import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LEAN, PERK_ORDER, PLAYER, dequantAngle, dequantVel, lerp, lerpAngle, type Team, type WeaponId } from "@frankibarber/shared";
import type { NetPlayer } from "../net/Connection";
import { Character, type CharacterLike } from "../view/Character";

interface Snapshot {
  t: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  crouch: boolean; alive: boolean;
  vx: number; vz: number; grounded: boolean;
  reloading: boolean; weapon: WeaponId;
  /** Latest perk end time (server ms) — any active perk lights the hat band. */
  perkUntil: number;
  /** Drop 4: lean (-1/0/1) and tactical sprint. */
  lean: number; tac: boolean;
  /** Drop D: a shaved head (Ostrzyżeni's shaved side). Replicated per player, like a skin id. */
  shaved: boolean;
  /** Drop E: the haircut field, carried per snapshot so an equip or a shave lands on the next one. */
  haircut: string;
}

const SNAP_BUFFER = 16;
/**
 * How long a remote may be carried past its newest snapshot, and how far.
 *
 * At 20 Hz with a 110 ms interpolation delay the buffer normally holds two snapshots ahead of render
 * time. Lose one packet and render time walks off the end of the buffer: the old code clamped the
 * interpolation factor at 1, so the remote FROZE where it stood and then jumped when the next
 * snapshot landed — a hitch on every dropped packet, on the thing players are aiming at.
 *
 * Carrying them on at their last known velocity is a guess, so it is made a cheap one: the velocity
 * fades to nothing across the window, which reads as a player slowing to a stop rather than sliding,
 * and the whole excursion is capped in metres so a guess can never put a body somewhere absurd. Only
 * the horizontal velocity is replicated, so height is held — a falling remote pauses mid-air for a
 * frame rather than being launched through a floor.
 *
 * Presentation only. Nothing here is used for a hit test; the server decides those.
 */
const EXTRAPOLATE_MS = 120;
const EXTRAPOLATE_MAX_M = 0.75;
/**
 * Past this, the gap is not a lost packet and a guess is not information: hold position instead.
 *
 * Two cases need this. A server hiccup or a lost connection should freeze a body where it was, not
 * slide it — the old behaviour, and the right one. And a remote's FIRST snapshot is stamped `t = 0`
 * by the constructor, so on the frame it is created render time is a server clock ahead of it by
 * years; without this test a player who joins while someone is running would see them appear three
 * quarters of a metre from where they are.
 */
const EXTRAPOLATE_MAX_GAP_MS = 250;
/** Snapshots older than this behind render time cannot be the right answer for anything. */
const MAX_SNAP_AGE_MS = 400;

/**
 * How a remote player's body gets built (drop 6b). The default is the procedural `Character`;
 * `Game` swaps in one that returns a `CharacterModel` when the manifest lists a rigged glTF and it
 * loaded. Injected rather than looked up so the choice is made ONCE, at start-up, and a player who
 * joins mid-match cannot end up with a different body from everyone else.
 */
export type CharacterFactory = (scene: Scene, team: Team, id: string) => CharacterLike;

/**
 * Another player: snapshot interpolation (INTERP_DELAY_MS behind the newest server time) driving
 * a procedural articulated character. Presentation only — never used for hit tests.
 */
export class RemotePlayer {
  readonly id: string;
  name: string;
  team: Team;
  alive = true;
  private snaps: Snapshot[] = [];
  private pool: Snapshot[] = [];
  readonly character: CharacterLike;
  /** Interpolated state exposed to VFX/audio (muzzle position etc). */
  x = 0; y = 0; z = 0; yaw = 0; pitch = 0; crouch = false; speed = 0; grounded = true;
  vx = 0; vz = 0; reloading = false; weapon: WeaponId = "pistol";
  lean = 0; tac = false;
  private wasAlive = true;
  private skinsValue = "";
  private input = { speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "pistol" as WeaponId, moveDir: 0, perked: false, lean: 0, tac: false, shaved: false, haircut: "" };

  /**
   * `displayTeam` (drop 4) is the side this player is DRAWN as: in FFA everyone is on team 0 for
   * the server, but every remote is an enemy for us, so they wear the other colour and get no plate.
   */
  constructor(scene: Scene, p: NetPlayer, displayTeam: Team = p.team as Team, make?: CharacterFactory) {
    this.id = p.id;
    this.name = p.name;
    this.team = displayTeam;
    this.character = (make ?? ((s, t, i) => new Character(s, t, i)))(scene, this.team, p.id);
    this.pushFrom(p, 0);
    this.x = p.x; this.y = p.y; this.z = p.z; this.yaw = dequantAngle(p.yaw);
    this.character.root.position.set(p.x, p.y, p.z);
    this.character.root.rotation.y = this.yaw;
  }

  get root() { return this.character.root; }

  pushFrom(p: NetPlayer, t: number): void {
    const skins = p.skins ?? "";
    if (skins !== this.skinsValue) {
      this.skinsValue = skins;
      void this.character.applySkins?.(decodeSkins(skins));
    }
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.t === t) { this.fill(last, p, t); return; }
    const s = this.pool.pop() ?? ({} as Snapshot);
    this.fill(s, p, t);
    this.snaps.push(s);
    if (this.snaps.length > SNAP_BUFFER) this.pool.push(this.snaps.shift()!);
    this.name = p.name;
  }

  private fill(s: Snapshot, p: NetPlayer, t: number): void {
    s.t = t; s.x = p.x; s.y = p.y; s.z = p.z; s.yaw = dequantAngle(p.yaw); s.pitch = dequantAngle(p.pitch);
    s.crouch = p.crouch; s.alive = p.alive; s.vx = dequantVel(p.vx); s.vz = dequantVel(p.vz); s.grounded = p.grounded;
    s.reloading = p.reloading; s.weapon = p.weapon as WeaponId;
    let until = 0;
    for (const id of PERK_ORDER) { const u = p.perks?.get(id) ?? 0; if (u > until) until = u; }
    s.perkUntil = until;
    s.lean = p.lean ?? 0; s.tac = !!p.tac;
    s.shaved = !!p.shaved;
    s.haircut = p.haircut ?? "";
  }

  /** Teleport (spawn): rewrite the buffer so we don't interpolate across the map. */
  snapTo(x: number, y: number, z: number, yaw: number): void {
    for (const s of this.snaps) { s.x = x; s.y = y; s.z = z; s.yaw = yaw; s.alive = true; }
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.character.root.position.set(x, y, z);
    this.character.revive();
    this.character.setEnabled(true);
    this.alive = true; this.wasAlive = true;
  }

  onShot(): void { this.character.onFire(); }

  /** Interpolates presentation to `renderT` (server-clock ms) and animates the character. */
  update(renderT: number, dtMs: number): void {
    // Drop snapshots that cannot be the answer to any render time from here on. Without this the
    // buffer holds 800 ms of history, and a backwards step in the clock offset would render a body
    // where it stood most of a second ago.
    while (this.snaps.length > 2 && renderT - this.snaps[0].t > MAX_SNAP_AGE_MS) this.pool.push(this.snaps.shift()!);
    const n = this.snaps.length;
    if (n === 0) return;
    let a = this.snaps[0], b = this.snaps[n - 1];
    let ahead = 0;
    if (renderT <= a.t) b = a;
    else if (renderT >= b.t) { a = b; ahead = renderT - b.t; }
    else {
      for (let i = n - 1; i > 0; i--) {
        if (this.snaps[i - 1].t <= renderT) { a = this.snaps[i - 1]; b = this.snaps[i]; break; }
      }
    }
    const span = b.t - a.t;
    const f = span > 0 ? Math.max(0, Math.min(1, (renderT - a.t) / span)) : 1;
    this.x = lerp(a.x, b.x, f); this.y = lerp(a.y, b.y, f); this.z = lerp(a.z, b.z, f);
    this.yaw = lerpAngle(a.yaw, b.yaw, f); this.pitch = lerp(a.pitch, b.pitch, f);
    this.vx = lerp(a.vx, b.vx, f); this.vz = lerp(a.vz, b.vz, f);
    // Past the newest snapshot: carry on at the last velocity, fading it out (see EXTRAPOLATE_MS).
    if (ahead > 0 && ahead <= EXTRAPOLATE_MAX_GAP_MS && b.alive && (b.vx !== 0 || b.vz !== 0)) {
      const w = Math.min(ahead, EXTRAPOLATE_MS) / 1000;
      const fade = 1 - Math.min(1, ahead / EXTRAPOLATE_MS) / 2; // mean speed over the fade
      let dx = b.vx * w * fade, dz = b.vz * w * fade;
      const d = Math.hypot(dx, dz);
      if (d > EXTRAPOLATE_MAX_M) { const k = EXTRAPOLATE_MAX_M / d; dx *= k; dz *= k; }
      this.x += dx; this.z += dz;
    }
    // Pose flags are discrete, so they belong to the snapshot we are NEAREST to. Taking them from
    // the newer one started the crouch up to a snapshot before the body began to move with it.
    const pose = f < 0.5 ? a : b;
    this.crouch = pose.crouch; this.grounded = pose.grounded; this.lean = pose.lean; this.tac = pose.tac;
    // These three are events in disguise (a reload started, a weapon came up, a player died); being
    // early with them costs nothing and being late shows a gun firing that is no longer held.
    this.reloading = b.reloading; this.weapon = b.weapon;
    this.speed = Math.hypot(this.vx, this.vz);
    this.alive = b.alive;

    const c = this.character;
    c.root.position.set(this.x, this.y, this.z);
    c.root.rotation.y = this.yaw;
    if (this.wasAlive && !this.alive) c.die();
    if (!this.wasAlive && this.alive) { c.revive(); c.setEnabled(true); }
    this.wasAlive = this.alive;

    const inp = this.input;
    inp.speed = this.speed; inp.grounded = this.grounded; inp.crouch = this.crouch; inp.pitch = this.pitch;
    inp.alive = this.alive; inp.reloading = this.reloading; inp.weapon = this.weapon;
    inp.perked = b.perkUntil > renderT;
    inp.lean = this.lean; inp.tac = this.tac;
    inp.shaved = b.shaved;
    inp.haircut = b.haircut;
    // Direction of travel relative to facing (for the strafe lean).
    inp.moveDir = this.speed > 0.3 ? Math.atan2(this.vx, this.vz) - this.yaw : 0;
    c.update(inp, dtMs);
  }

  /** World-space muzzle position of the held weapon. */
  muzzle(out: Vector3): Vector3 {
    if (!this.alive) { out.set(this.x, this.y + PLAYER.eyeHeight * 0.8, this.z); return out; }
    return this.character.muzzle(out);
  }

  /** Approximate eye position (for nameplates / audio), shifted by the lean. */
  eye(out: Vector3): Vector3 {
    const side = LEAN.offset * this.lean;
    out.set(this.x + Math.cos(this.yaw) * side, this.y + (this.crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight) - LEAN.drop * Math.abs(this.lean), this.z - Math.sin(this.yaw) * side);
    return out;
  }

  dispose(): void {
    this.character.dispose();
  }
}
import { decodeSkins } from "@frankibarber/shared";
