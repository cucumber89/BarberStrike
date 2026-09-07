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
  /** Slide (2.3). */
  slide: boolean;
}

const SNAP_BUFFER = 16;

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
  private input = { speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: "pistol" as WeaponId, moveDir: 0, perked: false, lean: 0, tac: false, bomb: false, slide: false };
  /** Bomb Plant (2.2): set by the game each frame from the replicated carrier id. */
  carrying = false;

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
    s.lean = p.lean ?? 0; s.tac = !!p.tac; s.slide = (p.slide ?? 0) > 0;
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
    const n = this.snaps.length;
    if (n === 0) return;
    let a = this.snaps[0], b = this.snaps[n - 1];
    if (renderT <= a.t) b = a;
    else if (renderT >= b.t) a = b;
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
    this.crouch = b.crouch; this.grounded = b.grounded; this.reloading = b.reloading; this.weapon = b.weapon;
    this.lean = b.lean; this.tac = b.tac;
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
    inp.lean = this.lean; inp.tac = this.tac; inp.bomb = this.carrying; inp.slide = b.slide;
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
