import { Room, type Client } from "@colyseus/core";
import {
  Btn, C2S, S2C, DEFAULT_WEAPON, HEADSHOT_MULTIPLIER, LAG_COMP_MAX_MS, MATCH, MAX_INPUT_BATCH, MAX_INPUT_DT_MS,
  MAX_INPUT_QUEUE, MAX_INPUT_RATE, MAX_OTHER_MSG_RATE, MAX_PLAYERS, MatchPhase, NIGHT_DISTRICT, PLAYER,
  RESPAWN_DELAY_MS, SNAPSHOT_MS, SPAWN_PROTECTION_MS, TICK_MS, WEAPONS, WEAPON_ORDER,
  isLive, isFrozen, maskInput, smokeBlocks, MAX_SMOKE_CLOUDS, type SmokeCloud,
  BOMB, BOMB_SITES, KIT_ITEM, bombAttackTeam, dropBomb, blastDamage, resetBomb, stepBomb, type BombPlayer,
  createBody, quantAngle, quantVel, effectiveSpread, fireIntervalMs, isFiniteNumber, isVec3, isWeaponId, aimDirection,
  makeRayHit, mulberry32, pickSpawn, sanitizeName, simulateBody, spreadDirection, traceBullet, unpackInput,
  ECONOMY, GRENADES, THROW_INTERVAL_MS, FIRE_DPS, applyBuy, applySell, buyWindowOpen, giveGrenade, takeGrenade, killReward, weaponForSlot,
  primaryOf, isShopItemId, isGrenadeId, createProjectile, stepProjectile, explosionDamage, flashStrength, flashMs, eyeOf,
  rayBox, targetBox, freshWallet, secondaryOf, sprintActive, usesAmmo, isBackstab, MELEE, PERK_EFFECT, PERK_ORDER, noPerks, perkActive,
  perkSpeedScale, splitDamage, isPerkId, isArmorId,
  BTN_MASK, DOM, MODES, isGameMode, leanOf, tacActive, leanEye, inFlagZone, stepFlag, domTick, neutralFlag,
  CHAT, MARK, MAX_BOTS, BOT_NAMES, botId, isBotLevel,
  GUN_GAME, MELEE_WEAPON, ladderAfterKill, ladderDone, ladderWeapon,
  OSTRZYZENI, PERK_ARMED_MS, convertsOnKill, infectionRoundWinner, pickFirstShaved,
  type BodyState, type CollisionWorld, type DamagedEvent, type FireMessage, type HitEvent, type InputTuple, type KillEvent,
  type MapDef, type PlayerInput, type ShotEvent, type SpawnEvent, type Target, type Team, type WeaponId, type WelcomeMessage,
  type Projectile, type Wallet, type ThrowMessage, type ThrowEvent, type BoomEvent, type FlashedEvent, type MoneyEvent,
  type ShopResult, type GrenadeId, type Box, type BuyContext, type PerkTimes, type GameMode, type FlagSim, type FlagEvent,
  type MatchEventMessage, type BotLevel, type ChatEvent, type MarkEvent, type MarkKind, type Walk, type NavPoint, type ShopItemId,
} from "@frankibarber/shared";
import { FlagState, MatchState, PlayerState } from "../schema";
import { nextPhase, teamForNewPlayer } from "../match";
import { sharedCollisionWorld, sharedWalk } from "./sharedWorld";
import { recordTick } from "../stats";
import { BotBrain, type BotSenses, type BotView } from "../bots/BotBrain";

interface HistoryEntry { t: number; x: number; y: number; z: number; crouching: boolean }

/** Lag-comp history length in ticks (30 ticks @ 60 Hz = 500 ms > LAG_COMP_MAX_MS). */
const HISTORY_LEN = 30;
/** Seconds a dropped (non-consented) client may reconnect before its player is removed. */
const RECONNECT_GRACE_S = 15;
/** Input `seq` travels back as a uint32 ack (S2C.Ack); anything beyond cannot be acknowledged. */
const MAX_SEQ = 0xffffffff;

const isInputTuple = (t: unknown): t is InputTuple =>
  Array.isArray(t) && t.length === 5 && t.every(isFiniteNumber);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isFireMessage = (v: unknown): v is FireMessage =>
  isRecord(v) && isWeaponId(v.weapon) && isVec3(v.o) && isVec3(v.d) && isFiniteNumber(v.t);

/** Server-private per-player data (never replicated). */
class Session {
  body: BodyState = createBody();
  inputs: PlayerInput[] = [];
  prevButtons = 0;
  /**
   * Which tick of the rotation this bot may run a path search on. Every bot gets its own, so no
   * frame ever carries more than one search — MEASURED before this: all eight bots planned on the
   * same tick at the start of a round, 118 ms of work in a 16.7 ms frame, once per round, felt by
   * everyone in the room. Waiting up to MAX_BOTS ticks (133 ms) for a route costs nothing: a bot
   * re-plans about once every fifteen seconds.
   */
  planPhase = 0;
  /**
   * Last input seq simulated for this player, and the last one told to them (task 5). The ack used
   * to be a replicated field, i.e. every player's reconciliation number went to every client 20
   * times a second; now it goes to its owner alone, right before the patch it belongs to
   * (`onBeforePatch`), so the client pairs it with the same state it always did.
   */
  ack = 0;
  ackSent = -1;
  /**
   * Line-of-sight results per enemy id (performance pass, task 2): a full-world raycast per enemy
   * in the cone per bot per tick was the single largest bot cost (worst case 88 raycasts a tick).
   * A bot's reaction time is ≥ 150 ms, so a result held for three ticks (50 ms), refreshed on this
   * bot's own tick of the rotation, changes nothing a player can see.
   */
  losCache = new Map<string, { tick: number; ok: boolean }>();
  /** Time bank (ms) the client may spend on inputs; refilled by the server tick. Anti speed-hack. */
  bank = 0;
  lastYaw = 0;
  lastPitch = 0;
  ammo = Object.fromEntries(WEAPON_ORDER.map((w) => [w, 0])) as Record<WeaponId, number>;
  reserve = Object.fromEntries(WEAPON_ORDER.map((w) => [w, 0])) as Record<WeaponId, number>;
  reloadEndsAt = 0;
  equipEndsAt = 0;
  lastFireAt = 0;
  spread = 0;
  shotSeed = 1;
  history: HistoryEntry[] = [];
  respawnAt = 0;
  msgWindowStart = 0;
  inputCount = 0;
  otherCount = 0;
  lastKilledBy = "";
  /** Highest input seq accepted so far; anything <= this is a replay / reorder and is ignored (ack never goes backwards). */
  lastSeq = 0;
  // ---- drop 2: economy + grenades
  spawnedAt = 0;
  lastThrowAt = 0;
  /** Damage taken per attacker (for assists), cleared on spawn. */
  damagedBy = new Map<string, { amount: number; at: number }>();
  /** Fractional burn damage accumulated from fire areas. */
  burnAcc = 0;
  // ---- drop 3: perks
  lastDamageAt = -Infinity;
  blindedUntil = 0;
  objectiveUntil = 0;
  /** Fractional health regenerated by the roids perk. */
  regenAcc = 0;
  /** A fade was armed at death: the next spawn gets the long shield. */
  fadeShield = false;
  // ---- drop 4: lean / tactical sprint from the last simulated input; scratch eye for origin checks.
  lean: -1 | 0 | 1 = 0;
  tac = false;
  eye: [number, number, number] = [0, 0, 0];
  // ---- drop D: Gun Game. The rung is private; it is replicated as `PlayerState.score` (in this
  // mode the score IS the rung), so the HUD and the scoreboard need no new field.
  rung = 0;
  // ---- drop 5: chat / mark rate limits; the brain for a bot session.
  lastChatAt = -Infinity;
  lastMarkAt = -Infinity;
  brain: BotBrain | null = null;
  // ---- handoff P1: Fire packets per second, and the view angles of the last accepted inputs by seq
  // (a ring: index = seq & (ANGLE_RING - 1)) so a shot can be checked against the aim it claims.
  fireCount = 0;
  angleSeq = new Uint32Array(ANGLE_RING);
  angleYaw = new Float64Array(ANGLE_RING);
  anglePitch = new Float64Array(ANGLE_RING);
}

const ANGLE_RING = 256;
/** Fire messages per second before they are dropped unread (an LMG needs ~15, the SMG2 ~17). */
const MAX_FIRE_MSG_RATE = 25;
/** Max angle (rad) between a shot's direction and the aim of the input it names; wider when the seq is unknown. */
const FIRE_DIR_TOLERANCE = 0.06;
const FIRE_DIR_TOLERANCE_NO_SEQ = 0.35;
const refDir: [number, number, number] = [0, 0, 0];

interface FireArea { x: number; y: number; z: number; until: number; owner: string; radius: number }

const isThrowMessage = (v: unknown): v is ThrowMessage =>
  isRecord(v) && isGrenadeId(v.kind) && isVec3(v.o) && isVec3(v.d) && isFiniteNumber(v.cookMs);
const boxTmp: Box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

export interface TdmJoinOptions {
  name?: string; room?: string; mode?: string; bots?: number; botLevel?: string; seed?: number;
}

const isChatMessage = (v: unknown): v is { text: string; team: boolean } => isRecord(v) && typeof v.text === "string";
const isMarkMessage = (v: unknown): v is { x: number; y: number; z: number; kind: MarkKind; target?: string } =>
  isRecord(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z) && (v.kind === "go" || v.kind === "spot") && (v.target === undefined || typeof v.target === "string");
/** Chat text: printable characters only, collapsed whitespace, capped. */
const sanitizeChat = (raw: string): string => raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, CHAT.maxLen);

const DEV_TOOLS = process.env.FB_DEV_TOOLS === "1";
/** Dev-only bandwidth counter: logs outgoing bytes/s (patches + messages) every 5 s. */
const NET_STATS = process.env.FB_NET_STATS === "1";
const pelletDir: [number, number, number] = [0, 0, 0];
/** Ticks a bot's line-of-sight verdict on an enemy is reused (task 2). */
const LOS_CACHE_TICKS = 3;
const NO_HAZARDS: { x: number; y: number; z: number; radius: number }[] = [];
const worldHit = makeRayHit();

export class TdmRoom extends Room<{ state: MatchState; metadata: { room: string; mode: GameMode; name: string; map: string; bots: number } }> {
  override maxClients = MAX_PLAYERS;
  override state = new MatchState();

  private map: MapDef = NIGHT_DISTRICT;
  // Shared across rooms (performance pass, task 1): see sharedWorld.ts.
  private world: CollisionWorld = sharedCollisionWorld();
  private sessions = new Map<string, Session>();
  /**
   * Players with `connected` set, kept as a count (task 6): `updatePhase` asked for it every tick
   * with an array allocation and a filter over every player. Maintained at the four places the
   * flag changes; `connectedPlayers` exposes it for tests.
   */
  private connectedCount = 0;
  get connectedPlayers(): number { return this.connectedCount; }
  private accumulator = 0;
  private rand = mulberry32(Date.now() & 0xffffffff);
  private projectiles: Projectile[] = [];
  private fires: FireArea[] = [];
  private smokes: SmokeCloud[] = [];
  private nextProjectileId = 1;
  private bombLosses = [0, 0];
  // ---- drop 4: mode + Domination flags (the schema mirrors `flagSims` every tick).
  private mode: GameMode = "tdm";
  private flagSims: FlagSim[] = [];
  private nextDomTickAt = 0;
  // ---- drop 5: bots share one walk grid (built once, ~200 ms) and roam the spawn points + flags.
  private walk: Walk | null = null;
  private botLevel: BotLevel = "normal";
  private botCount = 0;
  /** Rotation counter for the bots' path-search permission; see `Session.planPhase`. */
  private navTick = 0;
  private roamPoints: NavPoint[] = [];
  private senseEnemies: BotView[] = [];

  /** Team modes (TDM, Domination) keep friendly fire off and score per team; FFA does neither. */
  private get teams(): boolean { return MODES[this.mode].teams; }
  /** Drop D: Gun Game — the loadout is the ladder rung, kills move rungs, nothing is for sale. */
  private get ladder(): boolean { return this.mode === "gungame"; }
  /** Drop D: a mode without an economy pays nobody and sells nothing. */
  private get noShop(): boolean { return MODES[this.mode].shop === "none"; }
  /**
   * Drop D: Ostrzyżeni (infection) — rounds like Bomb Plant, sides that reuse the teams (survivors
   * = `OSTRZYZENI.survivorTeam`, the shaved = `OSTRZYZENI.shavedTeam`), one random chaser per round,
   * a clippers kill converts. The round counter is `state.bomb.round`: it is the only replicated
   * round number and the HUD already reads it; nothing else in `bomb` is touched by this mode.
   */
  private get infection(): boolean { return this.mode === "ostrzyzeni"; }
  /** Which Prep an infection round is in: the buy window before the round, or the break after it. */
  private infectionStage: "buy" | "break" = "buy";
  /**
   * How long a casualty waits. Gun Game has its own short timer (a party mode: no waves, no shop to
   * spend the wait in) and no perks, so the fade never applies there. A shaved chaser (infection)
   * is back on a short timer too; an unshaved survivor is not respawned by the timer at all during a
   * round (see `step`), so their value only matters in the warm-up.
   */
  private respawnDelay(p: PlayerState, fade = false): number {
    if (this.ladder) return GUN_GAME.respawnMs;
    if (this.infection && p.shaved) return OSTRZYZENI.shavedRespawnMs;
    return RESPAWN_DELAY_MS - (fade ? PERK_EFFECT.fadeRespawnMs : 0);
  }

  override onCreate(options: TdmJoinOptions): void {
    this.state.mapId = this.map.id;
    this.state.roomName = typeof options?.room === "string" ? options.room.slice(0, 24) : "";
    this.mode = isGameMode(options?.mode) ? options.mode : "tdm";
    this.state.mode = this.mode;
    if (this.mode === "dom") {
      for (const f of this.map.flags) { const fs = new FlagState(); fs.id = f.id; this.state.flags.push(fs); this.flagSims.push(neutralFlag()); }
    }
    // Drop 5: bots requested at creation (clamped so humans always have room), with a difficulty.
    const wantBots = isFiniteNumber(options?.bots) ? Math.max(0, Math.min(MAX_BOTS, Math.round(options.bots))) : 0;
    this.botCount = Math.min(wantBots, MAX_PLAYERS - 2);
    // Bots take seats: 12 is the room, not the human count (task 6). Was 12 humans + bots.
    this.maxClients = MAX_PLAYERS - this.botCount;
    this.botLevel = isBotLevel(options?.botLevel) ? options.botLevel : "normal";
    // Tests and tooling may pin the room's PRNG (spawn picks, pellets, bot aim); never in production.
    if ((DEV_TOOLS || process.env.NODE_ENV === "test") && isFiniteNumber(options?.seed)) this.rand = mulberry32(options.seed >>> 0);
    // `room` and `mode` must stay in metadata: the matchmaker filterBy(["room", "mode"]) matches against them.
    this.setMetadata({ room: this.state.roomName, mode: this.mode, name: this.state.roomName, map: this.map.name, bots: this.botCount });
    this.patchRate = SNAPSHOT_MS;
    this.setTimestep((dt) => this.tick(dt), TICK_MS);
    this.onMessage(C2S.Chat, this.guarded((client, msg) => this.onChat(client, msg)));
    this.onMessage(C2S.Mark, this.guarded((client, msg) => this.onMark(client, msg)));
    this.onMessage("objective", this.guarded((client, msg) => {
      const s = this.sessions.get(client.sessionId);
      if (!s || this.mode !== "bomb" || typeof msg !== "boolean" || this.rateLimited(s, "other")) return;
      s.objectiveUntil = msg ? this.now() + 400 : 0;
    }));
    // Bomb Plant (2.2): the carrier hands the charge over by dropping it a step ahead.
    this.onMessage(C2S.DropBomb, this.guarded((client) => {
      const s = this.sessions.get(client.sessionId);
      const p = this.state.players.get(client.sessionId);
      if (!s || !p || !p.alive || this.mode !== "bomb" || this.state.phase !== MatchPhase.Playing || this.rateLimited(s, "other")) return;
      dropBomb(this.state.bomb, p.id, this.now(), [Math.sin(s.lastYaw), Math.cos(s.lastYaw)]);
    }));
    for (let i = 0; i < this.botCount; i++) this.addBot(i);

    // Every handler validates its payload AND is wrapped: a hostile message must never take the room down.
    this.onMessage(C2S.Input, this.guarded((client, msg) => this.onInput(client, msg)));
    this.onMessage(C2S.Fire, this.guarded((client, msg) => this.onFire(client, msg)));
    this.onMessage(C2S.Equip, this.guarded((client, slot) => this.onEquip(client, slot)));
    this.onMessage(C2S.Reload, this.guarded((client) => this.onReload(client)));
    this.onMessage(C2S.Ping, this.guarded((client, msg) => this.onPing(client, msg)));
    this.onMessage(C2S.Rematch, () => { /* handled by the phase timer; kept for future vote logic */ });
    this.onMessage(C2S.Buy, this.guarded((client, msg) => this.onBuy(client, msg, false)));
    this.onMessage(C2S.Sell, this.guarded((client, msg) => this.onBuy(client, msg, true)));
    this.onMessage(C2S.Throw, this.guarded((client, msg) => this.onThrow(client, msg)));

    // Development-only test hooks (never registered unless FB_DEV_TOOLS=1): teleport a player to a free
    // spot; set a wallet balance (screenshot/e2e tooling for the shop).
    if (DEV_TOOLS) {
      this.onMessage("dev:money", this.guarded((client, msg) => {
        const p = this.state.players.get(client.sessionId);
        if (!p || !isFiniteNumber(msg)) return;
        this.pay(p, Math.round(msg) - p.money, "reset");
      }));
      // Dev only, like the rest of this block: a match runs for seven minutes, which is a long time
      // to wait for a test of the result screen. Ends it on the next tick through the real path.
      this.onMessage("dev:endmatch", this.guarded(() => { this.state.matchEndsAt = this.now(); }));
      this.onMessage("dev:teleport", this.guarded((client, msg) => {
        const s = this.sessions.get(client.sessionId);
        if (!s || !isRecord(msg) || !isFiniteNumber(msg.x) || !isFiniteNumber(msg.y) || !isFiniteNumber(msg.z)) return;
        const hw = PLAYER.halfWidth;
        if (this.world.overlaps(msg.x - hw, msg.y + 0.01, msg.z - hw, msg.x + hw, msg.y + PLAYER.height, msg.z + hw)) return;
        s.body.x = msg.x; s.body.y = msg.y; s.body.z = msg.z; s.body.vx = s.body.vy = s.body.vz = 0;
        s.inputs.length = 0; s.history.length = 0;
        client.send(S2C.Spawn, { id: client.sessionId, x: msg.x, y: msg.y, z: msg.z, yaw: s.lastYaw } satisfies SpawnEvent);
      }));
    }
  }

  private now(): number { return this.clock.currentTime; }

  /**
   * Wraps a message handler so an unexpected throw is contained (logged in dev, counted otherwise)
   * instead of propagating into the transport. Validation inside the handlers is still the first line.
   */
  private guarded(fn: (client: Client, msg: unknown) => void): (client: Client, msg: unknown) => void {
    return (client, msg) => {
      try { fn(client, msg); } catch (err) {
        this.handlerErrors++;
        if (DEV_TOOLS) console.warn(`[tdm] handler error from ${client.sessionId}:`, err);
      }
    };
  }

  /** Count of handler exceptions swallowed by `guarded` (diagnostics only). */
  handlerErrors = 0;

  // ---------------------------------------------------------------- chat + marks (drop 5)

  private onChat(client: Client, msg: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || !isChatMessage(msg) || this.rateLimited(s, "other")) return;
    const now = this.now();
    if (now - s.lastChatAt < CHAT.minIntervalMs) return;
    const text = sanitizeChat(msg.text);
    if (!text) return;
    s.lastChatAt = now;
    const all = !msg.team || !this.teams;
    const ev: ChatEvent = { id: p.id, name: p.name, team: p.team as Team, text, all, at: now };
    this.sendToTeam(ev.team, all, S2C.Chat, ev);
  }

  /** A mark is a team-wide pointer: a spot on the map or a spotted enemy. Solo in FFA (nobody to tell). */
  private onMark(client: Client, msg: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || !p.alive || !isMarkMessage(msg) || this.rateLimited(s, "other")) return;
    const now = this.now();
    if (now - s.lastMarkAt < MARK.minIntervalMs) return;
    const b = s.body;
    if (Math.hypot(msg.x - b.x, msg.y - b.y, msg.z - b.z) > MARK.maxRange + 5) return;
    if (msg.kind === "spot" && (!msg.target || !this.state.players.get(msg.target)?.alive)) return;
    s.lastMarkAt = now;
    const ev: MarkEvent = { id: p.id, name: p.name, team: p.team as Team, x: msg.x, y: msg.y, z: msg.z, kind: msg.kind, target: msg.target, at: now };
    this.sendToTeam(ev.team, !this.teams, S2C.Mark, ev);
  }

  /** Sends to everyone (`all`) or to the clients of one team; in FFA "team" means only the sender. */
  private sendToTeam(team: Team, all: boolean, type: string, payload: unknown): void {
    for (const c of this.clients) {
      const q = this.state.players.get(c.sessionId);
      if (!q) continue;
      if (all || (this.teams && q.team === team) || (!this.teams && payload && (payload as { id?: string }).id === c.sessionId)) c.send(type, payload);
    }
  }

  // ---------------------------------------------------------------- bots (drop 5)

  private addBot(n: number): void {
    if (!this.walk) {
      this.walk = sharedWalk(); // built and warmed once per process, not per room (task 1)
      this.roamPoints = [...this.map.spawns, ...(this.map.arenaSpawns ?? []), ...this.map.flags, ...this.map.stations].map(p => ({ x: p.x, y: p.y, z: p.z }));
    }
    const id = botId(n);
    const p = new PlayerState();
    p.id = id;
    p.name = BOT_NAMES[n % BOT_NAMES.length];
    p.bot = true;
    p.team = this.teamForJoiner();
    p.weapon = DEFAULT_WEAPON;
    this.writeWallet(p, freshWallet());
    this.state.players.set(id, p); this.connectedCount++;
    const s = new Session();
    s.planPhase = n % MAX_BOTS;
    s.brain = new BotBrain(this.botLevel, this.walk, this.rand);
    this.sessions.set(id, s);
    this.spawn(id);
  }

  /** One bot's tick: build what it can sense, take its decision, feed it through the human paths. */
  private stepBot(p: PlayerState, s: Session, now: number): void {
    const brain = s.brain!;
    const w = WEAPONS[p.weapon as WeaponId];
    const enemies = this.senseEnemies;
    enemies.length = 0;
    for (const [id, q] of this.state.players) {
      if (id === p.id || !q.alive || (this.teams && q.team === p.team)) continue;
      const qs = this.sessions.get(id);
      if (qs) enemies.push({ id, team: q.team, x: qs.body.x, y: qs.body.y, z: qs.body.z, crouching: qs.body.crouching });
    }
    const senses: BotSenses = {
      now,
      me: { id: p.id, team: p.team, x: s.body.x, y: s.body.y, z: s.body.z, crouching: s.body.crouching, grounded: s.body.grounded, ammo: s.ammo[w.id], magazine: w.magazine, reserve: s.reserve[w.id], weapon: w.id, fireIntervalMs: fireIntervalMs(w) },
      enemies,
      los: (ax, ay, az, bx, by, bz, id) => {
        const c = id ? s.losCache.get(id) : undefined;
        // Fresh enough and not this bot's refresh tick: reuse. Bots refresh on different ticks.
        if (c && this.navTick - c.tick < LOS_CACHE_TICKS && (this.navTick + s.planPhase) % LOS_CACHE_TICKS !== 0) return c.ok;
        const ok = !this.losBlocked(ax, ay, az, bx, by, bz) && !smokeBlocks(this.smokes, now, ax, ay, az, bx, by, bz);
        if (id) s.losCache.set(id, { tick: this.navTick, ok });
        return ok;
      },
      blinded: now < s.blindedUntil,
      // No fire on the map (the usual case) means no filter, no allocation.
      hazards: this.fires.length === 0 ? NO_HAZARDS : this.fires.filter(f => f.until > now && Math.hypot(p.x - f.x, p.z - f.z) < f.radius + 3
        && !this.losBlocked(p.x, p.y + 1, p.z, f.x, f.y + 0.3, f.z)),
      flags: this.mode === "dom" ? this.flagSims.map((f, i) => ({ x: this.map.flags[i].x, y: this.map.flags[i].y, z: this.map.flags[i].z, owner: f.owner, contested: this.state.flags[i]?.contested ?? false })) : [],
      roamPoints: this.roamPoints,
      mayPlan: this.navTick % MAX_BOTS === s.planPhase,
      objective: this.mode === "bomb" && this.state.phase === MatchPhase.Playing ? this.bombGoal(p, s)
        : this.infection && p.shaved && this.state.phase === MatchPhase.Playing ? this.nearestSurvivor(p) : undefined,
      // Drop D: the mode and this bot's side, for the one decision the brain cannot see — whether
      // it is the one with the clippers.
      mode: this.mode,
      shaved: p.shaved,
    };
    const d = brain.think(senses);
    if (senses.objective && !d.fire && !senses.blinded && !senses.hazards?.length && Math.hypot(p.x - senses.objective.x, p.z - senses.objective.z) < 1.9) {
      d.input.buttons = 0; s.objectiveUntil = now + 250;
    }
    if (s.inputs.length < MAX_INPUT_QUEUE) s.inputs.push(d.input);
    if (d.reload && !p.reloading) this.reloadFor(p, s);
    if (d.fire && isLive(this.state.phase as MatchPhase)) this.fireCore(undefined, p, s, { seq: 0, weapon: w.id, o: d.fire.o, d: d.fire.d, t: now });
  }

  /**
   * Right before each state patch: each human gets their own ack, and only when it moved. Sent on
   * the same socket ahead of the patch, so it arrives first and the client reconciles the patch
   * against exactly the input the server had simulated when it encoded that state (task 5).
   */
  override onBeforePatch(): void {
    for (const client of this.clients) {
      const s = this.sessions.get(client.sessionId);
      if (!s || s.ack === s.ackSent) continue;
      s.ackSent = s.ack;
      client.send(S2C.Ack, s.ack);
    }
  }

  private onPing(client: Client, msg: unknown): void {
    const s = this.sessions.get(client.sessionId);
    if (!s || !isRecord(msg) || !isFiniteNumber(msg.c) || this.rateLimited(s, "other")) return;
    const p = this.state.players.get(client.sessionId);
    if (p && isFiniteNumber(msg.rtt)) p.ping = Math.min(999, Math.max(0, Math.round(msg.rtt)));
    client.send(S2C.Pong, { c: msg.c, s: this.now() });
  }

  // ---------------------------------------------------------------- dev bandwidth counter

  private netBytes = 0;
  private netFrames = 0;
  private netSince = 0;

  /** Counts every outgoing frame (state patches and messages) for this client. Dev-only. */
  private instrumentClient(client: Client): void {
    const raw = client.raw.bind(client);
    client.raw = (data, options, cb) => {
      this.netBytes += data.byteLength;
      this.netFrames++;
      raw(data, options, cb);
    };
  }

  private logNetStats(now: number): void {
    if (this.netSince === 0) { this.netSince = now; return; }
    const dt = now - this.netSince;
    if (dt < 5000) return;
    const n = Math.max(1, this.clients.length);
    const bps = (this.netBytes * 1000) / dt;
    console.log(`[tdm net] ${this.clients.length} clients · ${bps.toFixed(0)} B/s out total · ${(bps / n).toFixed(0)} B/s per client · ${((this.netFrames * 1000) / dt / n).toFixed(1)} frames/s per client`);
    this.netBytes = 0; this.netFrames = 0; this.netSince = now;
  }

  // ---------------------------------------------------------------- join / leave

  override onJoin(client: Client, options: TdmJoinOptions): void {
    const name = sanitizeName(options?.name) ?? `PLAYER${Math.floor(Math.random() * 900 + 100)}`;
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = name;
    p.team = this.teamForJoiner();
    // Drop D: joining an infection round in progress means joining the chasers — a late survivor
    // would be a free extra life for the survivor side. `spawn` reads the flag and hands the clippers.
    p.shaved = this.infection && p.team === OSTRZYZENI.shavedTeam;
    p.weapon = DEFAULT_WEAPON;
    this.writeWallet(p, freshWallet());
    this.state.players.set(client.sessionId, p); this.connectedCount++;

    const s = new Session();
    this.sessions.set(client.sessionId, s);
    if (NET_STATS) this.instrumentClient(client);
    client.send(S2C.Welcome, { id: client.sessionId, serverTime: this.now(), tickRate: 1000 / TICK_MS } satisfies WelcomeMessage);
    this.spawn(client.sessionId);
    if (this.mode === "bomb" && this.state.phase === MatchPhase.Playing) {
      // Late joins spectate until the next round instead of buying a second life by reconnecting.
      p.alive = false; p.health = 0;
    }
    this.maybeStartCountdown();
  }

  /**
   * The side a joiner (human or bot) lands on. Team modes balance the two sides; FFA and Gun Game
   * have none. Infection (drop D) never balances: the sides are survivors vs the shaved, so a joiner
   * in the warm-up is a survivor and one arriving while a round runs (Prep or Playing) is shaved.
   */
  private teamForJoiner(): Team {
    if (this.infection) {
      const inRound = this.state.phase === MatchPhase.Prep || this.state.phase === MatchPhase.Playing;
      return inRound ? OSTRZYZENI.shavedTeam : OSTRZYZENI.survivorTeam;
    }
    return this.teams ? teamForNewPlayer(Array.from(this.state.players.values()).map((q) => q.team as Team)) : 0;
  }

  /**
   * A dropped connection keeps the player (flagged `connected=false`) for RECONNECT_GRACE_S so a page
   * hiccup does not cost the slot. The ghost stays a valid, hittable body but never respawns
   * (see `step`) and does not count towards the match's connected players.
   */
  override async onLeave(client: Client, code?: number): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false; this.connectedCount--;
    this.updatePhase(); // a countdown aborts immediately when the room drops below minPlayers
    const consented = code === 1000 || code === 4000;
    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_GRACE_S);
        const back = this.state.players.get(client.sessionId);
        if (back) { back.connected = true; this.connectedCount++; }
        return;
      } catch {
        // timed out or room disposing
      }
    }
    this.removePlayer(client.sessionId);
  }

  private removePlayer(id: string): void {
    const s = this.sessions.get(id);
    if (s) { s.history.length = 0; s.inputs.length = 0; }
    const gone = this.state.players.get(id);
    if (gone?.connected) this.connectedCount--;
    this.state.players.delete(id);
    this.sessions.delete(id);
  }

  // ---------------------------------------------------------------- inputs

  private rateLimited(s: Session, kind: "input" | "other" | "fire"): boolean {
    const t = this.now();
    if (t - s.msgWindowStart >= 1000) { s.msgWindowStart = t; s.inputCount = 0; s.otherCount = 0; s.fireCount = 0; }
    if (kind === "input") return ++s.inputCount > MAX_INPUT_RATE * 1.5;
    if (kind === "fire") return ++s.fireCount > MAX_FIRE_MSG_RATE;
    return ++s.otherCount > MAX_OTHER_MSG_RATE;
  }

  /** Fire messages dropped by the per-second cap (diagnostics only). */
  fireDropped = 0;

  private onInput(client: Client, msg: unknown): void {
    const s = this.sessions.get(client.sessionId);
    if (!s || !Array.isArray(msg) || msg.length === 0) return;
    const list: unknown[] = Array.isArray(msg[0]) ? msg : [msg];
    // Oversized batches are dropped whole: a real client sends 1–3 inputs per message.
    if (list.length > MAX_INPUT_BATCH) return;
    for (const t of list) {
      if (this.rateLimited(s, "input")) return;
      if (!isInputTuple(t)) return;
      const input = unpackInput(t);
      // Replays / reordered packets: seq must strictly increase so `ack` can never move backwards.
      if (input.seq <= s.lastSeq || input.seq > MAX_SEQ) continue;
      s.lastSeq = input.seq;
      input.dt = Math.max(0, Math.min(MAX_INPUT_DT_MS, input.dt));
      input.buttons = input.buttons & BTN_MASK;
      input.pitch = Math.max(-1.55, Math.min(1.55, input.pitch));
      // Queue is bounded so a stalled client cannot dump a flood of movement at once.
      if (s.inputs.length >= MAX_INPUT_QUEUE) s.inputs.shift();
      s.inputs.push(input);
      // Remember the aim of this seq (handoff P1): shots name the input they were aimed from.
      const ri = input.seq & (ANGLE_RING - 1);
      s.angleSeq[ri] = input.seq; s.angleYaw[ri] = input.yaw; s.anglePitch[ri] = input.pitch;
    }
  }

  private onEquip(client: Client, slot: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || !p.alive || this.rateLimited(s, "other")) return;
    if (!isFiniteNumber(slot)) return;
    // Slots are 1 = primary (owned), 2 = sidearm; anything not owned is refused (drop 2).
    const id = weaponForSlot(this.walletOf(p), slot);
    if (!id || id === p.weapon) return;
    // Drop D: the free sidearm fallback of slot 2 would let a rifle rung carry the pistol as well;
    // on the ladder only the rung weapon and the clippers are in the hands.
    if (this.ladder && id !== ladderWeapon(s.rung) && id !== MELEE_WEAPON) return;
    // Drop D: the same fallback would hand a shaved chaser the free pistol; clippers only.
    if (this.infection && p.shaved && id !== MELEE_WEAPON) return;
    p.weapon = id;
    p.reloading = false;
    s.reloadEndsAt = 0;
    s.equipEndsAt = this.now() + WEAPONS[id].equipMs;
    s.spread = 0;
    this.syncAmmo(p, s);
  }

  private onReload(client: Client): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || this.rateLimited(s, "other")) return;
    this.reloadFor(p, s);
  }

  private reloadFor(p: PlayerState, s: Session): void {
    if (!p.alive || p.reloading) return;
    const w = WEAPONS[p.weapon as WeaponId];
    if (s.ammo[w.id] >= w.magazine || s.reserve[w.id] <= 0) return;
    p.reloading = true;
    s.reloadEndsAt = this.now() + w.reloadMs;
  }

  private syncAmmo(p: PlayerState, s: Session): void {
    const id = p.weapon as WeaponId;
    p.ammo = s.ammo[id];
    p.reserve = s.reserve[id];
  }

  // ---------------------------------------------------------------- firing

  private onFire(client: Client, raw: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p) return this.rejectFire("dead");
    // Handoff P1: a per-second cap on Fire PACKETS, independent of the weapon's cooldown — the
    // cooldown bounds damage, not the work a flood makes the server do.
    if (this.rateLimited(s, "fire")) { this.fireDropped++; return; }
    if (!isFireMessage(raw)) return this.rejectFire("malformed");
    this.fireCore(client, p, s, raw);
  }

  /**
   * The shot itself, shared by humans (`onFire`) and bots (drop 5): every rule — alive, match not
   * over, weapon, busy, ammo, rate, origin near the eye and outside geometry — applies to both.
   */
  private fireCore(client: Client | undefined, p: PlayerState, s: Session, msg: FireMessage): void {
    if (!p.alive) return this.rejectFire("dead");
    // Warm-up combat is intentional, but a result screen and the frozen preparation window must
    // both be hard server-side stops (codex; drop 7). `isLive` is the shared rule.
    if (!isLive(this.state.phase as MatchPhase)) return this.rejectFire(isFrozen(this.state.phase as MatchPhase) ? "prep" : "match-ended");
    if (msg.weapon !== p.weapon) return this.rejectFire("weapon-mismatch");
    const w = WEAPONS[p.weapon as WeaponId];
    const now = this.now();
    if (p.reloading || now < s.equipEndsAt) return this.rejectFire("busy");
    if (usesAmmo(w) && s.ammo[w.id] <= 0) return this.rejectFire("empty");
    // Fire-rate check with 8% tolerance for client timer jitter.
    if (now - s.lastFireAt < fireIntervalMs(w) * 0.92) return this.rejectFire("rate");
    // Origin must be near the server's idea of the eye position (prediction lead + latency slack) —
    // including the lean (drop 4) — and must not sit inside world geometry (no shooting from a wall).
    const b = s.body;
    const [ex, ey, ez] = leanEye(this.world, b, s.lastYaw, s.lean, s.eye);
    const dist = Math.hypot(msg.o[0] - ex, msg.o[1] - ey, msg.o[2] - ez);
    if (dist > 2.5) return this.rejectFire(`origin ${dist.toFixed(2)}m`);
    if (this.insideSolid(msg.o)) return this.rejectFire("origin-in-wall");
    let [dx, dy, dz] = msg.d;
    const dl = Math.hypot(dx, dy, dz);
    if (dl < 0.5 || dl > 1.5) return this.rejectFire("dir");
    dx /= dl; dy /= dl; dz /= dl;
    // Handoff P1: the direction must match the aim of the input the shot names (the client's inputs
    // carry recoil and sway, so this is exact to float noise); an unknown / old seq falls back to the
    // last simulated angles with a wide tolerance (one frame of mouse movement). Bots send seq 0.
    const ri = msg.seq & (ANGLE_RING - 1);
    const known = msg.seq > 0 && s.angleSeq[ri] === msg.seq;
    aimDirection(known ? s.angleYaw[ri] : s.lastYaw, known ? s.anglePitch[ri] : s.lastPitch, refDir);
    const cosTol = Math.cos(known ? FIRE_DIR_TOLERANCE : FIRE_DIR_TOLERANCE_NO_SEQ);
    if (dx * refDir[0] + dy * refDir[1] + dz * refDir[2] < cosTol) return this.rejectFire(known ? "dir-mismatch" : "dir-mismatch-noseq");

    s.lastFireAt = now;
    if (usesAmmo(w)) { s.ammo[w.id] -= 1; this.syncAmmo(p, s); }
    // Spawn protection prevents immediate spawn deaths; it is never a free first engagement.
    this.endSpawnProtectionOnAttack(p, now);

    if (w.kind === "melee") return this.swing(client, p, s, msg.o, dx, dy, dz, now);
    if (w.kind === "launcher") return this.launch(client, p, msg.o, dx, dy, dz, now);

    // The same pure rule drives the client crosshair and the authoritative traces.
    // In particular, ADS and shotgun pellets must retain movement / air penalties.
    const spread = effectiveSpread(w, s.spread, {
      moving: Math.hypot(b.vx, b.vz) > 0.5,
      airborne: !b.grounded,
      crouching: b.crouching,
      aiming: (s.prevButtons & Btn.Aim) !== 0,
    });
    s.spread = Math.min(w.spreadMax, s.spread + w.spreadPerShot);

    // Lag compensation: rewind other players to the time the shooter saw them.
    const rewindT = Math.max(now - LAG_COMP_MAX_MS, Math.min(now, msg.t));
    const targets: Target[] = [];
    for (const [id, q] of this.state.players) {
      if (id === p.id || !q.alive) continue;
      const qs = this.sessions.get(id);
      if (!qs) continue;
      const h = this.historyAt(qs, rewindT);
      targets.push(h ? { id, x: h.x, y: h.y, z: h.z, crouching: h.crouching } : { id, x: qs.body.x, y: qs.body.y, z: qs.body.z, crouching: qs.body.crouching });
    }

    const rand = mulberry32((s.shotSeed++ * 7919 + (now | 0)) >>> 0);
    const ends: [number, number, number][] = [];
    const kinds: number[] = [];
    const damageTo = new Map<string, { dmg: number; head: boolean }>();
    const pellets = w.pellets;
    for (let i = 0; i < pellets; i++) {
      spreadDirection(dx, dy, dz, spread, rand, pelletDir);
      const r = traceBullet(this.world, w, msg.o[0], msg.o[1], msg.o[2], pelletDir[0], pelletDir[1], pelletDir[2], targets, p.id);
      ends.push([r.ex, r.ey, r.ez]);
      kinds.push(r.targetId ? (r.headshot ? 2 : 1) : 0);
      if (r.targetId) {
        const e = damageTo.get(r.targetId) ?? { dmg: 0, head: false };
        e.dmg += r.damage * (r.headshot ? HEADSHOT_MULTIPLIER : 1);
        e.head = e.head || r.headshot;
        damageTo.set(r.targetId, e);
      }
    }

    const shot: ShotEvent = { id: p.id, weapon: w.id, o: msg.o, e: ends, k: kinds };
    this.broadcast(S2C.Shot, shot, client ? { except: client } : undefined);

    for (const [victimId, e] of damageTo) {
      this.applyDamage(p, victimId, Math.round(e.dmg), e.head, client);
    }
  }

  /**
   * Clippers (drop 3): a short trace against the lag-compensated bodies. From behind it is a
   * one-hit kill; otherwise the weapon's damage. The swing is broadcast as a shot without trace
   * end points so remote characters animate it without drawing a tracer.
   */
  private swing(client: Client | undefined, p: PlayerState, s: Session, o: [number, number, number], dx: number, dy: number, dz: number, now: number): void {
    const w = WEAPONS.clippers;
    const rewindT = Math.max(now - LAG_COMP_MAX_MS, Math.min(now, now));
    const targets: Target[] = [];
    for (const [id, q] of this.state.players) {
      if (id === p.id || !q.alive) continue;
      const qs = this.sessions.get(id);
      if (!qs) continue;
      const h = this.historyAt(qs, rewindT);
      targets.push(h ? { id, x: h.x, y: h.y, z: h.z, crouching: h.crouching } : { id, x: qs.body.x, y: qs.body.y, z: qs.body.z, crouching: qs.body.crouching });
    }
    const r = traceBullet(this.world, w, o[0], o[1], o[2], dx, dy, dz, targets, p.id, MELEE.range);
    this.broadcast(S2C.Shot, { id: p.id, weapon: w.id, o, e: [], k: r.targetId ? [1] : [] } satisfies ShotEvent, client ? { except: client } : undefined);
    if (!r.targetId) return;
    const vs = this.sessions.get(r.targetId);
    const backstab = vs ? isBackstab(vs.lastYaw, s.body.x, s.body.z, vs.body.x, vs.body.z) : false;
    this.applyDamage(p, r.targetId, backstab ? MELEE.backstabDamage : w.damage, backstab, client, w.id);
  }

  /** Launcher (drop 3): the round is a projectile in the shared simulation; everyone sees the arc from the Throw event. */
  private launch(client: Client | undefined, p: PlayerState, o: [number, number, number], dx: number, dy: number, dz: number, now: number): void {
    const proj = createProjectile(this.nextProjectileId++, "shell", p.id, [o[0], o[1], o[2]], [dx, dy, dz], 0);
    this.projectiles.push(proj);
    this.broadcast(S2C.Shot, { id: p.id, weapon: "launcher", o, e: [], k: [] } satisfies ShotEvent, client ? { except: client } : undefined);
    this.broadcast(S2C.Throw, { id: proj.id, kind: "shell", owner: p.id, o: [proj.x, proj.y, proj.z], v: [proj.vx, proj.vy, proj.vz], fuseMs: 0, t: now } satisfies ThrowEvent);
  }

  /** Rejections are silent for clients (the server is the authority); logged only in dev. */
  private rejectFire(reason: string): void {
    if (DEV_TOOLS) console.log(`[fire rejected] ${reason}`);
  }

  /** An accepted shot / melee / launcher / throw spends any remaining spawn shield. */
  private endSpawnProtectionOnAttack(p: PlayerState, now: number): void {
    if (p.protectedUntil > now) p.protectedUntil = now;
  }

  /** A shot / throw origin inside a solid (a leaned head pushed through a wall) is never accepted. */
  private insideSolid(o: [number, number, number]): boolean {
    const r = 0.05;
    return this.world.overlaps(o[0] - r, o[1] - r, o[2] - r, o[0] + r, o[1] + r, o[2] + r);
  }

  private historyAt(s: Session, t: number): HistoryEntry | null {
    const h = s.history;
    if (h.length === 0) return null;
    let best = h[h.length - 1];
    let bestD = Math.abs(best.t - t);
    for (let i = h.length - 2; i >= 0; i--) {
      const d = Math.abs(h[i].t - t);
      if (d < bestD) { best = h[i]; bestD = d; } else break;
    }
    return best;
  }

  private applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, attackerClient: Client | undefined, weapon: WeaponId | GrenadeId = attacker.weapon as WeaponId): void {
    const v = this.state.players.get(victimId);
    const vs = this.sessions.get(victimId);
    if (!v || !vs || !v.alive || amount <= 0) return;
    const now = this.now();
    if (v.protectedUntil > now) return;
    if (v.id === attacker.id) return;                   // never yourself (own frag, own fire)
    if (this.teams && v.team === attacker.team) return; // no friendly fire in team modes (drop 4: FFA has no teams)
    // Drop 3: the flask shaves the hit, the plate takes half of the rest while it lasts.
    const split = splitDamage(amount, v.armor, perkActive(this.perksOf(v), "flask", now));
    v.armor = split.armorLeft;
    amount = split.taken;
    v.health = Math.max(0, v.health - amount);
    vs.lastDamageAt = now;
    const kill = v.health === 0;
    const credited = amount + split.absorbed;
    const prev = vs.damagedBy.get(attacker.id);
    vs.damagedBy.set(attacker.id, { amount: (prev && now - prev.at < ECONOMY.assistWindowMs ? prev.amount : 0) + credited, at: now });
    (attackerClient ?? this.clientOf(attacker.id))?.send(S2C.Hit, { victim: victimId, damage: credited, kill, headshot, armor: split.absorbed > 0 } satisfies HitEvent);
    const victimClient = this.clients.find((c) => c.sessionId === victimId);
    if (victimClient) {
      let ddx = attacker.x - v.x, ddz = attacker.z - v.z;
      const dl = Math.hypot(ddx, ddz) || 1;
      ddx /= dl; ddz /= dl;
      victimClient.send(S2C.Damaged, { from: attacker.id, amount: credited, dx: ddx, dz: ddz, health: v.health, armor: v.armor, broke: split.broke } satisfies DamagedEvent);
    }
    if (kill) this.kill(attacker, v, vs, headshot, weapon);
  }

  private clientOf(id: string): Client | undefined { return this.clients.find((c) => c.sessionId === id); }

  private kill(attacker: PlayerState, victim: PlayerState, vs: Session, headshot: boolean, weapon: WeaponId | GrenadeId): void {
    victim.alive = false;
    victim.reloading = false;
    victim.armor = 0; // plates do not survive death
    if (this.mode === "bomb") { this.writeWallet(victim, { ...freshWallet(), money: victim.money }); victim.kit = false; }
    // A fresh fade (drop 3) is spent here: quicker respawn and a longer shield on the next spawn.
    const fade = perkActive(this.perksOf(victim), "fade", this.now());
    if (fade) { victim.perks.set("fade", 0); vs.fadeShield = true; }
    // Drop D: the conversion happens BEFORE the respawn timer is set — a victim who has just been
    // shaved is a chaser now, and chasers come back on the short timer. Both mode scores are a
    // BONUS on top of the kill award every mode pays: a shave is a kill and then some.
    if (this.infection && convertsOnKill(weapon, victim.shaved, this.state.phase === MatchPhase.Playing)) {
      this.shave(victim, vs);
      if (this.state.phase === MatchPhase.Playing) attacker.score += OSTRZYZENI.convertScore;
    } else if (this.infection && this.state.phase === MatchPhase.Playing && victim.shaved && !attacker.shaved) {
      attacker.score += OSTRZYZENI.killScore;
    }
    vs.respawnAt = this.now() + this.respawnDelay(victim, fade);
    vs.lastKilledBy = attacker.id;
    vs.inputs.length = 0;
    // A corpse must not be rewound into by late shots: drop its lag-comp history.
    vs.history.length = 0;
    victim.deaths += 1;
    const counts = this.state.phase === MatchPhase.Playing;
    if (counts) {
      attacker.kills += 1;
      // Drop D: on the ladder `score` is the rung, written below; points would corrupt it.
      if (!this.ladder) attacker.score += headshot ? 150 : 100;
      // Drop 4: only TDM scores the team on a kill (Domination scores flags, FFA scores the player).
      if (this.mode === "tdm") { if (attacker.team === 0) this.state.scoreA += 1; else this.state.scoreB += 1; }
    }
    // Drop D: move both players on the ladder. The killer is re-armed on the spot (they are alive
    // and the client follows a server weapon change); the victim's rung shows at their respawn,
    // which reads it. Both scores are the rungs, so the scoreboard is right before anyone spawns.
    let finished = false;
    const ks = this.sessions.get(attacker.id);
    if (this.ladder && counts && ks) {
      const after = ladderAfterKill(ks.rung, vs.rung, weapon);
      vs.rung = after.victim; victim.score = vs.rung;
      if (after.killer !== ks.rung) {
        ks.rung = after.killer;
        finished = ladderDone(ks.rung);
        if (attacker.alive && !finished) {
          this.handLadderWeapon(attacker, ks);
          attacker.reloading = false; ks.reloadEndsAt = 0; ks.spread = 0;
          ks.equipEndsAt = this.now() + WEAPONS[attacker.weapon as WeaponId].equipMs;
        }
      }
      attacker.score = ks.rung;
    }
    const ev: KillEvent = {
      killer: attacker.id, killerName: attacker.name, killerTeam: attacker.team as Team,
      victim: victim.id, victimName: victim.name, victimTeam: victim.team as Team,
      weapon, headshot,
    };
    this.broadcast(S2C.Kill, ev);
    // Economy: the killer is paid; anyone else who did real damage recently gets an assist.
    this.pay(attacker, killReward(headshot), headshot ? "headshot" : "kill");
    const now = this.now();
    for (const [id, e] of vs.damagedBy) {
      if (id === attacker.id || now - e.at > ECONOMY.assistWindowMs || e.amount < ECONOMY.assistMinDamage) continue;
      const helper = this.state.players.get(id);
      if (helper && (!this.teams || helper.team === attacker.team)) { this.pay(helper, ECONOMY.assistReward, "assist"); if (counts) { helper.assists += 1; if (!this.ladder) helper.score += 50; } }
    }
    vs.damagedBy.clear();
    if (!counts) return;
    // Drop D: the ladder ends on the last rung's kill, never on a kill count — a clippers kill from
    // a low rung is a kill that moved nobody up. `endMatch` names the top rung, i.e. the finisher.
    if (finished) { this.endMatch(); return; }
    const limit = MODES[this.mode].scoreLimit;
    if (this.mode === "tdm" && (this.state.scoreA >= limit || this.state.scoreB >= limit)) this.endMatch();
    else if (this.mode === "ffa" && attacker.kills >= limit) this.endMatch();
  }

  /**
   * Drop D: the whole loadout of a rung. No money, no grenades, no plates, no perks — the rung
   * weapon alone in `owned` (the clippers are always in slot 3, so the last rung owns nothing), a
   * full magazine and reserve, and `score` = rung for the HUD. Called at spawn and on the kill that
   * moved the killer up; the caller decides whether an equip animation is due.
   */
  private handLadderWeapon(p: PlayerState, s: Session): void {
    const w = ladderWeapon(s.rung);
    this.writeWallet(p, { ...freshWallet(), money: 0, owned: w === MELEE_WEAPON ? [] : [w] });
    s.ammo[w] = WEAPONS[w].magazine; s.reserve[w] = WEAPONS[w].reserve;
    p.weapon = w;
    p.score = s.rung;
    this.syncAmmo(p, s);
  }

  /**
   * Drop D: shave a player onto the chasers' side — the Ostrzyżony loadout in one place, because it
   * is applied at three moments that must agree: the round's first chaser, a conversion, and a
   * spawn. Clippers only (they are always in slot 3, so `owned` is empty), no money, and the energy
   * perk armed for the whole round: the chaser has to close the distance on people who can shoot.
   */
  private shave(p: PlayerState, s: Session): void {
    p.shaved = true;
    p.team = OSTRZYZENI.shavedTeam;
    p.kit = false;
    this.writeWallet(p, { ...freshWallet(), money: 0, owned: [], perks: { ...noPerks(), [OSTRZYZENI.speedPerk]: PERK_ARMED_MS } });
    p.weapon = MELEE_WEAPON;
    p.reloading = false; s.reloadEndsAt = 0; s.spread = 0;
    s.ammo[MELEE_WEAPON] = WEAPONS[MELEE_WEAPON].magazine;
    this.syncAmmo(p, s);
  }

  /** Drop D: the survivors' side of the same coin — a clean head, a fresh wallet for the round. */
  private unshave(p: PlayerState): void {
    p.shaved = false;
    p.team = OSTRZYZENI.survivorTeam;
    this.writeWallet(p, { ...freshWallet(), money: OSTRZYZENI.roundMoney });
  }

  // ---------------------------------------------------------------- spawning

  private spawn(id: string): void {
    const p = this.state.players.get(id);
    const s = this.sessions.get(id);
    if (!p || !s) return;
    const enemies: { x: number; y: number; z: number }[] = [];
    const allies: { x: number; y: number; z: number }[] = [];
    for (const [qid, q] of this.state.players) {
      if (qid === id || !q.alive) continue;
      (this.teams && q.team === p.team ? allies : enemies).push({ x: q.x, y: q.y, z: q.z });
    }
    // FFA (drop 4): every point on the map is a candidate; everyone alive is an enemy.
    const spawnTeam = this.mode === "bomb" && this.state.phase !== MatchPhase.Waiting && this.state.phase !== MatchPhase.Countdown
      ? (p.team === this.state.bomb.attackTeam ? 0 : 1) as Team : p.team as Team;
    const sp = pickSpawn(this.map, spawnTeam, {
      enemies, allies, rand: this.rand,
      danger: (x, y, z) => this.fires.some(f => f.until > this.now() && Math.abs(f.y - y) < 2 && Math.hypot(x - f.x, z - f.z) < f.radius + 1),
      canSee: (ax, ay, az, bx, by, bz) => {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const l = Math.hypot(dx, dy, dz) || 1;
        this.world.raycast(ax, ay, az, dx / l, dy / l, dz / l, l, worldHit);
        return !worldHit.hit;
      },
    }, !this.teams || this.mode === "tdm"); // no sides (FFA, Gun Game): the whole pool
    const b = s.body;
    b.x = sp.x; b.y = sp.y; b.z = sp.z; b.vx = b.vy = b.vz = 0; b.grounded = true; b.crouching = false;
    s.inputs.length = 0;
    s.history.length = 0;
    s.lastYaw = sp.yaw; s.lastPitch = 0;
    s.lean = 0; s.tac = false; p.lean = 0; p.tac = false;
    for (const w of WEAPON_ORDER) { s.ammo[w] = WEAPONS[w].magazine; s.reserve[w] = WEAPONS[w].reserve; }
    s.reloadEndsAt = 0; s.equipEndsAt = this.now() + 200; s.spread = 0;
    p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw; p.pitch = 0;
    p.health = PLAYER.maxHealth; p.alive = true; p.reloading = false;
    const wallet = this.walletOf(p);
    p.weapon = primaryOf(wallet) ?? secondaryOf(wallet);
    if (this.ladder) this.handLadderWeapon(p, s);
    // Drop D: a chaser comes back a chaser — the clippers and the perk, not the wallet they had.
    if (this.infection && p.shaved) this.shave(p, s);
    // A shield granted inside the frozen preparation window would be spent standing still, before
    // the fighting resumed — so it starts counting from the RELEASE. Here rather than at the one
    // call site that respawns a wave, because joining and reconnecting land in prep too and every
    // one of them deserves the same shield.
    const shieldFrom = this.state.phase === MatchPhase.Prep ? this.state.phaseEndsAt : this.now();
    p.protectedUntil = shieldFrom + (s.fadeShield ? PERK_EFFECT.fadeShieldMs : SPAWN_PROTECTION_MS);
    if (this.mode === "bomb" && this.state.phase !== MatchPhase.Waiting && this.state.phase !== MatchPhase.Countdown) p.protectedUntil = 0;
    // Drop D: a chaser is back every three seconds inside a live round; a shield on each of those
    // returns would let them walk through fire to reach somebody (code review). They keep it for
    // the round's own start, where everyone gets one.
    if (this.infection && p.shaved && this.state.phase === MatchPhase.Playing) p.protectedUntil = 0;
    s.fadeShield = false;
    s.blindedUntil = 0; s.objectiveUntil = 0; s.respawnAt = 0;
    p.spawnedAt = this.now(); s.spawnedAt = p.spawnedAt;
    s.damagedBy.clear(); s.burnAcc = 0; s.regenAcc = 0; s.lastDamageAt = -Infinity;
    this.syncAmmo(p, s);
    this.broadcast(S2C.Spawn, { id, x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw } satisfies SpawnEvent);
    // Drop 5: a bot shops in its spawn window like anyone else — a primary it can afford.
    if (s.brain) {
      s.brain.onSpawn(sp.yaw);
      if (this.noShop) return;                       // drop D: nothing to shop for
      if (this.infection && p.shaved) return;        // drop D: a chaser has the clippers and no money
      const item = s.brain.pickBuy(p.money, Array.from(p.owned));
      if (item) this.buyItem(p, s, item);
    }
  }

  // ---------------------------------------------------------------- match flow

  private maybeStartCountdown(): void {
    const connected = this.connectedCount;
    if (this.state.phase === MatchPhase.Waiting && connected >= MATCH.minPlayers) {
      this.state.phase = MatchPhase.Countdown;
      this.state.phaseEndsAt = this.now() + MATCH.countdownMs;
      this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Countdown, winner: -1, endsAt: this.state.phaseEndsAt } satisfies MatchEventMessage);
    }
  }

  private startMatch(): void {
    this.state.phase = MatchPhase.Playing;
    // One uninterrupted live phase until the time or score limit is reached. The round modes get a
    // clock long enough for every round they can play, so the match ends on rounds, not on time.
    this.state.matchEndsAt = this.now() + (this.mode === "bomb" ? 30 * 60000
      : this.infection ? OSTRZYZENI.rounds * (OSTRZYZENI.prepMs + OSTRZYZENI.roundMs + OSTRZYZENI.breakMs) + 60000
      : MATCH.durationMs);
    this.state.phaseEndsAt = this.state.matchEndsAt;
    this.state.scoreA = 0; this.state.scoreB = 0; this.state.winner = -1;
    this.state.winnerId = ""; this.state.winnerName = "";
    this.projectiles.length = 0; this.fires.length = 0; this.smokes.length = 0;
    if (this.mode === "bomb") { this.state.bomb.round = 0; this.state.bomb.attackTeam = 0; this.bombLosses = [0, 0]; }
    if (this.infection) this.state.bomb.round = 0;
    // Drop 4: flags go back to neutral; the first score tick is a full interval away.
    for (let i = 0; i < this.flagSims.length; i++) { this.flagSims[i] = neutralFlag(); this.syncFlag(i, false); }
    this.nextDomTickAt = this.now() + DOM.tickMs;
    for (const [id, p] of this.state.players) {
      p.kills = 0; p.deaths = 0; p.score = 0; p.assists = 0;
      const s = this.sessions.get(id);
      if (s) s.rung = 0; // drop D: everyone starts the ladder on the first rung
      this.writeWallet(p, freshWallet());
      this.clientOf(id)?.send(S2C.Money, { delta: 0, reason: "reset", total: p.money } satisfies MoneyEvent);
      if (this.mode === "bomb") p.money = BOMB.startMoney;
      else if (!this.infection) this.spawn(id); // infection spawns everyone in `beginInfectionRound`
    }
    if (this.mode === "bomb") this.beginBombRound(true);
    else if (this.infection) this.beginInfectionRound();
    else this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Playing, winner: -1, endsAt: this.state.phaseEndsAt } satisfies MatchEventMessage);
  }

  // ---------------------------------------------------------------- Ostrzyżeni (drop D)

  /**
   * A round begins with everybody unshaved and one random player shaved in place. The buy window is
   * a Prep phase, which the shared `rounds.ts` rules already freeze on both sides — survivors spend
   * their round money, the Ostrzyżony waits with the clippers where everyone can see them.
   *
   * Everyone is respawned here, not at the release: the point of Prep is to look around and buy.
   */
  private beginInfectionRound(): void {
    const st = this.state, now = this.now();
    st.phase = MatchPhase.Prep;
    st.phaseEndsAt = now + OSTRZYZENI.prepMs;
    this.infectionStage = "buy";
    this.projectiles.length = 0; this.fires.length = 0; this.smokes.length = 0;
    const roster: PlayerState[] = [];
    for (const [id, p] of st.players) {
      if (!p.connected) continue;
      this.unshave(p);
      this.spawn(id);
      roster.push(p);
    }
    const first = pickFirstShaved(roster, this.rand);
    const fs = first && this.sessions.get(first.id);
    if (first && fs) this.shave(first, fs);
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Prep, winner: -1, endsAt: st.phaseEndsAt } satisfies MatchEventMessage);
  }

  /** The clippers are loose: the buy window ends and the round clock starts. */
  private releaseInfectionRound(): void {
    const st = this.state;
    st.phase = MatchPhase.Playing;
    st.phaseEndsAt = this.now() + OSTRZYZENI.roundMs;
    this.infectionStage = "break";
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Playing, winner: -1, endsAt: st.phaseEndsAt } satisfies MatchEventMessage);
  }

  /**
   * Is the round over? Asked every tick while it is live. The survivors' win is the clock; the
   * chasers' win is the last unshaved head. Surviving to the whistle is worth more than a kill,
   * because outlasting is the thing this mode asks for.
   */
  private stepInfection(now: number): void {
    if (!this.infection || this.state.phase !== MatchPhase.Playing) return;
    const st = this.state;
    // The chaser leaving ends the round there and then: with nobody who can convert, the survivors
    // have already won and the alternative is ninety seconds of walking about (code review).
    const anyChaser = [...st.players.values()].some((p) => p.shaved && p.connected);
    const winner = anyChaser
      ? infectionRoundWinner(Array.from(st.players.values()), now, st.phaseEndsAt)
      : "survivors";
    if (winner === null) return;
    if (winner === "survivors") {
      st.scoreA++;
      for (const p of st.players.values()) if (p.connected && p.alive && !p.shaved) p.score += OSTRZYZENI.surviveScore;
    } else {
      st.scoreB++;
    }
    st.bomb.round++;
    this.projectiles.length = 0; this.fires.length = 0; this.smokes.length = 0;
    if (st.bomb.round >= OSTRZYZENI.rounds) { this.endMatch(); return; }
    st.phase = MatchPhase.Prep;
    st.phaseEndsAt = now + OSTRZYZENI.breakMs;
    this.infectionStage = "break";
    this.broadcast(S2C.MatchEvent, {
      phase: MatchPhase.Prep, winner: winner === "survivors" ? OSTRZYZENI.survivorTeam : OSTRZYZENI.shavedTeam,
      endsAt: st.phaseEndsAt,
    } satisfies MatchEventMessage);
  }

  private bombPlayers(): BombPlayer[] {
    return Array.from(this.state.players.values(), p => {
      const s = this.sessions.get(p.id);
      return { id: p.id, team: p.team, alive: p.alive, connected: p.connected, kit: p.kit,
        x: p.x, y: p.y, z: p.z, using: !!s && s.objectiveUntil > this.now()
          && s.body.grounded && Math.hypot(s.body.vx, s.body.vz) < 0.4 && !p.reloading
          && this.now() > Math.max(s.equipEndsAt, s.lastFireAt + 350, s.lastThrowAt + 700, s.lastDamageAt + 500, s.blindedUntil) };
    });
  }

  /**
   * Drop D: where a shaved bot is going — the closest living unshaved head. Straight-line distance
   * rather than path length: the chaser only needs to pick a direction, and a path search per bot
   * per tick to rank them would cost far more than picking the occasional wrong one.
   */
  private nearestSurvivor(p: PlayerState): NavPoint | undefined {
    let best: PlayerState | undefined, bestD = Infinity;
    for (const q of this.state.players.values()) {
      if (q.shaved || !q.alive || !q.connected) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : undefined;
  }

  private bombGoal(p: PlayerState, s: Session): NavPoint | undefined {
    const b = this.state.bomb;
    if (b.stage === "resolved") return undefined;
    const site = BOMB_SITES[(s.planPhase + b.round) % BOMB_SITES.length];
    if (b.stage === "planted") return p.team !== b.attackTeam
      ? { x: b.x, y: b.y, z: b.z } : { x: b.x + (b.x < 0 ? 3.5 : -3.5), y: 0, z: b.z - 3.5 };
    if (p.team === b.attackTeam) {
      if (b.stage === "dropped") return { x: b.x, y: b.y, z: b.z };
      const carrier = this.sessions.get(b.carrier);
      const target = BOMB_SITES[((carrier?.planPhase ?? 0) + b.round) % 2];
      return { x: target.x, y: target.y, z: target.z };
    }
    return { x: site.x, y: site.y, z: site.z + 2 };
  }

  private beginBombRound(respawn: boolean): void {
    const st = this.state, now = this.now();
    st.phase = MatchPhase.Prep;
    st.phaseEndsAt = now + BOMB.buyMs;
    st.bomb.stage = "buy";
    st.bomb.attackTeam = bombAttackTeam(st.bomb.round + 1);
    this.projectiles.length = 0; this.fires.length = 0; this.smokes.length = 0;
    if (st.bomb.round === BOMB.halfRounds) {
      this.bombLosses = [0, 0];
      for (const p of st.players.values()) { this.writeWallet(p, { ...freshWallet(), money: BOMB.startMoney }); p.kit = false; }
    }
    if (respawn) for (const [id, p] of st.players) if (p.connected) this.spawn(id);
    resetBomb(st.bomb, now, this.bombPlayers(), this.rand);
    st.bomb.stage = "buy"; st.bomb.roundEndsAt = st.phaseEndsAt + BOMB.roundMs;
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Prep, winner: -1, endsAt: st.phaseEndsAt } satisfies MatchEventMessage);
  }

  private releaseBombRound(): void {
    this.state.phase = MatchPhase.Playing;
    this.state.bomb.stage = this.state.bomb.carrier ? "carried" : "dropped";
    this.state.bomb.roundEndsAt = this.now() + BOMB.roundMs;
    this.state.phaseEndsAt = this.state.bomb.roundEndsAt;
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Playing, winner: -1, endsAt: this.state.phaseEndsAt } satisfies MatchEventMessage);
  }

  private stepBombMode(now: number): void {
    if (this.mode !== "bomb" || this.state.phase !== MatchPhase.Playing) return;
    const carrier = this.state.bomb.carrier, plantedBefore = this.state.bomb.stage === "planted", actorBefore = this.state.bomb.actor;
    const winner = stepBomb(this.state.bomb, this.bombPlayers(), now, TICK_MS,
      (p, q) => !this.losBlocked(p.x, p.y + 1, p.z, q.x, q.y + 0.3, q.z));
    if (!plantedBefore && this.state.bomb.stage === "planted") {
      const planter = this.state.players.get(carrier);
      if (planter) { this.pay(planter, BOMB.plantMoney, "capture"); planter.score += 200; }
    }
    if (winner === null) return;
    if (this.state.bomb.result === "BOMB DEFUSED") {
      const defuser = this.state.players.get(actorBefore);
      if (defuser) { this.pay(defuser, BOMB.defuseMoney, "capture"); defuser.score += 300; }
    }
    if (this.state.bomb.result === "BOMB DETONATED") {
      const b = this.state.bomb;
      this.broadcast(S2C.Boom, { id: this.nextProjectileId++, kind: "c4", x: b.x, y: b.y + 0.15, z: b.z,
        nx: 0, ny: 1, nz: 0, effectMs: 0 } satisfies BoomEvent);
      // 2.3: the blast is real. Anyone near the site dies, either side; the edge of it hurts.
      for (const p of this.state.players.values()) {
        if (!p.alive || !p.connected) continue;
        const dmg = blastDamage(Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z));
        if (dmg > 0) this.blastHit(p, dmg, b.x, b.z);
      }
    }
    if (winner === 0) this.state.scoreA++; else this.state.scoreB++;
    const loser = 1 - winner;
    this.bombLosses[winner] = Math.max(0, this.bombLosses[winner] - 1);
    this.bombLosses[loser] = Math.min(5, this.bombLosses[loser] + 1);
    for (const p of this.state.players.values()) if (p.connected) this.pay(p,
      p.team === winner ? BOMB.winMoney : 1400 + (this.bombLosses[loser] - 1) * 500, "capture");
    if (Math.max(this.state.scoreA, this.state.scoreB) >= BOMB.wins || this.state.bomb.round >= BOMB.maxRounds) { this.endMatch(); return; }
    this.state.phase = MatchPhase.Prep;
    this.state.phaseEndsAt = now + BOMB.breakMs;
    this.projectiles.length = 0; this.fires.length = 0; this.smokes.length = 0;
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Prep, winner, endsAt: this.state.phaseEndsAt } satisfies MatchEventMessage);
  }

  private endMatch(): void {
    // Clear pending respawns so nobody returns on the result screen.
    for (const s of this.sessions.values()) s.respawnAt = 0;
    this.state.phase = MatchPhase.Ended;
    this.state.phaseEndsAt = this.now() + MATCH.endedMs;
    this.state.matchEndsAt = 0;
    // A result screen is non-combat: old grenades or fire pools cannot alter the final score.
    this.projectiles.length = 0;
    this.fires.length = 0;
    this.smokes.length = 0;
    // Drop D: a mode where everyone plays both sides (infection) still has a team score per round,
    // but the name on the result screen is a player's — the one who did most with both hands.
    if (MODES[this.mode].winner === "player" && this.teams) {
      this.state.winner = this.state.scoreA === this.state.scoreB ? -1 : this.state.scoreA > this.state.scoreB ? 0 : 1;
      const rows = Array.from(this.state.players.values()).sort((a, b) => b.score - a.score || b.kills - a.kills);
      const top = rows[0];
      const tied = rows.length > 1 && rows[1].score === top?.score && rows[1].kills === top?.kills;
      this.state.winnerId = top && !tied ? top.id : "";
      this.state.winnerName = top && !tied ? top.name : "";
    } else if (this.teams) {
      this.state.winner = this.state.scoreA === this.state.scoreB ? -1 : this.state.scoreA > this.state.scoreB ? 0 : 1;
    } else {
      // FFA: most kills, then score; a dead heat is a draw. Gun Game (drop D): the score is the
      // rung, so the highest rung wins when the clock runs out — kills only break a tie.
      this.state.winner = -1;
      const byRung = this.ladder;
      const rows = Array.from(this.state.players.values()).sort((a, b) =>
        byRung ? b.score - a.score || b.kills - a.kills : b.kills - a.kills || b.score - a.score);
      const top = rows[0];
      const tied = rows.length > 1 && rows[1].kills === top?.kills && rows[1].score === top?.score;
      this.state.winnerId = top && !tied ? top.id : "";
      this.state.winnerName = top && !tied ? top.name : "";
    }
    this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Ended, winner: this.state.winner as Team | -1, winnerId: this.state.winnerId, winnerName: this.state.winnerName, endsAt: this.state.phaseEndsAt } satisfies MatchEventMessage);
  }

  // ---------------------------------------------------------------- domination (drop 4)

  private syncFlag(i: number, contested: boolean): void {
    const fs = this.state.flags[i], f = this.flagSims[i];
    if (!fs) return;
    if (fs.owner !== f.owner) fs.owner = f.owner;
    if (fs.capTeam !== f.capTeam) fs.capTeam = f.capTeam;
    if (Math.abs(fs.cap - f.cap) > 0.004 || (f.cap === 0 && fs.cap !== 0)) fs.cap = f.cap;
    if (fs.contested !== contested) fs.contested = contested;
  }

  /** Occupants per team, captures, capture rewards and the score tick. Runs every tick while playing. */
  private stepFlags(now: number): void {
    if (this.mode !== "dom" || this.state.phase !== MatchPhase.Playing) return;
    const inZone: PlayerState[] = [];
    for (let i = 0; i < this.flagSims.length; i++) {
      const def = this.map.flags[i], f = this.flagSims[i];
      inZone.length = 0;
      let n0 = 0, n1 = 0;
      for (const [id, q] of this.state.players) {
        if (!q.alive || !q.connected) continue; // a dropped player's ghost body holds nothing (handoff)
        const qs = this.sessions.get(id);
        if (!qs || !inFlagZone(def, qs.body.x, qs.body.y, qs.body.z)) continue;
        inZone.push(q);
        if (q.team === 0) n0++; else n1++;
      }
      const captured = stepFlag(f, n0, n1, TICK_MS);
      this.syncFlag(i, n0 > 0 && n1 > 0);
      if (captured === -1) continue;
      const by: string[] = [];
      for (const q of inZone) {
        if (q.team !== captured) continue;
        by.push(q.name);
        q.score += DOM.captureScore;
        this.pay(q, DOM.captureReward, "capture");
      }
      this.broadcast(S2C.Flag, { flag: i, team: captured, by } satisfies FlagEvent);
    }
    if (now >= this.nextDomTickAt) {
      this.nextDomTickAt += DOM.tickMs;
      const [a, b] = domTick(this.flagSims);
      this.state.scoreA = Math.min(65535, this.state.scoreA + a);
      this.state.scoreB = Math.min(65535, this.state.scoreB + b);
      if (this.state.scoreA >= DOM.scoreLimit || this.state.scoreB >= DOM.scoreLimit) this.endMatch();
    }
  }

  private updatePhase(): void {
    const st = this.state;
    const now = this.now();
    const connected = this.connectedCount;
    if (this.mode === "bomb" && connected > 0 && (st.phase === MatchPhase.Playing || st.phase === MatchPhase.Prep)) {
      if (now >= st.matchEndsAt) this.endMatch();
      else if (st.phase === MatchPhase.Prep && now >= st.phaseEndsAt) {
        if (st.bomb.stage === "buy") this.releaseBombRound(); else this.beginBombRound(true);
      }
      return;
    }
    // Drop D: infection runs on rounds too — Prep is either the buy window (release it) or the
    // break after a round (start the next one). The round's own end is decided by `stepInfection`.
    if (this.infection && connected > 0 && (st.phase === MatchPhase.Playing || st.phase === MatchPhase.Prep)) {
      if (now >= st.matchEndsAt) this.endMatch();
      else if (st.phase === MatchPhase.Prep && now >= st.phaseEndsAt) {
        if (this.infectionStage === "buy") this.releaseInfectionRound(); else this.beginInfectionRound();
      }
      return;
    }
    const next = nextPhase(st.phase as MatchPhase, now, st.phaseEndsAt, connected, st.matchEndsAt);
    if (next === st.phase) return;
    switch (next) {
      case MatchPhase.Waiting:
        st.phase = MatchPhase.Waiting; st.phaseEndsAt = 0; st.matchEndsAt = 0; st.winner = -1;
        this.broadcast(S2C.MatchEvent, { phase: MatchPhase.Waiting, winner: -1, endsAt: 0 } satisfies MatchEventMessage);
        this.maybeStartCountdown();
        break;
      case MatchPhase.Countdown: this.maybeStartCountdown(); break;
      case MatchPhase.Playing: this.startMatch(); break;
      case MatchPhase.Prep: break; // reserved protocol value; continuous matches never enter it
      case MatchPhase.Ended: this.endMatch(); break;
    }
  }

  // ---------------------------------------------------------------- simulation

  private tick(deltaMs: number): void {
    const t0 = performance.now();
    this.accumulator += Math.min(deltaMs, 250);
    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < 8) {
      this.step();
      this.accumulator -= TICK_MS;
      steps++;
    }
    if (steps === 8) this.accumulator = 0;
    this.state.t = this.now();
    this.updatePhase();
    if (steps > 0) recordTick(performance.now() - t0); // for /health (task 6)
    if (NET_STATS) this.logNetStats(this.state.t);
  }

  private step(): void {
    const now = this.now();
    this.navTick++;
    const botsThink = isLive(this.state.phase as MatchPhase) && this.clients.length > 0;
    for (const [id, p] of this.state.players) {
      const s = this.sessions.get(id);
      if (!s) continue;

      // Each casualty returns on their own timer; living players keep fighting.
      if (!p.alive) {
        const warmUp = this.state.phase === MatchPhase.Waiting || this.state.phase === MatchPhase.Countdown;
        // Drop D: in infection only the chasers come back inside a round — an unshaved survivor who
        // dies without being converted is out until the next round, or the last one standing would
        // never be the last one standing.
        const returns = warmUp || (this.state.phase === MatchPhase.Playing && this.mode !== "bomb"
          && (!this.infection || p.shaved));
        if (returns && s.respawnAt && now >= s.respawnAt && p.connected) { s.respawnAt = 0; this.spawn(id); }
        continue;
      }

      // Reload completion.
      if (p.reloading && now >= s.reloadEndsAt) {
        const w = WEAPONS[p.weapon as WeaponId];
        const need = w.magazine - s.ammo[w.id];
        const take = Math.min(need, s.reserve[w.id]);
        s.ammo[w.id] += take; s.reserve[w.id] -= take;
        p.reloading = false;
        this.syncAmmo(p, s);
      }
      // Spread recovery.
      if (s.spread > 0) {
        const w = WEAPONS[p.weapon as WeaponId];
        s.spread = Math.max(0, s.spread - w.spreadRecoveryPerSec * (TICK_MS / 1000));
      }

      // Drop 3: the roids perk regenerates health after a pause in the damage.
      const perks = this.perksOf(p);
      if (p.health < PLAYER.maxHealth && perkActive(perks, "roids", now) && now - s.lastDamageAt >= PERK_EFFECT.roidsDelayMs) {
        s.regenAcc += PERK_EFFECT.roidsRegenPerSec * (TICK_MS / 1000);
        if (s.regenAcc >= 1) { const heal = Math.floor(s.regenAcc); s.regenAcc -= heal; p.health = Math.min(PLAYER.maxHealth, p.health + heal); }
      }

      // Drop 5: a bot decides here, then its input goes through the same queue as a human's.
      // Not on the result screen or in a round break (its shots would be refused anyway, after the
      // raycasts and the planning had been paid for), and not for nobody: a room without a human
      // has no one to play for (task 2).
      if (s.brain && botsThink) this.stepBot(p, s, now);
      // Movement: spend the time bank on queued inputs.
      s.bank = Math.min(s.bank + TICK_MS, 120);
      const mobility = WEAPONS[p.weapon as WeaponId].mobility;
      let processed = 0;
      while (s.inputs.length > 0 && processed < 4) {
        const inp = s.inputs[0];
        if (inp.dt > s.bank) break;
        s.inputs.shift();
        s.bank -= inp.dt;
        // The freeze lives here, at the ONE point every input is consumed, so it covers humans and
        // bots without either path knowing about it. The client masks the same bits out of the same
        // input before predicting with the same `simulateBody`, so prediction never disagrees.
        inp.buttons = maskInput(inp.buttons, isFrozen(this.state.phase as MatchPhase));
        simulateBody(this.world, s.body, inp, mobility * perkSpeedScale(perks, now, sprintActive(inp.buttons, s.body.crouching)), s.prevButtons);
        s.prevButtons = inp.buttons;
        s.lastYaw = inp.yaw; s.lastPitch = inp.pitch;
        s.ack = inp.seq;
        processed++;
      }
      // Idle body still needs gravity (e.g. floor removed / spawn on ledge).
      if (processed === 0 && !s.body.grounded) {
        simulateBody(this.world, s.body, { seq: s.ack, dt: TICK_MS, buttons: s.prevButtons & ~Btn.Jump, yaw: s.lastYaw, pitch: s.lastPitch }, mobility, s.prevButtons);
      }

      const b = s.body;
      if (b.y < this.map.killY) { this.fallDeath(p, s); continue; }

      p.x = b.x; p.y = b.y; p.z = b.z;
      p.vx = quantVel(b.vx); p.vy = quantVel(b.vy); p.vz = quantVel(b.vz);
      p.grounded = b.grounded; p.crouch = b.crouching;
      const sl = Math.round(b.slide), scd = Math.round(b.slideCd);
      if (p.slide !== sl) p.slide = sl;
      if (p.slideCd !== scd) p.slideCd = scd;
      const qy = quantAngle(s.lastYaw), qp = quantAngle(s.lastPitch);
      if (p.yaw !== qy) p.yaw = qy;
      if (p.pitch !== qp) p.pitch = qp;
      // Drop 4: lean / tac from the last simulated buttons, for origin checks and the remote pose.
      s.lean = leanOf(s.prevButtons, b.crouching);
      s.tac = tacActive(s.prevButtons, b);
      if (p.lean !== s.lean) p.lean = s.lean;
      if (p.tac !== s.tac) p.tac = s.tac;

      // Lag-comp history (bounded; an idle player never accumulates beyond HISTORY_LEN).
      s.history.push({ t: now, x: b.x, y: b.y, z: b.z, crouching: b.crouching });
      if (s.history.length > HISTORY_LEN) s.history.shift();
    }
    this.stepProjectiles(now);
    this.stepFires(now);
    this.stepFlags(now);
    this.stepBombMode(now);
    this.stepInfection(now);
  }

  // ---------------------------------------------------------------- economy (drop 2)

  private perksOf(p: PlayerState): PerkTimes {
    const t = noPerks();
    for (const id of PERK_ORDER) t[id] = p.perks.get(id) ?? 0;
    return t;
  }

  private walletOf(p: PlayerState): Wallet {
    return {
      money: p.money, owned: Array.from(p.owned) as WeaponId[], lethal: p.lethal as GrenadeId | "", lethalCount: p.lethalCount,
      tactical: p.tactical as GrenadeId | "", tacticalCount: p.tacticalCount, armor: p.armor, perks: this.perksOf(p), kit: p.kit,
    };
  }

  private writeWallet(p: PlayerState, w: Wallet): void {
    p.money = w.money;
    if (p.owned.length !== w.owned.length || w.owned.some((id, i) => p.owned[i] !== id)) { p.owned.clear(); for (const id of w.owned) p.owned.push(id); }
    p.lethal = w.lethal; p.lethalCount = w.lethalCount; p.tactical = w.tactical; p.tacticalCount = w.tacticalCount;
    p.armor = w.armor;
    p.kit = !!w.kit;
    for (const id of PERK_ORDER) if ((p.perks.get(id) ?? 0) !== w.perks[id]) p.perks.set(id, w.perks[id]);
  }

  private pay(p: PlayerState, delta: number, reason: MoneyEvent["reason"]): void {
    if (delta === 0 || this.noShop) return; // drop D: no economy, the wallet stays at 0
    p.money = Math.max(0, Math.min(ECONOMY.maxMoney, p.money + delta));
    this.clientOf(p.id)?.send(S2C.Money, { delta, reason, total: p.money } satisfies MoneyEvent);
  }

  private nearStation(b: BodyState): boolean {
    for (const st of this.map.stations) {
      if (Math.hypot(st.x - b.x, st.z - b.z) <= ECONOMY.stationRadius && Math.abs(st.y - b.y) < 2) return true;
    }
    return false;
  }

  private buyContext(p: PlayerState, s: Session): BuyContext {
    return {
      bombBuying: this.mode === "bomb" ? this.state.phase === MatchPhase.Prep && this.state.bomb.stage === "buy" : undefined,
      bombDefender: this.mode === "bomb" && p.team !== this.state.bomb.attackTeam,
      now: this.now(), spawnedAt: s.spawnedAt, phase: this.state.phase as MatchPhase, alive: p.alive,
      nearStation: this.nearStation(s.body),
      releaseAt: this.state.phase === MatchPhase.Prep ? this.state.phaseEndsAt : 0,
    };
  }

  private onBuy(client: Client, msg: unknown, sell: boolean): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || this.rateLimited(s, "other")) return;
    const item = isRecord(msg) ? msg.item : msg;
    if (!isShopItemId(item)) { client.send(S2C.Shop, { ok: false, item: String(item), reason: "unknown" } satisfies ShopResult); return; }
    if (this.noShop) { client.send(S2C.Shop, { ok: false, item, reason: "no-shop" } satisfies ShopResult); return; }
    const w = this.walletOf(p);
    const ctx = this.buyContext(p, s);
    if (sell) {
      if (!isWeaponId(item)) { client.send(S2C.Shop, { ok: false, item, reason: "unknown" } satisfies ShopResult); return; }
      const v = applySell(w, item, ctx);
      if (!v.ok) { client.send(S2C.Shop, { ok: false, item, reason: v.reason } satisfies ShopResult); return; }
      const before = p.money;
      this.writeWallet(p, w);
      if (p.weapon === item) { p.weapon = secondaryOf(w); p.reloading = false; s.equipEndsAt = this.now() + WEAPONS[p.weapon as WeaponId].equipMs; this.syncAmmo(p, s); }
      this.clientOf(p.id)?.send(S2C.Money, { delta: p.money - before, reason: "sell", total: p.money } satisfies MoneyEvent);
      client.send(S2C.Shop, { ok: true, item } satisfies ShopResult);
      return;
    }
    const v = this.buyItem(p, s, item);
    client.send(S2C.Shop, v satisfies ShopResult);
  }

  /** The purchase itself (humans via `onBuy`, bots at spawn): rules, wallet, equip, money event. */
  private buyItem(p: PlayerState, s: Session, item: ShopItemId): ShopResult {
    if (this.noShop) return { ok: false, item, reason: "no-shop" }; // drop D: bots included
    // Drop D: the shaved side has no economy — the clippers are the whole loadout.
    if (MODES[this.mode].shop === "survivors" && p.shaved) return { ok: false, item, reason: "shaved" };
    if (this.mode === "bomb" && (isPerkId(item) || item === "launcher")) return { ok: false, item, reason: "closed" };
    if (this.mode !== "bomb" && item === KIT_ITEM) return { ok: false, item, reason: "closed" };
    const w = this.walletOf(p);
    const v = applyBuy(w, item, this.buyContext(p, s));
    if (!v.ok) return { ok: false, item, reason: v.reason };
    const before = p.money;
    this.writeWallet(p, w);
    if (isWeaponId(item)) {
      // A bought weapon comes full and is equipped straight away.
      s.ammo[item] = WEAPONS[item].magazine; s.reserve[item] = WEAPONS[item].reserve;
      p.weapon = item; p.reloading = false; s.reloadEndsAt = 0; s.spread = 0;
      s.equipEndsAt = this.now() + WEAPONS[item].equipMs;
      this.syncAmmo(p, s);
    } else if (isPerkId(item) || isArmorId(item)) {
      // Perks and plates are pure state (already written to the wallet); nothing to equip.
    }
    this.clientOf(p.id)?.send(S2C.Money, { delta: p.money - before, reason: "buy", total: p.money } satisfies MoneyEvent);
    return { ok: true, item };
  }

  // ---------------------------------------------------------------- grenades (drop 2)

  private onThrow(client: Client, raw: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    if (!s || !p || !p.alive || this.rateLimited(s, "other")) return;
    if (!isLive(this.state.phase as MatchPhase)) return;
    if (!isThrowMessage(raw)) return;
    const now = this.now();
    if (now - s.lastThrowAt < THROW_INTERVAL_MS) return;
    const def = GRENADES[raw.kind];
    const b = s.body;
    const [ex, ey, ez] = leanEye(this.world, b, s.lastYaw, s.lean, s.eye);
    if (Math.hypot(raw.o[0] - ex, raw.o[1] - ey, raw.o[2] - ez) > 2.5) return;
    if (this.insideSolid(raw.o)) return;
    let [dx, dy, dz] = raw.d;
    const dl = Math.hypot(dx, dy, dz);
    if (dl < 0.5 || dl > 1.5) return;
    dx /= dl; dy /= dl; dz /= dl;
    const w = this.walletOf(p);
    if (!takeGrenade(w, raw.kind)) return;
    this.writeWallet(p, w);
    s.lastThrowAt = now;
    this.endSpawnProtectionOnAttack(p, now);
    const cook = def.cookable ? Math.max(0, Math.min(def.fuseMs, raw.cookMs)) : 0;
    const proj = createProjectile(this.nextProjectileId++, raw.kind, p.id, [raw.o[0], raw.o[1], raw.o[2]], [dx, dy, dz], cook, [b.vx * 0.5, 0, b.vz * 0.5]);
    // Cooked past the fuse: it goes off in the hand (the client auto-releases at the fuse).
    if (def.cookable && cook >= def.fuseMs - 50) {
      proj.x = ex; proj.y = ey; proj.z = ez;
      this.broadcast(S2C.Throw, { id: proj.id, kind: proj.kind, owner: p.id, o: [proj.x, proj.y, proj.z], v: [0, 0, 0], fuseMs: 1, t: now } satisfies ThrowEvent);
      this.detonate(proj, now);
      return;
    }
    this.projectiles.push(proj);
    this.broadcast(S2C.Throw, { id: proj.id, kind: proj.kind, owner: p.id, o: [proj.x, proj.y, proj.z], v: [proj.vx, proj.vy, proj.vz], fuseMs: proj.fuseMs, t: now } satisfies ThrowEvent);
  }

  private stepProjectiles(now: number): void {
    for (let i = this.smokes.length - 1; i >= 0; i--) if (now >= this.smokes[i].until) this.smokes.splice(i, 1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const px = pr.x, py = pr.y, pz = pr.z;
      const r = stepProjectile(this.world, pr, TICK_MS);
      const def = GRENADES[pr.kind];
      if (def.impactOnPlayer && r === "flying") {
        // Impact rounds (launcher shell, molotov) go off on a body instead of flying through it.
        const victim = this.sweepPlayers(pr.owner, px, py, pz, pr.x, pr.y, pr.z);
        if (victim) { pr.nx = 0; pr.ny = 1; pr.nz = 0; this.detonate(pr, now); this.projectiles.splice(i, 1); continue; }
      }
      if (def.directDamage > 0 && !pr.stuck) {
        // Thrown knife: sweep the segment travelled this tick against player boxes.
        const victim = this.sweepPlayers(pr.owner, px, py, pz, pr.x, pr.y, pr.z);
        if (victim) {
          const owner = this.state.players.get(pr.owner);
          if (owner) this.applyDamage(owner, victim.id, def.directDamage, false, undefined, pr.kind);
          this.broadcast(S2C.Boom, { id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, nx: 0, ny: 1, nz: 0, effectMs: 0 } satisfies BoomEvent);
          this.projectiles.splice(i, 1);
          continue;
        }
      }
      if (r === "stuck") {
        this.broadcast(S2C.Boom, { id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, nx: pr.nx, ny: pr.ny, nz: pr.nz, effectMs: 10000 } satisfies BoomEvent);
        this.projectiles.splice(i, 1);
      } else if (r === "detonate") {
        this.detonate(pr, now);
        this.projectiles.splice(i, 1);
      } else if (pr.y < this.map.killY) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Nearest player (not the thrower, not a teammate) whose box the segment crosses. */
  private sweepPlayers(ownerId: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number): PlayerState | null {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    const owner = this.state.players.get(ownerId);
    let best: PlayerState | null = null, bestT = len + 0.15;
    for (const [id, q] of this.state.players) {
      if (id === ownerId || !q.alive || (this.teams && owner && q.team === owner.team)) continue;
      const qs = this.sessions.get(id);
      if (!qs) continue;
      targetBox({ id, x: qs.body.x, y: qs.body.y, z: qs.body.z, crouching: qs.body.crouching }, boxTmp);
      const t = rayBox(ax, ay, az, dx / len, dy / len, dz / len, boxTmp, bestT);
      if (t >= 0 && t < bestT) { bestT = t; best = q; }
    }
    return best;
  }

  private losBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz) || 1;
    this.world.raycast(ax, ay, az, dx / l, dy / l, dz / l, l, worldHit);
    return worldHit.hit;
  }

  private detonate(pr: Projectile, now: number): void {
    const def = GRENADES[pr.kind];
    // Lift the origin a little off the surface so ground LOS checks do not start inside the floor.
    const ox = pr.x + pr.nx * 0.12, oy = pr.y + pr.ny * 0.12, oz = pr.z + pr.nz * 0.12;
    this.broadcast(S2C.Boom, { id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, z: pr.z, nx: pr.nx, ny: pr.ny, nz: pr.nz, effectMs: def.effectMs } satisfies BoomEvent);
    const owner = this.state.players.get(pr.owner);
    if (def.damage > 0 && owner) {
      for (const [id, q] of this.state.players) {
        if (!q.alive) continue;
        const qs = this.sessions.get(id);
        if (!qs) continue;
        targetBox({ id, x: qs.body.x, y: qs.body.y, z: qs.body.z, crouching: qs.body.crouching }, boxTmp);
        const cx = Math.max(boxTmp.minX, Math.min(ox, boxTmp.maxX)), cy = Math.max(boxTmp.minY, Math.min(oy, boxTmp.maxY)), cz = Math.max(boxTmp.minZ, Math.min(oz, boxTmp.maxZ));
        const dist = Math.hypot(cx - ox, cy - oy, cz - oz);
        if (dist >= def.radius) continue;
        const chestY = qs.body.y + 0.9;
        const blocked = this.losBlocked(ox, oy, oz, qs.body.x, chestY, qs.body.z) && this.losBlocked(ox, oy, oz, qs.body.x, qs.body.y + 0.2, qs.body.z);
        const dmg = explosionDamage(def, dist, blocked);
        if (dmg > 0) this.applyDamage(owner, id, dmg, false, undefined, pr.kind === "shell" ? "launcher" : pr.kind);
      }
    }
    if (pr.kind === "flash") {
      for (const [id, q] of this.state.players) {
        if (!q.alive) continue;
        const qs = this.sessions.get(id);
        const c = this.clientOf(id);
        if (!qs) continue;
        const ey = eyeOf(qs.body.y, qs.body.crouching);
        const dx = ox - qs.body.x, dy = oy - ey, dz = oz - qs.body.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist >= def.radius) continue;
        const fx = Math.sin(qs.lastYaw) * Math.cos(qs.lastPitch), fy = -Math.sin(qs.lastPitch), fz = Math.cos(qs.lastYaw) * Math.cos(qs.lastPitch);
        const cos = (dx * fx + dy * fy + dz * fz) / (dist || 1);
        const strength = flashStrength(def, dist, cos, this.losBlocked(ox, oy, oz, qs.body.x, ey, qs.body.z));
        if (strength > 0.05) {
          qs.blindedUntil = Math.max(qs.blindedUntil, now + flashMs(strength));
          c?.send(S2C.Flashed, { strength, ms: flashMs(strength) } satisfies FlashedEvent);
        }
      }
    }
    if (pr.kind === "molotov") {
      if (this.fires.length >= 3) this.fires.shift(); // same active-area budget as the client
      this.fires.push({ x: pr.x, y: pr.y, z: pr.z, until: now + def.effectMs, owner: pr.owner, radius: def.radius });
    }
    if (pr.kind === "smoke") {
      if (this.smokes.length >= MAX_SMOKE_CLOUDS) this.smokes.shift();
      this.smokes.push({ x: pr.x, y: pr.y, z: pr.z, born: now, until: now + def.effectMs });
    }
  }

  private stepFires(now: number): void {
    if (this.fires.length === 0) return;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (now >= f.until) { this.fires.splice(i, 1); continue; }
      const owner = this.state.players.get(f.owner);
      if (!owner) continue;
      for (const [id, q] of this.state.players) {
        if (!q.alive) continue;
        const qs = this.sessions.get(id);
        if (!qs) continue;
        const b = qs.body;
        if (Math.hypot(b.x - f.x, b.z - f.z) > f.radius || b.y > f.y + 1.6 || b.y < f.y - 1.0) continue;
        if (this.losBlocked(f.x, f.y + 0.15, f.z, b.x, b.y + 0.5, b.z)) continue;
        qs.burnAcc += FIRE_DPS * (TICK_MS / 1000);
        if (qs.burnAcc >= 5) { const d = Math.floor(qs.burnAcc); qs.burnAcc -= d; this.applyDamage(owner, id, d, false, undefined, "molotov"); }
      }
    }
  }

  /** The charge's blast (2.3): straight through plates, a hit vignette towards the site, a "C4" death. */
  private blastHit(p: PlayerState, amount: number, bx: number, bz: number): void {
    const s = this.sessions.get(p.id);
    if (!s) return;
    p.health = Math.max(0, p.health - amount);
    s.lastDamageAt = this.now();
    const client = this.clientOf(p.id);
    if (client) {
      let dx = bx - p.x, dz = bz - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      client.send(S2C.Damaged, { from: "", amount, dx, dz, health: p.health, armor: p.armor, broke: false } satisfies DamagedEvent);
    }
    if (p.health > 0) return;
    p.alive = false; p.reloading = false; p.armor = 0;
    if (this.mode === "bomb") { this.writeWallet(p, { ...freshWallet(), money: p.money }); p.kit = false; }
    s.respawnAt = this.now() + this.respawnDelay(p);
    s.inputs.length = 0; s.history.length = 0;
    p.deaths += 1;
    this.broadcast(S2C.Kill, {
      killer: p.id, killerName: p.name, killerTeam: p.team as Team,
      victim: p.id, victimName: p.name, victimTeam: p.team as Team, weapon: "c4", headshot: false,
    } satisfies KillEvent);
  }

  private fallDeath(p: PlayerState, s: Session): void {
    p.alive = false; p.health = 0;
    s.respawnAt = this.now() + this.respawnDelay(p);
    s.inputs.length = 0;
    s.history.length = 0;
    p.deaths += 1;
    this.broadcast(S2C.Kill, {
      killer: p.id, killerName: p.name, killerTeam: p.team as Team,
      victim: p.id, victimName: p.name, victimTeam: p.team as Team, weapon: p.weapon as WeaponId, headshot: false,
    } satisfies KillEvent);
  }
}
