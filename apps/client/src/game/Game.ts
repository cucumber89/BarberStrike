import { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { type GameMode, MODES,
  Btn, C2S, S2C, CHAT, ECONOMY, INTERP_DELAY_MS, MAPS, MARK, DEFAULT_MAP_ID, PERK_ORDER, RESPAWN_DELAY_MS, TEAM_NAMES, MatchPhase, buildCollisionWorld, buyWindowLeft, inFlagZone, isShopItemId, isWeaponId, makeRayHit, noPerks, packInput, perkSpeedScale,
  type BoomEvent, type ChatEvent, type CollisionWorld, type DamagedEvent, type FlagEvent, type FlashedEvent, type GrenadeId, type HitEvent, type KillEvent, type MapDef, type MarkEvent, type MarkMessage, type MatchEventMessage, type MoneyEvent,
  type PerkTimes, type ShopItemId, type ShopResult, type ShotEvent, type SpawnEvent, type Team, type ThrowEvent, type WeaponId,
} from "@frankibarber/shared";
import { createEngine, type RendererKind } from "./engine";
import { InputState } from "./input/InputState";
import { Connection, type NetPlayer, type NetState } from "./net/Connection";
import { buildMap, type MapInstance } from "./world/MapBuilder";
import { AssetVault, EMPTY_ASSETS, ModelLibrary, buildPropSource, loadAssetManifest, type AssetManifest } from "./world/models";
import { LocalPlayer } from "./player/LocalPlayer";
import { RemotePlayer, type CharacterFactory } from "./player/RemotePlayer";
import { Character } from "./view/Character";
import { CharacterModel } from "./view/CharacterModel";
import { WeaponModelLibrary } from "./view/weaponModels";
import { WeaponController } from "./combat/WeaponController";
import { Throwing } from "./combat/Throwing";
import { MatchTracker, matchResult } from "./progression/matchTracker";
import { applyMatch, loadProfile, saveProfile } from "./progression/profile";
import { GameEvents } from "./events";
import type { GameContext, GameModule } from "./context";
import { installView } from "./view";
import { installAudio } from "./audio";
import { installPostFx } from "./world/postfx";
import { installPerf } from "./perf";
import { hud, type ChatLine, type HudFlag, type HudMark, type HudState, type ScoreRow } from "./store";
import { resolveBindings, type Settings } from "../settings";

/**
 * A manifest prop kind can stand in for several of the procedural builder's instancing sources.
 * `bottle_row` builds three tinted cylinders (amber / black / clear); one imported bottle replaces
 * all three. The row still varies, because `buildProps` scales each bottle differently — which is
 * how the procedural row got its variety too, the colours being the smaller half of the effect.
 */
const PROP_KEYS: Record<string, string[]> = {
  bottle_row: ["bottle_amber", "bottle_black", "bottle_clear"],
};

export interface GameOptions {
  canvas: HTMLCanvasElement;
  connection: Connection;
  settings: Settings;
  onLeave: (reason: string) => void;
}

/** Drop 5: what the minimap needs every frame — read straight from the game, never through React state. */
export interface RadarSnapshot {
  x: number; z: number; yaw: number; alive: boolean;
  map: MapDef | null;
  mates: { id: string; x: number; z: number; yaw: number; alive: boolean }[];
  /** Enemies with an active "spot" mark on them. */
  spotted: { x: number; z: number }[];
}

const markHit = makeRayHit();

/** Presentation modules installed once the core is ready. Order matters only for disposal. */
const MODULES: GameModule[] = [installView, installAudio, installPostFx, installPerf];

/**
 * Owns the Babylon scene and wires input → prediction → network → events.
 * Presentation lives in modules (view/audio/postfx/perf) that subscribe to `events`.
 * React never touches per-frame state; it reads the coalesced `hud` store.
 */
export class Game {
  private engine!: AbstractEngine;
  rendererKind: RendererKind = "webgl2";
  private scene!: Scene;
  private input = new InputState();
  private local!: LocalPlayer;
  private weapons!: WeaponController;
  private throwing!: Throwing;
  private remotes = new Map<string, RemotePlayer>();
  private map!: MapInstance;
  /** Drop 6b: shared glTF containers and the imported guns built from them; undefined = procedural. */
  private vault?: AssetVault;
  private weaponModels?: WeaponModelLibrary;
  /** How a remote body is built. Replaced in `installCharacters` when a character rig is available. */
  private makeCharacter?: CharacterFactory;
  /** Character containers, in flight while the map is built. Null when the manifest lists none. */
  private charactersReady: Promise<(AssetContainer | null)[]> | null = null;
  private mapDef!: MapDef;
  private shopOpen = false;
  private toastKey = 0;
  private lethalWasHeld = false;
  /** Our perk end times, refreshed from every snapshot (drives predicted speed and the HUD). */
  private myPerks: PerkTimes = noPerks();
  readonly events = new GameEvents();
  private conn: Connection;
  private settings: Settings;
  private disposed = false;
  private lastSend = 0;
  private lastHudSync = 0;
  private killFeedKey = 0;
  /** Progression (2.0): counts the local player's match, then pays it into the profile at the end. */
  private readonly tracker = new MatchTracker();

  /**
   * The whistle: turn the match into XP, save the profile and hand the summary to the HUD.
   *
   * Read the scoreboard row rather than anything counted locally for kills, deaths and assists —
   * that row is the server's tally. Everything else comes from `MatchTracker`, which has no
   * replicated counter to read.
   */
  private payMatch(e: MatchEventMessage): void {
    const h = hud.get();
    const row = h.players.find((p) => p.id === h.myId);
    const teams = MODES[h.mode as GameMode]?.teams ?? true;
    const result = matchResult(teams, h.myTeam, e.winner, e.winnerId ?? "", h.myId);
    const stats = this.tracker.finish(row, result, h.mode as GameMode);
    const { profile, reward } = applyMatch(loadProfile(), stats, this.tracker.clipperKills, this.tracker.weaponKills);
    saveProfile(profile);
    hud.set({ reward, profile });
  }
  private unsubs: (() => void)[] = [];
  private moduleDisposers: (() => void)[] = [];
  private frameCbs = new Set<(dt: number) => void>();
  private afterCbs = new Set<(dt: number) => void>();
  private wasGrounded = true;
  private stepAcc = 0;
  /** Total rendered frames (debug overlay / tests). */
  frameCount = 0;
  /** Drop 2 event counters (debug overlay / e2e). */
  readonly stats = { throws: 0, booms: 0, flashes: 0, chats: 0, marks: 0 };
  // ---- drop 5
  private world!: CollisionWorld;
  private chatKey = 0;
  private markKey = 0;
  private readonly radarSnap: RadarSnapshot = { x: 0, z: 0, yaw: 0, alive: false, map: null, mates: [], spotted: [] };

  constructor(private opts: GameOptions) {
    this.conn = opts.connection;
    this.settings = opts.settings;
  }

  async start(): Promise<void> {
    hud.set({ loadStage: "engine" });
    const { engine, kind } = await createEngine(this.opts.canvas, this.settings.graphics.renderer !== "webgl2");
    this.engine = engine;
    this.rendererKind = kind;
    engine.setHardwareScalingLevel(1 / this.settings.graphics.renderScale);
    const scene = new Scene(engine);
    this.scene = scene;
    scene.clearColor = new Color4(0.02, 0.02, 0.03, 1);
    scene.ambientColor.set(0.05, 0.05, 0.06);
    scene.skipPointerMovePicking = true;
    scene.blockMaterialDirtyMechanism = true;

    hud.set({ loadStage: "map" });
    const mapDef = MAPS[this.conn.state.mapId] ?? MAPS[DEFAULT_MAP_ID];
    this.mapDef = mapDef;
    const world = buildCollisionWorld(mapDef);
    this.world = world;
    // Optional scenery packs; LOW turns these off entirely.
    const scenery = this.settings.graphics.importedModels ? await loadAssetManifest() : EMPTY_ASSETS;
    // Characters and weapons share our procedural art at every quality level. Saved graphics
    // settings can still enable scenery packs, but cannot replace the new combat silhouettes.
    const assets: AssetManifest = { ...scenery, characters: [], weapons: {} };
    const models = Object.keys(assets.models).length ? new ModelLibrary(scene, assets.models) : undefined;
    const propSources = await this.prepareAssets(scene, assets);
    this.map = buildMap(scene, mapDef, { shadows: this.settings.graphics.shadows !== "off", shadowMapSize: this.settings.graphics.shadows === "high" ? 2048 : 1024, models, propSources });

    this.input.attach(this.opts.canvas);
    this.input.setBindings(resolveBindings(this.settings.keys));
    this.local = new LocalPlayer(scene, world, this.input, {
      sensitivity: this.settings.gameplay.sensitivity, adsSensitivity: this.settings.gameplay.adsSensitivity, invertY: this.settings.gameplay.invertY,
      fov: this.settings.gameplay.fov, bobScale: this.settings.gameplay.headBob, shakeScale: this.settings.gameplay.cameraShake,
    });
    this.weapons = new WeaponController(this.conn, this.local);
    this.weapons.renderDelay = INTERP_DELAY_MS;
    this.weapons.onShot = (s) => this.events.emit("localShot", { weapon: s.weapon, origin: s.origin, dir: s.dir });
    this.weapons.onDryFire = () => this.events.emit("dryFire", { weapon: this.weapons.weapon });
    this.weapons.onReload = (weapon) => this.events.emit("reloadStart", { weapon });
    this.weapons.onReloadEnd = (weapon) => this.events.emit("reloadEnd", { weapon });
    this.weapons.onEquip = (weapon) => this.events.emit("weaponEquip", { weapon });
    this.weapons.beforeFire = () => this.flushInputs(performance.now());
    this.local.speedScale = (sprinting) => perkSpeedScale(this.myPerks, this.conn.serverNow(), sprinting);
    // Prediction freezes itself on the shared server clock; see `frozenAt`.
    this.local.serverNow = () => this.conn.serverNow();
    this.local.onTac = (on) => this.events.emit("tacSprint", { on });
    this.throwing = new Throwing(this.conn, this.local);
    this.throwing.onPrime = (kind, cookable) => this.events.emit("grenadePrime", { kind, cookable });
    this.throwing.onThrow = (kind) => this.events.emit("grenadeThrow", { kind });
    this.throwing.onCancel = () => this.events.emit("grenadeCancel", {});

    // BEFORE wireNetwork, not after: attaching the schema listeners fires `onAdd` for players who
    // are already in the room, so a rig that arrives later would leave the first few bodies
    // procedural while everyone after them is skinned. The download itself was started before the
    // map was built, so by here it has usually already finished.
    await this.installCharacters(assets);
    this.wireNetwork();

    // Players already in the room.
    this.conn.state.players.forEach((p, id) => this.onPlayerAdd(p, id));
    const me = this.conn.me();
    if (me) {
      this.local.spawnAt(me.x, me.y, me.z, me.yaw);
      this.local.alive = me.alive;
      this.weapons.syncFrom(me);
      this.throwing.syncFrom(me);
    }
    hud.set({ connected: true, myId: this.conn.sessionId, myTeam: (me?.team ?? 0) as Team, loadStage: "players", mode: this.conn.state.mode ?? "tdm", roomName: this.conn.state.roomName ?? "" });

    const ctx: GameContext = {
      scene, engine, rendererKind: kind, camera: this.local.camera, events: this.events,
      local: this.local, remotes: this.remotes, weapons: this.weapons, throwing: this.throwing, connection: this.conn,
      world, mapDef, mapInstance: this.map, settings: this.settings, weaponModels: this.weaponModels,
      onFrame: (cb) => { this.frameCbs.add(cb); return () => this.frameCbs.delete(cb); },
      onAfterRender: (cb) => { this.afterCbs.add(cb); return () => this.afterCbs.delete(cb); },
      serverNow: () => this.conn.serverNow(),
    };
    for (const install of MODULES) {
      try {
        const dispose = install(ctx);
        if (dispose) this.moduleDisposers.push(dispose);
      } catch (err) {
        console.error("[game] module failed to install", err);
      }
    }

    window.addEventListener("resize", this.onResize);
    engine.runRenderLoop(this.frame);
    hud.set({ loadStage: "ready" });
  }

  private wireNetwork(): void {
    const c = this.conn;
    c.onPlayers((p, id) => this.onPlayerAdd(p, id), (_p, id) => this.onPlayerRemove(id));
    c.onStateChange((s) => this.onSnapshot(s));
    this.unsubs.push(c.onMessage<SpawnEvent>(S2C.Spawn, (e) => {
      if (e.id === c.sessionId) {
        this.local.spawnAt(e.x, e.y, e.z, e.yaw);
        const me = c.me();
        if (me) { this.weapons.syncFrom(me); this.throwing.syncFrom(me); }
        this.throwing.cancel();
        hud.set({ alive: true, health: 100, respawnAt: 0, killerName: "", flashUntil: 0, flashStrength: 0 });
        this.events.emit("localSpawn", e);
      } else {
        const r = this.remotes.get(e.id);
        if (r) { r.snapTo(e.x, e.y, e.z, e.yaw); this.events.emit("remoteSpawn", { player: r, event: e }); }
      }
    }));
    this.unsubs.push(c.onMessage<ShotEvent>(S2C.Shot, (e) => {
      this.events.emit("remoteShot", { player: this.remotes.get(e.id) ?? null, event: e });
    }));
    this.unsubs.push(c.onMessage<HitEvent>(S2C.Hit, (e) => {
      hud.set({ hitAt: performance.now(), hitKill: e.kill, hitHead: e.headshot, hitArmor: !!e.armor });
      this.events.emit("localHit", e);
    }));
    this.unsubs.push(c.onMessage<DamagedEvent>(S2C.Damaged, (e) => {
      // Angle of the attacker relative to the view direction, for the directional indicator.
      const ang = Math.atan2(e.dx, e.dz) - this.local.yaw;
      hud.set({ damageAt: performance.now(), damageAngle: ang, health: e.health, armor: e.armor ?? hud.get().armor, ...(e.broke ? { armorBrokeAt: performance.now() } : {}) });
      this.events.emit("localDamaged", e);
    }));
    this.unsubs.push(c.onMessage<KillEvent>(S2C.Kill, (e) => {
      this.tracker.onKill(e);
      const feed = [...hud.get().killFeed, { ...e, at: performance.now(), key: ++this.killFeedKey }].slice(-6);
      const patch: Partial<HudState> = { killFeed: feed };
      if (e.victim === c.sessionId) {
        this.local.alive = false;
        this.input.clearAll();
        this.throwing.cancel();
        if (this.shopOpen) this.setShopOpen(false, false);
        Object.assign(patch, {
          // Individual respawn countdown in both warm-up and the live match.
          alive: false, health: 0, respawnAt: performance.now() + RESPAWN_DELAY_MS,
          killerName: e.killer === e.victim ? "" : e.killerName, killerWeapon: e.weapon,
        });
        this.events.emit("localDeath", e);
      }
      hud.set(patch);
      this.events.emit("kill", e);
    }));
    let prevPhase: MatchPhase = MatchPhase.Waiting;
    this.unsubs.push(c.onMessage<MatchEventMessage>(S2C.MatchEvent, (e) => {
      // `phaseEndsAt` rides along, or the first frame of a new phase renders the PREVIOUS window's
      // deadline: `ceil((oldEnd - now) / 1000)` is negative, the countdown shows 1, and the 10 Hz
      // state poll then corrects it back up to 5 a moment later.
      hud.set({
        phase: e.phase, winner: e.winner, winnerId: e.winnerId ?? "", winnerName: e.winnerName ?? "",
        ...(typeof e.endsAt === "number" ? { phaseEndsAt: e.endsAt } : {}),
      });
      // Both edges of the freeze are decided by the shared clock (`frozenAt`), so the phase and its
      // deadline must arrive TOGETHER: taking the new phase while still holding the previous
      // window's `phaseEndsAt` — which the 10 Hz state poll can leave stale for a moment — would
      // read as "released" the instant prep began.
      this.local.phase = e.phase;
      if (typeof e.endsAt === "number") this.local.phaseEndsAt = e.endsAt;
      // A grenade in the hand does not survive the freeze: it would come out fully cooked.
      if (e.phase === MatchPhase.Prep) this.throwing.cancel();
      // Progression (2.0). A room is reused between matches, so the counters have to be reset by
      // the START of one — otherwise the second match pays for the first one's kills as well.
      if ((e.phase === MatchPhase.Playing && prevPhase !== MatchPhase.Prep) || (e.phase === MatchPhase.Prep && prevPhase === MatchPhase.Countdown)) {
        this.tracker.start(c.sessionId);
        hud.set({ reward: null }); // the previous match's summary is not this match's news
      }
      this.tracker.onPhase(e.phase, hud.get().alive);
      if (e.phase === MatchPhase.Ended) this.payMatch(e);
      prevPhase = e.phase;
      if (e.phase === MatchPhase.Ended && this.shopOpen) this.setShopOpen(false, false);
      this.events.emit("matchPhase", e);
    }));
    // ---- drop 5: chat lines and team marks
    this.unsubs.push(c.onMessage<ChatEvent>(S2C.Chat, (e) => {
      this.stats.chats++;
      const line: ChatLine = { key: ++this.chatKey, id: e.id, name: e.name, team: e.team as Team, text: e.text, all: e.all, seen: performance.now() };
      hud.set({ chat: [...hud.get().chat, line].slice(-CHAT.history) });
      this.events.emit("chat", e);
    }));
    this.unsubs.push(c.onMessage<MarkEvent>(S2C.Mark, (e) => {
      this.stats.marks++;
      const now = performance.now();
      const mark: HudMark = { key: ++this.markKey, id: e.id, name: e.name, team: e.team as Team, x: e.x, y: e.y, z: e.z, kind: e.kind, target: e.target, at: now, until: now + (e.kind === "spot" ? MARK.spotTtlMs : MARK.ttlMs) };
      // One live mark per player: a new one replaces theirs.
      hud.set({ marks: [...hud.get().marks.filter((m) => m.id !== e.id), mark] });
      this.events.emit("mark", e);
    }));
    // ---- drop 4: Domination flag changes
    this.unsubs.push(c.onMessage<FlagEvent>(S2C.Flag, (e) => {
      const flag = this.mapDef.flags[e.flag];
      this.tracker.onFlag(e, this.settings.nickname);
      hud.set({ flagNotice: { text: `${TEAM_NAMES[e.team]} TOOK ${flag?.id ?? "?"} · ${flag?.name ?? ""}`, team: e.team, at: performance.now() } });
      this.events.emit("flag", e);
    }));
    // ---- drop 2: grenades and the shop
    this.unsubs.push(c.onMessage<ThrowEvent>(S2C.Throw, (e) => { this.stats.throws++; this.events.emit("throw", e); }));
    this.unsubs.push(c.onMessage<BoomEvent>(S2C.Boom, (e) => { this.stats.booms++; this.events.emit("boom", e); }));
    this.unsubs.push(c.onMessage<FlashedEvent>(S2C.Flashed, (e) => {
      this.stats.flashes++;
      const now = performance.now();
      const cur = hud.get();
      // A second flash never shortens an ongoing one.
      hud.set({ flashStrength: Math.max(e.strength, cur.flashUntil > now ? cur.flashStrength : 0), flashUntil: Math.max(cur.flashUntil, now + e.ms), flashAt: now });
      this.events.emit("flashed", e);
    }));
    this.unsubs.push(c.onMessage<MoneyEvent>(S2C.Money, (e) => {
      const now = performance.now();
      const toasts = [...hud.get().moneyToasts.filter((t) => now - t.at < 2500), { ...e, at: now, key: ++this.toastKey }].slice(-5);
      hud.set({ money: e.total, moneyToasts: toasts });
      this.events.emit("money", e);
    }));
    this.unsubs.push(c.onMessage<ShopResult>(S2C.Shop, (e) => {
      hud.set({ shopResult: { ...e, at: performance.now() } });
      this.events.emit("shop", e);
    }));
    c.onReconnecting((active) => hud.set({ reconnecting: active }));
    c.onLeave((code) => { if (!this.disposed) this.opts.onLeave(code === 1000 ? "left" : "Connection to the server was lost."); });
    c.onError((_code, message) => { if (!this.disposed) this.opts.onLeave(message ?? "Connection error."); });
  }

  /**
   * Drop 6b. Loads the optional character rigs BEFORE any player is created, so everyone in the
   * match gets the same kind of body — a player who joins in the first two seconds must not end up
   * procedural while everyone else is skinned. Weapons are NOT preloaded: they are fetched on first
   * use and swapped in, because eight guns would add seconds to the loading screen for a difference
   * nobody sees until they hold one.
   */
  private async prepareAssets(scene: Scene, assets: AssetManifest): Promise<Map<string, Mesh> | undefined> {
    const wantChars = assets.characters.some(Boolean);
    const wantWeapons = Object.keys(assets.weapons).length > 0;
    const wantProps = Object.keys(assets.props).length > 0;
    if (!wantChars && !wantWeapons && !wantProps) return undefined;
    const vault = new AssetVault(scene);
    this.vault = vault;
    if (wantWeapons) this.weaponModels = new WeaponModelLibrary(scene, vault, assets.weapons);

    // Characters are the biggest download (a rigged pack is ~1.5 MB each) and are not needed until
    // the first player is created, so they are STARTED here and awaited later — the map is built
    // while they are in flight. Awaiting them here instead added their whole download to the
    // loading screen for nothing.
    this.charactersReady = wantChars
      ? Promise.all(assets.characters.map((e) => (e ? vault.container(e.file) : Promise.resolve(null))))
      : null;

    // Props ARE needed before the map is built — they are its instancing sources — so these are
    // awaited here.
    let propSources: Map<string, Mesh> | undefined;
    for (const [kind, entry] of Object.entries(assets.props)) {
      const container = await vault.container(entry.file);
      if (!container) continue;
      const mesh = buildPropSource(scene, container, `prop_${kind}`, entry.height ?? 0.25, entry.yaw);
      if (!mesh) continue;
      propSources ??= new Map();
      for (const key of PROP_KEYS[kind] ?? [kind]) propSources.set(key, mesh);
    }

    return propSources;
  }

  /**
   * Waits for the character rigs and installs the factory that uses them. Called once, immediately
   * before the first player is created, so nobody in the match can end up with a different kind of
   * body from everyone else.
   */
  private async installCharacters(assets: AssetManifest): Promise<void> {
    if (!this.charactersReady) return;
    const containers = await this.charactersReady;
    if (!containers.some(Boolean)) return;
    const lib = this.weaponModels;
    this.makeCharacter = (s, team, id) => {
      const entry = assets.characters[team];
      const container = containers[team];
      if (!entry || !container) return new Character(s, team, id);
      const body = new CharacterModel(s, container, team, id, { tintMaterial: entry.tint, modelHeight: entry.height });
      if (lib) {
        body.setWeaponProvider(async (wid) => {
          if (!lib.has(wid)) return null;
          const m = await lib.build(wid, `tp_${id}_${wid}`, true);
          return m ? { root: m.root, muzzle: m.muzzle } : null;
        });
      }
      return body;
    };
  }

  private onPlayerAdd(p: NetPlayer, id: string): void {
    if (id === this.conn.sessionId || this.remotes.has(id)) return;
    const r = new RemotePlayer(this.scene, p, this.displayTeam(p), this.makeCharacter);
    this.remotes.set(id, r);
    this.events.emit("remoteJoin", { player: r });
  }

  /** FFA (drop 4): the server keeps everyone on team 0, but every remote is an enemy to us — draw them as the other side. */
  private displayTeam(p: NetPlayer): Team {
    return this.conn.state.mode === "ffa" ? 1 : (p.team as Team);
  }

  private onPlayerRemove(id: string): void {
    const r = this.remotes.get(id);
    if (r) { r.dispose(); this.remotes.delete(id); this.events.emit("remoteLeave", { id }); }
  }

  /** Called after every applied state patch (~SNAPSHOT_RATE Hz). */
  private onSnapshot(s: NetState): void {
    const t = s.t;
    s.players.forEach((p, id) => {
      if (id === this.conn.sessionId) {
        this.local.reconcile(p);
        this.weapons.syncFrom(p);
        this.throwing.syncFrom(p);
        for (const k of PERK_ORDER) this.myPerks[k] = p.perks?.get(k) ?? 0;
        return;
      }
      let r = this.remotes.get(id);
      if (!r) { r = new RemotePlayer(this.scene, p, this.displayTeam(p), this.makeCharacter); this.remotes.set(id, r); this.events.emit("remoteJoin", { player: r }); }
      r.pushFrom(p, t);
    });
  }

  private frame = (): void => {
    if (this.disposed) return;
    const dtMs = Math.min(100, this.engine.getDeltaTime());
    const now = performance.now();
    this.frameCount++;

    // One-shot input actions.
    if (this.input.escapeRequested) { this.input.escapeRequested = false; this.input.exitPointerLock(); }
    for (const slot of this.input.slotRequests) this.weapons.requestSlot(slot, now);
    this.input.slotRequests.length = 0;
    if (this.input.wheelDelta !== 0) { this.weapons.cycle(this.input.wheelDelta, now); this.input.wheelDelta = 0; }
    if (this.input.reloadRequested) { this.input.reloadRequested = false; this.weapons.requestReload(now); }
    if (this.input.lastWeaponRequested) { this.input.lastWeaponRequested = false; this.weapons.requestLast(now); }
    // Drop 2: shop toggle and grenades. A grenade is never taken out mid-reload / mid-equip.
    if (this.input.shopToggleRequested) { this.input.shopToggleRequested = false; this.toggleShop(); }
    // Drop 5: chat box and marks.
    if (this.input.chatOpenRequested) { const kind = this.input.chatOpenRequested; this.input.chatOpenRequested = null; if (!this.shopOpen) this.openChat(kind); }
    if (this.input.markRequested) { this.input.markRequested = false; if (this.local.alive) this.sendMark(); }
    if (this.input.inspectRequested) { this.input.inspectRequested = false; if (this.local.alive && !this.weapons.busy(now)) this.events.emit("weaponInspect", {}); }
    if (this.input.lethalHeld && !this.lethalWasHeld && !this.weapons.busy(now)) this.throwing.pressLethal(now);
    this.lethalWasHeld = this.input.lethalHeld;
    if (this.input.lethalReleased) { this.input.lethalReleased = false; this.throwing.releaseLethal(now); }
    if (this.input.tacticalRequested) { this.input.tacticalRequested = false; if (!this.weapons.busy(now)) this.throwing.pressTactical(now); }
    this.throwing.update(now);

    // Prediction + network send (batched to ~60 msgs/s regardless of frame rate).
    const groundedBefore = this.local.body.grounded;
    const vyBefore = this.local.body.vy;
    this.local.update(dtMs);
    if (now - this.lastSend >= 1000 / 60 - 0.5) this.flushInputs(now);
    this.weapons.update(now, dtMs, (this.local.lastButtons & Btn.Fire) !== 0 && this.input.pointerLocked);
    this.emitMovementFeel(dtMs, groundedBefore, vyBefore);

    // Remote interpolation.
    const renderT = this.conn.serverNow() - INTERP_DELAY_MS;
    for (const r of this.remotes.values()) r.update(renderT, dtMs);

    for (const cb of this.frameCbs) cb(dtMs);
    this.scene.render();
    for (const cb of this.afterCbs) cb(dtMs);

    if (now - this.lastHudSync > 100) {
      if (this.conn.state.mode === "bomb") this.conn.send("objective", this.input.objectiveHeld && this.local.alive && !this.shopOpen);
      this.lastHudSync = now;
      this.syncHud(now);
    }
  };

  /** Sends every queued input now (~60 msgs/s in the frame loop, plus right before any shot). */
  private flushInputs(now: number): void {
    const batch = this.local.takeOutbox();
    if (batch.length) this.conn.send(C2S.Input, batch.map(packInput));
    this.lastSend = now;
  }

  /** Derives jump / land / footstep events from the predicted body for feel modules. */
  private emitMovementFeel(dtMs: number, groundedBefore: boolean, vyBefore: number): void {
    const b = this.local.body;
    if (!this.local.alive) return;
    if (groundedBefore && !b.grounded && b.vy > 0) this.events.emit("jump", {});
    if (!groundedBefore && b.grounded) this.events.emit("landed", { impactSpeed: Math.abs(vyBefore) });
    this.wasGrounded = b.grounded;
    const speed = Math.hypot(b.vx, b.vz);
    if (b.grounded && speed > 1.0) {
      const stride = b.crouching ? 0.55 : speed > 6 ? 0.78 : 0.68; // metres per step
      this.stepAcc += speed * (dtMs / 1000);
      if (this.stepAcc >= stride) {
        this.stepAcc -= stride;
        this.events.emit("footstep", { sprint: speed > 6, crouch: b.crouching });
      }
    } else {
      this.stepAcc = Math.min(this.stepAcc, 0.3);
    }
  }

  private syncHud(now: number): void {
    const s = this.conn.state;
    const me = this.conn.me();
    const rows: ScoreRow[] = [];
    s.players.forEach((p) => rows.push({ id: p.id, name: p.name, team: p.team as Team, kills: p.kills, deaths: p.deaths, score: p.score, ping: p.ping, alive: p.alive, connected: p.connected, assists: p.assists ?? 0, money: p.money, bot: !!p.bot }));
    rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
    const near = this.nearStation();
    const windowLeft = me ? buyWindowLeft({ now: this.conn.serverNow(), spawnedAt: me.spawnedAt ?? 0, phase: s.phase, alive: me.alive, nearStation: near,
      bombBuying: s.mode === "bomb" ? s.phase === MatchPhase.Prep && s.bomb.stage === "buy" : undefined, releaseAt: s.phaseEndsAt }) : 0;
    const cur = hud.get();
    const scope = this.local.scopeState();
    // Drop 4: flags (Domination) and which zone we stand in.
    let flags = cur.flags;
    let inFlag = -1;
    if (s.mode === "dom" && s.flags) {
      const b = this.local.body;
      const next: HudFlag[] = [];
      s.flags.forEach((f, i) => {
        const def = this.mapDef.flags[i];
        next.push({ id: f.id, name: def?.name ?? f.id, owner: f.owner, capTeam: f.capTeam, cap: f.cap, contested: f.contested });
        if (def && this.local.alive && inFlagZone(def, b.x, b.y, b.z)) inFlag = i;
      });
      const same = next.length === flags.length && next.every((f, i) => { const g = flags[i]; return g.owner === f.owner && g.capTeam === f.capTeam && Math.abs(g.cap - f.cap) < 0.01 && g.contested === f.contested; });
      if (!same) flags = next;
    }
    this.local.phase = s.phase as MatchPhase;
    this.local.phaseEndsAt = s.phaseEndsAt;
    hud.set({
      health: me?.health ?? 0, alive: me?.alive ?? false, myTeam: (me?.team ?? 0) as Team,
      weapon: this.weapons.weapon, ammo: this.weapons.ammo, reserve: this.weapons.reserve, reloading: this.weapons.reloading,
      phase: s.phase, phaseEndsAt: s.phaseEndsAt, matchEndsAt: s.matchEndsAt, scoreA: s.scoreA, scoreB: s.scoreB, winner: s.winner as Team | -1,
      mode: s.mode ?? "tdm", flags, inFlag, winnerId: s.winnerId ?? "", winnerName: s.winnerName ?? "",
      bomb: s.mode === "bomb" && s.bomb ? { round: s.bomb.round, attackTeam: s.bomb.attackTeam, stage: s.bomb.stage, carrier: s.bomb.carrier,
        site: s.bomb.site, x: s.bomb.x, y: s.bomb.y, z: s.bomb.z, endsAt: s.bomb.endsAt, roundEndsAt: s.bomb.roundEndsAt,
        actor: s.bomb.actor, progress: s.bomb.progress, result: s.bomb.result } : null,
      tac: this.local.tacFraction, tacOn: this.local.isTacSprinting(),
      // Drop 5: expired chat lines (unless the box is open) and marks drop out here.
      chat: !cur.chatOpen && cur.chat.some((l) => now - l.seen > CHAT.showMs) ? cur.chat.filter((l) => now - l.seen <= CHAT.showMs) : cur.chat,
      marks: cur.marks.some((m) => now > m.until) ? cur.marks.filter((m) => now <= m.until) : cur.marks,
      players: rows, ping: Math.round(this.conn.rtt), pointerLocked: this.input.pointerLocked,
      crosshairSpread: this.weapons.effectiveSpread(),
      aiming: this.local.aimBlend > 0.6,
      serverNow: this.conn.serverNow(), spawnProtectedUntil: me?.protectedUntil ?? 0,
      killFeed: cur.killFeed.filter((k) => now - k.at < 6000),
      money: me?.money ?? 0, owned: this.weapons.owned,
      armor: me?.armor ?? 0, perks: { ...this.myPerks }, scoped: scope.scoped, breath: scope.winded ? 0 : scope.breath,
      lethal: this.throwing.lethal, lethalCount: this.throwing.lethalCount, tactical: this.throwing.tactical, tacticalCount: this.throwing.tacticalCount,
      buyWindowLeft: windowLeft, nearStation: near, shopOpen: this.shopOpen,
      cookingKind: this.throwing.state.kind ?? "", cooking: this.throwing.state.cook,
      moneyToasts: cur.moneyToasts.some((t) => now - t.at >= 2500) ? cur.moneyToasts.filter((t) => now - t.at < 2500) : cur.moneyToasts,
    });
    // The window shut while the menu was open: close it so the player is not stuck reading "closed".
    if (this.shopOpen && windowLeft <= 0) this.setShopOpen(false);
    if (s.phase === MatchPhase.Ended && this.input.pointerLocked) this.input.exitPointerLock();
  }

  /** Within ECONOMY.stationRadius of a buy station (horizontal, same floor). */
  private nearStation(): boolean {
    const b = this.local.body;
    for (const st of this.mapDef.stations) {
      if (Math.abs(st.y - b.y) < 1.5 && Math.hypot(st.x - b.x, st.z - b.z) <= ECONOMY.stationRadius) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- shop (drop 2)

  /** B: opens the buy menu when the window is open; otherwise a short "closed" hint. */
  toggleShop(): void {
    if (this.shopOpen) { this.setShopOpen(false); return; }
    const me = this.conn.me();
    if (!me || !me.alive) return;
    const state = this.conn.state;
    const left = buyWindowLeft({ now: this.conn.serverNow(), spawnedAt: me.spawnedAt ?? 0, phase: state.phase, alive: me.alive, nearStation: this.nearStation(),
      bombBuying: state.mode === "bomb" ? state.phase === MatchPhase.Prep && state.bomb.stage === "buy" : undefined, releaseAt: state.phaseEndsAt });
    if (left <= 0) { hud.set({ shopResult: { ok: false, item: "", reason: "closed", at: performance.now() } }); return; }
    this.setShopOpen(true);
  }

  /**
   * Opens / closes the buy menu. Open = pointer released and movement input off (the menu is a
   * real UI); close = input back and the pointer re-locked (from a key or click gesture).
   */
  setShopOpen(open: boolean, relock = true): void {
    if (this.shopOpen === open) return;
    this.shopOpen = open;
    if (open) {
      this.throwing.cancel();
      this.input.clearAll();
      this.input.enabled = false;
      this.input.exitPointerLock();
    } else {
      this.input.enabled = true;
      if (relock && this.local.alive) this.input.requestPointerLock();
    }
    hud.set({ shopOpen: open, shopResult: null });
    this.events.emit("shopOpen", { open });
  }

  buy(item: ShopItemId): void {
    if (!isShopItemId(item)) return;
    this.conn.send(C2S.Buy, { item });
  }

  sell(item: WeaponId): void {
    if (!isWeaponId(item)) return;
    this.conn.send(C2S.Sell, { item });
  }

  get shopIsOpen(): boolean { return this.shopOpen; }

  // ---------------------------------------------------------------- chat + marks + radar (drop 5)

  /** Enter / Y: the chat box takes the keyboard; the pointer stays locked so the game keeps rendering underneath. */
  openChat(kind: "all" | "team"): void {
    if (hud.get().chatOpen) return;
    this.input.clearAll();
    this.input.typing = true;
    hud.set({ chatOpen: kind });
    this.events.emit("chatOpen", { open: true });
  }

  sendChat(text: string): void {
    const kind = hud.get().chatOpen;
    const t = text.replace(/\s+/g, " ").trim().slice(0, CHAT.maxLen);
    if (t && kind) this.conn.send(C2S.Chat, { text: t, team: kind === "team" });
    this.closeChat();
  }

  closeChat(): void {
    if (!hud.get().chatOpen) return;
    this.input.typing = false;
    hud.set({ chatOpen: null });
    this.events.emit("chatOpen", { open: false });
    if (this.local.alive && !this.shopOpen) this.input.requestPointerLock();
  }

  /**
   * Middle mouse: an enemy within a narrow cone and in sight becomes a "spot" (tracks them for a few
   * seconds); otherwise the point the view ray hits (or its far end) becomes a "go" mark.
   */
  private sendMark(): void {
    const o: [number, number, number] = [0, 0, 0];
    const d: [number, number, number] = [0, 0, 0];
    this.local.eyePosition(o);
    this.local.aimDir(d);
    let msg: MarkMessage | null = null;
    const bestCos = Math.cos(0.07);
    let bestD: number = MARK.maxRange;
    for (const r of this.remotes.values()) {
      if (!r.alive || r.team === this.myTeamDisplay()) continue;
      const dx = r.x - o[0], dy = r.y + 1.1 - o[1], dz = r.z - o[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > MARK.maxRange || dist >= bestD) continue;
      const cos = (dx * d[0] + dy * d[1] + dz * d[2]) / (dist || 1);
      if (cos < bestCos) continue;
      this.world.raycast(o[0], o[1], o[2], dx / dist, dy / dist, dz / dist, dist, markHit);
      if (markHit.hit) continue;
      bestD = dist; msg = { x: r.x, y: r.y, z: r.z, kind: "spot", target: r.id };
    }
    if (!msg) {
      this.world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], MARK.maxRange, markHit);
      const t = markHit.hit ? markHit.t : MARK.maxRange;
      msg = { x: o[0] + d[0] * t, y: o[1] + d[1] * t, z: o[2] + d[2] * t, kind: "go" };
    }
    this.conn.send(C2S.Mark, msg);
  }

  /** The side WE draw ourselves on (FFA draws every remote as team 1, so we count as team 0). */
  private myTeamDisplay(): Team { return this.conn.state.mode === "ffa" ? 0 : this.myTeam; }

  /** Minimap feed: local position / facing, teammates, spotted enemies. The same object every call. */
  radar(): RadarSnapshot {
    const s = this.radarSnap;
    const b = this.local.body;
    s.x = b.x; s.z = b.z; s.yaw = this.local.yaw; s.alive = this.local.alive; s.map = this.mapDef;
    s.mates.length = 0; s.spotted.length = 0;
    const mine = this.myTeamDisplay();
    const marks = hud.get().marks;
    for (const r of this.remotes.values()) {
      if (r.team === mine) s.mates.push({ id: r.id, x: r.x, z: r.z, yaw: r.yaw, alive: r.alive });
      else if (r.alive && marks.some((m) => m.kind === "spot" && m.target === r.id)) s.spotted.push({ x: r.x, z: r.z });
    }
    return s;
  }

  private onResize = (): void => { this.engine.resize(); };

  requestPointerLock(): void { this.input.requestPointerLock(); }
  get inputState(): InputState { return this.input; }
  get localPlayer(): LocalPlayer { return this.local; }
  get remotePlayers(): ReadonlyMap<string, RemotePlayer> { return this.remotes; }
  get currentScene(): Scene { return this.scene; }
  get isGrounded(): boolean { return this.wasGrounded; }
  get myTeam(): Team { return (this.conn.me()?.team ?? 0) as Team; }
  /** Map definition in play (tooling / e2e: flag positions). `map` itself is the built scene instance. */
  get mapDefinition(): MapDef { return this.mapDef; }

  applySettings(s: Settings): void {
    Object.assign(this.settings, s); // keep the reference modules hold
    this.local.settings.sensitivity = s.gameplay.sensitivity;
    this.local.settings.adsSensitivity = s.gameplay.adsSensitivity;
    this.local.settings.invertY = s.gameplay.invertY;
    this.input.setBindings(resolveBindings(s.keys));
    this.local.settings.bobScale = s.gameplay.headBob;
    this.local.settings.shakeScale = s.gameplay.cameraShake;
    this.local.setFov(s.gameplay.fov);
    this.engine.setHardwareScalingLevel(1 / s.graphics.renderScale);
    this.events.emit("settings", {});
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.engine?.stopRenderLoop();
    this.input.exitPointerLock();
    this.input.detach();
    for (const u of this.unsubs) u();
    for (const d of this.moduleDisposers.reverse()) { try { d(); } catch (err) { console.error(err); } }
    this.events.clear();
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    // Start may have failed part-way (e.g. engine creation): dispose only what exists.
    this.weaponModels?.dispose();
    this.vault?.dispose();
    this.map?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    await this.conn.leave();
    hud.reset();
  }
}
