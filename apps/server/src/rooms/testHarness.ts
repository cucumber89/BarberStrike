/**
 * In-process test harness for TdmRoom: a real room created through the Colyseus matchmaker
 * (LocalDriver + LocalPresence, no sockets) driven by fake clients and vitest fake timers.
 *
 * - The room's clock is `Date.now` based, so `vi.useFakeTimers()` makes the 60 Hz timestep,
 *   the 20 Hz patch interval and `allowReconnection` timeouts fully deterministic.
 * - Joins/leaves go through the real `_onJoin` / `_onLeave` plumbing (seat reservation,
 *   reconnection tokens); messages are dispatched through the real handler registry.
 * - Fake clients record every `send()` and count raw bytes (state patches) for bandwidth checks.
 */
import { EventEmitter } from "node:events";
import { ClientState, LocalDriver, LocalPresence, matchMaker, type Client } from "@colyseus/core";
import { vi } from "vitest";
import { MatchPhase, PLAYER, SPAWN_PROTECTION_MS, TICK_MS, makeRayHit, type CollisionWorld, type MapDef, type SpawnPoint, C2S } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { TdmRoom, type TdmJoinOptions } from "./TdmRoom";

export interface SentMessage { type: string; payload: unknown }

export interface FakeClient extends Client {
  sent: SentMessage[];
  rawBytes: number;
  rawFrames: number;
  /** Simulates the socket closing with the given code (1006 = abnormal, 1000/4000 = consented). */
  drop(code: number): void;
}

/** Private room members the harness reaches into (typed here instead of `any`). */
interface RoomInternals {
  _onJoin(client: Client, auth: undefined, opts?: { reconnectionToken?: string }): Promise<void>;
  onMessageEvents: { emit(type: string, ...args: unknown[]): void };
  _listing: Parameters<typeof matchMaker.reserveSeatFor>[0];
}

interface SessionLike {
  brain: { onSpawn(yaw: number): void } | null;
  respawnAt: number;
  body: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean; crouching: boolean; tac: number };
  inputs: { seq: number; dt: number }[];
  history: { t: number }[];
  ammo: Record<string, number>;
  lastSeq: number;
  lastYaw: number;
  lastPitch: number;
  bank: number;
  otherCount: number;
}

interface RoomPrivates {
  sessions: Map<string, SessionLike>;
  world: CollisionWorld;
  map: MapDef;
}

export function fakeClient(sessionId: string): FakeClient {
  const ref = new EventEmitter();
  const c = {
    sessionId, ref, state: ClientState.JOINING as ClientState, readyState: 1, reconnectionToken: "",
    sent: [] as SentMessage[], rawBytes: 0, rawFrames: 0,
    _lastMessageTime: 0, _numMessagesLastSecond: 0,
    raw(data: Uint8Array): void { c.rawBytes += data.byteLength; c.rawFrames++; },
    enqueueRaw(data: Uint8Array): void { c.raw(data); },
    send(type: string, payload?: unknown): void { c.sent.push({ type, payload }); },
    sendBytes(): void { /* noop */ },
    error(): void { /* noop */ },
    leave(code?: number): void { c.state = ClientState.LEAVING; ref.emit("close", code); },
    drop(code: number): void { ref.emit("close", code); },
  };
  return c as unknown as FakeClient;
}

let booted = false;
export async function bootMatchmaker(): Promise<void> {
  if (booted) return;
  await matchMaker.setup(new LocalPresence(), new LocalDriver());
  matchMaker.defineRoomType("tdm", TdmRoom);
  booted = true;
}

export class RoomHarness {
  readonly broadcasts: SentMessage[] = [];
  readonly clients: FakeClient[] = [];
  private constructor(readonly room: TdmRoom) {}

  /**
   * Call after `vi.useFakeTimers()` so the room's clock and intervals are fake.
   *
   * WAVES ARE OPT-IN HERE. A room ships with a 12 s live wave and a 5 s frozen preparation window,
   * but most of these tests are about damage, movement or the economy and simply advance several
   * seconds of fake time — they would cross a freeze part-way through and measure that instead of
   * what they say they measure. So the harness pins a wave longer than any test unless the test
   * asks for a real cadence, and the wave cycle has its own tests that pass the shipped numbers.
   */
  static async create(opts: TdmJoinOptions = { room: "test" }): Promise<RoomHarness> {
    await bootMatchmaker();
    const listing = await matchMaker.createRoom("tdm", opts);
    const room = matchMaker.getLocalRoomById(listing.roomId) as TdmRoom;
    const h = new RoomHarness(room);
    const orig = room.broadcast.bind(room);
    vi.spyOn(room, "broadcast").mockImplementation((type: string | number, ...args: unknown[]) => {
      h.broadcasts.push({ type: String(type), payload: args[0] });
      return orig(type, ...(args as Parameters<typeof orig> extends [unknown, ...infer R] ? R : never));
    });
    return h;
  }

  private get internals(): RoomInternals { return this.room as unknown as RoomInternals; }
  private get privates(): RoomPrivates { return this.room as unknown as RoomPrivates; }

  get state() { return this.room.state; }
  get world(): CollisionWorld { return this.privates.world; }
  get map(): MapDef { return this.privates.map; }
  player(id: string): PlayerState { const p = this.state.players.get(id); if (!p) throw new Error(`no player ${id}`); return p; }
  session(id: string): SessionLike { const s = this.privates.sessions.get(id); if (!s) throw new Error(`no session ${id}`); return s; }
  now(): number { return this.room.clock.currentTime; }

  async join(name: string): Promise<FakeClient> {
    const seat = await matchMaker.reserveSeatFor(this.internals._listing, { name });
    const client = fakeClient(seat.sessionId);
    await this.internals._onJoin(client, undefined);
    client.state = ClientState.JOINED; // the JOIN_ROOM ack a real socket would send
    this.clients.push(client);
    return client;
  }

  /** Re-attaches a dropped session using its reconnection token (what the SDK's `reconnect()` does). */
  async reconnect(previous: FakeClient): Promise<FakeClient> {
    const client = fakeClient(previous.sessionId);
    await this.internals._onJoin(client, undefined, { reconnectionToken: previous.reconnectionToken });
    client.state = ClientState.JOINED;
    const i = this.clients.indexOf(previous);
    if (i >= 0) this.clients[i] = client;
    return client;
  }

  send(client: FakeClient, type: string, payload?: unknown): void {
    this.internals.onMessageEvents.emit(type, client, payload, undefined);
  }

  /** Advances fake time; the room's 60 Hz timestep and 20 Hz patches fire along the way. */
  async advance(ms: number): Promise<void> { await vi.advanceTimersByTimeAsync(ms); }

  /** Gives the player money and buys `item` through the real shop handler (drop 2: nobody starts with a rifle). */
  async arm(client: FakeClient, item: string): Promise<void> {
    this.player(client.sessionId).money = 9000;
    this.send(client, C2S.Buy, { item });
    await this.advance(700); // past the equip animation, so the next shot is not rejected as "busy"
  }
  async tick(n = 1): Promise<void> { await this.advance(Math.ceil(TICK_MS) * n); }

  /**
   * Tick until the room is in `phase`.
   *
   * Use this instead of adding up `waveMs` and `prepMs` by hand. Three of the first drafts of the
   * wave tests were off by the hundred milliseconds spent reaching Playing in the first place, and
   * every one of them looked like a bug in the game rather than in the arithmetic.
   */
  async until(phase: MatchPhase, capMs = 120000): Promise<void> {
    const deadline = this.now() + capMs;
    while (this.state.phase !== phase && this.now() < deadline) await this.tick();
    if (this.state.phase !== phase) throw new Error(`never reached ${phase}; still in ${this.state.phase}`);
  }

  /** Wait for the currently dead, connected players using their actual individual timers. */
  async respawns(): Promise<void> {
    const dead = [...this.state.players.values()].filter(p => !p.alive && p.connected);
    const deadline = this.now() + 10000;
    while (dead.some(p => !p.alive) && this.now() < deadline) await this.tick();
    if (dead.some(p => !p.alive)) throw new Error("individual respawn did not complete");
  }
  /** Lets spawn protection lapse so damage tests are not silently absorbed. */
  async settle(): Promise<void> { await this.advance(SPAWN_PROTECTION_MS + 100); }

  /** Places a body at a spawn point facing its yaw (the last simulated aim) and syncs the replicated transform (one tick). */
  async place(id: string, sp: SpawnPoint): Promise<void> {
    const s = this.session(id);
    const b = s.body;
    b.x = sp.x; b.y = sp.y; b.z = sp.z; b.vx = b.vy = b.vz = 0; b.grounded = true; b.crouching = false;
    s.lastYaw = sp.yaw; s.lastPitch = 0;
    await this.tick();
  }

  /**
   * Finds two spawn points with line of sight within `maxDist` metres and moves attacker/victim there.
   * Returns a normalised aim direction from the attacker's eye to the victim's chest.
   */
  // ≤ 12 m: server-side spread (up to ~0.02 rad airborne) must never turn a chest shot into a miss.
  async faceOff(attackerId: string, victimId: string, maxDist = 12): Promise<{ o: [number, number, number]; d: [number, number, number]; dist: number }> {
    const hit = makeRayHit();
    const spawns = this.map.spawns;
    for (const a of spawns) {
      for (const v of spawns) {
        if (a === v) continue;
        const dx = v.x - a.x, dy = (v.y + 0.9) - (a.y + PLAYER.eyeHeight), dz = v.z - a.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 3 || dist > maxDist) continue;
        this.world.raycast(a.x, a.y + PLAYER.eyeHeight, a.z, dx / dist, dy / dist, dz / dist, dist, hit);
        if (hit.hit) continue;
        await this.place(attackerId, a);
        await this.place(victimId, v);
        // The attacker's last simulated aim IS this direction (a real client sends it as an input;
        // the server checks every shot against it — handoff P1).
        const s = this.session(attackerId);
        s.lastYaw = Math.atan2(dx, dz); s.lastPitch = -Math.asin(dy / dist);
        s.brain?.onSpawn(s.lastYaw);
        return { o: [a.x, a.y + PLAYER.eyeHeight, a.z], d: [dx / dist, dy / dist, dz / dist], dist };
      }
    }
    throw new Error("no spawn pair with line of sight");
  }

  /** A spawn point with at least `metres` of open floor straight ahead (for movement tests). */
  openRun(metres = 8): SpawnPoint {
    const hit = makeRayHit();
    for (const sp of this.map.spawns) {
      const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw);
      this.world.raycast(sp.x, sp.y + 0.9, sp.z, fx, 0, fz, metres, hit);
      if (!hit.hit) return sp;
    }
    throw new Error("no spawn with an open run");
  }

  sentOf(client: FakeClient, type: string): SentMessage[] { return client.sent.filter((m) => m.type === type); }
  broadcastsOf(type: string): SentMessage[] { return this.broadcasts.filter((m) => m.type === type); }

  async dispose(): Promise<void> {
    // Pending allowReconnection() promises resolve on the (fake) clock, so keep advancing it.
    const done = this.room.disconnect();
    await vi.advanceTimersByTimeAsync(30_000);
    await done;
  }
}
