import type { BoomEvent, ChatEvent, DamagedEvent, FlagEvent, FlashedEvent, GrenadeId, HitEvent, KillEvent, MarkEvent, MatchEventMessage, MoneyEvent, ShopResult, ShotEvent, SpawnEvent, ThrowEvent, WeaponId } from "@frankibarber/shared";
import type { RemotePlayer } from "./player/RemotePlayer";

/**
 * Game event bus. The core (Game.ts, network, prediction) emits; presentation modules
 * (view, vfx, audio, ui) subscribe. Keeps presentation out of the simulation code and lets
 * modules be developed independently.
 */
export interface GameEventMap {
  /** Local player fired one trigger pull (client-side, immediate). */
  localShot: { weapon: WeaponId; origin: [number, number, number]; dir: [number, number, number] };
  /** Another player fired; `e.e` holds server-traced end points. */
  remoteShot: { player: RemotePlayer | null; event: ShotEvent };
  /** Server confirmed one of our shots hit. */
  localHit: HitEvent;
  /** We took damage. */
  localDamaged: DamagedEvent;
  /** Any kill in the room. */
  kill: KillEvent;
  /** We died. */
  localDeath: KillEvent;
  /** We (re)spawned. */
  localSpawn: SpawnEvent;
  /** A remote player (re)spawned. */
  remoteSpawn: { player: RemotePlayer; event: SpawnEvent };
  remoteJoin: { player: RemotePlayer };
  remoteLeave: { id: string };
  /** Local weapon changed (starts equip animation). */
  weaponEquip: { weapon: WeaponId };
  reloadStart: { weapon: WeaponId };
  reloadEnd: { weapon: WeaponId };
  dryFire: { weapon: WeaponId };
  /** Local movement feel events. */
  jump: Record<string, never>;
  landed: { impactSpeed: number };
  footstep: { sprint: boolean; crouch: boolean };
  /** Slide (2.3): the local body dropped into a slide. */
  slide: Record<string, never>;
  matchPhase: MatchEventMessage;
  /** Settings changed at runtime. */
  settings: Record<string, never>;
  // ---- drop 2: grenades and the shop
  /** Local player took a grenade in hand (cooking / wind-up starts). */
  grenadePrime: { kind: GrenadeId; cookable: boolean };
  /** Local player's throw motion started; the grenade leaves the hand after the wind-up. */
  grenadeThrow: { kind: GrenadeId };
  /** Local primed grenade put away without a throw. */
  grenadeCancel: Record<string, never>;
  /** Server: a grenade was thrown by anyone (start the visual flight). */
  throw: ThrowEvent;
  /** Server: a grenade detonated / stuck / began its area effect. */
  boom: BoomEvent;
  /** Server: we are flashed. */
  flashed: FlashedEvent;
  /** Server: our wallet changed. */
  money: MoneyEvent;
  /** Server: answer to a buy / sell request. */
  shop: ShopResult;
  /** The buy menu opened or closed. */
  shopOpen: { open: boolean };
  /** F: inspect the held weapon (presentation only). */
  weaponInspect: Record<string, never>;
  // ---- drop 4
  /** Server: a Domination flag changed hands. */
  flag: FlagEvent;
  /** Local tactical sprint started / stopped (feel: FOV kick, breath). */
  tacSprint: { on: boolean };
  // ---- drop 5
  /** Server: a chat line arrived (ours included). */
  chat: ChatEvent;
  /** Server: a teammate (or we) marked a spot / spotted an enemy. */
  mark: MarkEvent;
  /** The chat box opened or closed. */
  chatOpen: { open: boolean };
}

type Handler<T> = (payload: T) => void;

export class GameEvents {
  private handlers = new Map<keyof GameEventMap, Set<Handler<unknown>>>();

  on<K extends keyof GameEventMap>(type: K, handler: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(handler as Handler<unknown>);
    return () => { set!.delete(handler as Handler<unknown>); };
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) {
      try { h(payload); } catch (err) { console.error(`[events] handler for ${String(type)} threw`, err); }
    }
  }

  clear(): void { this.handlers.clear(); }
}
