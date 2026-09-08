import { Client, getStateCallbacks, type Room } from "@colyseus/sdk";
import { resolveServerUrl } from "./serverUrl";
import type { ArraySchema, MapSchema } from "@colyseus/schema";
import { C2S, S2C, MatchPhase, type BombData, type BotLevel, type GameMode, type WelcomeMessage } from "@frankibarber/shared";

/** Client-side mirror of the server's PlayerState schema (read-only). */
export interface NetPlayer {
  id: string; name: string; team: number;
  x: number; y: number; z: number; yaw: number; pitch: number;
  /** Quantised on the wire (task 5): yaw/pitch in 0.1 mrad, velocities in cm/s — read through dequantAngle / dequantVel. */
  vx: number; vy: number; vz: number; grounded: boolean; crouch: boolean;
  health: number; alive: boolean; weapon: string; ammo: number; reserve: number; reloading: boolean;
  protectedUntil: number;
  kills: number; deaths: number; score: number; ping: number; connected: boolean;
  money: number; owned: string[]; lethal: string; lethalCount: number; tactical: string; tacticalCount: number; spawnedAt: number;
  /** Drop 3: plate points and perk end times (server clock ms) keyed by perk id. */
  armor: number; perks: { get(id: string): number | undefined };
  /** Drop 4: lean (-1/0/1) and tactical sprint, for the third-person pose. */
  lean: number; tac: boolean;
  /** Slide (2.3): ms left and cooldown, for reconciliation and the remote pose. */
  slide: number; slideCd: number;
  /** Drop 5: scoreboard assists; server-driven bot. */
  assists: number; bot: boolean;
  /** Bomb Plant (2.2): defuse kit carried. */
  kit: boolean;
}

/** Drop 4: a Domination flag as replicated. */
export interface NetFlag { id: string; owner: number; capTeam: number; cap: number; contested: boolean }

export interface NetState {
  phase: MatchPhase; phaseEndsAt: number; matchEndsAt: number; scoreA: number; scoreB: number; winner: number; t: number;
  /** Living arena (2.4): the tactical plan in force this round, 0 = none. */
  planId: number;
  mapId: string; roomName: string;
  mode: GameMode; winnerId: string; winnerName: string;
  flags: ArraySchema<NetFlag>;
  bomb: BombData;
  players: MapSchema<NetPlayer>;
}

export interface ConnectOptions {
  url: string;
  name: string;
  roomName?: string;
  /** "create" forces a new room; "join" only joins an existing room by id; default joinOrCreate. */
  mode?: "auto" | "create" | "join";
  roomId?: string;
  /** Drop 4: game mode for quick play / create (ignored when joining by id). */
  gameMode?: GameMode;
  /** Drop 5: bots added when a room is created (quick play / create). */
  bots?: number;
  botLevel?: BotLevel;
}

export interface RoomListing { roomId: string; clients: number; maxClients: number; metadata?: { name?: string; map?: string; mode?: GameMode; bots?: number } }

/**
 * Wraps the Colyseus room: connection lifecycle, server-time estimation and typed messaging.
 * Server time is estimated from the welcome timestamp and refined with periodic pings.
 */
type MsgHandler = { type: string; cb: (payload: unknown) => void };

export class Connection {
  room: Room<NetState>;
  readonly sessionId: string;
  private url: string;
  private msgHandlers: MsgHandler[] = [];
  private stateHandlers: ((state: NetState) => void)[] = [];
  private playerHandlers: { onAdd: (p: NetPlayer, id: string) => void; onRemove: (p: NetPlayer, id: string) => void }[] = [];
  private leaveHandlers: ((code: number) => void)[] = [];
  private errorHandlers: ((code: number, message?: string) => void)[] = [];
  private unbind: (() => void)[] = [];
  private offset = 0; // serverTime - performance.now()
  private offsetInitialised = false;
  rtt = 0;
  /** Last input seq the server has simulated for us (S2C.Ack, sent right before each patch; task 5). */
  ack = 0;
  private pingTimer: number | null = null;
  private pingSentAt = 0;
  private pingStamp = 0;
  private disposed = false;

  private constructor(room: Room<NetState>, url: string) {
    this.room = room;
    this.url = url;
    this.sessionId = room.sessionId;
    this.bindRoom(room);
  }

  /** Attaches the wildcard + pong handlers and every registered game handler to a (new) room. */
  private bindRoom(room: Room<NetState>): void {
    for (const u of this.unbind) u();
    this.unbind = [];
    // Events can arrive before the game wires its handlers (e.g. our own spawn); a wildcard
    // handler keeps the SDK from warning about them.
    this.unbind.push(room.onMessage("*", () => {}));
    this.unbind.push(room.onMessage<{ c: number; s: number }>(S2C.Pong, (msg) => this.onPong(msg)));
    this.unbind.push(room.onMessage<number>(S2C.Ack, (seq) => { if (typeof seq === "number" && seq >= this.ack) this.ack = seq; }));
    for (const h of this.msgHandlers) this.unbind.push(room.onMessage(h.type, h.cb));
    for (const cb of this.stateHandlers) room.onStateChange(cb);
    if (this.playerHandlers.length) {
      const $ = getStateCallbacks(room);
      for (const h of this.playerHandlers) {
        $(room.state).players.onAdd((p: NetPlayer, id: string) => h.onAdd(p, id));
        $(room.state).players.onRemove((p: NetPlayer, id: string) => h.onRemove(p, id));
      }
    }
    room.onLeave((code) => this.handleLeave(code));
    room.onError((code, message) => { for (const h of this.errorHandlers) h(code, message); });
  }

  /**
   * Unexpected drop: try to resume the same session (the server keeps the player for a grace
   * period). Consented leaves (1000) and reconnect failures propagate to the game.
   */
  private async handleLeave(code: number): Promise<void> {
    if (this.disposed) return;
    if (code === 1000 || code === 4000) { for (const h of this.leaveHandlers) h(code); return; }
    this.reconnecting = true;
    for (const cb of this.reconnectHandlers) cb(true);
    const token = this.room.reconnectionToken;
    const client = new Client(this.url);
    for (let attempt = 0; attempt < 4 && !this.disposed; attempt++) {
      try {
        const room = await client.reconnect<NetState>(token);
        this.room = room;
        this.bindRoom(room);
        this.reconnecting = false;
        for (const cb of this.reconnectHandlers) cb(false);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    this.reconnecting = false;
    for (const h of this.leaveHandlers) h(code);
  }

  reconnecting = false;
  private reconnectHandlers: ((active: boolean) => void)[] = [];
  onReconnecting(cb: (active: boolean) => void): void { this.reconnectHandlers.push(cb); }

  /** 2.1: the server's health line, for the menu. Resolves `ok: false` rather than throwing. */
  static async health(url: string): Promise<{ ok: boolean; version?: string; players?: number; rooms?: number }> {
    try {
      const ctl = new AbortController();
      const t = window.setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(`${httpUrl(url)}/health`, { signal: ctl.signal });
      window.clearTimeout(t);
      if (!res.ok) return { ok: false };
      const j = (await res.json()) as { ok?: boolean; version?: string; players?: number; rooms?: number };
      return { ok: j.ok === true, version: j.version, players: j.players, rooms: j.rooms };
    } catch {
      return { ok: false };
    }
  }

  static async listRooms(url: string): Promise<RoomListing[]> {
    const res = await fetch(`${httpUrl(url)}/rooms`);
    if (!res.ok) throw new Error(`rooms: ${res.status}`);
    return (await res.json()) as RoomListing[];
  }

  static async connect(opts: ConnectOptions): Promise<Connection> {
    const client = new Client(opts.url);
    const joinOpts = { name: opts.name, room: opts.roomName ?? "", mode: opts.gameMode ?? "tdm", bots: opts.bots ?? 0, botLevel: opts.botLevel ?? "normal" };
    let room: Room<NetState>;
    if (opts.mode === "create") room = await client.create<NetState>("tdm", joinOpts);
    else if (opts.mode === "join" && opts.roomId) room = await client.joinById<NetState>(opts.roomId, joinOpts);
    else room = await client.joinOrCreate<NetState>("tdm", joinOpts);
    const conn = new Connection(room, opts.url);
    await conn.awaitWelcome();
    conn.startPing();
    return conn;
  }

  private awaitWelcome(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Server did not respond (welcome timeout).")), 8000);
      const off = this.room.onMessage<WelcomeMessage>(S2C.Welcome, (msg) => {
        window.clearTimeout(timeout);
        this.offset = msg.serverTime - performance.now();
        this.offsetInitialised = true;
        off();
        resolve();
      });
    });
  }

  private startPing(): void {
    const tick = () => {
      if (this.disposed) return;
      this.pingStamp = performance.now();
      this.pingSentAt = this.pingStamp;
      this.room.send(C2S.Ping, { c: this.pingStamp, rtt: Math.round(this.rtt) });
    };
    tick();
    this.pingTimer = window.setInterval(tick, 1500);
  }

  private onPong(msg: { c: number; s: number }): void {
    if (msg.c !== this.pingStamp) return;
    const now = performance.now();
    const rtt = now - this.pingSentAt;
    this.rtt = this.rtt === 0 ? rtt : this.rtt * 0.7 + rtt * 0.3;
    const estimate = msg.s + rtt / 2 - now;
    // Smooth the offset; large corrections (first samples) snap.
    this.offset = this.offsetInitialised && Math.abs(estimate - this.offset) < 200 ? this.offset * 0.85 + estimate * 0.15 : estimate;
    this.offsetInitialised = true;
  }

  /** Estimated current server time (ms, server clock). */
  serverNow(): number {
    return performance.now() + this.offset;
  }

  get state(): NetState { return this.room.state; }

  me(): NetPlayer | undefined { return this.room.state.players.get(this.sessionId); }

  onMessage<T>(type: string, cb: (payload: T) => void): () => void {
    const h: MsgHandler = { type, cb: cb as (payload: unknown) => void };
    this.msgHandlers.push(h);
    const off = this.room.onMessage<T>(type, cb);
    this.unbind.push(off);
    return () => { off(); this.msgHandlers = this.msgHandlers.filter((x) => x !== h); };
  }

  send(type: string, payload?: unknown): void {
    if (this.disposed) return;
    this.room.send(type, payload);
  }

  onStateChange(cb: (state: NetState) => void): void {
    this.stateHandlers.push(cb);
    this.room.onStateChange(cb);
  }

  onPlayers(onAdd: (p: NetPlayer, id: string) => void, onRemove: (p: NetPlayer, id: string) => void): void {
    this.playerHandlers.push({ onAdd, onRemove });
    const $ = getStateCallbacks(this.room);
    $(this.room.state).players.onAdd((p: NetPlayer, id: string) => onAdd(p, id));
    $(this.room.state).players.onRemove((p: NetPlayer, id: string) => onRemove(p, id));
  }

  /** Called when the session is gone for good (consented leave, or reconnection failed). */
  onLeave(cb: (code: number) => void): void { this.leaveHandlers.push(cb); }

  onError(cb: (code: number, message?: string) => void): void { this.errorHandlers.push(cb); }

  async leave(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    try { await this.room.leave(true); } catch { /* already closed */ }
  }
}

/** ws(s):// → http(s):// for the REST endpoints next to the WebSocket server. */
export function httpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws/, "http").replace(/\/$/, "");
}

/** The server endpoint for this page — see `serverUrl.ts` for the three cases. */
export function defaultServerUrl(): string {
  return resolveServerUrl(location, import.meta.env.VITE_SERVER_URL as string | undefined, import.meta.env.DEV);
}
